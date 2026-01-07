
import React, { useRef, useEffect } from 'react';
import { Video } from './types';

interface SavedPageProps {
  savedIds: string[];
  savedCategories: string[];
  allVideos: Video[];
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  onCategoryClick: (cat: string) => void;
  title?: string;
}

const LiveThumbnail: React.FC<{ url: string, isShort: boolean }> = ({ url, isShort }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { 
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
    const handleTimeUpdate = () => { if (v.currentTime >= 5) v.currentTime = 0; };
    v.addEventListener('timeupdate', handleTimeUpdate);
    return () => { v.removeEventListener('timeupdate', handleTimeUpdate); v.pause(); };
  }, [url]);

  return (
    <video 
      ref={videoRef} src={url} muted loop playsInline autoPlay preload="auto"
      className={`w-full h-full object-cover transition-transform group-hover:scale-105 relative z-10 ${isShort ? 'aspect-[9/16]' : 'aspect-video'}`} 
    />
  );
};

const SavedPage: React.FC<SavedPageProps> = ({ savedIds, savedCategories, allVideos, onPlayShort, onPlayLong, onCategoryClick, title = "المحفوظات" }) => {
  const isLikes = title === "الإعجابات";
  const savedVideos = allVideos.filter(v => savedIds.includes(v.id || v.video_url));

  return (
    <div className="flex flex-col gap-8 pb-32">
      <div className={`relative p-6 rounded-3xl overflow-hidden border shadow-2xl ${isLikes ? 'border-red-600/30 bg-red-600/5' : 'border-blue-600/30 bg-blue-600/5'}`}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
        <div className="relative flex items-center justify-between">
           <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-widest text-red-500 uppercase opacity-60">Database Retrieval</span>
              <h1 className="text-3xl font-black italic">{title}</h1>
           </div>
           <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${isLikes ? 'border-red-600 text-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]' : 'border-blue-600 text-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]'}`}>
              {isLikes ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
              )}
           </div>
        </div>
      </div>

      {/* عرض الأقسام المحفوظة */}
      {savedCategories.length > 0 && (
        <section className="px-2">
          <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 px-2 italic">الأقسام المحفوظة</h2>
          <div className="flex flex-wrap gap-2">
            {savedCategories.map(cat => (
              <button 
                key={cat}
                onClick={() => onCategoryClick(cat)}
                className="bg-neutral-900 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 hover:border-red-600/50 transition-all active:scale-95 group shadow-sm"
              >
                <span className="w-1.5 h-1.5 bg-red-600 rounded-full group-hover:animate-ping"></span>
                <span className="text-xs font-black text-white/90 italic">{cat}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* عرض الفيديوهات المحفوظة */}
      {savedVideos.length > 0 ? (
        <section className="px-2">
          <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 px-2 italic">الفيديوهات المؤرشفة</h2>
          <div className="grid grid-cols-2 gap-4">
            {savedVideos.map((video) => (
              <div 
                key={video.id || video.video_url}
                onClick={() => video.type === 'short' ? onPlayShort(video, savedVideos.filter(v => v.type === 'short')) : onPlayLong(video)}
                className="flex flex-col gap-2 cursor-pointer group"
              >
                <div className={`relative rounded-3xl overflow-hidden border border-white/10 shadow-lg ${video.type === 'short' ? 'aspect-[9/16]' : 'aspect-video'}`}>
                  <LiveThumbnail url={video.video_url} isShort={video.type === 'short'} />
                  <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-white font-black border border-white/10 z-20">
                    {video.type === 'short' ? 'SHORT' : 'LIVE'}
                  </div>
                </div>
                <p className="text-[10px] font-bold line-clamp-1 px-1">{video.title}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center pt-20 text-center gap-6 opacity-30">
          <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center">
             <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M12 4v16m8-8H4"/></svg>
          </div>
          <p className="text-sm font-bold">لا يوجد محتوى محفوظ حالياً</p>
        </div>
      )}
    </div>
  );
};

export default SavedPage;
