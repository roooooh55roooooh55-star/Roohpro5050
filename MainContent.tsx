import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Video, UserInteractions } from './types';
import { downloadVideoWithProgress } from './offlineManager';
import { db, ensureAuth } from './firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import CustomDynamicLayout from './CustomDynamicLayout';
import { bufferVideoChunk, getVideoSrcFromCache, bufferImage } from './smartCache'; 
import { Logo } from './Logo';

export const LOGO_URL = "https://i.top4top.io/p_3643ksmii1.jpg";

// Distinct Neon Border Colors
const STATIC_NEON_BORDERS = [
  'border-[#ff0000]',      // Pure Red
  'border-[#ff4d00]',      // Orange Red
  'border-[#ff9900]',      // Web Orange
  'border-[#ffcc00]',      // Tangerine Yellow
  'border-[#ffff00]',      // Pure Yellow
  'border-[#ccff00]',      // Electric Lime
  'border-[#66ff00]',      // Bright Green
  'border-[#00ff00]',      // Pure Green
  'border-[#00ff99]',      // Spring Green
  'border-[#00ffff]',      // Cyan / Aqua
  'border-[#0099ff]',      // Dodger Blue
  'border-[#0033ff]',      // Blue
  'border-[#6600ff]',      // Electric Indigo
  'border-[#9900ff]',      // Purple
  'border-[#cc00ff]',      // Phlox
  'border-[#ff00ff]',      // Magenta / Fuchsia
  'border-[#ff0066]',      // Deep Pink
  'border-[#ff0066]',      // Rose
  'border-[#ffffff]',      // White
];

export const getNeonColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return STATIC_NEON_BORDERS[Math.abs(hash) % STATIC_NEON_BORDERS.length];
};

export const getDeterministicStats = (seed: string) => {
  let hash = 0;
  if (!seed) return { views: 0, likes: 0 };
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const baseViews = Math.abs(hash % 900000) + 500000; 
  const views = baseViews * (Math.abs(hash % 5) + 2); 
  const likes = Math.abs(Math.floor(views * (0.12 + (Math.abs(hash % 15) / 100)))); 
  return { views, likes };
};

export const formatBigNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export const formatVideoSource = (video: Video) => {
  if (!video) return "";
  let r2Url = video.video_url || "";
  
  if (video.redirect_url && video.redirect_url.trim() !== "" && !r2Url) {
    return ""; 
  }
  
  if (!r2Url || !r2Url.startsWith('http')) return "";

  if ((r2Url.includes('r2.dev') || r2Url.includes('workers.dev')) && !r2Url.includes('#')) {
    return `${r2Url}#t=0.01`;
  }
  return r2Url;
};

// --- SAFE VIDEO COMPONENT (SOLVES BLACK SCREEN & CACHING & FAST PLAY) ---
export const SafeAutoPlayVideo: React.FC<React.VideoHTMLAttributes<HTMLVideoElement>> = (props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // FIX: Initialize with PROP SRC immediately for instant playback (Network)
  // Do not start with undefined or wait for cache
  const [activeSrc, setActiveSrc] = useState<string | undefined>(props.src);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Preload poster image to cache
  useEffect(() => {
      if (props.poster) {
          bufferImage(props.poster);
      }
  }, [props.poster]);

  useEffect(() => {
    let isMounted = true;
    const originalSrc = props.src;

    if (!originalSrc) return;

    // Background logic to check if we have a better cached blob
    // But don't delay initial render.
    const checkCache = async () => {
      // Check if we ALREADY have a blob in cache
      const cachedBlobUrl = await getVideoSrcFromCache(originalSrc);

      if (isMounted) {
          if (cachedBlobUrl) {
              // If we have a blob, use it (better for offline/repeat)
              setActiveSrc(cachedBlobUrl);
          } else {
              // If no blob, trigger background buffer for NEXT time, 
              // but let current component continue using network URL.
              // We do NOT await this or block execution
              bufferVideoChunk(originalSrc).catch(() => {});
          }
      }
    };

    checkCache();

    return () => {
      isMounted = false;
      if (activeSrc && activeSrc.startsWith('blob:')) {
          URL.revokeObjectURL(activeSrc);
      }
    };
  }, [props.src]);

  // Handle Playback Logic safely (Automatic Background Play)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeSrc) return;

    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    // 'metadata' allows faster initial paint without downloading whole file
    v.preload = "metadata"; 

    // Prevent "The play() request was interrupted" error
    let isMounted = true;
    let playPromise: Promise<void> | undefined;
    
    const startPlay = async () => {
        try {
            playPromise = v.play();
            await playPromise;
        } catch (err: any) {
            if (!isMounted) return;
            if (err.name !== 'AbortError') {
                 v.muted = true;
                 try { 
                     playPromise = v.play();
                     await playPromise; 
                 } catch(e) {}
            }
        }
    };
    
    // Immediate attempt
    startPlay();

    return () => {
        isMounted = false;
        if (playPromise !== undefined) {
            playPromise.then(() => { if(v) v.pause(); }).catch(() => {});
        } else {
            v.pause();
        }
    };
  }, [activeSrc]);

  return (
    // CHANGED: bg-black -> bg-transparent to remove black boxes
    <div className="w-full h-full bg-transparent relative overflow-hidden">
        {props.poster && (
            <img 
                src={props.poster} 
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-out ${isLoaded ? 'opacity-0' : 'opacity-100'}`} 
                alt="thumbnail"
                style={{ zIndex: 10 }}
            />
        )}
        
        <video 
            ref={videoRef} 
            {...props}
            src={activeSrc} // Use state src which might be Network OR Blob
            muted={true} 
            playsInline={true} 
            loop={true}
            onLoadedData={() => setIsLoaded(true)}
            onPlaying={() => setIsLoaded(true)} 
            onError={(e) => {
                // Fallback: If blob fails, revert to network immediately
                if (activeSrc && activeSrc.startsWith('blob:') && props.src) {
                    setActiveSrc(props.src);
                } else {
                    if (props.onError) props.onError(e);
                }
            }}
            className={`${props.className} block`} 
            style={{ objectFit: 'cover', zIndex: 5 }} 
        />
    </div>
  );
};

export const NeonTrendBadge = ({ is_trending }: { is_trending: boolean }) => {
  if (!is_trending) return null;
  return (
    <div className="absolute top-2 left-2 z-50">
      <div className="relative p-[1.5px] rounded-lg overflow-hidden group">
         <div className="absolute inset-0 bg-gradient-to-tr from-red-600 via-orange-500 to-yellow-400 animate-spin-slow opacity-100"></div>
         <div className="relative bg-black/90 backdrop-blur-xl rounded-md px-2 py-1 flex items-center gap-1.5 border border-white/5">
            <svg className="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_8px_#ef4444]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.55,11.2C17.32,10.93 15.33,8.19 15.33,8.19C15.33,8.19 15.1,10.03 14.19,10.82C13.21,11.66 12,12.24 12,13.91C12,15.12 12.6,16.22 13.56,16.89C13.88,17.11 14.24,17.29 14.63,17.41C15.4,17.63 16.23,17.61 17,17.33C17.65,17.1 18.23,16.69 18.66,16.15C19.26,15.38 19.5,14.41 19.34,13.44C19.16,12.56 18.63,11.83 18.05,11.33C17.9,11.23 17.73,11.25 17.55,11.2M13,3C13,3 12,5 10,7C8.5,8.5 7,10 7,13C7,15.76 9.24,18 12,18C12,18 11.5,17.5 11,16.5C10.5,15.5 10,14.5 10,13.5C10,12.5 10.5,11.5 11.5,10.5C12.5,9.5 14,8 14,8C14,8 15,10 16,12C16.5,13 17,14 17,15C17,15.5 16.9,16 16.75,16.5C17.5,16 18,15.5 18,15C18,13 17,11.5 15,10C13.5,8.88 13,3 13,3Z"/>
            </svg>
            <span className="text-[9px] font-black text-white italic tracking-widest">TREND</span>
         </div>
      </div>
    </div>
  );
};

const JoyfulNeonLion: React.FC<{ isDownloading: boolean, hasDownloads: boolean }> = ({ isDownloading, hasDownloads }) => (
  <div className="relative">
    {isDownloading && <div className="absolute inset-0 bg-yellow-400 blur-lg rounded-full opacity-40 animate-pulse"></div>}
    <svg 
      className={`w-7 h-7 transition-all duration-500 ${isDownloading ? 'text-yellow-400 scale-110 drop-shadow-[0_0_10px_#facc15]' : hasDownloads ? 'text-cyan-400 drop-shadow-[0_0_8px_#22d3ee]' : 'text-gray-600'}`} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9-9 4.03-9 9 4.03 9 9 9z" />
      <path d="M8 9.5c0-1.5 1-2.5 4-2.5s4 1 4 2.5" strokeLinecap="round" />
      <circle cx="9.5" cy="11" r="0.8" fill="currentColor" />
      <circle cx="14.5" cy="11" r="0.8" fill="currentColor" />
      <path d="M10 15.5c.5 1 1.5 1.5 2 1.5s1.5-.5 2-1.5" strokeLinecap="round" />
    </svg>
  </div>
);

// --- NEW OVERLAY BUTTON COMPONENT ---
const FloatingNeonButton: React.FC<{ text: string, url: string }> = ({ text, url }) => {
    return (
        <a 
          href={url}
          target="_blank" 
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-14 left-4 z-[60] flex items-center justify-center animate-[float_4s_ease-in-out_infinite]"
        >
            <style>{`
              @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
              }
              @keyframes glow-pulse {
                0%, 100% { box-shadow: 0 0 10px #22d3ee, 0 0 20px #22d3ee; border-color: #22d3ee; }
                50% { box-shadow: 0 0 20px #a855f7, 0 0 30px #a855f7; border-color: #a855f7; }
              }
            `}</style>
            <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border-2 animate-[glow-pulse_3s_infinite] flex items-center gap-2 group hover:scale-105 transition-transform">
                <span className="text-[10px] font-black text-white filter drop-shadow-md">{text}</span>
                <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center animate-pulse">
                    <svg className="w-2.5 h-2.5 text-black transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                </div>
            </div>
        </a>
    );
};

export const VideoCardThumbnail: React.FC<{ 
  video: Video, 
  isOverlayActive: boolean, 
  interactions: UserInteractions,
  onLike?: (id: string) => void,
  onCategoryClick?: (category: string) => void
}> = ({ video, isOverlayActive, interactions, onLike, onCategoryClick }) => {
  const [hasError, setHasError] = useState(false);
  
  const stats = useMemo(() => video ? getDeterministicStats(video.video_url) : { views: 0, likes: 0 }, [video?.video_url]);
  const formattedSrc = formatVideoSource(video);
  const neonStyle = video ? getNeonColor(video.id) : 'border-white/20';
  const isLiked = interactions?.likedIds?.includes(video?.id) || false;
  const isSaved = interactions?.savedIds?.includes(video?.id) || false;
  const watchItem = interactions?.watchHistory?.find(h => h.id === video?.id);
  const progress = watchItem ? watchItem.progress : 0;
  const isWatched = progress > 0.05; 
  const isHeartActive = isLiked || isSaved;

  if (!video) return null;

  if (hasError || !formattedSrc) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-transparent border border-red-900/30 rounded-2xl p-4 text-center group transform-gpu backface-hidden">
            <div className="w-10 h-10 rounded-full bg-red-900/20 flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-red-700 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <span className="text-[10px] font-bold text-red-800">الكابوس تالف</span>
            <p className="text-[8px] text-red-900 mt-1">{video.title}</p>
        </div>
    );
  }

  // Removed shadow for trending/non-trending to remove high glow
  const containerStyle = `${neonStyle} border-[2px] shadow-none bg-transparent`;

  return (
    <div className={`w-full h-full relative bg-transparent overflow-hidden group rounded-2xl transition-all duration-500 transform-gpu backface-hidden ${containerStyle}`}>
      
      <SafeAutoPlayVideo 
        src={formattedSrc}
        poster={video.poster_url}
        className="w-full h-full object-cover pointer-events-none landscape:object-contain bg-transparent"
        onError={() => setHasError(true)}
      />
      
      <NeonTrendBadge is_trending={video.is_trending} />

      {video.overlay_text && video.overlay_url && (
          <FloatingNeonButton text={video.overlay_text} url={video.overlay_url} />
      )}

      <div className="absolute top-2 right-2 flex flex-col items-center gap-1 z-30">
        <button 
          onClick={(e) => { e.stopPropagation(); onLike?.(video.id); }}
          className={`p-2 rounded-xl backdrop-blur-md border-2 transition-all duration-300 active:scale-90 flex items-center justify-center ${isHeartActive ? 'bg-red-600/30 border-red-500 shadow-[0_0_12px_#ef4444]' : 'bg-black/60 border-white/20 hover:border-red-500/50'}`}
        >
          <svg className={`w-5 h-5 ${isHeartActive ? 'text-red-500' : 'text-gray-400'}`} fill={isHeartActive ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>

        {!isWatched && (
          <div className="px-2 py-0.5 bg-yellow-400/10 border border-yellow-400 rounded-md shadow-[0_0_10px_#facc15] backdrop-blur-sm mt-1 animate-pulse">
             <span className="text-[9px] font-black text-blue-400 drop-shadow-[0_0_2px_rgba(59,130,246,0.8)]">جديد</span>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 z-20 pointer-events-none">
        <div className="flex justify-start mb-1">
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              onCategoryClick?.(video.category); 
            }}
            className="pointer-events-auto bg-red-600/10 border border-red-600/50 backdrop-blur-md px-2 py-0.5 rounded-[6px] flex items-center gap-1 shadow-[0_0_10px_rgba(220,38,38,0.3)] hover:bg-red-600 hover:text-white transition-all active:scale-90"
          >
             <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
             <span className="text-[8px] font-black text-red-500 hover:text-white truncate max-w-[80px]">{video.category}</span>
          </button>
        </div>

        <p className="text-white text-[10px] font-black line-clamp-1 italic text-right leading-tight drop-shadow-[0_2px_4_black]">{video.title}</p>
        
        <div className="flex items-center justify-end gap-3 mt-1.5 opacity-90">
          <div className="flex items-center gap-1">
             <span className="text-[8px] font-bold text-gray-300 font-mono tracking-tight">{formatBigNumber(stats.likes)}</span>
             <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </div>
          <div className="flex items-center gap-1 border-l border-white/20 pl-3">
             <span className="text-[8px] font-bold text-gray-300 font-mono tracking-tight">{formatBigNumber(stats.views)}</span>
             <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </div>
        </div>
      </div>
      
      {progress > 0 && progress < 0.99 && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-30">
          <div className="h-full bg-red-600 shadow-[0_0_12px_red]" style={{ width: `${progress * 100}%` }}></div>
        </div>
      )}
    </div>
  );
};

export const InteractiveMarquee: React.FC<{ 
  videos: Video[], 
  onPlay: (v: Video) => void,
  direction?: 'left-to-right' | 'right-to-left',
  isShorts?: boolean,
  interactions: UserInteractions,
  transparent?: boolean, 
  onLike?: (id: string) => void, 
  speedLevel?: 'slow' | 'medium' | 'fast'
}> = ({ videos, onPlay, direction = 'right-to-left', isShorts = false, interactions, transparent = false, onLike, speedLevel = 'medium' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  
  const getSpeedValue = () => {
      switch(speedLevel) {
          case 'slow': return 1.0; 
          case 'fast': return 2.5; // FAST MODE REQUESTED
          case 'medium': default: return 1.5; 
      }
  };

  const initialSpeed = direction === 'left-to-right' ? -getSpeedValue() : getSpeedValue();
  const [internalSpeed, setInternalSpeed] = useState(initialSpeed);
  
  useEffect(() => {
      setInternalSpeed(direction === 'left-to-right' ? -getSpeedValue() : getSpeedValue());
  }, [direction, speedLevel]);

  const velX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const requestRef = useRef<number>(null);
  const resumeTimeout = useRef<any>(null);

  const displayVideos = useMemo(() => {
    if (!videos || videos.length === 0) return [];
    return videos.length < 5 ? [...videos, ...videos, ...videos, ...videos, ...videos] : [...videos, ...videos, ...videos];
  }, [videos]);

  const animate = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      if (!isDragging) {
        const targetSpeed = internalSpeed > 0 ? getSpeedValue() : -getSpeedValue();
        if (Math.abs(internalSpeed - targetSpeed) > 0.05) {
             setInternalSpeed(prev => prev * 0.95 + targetSpeed * 0.05);
        }
        container.scrollLeft += internalSpeed;
        
        const { scrollLeft, scrollWidth } = container;
        if (scrollWidth > 0) {
           const singleSetWidth = scrollWidth / 3; 
           if (internalSpeed > 0) { 
               if (scrollLeft >= (singleSetWidth * 2)) {
                   container.scrollLeft = scrollLeft - singleSetWidth;
               }
           } else { 
               if (scrollLeft <= 10) { 
                   container.scrollLeft = scrollLeft + singleSetWidth;
               }
           }
        }
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [isDragging, internalSpeed, speedLevel]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [animate]);

  useEffect(() => {
    if (containerRef.current && videos?.length > 0) {
      const tid = setTimeout(() => {
        if (containerRef.current) containerRef.current.scrollLeft = containerRef.current.scrollWidth / 3;
      }, 150);
      return () => clearTimeout(tid);
    }
  }, [videos]);

  const handleStart = (clientX: number) => {
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    setIsDragging(true);
    setInternalSpeed(0); 
    setStartX(clientX - (containerRef.current?.offsetLeft || 0));
    setScrollLeftState(containerRef.current?.scrollLeft || 0);
    lastX.current = clientX;
    lastTime.current = Date.now();
    velX.current = 0;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || !containerRef.current) return;
    const x = clientX - (containerRef.current.offsetLeft || 0);
    containerRef.current.scrollLeft = scrollLeftState - (x - startX);
    
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
        const dx = clientX - lastX.current;
        velX.current = dx; 
    }
    lastX.current = clientX;
    lastTime.current = now;
  };

  const handleEnd = () => {
    setIsDragging(false);
    let momentum = -velX.current * 1.5; 
    if (momentum > 15) momentum = 15;
    if (momentum < -15) momentum = -15;

    if (Math.abs(momentum) > 1) {
        setInternalSpeed(momentum);
    } else {
        setInternalSpeed(direction === 'left-to-right' ? -getSpeedValue() : getSpeedValue());
    }
  };

  if (displayVideos.length === 0) return null;
  
  // ADJUSTED DIMENSIONS & SPACING:
  // 1. Reduced Container Height for Long videos to 'h-36' (from h-44)
  const containerHeight = isShorts ? 'h-48' : 'h-36'; 
  
  // 2. Reduced Long Video Dimensions to 'w-44 h-24' (Smaller, crisper, cleaner)
  const itemDimensions = isShorts ? 'w-24 h-40' : 'w-44 h-24'; 

  // 3. Reduced Padding 'py-4' (from py-8) to bring strips closer vertically
  const containerStyle = `relative overflow-hidden w-full ${containerHeight} bg-transparent animate-in fade-in duration-700 shadow-none py-4`;

  return (
    <div className={containerStyle} dir="ltr">
      <div 
        ref={containerRef}
        onMouseDown={(e) => handleStart(e.pageX)}
        onMouseMove={(e) => handleMove(e.pageX)}
        onMouseUp={handleEnd}
        onMouseLeave={() => { if(isDragging) handleEnd(); }}
        onTouchStart={(e) => { 
          if (!e.touches || e.touches.length === 0) return;
          handleStart(e.touches[0].pageX);
        }}
        onTouchMove={(e) => { 
          if (!e.touches || e.touches.length === 0) return; 
          handleMove(e.touches[0].pageX);
        }}
        onTouchEnd={handleEnd}
        className="flex gap-4 px-6 h-full items-center overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none"
      >
        {displayVideos.map((item, idx) => {
            if (!item || !item.video_url) return null;
            const neonStyle = getNeonColor(item.id);
            const formattedSrc = formatVideoSource(item);
            const isLiked = interactions?.likedIds?.includes(item.id);

            return (
              // Individual Item
              <div 
                key={`${item.id}-${idx}`} 
                onClick={() => !isDragging && onPlay(item)} 
                className={`${itemDimensions} shrink-0 rounded-xl overflow-hidden border-2 relative active:scale-95 transition-all ${neonStyle} ${item.is_trending ? 'border-red-600' : ''} bg-transparent shadow-none`} 
                dir="rtl"
              >
                <SafeAutoPlayVideo 
                   src={formattedSrc} 
                   poster={item.poster_url}
                   muted={true}
                   className="w-full h-full object-cover pointer-events-none landscape:object-contain bg-transparent" 
                   onError={(e) => e.currentTarget.style.display = 'none'}
                />
                
                <div className="absolute top-1 right-1 z-20">
                   <button 
                     onClick={(e) => { 
                        e.stopPropagation(); 
                        onLike && onLike(item.id); 
                     }}
                     className={`p-1.5 rounded-lg backdrop-blur-md border transition-all active:scale-75 ${isLiked ? 'bg-red-600/60 border-red-500 text-white shadow-[0_0_10px_red]' : 'bg-black/40 border-white/20 text-gray-300 hover:text-white hover:border-white/50'}`}
                   >
                     <svg className="w-3 h-3" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                   </button>
                </div>

                {/* CONDITIONAL TITLE: Removed completely for Shorts, kept for Longs with gradient */}
                {!isShorts && (
                    <div className="absolute inset-x-0 bottom-0 p-2 pointer-events-none bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-[8px] font-black text-white truncate italic text-right leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{item.title}</p>
                    </div>
                )}
              </div>
            );
        })}
      </div>
    </div>
  );
};

const ResumeNotificationFull: React.FC<{
  video: Video,
  pos: { top: string, left: string, anim: string },
  onPlay: () => void,
  onClose: () => void
}> = ({ video, pos, onPlay, onClose }) => {
  const [position, setPosition] = useState<{top: string | number, left: string | number}>(() => ({ top: pos.top, left: pos.left }));
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{x: number, y: number} | null>(null);
  const startPos = useRef<{top: number, left: number} | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
      setPosition({ top: pos.top, left: pos.left });
  }, [pos]);

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      
      e.preventDefault(); 
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      
      if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          dragStart.current = { x: clientX, y: clientY };
          startPos.current = { top: rect.top, left: rect.left };
          setIsDragging(true);
      }
  };

  useEffect(() => {
      const onMove = (e: MouseEvent | TouchEvent) => {
          if (!isDragging || !dragStart.current || !startPos.current) return;
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
          
          const deltaX = clientX - dragStart.current.x;
          const deltaY = clientY - dragStart.current.y;
          
          setPosition({
              top: startPos.current.top + deltaY,
              left: startPos.current.left + deltaX
          });
      };

      const onUp = () => {
          setIsDragging(false);
          dragStart.current = null;
          startPos.current = null;
      };

      if (isDragging) {
          window.addEventListener('mousemove', onMove);
          window.addEventListener('touchmove', onMove, { passive: false });
          window.addEventListener('mouseup', onUp);
          window.addEventListener('touchend', onUp);
      }
      return () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('touchend', onUp);
      };
  }, [isDragging]);

  if (!video) return null;

  return (
    <div 
      ref={ref}
      className={`fixed z-[9000] w-72 p-3 rounded-2xl flex items-center gap-3 backdrop-blur-md transition-all duration-100 ease-out cursor-grab active:cursor-grabbing group select-none
        ${isDragging 
            ? 'bg-black/95 border-[3px] border-[#FFD700] shadow-[0_0_50px_rgba(255,215,0,0.6),inset_0_0_30px_rgba(255,215,0,0.2)] scale-105' 
            : 'bg-black/90 border-2 border-[#39ff14] shadow-[0_0_20px_rgba(57,255,20,0.4)]'
        }
      `}
      style={{ 
        top: position.top, 
        left: position.left, 
        animation: isDragging ? 'none' : 'float 6s ease-in-out infinite' 
      }}
      onMouseDown={onDown}
      onTouchStart={onDown}
      onClick={(e) => {
          if (!isDragging) onPlay();
      }}
    >
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-10px) scale(1.02); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {isDragging && (
          <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(45deg,transparent_45%,#FFD700_50%,transparent_55%)] bg-[length:200%_200%] animate-[shimmer_1s_linear_infinite] opacity-30"></div>
          </div>
      )}

      <button 
        onClick={(e) => { e.stopPropagation(); onClose(); sessionStorage.setItem('hadiqa_dismiss_resume', 'true'); }}
        className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-1.5 shadow-lg active:scale-90 z-20 hover:bg-red-500 border-2 border-white"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>

      <div className="w-20 h-28 shrink-0 rounded-lg overflow-hidden border border-white/20 relative">
        <SafeAutoPlayVideo 
          src={formatVideoSource(video)} 
          poster={video.poster_url}
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
        <div className="absolute bottom-1 right-1">
             <div className="w-2 h-2 bg-[#39ff14] rounded-full animate-pulse shadow-[0_0_5px_#39ff14]"></div>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden text-right">
        <span className={`text-[9px] font-black uppercase tracking-widest italic animate-pulse ${isDragging ? 'text-[#FFD700]' : 'text-[#39ff14]'}`}>
            {isDragging ? 'AI RECALIBRATING...' : 'لم تكمل المشاهدة!'}
        </span>
        <h3 className="text-xs font-black text-white line-clamp-2 leading-tight drop-shadow-md mt-1">{video.title}</h3>
        <div className="mt-2 flex items-center justify-end gap-1">
          <span className="text-[8px] text-gray-400">اضغط للاستكمال</span>
          <svg className={`w-3 h-3 ${isDragging ? 'text-[#FFD700]' : 'text-[#39ff14]'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ title: string, color: string }> = ({ title, color }) => (
  <div className="px-5 py-2 flex items-center gap-2.5">
    <div className={`w-1.5 h-3.5 ${color} rounded-full shadow-[0_0_12px_currentColor]`}></div>
    <h2 className="text-[11px] font-black text-white italic uppercase tracking-[0.15em] drop-shadow-md">{title}</h2>
  </div>
);

const MainContent: React.FC<any> = ({ 
  videos, categoriesList, interactions, onPlayShort, onPlayLong, onCategoryClick, onHardRefresh, onOfflineClick, loading, isOverlayActive, downloadProgress, syncStatus, onLike
}) => {
  const [pullOffset, setPullOffset] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [resumeNotification, setResumeNotification] = useState<{video: Video, pos: {top: string, left: string, anim: string}} | null>(null);
  const [show3DModal, setShow3DModal] = useState(false);

  const [layoutSettings, setLayoutSettings] = useState<{ sections: any[], isLocked: boolean }>({ sections: [], isLocked: true });

  useEffect(() => {
    const fetchLayout = async () => {
        try {
            await ensureAuth();
            const docRef = doc(db, "Settings", "HomeLayout");
            const snapshot = await getDoc(docRef);
            if (snapshot.exists()) {
                const data = snapshot.data();
                setLayoutSettings({ 
                    sections: data.sections || [], 
                    isLocked: data.isLocked !== undefined ? data.isLocked : true 
                });
            }
        } catch (e) {}
    };
    fetchLayout();
  }, []);

  const safeVideos = useMemo(() => videos || [], [videos]);
  const shortsOnly = useMemo(() => safeVideos.filter((v: any) => v && v.video_type === 'Shorts'), [safeVideos]);
  const longsOnly = useMemo(() => safeVideos.filter((v: any) => v && v.video_type === 'Long Video'), [safeVideos]);

  // SMART PLAY FUNCTION: Automatically routes to correct player based on video type
  const handleSmartPlay = useCallback((video: Video) => {
      if (!video) return;
      if (video.video_type === 'Shorts') {
          onPlayShort(video, shortsOnly);
      } else {
          onPlayLong(video);
      }
  }, [onPlayShort, onPlayLong, shortsOnly]);

  const { 
    marqueeShorts1, marqueeLongs1, 
    gridShorts1, gridShorts2, 
    stackLongs1, 
    marqueeShorts2, marqueeLongs2, 
    gridShorts3, gridShorts4, 
    stackLongs2, 
    marqueeShorts3, marqueeLongs3,
    marqueeLongs4
  } = useMemo(() => {
     const usedIds = new Set<string>();
     
     const getUniqueBatch = (source: Video[], count: number): Video[] => {
        let available = source.filter(v => !usedIds.has(v.id));
        if (available.length < count) {
            const leftovers = available;
            const recyclePool = source.filter(v => !leftovers.includes(v));
            const shuffledRecycle = [...recyclePool].sort(() => 0.5 - Math.random());
            available = [...leftovers, ...shuffledRecycle];
        }
        const selected = available.slice(0, count);
        selected.forEach(v => usedIds.add(v.id));
        return selected;
     };

     const ms1 = getUniqueBatch(shortsOnly, 12);
     const ml1 = getUniqueBatch(longsOnly, 8);
     const gs1 = getUniqueBatch(shortsOnly, 2);
     const gs2 = getUniqueBatch(shortsOnly, 2);
     const sl1 = getUniqueBatch(longsOnly, 4);
     const ms2 = getUniqueBatch(shortsOnly, 12);
     const ml2 = getUniqueBatch(longsOnly, 8);
     const gs3 = getUniqueBatch(shortsOnly, 2);
     const gs4 = getUniqueBatch(shortsOnly, 2);
     const sl2 = getUniqueBatch(longsOnly, 4);
     const ms3 = getUniqueBatch(shortsOnly, 12);
     const ml3 = getUniqueBatch(longsOnly, 8);
     const ml4 = getUniqueBatch(longsOnly, 8); // NEW BATCH

     return {
        marqueeShorts1: ms1,
        marqueeLongs1: ml1,
        gridShorts1: gs1,
        gridShorts2: gs2,
        stackLongs1: sl1,
        marqueeShorts2: ms2,
        marqueeLongs2: ml2,
        gridShorts3: gs3,
        gridShorts4: gs4,
        stackLongs2: sl2,
        marqueeShorts3: ms3,
        marqueeLongs3: ml3,
        marqueeLongs4: ml4
     };
  }, [shortsOnly, longsOnly]);

  const unfinishedVideos = useMemo(() => {
    if (!interactions?.watchHistory) return [];
    return interactions.watchHistory
      .filter((h: any) => h.progress > 0.05 && h.progress < 0.95)
      .map((h: any) => safeVideos.find((vid: any) => vid && (vid.id === h.id)))
      .filter((v: any) => v !== undefined && v !== null && v.video_url).reverse();
  }, [interactions?.watchHistory, safeVideos]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return safeVideos.filter((v: any) => 
      v && v.video_url && (v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.category.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 15);
  }, [searchQuery, safeVideos]);

  const getRandomPosition = () => {
    const top = Math.floor(Math.random() * 60) + 15 + '%'; 
    const left = Math.floor(Math.random() * 40) + 5 + '%'; 
    const animations = ['translate(100px, 0)', 'translate(-100px, 0)', 'translate(0, 100px)', 'translate(0, -100px)', 'scale(0.5)'];
    const anim = animations[Math.floor(Math.random() * animations.length)];
    return { top, left, anim };
  };

  useEffect(() => {
    if (isOverlayActive) return;
    if (sessionStorage.getItem('hadiqa_dismiss_resume') === 'true') return;
    const interval = setInterval(() => {
      if (sessionStorage.getItem('hadiqa_dismiss_resume') === 'true') return;
      if (unfinishedVideos.length > 0) {
        const randomVideo = unfinishedVideos[Math.floor(Math.random() * unfinishedVideos.length)];
        setResumeNotification({
            video: randomVideo,
            pos: getRandomPosition()
        });
      }
    }, 30000); 
    return () => clearInterval(interval);
  }, [unfinishedVideos, isOverlayActive]);

  const isActuallyRefreshing = loading || pullOffset > 30;

  // Reduced padding bottom to 0 to let the spacer control the final height precisely
  return (
    <div 
      onTouchStart={(e) => window.scrollY === 0 && setStartY(e.touches[0].pageY)}
      onTouchMove={(e) => { if (startY === 0) return; const diff = e.touches[0].pageY - startY; if (diff > 0 && diff < 150) setPullOffset(diff); }}
      onTouchEnd={() => { if (pullOffset > 80) onHardRefresh(); setPullOffset(0); setStartY(0); }}
      className="flex flex-col pb-0 w-full bg-black min-h-screen relative"
      style={{ transform: `translateY(${pullOffset / 2}px)` }} dir="rtl"
    >
      <style>{`
        @keyframes spin3D { 0% { transform: perspective(400px) rotateY(0deg); } 100% { transform: perspective(400px) rotateY(360deg); } }
        .animate-spin-3d { animation: spin3D 3s linear infinite; }
      `}</style>
      
      <header className="flex items-center justify-between py-1 bg-black relative px-4 border-b border-white/5 shadow-lg h-12">
        <div className="flex items-center gap-2" onClick={onHardRefresh}>
          <div className="relative group w-8 h-8">
             <div className="absolute inset-0 bg-red-600/30 rounded-full blur-md animate-pulse"></div>
             <Logo className={`w-full h-full rounded-full border-2 transition-all duration-500 object-cover relative z-10 ${isActuallyRefreshing ? 'border-yellow-400 shadow-[0_0_20px_#facc15]' : 'border-red-600 shadow-[0_0_10px_red]'}`} />
          </div>
          {isActuallyRefreshing ? (
             <div className="flex items-center gap-2">
                 <h1 className="text-sm font-black italic text-red-600">الحديقة المرعبة</h1>
                 <div className="px-2 py-0.5 border border-yellow-400 rounded-lg bg-yellow-400/10 shadow-[0_0_10px_#facc15] animate-pulse">
                     <span className="text-[10px] font-black text-blue-400">تحديث</span>
                 </div>
             </div>
          ) : (
             <h1 className="text-sm font-black italic text-red-600 transition-colors duration-500">الحديقة المرعبة</h1>
          )}
        </div>
        <div className="flex items-center gap-3 -translate-x-2">
          {syncStatus && (
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-black text-cyan-400 animate-pulse">مزامنة {syncStatus.current}/{syncStatus.total}</span>
              <div className="w-12 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-cyan-400" style={{ width: `${(syncStatus.current / syncStatus.total) * 100}%` }}></div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
             <button onClick={() => setShow3DModal(true)} className="p-2 bg-white/5 border border-cyan-500/50 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.3)] active:scale-90 transition-all group relative overflow-hidden w-9 h-9 flex items-center justify-center">
                <div className="absolute inset-0 bg-cyan-400/10 animate-pulse"></div>
                <span className="block font-black text-[10px] text-cyan-400 animate-spin-3d drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]">3D</span>
             </button>
          </div>
          <button onClick={() => setIsSearchOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/20 text-white shadow-lg active:scale-90 transition-all hover:border-red-600 hover:text-red-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
          <button onClick={onOfflineClick} className="p-1 transition-all active:scale-90 relative group">
            <JoyfulNeonLion isDownloading={downloadProgress !== null} hasDownloads={interactions?.downloadedIds?.length > 0} />
          </button>
        </div>
      </header>

      <nav className="nav-container nav-mask relative h-10 bg-black/95 backdrop-blur-2xl z-[100] border-b border-white/10 sticky top-16 overflow-x-auto scrollbar-hide flex items-center">
        <div className="animate-marquee-train flex items-center gap-4 px-10">
          {[...(categoriesList || []), ...(categoriesList || [])].map((cat, idx) => (
            <button key={`${cat}-${idx}`} onClick={() => onCategoryClick(cat)} className="neon-white-led shrink-0 px-4 py-1 rounded-full text-[9px] font-black text-white italic whitespace-nowrap">{cat}</button>
          ))}
        </div>
      </nav>

      {syncStatus && (
        <div className="px-5 py-2 bg-cyan-950/20 border-y border-cyan-900/30 flex items-center justify-between">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping"></div>
             <span className="text-[8px] font-black text-cyan-400 italic">جاري تحميل المحتوى للخزنة...</span>
           </div>
           <span className="text-[9px] font-black text-white/60">{Math.round((syncStatus.current/syncStatus.total)*100)}%</span>
        </div>
      )}

      {layoutSettings.isLocked ? (
        <>
            {marqueeShorts1.length > 0 && <InteractiveMarquee videos={marqueeShorts1} onPlay={(v) => handleSmartPlay(v)} isShorts={true} direction="left-to-right" interactions={interactions} transparent={false} onLike={onLike} speedLevel="fast" />}
            
            {/* Removed the negative margin div and ensures clear spacing */}
            {marqueeLongs1.length > 0 && <InteractiveMarquee videos={marqueeLongs1} onPlay={(v) => handleSmartPlay(v)} direction="right-to-left" interactions={interactions} transparent={false} onLike={onLike} speedLevel="fast" />}

            {gridShorts1.length > 0 && (
                <>
                <SectionHeader title="أهوال قصيرة (مختارة)" color="bg-yellow-500" />
                <div className="px-4 grid grid-cols-2 gap-3.5 mb-6">
                    {gridShorts1.map((v: any) => v && (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className="aspect-[9/16] animate-in fade-in duration-500">
                        <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} onCategoryClick={onCategoryClick} />
                    </div>
                    ))}
                </div>
                </>
            )}

            {gridShorts2.length > 0 && (
                <div className="px-4 grid grid-cols-2 gap-3.5 mb-6">
                    {gridShorts2.map((v: any) => v && (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className="aspect-[9/16] animate-in fade-in duration-500">
                        <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} onCategoryClick={onCategoryClick} />
                    </div>
                    ))}
                </div>
            )}

            {stackLongs1.length > 0 && (
                <>
                <SectionHeader title="حكايات مرعبة (كاملة)" color="bg-red-600" />
                <div className="px-4 space-y-4 mb-6">
                    {stackLongs1.map((v: any) => v && (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className="aspect-video w-full animate-in zoom-in-95 duration-500">
                        <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} onCategoryClick={onCategoryClick} />
                    </div>
                    ))}
                </div>
                </>
            )}

            {marqueeShorts2.length > 0 && (
                <>
                <SectionHeader title="ومضات من الجحيم" color="bg-orange-500" />
                <InteractiveMarquee videos={marqueeShorts2} onPlay={(v) => handleSmartPlay(v)} isShorts={true} direction="left-to-right" interactions={interactions} onLike={onLike} speedLevel="fast" />
                </>
            )}

            {marqueeLongs2.length > 0 && (
                <>
                <SectionHeader title="أرشيف الخزنة" color="bg-emerald-500" />
                <InteractiveMarquee videos={marqueeLongs2} onPlay={(v) => handleSmartPlay(v)} direction="right-to-left" interactions={interactions} onLike={onLike} speedLevel="fast" />
                </>
            )}

            {gridShorts3.length > 0 && (
                <>
                <SectionHeader title="ظلال متحركة" color="bg-purple-500" />
                <div className="px-4 grid grid-cols-2 gap-3.5 mb-6">
                    {gridShorts3.map((v: any) => v && (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className="aspect-[9/16] animate-in fade-in duration-500">
                        <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} onCategoryClick={onCategoryClick} />
                    </div>
                    ))}
                </div>
                </>
            )}

            {gridShorts4.length > 0 && (
                <div className="px-4 grid grid-cols-2 gap-3.5 mb-6">
                    {gridShorts4.map((v: any) => v && (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className="aspect-[9/16] animate-in fade-in duration-500">
                        <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} onCategoryClick={onCategoryClick} />
                    </div>
                    ))}
                </div>
            )}

            {stackLongs2.length > 0 && (
                <>
                <SectionHeader title="ملفات سرية" color="bg-blue-600" />
                <div className="px-4 space-y-4 mb-6">
                    {stackLongs2.map((v: any) => v && (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className="aspect-video w-full animate-in zoom-in-95 duration-500">
                        <VideoCardThumbnail video={v} interactions={interactions} isOverlayActive={isOverlayActive} onLike={onLike} onCategoryClick={onCategoryClick} />
                    </div>
                    ))}
                </div>
                </>
            )}

            {marqueeShorts3.length > 0 && (
                <>
                <SectionHeader title="النهاية تقترب" color="bg-pink-600" />
                <InteractiveMarquee videos={marqueeShorts3} onPlay={(v) => handleSmartPlay(v)} isShorts={true} direction="left-to-right" interactions={interactions} onLike={onLike} speedLevel="fast" />
                </>
            )}

            {marqueeLongs3.length > 0 && (
                <>
                <SectionHeader title="الخروج من القبو" color="bg-white" />
                <InteractiveMarquee videos={marqueeLongs3} onPlay={(v) => handleSmartPlay(v)} direction="right-to-left" interactions={interactions} onLike={onLike} speedLevel="fast" />
                </>
            )}

            {/* NEW ADDITION: Long Video Marquee (Left to Right) */}
            {marqueeLongs4.length > 0 && (
                <>
                <SectionHeader title="نهاية الرحلة" color="bg-gray-500" />
                <InteractiveMarquee 
                    videos={marqueeLongs4} 
                    onPlay={(v) => handleSmartPlay(v)} 
                    direction="left-to-right" 
                    interactions={interactions} 
                    onLike={onLike} 
                    speedLevel="fast" 
                />
                </>
            )}
        </>
      ) : (
        <CustomDynamicLayout 
            sections={layoutSettings.sections}
            videos={safeVideos}
            interactions={interactions}
            onPlayShort={onPlayShort}
            onPlayLong={onPlayLong}
            onCategoryClick={onCategoryClick}
            onLike={onLike}
            isOverlayActive={isOverlayActive}
        />
      )}

      {/* Banner Ad Spacer - EXACT 50px - Closes page content */}
      <div className="w-full h-[50px] bg-transparent mt-4 pointer-events-none"></div>

      {resumeNotification && (
        <ResumeNotificationFull 
          video={resumeNotification.video}
          pos={resumeNotification.pos} 
          onPlay={() => handleSmartPlay(resumeNotification.video)}
          onClose={() => setResumeNotification(null)}
        />
      )}

      {show3DModal && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-36 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShow3DModal(false)}>
          <div className="bg-neutral-900/90 border border-cyan-500/50 p-8 rounded-[2rem] shadow-[0_0_50px_rgba(34,211,238,0.3)] text-center transform scale-100 relative overflow-hidden max-w-xs mx-4" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent animate-pulse"></div>
            <h2 className="text-3xl font-black text-white mb-2 italic drop-shadow-lg">تقنية 3D</h2>
            <p className="text-cyan-400 font-bold text-lg animate-pulse">قريباً جداً...</p>
            <div className="mt-6 flex justify-center">
               <div className="w-16 h-16 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin shadow-[0_0_20px_#22d3ee]"></div>
            </div>
            <button onClick={() => setShow3DModal(false)} className="mt-8 bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-sm font-bold text-white transition-colors border border-white/10">إغلاق</button>
          </div>
        </div>
      )}

      {isSearchOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex items-center gap-4 border-b-2 border-white/10 bg-black">
            <button onClick={() => setIsSearchOpen(false)} className="p-3.5 text-red-600 border-2 border-red-600 rounded-2xl shadow-[0_0_20px_red] active:scale-75 transition-all bg-red-600/10">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <input 
              autoFocus
              type="text" 
              placeholder="ابحث في أرشيف الحديقة..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-white/5 border-2 border-white/10 rounded-2xl py-4.5 px-7 text-white text-base outline-none focus:border-red-600 transition-all font-black text-right shadow-inner"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {searchResults.length > 0 ? searchResults.map((v: any) => v && v.video_url && (
              <div key={v.id} onClick={() => { setIsSearchOpen(false); handleSmartPlay(v); }} className={`flex gap-4.5 p-4 bg-white/5 rounded-3xl border-2 active:scale-95 transition-all shadow-xl group ${getNeonColor(v.id)}`}>
                <div className="w-28 h-18 bg-black rounded-2xl overflow-hidden shrink-0 border-2 border-white/10 shadow-lg">
                  <video src={formatVideoSource(v)} poster={v.poster_url} crossOrigin="anonymous" preload="metadata" className="w-full h-full object-cover opacity-100 contrast-110 saturate-125 transition-opacity" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <div className="flex flex-col justify-center flex-1">
                  <h3 className="text-sm font-black text-white italic line-clamp-1 text-right">{v.title}</h3>
                  <span className="text-[9px] text-red-500 font-black uppercase mt-1.5 text-right italic tracking-widest bg-red-600/10 self-end px-2 py-0.5 rounded-md border border-red-600/20">{v.category}</span>
                </div>
              </div>
            )) : searchQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-24 opacity-30 gap-5 text-center">
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <p className="font-black italic text-lg">لا توجد نتائج لهذا الكابوس..</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MainContent;