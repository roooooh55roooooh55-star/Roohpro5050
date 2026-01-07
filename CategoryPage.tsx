
import React, { useMemo } from 'react';
import { Video } from './types';

interface CategoryPageProps {
  category: string;
  allVideos: Video[];
  isSaved: boolean;
  onToggleSave: () => void;
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  onBack: () => void;
}

// Updated NeonTrendBadge to match MainContent's style
const NeonTrendBadge = ({ isFeatured }: { isFeatured: boolean }) => {
  if (!isFeatured) return null;
  return (
    <div className="absolute top-3 right-3 z-30">
        <div className="relative p-[1.5px] rounded-lg overflow-hidden group">
            {/* Spinning Fire Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-red-600 via-orange-500 to-yellow-400 animate-spin-slow opacity-100"></div>
            
            {/* Inner Content - Black Background */}
            <div className="relative bg-black/90 backdrop-blur-xl rounded-md px-2 py-1 flex items-center gap-1.5 border border-white/5">
                {/* THE FLAME ICON (Exact Copy from AppBar) */}
                <svg className="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_8px_#ef4444]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.55,11.2C17.32,10.93 15.33,8.19 15.33,8.19C15.33,8.19 15.1,10.03 14.19,10.82C13.21,11.66 12,12.24 12,13.91C12,15.12 12.6,16.22 13.56,16.89C13.88,17.11 14.24,17.29 14.63,17.41C15.4,17.63 16.23,17.61 17,17.33C17.65,17.1 18.23,16.69 18.66,16.15C19.26,15.38 19.5,14.41 19.34,13.44C19.16,12.56 18.63,11.83 18.05,11.33C17.9,11.23 17.73,11.25 17.55,11.2M13,3C13,3 12,5 10,7C8.5,8.5 7,10 7,13C7,15.76 9.24,18 12,18C12,18 11.5,17.5 11,16.5C10.5,15.5 10,14.5 10,13.5C10,12.5 10.5,11.5 11.5,10.5C12.5,9.5 14,8 14,8C14,8 15,10 16,12C16.5,13 17,14 17,15C17,15.5 16.9,16 16.75,16.5C17.5,16 18,15.5 18,15C18,13 17,11.5 15,10C13.5,8.88 13,3 13,3Z"/>
                </svg>
                <span className="text-[9px] font-black text-white italic tracking-widest">TREND</span>
            </div>
        </div>
    </div>
  );
};

const CategoryPage: React.FC<CategoryPageProps> = ({ category, allVideos, isSaved, onToggleSave, onPlayShort, onPlayLong, onBack }) => {
  const catVideos = useMemo(() => allVideos.filter(v => v.category === category), [allVideos, category]);

  return (
    <div className="flex flex-col gap-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 rounded-[2.5rem] bg-red-600/10 border border-red-600/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-4 left-4 flex gap-2 z-10">
           <button onClick={onToggleSave} className={`p-2 rounded-full border transition-all active:scale-75 ${isSaved ? 'bg-yellow-500 border-yellow-400 text-white shadow-[0_0_15px_yellow]' : 'bg-black/40 border-white/20 text-white'}`}>
             {isSaved ? (
               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
             ) : (
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
             )}
           </button>
           <button onClick={onBack} className="p-2 bg-black/40 border border-white/20 rounded-full text-white active:scale-75 transition-transform">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
           </button>
        </div>
        
        <div className="relative text-right pr-2">
          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest opacity-60">مستودع الأقسام</span>
          <h1 className="text-3xl font-black italic text-white drop-shadow-lg">{category}</h1>
          <p className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-tighter">{catVideos.length} فيديوهات مؤرشفة تحت هذا الوسم</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-2">
        {catVideos.map((video) => {
          if (!video || !video.video_url) return null;
          return (
            <div 
              key={video.id} 
              onClick={() => video.video_type === 'Shorts' ? onPlayShort(video, catVideos.filter(v => v.video_type === 'Shorts')) : onPlayLong(video)}
              className="flex flex-col gap-2 group cursor-pointer active:scale-95 transition-transform relative"
            >
              <div className={`relative rounded-3xl overflow-hidden border border-white/5 bg-neutral-900 ${video.video_type === 'Shorts' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                <video 
                  src={video.video_url} 
                  muted autoPlay loop playsInline 
                  crossOrigin="anonymous" 
                  preload="metadata" 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" 
                />
                
                <NeonTrendBadge isFeatured={video.is_trending} />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                <div className="absolute bottom-3 right-3 left-3">
                   <p className="text-[9px] font-black text-white line-clamp-1 italic text-right leading-tight">{video.title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryPage;
