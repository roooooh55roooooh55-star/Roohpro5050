import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { SYSTEM_CONFIG } from "./TechSpecs";

// Using the strict configuration from TechSpecs.ts to ensure connectivity
const firebaseConfig = SYSTEM_CONFIG.firebase;

const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Auth helper to ensure access to Firestore rules
export const ensureAuth = async () => {
  try {
    if (auth.currentUser) return auth.currentUser;
    const result = await signInAnonymously(auth);
    console.log("🔥 Firebase Connected. User:", result.user.uid);
    return result.user;
  } catch (error) {
    console.error("🔥 Auth Error:", error);
    // Even if auth fails, we return null so the app doesn't crash completely,
    // though Firestore requests might fail if rules require auth.
    return null;
  }
};