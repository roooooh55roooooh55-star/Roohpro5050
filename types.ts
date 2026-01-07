
export type VideoType = "Shorts" | "Long Video";

export interface Video {
  id: string;
  public_id?: string;     // Legacy ID (Not used in R2)
  title: string;
  description: string;    // السرد المرعب الذي يظهر تحت العنوان
  category: string;       // الأقسام الثمانية المعتمدة
  is_trending: boolean;   // المسؤول عن ظهور رسمة النار الأصلية
  isFeatured?: boolean;   // Used for trending/featured selection logic
  video_url: string;      // رابط R2 السريع (pub-...)
  video_type: VideoType;  // Shorts أو Long Video
  type?: 'short' | 'long'; // Lowercase variant for layout logic
  redirect_url?: string;  // الرابط الخارجي المخصص للانتقال (Legacy/Whole card)
  overlay_text?: string;  // النص أو الإيموجي الذي سيظهر على الفيديو
  overlay_url?: string;   // الرابط الخاص بالزر العائم
  external_link?: string; // External Link alias
  created_at: any;        // Firestore Timestamp or Date object
  likes?: number;
  views?: number;
  poster_url?: string;    // رابط الصورة المصغرة (Thumbnail/Poster) للعرض بدون نت
  tags?: string[];        // AI-driven categorization tags
  read_narrative?: boolean; // Toggle for reading narrative/title via TTS
}

export interface UserInteractions {
  likedIds: string[];
  dislikedIds: string[];
  savedIds: string[];
  savedCategoryNames: string[]; 
  watchHistory: { id: string; progress: number }[];
  downloadedIds: string[];
}

export interface UserProfile {
    name?: string;
    gender?: 'male' | 'female';
    interests?: string[];
    last_voice_limit_hit?: number; // Timestamp
}

export enum AppView {
  HOME = 'home',
  TREND = 'trend',
  LIKES = 'likes',
  SAVED = 'saved',
  UNWATCHED = 'unwatched',
  HIDDEN = 'hidden',
  PRIVACY = 'privacy',
  ADMIN = 'admin',
  CATEGORY = 'category',
  OFFLINE = 'offline'
}
