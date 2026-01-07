import React, { useState, useRef, useEffect } from 'react';
import { playNarrative, stopCurrentNarrative, subscribeToAudioState } from './elevenLabsManager';
import { db, ensureAuth } from './firebaseConfig';
import { doc, getDoc } from "firebase/firestore";
import { SmartBrain, ChatMessage } from './SmartLogic'; // Import SmartBrain
import { Video, UserInteractions } from './types';
import { Logo } from './Logo';

interface AIOracleProps {
  onRefresh?: () => void;
  allVideos?: Video[];
  interactions?: UserInteractions;
  onPlayVideo?: (video: Video) => void;
}

// Helper to remove emojis for TTS stability
const cleanTextForSpeech = (text: string) => {
  return text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
};

const AIOracle: React.FC<AIOracleProps> = ({ onRefresh, allVideos = [], interactions, onPlayVideo }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  
  const [history, setHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('al-hadiqa-ai-history-v7');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); 
  const [isAudioPlaying, setIsAudioPlaying] = useState(false); 

  const [silentUrl, setSilentUrl] = useState('');
  const [talkingUrl, setTalkingUrl] = useState('');

  // 24-Hour Voice Lockout Logic
  const [voiceCount, setVoiceCount] = useState(0); // Session counter
  const [isVoiceLocked, setIsVoiceLocked] = useState(false);
  const [textTurnCount, setTextTurnCount] = useState(0); // Counts turns AFTER voice lock to show suggestions

  const [position, setPosition] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{x: number, y: number} | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const hasMoved = useRef(false);
  const messageTimeoutRef = useRef<any>(null);

  const [layoutHeight, setLayoutHeight] = useState(0);

  // Check Voice Lockout Status on Mount
  useEffect(() => {
    const checkVoiceStatus = () => {
        const lockTime = localStorage.getItem('voice_lockout_timestamp');
        if (lockTime) {
            const diff = Date.now() - parseInt(lockTime);
            if (diff < 24 * 60 * 60 * 1000) {
                setIsVoiceLocked(true);
            } else {
                localStorage.removeItem('voice_lockout_timestamp');
                setIsVoiceLocked(false);
                setVoiceCount(0);
            }
        }
    };
    checkVoiceStatus();
  }, [isOpen]); // Re-check when opening

  useEffect(() => {
    if (isOpen) {
        document.body.style.overflow = 'hidden';
        setLayoutHeight(window.innerHeight);
    } else {
        document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const splitPoint = layoutHeight ? Math.floor(layoutHeight * 0.50) : 0;

  useEffect(() => {
    const fetchAvatarSettings = async () => {
        try {
            await ensureAuth();
            const docRef = doc(db, "settings", "ai_avatar");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data) {
                    setSilentUrl(data.silent_url || '');
                    setTalkingUrl(data.talking_url || '');
                }
            }
        } catch (e) {}
    };
    fetchAvatarSettings();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAudioState((isPlaying) => {
        setIsAudioPlaying(isPlaying);
    });
    return () => unsubscribe();
  }, []);

  // Determine if talking video should be shown
  const isTalking = isAudioPlaying && !isVoiceLocked;

  useEffect(() => {
    localStorage.setItem('al-hadiqa-ai-history-v7', JSON.stringify(history));
  }, [history]);

  // Handle Drag Events
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isOpen) return; 
    setIsDragging(true);
    hasMoved.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      dragStartPos.current = { x: clientX - rect.left, y: clientY - rect.top };
    }
  };

  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    if (!isDragging || !dragStartPos.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    hasMoved.current = true;
    let newX = clientX - dragStartPos.current.x;
    let newY = clientY - dragStartPos.current.y;
    const maxX = window.innerWidth - 80; 
    const maxY = window.innerHeight - 80; 
    setPosition({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartPos.current = null;
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
    } else {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging]);

  const handleButtonClick = () => {
    if (!hasMoved.current) {
      setIsOpen(true);
      stopCurrentNarrative();
      if (history.length === 0 || !visibleMessage) {
           const initialMsg = 'يا أهلاً بالضحية الجديدة.. جاهز للموت؟';
           setVisibleMessage(initialMsg);
           messageTimeoutRef.current = setTimeout(() => setVisibleMessage(null), 6000);
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    stopCurrentNarrative();
    if (onRefresh) onRefresh();
  };

  // Find and play a video (AI Command or Fate Button)
  const executeVideoPlay = (searchQuery?: string) => {
      if (!allVideos || allVideos.length === 0 || !onPlayVideo) return;

      let targetVideo: Video | undefined;

      if (searchQuery) {
          // Fuzzy search
          const query = searchQuery.toLowerCase();
          targetVideo = allVideos.find(v => v.title.toLowerCase().includes(query) || v.description?.toLowerCase().includes(query) || v.category.toLowerCase().includes(query));
      }

      // Fallback: Random based on interests or random completely
      if (!targetVideo) {
          const topInterests = SmartBrain.getTopInterests();
          let candidates = allVideos.filter(v => topInterests.includes(v.category));
          if (candidates.length === 0) candidates = allVideos;
          targetVideo = candidates[Math.floor(Math.random() * candidates.length)];
      }

      if (targetVideo) {
          handleClose();
          onPlayVideo(targetVideo);
      }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || loading) return;

    stopCurrentNarrative();
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);

    const userMessage = inputText.trim();
    setInputText('');
    
    const newHistory: ChatMessage[] = [...history, { role: 'user', text: userMessage }];
    setHistory(newHistory);
    
    setLoading(true); 
    setVisibleMessage(null);

    try {
      const aiResponse = await SmartBrain.askAssistant(userMessage, newHistory, allVideos);
      
      const replyText = aiResponse.reply;
      setHistory(prev => [...prev, { role: 'model', text: replyText }]);
      setVisibleMessage(replyText);

      if (aiResponse.action === 'play_video') {
           setTimeout(() => {
               executeVideoPlay(aiResponse.search_query);
           }, 2000);
      }

      // Voice Handling Logic
      if (!isVoiceLocked) {
        const speakableText = cleanTextForSpeech(replyText);
        if (speakableText) {
          playNarrative(speakableText);
          
          const newVoiceCount = voiceCount + 1;
          setVoiceCount(newVoiceCount);

          if (newVoiceCount >= 7) {
              setIsVoiceLocked(true);
              localStorage.setItem('voice_lockout_timestamp', Date.now().toString());
          }
        }
        
        const wordCount = replyText.split(' ').length;
        const readTime = Math.max(4000, (wordCount / 2) * 1000); 
        messageTimeoutRef.current = setTimeout(() => {
            setVisibleMessage(null);
        }, readTime + 2000);

      } else {
        setTextTurnCount(prev => prev + 1);
        messageTimeoutRef.current = setTimeout(() => {
            setVisibleMessage(null);
        }, 8000);
      }

    } catch (error) {
      console.error("AI Error:", error);
      setVisibleMessage("الأرواح غضبانة.. مش قادرة أسمعك.");
    } finally {
      setLoading(false); 
    }
  };

  const showSuggestionButton = isVoiceLocked && textTurnCount > 0 && textTurnCount % 5 === 0;

  return (
    <>
      <div 
        ref={buttonRef}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={handleButtonClick}
        style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : { bottom: '6rem', right: '1.5rem' }}
        className={`fixed z-[100] w-20 h-20 flex items-center justify-center cursor-pointer transition-transform duration-100 ${isDragging ? 'scale-110 cursor-grabbing' : 'active:scale-95 cursor-grab'} touch-none select-none group`}
        title="سيدة الحديقة AI"
      >
        {isDragging && (
          <div className="absolute inset-0 rounded-full blur-2xl bg-gradient-to-tr from-cyan-400 via-purple-500 to-yellow-400 opacity-80 animate-pulse duration-75"></div>
        )}
        <div 
          className={`absolute w-full h-full rounded-full border-t-4 border-b-4 border-red-600 border-l-transparent border-r-transparent animate-spin ${isDragging ? 'shadow-[0_0_40px_#ef4444]' : 'shadow-[0_0_15px_rgba(220,38,38,0.6)]'}`} 
          style={{ animationDuration: isDragging ? '0.5s' : '1.5s' }}
        ></div>
        <div 
          className={`absolute w-[92%] h-[92%] rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin ${isDragging ? 'shadow-[0_0_30px_#eab308]' : 'shadow-[0_0_10px_rgba(234,179,8,0.6)]'}`} 
          style={{ animationDirection: 'reverse', animationDuration: isDragging ? '0.8s' : '2s' }}
        ></div>
        <div className={`relative z-10 w-[85%] h-[85%] rounded-full overflow-hidden border-2 border-white/20 animate-pulse ${isDragging ? 'border-cyan-400 shadow-[0_0_20px_#22d3ee]' : 'shadow-[0_0_20px_rgba(220,38,38,0.8)]'}`}>
          <Logo className="w-full h-full object-cover opacity-90 pointer-events-none" alt="AI Avatar" />
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[1000] bg-black overflow-hidden overscroll-none touch-none">
          
          <div 
             className="fixed top-0 left-0 w-full z-0 bg-black border-b-2 border-red-900/50 shadow-[0_10px_40px_rgba(220,38,38,0.1)] overflow-hidden"
             style={{ height: splitPoint ? `${splitPoint}px` : '50%' }}
          >
              <button 
                onClick={handleClose} 
                className="absolute top-4 left-4 z-50 bg-black/40 backdrop-blur-md p-3 rounded-full text-white/70 hover:text-red-500 border border-white/10 hover:border-red-500 transition-all active:scale-90"
              >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>

              {/* Status Indicator */}
              <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-1">
                 <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-red-600/20 backdrop-blur-md">
                    <div className={`w-2 h-2 rounded-full ${isTalking ? 'bg-green-500 animate-pulse shadow-[0_0_10px_lime]' : 'bg-red-600'}`}></div>
                    <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{isTalking ? 'SPEAKING' : (isVoiceLocked ? 'TEXT MODE' : 'LISTENING')}</span>
                 </div>
              </div>

              {/* Seamless Video Switching Logic */}
              <div className="relative w-full h-full bg-neutral-900">
                  {/* Layer 1: Silent Video */}
                  {silentUrl && (
                      <video 
                        src={silentUrl} 
                        muted loop autoPlay playsInline 
                        preload="auto"
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out ${isTalking ? 'opacity-0' : 'opacity-100'}`}
                      />
                  )}
                  {/* Layer 2: Talking Video */}
                  {talkingUrl && (
                      <video 
                        src={talkingUrl} 
                        muted loop autoPlay playsInline 
                        preload="auto"
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out ${isTalking ? 'opacity-100' : 'opacity-0'}`}
                      />
                  )}
                  
                  {/* Fallback Image if no videos */}
                  {!silentUrl && !talkingUrl && (
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-gray-500 flex-col gap-4">
                          <div className="relative w-24 h-24 flex items-center justify-center">
                              <div className="absolute inset-0 rounded-full border-t-2 border-b-2 border-red-600 border-l-transparent border-r-transparent animate-spin shadow-[0_0_30px_#dc2626] opacity-80" style={{ animationDuration: '1.5s' }}></div>
                              <div className="absolute inset-2 rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin shadow-[0_0_20px_#eab308] opacity-80" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
                              <div className="relative z-10 w-16 h-16 rounded-full overflow-hidden border border-white/20 shadow-[0_0_25px_rgba(220,38,38,0.8)] animate-pulse">
                                <Logo className="w-full h-full object-cover" />
                              </div>
                          </div>
                          <span className="text-xs font-bold text-red-500/80 animate-pulse tracking-widest">حارس الحديقه مشغول الان ارجو الانتظار</span>
                      </div>
                  )}
              </div>
              
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 pointer-events-none"></div>

              {/* MESSAGE OVERLAY */}
              <div className="absolute bottom-6 left-0 right-0 z-[60] px-6 flex flex-col items-center justify-end min-h-[100px]">
                  {loading && (
                      <div className="mb-2 bg-red-950/40 text-red-500 px-4 py-1 rounded-full text-[10px] font-black animate-pulse border border-red-600/20 backdrop-blur-sm">
                          جاري استدعاء الروح...
                      </div>
                  )}

                  {visibleMessage && !loading && (
                      <div className={`animate-in slide-in-from-bottom-5 fade-in duration-500 w-full max-w-md`}>
                          <div className={`bg-black/40 backdrop-blur-sm p-2 rounded-xl text-center shadow-[0_0_30px_rgba(220,38,38,0.2)]`}>
                              <p 
                                className={`text-lg md:text-xl font-black drop-shadow-[0_0_8px_#ef4444] leading-tight line-clamp-4 overflow-hidden text-ellipsis px-2 py-1 text-red-500`}
                                style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.8), 0 0 20px rgba(239, 68, 68, 0.5)' }}
                              >
                                  {visibleMessage}
                              </p>
                          </div>
                      </div>
                  )}
              </div>
          </div>

          <div 
             className="fixed left-0 w-full z-50 bg-black overflow-hidden border-t border-white/10"
             style={{ 
               top: splitPoint ? `${splitPoint}px` : '50%', 
               height: layoutHeight ? `${layoutHeight - splitPoint}px` : '50%' 
             }}
          >
             {/* BACKGROUND FX */}
             <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
                <style>
                  {`
                    @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
                    @keyframes plasma-shift { 0% { background-position: 0% 50%; filter: hue-rotate(0deg); } 50% { background-position: 100% 50%; filter: hue-rotate(15deg); } 100% { background-position: 0% 50%; filter: hue-rotate(0deg); } }
                    @keyframes signal-noise { 0%, 100% { opacity: 0.8; } 10% { opacity: 0.6; transform: translateX(2px); } 20% { opacity: 0.9; transform: translateX(-2px); } 30% { opacity: 0.7; } }
                  `}
                </style>
                <div className="absolute inset-0 bg-[#050000]"></div>
                <div className="absolute inset-0 opacity-40 animate-[plasma-shift_8s_ease-in-out_infinite]" style={{ background: 'radial-gradient(circle at 50% 50%, #450a0a 0%, #000000 60%)', backgroundSize: '150% 150%' }}></div>
                <div className="absolute inset-0 z-10 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }}></div>
                <div className="absolute inset-0 z-20 bg-gradient-to-b from-transparent via-red-900/10 to-transparent h-[20%] w-full animate-[scanline_4s_linear_infinite] pointer-events-none"></div>
                <div className="absolute inset-0 z-0 opacity-10 animate-[signal-noise_0.2s_infinite]" style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, #220000 3px, #220000 4px)` }}></div>
                <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-black to-transparent z-10"></div>
             </div>

             <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black to-transparent pointer-events-none z-10"></div>

             {showSuggestionButton && (
                 <div className="flex flex-col items-center justify-center mt-2 mb-1 relative z-30 animate-in fade-in zoom-in duration-300">
                     <p className="text-[10px] text-red-400 font-bold mb-1 animate-pulse">حارس الحديقة مشغول... بس ممكن تشوفي ده؟</p>
                     <button 
                       onClick={() => executeVideoPlay()} 
                       className="bg-red-900/80 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-[0_0_20px_rgba(220,38,38,0.5)] border-2 border-red-500 animate-bounce active:scale-95 hover:bg-red-800 transition-all flex items-center gap-2"
                     >
                         <span>فيديو عشوائي من اختياري</span>
                         <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                     </button>
                 </div>
             )}

             {/* Input Form */}
             <form 
                onSubmit={handleSendMessage}
                className="px-4 pt-4 flex items-center gap-3 relative z-30"
              >
                <div className="flex-1 relative group">
                    <input 
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={isVoiceLocked ? "اكتبي براحتك.. أنا سامعاكي (كتابة)" : "اكتب رسالتك للسيدة..."} 
                      disabled={loading}
                      className="w-full bg-black/50 border border-red-900/30 rounded-2xl py-4 px-6 text-white text-sm outline-none focus:border-red-600 transition-colors placeholder:text-gray-500 disabled:opacity-50 backdrop-blur-md shadow-[0_0_20px_rgba(220,38,38,0.1)] text-right"
                      autoComplete="off"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-red-600/5 blur-md opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none"></div>
                </div>
                
                <button 
                  type="submit"
                  disabled={loading || !inputText.trim()}
                  className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-90 disabled:opacity-50 disabled:grayscale transition-all hover:bg-red-500 shrink-0"
                >
                  {loading ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                      <svg className="w-6 h-6 rotate-180" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                      </svg>
                  )}
                </button>
              </form>
          </div>

        </div>
      )}
    </>
  );
};

export default AIOracle;