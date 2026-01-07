
const CACHE_NAME = 'hadiqa-horror-offline-v1';

export const downloadVideoWithProgress = async (
  url: string, 
  onProgress: (progress: number) => void
): Promise<boolean> => {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100;
        onProgress(percentComplete);
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        try {
          const cache = await caches.open(CACHE_NAME);
          const response = new Response(xhr.response);
          await cache.put(url, response);
          onProgress(100);
          resolve(true);
        } catch (e) {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    };

    xhr.onerror = () => resolve(false);
    xhr.send();
  });
};

export const removeVideoFromCache = async (url: string): Promise<boolean> => {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.delete(url);
  } catch (error) {
    return false;
  }
};

export const isVideoDownloaded = async (url: string): Promise<boolean> => {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    return !!response;
  } catch (error) {
    return false;
  }
};
