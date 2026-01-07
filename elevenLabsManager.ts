
import { db, ensureAuth } from './firebaseConfig';
import { doc, getDoc, updateDoc } from "firebase/firestore";

// Singleton to manage the audio instance globally
let currentAudio: HTMLAudioElement | null = null;
type AudioStateListener = (isPlaying: boolean) => void;
let audioListeners: AudioStateListener[] = [];

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

export const subscribeToAudioState = (listener: AudioStateListener) => {
  audioListeners.push(listener);
  return () => {
    audioListeners = audioListeners.filter(l => l !== listener);
  };
};

const notifyListeners = (isPlaying: boolean) => {
  audioListeners.forEach(listener => listener(isPlaying));
};

export const stopCurrentNarrative = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    notifyListeners(false);
  }
};

// --- Smart Key Management System ---

export interface KeyStats {
    key: string;
    used: number;
    limit: number;
    remaining: number;
    status: 'active' | 'empty' | 'error';
}

// Function to check a specific key's usage
export const checkKeyUsage = async (apiKey: string): Promise<KeyStats> => {
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
            headers: { 'xi-api-key': apiKey }
        });
        
        if (!response.ok) {
            return { key: apiKey, used: 0, limit: 0, remaining: -1, status: 'error' };
        }

        const data = await response.json();
        const used = data.character_count || 0;
        const limit = data.character_limit || 0;
        const remaining = limit - used;

        return {
            key: apiKey,
            used,
            limit,
            remaining,
            status: remaining > 100 ? 'active' : 'empty' // Consider empty if less than 100 chars
        };
    } catch (e) {
        return { key: apiKey, used: 0, limit: 0, remaining: -1, status: 'error' };
    }
};

// Function to sort keys: Active (Most remaining) -> Empty -> Error
export const optimizeKeyOrder = async (keys: string[]): Promise<string[]> => {
    if (!keys || keys.length === 0) return [];

    // Check all keys (could be parallelized, but sequential is safer for rate limits)
    const stats: KeyStats[] = [];
    for (const key of keys) {
        if (key.length < 10) continue; // Skip invalid lines
        const stat = await checkKeyUsage(key);
        stats.push(stat);
    }

    // Sort: 
    // 1. Status 'active' first
    // 2. Then by remaining characters (descending)
    stats.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        
        if (a.status === 'active' && b.status === 'active') {
            return b.remaining - a.remaining; // Most remaining first
        }
        return 0;
    });

    return stats.map(s => s.key);
};

// Helper to get the currently active key
const getActiveKeyData = async () => {
  try {
    await ensureAuth();
    const docRef = doc(db, "settings", "api_config");
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) return null;
    
    const data = snapshot.data();
    if (!data) return null;

    const keys = data.elevenlabs_keys || [];
    // We always try to use the first key because the list is presumed to be sorted by "optimizeKeyOrder"
    // via the Admin Dashboard. However, if runtime failure happens, we iterate.
    
    let currentIndex = data.elevenlabs_index || 0;

    if (keys.length === 0) return null;

    if (currentIndex >= keys.length) currentIndex = 0;

    return { key: keys[currentIndex], index: currentIndex, totalKeys: keys.length, allKeys: keys };
  } catch (error) {
    console.error("Failed to fetch ElevenLabs config:", error);
    return null;
  }
};

// Helper to switch to the next key in the pool locally (and update DB index)
const switchToNextKey = async (oldIndex: number) => {
  try {
    const docRef = doc(db, "settings", "api_config");
    await updateDoc(docRef, {
        elevenlabs_index: oldIndex + 1
    });
    console.log(`ElevenLabs: Switched key index from ${oldIndex} to ${oldIndex + 1}`);
  } catch (e) {
    console.error("Failed to rotate ElevenLabs key:", e);
  }
};

export const playNarrative = async (text: string, retryCount = 0) => {
  // Prevent infinite loops
  if (retryCount > 3) {
      console.error("ElevenLabs: Max retries reached. Speech failed.");
      notifyListeners(false);
      return;
  }

  stopCurrentNarrative();

  if (!text || text.trim().length === 0) return;

  const cleanText = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
  if (cleanText.length === 0) return;

  const keyData = await getActiveKeyData();
  
  if (!keyData || !keyData.key) {
      console.warn("ElevenLabs: No keys found in settings/api_config");
      notifyListeners(false);
      return;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": keyData.key,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.6,
            use_speaker_boost: true
          }
        }),
      }
    );

    if (!response.ok) {
        // If Unauthorized (401) or Quota Exceeded (429 or sometimes 402)
        if (response.status === 401 || response.status === 429 || response.status === 402) {
            console.warn(`ElevenLabs Key Failed (Status ${response.status}). Rotating...`);
            await switchToNextKey(keyData.index);
            // Recursively retry with next key
            await playNarrative(text, retryCount + 1);
            return;
        }
        throw new Error(`ElevenLabs API Error: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    currentAudio = new Audio(url);
    
    currentAudio.onplay = () => notifyListeners(true);
    
    currentAudio.play().catch(e => {
        console.error("Audio Play Error:", e);
        notifyListeners(false);
    });
    
    currentAudio.onended = () => {
        notifyListeners(false);
        URL.revokeObjectURL(url);
        currentAudio = null;
    };
    
    currentAudio.onpause = () => {
        if (currentAudio && !currentAudio.ended) notifyListeners(false);
    }

  } catch (error) {
    console.error("TTS Error:", error);
    notifyListeners(false);
  }
};
