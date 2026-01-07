import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy, useRef } from 'react';
import { Video, AppView, UserInteractions } from './types';
import { db, ensureAuth } from './firebaseConfig';
import { collection, query, onSnapshot } from "firebase/firestore"; 
import AppBar from './AppBar';
import MainContent from './MainContent';
import { downloadVideoWithProgress, removeVideoFromCache } from './offlineManager';
import { initSmartBuffering } from './smartCache';
import { SmartBrain } from './SmartLogic'; 
import { SYSTEM_CONFIG } from './TechSpecs'; 
import { Logo } from './Logo';

const ShortsPlayerOverlay = lazy(() => import('./ShortsPlayerOverlay'));
const LongPlayerOverlay = lazy(() => import('./LongPlayerOverlay'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const AIOracle = lazy(() => import('./AIOracle'));
const TrendPage = lazy(() => import('./TrendPage'));
const SavedPage = lazy(() => import('./SavedPage'));
const PrivacyPage = lazy(() => import('./PrivacyPage'));
const HiddenVideosPage = lazy(() => import('./HiddenVideosPage'));
const CategoryPage = lazy(() => import('./CategoryPage'));
const OfflinePage = lazy(() => import('./OfflinePage'));
const UnwatchedPage = lazy(() => import('./UnwatchedPage'));

export const OFFICIAL_CATEGORIES = SYSTEM_CONFIG.officialCategories;

// --- EMERGENCY DATA ---
const EMERGENCY_VIDEOS: Video[] = [
  {
    id: 'setup_mode_1',
    title: 'وضع الإعداد الأولي',
    description: 'قاعدة البيانات فارغة. اذهب إلى صفحة الخصوصية واضغط 5 مرات على الشعار لفتح لوحة التحكم ورفع أول فيديو.',
    category: 'رعب حقيقي',
    video_type: 'Shorts',
    video_url: 'https://pub-82d22c4b0b8b4b1e8a32d6366b7546c8.r2.dev/avatar_silent_1739722300456_vid.mp4',
    is_trending: true,
    created_at: new Date(),
    views: 0,
    likes: 0
  }
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [activeCategory, setActiveCategory] = useState<string>('');
  
  const [interactions, setInteractions] = useState<UserInteractions>(() => {
    try {
      const saved = localStorage.getItem('al-hadiqa-interactions-v12');
      const data = saved ? JSON.parse(saved) : null;
      return data || { likedIds: [], dislikedIds: [], savedIds: [], savedCategoryNames: [], watchHistory: [], downloadedIds: [] };
    } catch (e) {
      return { likedIds: [], dislikedIds: [], savedIds: [], savedCategoryNames: [], watchHistory: [], downloadedIds: [] };
    }
  });

  const [rawVideos, setRawVideos] = useState<Video[]>(() => {
    try {
      const cached = localStorage.getItem('rooh1_videos_cache');
      return cached ? JSON.parse(cached) : [];
    } catch (e) { return []; }
  });

  const [displayVideos, setDisplayVideos] = useState<Video[]>([]);
  
  const [loading, setLoading] = useState(() => {
    const cached = localStorage.getItem('rooh1_videos_cache');
    return !cached;
  });

  const [selectedShort, setSelectedShort] = useState<{ video: Video, list: Video[] } | null>(null);
  const [selectedLong, setSelectedLong] = useState<{ video: Video, list: Video[] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{id: string, progress: number} | null>(null);

  // Throttle Reference for Stability (15s Rule)
  const lastShuffleTime = useRef<number>(0);

  const isOverlayActive = useMemo(() => !!selectedShort || !!selectedLong, [selectedShort, selectedLong]);

  // --- WAKE LOCK IMPLEMENTATION (PREVENT SLEEP) ---
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log("💡 Screen Wake Lock Active: App will stay awake.");
        }
      } catch (err) {
        console.warn("Wake Lock request failed:", err);
      }
    };

    // Request on mount
    requestWakeLock();

    // Re-request if visibility changes (e.g., user tabs back in)
    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().then(() => {
          wakeLock = null;
        });
      }
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const applySmartRecommendations = useCallback((videos: Video[], userInteractions: UserInteractions) => {
    try {
        if (!videos || videos.length === 0) return [];
        return SmartBrain.generateVideoFeed(videos, userInteractions);
    } catch (e) {
        console.error("SmartBrain failed, returning raw", e);
        return videos;
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    const newOrder = applySmartRecommendations(rawVideos, interactions);
    setDisplayVideos(newOrder);
    lastShuffleTime.current = Date.now(); // Reset timer to prevent immediate auto-shuffle
    setCurrentView(AppView.HOME);
    initSmartBuffering(newOrder);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [rawVideos, interactions, applySmartRecommendations]);

  // Initial Sync
  useEffect(() => {
    if (rawVideos.length > 0) {
       const initialDisplay = applySmartRecommendations(rawVideos, interactions);
       setDisplayVideos(initialDisplay);
       lastShuffleTime.current = Date.now();
    }
  }, []);

  // Sync on interactions (Throttled by 15s)
  useEffect(() => {
    if (rawVideos.length > 0) {
      const now = Date.now();
      // Apply 15-second rule to prevent UI jumping while user is interacting
      if (now - lastShuffleTime.current > 15000) {
          const updatedList = applySmartRecommendations(rawVideos, interactions);
          setDisplayVideos(updatedList);
          lastShuffleTime.current = now;
      }
    }
  }, [interactions.likedIds, interactions.dislikedIds, rawVideos, applySmartRecommendations]);

  // --- FIRESTORE LOGIC ---
  useEffect(() => {
    let unsubscribe: () => void = () => {};
    let isMounted = true;

    // INCREASED TIMEOUT TO 10 SECONDS TO SOLVE LOADING ISSUE
    const safetyTimer = setTimeout(() => {
        if (isMounted && loading) {
            console.warn("⚠️ Force loading Emergency Mode (Database might be empty or slow network).");
            if (rawVideos.length === 0) {
                setRawVideos(EMERGENCY_VIDEOS);
                setDisplayVideos(EMERGENCY_VIDEOS);
            }
            setLoading(false);
        }
    }, 10000); // Changed from 2500 to 10000

    const initFirestore = async () => {
        try {
            ensureAuth().catch(e => console.warn("Auth warning:", e));
            
            if (!isMounted) return;

            const q = query(collection(db, "videos"));
            
            unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
                clearTimeout(safetyTimer);

                const videosList = snapshot.docs.map(doc => {
                    const data = doc.data();
                    let vType = data.video_type;
                    if (vType && typeof vType === 'string') {
                        vType = vType.trim();
                    }
                    return {
                        id: doc.id,
                        ...data,
                        video_type: vType
                    };
                }) as Video[];
                
                videosList.sort((a, b) => {
                    const dateA = a.created_at?.seconds ? a.created_at.seconds : (a.created_at ? new Date(a.created_at).getTime() / 1000 : 0);
                    const dateB = b.created_at?.seconds ? b.created_at.seconds : (b.created_at ? new Date(b.created_at).getTime() / 1000 : 0);
                    return dateB - dateA;
                });

                const validVideos = videosList.filter(v => (v.video_url && v.video_url.trim() !== "") || (v.redirect_url && v.redirect_url.trim() !== ""));
                
                if (validVideos.length > 0) {
                    localStorage.setItem('rooh1_videos_cache', JSON.stringify(validVideos));
                    setRawVideos(validVideos);
                    
                    // On first load or significant update, we force update regardless of timer
                    const smartList = applySmartRecommendations(validVideos, interactions);
                    setDisplayVideos(smartList);
                    lastShuffleTime.current = Date.now();
                    
                    initSmartBuffering(validVideos);
                } else {
                    console.log("Database empty. Using Emergency Video.");
                    setRawVideos(EMERGENCY_VIDEOS);
                    setDisplayVideos(EMERGENCY_VIDEOS);
                }
                
                if (isMounted) setLoading(false);

            }, (err) => {
                console.error("Firebase Error:", err);
                if (isMounted) setLoading(false);
            });
        } catch (error) {
            console.error("Init Error:", error);
            if (isMounted) setLoading(false);
        }
    };

    initFirestore();

    return () => {
        isMounted = false;
        clearTimeout(safetyTimer);
        unsubscribe();
    };
  }, []); 

  useEffect(() => { 
    localStorage.setItem('al-hadiqa-interactions-v12', JSON.stringify(interactions)); 
  }, [interactions]);

  useEffect(() => {
    if (selectedShort && !rawVideos.find(v => v.id === selectedShort.video.id)) {
      if (!selectedShort.video.id.startsWith('setup_mode')) {
          setSelectedShort(null);
      }
    }
  }, [rawVideos, selectedShort]);

  const handleLikeToggle = (id: string) => {
    setInteractions(p => {
      const isAlreadyLiked = p.likedIds.includes(id);
      if (isAlreadyLiked) {
        return { ...p, likedIds: p.likedIds.filter(x => x !== id) };
      }
      return { ...p, likedIds: [...p.likedIds, id], dislikedIds: p.dislikedIds.filter(x => x !== id) };
    });
  };

  const handleDislike = (id: string) => {
    setInteractions(p => ({
      ...p,
      dislikedIds: Array.from(new Set([...p.dislikedIds, id])),
      likedIds: p.likedIds.filter(x => x !== id)
    }));
    showToast("تم الاستبعاد ⚰️");
    setSelectedShort(null);
    setSelectedLong(null);
  };

  const handleDownloadToggle = async (video: Video) => {
    const videoId = video.id;
    const isDownloaded = interactions.downloadedIds.includes(videoId);
    
    if (isDownloaded) {
      if (window.confirm("حذف من الخزنة؟")) {
        await removeVideoFromCache(video.video_url);
        setInteractions(p => ({
          ...p,
          downloadedIds: p.downloadedIds.filter(id => id !== videoId)
        }));
        showToast("تمت الإزالة");
      }
    } else {
      setDownloadProgress({ id: videoId, progress: 0 });
      const success = await downloadVideoWithProgress(video.video_url, (p) => {
        setDownloadProgress({ id: videoId, progress: p });
      });
      if (success) {
        setInteractions(p => ({
          ...p,
          downloadedIds: [...new Set([...p.downloadedIds, videoId])]
        }));
        showToast("تم الحفظ في الخزنة 🦁");
      }
      setDownloadProgress(null);
    }
  };

  const playShortVideo = (v: Video, list: Video[]) => {
      SmartBrain.saveInterest(v.category);
      setSelectedShort({ video: v, list });
  };

  const playLongVideo = (v: Video, list?: Video[]) => {
      SmartBrain.saveInterest(v.category);
      const playbackList = list || rawVideos.filter(rv => rv.video_type === 'Long Video');
      setSelectedLong({ video: v, list: playbackList });
  };

  const renderContent = () => {
    if (!displayVideos || displayVideos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center p-8 gap-6 animate-in fade-in zoom-in duration-500">
                <div className="relative w-24 h-24 flex items-center justify-center">
                    <div className="absolute inset-0 bg-red-600/20 blur-xl rounded-full animate-pulse"></div>
                    <div className="w-20 h-20 rounded-full border-2 border-red-600 flex items-center justify-center bg-black shadow-[0_0_20px_red]">
                       <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                       </svg>
                    </div>
                </div>
                <p className="text-gray-400 font-bold text-sm">جاري تهيئة الأرواح...</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="px-8 py-3 bg-red-600 hover:bg-red-700 rounded-2xl text-white font-black shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-95 transition-all"
                >
                  إعادة الاتصال
                </button>
            </div>
        );
    }

    const activeVideos = displayVideos; 
    const shortsOnly = activeVideos.filter(v => v.video_type === 'Shorts');
    const longsOnly = activeVideos.filter(v => v.video_type === 'Long Video');

    switch(currentView) {
      case AppView.ADMIN:
        return (
          <Suspense fallback={null}>
            <AdminDashboard 
              onClose={() => setCurrentView(AppView.HOME)} 
              categories={OFFICIAL_CATEGORIES}
              initialVideos={rawVideos}
            />
          </Suspense>
        );
      case AppView.OFFLINE:
        return (
          <Suspense fallback={null}>
            <OfflinePage 
              allVideos={rawVideos} 
              interactions={interactions} 
              onPlayShort={playShortVideo} 
              onPlayLong={(v) => playLongVideo(v)} 
              onBack={() => setCurrentView(AppView.HOME)}
              onUpdateInteractions={setInteractions}
            />
          </Suspense>
        );
      case AppView.CATEGORY:
        return (
          <Suspense fallback={null}>
            <CategoryPage 
              category={activeCategory} 
              allVideos={displayVideos}
              isSaved={interactions.savedCategoryNames.includes(activeCategory)}
              onToggleSave={() => {
                setInteractions(p => {
                  const isSaved = p.savedCategoryNames.includes(activeCategory);
                  return { ...p, savedCategoryNames: isSaved ? p.savedCategoryNames.filter(c => c !== activeCategory) : [...p.savedCategoryNames, activeCategory] };
                });
              }}
              onPlayShort={playShortVideo}
              onPlayLong={(v) => playLongVideo(v, longsOnly)}
              onBack={() => setCurrentView(AppView.HOME)}
            />
          </Suspense>
        );
      case AppView.TREND:
        return (
          <Suspense fallback={null}>
            <TrendPage 
              allVideos={rawVideos} 
              onPlayShort={(v, l) => playShortVideo(v, l)} 
              onPlayLong={(v) => playLongVideo(v)} 
              excludedIds={interactions.dislikedIds} 
            />
          </Suspense>
        );
      case AppView.LIKES:
        return (
          <Suspense fallback={null}>
            <SavedPage 
              title="الإعجابات"
              savedIds={interactions.likedIds}
              savedCategories={[]} 
              allVideos={rawVideos} 
              onPlayShort={playShortVideo}
              onPlayLong={(v) => playLongVideo(v)}
              onCategoryClick={(cat) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            />
          </Suspense>
        );
      case AppView.SAVED:
        return (
          <Suspense fallback={null}>
            <SavedPage 
              title="المحفوظات"
              savedIds={interactions.savedIds}
              savedCategories={interactions.savedCategoryNames}
              allVideos={rawVideos}
              onPlayShort={playShortVideo}
              onPlayLong={(v) => playLongVideo(v)}
              onCategoryClick={(cat) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            />
          </Suspense>
        );
      case AppView.HIDDEN:
        return (
          <Suspense fallback={null}>
            <HiddenVideosPage 
              interactions={interactions}
              allVideos={rawVideos}
              onRestore={(id) => {
                setInteractions(p => ({
                  ...p,
                  dislikedIds: p.dislikedIds.filter(x => x !== id)
                }));
                showToast("تم استعادة الروح المعذبة 🩸");
              }}
              onPlayShort={playShortVideo}
              onPlayLong={(v) => playLongVideo(v)}
            />
          </Suspense>
        );
      case AppView.PRIVACY:
        return (
          <Suspense fallback={null}>
            <PrivacyPage 
              onOpenAdmin={() => setCurrentView(AppView.ADMIN)} 
              onBack={() => {
                setCurrentView(AppView.HOME);
                handleManualRefresh();
              }}
            />
          </Suspense>
        );
      case AppView.UNWATCHED:
        return (
           <Suspense fallback={null}>
             <UnwatchedPage 
               watchHistory={interactions.watchHistory}
               allVideos={rawVideos}
               onPlayShort={playShortVideo} 
               onPlayLong={(v) => playLongVideo(v)} 
             />
           </Suspense>
        );
      case AppView.HOME:
      default:
        return (
          <MainContent 
            videos={activeVideos.filter(v => !interactions.dislikedIds.includes(v.id))} 
            categoriesList={OFFICIAL_CATEGORIES}
            interactions={interactions}
            onPlayShort={(v: Video, l: Video[]) => playShortVideo(v, shortsOnly)}
            onPlayLong={(v: Video) => playLongVideo(v, longsOnly)}
            onCategoryClick={(cat: string) => { setActiveCategory(cat); setCurrentView(AppView.CATEGORY); }}
            onHardRefresh={handleManualRefresh}
            onOfflineClick={() => setCurrentView(AppView.OFFLINE)}
            loading={loading}
            isOverlayActive={isOverlayActive}
            downloadProgress={downloadProgress}
            syncStatus={null}
            onLike={handleLikeToggle}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AppBar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        onRefresh={handleManualRefresh}
      />
      
      <main className="pt-16 pb-24 max-w-md mx-auto px-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[70vh] relative">
            <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-40 h-40 bg-red-600/20 blur-[50px] rounded-full animate-pulse"></div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="absolute w-28 h-28 rounded-full border-t-4 border-b-4 border-red-600 border-l-transparent border-r-transparent animate-spin shadow-[0_0_30px_rgba(220,38,38,0.6)]" style={{ animationDuration: '1.5s' }}></div>
              <div className="absolute w-24 h-24 rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin shadow-[0_0_20px_rgba(234,179,8,0.6)]" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
              <div className="relative z-10 w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-pulse">
                <Logo className="w-full h-full object-cover opacity-90" alt="Loading..." />
              </div>
            </div>
            <p className="mt-8 text-red-500 font-bold text-xs animate-pulse tracking-widest">جارِ استدعاء الأرواح...</p>
          </div>
        ) : renderContent()}
      </main>

      <Suspense fallback={null}>
        <AIOracle 
          onRefresh={handleManualRefresh} 
          allVideos={rawVideos} 
          interactions={interactions}
          onPlayVideo={(v) => v.video_type === 'Shorts' 
              ? playShortVideo(v, rawVideos.filter(rv => rv.video_type === 'Shorts')) 
              : playLongVideo(v, rawVideos.filter(rv => rv.video_type === 'Long Video'))
          }
        />
      </Suspense>

      {selectedShort && (
        <Suspense fallback={null}>
          <ShortsPlayerOverlay 
            initialVideo={selectedShort.video}
            videoList={selectedShort.list}
            interactions={interactions}
            onClose={() => {
              setSelectedShort(null);
            }}
            onLike={handleLikeToggle}
            onDislike={handleDislike}
            onCategoryClick={(cat) => {
              setActiveCategory(cat);
              setCurrentView(AppView.CATEGORY);
              setSelectedShort(null);
            }}
            onSave={(id) => {
              setInteractions(p => {
                const isSaved = p.savedIds.includes(id);
                return { ...p, savedIds: isSaved ? p.savedIds.filter(x => x !== id) : [...p.savedIds, id] };
              });
            }}
            onProgress={(id, progress) => {
              setInteractions(p => {
                const history = p.watchHistory.filter(h => h.id !== id);
                return { ...p, watchHistory: [...history, { id, progress }] };
              });
            }}
            onDownload={handleDownloadToggle}
            isGlobalDownloading={!!downloadProgress}
          />
        </Suspense>
      )}

      {selectedLong && (
        <Suspense fallback={null}>
          <LongPlayerOverlay 
            video={selectedLong.video}
            allLongVideos={selectedLong.list}
            onClose={() => setSelectedLong(null)}
            onLike={() => handleLikeToggle(selectedLong.video.id)}
            onDislike={() => handleDislike(selectedLong.video.id)}
            onSave={() => {
              const id = selectedLong.video.id;
              setInteractions(p => {
                const isSaved = p.savedIds.includes(id);
                return { ...p, savedIds: isSaved ? p.savedIds.filter(x => x !== id) : [...p.savedIds, id] };
              });
            }}
            onSwitchVideo={(v) => {
                SmartBrain.saveInterest(v.category);
                setSelectedLong({ video: v, list: selectedLong.list });
            }}
            onCategoryClick={(cat) => {
              setActiveCategory(cat);
              setCurrentView(AppView.CATEGORY);
              setSelectedLong(null);
            }}
            onDownload={() => handleDownloadToggle(selectedLong.video)}
            isLiked={interactions.likedIds.includes(selectedLong.video.id)}
            isDisliked={interactions.dislikedIds.includes(selectedLong.video.id)}
            isSaved={interactions.savedIds.includes(selectedLong.video.id)}
            isDownloaded={interactions.downloadedIds.includes(selectedLong.video.id)}
            isGlobalDownloading={!!downloadProgress}
            onProgress={(p) => {
              const id = selectedLong.video.id;
              setInteractions(prev => {
                const history = prev.watchHistory.filter(h => h.id !== id);
                return { ...prev, watchHistory: [...history, { id, progress: p }] };
              });
            }}
          />
        </Suspense>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] bg-red-600 text-white px-6 py-3 rounded-full font-black shadow-[0_0_20px_red] animate-bounce text-xs">
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;