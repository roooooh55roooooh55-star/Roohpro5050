import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Video, UserInteractions } from './types';
import { getDeterministicStats, formatBigNumber, LOGO_URL, formatVideoSource, NeonTrendBadge } from './MainContent';
import { playNarrative, stopCurrentNarrative } from './elevenLabsManager';
import { getVideoSrcFromCache, bufferVideoChunk } from './smartCache';

interface ShortsPlayerOverlayProps {
  initialVideo: Video;
  videoList: Video[];
  interactions: UserInteractions;
  onClose: () => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onCategoryClick: (cat: string) => void;
  onSave: (id: string) => void;
  onProgress: (id: string, progress: number) => void;
  onDownload: (video: Video) => void;
  isGlobalDownloading: boolean;
}

// --- NEW DYNAMIC OVERLAY BUTTON (ROAMING) ---
const RoamingNeonButton: React.FC<{ text: string, url: string }> = ({ text, url }) => {
    return (
        <a 
          href={url}
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute z-[80] flex items-center justify-center animate-[roam_20s_ease-in-out_infinite]"
          style={{ top: '15%', left: '5%' }} 
        >
            <style>{`
              @keyframes roam {
                0% { top: 15%; left: 5%; transform: translate(0, 0) rotate(-2deg); }
                25% { top: 25%; left: 60%; transform: translate(0, 20px) rotate(2deg); }
                50% { top: 50%; left: 40%; transform: translate(-10px, 0) rotate(-2deg); }
                75% { top: 30%; left: 10%; transform: translate(0, -20px) rotate(2deg); }
                100% { top: 15%; left: 5%; transform: translate(0, 0) rotate(-2deg); }
              }
              @keyframes intense-glow {
                0%, 100% { box-shadow: 0 0 10px #22d3ee, 0 0 20px #22d3ee, inset 0 0 10px #22d3ee; border-color: #22d3ee; }
                50% { box-shadow: 0 0 20px #a855f7, 0 0 40px #a855f7, inset 0 0 15px #a855f7; border-color: #a855f7; }
              }
            `}</style>
            
            <div className="bg-black/80 backdrop-blur-xl px-5 py-2.5 rounded-full border-2 animate-[intense-glow_2s_infinite] flex items-center gap-3 group hover:scale-110 transition-transform cursor-pointer">
                <span className="text-sm font-black text-white filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] tracking-wide">{text}</span>
                <div className="w-6 h-6 bg-white text-black rounded-full flex items-center justify-center animate-pulse shadow-[0_0_10px_white]">
                    <svg className="w-3.5 h-3.5 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                </div>
            </div>
        </a>
    );
};

const NeonLionIcon: React.FC<{ colorClass: string, isDownloading: boolean }> = ({ colorClass, isDownloading }) => (
  <svg 
    className={`w-7 h-7 transition-all duration-500 ${colorClass} ${isDownloading ? 'animate-bounce drop-shadow-[0_0_15px_currentColor]' : 'hover:scale-110 drop-shadow-[0_0_5px_currentColor]'}`} 
    viewBox="0 0 24 24" 
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2c-4 0-7 3-7 7 0 2 1 4 2 5-1 1-2 3-2 5 0 2 2 3 4 3h6c2 0 4-1 4-3 0-2-1-4-2-5 1-1 2-3 2-5 0-4-3-7-7-7z" className="opacity-40" />
    <path d="M9 9h.01M15 9h.01M10 13c1 1 3 1 4 0" />
    <path d="M7 11c-1-1-2-1-3 0M17 11c1-1 2-1 3 0" />
    <circle cx="12" cy="12" r="10" className="opacity-20" />
  </svg>
);

const DynamicCaptions: React.FC<{ text: string, isActive: boolean }> = ({ text, isActive }) => {
  const [currentChunk, setCurrentChunk] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const chunkIndex = useRef(0);
  
  const chunks = useMemo(() => {
    if (!text) return [];
    const words = text.split(/\s+/);
    const result = [];
    for (let i = 0; i < words.length; i += 4) {
      result.push(words.slice(i, i + 4).join(' '));
    }
    return result;
  }, [text]);

  useEffect(() => {
    if (!isActive || chunks.length === 0) {
      setIsVisible(false);
      return;
    }

    // Don't reset if we are already showing captions for this text
    if (chunkIndex.current === 0 && !isVisible) {
        // Start sequence
        const showNextChunk = () => {
            if (chunkIndex.current >= chunks.length) {
              setIsVisible(false);
              return;
            }
      
            setCurrentChunk(chunks[chunkIndex.current]);
            setIsVisible(true);
      
            setTimeout(() => {
              setIsVisible(false);
              setTimeout(() => {
                chunkIndex.current++;
                showNextChunk();
              }, 300); 
            }, 2500); 
          };
      
          showNextChunk();
    }
  }, [chunks, isActive]);

  if (chunks.length === 0) return null;

  return (
    <div className="absolute z-[100] w-full max-w-[80%] pointer-events-none flex flex-col bottom-48 right-4 text-right items-end">
      <div 
        className={`transition-all duration-500 ease-in-out transform ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
      >
        <div className="bg-black/60 backdrop-blur-md border-2 border-cyan-400 px-6 py-3 rounded-2xl shadow-[0_0_20px_#22d3ee] flex items-center gap-3">
             <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_#22d3ee]"></div>
             <span className="text-lg md:text-xl font-black text-white italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-relaxed tracking-wide">
                {currentChunk}
             </span>
        </div>
      </div>
    </div>
  );
};

// --- ISOLATED VIDEO ITEM COMPONENT (Crucial for individual state management) ---
const ShortsVideoItem: React.FC<{
    video: Video;
    isActive: boolean;
    interactions: UserInteractions;
    isGlobalDownloading: boolean;
    isNarrativeOn: boolean;
    onVideoRef: (el: HTMLVideoElement | null) => void;
    onNext: () => void;
    onProgress: (id: string, p: number) => void;
    onToggleNarrative: (e: React.MouseEvent) => void;
    onLike: (id: string) => void;
    onDislike: (id: string) => void;
    onDownload: (v: Video) => void;
    onSave: (id: string) => void;
    onCategoryClick: (cat: string) => void;
    onClose: () => void;
    onVideoPlay: () => void; // Callback when video actually starts playing
}> = ({ 
    video, isActive, interactions, isGlobalDownloading, isNarrativeOn,
    onVideoRef, onNext, onProgress, onToggleNarrative, onLike, onDislike, onDownload, onSave, onCategoryClick, onClose, onVideoPlay 
}) => {
    const [hasError, setHasError] = useState(false);
    // FIX: Initialize with valid source string immediately
    const [activeSrc, setActiveSrc] = useState<string>(formatVideoSource(video) || ''); 
    const [isVideoPlaying, setIsVideoPlaying] = useState(false); // Controls visual visibility of video vs poster
    const stats = useMemo(() => getDeterministicStats(video.video_url), [video.video_url]);
    
    // Derived states
    const isLiked = interactions.likedIds.includes(video.id);
    const isDisliked = interactions.dislikedIds.includes(video.id);
    const isSaved = interactions.savedIds.includes(video.id);
    const isDownloaded = interactions.downloadedIds.includes(video.id);
    const lionColor = isDownloaded ? "text-cyan-400 drop-shadow-[0_0_12px_#22d3ee]" : "text-purple-400 drop-shadow-[0_0_8px_#c084fc]";
    
    // --- SMART BUFFERING LOGIC ---
    useEffect(() => {
        let isMounted = true;
        const originalSrc = formatVideoSource(video);
        if(!originalSrc) return;

        const loadVideo = async () => {
            const cachedBlob = await getVideoSrcFromCache(originalSrc);
            
            if (isMounted) {
                if (cachedBlob) {
                    setActiveSrc(cachedBlob);
                } else {
                    // Do not block. Set source is already handled by initial state.
                    // Just trigger background buffer.
                    bufferVideoChunk(originalSrc).catch(() => {});
                }
            }
        };
        loadVideo();

        return () => {
            isMounted = false;
            if (activeSrc && activeSrc.startsWith('blob:')) {
                URL.revokeObjectURL(activeSrc);
            }
        };
    }, [video.video_url]);

    // Handle pausing narrative if video buffers
    const handleWaiting = () => {
        setIsVideoPlaying(false);
        stopCurrentNarrative();
    };

    if (!activeSrc) return null;

    return (
        <div className="h-full w-full snap-start relative bg-black flex overflow-hidden">
            <div className="relative h-full w-full cursor-pointer" onClick={(e) => {
                const vid = e.currentTarget.querySelector('video');
                if (vid) {
                    if (vid.paused) {
                        vid.play().catch(() => {}); // Catch play interruption error
                    } else {
                        vid.pause();
                    }
                }
            }}>
                {/* 
                   POSTER LAYER (Persistent until Playback)
                   Removed spinner circle as requested.
                */}
                <div className={`absolute inset-0 z-10 transition-opacity duration-700 bg-black ${isVideoPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {video.poster_url && (
                        <img 
                            src={video.poster_url} 
                            className="w-full h-full object-cover" 
                            alt="Loading thumbnail"
                        />
                    )}
                </div>

                {/* VIDEO LAYER */}
                <video 
                    ref={onVideoRef}
                    src={activeSrc} 
                    className="h-full w-full object-cover contrast-110 saturate-125 landscape:object-contain relative z-0"
                    playsInline 
                    loop={false} 
                    muted={false} 
                    crossOrigin="anonymous"
                    preload="auto" 
                    // CRITICAL: Triggers narrative only when video actually plays
                    onPlaying={() => {
                        setIsVideoPlaying(true);
                        if (isActive) onVideoPlay();
                    }}
                    onWaiting={handleWaiting} // Pause visual & audio on buffer
                    onPause={() => {
                        setIsVideoPlaying(false);
                        stopCurrentNarrative();
                    }}
                    onEnded={() => { if(isActive) onNext(); }} 
                    onTimeUpdate={(e) => { 
                        if(isActive) {
                            onProgress(video.id, e.currentTarget.currentTime / e.currentTarget.duration);
                            // Ensure poster is hidden if time is progressing
                            if (e.currentTarget.currentTime > 0.1) setIsVideoPlaying(true);
                        }
                    }}
                    onError={() => {
                        if (activeSrc.startsWith('blob:')) {
                            setActiveSrc(formatVideoSource(video));
                        } else {
                            setHasError(true);
                        }
                    }}
                />

                {/* ERROR FALLBACK */}
                {hasError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 z-20">
                        <div className="text-center p-6 border-2 border-red-900/50 rounded-3xl bg-black/50 backdrop-blur-sm">
                            <svg className="w-12 h-12 text-red-700 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            <p className="text-red-500 font-bold text-sm">عذراً، هذا الكابوس تالف</p>
                        </div>
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60 pointer-events-none z-10" />
                <div className="z-20 absolute top-2 left-2"><NeonTrendBadge is_trending={video.is_trending} /></div>
                
                {/* Only show Narrative if video is actively playing (not buffered/paused) */}
                {isNarrativeOn && (
                   <DynamicCaptions text={video.description} isActive={isActive && isVideoPlaying} />
                )}
            </div>

            {/* --- NEW DYNAMIC ROAMING OVERLAY BUTTON --- */}
            {video.overlay_text && video.overlay_url && (
                <RoamingNeonButton text={video.overlay_text} url={video.overlay_url} />
            )}

            {video.redirect_url && (
                <button 
                  onClick={() => window.open(video.redirect_url, '_blank')}
                  className="absolute bottom-32 left-4 p-4 bg-red-600 rounded-2xl text-white font-black shadow-[0_0_30px_rgba(220,38,38,0.8)] flex items-center gap-2 active:scale-95 transition-all animate-bounce z-50 border-2 border-red-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  <span className="text-sm">مشاهدة المزيد</span>
                </button>
            )}

            <div className="absolute bottom-24 left-4 flex flex-col items-center gap-5 z-40">
                <div className="flex flex-col items-center gap-1">
                    <button onClick={onToggleNarrative} className="group">
                        <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isNarrativeOn ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_20px_#22d3ee]' : 'bg-black/40 border-white/20 text-gray-400 hover:border-cyan-600/50'}`}>
                           {isNarrativeOn ? (
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                           ) : (
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                           )}
                        </div>
                    </button>
                    <span className="text-[9px] font-black text-white drop-shadow-lg italic">{isNarrativeOn ? 'ON' : 'OFF'}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onLike(video.id); }} className="group">
                    <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isLiked ? 'bg-red-600 border-red-400 text-white shadow-[0_0_20px_#ef4444]' : 'bg-black/40 border-white/20 text-white backdrop-blur-xl hover:border-red-600/50'}`}>
                      <svg className="w-6 h-6" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                    </div>
                  </button>
                  <span className="text-[9px] font-black text-white drop-shadow-lg">{formatBigNumber(stats.likes)}</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onDislike(video.id); }} className="group">
                    <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isDisliked ? 'bg-orange-600 border-orange-400 text-white shadow-[0_0_20px_#ea580c]' : 'bg-black/40 border-white/20 text-white backdrop-blur-xl hover:border-orange-600/50'}`}>
                      <svg className="w-6 h-6 rotate-180" fill={isDisliked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
                    </div>
                  </button>
                  <span className="text-[9px] font-black text-white drop-shadow-lg italic">كرهت</span>
                </div>

                <div className="flex flex-col items-center gap-1 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); onDownload(video); }} className="group">
                    <div className={`p-3 rounded-2xl border-2 transition-all duration-500 bg-black/40 ${isDownloaded ? 'border-cyan-400 shadow-[0_0_20px_#22d3ee]' : 'border-purple-500/30 shadow-[0_0_10px_rgba(192,132,252,0.3)] hover:border-cyan-400/40'}`}>
                      <NeonLionIcon colorClass={lionColor} isDownloading={isGlobalDownloading && isActive} />
                    </div>
                  </button>
                  <span className="text-[8px] font-black text-white uppercase tracking-tighter italic">{isDownloaded ? 'Saved' : 'Vault'}</span>
                </div>

                <button onClick={(e) => { e.stopPropagation(); onSave(video.id); }} className="mt-2 flex flex-col items-center group">
                   <div className={`p-3.5 rounded-full border-2 transition-all duration-300 ${isSaved ? 'bg-yellow-500 border-yellow-300 text-white shadow-[0_0_20px_#facc15]' : 'bg-black/40 border-white/20 text-white backdrop-blur-xl hover:border-yellow-500/50'}`}>
                     <svg className="w-6 h-6" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                   </div>
                </button>
            </div>

            <div className="absolute bottom-24 right-4 z-40 max-w-[75%]">
                <div className="flex flex-col items-start gap-3">
                  <button onClick={(e) => { e.stopPropagation(); onCategoryClick(video.category); }} className="backdrop-blur-xl bg-red-600/70 border-2 border-red-400 px-4 py-1 rounded-full shadow-[0_0_15px_red] active:scale-95 transition-all self-start">
                    <span className="text-[10px] font-black text-white italic uppercase">{video.category}</span>
                  </button>
                  
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={(e) => { e.stopPropagation(); onClose(); }}
                      className="relative w-12 h-12 flex items-center justify-center cursor-pointer active:scale-90 transition-transform shrink-0"
                    >
                      <div className="absolute w-full h-full rounded-full border-t-2 border-b-2 border-red-600 border-l-transparent border-r-transparent animate-spin shadow-[0_0_15px_rgba(220,38,38,0.8)]" style={{ animationDuration: '1.5s' }}></div>
                      <div className="absolute w-[90%] h-[90%] rounded-full border-l-2 border-r-2 border-yellow-500 border-t-transparent border-b-transparent animate-spin shadow-[0_0_10px_rgba(234,179,8,0.8)]" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
                      <div className="relative z-10 w-[85%] h-[85%] rounded-full overflow-hidden border border-white/20 shadow-[0_0_10px_rgba(220,38,38,0.6)]">
                         <img 
                           src={LOGO_URL} 
                           className="w-full h-full object-cover opacity-90"
                           alt="Logo" 
                         />
                      </div>
                    </div>

                    <div className="flex flex-col items-start text-right">
                      <h3 className="text-red-600 text-[11px] font-black drop-shadow-md leading-tight italic">@الحديقة المرعبة</h3>
                      <p className="text-white/90 text-[11px] font-bold italic mt-0.5 drop-shadow-md leading-tight">{video.title}</p>
                    </div>
                  </div>
                </div>
            </div>
        </div>
    );
};

const ShortsPlayerOverlay: React.FC<ShortsPlayerOverlayProps> = ({ 
  initialVideo, videoList, interactions, onClose, onLike, onDislike, onCategoryClick, onSave, onProgress, onDownload, isGlobalDownloading
}) => {
  const [displayList, setDisplayList] = useState<Video[]>([]);
  
  useEffect(() => {
      const otherVideos = videoList.filter(v => v.id !== initialVideo.id);
      for (let i = otherVideos.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherVideos[i], otherVideos[j]] = [otherVideos[j], otherVideos[i]];
      }
      setDisplayList([initialVideo, ...otherVideos]);
  }, [initialVideo.id, videoList]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  
  const [isNarrativeOn, setIsNarrativeOn] = useState(true);

  // Stop narrative on unmount
  useEffect(() => {
      return () => {
          stopCurrentNarrative();
      };
  }, []);

  // When changing videos, STOP current narrative immediately.
  // We DO NOT start it here anymore. We wait for the new video to trigger `onVideoPlay`
  useEffect(() => {
    stopCurrentNarrative();
  }, [currentIndex]);

  // Handler passed to child: Called when <video> fires onPlaying
  const handleVideoPlaying = useCallback(() => {
      const currentVideo = displayList[currentIndex];
      if (isNarrativeOn && currentVideo && currentVideo.read_narrative) {
          const textToRead = currentVideo.description || currentVideo.title;
          if (textToRead) playNarrative(textToRead);
      }
  }, [currentIndex, displayList, isNarrativeOn]);

  const handleToggleNarrative = (e: React.MouseEvent) => {
      e.stopPropagation();
      const newState = !isNarrativeOn;
      setIsNarrativeOn(newState);
      if (!newState) {
          stopCurrentNarrative();
      } else {
           // If user turns it ON while playing, start immediately
           const currentVideo = displayList[currentIndex];
           if (currentVideo && currentVideo.read_narrative) {
               const textToRead = currentVideo.description || currentVideo.title;
               if (textToRead) playNarrative(textToRead);
           }
      }
  };

  useEffect(() => {
    const preloadNext = async () => {
        const nextIndices = [currentIndex + 1, currentIndex + 2];
        for (const idx of nextIndices) {
            if (idx < displayList.length) {
                const video = displayList[idx];
                const url = formatVideoSource(video);
                try {
                    bufferVideoChunk(url);
                } catch (e) {}
            }
        }
    };
    preloadNext();
  }, [currentIndex, displayList]);

  useEffect(() => {
      if (currentIndex >= displayList.length - 2 && displayList.length > 0) {
          const moreVideos = [...videoList].sort(() => 0.5 - Math.random());
          setDisplayList(prev => [...prev, ...moreVideos]);
      }
  }, [currentIndex, displayList.length, videoList]);

  const handleNextVideo = useCallback(() => {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const container = containerRef.current;
      if (container) {
        container.scrollTo({ top: nextIdx * container.clientHeight, behavior: 'smooth' });
      }
  }, [currentIndex]);

  useEffect(() => {
    // Pause all previous videos to prevent overlap
    (Object.values(videoRefs.current) as (HTMLVideoElement | null)[]).forEach(v => {
        if(v) v.pause();
    });

    const mainVid = videoRefs.current[`main-${currentIndex}`];
    if (mainVid) {
      mainVid.currentTime = 0; 
      const attemptPlay = async () => {
          try {
              await mainVid.play();
          } catch (error: any) {
              // Ignore AbortError which happens when scrolling fast
              if (error.name !== 'AbortError') {
                  mainVid.muted = true;
                  try { await mainVid.play(); } catch(e) {}
              }
          }
      };
      attemptPlay();
    }
  }, [currentIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const height = e.currentTarget.clientHeight;
    if (height === 0) return;
    const index = Math.round(e.currentTarget.scrollTop / height);
    if (index !== currentIndex && index >= 0) {
      setCurrentIndex(index);
    }
  };

  const handleClose = () => {
      stopCurrentNarrative();
      onClose();
  };

  return (
    <div className="fixed inset-0 bg-black z-[500] flex flex-col overflow-hidden">
      <div className="absolute top-5 right-4 z-[600]">
        <button onClick={handleClose} className="p-2 rounded-full bg-black/60 backdrop-blur-xl text-red-600 border border-red-600 shadow-[0_0_15px_#dc2626] active:scale-75 transition-all hover:bg-black/80">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-grow overflow-y-scroll snap-y snap-mandatory scrollbar-hide h-full w-full">
        {displayList.map((video, idx) => {
          if (Math.abs(idx - currentIndex) > 2) {
              return <div key={`${video.id}-${idx}`} className="h-full w-full snap-start bg-black" />;
          }

          return (
            <ShortsVideoItem 
               key={`${video.id}-${idx}`}
               video={video}
               isActive={idx === currentIndex}
               interactions={interactions}
               isGlobalDownloading={isGlobalDownloading}
               isNarrativeOn={isNarrativeOn}
               onVideoRef={el => { videoRefs.current[`main-${idx}`] = el; }}
               onNext={handleNextVideo}
               onProgress={onProgress}
               onToggleNarrative={handleToggleNarrative}
               onLike={onLike}
               onDislike={onDislike}
               onDownload={onDownload}
               onSave={onSave}
               onCategoryClick={onCategoryClick}
               onClose={handleClose}
               onVideoPlay={handleVideoPlaying}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ShortsPlayerOverlay;