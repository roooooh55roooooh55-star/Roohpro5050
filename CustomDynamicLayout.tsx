import React, { useMemo } from 'react';
import { Video, UserInteractions } from './types';
import { InteractiveMarquee, VideoCardThumbnail, formatVideoSource, getNeonColor, SafeAutoPlayVideo } from './MainContent';

interface CustomDynamicLayoutProps {
  sections: any[];
  videos: Video[];
  interactions: UserInteractions;
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  onCategoryClick: (cat: string) => void;
  onLike: (id: string) => void;
  isOverlayActive: boolean;
}

const CustomDynamicLayout: React.FC<CustomDynamicLayoutProps> = ({ 
  sections, 
  videos, 
  interactions, 
  onPlayShort, 
  onPlayLong, 
  onCategoryClick,
  onLike,
  isOverlayActive
}) => {
  
  // Smart Play Handler inside CustomLayout
  const handleSmartPlay = (v: Video) => {
      if (!v) return;
      if (v.video_type === 'Shorts') {
          // Pass the FULL list of videos (MainContent will filter it or App.tsx already has the full shorts list)
          // But here we rely on the prop `videos` which contains ALL videos. 
          // However, MainContent usually ignores the second argument in `onPlayShort` prop implementation in App.tsx
          // so passing `videos` here is safe and correct.
          onPlayShort(v, videos); 
      } else {
          onPlayLong(v);
      }
  };

  const sectionContent = useMemo(() => {
      const result: Record<number, Video[]> = {};
      
      sections.forEach((section, idx) => {
          let count = 0;
          let type: 'Shorts' | 'Long Video' | 'Mixed' = 'Mixed';

          if (section.type === 'long_video') { count = 1; type = 'Long Video'; }
          else if (section.type === 'shorts_grid') { count = 4; type = 'Shorts'; }
          else if (section.type === 'slider_left' || section.type === 'slider_right') { count = 10; type = 'Mixed'; }
          else if (section.type === 'long_slider') { count = 10; type = 'Long Video'; }

          let filtered = videos;
          if (type !== 'Mixed') {
              filtered = videos.filter(v => v.video_type === type);
          }
          
          const shuffled = [...filtered].sort(() => 0.5 - Math.random());
          result[idx] = shuffled.slice(0, count);
      });

      return result;
  }, [videos, sections]);

  return (
    <div className="w-full flex flex-col p-2 pb-24 animate-in fade-in duration-700 min-h-screen">
      {sections.map((section, idx) => {
        const sectionVideos = sectionContent[idx] || [];

        return (
            <div 
            key={section.id || idx} 
            className="mx-auto overflow-visible rounded-3xl transition-all duration-500 relative z-10"
            style={{ 
                width: `${section.width}%`, 
                height: section.height ? `${section.height}px` : 'auto',
                minHeight: section.type.includes('slider') ? 'auto' : `${section.height}px`,
                marginTop: `${section.marginTop || 0}px`, 
                marginBottom: '20px' 
            }}
            >
            {/* --- LONG VIDEO BLOCK --- */}
            {section.type === 'long_video' && sectionVideos.length > 0 && (
                <div className="w-full h-full relative group">
                    <div key={sectionVideos[0].id} onClick={() => handleSmartPlay(sectionVideos[0])} className="w-full h-full cursor-pointer">
                        <VideoCardThumbnail 
                        video={sectionVideos[0]} 
                        interactions={interactions} 
                        isOverlayActive={isOverlayActive} 
                        onLike={onLike}
                        onCategoryClick={onCategoryClick}
                        />
                    </div>
                </div>
            )}

            {/* --- SHORTS GRID (2x2) --- */}
            {section.type === 'shorts_grid' && sectionVideos.length > 0 && (
                <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-2">
                {sectionVideos.map(v => {
                    const isLiked = interactions?.likedIds?.includes(v.id);
                    const neonStyle = getNeonColor(v.id);
                    return (
                    <div key={v.id} onClick={() => handleSmartPlay(v)} className={`rounded-xl overflow-hidden relative border-2 ${neonStyle} bg-transparent shadow-none cursor-pointer`}>
                        <SafeAutoPlayVideo 
                            src={formatVideoSource(v)} 
                            className="w-full h-full object-cover" 
                            muted 
                            loop 
                            playsInline 
                        />
                        
                        <div className="absolute top-1 right-1 z-20">
                            <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                onLike(v.id); 
                            }}
                            className={`p-1.5 rounded-lg backdrop-blur-md border transition-all active:scale-75 ${isLiked ? 'bg-red-600/60 border-red-500 text-white shadow-[0_0_10px_red]' : 'bg-black/40 border-white/20 text-gray-300 hover:text-white hover:border-white/50'}`}
                            >
                            <svg className="w-3 h-3" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                            </button>
                        </div>

                        <div className="absolute bottom-1 left-1 right-1 text-[8px] font-bold text-white truncate text-center drop-shadow-md">{v.title}</div>
                    </div>
                    );
                })}
                </div>
            )}

            {/* --- SLIDER LEFT TO RIGHT (SHORTS/MIXED) --- */}
            {section.type === 'slider_left' && sectionVideos.length > 0 && (
                <div className="w-full h-full flex flex-col justify-center py-2">
                {section.label && (
                    <div className="px-2 mb-1 flex items-center gap-2">
                        <div className="w-1.5 h-3 bg-emerald-500 rounded-full"></div>
                        <h3 className="text-[10px] font-black text-white">{section.label}</h3>
                    </div>
                )}
                <InteractiveMarquee 
                    videos={sectionVideos} 
                    onPlay={(v) => handleSmartPlay(v)} 
                    direction="left-to-right" 
                    interactions={interactions}
                    isShorts={true}
                    transparent={true} 
                    onLike={onLike}
                />
                </div>
            )}

            {/* --- SLIDER RIGHT TO LEFT (SHORTS/MIXED) --- */}
            {section.type === 'slider_right' && sectionVideos.length > 0 && (
                <div className="w-full h-full flex flex-col justify-center py-2">
                {section.label && (
                    <div className="px-2 mb-1 flex items-center gap-2">
                        <div className="w-1.5 h-3 bg-purple-500 rounded-full"></div>
                        <h3 className="text-[10px] font-black text-white">{section.label}</h3>
                    </div>
                )}
                <InteractiveMarquee 
                    videos={sectionVideos} 
                    onPlay={(v) => handleSmartPlay(v)} 
                    direction="right-to-left" 
                    interactions={interactions}
                    isShorts={true} 
                    transparent={true} 
                    onLike={onLike}
                />
                </div>
            )}

            {/* --- LONG VIDEO SLIDER --- */}
            {section.type === 'long_slider' && sectionVideos.length > 0 && (
                <div className="w-full h-full flex flex-col justify-center py-2">
                {section.label && (
                    <div className="px-2 mb-1 flex items-center gap-2">
                        <div className="w-1.5 h-3 bg-red-600 rounded-full"></div>
                        <h3 className="text-[10px] font-black text-white">{section.label}</h3>
                    </div>
                )}
                <InteractiveMarquee 
                    videos={sectionVideos} 
                    onPlay={(v) => handleSmartPlay(v)} 
                    direction="right-to-left" 
                    interactions={interactions}
                    isShorts={false} 
                    transparent={true} 
                    onLike={onLike}
                />
                </div>
            )}
            </div>
        );
      })}
    </div>
  );
};

export default CustomDynamicLayout;