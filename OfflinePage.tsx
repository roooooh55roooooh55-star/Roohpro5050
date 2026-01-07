
import React, { useMemo, useState } from 'react';
import { Video, UserInteractions } from './types';
import { removeVideoFromCache } from './offlineManager';

interface OfflinePageProps {
  allVideos: Video[];
  interactions: UserInteractions;
  onPlayShort: (v: Video, list: Video[]) => void;
  onPlayLong: (v: Video) => void;
  onBack: () => void;
  onUpdateInteractions: (p: (prev: UserInteractions) => UserInteractions) => void;
}

const OfflinePage: React.FC<OfflinePageProps> = ({ 
  allVideos, interactions, onPlayShort, onPlayLong, onBack, onUpdateInteractions 
}) => {
  // State for handling the deletion confirmation popup
  const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);

  // 1. Get downloaded videos based on IDs
  // 2. Reverse the array to show NEWEST downloads at the TOP
  const downloadedVideos = useMemo(() => {
    const ids = interactions.downloadedIds || [];
    // Create a reversed copy of IDs to map newest first
    const reversedIds = [...ids].reverse();
    
    return reversedIds
      .map(id => allVideos.find(v => v.id === id))
      .filter((v): v is Video => !!v); // Filter out undefined
  }, [allVideos, interactions.downloadedIds]);

  // Split into separate lists
  const shortsList = downloadedVideos.filter(v => v.video_type === 'Shorts');
  const longList = downloadedVideos.filter(v => v.video_type === 'Long Video');

  const handleDeleteClick = (e: React.MouseEvent, video: Video) => {
    e.stopPropagation();
    setVideoToDelete(video);
  };

  const confirmDelete = async () => {
    if (videoToDelete) {
      await removeVideoFromCache(videoToDelete.video_url);
      onUpdateInteractions(prev => ({
        ...prev,
        downloadedIds: prev.downloadedIds.filter(id => id !== videoToDelete.id)
      }));
      setVideoToDelete(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-40 animate-in fade-in duration-500" dir="rtl">
      <header className="p-6 rounded-[2.5rem] bg-neutral-900 border border-white/5 shadow-2xl flex items-center justify-between">
        <div>
           <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Storage Partition</span>
           <h1 className="text-3xl font-black italic text-white">خزنة الرعب</h1>
           <p className="text-[8px] text-gray-500 mt-1 uppercase font-bold tracking-tighter">
             {downloadedVideos.length} فيديوهات مؤرشفة (الأحدث في الأعلى)
           </p>
        </div>
        <button onClick={onBack} className="p-3 bg-black/40 border border-white/20 rounded-2xl text-white active:scale-75 transition-transform">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
      </header>

      {downloadedVideos.length > 0 ? (
        <div className="flex flex-col gap-10">
          
          {/* SECTION 1: SHORTS */}
          {shortsList.length > 0 && (
            <section className="px-2">
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-1.5 h-3.5 bg-yellow-500 rounded-full shadow-[0_0_12px_#facc15]"></div>
                <h2 className="text-[12px] font-black text-white italic uppercase tracking-wider">المقاطع القصيرة (Shorts)</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {shortsList.map((video) => (
                  <div 
                    key={video.id} 
                    onClick={() => onPlayShort(video, shortsList)}
                    className="flex flex-col gap-2 group cursor-pointer active:scale-95 transition-transform relative"
                  >
                    <div className="relative rounded-3xl overflow-hidden border border-white/5 bg-neutral-900 aspect-[9/16]">
                      <video src={video.video_url} muted autoPlay loop playsInline className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                      
                      <button 
                        onClick={(e) => handleDeleteClick(e, video)}
                        className="absolute top-2 left-2 p-2 bg-red-600/80 rounded-xl text-white border border-red-400 z-30 shadow-[0_0_10px_red] active:scale-90"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>

                      <div className="absolute bottom-3 right-3 left-3">
                         <p className="text-[9px] font-black text-white line-clamp-2 italic text-right leading-tight">{video.title}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SECTION 2: LONG VIDEOS */}
          {longList.length > 0 && (
            <section className="px-2">
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-1.5 h-3.5 bg-cyan-500 rounded-full shadow-[0_0_12px_#22d3ee]"></div>
                <h2 className="text-[12px] font-black text-white italic uppercase tracking-wider">فيديوهات طويلة (Full Episodes)</h2>
              </div>
              <div className="flex flex-col gap-4">
                {longList.map((video) => (
                  <div 
                    key={video.id} 
                    onClick={() => onPlayLong(video)}
                    className="flex flex-col gap-2 group cursor-pointer active:scale-95 transition-transform relative"
                  >
                    <div className="relative rounded-3xl overflow-hidden border border-white/5 bg-neutral-900 aspect-video">
                      <video src={video.video_url} muted autoPlay loop playsInline className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                      
                      <button 
                        onClick={(e) => handleDeleteClick(e, video)}
                        className="absolute top-2 left-2 p-2 bg-red-600/80 rounded-xl text-white border border-red-400 z-30 shadow-[0_0_10px_red] active:scale-90"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>

                      <div className="absolute bottom-3 right-3 left-3">
                         <p className="text-[11px] font-black text-white line-clamp-1 italic text-right leading-tight">{video.title}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 opacity-30 gap-6">
          <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
          <p className="font-black italic">خزنتك فارغة من الأرواح..</p>
        </div>
      )}

      {/* Custom Deletion Confirmation Modal */}
      {videoToDelete && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
          <div className="bg-neutral-900 border border-red-600/30 p-8 rounded-[2.5rem] w-full max-w-sm text-center shadow-[0_0_50px_rgba(220,38,38,0.2)] animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-white mb-2">تأكيد المسح</h3>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">هل تريد حذف هذا الفيديو نهائياً من الخزنة؟</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={confirmDelete}
                className="w-full bg-red-600 p-4 rounded-2xl text-white font-bold shadow-[0_0_20px_red] active:scale-95 transition-all"
              >
                نعم، امسح 
              </button>
              <button 
                onClick={() => setVideoToDelete(null)}
                className="w-full bg-white/5 p-4 rounded-2xl text-white font-bold border border-white/10 active:scale-95 transition-all"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflinePage;
