import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { SYSTEM_CONFIG } from './TechSpecs';

export const Logo: React.FC<{ className?: string, alt?: string }> = ({ className, alt = "Logo" }) => {
  const [url, setUrl] = useState(SYSTEM_CONFIG.identity.logoUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Real-time listener for logo updates
    const unsub = onSnapshot(doc(db, "settings", "branding"), (snap) => {
      if (snap.exists() && snap.data().logo_url) {
        setUrl(snap.data().logo_url);
        setError(false);
      }
    });
    return () => unsub();
  }, []);

  if (error) {
    return (
      <div className={`${className} bg-red-900/50 flex items-center justify-center overflow-hidden border-2 border-white/20 shadow-inner`}>
        <span className="text-white font-black text-[10px]">ROOH</span>
      </div>
    );
  }

  return (
    <img 
      src={url} 
      className={className} 
      alt={alt} 
      onError={() => setError(true)}
    />
  );
};