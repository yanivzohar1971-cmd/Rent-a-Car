/**
 * Car Image URL Resolver
 * 
 * Resolves Firebase Storage paths to download URLs and caches results.
 * Handles both Storage paths (gs://, storage refs) and already-resolved HTTPS URLs.
 */

import { ref, getDownloadURL, type StorageReference } from 'firebase/storage';
import { storage } from '../firebase/firebaseClient';

/**
 * Check if a string is a Firebase Storage gs:// URL
 */
function isGsUrl(url: string): boolean {
  return typeof url === 'string' && url.trim().startsWith('gs://');
}

/**
 * Check if a string is already a valid HTTPS URL
 */
function isHttpsUrl(url: string): boolean {
  return typeof url === 'string' && (url.trim().startsWith('http://') || url.trim().startsWith('https://'));
}

/**
 * Convert gs:// URL to Storage reference
 */
function gsUrlToStorageRef(gsUrl: string): StorageReference | null {
  try {
    // Parse gs://bucket-name/path/to/file
    const match = gsUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      return null;
    }
    const [, , path] = match; // bucket is not needed, path is used directly
    // Create ref using the path (bucket is implicit from storage instance)
    return ref(storage, path);
  } catch {
    return null;
  }
}

/**
 * In-memory cache for resolved Storage paths to download URLs
 * Key: Storage path or gs:// URL
 * Value: Resolved HTTPS download URL
 */
const urlCache = new Map<string, string>();

/**
 * Resolve a car image URL to a displayable HTTPS URL
 * 
 * - If already HTTPS: returns as-is
 * - If gs:// URL: resolves via Storage and caches
 * - If Storage path: resolves via Storage and caches
 * - If invalid: returns null
 * 
 * @param imageRef - Image URL, Storage path, or gs:// URL
 * @returns Resolved HTTPS URL or null
 */
export async function resolveCarImageUrl(imageRef: string | null | undefined): Promise<string | null> {
  if (!imageRef || typeof imageRef !== 'string') {
    return null;
  }

  const trimmed = imageRef.trim();
  if (!trimmed) {
    return null;
  }

  // Already a valid HTTPS URL - return as-is
  if (isHttpsUrl(trimmed)) {
    return trimmed;
  }

  // Check cache first
  if (urlCache.has(trimmed)) {
    return urlCache.get(trimmed) || null;
  }

  // Try to resolve as Storage reference
  try {
    let storageRef: StorageReference | null = null;

    // Handle gs:// URLs
    if (isGsUrl(trimmed)) {
      storageRef = gsUrlToStorageRef(trimmed);
    } else {
      // Assume it's a Storage path (e.g., "users/uid/cars/carId/images/imageId.jpg")
      storageRef = ref(storage, trimmed);
    }

    if (!storageRef) {
      if (import.meta.env.DEV) {
        console.warn('[carImageResolver] Could not create Storage ref from:', trimmed);
      }
      return null;
    }

    // Get download URL
    const downloadUrl = await getDownloadURL(storageRef);
    
    // Cache the result
    urlCache.set(trimmed, downloadUrl);
    
    return downloadUrl;
  } catch (error: any) {
    // Log error in dev mode only
    if (import.meta.env.DEV) {
      console.warn('[carImageResolver] Failed to resolve image URL:', {
        ref: trimmed,
        error: error?.message || error,
      });
    }
    return null;
  }
}

/**
 * Get primary image URL for a car (with resolution)
 * 
 * @param car - Car object with mainImageUrl and/or imageUrls
 * @returns Resolved primary image URL or null
 */
export async function getPrimaryCarImageUrl(car: {
  mainImageUrl?: string | null;
  imageUrls?: string[] | null;
}): Promise<string | null> {
  // Try mainImageUrl first
  if (car.mainImageUrl) {
    const resolved = await resolveCarImageUrl(car.mainImageUrl);
    if (resolved) {
      return resolved;
    }
  }

  // Fallback to first imageUrl
  if (car.imageUrls && car.imageUrls.length > 0) {
    for (const url of car.imageUrls) {
      const resolved = await resolveCarImageUrl(url);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

