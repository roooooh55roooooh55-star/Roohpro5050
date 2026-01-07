import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Video } from './types';
import { incrementViewsInDB } from './supabaseClient';
import { getDeterministicStats, formatBigNumber, InteractiveMarquee, NeonTrendBadge } from './MainContent';
import { playNarrative, stopCurrentNarrative } from './elevenLabsManager';
import { Logo } from './Logo';

interface LongPlayerOverlayProps {
  video: Video;
  allLongVideos: Video[];
  onClose: () => void;
  onLike: () => void;
  onDislike: () => void;
  onSave: () => void;
  onSwitchVideo: (v: Video) => void;
  onCategoryClick: (cat: string) => void;
  onDownload: () => void;
  isLiked: boolean;
  isDisliked: boolean;
  isSaved: boolean;
  isDownloaded: boolean;
  isGlobalDownloading: boolean;
  onProgress: (p: number) => void;
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
          style={{ top: '15%', left: '5%' }} // Initial position
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

const NARRATIVE_STYLES = [
    { border: 'border-red-500', shadow: 'shadow-[0_0_20px_#ef4444]', dot: 'bg-red-500', text: 'text-white' },
    { border: 'border-cyan-400', shadow: 'shadow-[0_0_20px_#22d3ee]', dot: 'bg-cyan-400', text: 'text-cyan-50' },
    { border: 'border-purple-500', shadow: 'shadow-[0_0_20px_#a855f7]', dot: 'bg-purple-500', text: 'text-purple-50' },
    { border: 'border-yellow-400', shadow: 'shadow-[0_0_20px_#facc15]', dot: 'bg-yellow-400', text: 'text-yellow-50' },
    { border: 'border-emerald-500', shadow: 'shadow-[0_0_20px_#10b981]', dot: 'bg-emerald-500', text: 'text-emerald-50' },
    { border: 'border-pink-500', shadow: 'shadow-[0_0_20px_#ec4899]', dot: 'bg-pink-500', text: 'text-pink-50' },
];

const DynamicCaptions: React.FC<{ text: string, isActive: boolean }> = ({ text, isActive }) => {
    const [currentChunk, setCurrentChunk] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const [currentStyle, setCurrentStyle] = useState(NARRATIVE_STYLES[0]);
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
  
      chunkIndex.current = 0;
      
      const showNextChunk = () => {
        if (chunkIndex.current >= chunks.length) {
          setIsVisible(false);
          return;
        }
  
        const randomStyle = NARRATIVE_STYLES[Math.floor(Math.random() * NARRATIVE_STYLES.length)];
        setCurrentStyle(randomStyle);

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
    }, [chunks, isActive]);
  
    if (chunks.length === 0) return null;
  
    return (
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-[100] w-full max-w-[90%] pointer-events-none flex flex-col items-center justify-center text-center">
        <div 
          className={`transition-all duration-500 ease-in-out transform ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
        >
           <div className={`bg-black/60 backdrop-blur-md border px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-colors duration-300 ${currentStyle.border} ${currentStyle.shadow}`}>
             <div className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_10px_currentColor] ${currentStyle.dot}`}></div>
             <span className={`text-sm md:text-base font-bold italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-relaxed tracking-wide ${currentStyle.text}`}>
                {currentChunk}
             </span>
           </div>
        </div>
      </div>
    );
};

const LongPlayerOverlay: React.FC<LongPlayerOverlayProps> = ({ 
  video, allLongVideos, onClose, onLike, onDislike, onSave, onSwitchVideo, onCategoryClick, onDownload, isLiked, isDisliked, isSaved, isDownloaded, isGlobalDownloading, onProgress 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<any>(null