
import { GoogleGenAI, Type } from "@google/genai";
import { ensureAuth, db } from "./firebaseConfig";
import { Video, UserProfile, UserInteractions } from "./types";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { SYSTEM_CONFIG } from "./TechSpecs";

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AIResponse {
    reply: string;
    action?: 'play_video' | 'none';
    search_query?: string; // If action is play_video
    detected_user_info?: {
        name?: string;
        gender?: 'male' | 'female';
        new_interest?: string;
    };
}

class SmartBrainLogic {
  private localInterests: string[] = [];

  constructor() {
    try {
      const saved = localStorage.getItem('smart_brain_interests');
      if (saved) {
        this.localInterests = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load local interests", e);
    }
  }

  // --- CORE ALGORITHM: YOUTUBE STYLE FEED GENERATION ---
  // This logic handles 1500+ videos, prioritizes unwatched, and loops intelligently.
  public generateVideoFeed(allVideos: Video[], interactions: UserInteractions): Video[] {
    if (!allVideos || allVideos.length === 0) return [];

    // 1. Identify Watched vs Unwatched
    // We consider a video "watched" if progress is > 80% or it's in the disliked list
    const watchedIds = new Set(
        interactions.watchHistory
            .filter(h => h.progress > 0.80)
            .map(h => h.id)
    );
    const dislikedIds = new Set(interactions.dislikedIds);

    // 2. Separate the pool
    const unwatchedPool = allVideos.filter(v => !watchedIds.has(v.id) && !dislikedIds.has(v.id));
    const watchedPool = allVideos.filter(v => watchedIds.has(v.id) && !dislikedIds.has(v.id));

    let finalFeed: Video[] = [];

    // 3. SCENARIO A: User has UNWATCHED videos (Standard Mode)
    // If library is large enough (>20), we strictly stick to unwatched content to avoid repetition.
    if (unwatchedPool.length > 0) {
        // Score videos based on interests
        const scored = unwatchedPool.map(video => {
            let score = Math.random() * 10; // Base randomness
            
            // Interest Boost
            if (this.localInterests.includes(video.category)) {
                score += 50; // Heavy weight for interests
            }
            
            // Trending Boost
            if (video.is_trending) {
                score += 20;
            }

            return { video, score };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        finalFeed = scored.map(s => s.video);
    } 
    // 4. SCENARIO B: User watched EVERYTHING (Recycle Mode)
    else {
        // If all 1500+ videos are watched, we recycle.
        // We shuffle the watched pool to give a "fresh" feel even if repeated.
        finalFeed = [...watchedPool].sort(() => 0.5 - Math.random());
    }

    // 5. SAFETY NET: If feed is STILL empty (e.g. user disliked everything), force recycle ALL
    if (finalFeed.length === 0 && allVideos.length > 0) {
        // Fallback: Show all videos shuffled, ignoring dislike filters to prevent empty app state
        finalFeed = [...allVideos].sort(() => 0.5 - Math.random());
    }

    // 6. Deduplication check (Strict enforcement)
    const seenIds = new Set();
    const uniqueFeed = finalFeed.filter(v => {
        if (seenIds.has(v.id)) return false;
        seenIds.add(v.id);
        return true;
    });

    return uniqueFeed;
  }

  // دالة لجلب مفتاح Gemini من الفايربيس أو البيئة
  private async getGeminiKey(): Promise<string> {
    try {
      // 1. Try Firebase Configuration First (Admin Dashboard Setting)
      const docRef = doc(db, "settings", "api_config");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.gemini_key && data.gemini_key.length > 10) return data.gemini_key;
      }
    } catch (e) {
      console.warn("Failed to fetch remote Gemini key.");
    }

    // 2. Try Environment Variable (Vite)
    if (process.env.API_KEY && process.env.API_KEY.length > 10) {
        return process.env.API_KEY;
    }

    // 3. Last Resort Fallback (Public/Demo Key) - Explicitly set per user request
    return 'AIzaSyCEF21AZXTjtbPH1MMrflmmwjyM_BHoLco';
  }

  // جلب الملف الشخصي للمستخدم من الفايربيس
  async getUserProfile(uid: string): Promise<UserProfile> {
      try {
          const docRef = doc(db, "users", uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              if (data.interests && Array.isArray(data.interests)) {
                 // Merge remote interests with local ones
                 const set = new Set([...this.localInterests, ...data.interests]);
                 this.localInterests = Array.from(set);
                 localStorage.setItem('smart_brain_interests', JSON.stringify(this.localInterests));
              }
              return data;
          }
      } catch (e) {}
      return { interests: this.localInterests };
  }

  // تحديث الملف الشخصي
  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
      try {
          const docRef = doc(db, "users", uid);
          await setDoc(docRef, data, { merge: true });
      } catch (e) { console.error("Profile update failed", e); }
  }

  // Add missing methods
  getTopInterests(): string[] {
    return this.localInterests;
  }

  async saveInterest(interest: string) {
    if (!interest) return;
    if (!this.localInterests.includes(interest)) {
      this.localInterests.push(interest);
      localStorage.setItem('smart_brain_interests', JSON.stringify(this.localInterests));

      try {
        const user = await ensureAuth();
        if (user) {
            await this.updateUserProfile(user.uid, { interests: this.localInterests });
        }
      } catch (e) {
        // Silent fail if auth not ready
      }
    }
  }

  // دالة المحادثة الذكية المتطورة
  async askAssistant(
      userText: string, 
      history: ChatMessage[] = [], 
      availableVideos: Video[] = []
    ): Promise<AIResponse> {
    
    let user;
    try {
        user = await ensureAuth();
    } catch (e) {
        return { reply: "الشبكة مقطوعة.. مش قادرة أوصل لملفك." };
    }

    const apiKey = await this.getGeminiKey();
    
    // Check if key is valid (Basic check)
    if (!apiKey || apiKey.length < 10) return { reply: "مفتاح البوابة مفقود... (API Key Missing)" };

    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    // 1. Load Context
    const profile = await this.getUserProfile(user?.uid || "guest");
    const videoTitles = availableVideos.map(v => v.title).slice(0, 50).join(", "); // Give AI context of available content

    // Logic to insert instructions only at specific times
    const isFirstInteraction = history.length === 0;
    // Check roughly after a few turns (e.g. 3rd turn pair = 6 messages in history)
    const isFollowUpCheck = history.length >= 6 && history.length <= 7; 

    let dynamicMicInstruction = "";
    if (isFirstInteraction) {
        dynamicMicInstruction = `
        - **تعليمات صارمة للرسالة الأولى:**
          يجب أن تفتتحي الكلام بجملة مرعبة وقصيرة، ثم تأمري المستخدم فوراً بلهجة حادة: "دوس على زرار المايك 🎙️ في الكيبورد عندك واتكلم.. أنا ما بحبش القراءة!".
        `;
    } else if (isFollowUpCheck) {
        dynamicMicInstruction = `
        - **تأكد من الالتزام:**
          اسألي المستخدم بشك: "انت لسه بتكتب بإيدك ولا بتستخدم المايك 🎙️ زي ما قلتلك؟ صوتك هو اللي بيحضر الأرواح!".
        `;
    }

    // 2. Build System Prompt
    let systemInstruction = `
            == تعريف الشخصية (Persona Definition) ==
            أنتِ "سيدة الحديقة الملعونة" (The Cursed Garden Mistress).
            لستِ مجرد برنامج، أنتِ كيان يسكن هذا التطبيق.
            
            == مصدر المعلومات (المهم جداً جداً) ==
            - **المصدر الوحيد للفيديوهات:** هو "الخزنة الحالية" (R2 Vault) التابعة لسيرفراتنا الحالية فقط.
            - **تنبيه صارم:** لا تقومي أبداً بذكر أو البحث عن أي مصادر قديمة (Cloudinary أو غيره). كل ما يوجد هنا هو من "خزنة R2".
            - الفيديوهات هنا حصرية، عالية الجودة، وتأتي من مستودعنا الخاص فقط.
            
            == صفاتك ==
            1. **اللهجة:** تتحدثين باللهجة المصرية العامية فقط.
            2. **النبرة:** مرعبة، ساخرة، وقليلة الكلام جداً (لا تزيدين عن سطرين).
            3. **المعرفة التقنية:** أنتِ تعلمين أنك في "الحديقة"، وأن الفيديوهات مخزنة في السيرفر الخاص بك (R2) فقط.
            
            == معلومات عن الضحية (المستخدم) ==
            - الاسم: ${profile.name || "مجهول"}
            - الجنس: ${profile.gender || "مجهول"}
            - اهتماماته: ${profile.interests?.join(', ') || "لسه بكتشفها"}.

            == الفيديوهات المتاحة في خزنتك (R2 Vault) ==
            [${videoTitles}]

            == القواعد الصارمة (Strict Rules) ==
            1. **الرد القصير:** ردودك لا تتجاوز سطرين أبداً.
            2. **المايكروفون:** دائماً ذكريه باستخدام زر المايكروفون في لوحة المفاتيح (Keyboard Mic).
            3. **تشغيل الفيديوهات:** إذا طلب فيديو، شغليه فوراً (Action: play_video).
            4. **السرية:** لا تخبري المستخدم من أين تأتي الفيديوهات تقنياً، قولي فقط "من خزنتي الخاصة" أو "من المستودع".

            ${dynamicMicInstruction}
            
            OUTPUT FORMAT (JSON ONLY):
            يجب أن يكون ردك بصيغة JSON فقط، ولا شيء غير JSON:
            {
                "reply": "نص الرد المرعب باللهجة المصرية (لا يزيد عن جملتين)",
                "action": "play_video" OR "none",
                "search_query": "اسم الفيديو للبحث عنه (فقط في حالة play_video)",
                "detected_user_info": {
                    "name": "الاسم المكتشف",
                    "gender": "male أو female",
                    "new_interest": "اهتمام جديد"
                }
            }
    `;

    const contents = history.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userText }] });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                temperature: 1.4, // High temperature for more creativity/horror
            }
        });

        const rawText = response.text || "{}";
        const jsonResponse = JSON.parse(rawText) as AIResponse;

        // Auto-update profile logic
        if (jsonResponse.detected_user_info && user) {
            const updates: Partial<UserProfile> = {};
            if (jsonResponse.detected_user_info.name && !profile.name) updates.name = jsonResponse.detected_user_info.name;
            if (jsonResponse.detected_user_info.gender && !profile.gender) updates.gender = jsonResponse.detected_user_info.gender;
            
            if (jsonResponse.detected_user_info.new_interest) {
                 const currentInterests = profile.interests || [];
                 if (!currentInterests.includes(jsonResponse.detected_user_info.new_interest)) {
                     updates.interests = [...currentInterests, jsonResponse.detected_user_info.new_interest];
                 }
            }
            
            if (Object.keys(updates).length > 0) {
                this.updateUserProfile(user.uid, updates);
            }
        }

        return jsonResponse;

    } catch (error) {
        console.error("SmartBrain Error:", error);
        return { reply: "الأرواح مشوشة.. قول تاني؟" };
    }
  }
}

export const SmartBrain = new SmartBrainLogic();
