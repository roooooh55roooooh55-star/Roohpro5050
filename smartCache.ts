
import { Video } from './types';

// حجم الجزء الذي سيتم تحميله (تم تعديله ليكون 1.5 ميجا بايت تقريباً ليتناسب مع طلب 1 ميجا مع هامش أمان بسيط)
const BUFFER_SIZE = 1.5 * 1024 * 1024; 
const CACHE_NAME = 'rooh-video-buffer-v4'; 
const IMAGE_CACHE_NAME = 'rooh-image-cache-v1';

/**
 * يقوم بتحميل جزء صغير من الفيديو (1-1.5 ميجا) وتخزينه.
 */
export const bufferVideoChunk = async (url: string) => {
  if (!url || !url.startsWith('http')) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);

    if (cachedResponse) return;

    const response = await fetch(url, {
        headers: {
            'Range': `bytes=0-${BUFFER_SIZE}` 
        },
        mode: 'cors',
        cache: 'no-store' 
    });

    if (response.ok || response.status === 206) {
        const blob = await response.blob();
        const newResponse = new Response(blob, {
            status: 200,
            statusText: "OK",
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
                'Content-Length': blob.size.toString(),
                'X-Smart-Buffer': 'true'
            }
        });
        
        await cache.put(url, newResponse);
    }
  } catch (e) {
    // Silent fail
  }
};

/**
 * دالة جديدة لتخزين الصور المصغرة في الكاش لتعمل بدون نت وتظهر فوراً
 */
export const bufferImage = async (url: string) => {
    if (!url || !url.startsWith('http')) return;
    try {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const match = await cache.match(url);
        if (match) return;

        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) {
            await cache.put(url, response.clone());
        }
    } catch (e) {}
};

/**
 * استرجاع رابط الفيديو من الكاش
 */
export const getVideoSrcFromCache = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(url);
        
        if (response) {
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        }
    } catch (e) {
        return null;
    }
    return null;
};

// الدالة الجماعية (لأول مجموعة عند فتح التطبيق)
export const initSmartBuffering = async (videos: Video[]) => {
  if (!videos || videos.length === 0) return;

  const trending = videos.filter(v => v.is_trending).slice(0, 3);
  const newest = videos.slice(0, 5);
  
  const queue = Array.from(new Set([...trending, ...newest]));

  // تنفيذ التحميل بالتوازي في الخلفية للفيديو والصور
  queue.forEach(video => {
      if (video.video_url) {
          bufferVideoChunk(video.video_url);
      }
      if (video.poster_url) {
          bufferImage(video.poster_url);
      }
  });
};
