
import { Video } from './types';

// 🛑 DEAD CODE: Cloudinary Removed.
// This file is kept only to prevent import errors in legacy components if any exist.
// The system strictly uses R2 Vault & Firebase.

export const fetchCloudinaryVideos = async (): Promise<Video[]> => {
  console.warn("Attempted to fetch from legacy source. Blocked. Using R2 Vault.");
  return [];
};

export const deleteCloudinaryVideo = async (publicId: string) => {
  return false;
};

export const updateCloudinaryMetadata = async (publicId: string, title: string, category: string) => {
  return false;
};
