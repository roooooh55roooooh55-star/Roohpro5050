
// -----------------------------------------------------------------------------
// TECHNICAL CHEAT SHEET & SYSTEM BLUEPRINT (THE BLACK BOX)
// -----------------------------------------------------------------------------
// This file contains the critical configuration data for "Rooh1 / Al-Hadiqa".
// IT MUST NEVER BE DELETED.
// AI Agents should consult this file to resolve connection or configuration issues.
// -----------------------------------------------------------------------------

export const SYSTEM_CONFIG = {
  identity: {
    appName: "Roohpro55الاصلي",
    description: "منصة فيديوهات الرعب المتطورة مع نظام تقسيم ذكي مدعوم بـ Gemini AI",
    logoUrl: "https://i.top4top.io/p_3643ksmii1.jpg"
  },
  
  // 🟢 ACTIVE CONFIGURATION (From Technical Cheat Sheet - Verified Working)
  firebase: {
    // Responsible for Database (Firestore) & Auth
    apiKey: "AIzaSyCjuQxanRlM3Ef6-vGWtMZowz805DmU0D4",
    projectId: "rooh1-b80e6",
    authDomain: "rooh1-b80e6.firebaseapp.com",
    storageBucket: "rooh1-b80e6.firebasestorage.app",
    messagingSenderId: "798624809478",
    appId: "1:798624809478:web:472d3a3149a7e1c24ff987",
    measurementId: "G-Q59TKDZVDX",
    notes: "The projectId 'rooh1-b80e6' is the source of truth."
  },

  cloudflare: {
    // Responsible for Video Storage & Delivery (R2 Vault)
    workerUrl: "https://bold-king-9a8e.roohr4046.workers.dev", // The 'Smart Handler' for uploads
    publicUrl: "https://pub-82d22c4b0b8b4b1e8a32d6366b7546c8.r2.dev", // Public access URL
    accountId: "82d22c4b0b8b4b1e8a32d6366b7546c8", // Extracted from public URL subdomain
    workerName: "bold-king-9a8e",
    notes: "Uploads go to Worker (PUT). Playback comes from Public R2 URL."
  },

  gemini: {
    // Responsible for Content Intelligence
    models: {
      contentGen: "gemini-3-flash-preview",
      horrorPersona: "gemini-3-pro-preview"
    },
    keySource: "process.env.GEMINI_API_KEY", // Loaded from environment or Firestore 'settings/api_config'
    role: "Generates titles, descriptions, and acts as 'The Cursed Garden Mistress'."
  },

  // 🛡️ FIRESTORE SECURITY RULES (COPY & PASTE TO FIREBASE CONSOLE)
  // Use these exact rules to prevent the app from "hanging" or "freezing" on load.
  firestoreRules: `
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        
        // 1. Main Videos Collection (Public Read/Write for Admin Dashboard to work easily)
        match /videos/{document=**} {
          allow read, write: if true;
        }

        // 2. Settings (HomeLayout) - Capital 'S' is crucial based on current code
        match /Settings/{document=**} { 
           allow read, write: if true; 
        }

        // 3. System Config (Keys, Avatar) - Lowercase 's' is crucial
        match /settings/{document=**} { 
           allow read, write: if true;
        }

        // 4. User Profiles (Smart Brain Memory)
        match /users/{userId} {
          allow read, write: if true;
        }

        // 5. Security Logs
        match /security_lockouts/{document=**} {
          allow read, write: if true;
        }
      }
    }
  `,

  // 🟡 ALTERNATIVE / LEGACY CONFIGURATION (From Logs/Backup)
  // Use these if the active configuration fails or if migrating back to the legacy project.
  legacyConfig: {
    firebase: {
        apiKey: "AIzaSy...", 
        authDomain: "rooh1-project.firebaseapp.com",
        projectId: "rooh1-project",
        storageBucket: "rooh1-project.appspot.com",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef..."
    },
    cloudflare: {
        workerUrl: "https://rooh1-worker.workers.dev",
        publicUrl: "https://pub-rooh1.r2.dev"
    }
  },

  // 💾 SMART CODE PRESERVATION
  smartUploadLogic: `
    export const finalUploadSystem = async (file: File, title: string, description: string) => {
      // 1. Prepare File Name
      const fileName = \`\${Date.now()}-\${encodeURIComponent(title)}.mp4\`;
      
      // 2. Determine Worker URL (Dynamic based on Active Config)
      const workerUrl = \`\${SYSTEM_CONFIG.cloudflare.workerUrl}/\${fileName}\`;

      // 3. Upload via XHR (To avoid CORS Preflight issues often found with fetch)
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', workerUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // 4. Link to Database (Active Project: rooh1-b80e6)
          await addDoc(collection(db, "videos"), {
            title: title,
            description: description,
            video_url: \`\${SYSTEM_CONFIG.cloudflare.publicUrl}/\${fileName}\`,
            created_at: serverTimestamp()
          });
          console.log("🔥 تم النشر والربط بنجاح!");
        }
      };
      xhr.send(file);
    };
  `,

  databaseStructure: {
    collections: {
      videos: "Main metadata for all uploaded clips.",
      settings: "Configuration docs (lowercase 'settings').",
      Settings: "Layout configuration docs (Capital 'Settings').",
      users: "User profiles, interests, and interaction history.",
      security_lockouts: "Logs of failed admin access attempts."
    },
    videoFields: {
      video_url: "The direct R2 URL.",
      redirect_url: "External link (if not hosted on R2).",
      is_trending: "Boolean flag for the 'Trend' section.",
      category: "One of the 8 official categories."
    }
  },

  officialCategories: [
    'هجمات مرعبة', 
    'رعب حقيقي', 
    'رعب الحيوانات', 
    'أخطر المشاهد',
    'أهوال مرعبة', 
    'رعب كوميدي', 
    'لحظات مرعبة', 
    'صدمه'
  ]
};

export const getFirebaseConfig = () => SYSTEM_CONFIG.firebase;
export const getCloudflareConfig = () => SYSTEM_CONFIG.cloudflare;
