
import React, { useMemo } from 'react';
import { Video } from './types';
import { getDeterministicStats, formatBigNumber } from './MainContent';

interface TrendPageProps {
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  excludedIds: string[];
  allVideos: Video[];
}

const TrendPage: React.FC<TrendPageProps> = ({ onPlayShort, onPlayLong, excludedIds, allVideos }) => {
  const trendVideos = useMemo(() => {
    // Filter out excluded videos AND strictly check for is_trending
    return allVideos.filter(v => v.is_trending && !excludedIds.includes(v.id));
  }, [allVideos, excludedIds]);

  return (
    <div className="flex flex-col gap-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500" dir="rtl">
      <div className="p-6 rounded-[2.5rem] bg-red-600/10 border border-red-600/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-red-600/20 blur-3xl rounded-full animate-pulse"></div>
        
        <div className="relative text-right pr-2 z-10">
          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest opacity-60">Global Analytics</span>
          <h1 className="text-3xl font-black italic text-white drop-shadow-lg">الأكثر رعباً (الترند)</h1>
          <p className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-tighter">
             {trendVideos.length} كوابيس متداولة حالياً
          </p>
        </div>
      </div>

      {trendVideos.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 px-2">
            {trendVideos.map((video, idx) => {
            if (!video || !video.video_url) return null;
            const stats = getDeterministicStats(video.video_url);

            return (
                <div 
                key={video.id} 
                onClick={() => video.video_type === 'Shorts' ? onPlayShort(video, trendVideos.filter(v => v.video_type === 'Shorts')) : onPlayLong(video)}
                className="flex flex-col gap-2 group cursor-pointer active:scale-95 transition-transform relative"
                >
                {/* Reduced border opacity and removed shadow here to fix high glow */}
                <div className={`relative rounded-3xl overflow-hidden border border-white/5 bg-neutral-900 ${video.video_type === 'Shorts' ? 'aspect-[9/16]' : 'aspect-video'} border-red-600/30`}>
                    <video 
                    src={video.video_url} 
                    muted autoPlay loop playsInline 
                    crossOrigin="anonymous" 
                    preload="metadata" 
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" 
                    />
                    
                    <div className="absolute top-3 left-3 bg-red-600 text-[8px] font-black text-white px-2 py-0.5 rounded shadow-sm animate-pulse z-20 border border-white/20">
                        TREND #{idx + 1}
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    
                    <div className="absolute bottom-3 right-3 left-3 flex flex-col items-end">
                    <p className="text-[9px] font-black text-white line-clamp-1 italic text-right leading-tight">{video.title}</p>
                    <div className="flex items-center gap-2 mt-1 opacity-70">
                        <span className="text-[8px] text-gray-400 font-mono">{formatBigNumber(stats.views)}</span>
                        <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </div>
                    </div>
                </div>
                </div>
            );
            })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 opacity-40 gap-4">
            <svg className="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
            <p className="text-sm font-bold text-gray-500">لا توجد كوابيس رائجة حالياً</p>
        </div>
      )}
    </div>
  );
};

export default TrendPage;
