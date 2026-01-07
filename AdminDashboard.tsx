import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Video, VideoType } from './types';
import { db, ensureAuth } from './firebaseConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { SYSTEM_CONFIG } from './TechSpecs';
import { GoogleGenAI } from "@google/genai"; 
import { checkKeyUsage, optimizeKeyOrder, KeyStats } from './elevenLabsManager';
import { InteractiveMarquee, VideoCardThumbnail, SafeAutoPlayVideo, formatVideoSource, getNeonColor } from './MainContent';
import { Logo } from './Logo';

const R2_WORKER_URL = SYSTEM_CONFIG.cloudflare.workerUrl;
const R2_PUBLIC_URL = SYSTEM_CONFIG.cloudflare.publicUrl;

const DEFAULT_KEYS_POOL = [
    "sk_9ad4a23044375594207d81d22a328c4d3208ba20535444cc",
    "sk_04f3b5d83a3d0969199a1f16752bfa8c791cb3d05c2d5042",
    "sk_1b43484ce439b67f2dcc83eeed31c3131862566d5ccc4115",
    "sk_b4f575b9001d7274ae918ff760a3ad6e873824d8d51b412d",
    "sk_f51173d395c6b62c1c0e8af07a7155d3c1f4e4969ab7c397",
    "sk_1521bc09c257b77b2febd09baf058b4b71b94bb69b7b272f",
    "sk_0a05321bd1648d5108f48071e01f0677eb9d3fd0d48681d2",
    "sk_4113f3f63685d4178fc6cbb3c7087d8aa00023fa52d5d67c",
    "sk_dd7ff8d61cbd2860c5b1155f64111e9231c48309098478de",
    "bfdb7f44f618ba18bda42b1eaece504a0ee0a6a477f03fdea6ae546bf993842a",
    "29e11204c16beea0f50e45d695de689a1ab0fcf0d0ff7da1ad90ffe3fd0cc55"
];

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US').format(num);
};

// --- HELPERS ---

const generateThumbnail = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
       let seekTime = 1.5;
       if (video.duration < 1.5) seekTime = 0;
       video.currentTime = seekTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Thumbnail generation failed"));
          }
          URL.revokeObjectURL(video.src);
        }, 'image/jpeg', 0.8);
      } else {
        reject(new Error("Canvas context failed"));
      }
    };

    video.onerror = () => {
      reject(new Error("Video load failed"));
    };
  });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to convert blob to base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const uploadToR2 = async (file: File | Blob, fileName: string, onProgress?: (percent: number) => void): Promise<void> => {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const targetUrl = `${R2_WORKER_URL}/${encodeURIComponent(fileName)}`;
                
                xhr.open('PUT', targetUrl, true);
                xhr.withCredentials = false;
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                
                if (onProgress) {
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = (e.loaded / e.total) * 100;
                            onProgress(percent);
                        }
                    };
                }

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`R2 Upload Failed (Status ${xhr.status}): ${xhr.statusText}`));
                    }
                };

                xhr.onerror = () => {
                    reject(new Error('Network Error: CORS failed or Worker URL unreachable.'));
                };
                xhr.send(file);
            });
            return; 
        } catch (e: any) {
            console.warn(`Upload attempt ${attempt} failed:`, e);
            lastError = e;
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
        }
    }
    throw lastError;
};

// --- SUB-COMPONENTS ---

const BrandingManager: React.FC = () => {
    const [logoUrl, setLogoUrl] = useState('');
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        getDoc(doc(db, "settings", "branding")).then(snap => {
            if(snap.exists()) setLogoUrl(snap.data().logo_url);
        });
    }, []);

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const fileName = `brand_logo_${Date.now()}_${file.name.replace(/\W/g,'')}`;
            await uploadToR2(file, fileName);
            const url = `${R2_PUBLIC_URL}/${fileName}`;
            await setDoc(doc(db, "settings", "branding"), { logo_url: url }, { merge: true });
            setLogoUrl(url);
            alert("تم تحديث الشعار بنجاح! سيظهر للجميع فوراً.");
        } catch(e) {
            alert("فشل الرفع");
        }
        setUploading(false);
    };

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-black text-pink-500 border-r-4 border-pink-500 pr-3 mb-6">هوية القناة (الشعار)</h2>
            <div className="bg-neutral-900/50 p-8 rounded-[2.5rem] border border-white/10 text-center flex flex-col items-center gap-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-pink-500 to-transparent opacity-50"></div>
                
                <div className="w-32 h-32 bg-black rounded-full border-4 border-pink-500/30 overflow-hidden relative group shadow-[0_0_30px_rgba(236,72,153,0.2)]">
                    <img src={logoUrl || SYSTEM_CONFIG.identity.logoUrl} className="w-full h-full object-cover" />
                </div>
                
                <div className="space-y-2">
                    <p className="text-gray-400 text-xs font-bold">الشعار الحالي</p>
                    <label className={`inline-flex items-center justify-center gap-2 bg-pink-600 text-white px-8 py-3 rounded-xl font-black cursor-pointer hover:bg-pink-700 transition-all shadow-lg active:scale-95 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>جاري الرفع...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                                <span>رفع شعار جديد</span>
                            </>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    </label>
                </div>
            </div>
        </div>
    );
};

const AppAnalytics: React.FC<{ videos: Video[] }> = ({ videos }) => {
    // ... existing analytics code ...
    const stats = useMemo(() => {
        let totalViews = 0;
        let totalLikes = 0;
        videos.forEach(v => {
            totalViews += (v.views || 0);
            totalLikes += (v.likes || 0);
        });
        return { totalViews, totalLikes, count: videos.length };
    }, [videos]);

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500" dir="rtl">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-black text-white italic border-r-4 border-red-600 pr-3">تقرير الأداء الفعلي (Live)</h2>
                <span className="bg-red-600/20 text-red-500 text-[10px] font-bold px-2 py-1 rounded border border-red-600/30 animate-pulse">DATABASE CONNECTED</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-cyan-900/20 border border-cyan-500/30 p-6 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl"></div>
                    <h3 className="text-cyan-500 font-bold mb-2 text-sm">إجمالي المشاهدات</h3>
                    <p className="text-3xl font-black text-white font-mono tracking-tighter">{formatNumber(stats.totalViews)}</p>
                </div>
                <div className="bg-red-900/20 border border-red-500/30 p-6 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-20 h-20 bg-red-500/10 rounded-full blur-xl"></div>
                    <h3 className="text-red-500 font-bold mb-2 text-sm">عدد الفيديوهات</h3>
                    <p className="text-3xl font-black text-white font-mono tracking-tighter">{stats.count}</p>
                </div>
                <div className="bg-purple-900/20 border border-purple-500/30 p-6 rounded-3xl col-span-2 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
                    <h3 className="text-purple-500 font-bold mb-2 text-sm">تفاعل الجمهور (Likes)</h3>
                    <p className="text-4xl font-black text-white font-mono tracking-tighter">{formatNumber(stats.totalLikes)}</p>
                </div>
            </div>
        </div>
    );
};

const ApiKeysManager: React.FC = () => {
    // ... existing code ...
    const [config, setConfig] = useState<{ gemini_key: string, elevenlabs_keys: string[] }>({ gemini_key: '', elevenlabs_keys: [] });
    const [loading, setLoading] = useState(false);
    const [keyStats, setKeyStats] = useState<KeyStats[]>([]);
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const snap = await getDoc(doc(db, "settings", "api_config"));
                if (snap.exists()) {
                    const data = snap.data();
                    const existingKeys = data.elevenlabs_keys || [];
                    const mergedKeys = Array.from(new Set([...existingKeys, ...DEFAULT_KEYS_POOL]));
                    
                    setConfig({ 
                        gemini_key: data.gemini_key || '', 
                        elevenlabs_keys: mergedKeys 
                    });
                } else {
                    setConfig({ gemini_key: '', elevenlabs_keys: DEFAULT_KEYS_POOL });
                }
            } catch(e) {}
        };
        fetchConfig();
    }, []);

    const handleCheckAndSort = async () => {
        setIsChecking(true);
        const keys = config.elevenlabs_keys.filter(k => k.length > 5);
        
        const stats: KeyStats[] = [];
        for (const key of keys) {
            const stat = await checkKeyUsage(key);
            stats.push(stat);
        }

        stats.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            if (a.status === 'active' && b.status === 'active') return b.remaining - a.remaining;
            return 0;
        });

        setKeyStats(stats);
        
        const sortedKeys = stats.map(s => s.key);
        setConfig(prev => ({ ...prev, elevenlabs_keys: sortedKeys }));
        
        setIsChecking(false);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, "settings", "api_config"), {
                gemini_key: config.gemini_key,
                elevenlabs_keys: config.elevenlabs_keys,
                elevenlabs_index: 0, 
                updated_at: serverTimestamp()
            }, { merge: true });
            alert("تم حفظ وتحديث المفاتيح بنجاح! 🔑");
        } catch(e) {
            alert("فشل الحفظ");
        }
        setLoading(false);
    };

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
             <h2 className="text-xl font-black text-yellow-500 border-r-4 border-yellow-500 pr-3 mb-6">مفاتيح API (المحرك)</h2>
             
             <div className="space-y-6">
                 <div>
                     <label className="block text-xs font-bold text-gray-400 mb-1">Gemini AI Key</label>
                     <input 
                       type="text" 
                       value={config.gemini_key} 
                       onChange={e => setConfig({...config, gemini_key: e.target.value})}
                       className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-white font-mono text-sm focus:border-yellow-500 outline-none"
                       placeholder="AIzaSy..."
                     />
                 </div>

                 <div className="bg-neutral-900/50 border border-white/10 p-5 rounded-[2rem] shadow-2xl relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent opacity-20"></div>
                     
                     <div className="flex justify-between items-center mb-6">
                        <label className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-widest">
                            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                            ElevenLabs Matrix
                        </label>
                        <button 
                          onClick={handleCheckAndSort}
                          disabled={isChecking}
                          className={`text-[10px] px-4 py-2 rounded-xl font-black uppercase tracking-wider border transition-all ${isChecking ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-blue-600/20 text-blue-400 border-blue-500/30 hover:bg-blue-600 hover:text-white'}`}
                        >
                            {isChecking ? 'جاري الفحص...' : 'فحص وتنظيم المفاتيح'}
                        </button>
                     </div>
                     
                     <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                         {keyStats.length > 0 ? (
                             keyStats.map((stat, idx) => {
                                 const percentage = stat.limit > 0 ? (stat.remaining / stat.limit) * 100 : 0;
                                 const colorClass = stat.status === 'active' ? 'text-emerald-400' : stat.status === 'empty' ? 'text-red-500' : 'text-gray-500';
                                 const borderClass = stat.status === 'active' ? 'border-emerald-500/30 hover:border-emerald-400/60' : stat.status === 'empty' ? 'border-red-500/30 hover:border-red-400/60' : 'border-gray-700';
                                 const bgClass = stat.status === 'active' ? 'bg-emerald-900/10' : 'bg-red-900/10';

                                 return (
                                     <div key={idx} className={`relative group p-4 rounded-2xl border ${borderClass} ${bgClass} transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl`}>
                                         {/* Background Bar */}
                                         <div className="absolute bottom-0 left-0 h-1 bg-current opacity-30 transition-all duration-1000" style={{ width: `${percentage}%`, color: stat.status === 'active' ? '#10b981' : '#ef4444' }}></div>
                                         
                                         <div className="flex items-center justify-between relative z-10">
                                             <div className="flex items-center gap-4">
                                                 <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border border-white/5 bg-black/40 shadow-inner shrink-0`}>
                                                     <span className="text-[12px] font-mono text-gray-400 font-bold">#{idx + 1}</span>
                                                 </div>
                                                 <div className="flex flex-col gap-1">
                                                     <span className="font-mono text-[11px] text-white tracking-widest opacity-80 bg-black/30 px-2 py-0.5 rounded border border-white/5">
                                                         {stat.key.substring(0, 6)}•••••{stat.key.substring(stat.key.length - 4)}
                                                     </span>
                                                     <span className={`text-[8px] uppercase font-black tracking-wider flex items-center gap-1.5 ${colorClass}`}>
                                                         <span className={`w-1.5 h-1.5 rounded-full ${stat.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                                                         {stat.status === 'active' ? 'ONLINE' : stat.status === 'empty' ? 'DEPLETED' : 'ERROR'}
                                                     </span>
                                                 </div>
                                             </div>

                                             <div className="text-right pl-2">
                                                 <div className={`text-2xl font-black font-mono leading-none tracking-tighter drop-shadow-md ${colorClass}`}>
                                                     {formatNumber(stat.remaining)}
                                                 </div>
                                                 <div className="text-[9px] text-gray-500 font-bold mt-1 uppercase tracking-wide">
                                                     متبقي من {formatNumber(stat.limit)}
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 );
                             })
                         ) : (
                             <textarea 
                               value={config.elevenlabs_keys.join('\n')} 
                               onChange={e => setConfig({...config, elevenlabs_keys: e.target.value.split('\n').filter(x => x.trim())})}
                               className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-white font-mono text-xs outline-none h-40 focus:border-yellow-500 transition-colors"
                               placeholder="أدخل المفاتيح هنا (كل مفتاح في سطر)..."
                             />
                         )}
                     </div>
                     <p className="text-[9px] text-gray-500 mt-4 text-center font-mono">Total Keys: {config.elevenlabs_keys.length}</p>
                 </div>

                 <button 
                   onClick={handleSave} 
                   disabled={loading}
                   className="w-full bg-yellow-600 text-white py-4 rounded-xl font-black shadow-[0_0_20px_#ca8a04] hover:bg-yellow-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                 >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>جاري الحفظ...</span>
                        </>
                    ) : (
                        'حفظ التكوين في FireBase'
                    )}
                 </button>
             </div>
        </div>
    );
};

const AISetupManager: React.FC = () => {
    const [urls, setUrls] = useState({ silent: '', talking: '' });
    const [uploading, setUploading] = useState<'silent' | 'talking' | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            const snap = await getDoc(doc(db, "settings", "ai_avatar"));
            if (snap.exists()) {
                setUrls({ 
                    silent: snap.data().silent_url || '', 
                    talking: snap.data().talking_url || '' 
                });
            }
        };
        fetchData();
    }, []);

    const handleUpload = async (file: File, type: 'silent' | 'talking') => {
        setUploading(type);
        try {
            const timestamp = Date.now();
            const fileName = `avatar_${type}_${timestamp}_${file.name.replace(/[^\w.-]/g, '')}`;
            await uploadToR2(file, fileName);
            const publicUrl = `${R2_PUBLIC_URL}/${fileName}`;
            
            const updates = type === 'silent' ? { silent_url: publicUrl } : { talking_url: publicUrl };
            await setDoc(doc(db, "settings", "ai_avatar"), updates, { merge: true });
            
            setUrls(prev => ({ ...prev, [type === 'silent' ? 'silent' : 'talking']: publicUrl }));
            alert("تم رفع فيديو المساعد بنجاح! 🤖");
        } catch(e) {
            alert("فشل الرفع");
        }
        setUploading(null);
    };

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
             <h2 className="text-xl font-black text-purple-500 border-r-4 border-purple-500 pr-3 mb-6">إعداد المساعد الذكي (AI)</h2>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Silent Video */}
                 <div className="bg-neutral-900/50 p-6 rounded-3xl border border-white/10">
                     <h3 className="text-white font-bold mb-4">وضع الصمت (Silent)</h3>
                     {urls.silent ? (
                         <video src={urls.silent} className="w-full h-40 object-cover rounded-xl mb-4 bg-black" autoPlay loop muted />
                     ) : (
                         <div className="w-full h-40 bg-black rounded-xl mb-4 flex items-center justify-center text-gray-500">لا يوجد فيديو</div>
                     )}
                     <label className={`block w-full py-3 text-center rounded-xl cursor-pointer font-bold transition-all ${uploading === 'silent' ? 'bg-gray-700' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg'}`}>
                         {uploading === 'silent' ? 'جاري الرفع...' : 'رفع فيديو الصمت'}
                         <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'silent')} disabled={!!uploading} />
                     </label>
                 </div>

                 {/* Talking Video */}
                 <div className="bg-neutral-900/50 p-6 rounded-3xl border border-white/10">
                     <h3 className="text-white font-bold mb-4">وضع الكلام (Talking)</h3>
                     {urls.talking ? (
                         <video src={urls.talking} className="w-full h-40 object-cover rounded-xl mb-4 bg-black" autoPlay loop muted />
                     ) : (
                         <div className="w-full h-40 bg-black rounded-xl mb-4 flex items-center justify-center text-gray-500">لا يوجد فيديو</div>
                     )}
                     <label className={`block w-full py-3 text-center rounded-xl cursor-pointer font-bold transition-all ${uploading === 'talking' ? 'bg-gray-700' : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'}`}>
                         {uploading === 'talking' ? 'جاري الرفع...' : 'رفع فيديو الكلام'}
                         <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'talking')} disabled={!!uploading} />
                     </label>
                 </div>
             </div>
        </div>
    );
};

// ... LayoutEditor component ...
const LayoutEditor: React.FC<{ videos: Video[] }> = ({ videos }) => {
  const [layout, setLayout] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchLayout = async () => {
      const docSnap = await getDoc(doc(db, "Settings", "HomeLayout"));
      if (docSnap.exists()) {
        setLayout(docSnap.data().sections || []);
        setIsLocked(docSnap.data().isLocked ?? false);
      }
    };
    fetchLayout();
  }, []);

  // -- Actions --
  const addSection = (type: string, label: string) => {
    if (isLocked) return;
    const newSection = { 
      id: `sec_${Date.now()}`, 
      type, 
      label, 
      width: 100, 
      marginTop: 20, 
      height: 300 
    };
    setLayout([...layout, newSection]);
    // Scroll to bottom after add
    setTimeout(() => {
        if(scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, 100);
  };

  const updateSection = (id: string, field: string, value: any) => {
      setLayout(layout.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
      if (isLocked) return;
      const newLayout = [...layout];
      if (direction === 'up' && index > 0) {
          [newLayout[index], newLayout[index - 1]] = [newLayout[index - 1], newLayout[index]];
      } else if (direction === 'down' && index < newLayout.length - 1) {
          [newLayout[index], newLayout[index + 1]] = [newLayout[index + 1], newLayout[index]];
      }
      setLayout(newLayout);
  };

  const deleteSection = (id: string) => {
      if (isLocked) return;
      if (window.confirm("حذف هذا القسم؟")) {
          setLayout(layout.filter(s => s.id !== id));
      }
  };

  const duplicateSection = (section: any) => {
      if (isLocked) return;
      const newSec = { ...section, id: `sec_${Date.now()}` };
      setLayout([...layout, newSec]);
  };

  const saveLayout = async () => {
    try {
      await setDoc(doc(db, "Settings", "HomeLayout"), { 
        sections: layout, 
        isLocked: isLocked,
        lastUpdated: new Date().toISOString()
      });
      alert("✅ تم حفظ التنسيق بنجاح!");
    } catch (error) {
      alert("❌ خطأ في الحفظ");
    }
  };

  // -- Real Component Renderer for Live Preview --
  const renderRealComponent = (type: string) => {
      const shorts = videos.filter(v => v.video_type === 'Shorts');
      const longs = videos.filter(v => v.video_type === 'Long Video');
      const mixed = videos;

      switch(type) {
          case 'shorts_grid': // 2x2 Grid
              return (
                  <div className="w-full grid grid-cols-2 grid-rows-2 gap-2 h-full">
                      {shorts.slice(0, 4).map(v => (
                          <div key={v.id} className="rounded-xl overflow-hidden relative border border-white/10">
                              <SafeAutoPlayVideo src={formatVideoSource(v)} className="w-full h-full object-cover" muted loop playsInline />
                          </div>
                      ))}
                  </div>
              );
          case 'long_video':
              return (
                  <div className="w-full h-full relative rounded-2xl overflow-hidden">
                      {longs[0] && <VideoCardThumbnail video={longs[0]} interactions={{likedIds:[], dislikedIds:[], savedIds:[], savedCategoryNames:[], watchHistory:[], downloadedIds:[]}} isOverlayActive={false} />}
                  </div>
              );
          case 'slider_left':
          case 'slider_right':
              return (
                  <div className="w-full h-full py-2">
                      <InteractiveMarquee videos={shorts.slice(0, 10)} onPlay={() => {}} isShorts={true} direction={type === 'slider_left' ? 'left-to-right' : 'right-to-left'} interactions={{likedIds:[], dislikedIds:[], savedIds:[], savedCategoryNames:[], watchHistory:[], downloadedIds:[]}} />
                  </div>
              );
          case 'long_slider':
              return (
                  <div className="w-full h-full py-2">
                      <InteractiveMarquee videos={longs.slice(0, 8)} onPlay={() => {}} isShorts={false} direction="right-to-left" interactions={{likedIds:[], dislikedIds:[], savedIds:[], savedCategoryNames:[], watchHistory:[], downloadedIds:[]}} />
                  </div>
              );
          default: return null;
      }
  };

  // -- Visual Helpers for the Wireframe Preview --
  const renderVisualPreview = (type: string) => {
      switch(type) {
          case 'shorts_grid': // 2x2 Grid
              return (
                  <div className="grid grid-cols-2 gap-2 h-40 overflow-hidden opacity-80 pointer-events-none">
                      {[1,2,3,4].map(i => (
                          <div key={i} className="aspect-[9/16] bg-neutral-900 border border-purple-500/40 rounded-xl relative">
                              <div className="absolute bottom-2 left-2 w-8 h-2 bg-purple-500/20 rounded"></div>
                          </div>
                      ))}
                  </div>
              );
          case 'slider_left': // Horizontal Shorts
          case 'slider_right':
              return (
                  <div className="flex gap-2 overflow-x-hidden opacity-80 pointer-events-none px-2">
                      {[1,2,3,4,5].map(i => (
                          <div key={i} className="w-20 h-32 bg-neutral-900 border border-green-500/40 rounded-xl shrink-0 relative">
                              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent"></div>
                          </div>
                      ))}
                  </div>
              );
          case 'long_slider': // Horizontal Longs
              return (
                  <div className="flex gap-2 overflow-x-hidden opacity-80 pointer-events-none px-2">
                      {[1,2,3].map(i => (
                          <div key={i} className="w-40 h-24 bg-neutral-900 border border-yellow-500/40 rounded-xl shrink-0 relative">
                              <div className="absolute bottom-2 right-2 w-12 h-2 bg-yellow-500/20 rounded"></div>
                          </div>
                      ))}
                  </div>
              );
          case 'long_video': // Single Large Video
          default:
              return (
                  <div className="w-full aspect-video bg-neutral-900 border border-cyan-500/40 rounded-xl relative opacity-80 pointer-events-none flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-cyan-500 border-b-[6px] border-b-transparent ml-1" />
                      </div>
                      <div className="absolute bottom-4 right-4 w-1/3 h-3 bg-cyan-500/20 rounded"></div>
                  </div>
              );
      }
  };

  return (
    <div className="flex flex-col h-[85vh] bg-[#020202] text-white font-sans overflow-hidden border border-white/5 rounded-3xl m-1 relative" dir="ltr">
      
      {/* 1. Header & Controls */}
      <div className="bg-black/90 backdrop-blur-xl border-b border-white/10 z-50 flex flex-col">
          {/* Row 1: Main Actions */}
          <div className="flex items-center justify-between p-4 border-b border-white/5">
              {/* Left Group: Lock & Save */}
              <div className="flex items-center gap-2">
                  <button onClick={() => setIsLocked(!isLocked)} className={`p-3 rounded-2xl transition-all shadow-lg active:scale-90 ${isLocked ? 'bg-red-900/20 border border-red-500 text-red-500' : 'bg-green-900/20 border border-green-500 text-green-500'}`}>
                      {isLocked ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                      ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                      )}
                  </button>
                  <button 
                    onClick={() => setIsPreviewMode(!isPreviewMode)} 
                    className={`p-3 rounded-2xl transition-all shadow-lg active:scale-90 flex items-center justify-center ${isPreviewMode ? 'bg-cyan-900/40 border border-cyan-400 text-cyan-400' : 'bg-gray-800/40 border border-white/10 text-gray-400'}`}
                    title="Live Preview (Real UI)"
                  >
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </button>
                  <button onClick={saveLayout} className="bg-blue-600 text-white px-5 py-3 rounded-2xl font-black text-xs shadow-[0_0_15px_#2563eb] active:scale-95 transition-all flex items-center gap-2 hover:bg-blue-500">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                      SAVE
                  </button>
              </div>
              <span className="text-[10px] font-black tracking-[0.2em] text-gray-600 uppercase">EDITOR v3.0</span>
          </div>

          {/* Row 2: Scrolling Toolbar (Add Sections) */}
          <div className="overflow-x-auto whitespace-nowrap p-3 scrollbar-hide flex items-center gap-3 bg-neutral-900/50">
              <button onClick={() => addSection('long_video', 'فيديو طولي')} className="add-btn border-cyan-500 text-cyan-400">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2"></rect><path d="M12 2v20"/></svg>
                  <span>Video</span>
              </button>
              <button onClick={() => addSection('shorts_grid', 'شبكة شورتس')} className="add-btn border-purple-500 text-purple-400">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  <span>Grid</span>
              </button>
              <button onClick={() => addSection('slider_left', 'شريط شورتس')} className="add-btn border-green-500 text-green-400">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="2"></rect><path d="M8 7v10M16 7v10"/></svg>
                  <span>S-Slider</span>
              </button>
              <button onClick={() => addSection('long_slider', 'شريط طويل')} className="add-btn border-yellow-500 text-yellow-400">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="2"></rect></svg>
                  <span>L-Slider</span>
              </button>
          </div>
      </div>

      {/* 2. Canvas Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
        style={{ backgroundImage: 'radial-gradient(circle at center, #111 0%, #000 100%)' }}
      >
          {layout.map((section, index) => (
              <div 
                key={section.id} 
                className={`relative group transition-all duration-300 ${!isLocked ? 'hover:scale-[1.01]' : ''}`}
                style={{ 
                    width: `${section.width}%`, 
                    marginTop: `${section.marginTop}px`,
                    marginInline: 'auto'
                }}
              >
                  {/* ... Existing Canvas Code ... */}
                  {/* --- Header Controls (Move/Delete) --- */}
                  {!isLocked && (
                      <div className="flex items-center justify-between mb-2 bg-black/50 backdrop-blur-md rounded-t-xl border-t border-x border-white/10 p-2">
                          <div className="flex items-center gap-1">
                              <button onClick={() => moveSection(index, 'up')} disabled={index === 0} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/20 disabled:opacity-30 transition-colors">
                                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                              </button>
                              <button onClick={() => moveSection(index, 'down')} disabled={index === layout.length - 1} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/20 disabled:opacity-30 transition-colors">
                                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                              </button>
                          </div>
                          
                          <div className="flex items-center gap-2">
                              <input 
                                  type="text" 
                                  value={section.label} 
                                  onChange={(e) => updateSection(section.id, 'label', e.target.value)}
                                  className="bg-transparent text-[10px] font-black text-right text-white uppercase outline-none border-b border-white/20 focus:border-cyan-500 w-24"
                                  placeholder="LABEL"
                              />
                              <button onClick={() => duplicateSection(section)} className="p-2 text-blue-400 hover:text-white" title="Duplicate"><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                              <button onClick={() => deleteSection(section.id)} className="p-2 text-red-500 hover:text-white" title="Delete"><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                          </div>
                      </div>
                  )}

                  {/* --- Visual Preview Body --- */}
                  <div className={`border-2 rounded-2xl overflow-hidden bg-[#050505] shadow-2xl relative ${!isLocked ? 'border-dashed border-white/20' : 'border-transparent'}`}>
                      {isPreviewMode ? (
                          <div className="w-full relative">
                              {renderRealComponent(section.type)}
                              {/* Overlay to prevent playing but allow seeing */}
                              <div className="absolute inset-0 z-50 bg-transparent" />
                          </div>
                      ) : (
                          <div className="p-4">
                              {renderVisualPreview(section.type)}
                          </div>
                      )}
                  </div>

                  {/* --- Sliders Footer (Only when Unlocked) --- */}
                  {!isLocked && (
                      <div className="mt-2 bg-neutral-900/80 p-3 rounded-xl border border-white/10 grid grid-cols-2 gap-4">
                          <div>
                              <div className="flex justify-between text-[8px] font-bold text-gray-400 mb-1"><span>WIDTH</span><span className="text-cyan-400">{section.width}%</span></div>
                              <input type="range" min="50" max="100" value={section.width} onChange={(e) => updateSection(section.id, 'width', e.target.value)} className="w-full h-1 bg-white/10 rounded-full appearance-none accent-cyan-500 cursor-pointer"/>
                          </div>
                          <div>
                              <div className="flex justify-between text-[8px] font-bold text-gray-400 mb-1"><span>MARGIN</span><span className="text-purple-400">{section.marginTop}px</span></div>
                              <input type="range" min="0" max="150" value={section.marginTop} onChange={(e) => updateSection(section.id, 'marginTop', e.target.value)} className="w-full h-1 bg-white/10 rounded-full appearance-none accent-purple-500 cursor-pointer"/>
                          </div>
                      </div>
                  )}
              </div>
          ))}

          <div className="h-32 flex items-center justify-center opacity-20 border-t border-dashed border-white/10 mt-10">
              <span className="text-[9px] tracking-[0.5em] font-black">END OF CANVAS</span>
          </div>
      </div>

      <style>{`
        .add-btn { @apply px-4 py-2 rounded-xl border bg-black/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all hover:bg-white/5; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

interface AdminDashboardProps {
  onClose: () => void;
  categories: string[];
  initialVideos: Video[];
}

interface UploadJob {
    id: string;
    file: File | null;
    meta: any;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    progress: number;
    error?: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  onClose, categories, initialVideos 
}) => {
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('الكل');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Updated viewMode to include 'branding'
  const [viewMode, setViewMode] = useState<'videos' | 'analytics' | 'layout' | 'ai_setup' | 'keys' | 'branding'>('videos'); 
  
  // ... existing queue and upload states ...
  const [uploadQueue, setUploadQueue] = useState<UploadJob[]>([]);
  const [failedAttempts, setFailedAttempts] = useState(() => parseInt(localStorage.getItem('admin_failed_attempts') || '0'));
  const [lockoutUntil, setLockoutUntil] = useState(() => parseInt(localStorage.getItem('admin_lockout_until') || '0'));

  const [newVideo, setNewVideo] = useState({
    title: '',
    description: '',
    category: categories[0] || 'هجمات مرعبة',
    video_type: 'Shorts' as VideoType,
    is_trending: false,
    read_narrative: false, 
    redirect_url: '',
    overlay_text: '', 
    overlay_url: ''   
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false); 
  const [analysisStatus, setAnalysisStatus] = useState<string>(''); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // --- QUEUE PROCESSOR ---
  useEffect(() => {
      const processQueue = async () => {
          const jobIndex = uploadQueue.findIndex(j => j.status === 'pending');
          if (jobIndex === -1) return;

          const job = uploadQueue[jobIndex];
          setUploadQueue(prev => prev.map((j, i) => i === jobIndex ? { ...j, status: 'uploading' } : j));

          try {
              await ensureAuth();
              const timestamp = Date.now();
              let posterUrl = "";
              let finalVideoUrl = "";

              if (job.file) {
                  const file = job.file;
                  const cleanName = file.name.replace(/[^\w.-]/g, '');

                  try {
                      const posterBlob = await generateThumbnail(file);
                      const posterFileName = `img_${timestamp}_${cleanName}.jpg`;
                      await uploadToR2(posterBlob, posterFileName);
                      posterUrl = `${R2_PUBLIC_URL}/${posterFileName}`;
                  } catch (e) { console.warn("Thumbnail failed", e); }

                  const videoFileName = `vid_${timestamp}_${cleanName}`;
                  await uploadToR2(file, videoFileName, (percent) => {
                      setUploadQueue(prev => prev.map(j => j.id === job.id ? { ...j, progress: percent } : j));
                  });
                  finalVideoUrl = `${R2_PUBLIC_URL}/${videoFileName}`;
              } else if (job.meta.redirect_url) {
                  finalVideoUrl = job.meta.redirect_url;
                  setUploadQueue(prev => prev.map(j => j.id === job.id ? { ...j, progress: 100 } : j));
              }

              const videoData = {
                  ...job.meta,
                  video_url: finalVideoUrl,
                  poster_url: posterUrl || null,
                  created_at: serverTimestamp(),
                  views: 0, 
                  likes: 0
              };

              await addDoc(collection(db, "videos"), videoData);
              setUploadQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'completed', progress: 100 } : j));

          } catch (e: any) {
              console.error("Queue Upload Error", e);
              setUploadQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: 'failed', error: e.message } : j));
          }
      };

      const isAnyUploading = uploadQueue.some(j => j.status === 'uploading');
      if (!isAnyUploading) {
          processQueue();
      }
  }, [uploadQueue]);

  // ... helpers removeJob, handleNumClick, handleClearOrAuth, etc ...
  const removeJob = (id: string) => { setUploadQueue(prev => prev.filter(j => j.id !== id)); };
  const handleNumClick = (num: string) => { if (passcode.length < 8) setPasscode(prev => prev + num); };
  
  const handleClearOrAuth = async () => {
      if (Date.now() < lockoutUntil) return;
      let realPasscode = '5030775'; 
      try {
          const docSnap = await getDoc(doc(db, "settings", "admin_security"));
          if (docSnap.exists() && docSnap.data().passcode) {
              realPasscode = docSnap.data().passcode;
          }
      } catch (e) {}

      if (passcode === realPasscode) {
          setIsAuthenticated(true);
          setFailedAttempts(0);
          localStorage.setItem('admin_failed_attempts', '0');
      } else {
          setPasscode('');
          if (passcode.length > 3) {
              const newAttempts = failedAttempts + 1;
              setFailedAttempts(newAttempts);
              localStorage.setItem('admin_failed_attempts', newAttempts.toString());
              if (newAttempts >= 5) {
                  const lockoutTime = Date.now() + (60 * 60 * 1000); 
                  setLockoutUntil(lockoutTime);
                  localStorage.setItem('admin_lockout_until', lockoutTime.toString());
              }
          }
      }
  };

  const handleBackspace = () => setPasscode(prev => prev.slice(0, -1));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.onloadedmetadata = () => {
          const duration = tempVideo.duration; 
          const isVertical = tempVideo.videoHeight > tempVideo.videoWidth;
          let detectedType: VideoType = 'Long Video';
          if (duration < 65 || isVertical) {
              detectedType = 'Shorts';
          }
          setNewVideo(prev => ({ ...prev, video_type: detectedType }));
      };
      tempVideo.src = url;
    }
  };

  const handleAIAnalyze = async () => {
      // ... existing AI Analyze logic ...
      if (isAnalyzing) return;
      setIsAnalyzing(true);
      setAnalysisStatus("جاري الاتصال بالذكاء الاصطناعي...");

      try {
          await ensureAuth();
          const settingsSnap = await getDoc(doc(db, "settings", "api_config"));
          const apiKey = settingsSnap.exists() ? settingsSnap.data().gemini_key : process.env.API_KEY;
          
          if (!apiKey) {
              alert("خطأ: مفتاح الذكاء الاصطناعي غير متوفر.");
              setIsAnalyzing(false);
              return;
          }

          const parts: any[] = [];
          if (fileInputRef.current?.files?.[0]) {
              setAnalysisStatus("تحليل بصمة الفيديو...");
              try {
                  const thumbBlob = await generateThumbnail(fileInputRef.current.files[0]);
                  const base64Data = await blobToBase64(thumbBlob);
                  parts.push({
                      inlineData: { mimeType: "image/jpeg", data: base64Data }
                  });
              } catch (e) {}
          }

          const promptText = `
            أنت خبير محتوى رعب. حلل هذا الفيديو أو بناءً على التصنيف: "${newVideo.category}".
            المطلوب JSON فقط:
            { "title": "عنوان مرعب جذاب باللهجة المصرية", "description": "سرد قصصي مرعب جداً ومشوق" }
          `;
          parts.push({ text: promptText });

          setAnalysisStatus("توليد البيانات...");
          const ai = new GoogleGenAI({ apiKey: apiKey });
          const response = await ai.models.generateContent({
              model: 'gemini-1.5-flash',
              contents: { role: 'user', parts: parts },
              config: { responseMimeType: "application/json" }
          });

          const result = JSON.parse(response.text || "{}");
          if (result.title || result.description) {
              setNewVideo(prev => ({
                  ...prev,
                  title: result.title || prev.title,
                  description: result.description || prev.description
              }));
              alert("تم التحليل بنجاح! 🧠");
          }
      } catch (error) {
          alert("خطأ في التحليل.");
      } finally {
          setIsAnalyzing(false);
          setAnalysisStatus("");
      }
  };

  const handleEditClick = (v: Video) => {
    // ... existing edit click ...
    setEditingId(v.id);
    setNewVideo({
        title: v.title,
        description: v.description,
        category: v.category,
        video_type: v.video_type,
        is_trending: v.is_trending,
        read_narrative: v.read_narrative || false,
        redirect_url: v.redirect_url || '',
        overlay_text: v.overlay_text || '',
        overlay_url: v.overlay_url || ''
    });
    setPreviewUrl(v.video_url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    // ... existing cancel edit ...
    setEditingId(null);
    clearFileSelection();
    setNewVideo({
        title: '',
        description: '',
        category: categories[0] || 'هجمات مرعبة',
        video_type: 'Shorts',
        is_trending: false,
        read_narrative: false,
        redirect_url: '',
        overlay_text: '',
        overlay_url: ''
    });
  };

  const clearFileSelection = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (previewUrl && !previewUrl.startsWith('http')) {
        URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePublish = async () => {
    // ... existing publish logic ...
    const file = fileInputRef.current?.files?.[0];
    
    if (editingId) {
        if (!file && !newVideo.redirect_url && !previewUrl) return;
        try {
            await ensureAuth();
            const videoData: any = { ...newVideo, created_at: serverTimestamp() };
            if (file) {
                const timestamp = Date.now();
                const videoFileName = `vid_${timestamp}_${file.name.replace(/[^\w.-]/g, '')}`;
                await uploadToR2(file, videoFileName);
                videoData.video_url = `${R2_PUBLIC_URL}/${videoFileName}`;
            }
            await updateDoc(doc(db, "videos", editingId), videoData);
            alert("تم تحديث الفيديو!");
            cancelEdit();
        } catch(e) { alert("فشل التحديث"); }
        return;
    }

    if (!file && !newVideo.redirect_url) {
      alert("الرجاء اختيار ملف!");
      return;
    }

    const meta = {
        title: newVideo.title || "فيديوهات الحديقة المرعبة",
        description: newVideo.description || "الحديقة المرعبة رعب حقيقي ما بيتنسيش",
        category: newVideo.category,
        video_type: newVideo.video_type,
        is_trending: newVideo.is_trending,
        read_narrative: newVideo.read_narrative,
        redirect_url: newVideo.redirect_url || null,
        overlay_text: newVideo.overlay_text || null,
        overlay_url: newVideo.overlay_url || null,
    };

    const newJob: UploadJob = {
        id: Date.now().toString(),
        file: file || null,
        meta: meta,
        status: 'pending',
        progress: 0
    };
    setUploadQueue(prev => [...prev, newJob]);
    cancelEdit(); 
  };

  const toggleTrending = async (v: Video) => {
    try {
      await ensureAuth();
      await updateDoc(doc(db, "videos", v.id), { is_trending: !v.is_trending });
    } catch (e) { alert("فشل تحديث الترند"); }
  };

  const requestDelete = (id: string) => { setDeleteTargetId(id); };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await ensureAuth();
      await deleteDoc(doc(db, "videos", deleteTargetId));
      if (editingId === deleteTargetId) cancelEdit();
      setDeleteTargetId(null);
    } catch (e) {
      alert("فشل الحذف.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredVideos = useMemo(() => {
    return initialVideos.filter(v => {
      const matchesSearch = v.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === 'الكل' || v.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [initialVideos, searchQuery, filterCategory]);

  if (!isAuthenticated) {
      return (
        <div className="fixed inset-0 z-[1000] bg-[#020202] flex flex-col items-center justify-center p-6 text-center select-none" dir="ltr">
           {/* Logo Section */}
           <div className="mb-6 relative group">
              <div className="absolute inset-0 bg-red-600/30 blur-[40px] rounded-full animate-pulse"></div>
              {/* Replace static img with dynamic Logo */}
              <div className="relative w-28 h-28 rounded-full border-4 border-red-600 shadow-[0_0_40px_red] overflow-hidden">
                 <Logo className="w-full h-full object-cover" />
              </div>
           </div>
           
           {/* Title */}
           <h1 className="text-2xl font-black text-red-600 mb-8 tracking-[0.2em] uppercase italic drop-shadow-[0_0_10px_red]">الحديقة المرعبة</h1>
           
           {/* Dots Display */}
           <div className="flex justify-center gap-3 mb-10">
              {[...Array(7)].map((_, i) => (
                 <div key={i} className={`w-3 h-3 rounded-full transition-all duration-300 ${i < passcode.length ? 'bg-red-500 shadow-[0_0_10px_red] scale-125' : 'bg-neutral-800'}`}></div>
              ))}
           </div>

           {/* Keypad */}
           <div className="grid grid-cols-3 gap-5 mb-8">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                 <button key={num} onClick={() => handleNumClick(num.toString())} className="w-20 h-20 rounded-full bg-neutral-900 border border-white/5 text-white font-mono text-2xl shadow-lg active:scale-90 active:bg-red-600/20 active:border-red-500 transition-all hover:border-white/20">{num}</button>
              ))}
              
              <button 
                onClick={handleClearOrAuth} 
                className="w-20 h-20 rounded-full bg-neutral-900 border border-red-900/30 text-red-700 font-black text-lg flex items-center justify-center active:scale-90 hover:bg-red-900/10 hover:text-red-500 transition-colors"
                title="Clear"
              >
                C
              </button>
              
              <button onClick={() => handleNumClick('0')} className="w-20 h-20 rounded-full bg-neutral-900 border border-white/5 text-white font-mono text-2xl active:scale-90 hover:border-white/20">0</button>
              <button onClick={handleBackspace} className="w-20 h-20 rounded-full bg-neutral-900 border border-white/5 text-white flex items-center justify-center active:scale-90 hover:border-white/20"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"/></svg></button>
           </div>
        </div>
      );
  }

  const getNavClass = (mode: string, color: string) => `relative px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all duration-300 border overflow-hidden flex flex-col items-center gap-1 ${viewMode === mode ? `bg-${color}-900/20 border-${color}-500 text-${color}-400 shadow-[0_0_15px_rgba(0,0,0,0.5)]` : 'bg-black/40 border-white/5 text-gray-500 hover:text-white'}`;

  return (
    <div className="fixed inset-0 z-[900] bg-black overflow-hidden flex flex-col font-sans" dir="rtl">
      {/* Header Navigation */}
      <div className="h-24 border-b border-white/10 relative flex items-center justify-between px-2 bg-black/90 backdrop-blur-3xl shrink-0 z-50 shadow-2xl">
        <div className="flex gap-2 w-full justify-between max-w-2xl mx-auto overflow-x-auto scrollbar-hide">
            <button onClick={() => setViewMode('videos')} className={getNavClass('videos', 'red')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                <span>المكتبة</span>
            </button>
            <button onClick={() => setViewMode('branding')} className={getNavClass('branding', 'pink')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                <span>الهوية</span>
            </button>
            <button onClick={() => setViewMode('analytics')} className={getNavClass('analytics', 'cyan')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                <span>الجودة</span>
            </button>
            <button onClick={() => setViewMode('layout')} className={getNavClass('layout', 'blue')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                <span>الواجهة</span>
            </button>
            <button onClick={() => setViewMode('ai_setup')} className={getNavClass('ai_setup', 'purple')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                <span>الذكاء</span>
            </button>
            <button onClick={() => setViewMode('keys')} className={getNavClass('keys', 'yellow')}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                <span>المفاتيح</span>
            </button>
        </div>
        <button onClick={onClose} className="absolute left-2 top-6 text-gray-500 hover:text-white p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {viewMode === 'branding' && <BrandingManager />}
        {viewMode === 'analytics' && <AppAnalytics videos={initialVideos} />}
        {viewMode === 'layout' && <LayoutEditor videos={initialVideos} />}
        {viewMode === 'ai_setup' && <AISetupManager />}
        {viewMode === 'keys' && <ApiKeysManager />}
        
        {viewMode === 'videos' && (
          <div className="p-4 sm:p-8 space-y-8">
            <div className={`bg-neutral-900/30 border p-6 rounded-[2.5rem] shadow-2xl flex flex-col gap-6 ${editingId ? 'border-blue-600/50 shadow-[0_0_30px_rgba(37,99,235,0.2)]' : 'border-white/5'}`}>
                {/* Upload Form */}
                <div onClick={() => !previewUrl && fileInputRef.current?.click()} className={`w-full aspect-video border-4 border-dashed rounded-[2rem] flex flex-col items-center justify-center overflow-hidden relative transition-all cursor-pointer bg-black/50 ${isAnalyzing ? 'border-purple-600 bg-purple-600/5 cursor-wait' : 'border-white/10 hover:border-red-600'}`}>
                  <input type="file" ref={fileInputRef} accept="video/*" className="hidden" onChange={handleFileSelect} />
                  {previewUrl ? (
                    <div className="relative w-full h-full bg-black flex items-center justify-center group">
                       <video ref={videoPreviewRef} src={previewUrl} controls className="h-full w-full object-contain" />
                       <button onClick={clearFileSelection} className="absolute top-4 right-4 bg-red-600 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg border-2 border-white z-50 hover:bg-red-700 active:scale-90"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
                    </div>
                  ) : (
                    <div className="text-center p-8">
                        {isAnalyzing ? (
                             <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                                <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-t-transparent rounded-full animate-spin border-purple-500"></div>
                             </div>
                        ) : (
                            <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                        )}
                        <p className="text-white font-black text-sm">{isAnalyzing ? analysisStatus : (editingId ? 'اضغط لتغيير ملف الفيديو' : 'اضغط لرفع فيديو جديد (إلى القائمة)')}</p>
                    </div>
                  )}
                </div>
                
                {/* Inputs */}
                <div className="space-y-4">
                    <input type="text" placeholder="عنوان الفيديو..." value={newVideo.title} onChange={e => setNewVideo({...newVideo, title: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-red-600 transition-colors" />
                    <textarea placeholder="السرد المرعب..." value={newVideo.description} onChange={e => setNewVideo({...newVideo, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white min-h-[120px] outline-none font-mono text-sm leading-relaxed whitespace-pre" />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="نص الزر العائم (إيموجي أو كلمة)" value={newVideo.overlay_text} onChange={e => setNewVideo({...newVideo, overlay_text: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white font-bold outline-none focus:border-cyan-500" />
                        <input type="text" placeholder="رابط الزر العائم (URL)" value={newVideo.overlay_url} onChange={e => setNewVideo({...newVideo, overlay_url: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-blue-400 font-mono text-xs outline-none focus:border-cyan-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <select value={newVideo.category} onChange={e => setNewVideo({...newVideo, category: e.target.value})} className="bg-black border border-white/10 rounded-xl p-4 text-red-500 font-bold outline-none">
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={newVideo.video_type} onChange={e => setNewVideo({...newVideo, video_type: e.target.value as VideoType})} className="bg-black border border-white/10 rounded-xl p-4 text-white outline-none">
                        <option value="Shorts">Shorts</option>
                        <option value="Long Video">Long Video</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-between bg-black border border-white/10 rounded-xl p-4">
                        <span className="text-white font-bold text-sm flex items-center gap-2">
                            🔊 تفعيل السرد الصوتي (TTS)
                            <span className="text-[9px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded">ElevenLabs</span>
                        </span>
                        <button 
                            onClick={() => setNewVideo(prev => ({ ...prev, read_narrative: !prev.read_narrative }))}
                            className={`w-12 h-6 rounded-full p-1 transition-all ${newVideo.read_narrative ? 'bg-green-600' : 'bg-gray-700'}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-all transform ${newVideo.read_narrative ? '-translate-x-6' : 'translate-x-0'}`}></div>
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-2">
                    <button onClick={handleAIAnalyze} disabled={isAnalyzing} className="bg-purple-600/20 text-purple-400 border border-purple-600/50 px-4 rounded-xl font-black">AI Analyze</button>
                    <button onClick={handlePublish} disabled={isAnalyzing} className={`flex-1 py-4 rounded-xl font-black text-white shadow-xl active:scale-95 transition-all ${editingId ? 'bg-blue-600' : 'bg-red-600'}`}>
                        {editingId ? 'حفظ التغييرات' : 'نشر (إضافة للقائمة) 🔥'}
                    </button>
                </div>
            </div>

            {/* --- UPLOAD QUEUE DISPLAY --- */}
            {uploadQueue.length > 0 && (
                <div className="bg-neutral-900 border border-white/10 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-4 fade-in duration-500">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-white/5 pb-2">قائمة الرفع النشطة</h3>
                    {uploadQueue.map(job => (
                        <div key={job.id} className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                            <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center shrink-0">
                                {job.status === 'pending' && <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>}
                                {job.status === 'uploading' && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
                                {job.status === 'completed' && <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>}
                                {job.status === 'failed' && <span className="text-red-500 font-bold">X</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{job.meta.title || "بدون عنوان"}</p>
                                <div className="w-full bg-white/10 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                    <div className={`h-full transition-all duration-300 ${job.status === 'failed' ? 'bg-red-500' : job.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${job.progress}%` }}></div>
                                </div>
                            </div>
                            <button onClick={() => removeJob(job.id)} className="text-gray-500 hover:text-white px-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
                        </div>
                    ))}
                </div>
            )}

            {/* Existing Video List */}
            <div>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                 <input type="text" placeholder="ابحث في المكتبة..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-neutral-900 border border-white/5 rounded-xl p-4 text-sm outline-none focus:border-red-600" />
                 <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-neutral-900 border border-white/5 rounded-xl p-4 text-xs font-bold text-red-500 outline-none w-full md:w-auto">
                    <option value="الكل">كل الأقسام</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVideos.map(v => (
                    <div key={v.id} className={`bg-neutral-900/30 border border-white/5 p-4 rounded-[2rem] flex flex-col gap-4 ${v.is_trending ? 'border-red-600 shadow-[0_0_10px_red]' : ''}`}>
                    <div className="aspect-video bg-black rounded-xl overflow-hidden relative group">
                        <video src={v.video_url} poster={v.poster_url} className="w-full h-full object-cover" controls preload="metadata" playsInline />
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                            <span className="bg-black/60 text-[8px] text-white px-1.5 py-0.5 rounded backdrop-blur-md">👀 {formatNumber(v.views || 0)}</span>
                            <span className="bg-black/60 text-[8px] text-red-400 px-1.5 py-0.5 rounded backdrop-blur-md">❤️ {formatNumber(v.likes || 0)}</span>
                        </div>
                        {v.overlay_text && (
                           <div className="absolute bottom-2 right-2 bg-cyan-900/80 text-cyan-400 text-[8px] px-2 py-1 rounded border border-cyan-500/50">
                              🔗 Overlay Active
                           </div>
                        )}
                    </div>
                    <h3 className="text-xs font-black text-white truncate px-1">{v.title}</h3>
                    <div className="flex gap-2">
                        <button onClick={() => handleEditClick(v)} className="flex-1 bg-blue-600/20 text-blue-500 py-2 rounded-lg text-[10px] font-black hover:bg-blue-600/40 transition-colors">تعديل</button>
                        <button onClick={() => toggleTrending(v)} className="flex-1 bg-orange-600/20 text-orange-500 py-2 rounded-lg text-[10px] font-black hover:bg-orange-600/40 transition-colors">رائج</button>
                        <button onClick={() => requestDelete(v.id)} className="flex-1 bg-red-600/20 text-red-500 py-2 rounded-lg text-[10px] font-black hover:bg-red-600/40 transition-colors">حذف</button>
                    </div>
                    </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Exit Button */}
      <button 
        onClick={onClose}
        className="fixed bottom-6 left-6 z-[1200] group active:scale-90 transition-transform"
        title="خروج من لوحة التحكم"
      >
         <div className="w-14 h-14 rounded-full border-2 border-red-600 shadow-[0_0_20px_red] group-hover:shadow-[0_0_40px_red] transition-all overflow-hidden">
             <Logo className="w-full h-full object-cover" />
         </div>
      </button>

      {deleteTargetId && (
        <div className="fixed inset-0 z-[1200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-neutral-900 border-2 border-red-600/50 w-full max-w-sm p-8 rounded-[2.5rem] text-center shadow-[0_0_50px_rgba(220,38,38,0.3)]">
             <h3 className="text-xl font-black text-white mb-2">تأكيد الحذف</h3>
             <button onClick={confirmDelete} className="w-full bg-red-600 text-white py-4 rounded-xl font-black shadow-[0_0_20px_red] mt-4">حذف نهائي</button>
             <button onClick={() => setDeleteTargetId(null)} className="w-full bg-white/5 text-white py-4 rounded-xl font-bold mt-2">تراجع</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;