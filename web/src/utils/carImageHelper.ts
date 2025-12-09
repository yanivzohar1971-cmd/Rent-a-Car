/**
 * Car Image Normalization Helper
 * 
 * Centralized utility for normalizing car image data from various Firestore formats
 * into a consistent shape suitable for all UI components.
 * 
 * Supports multiple historical field formats:
 * - imagesJson (stringified JSON or direct array)
 * - images (array of objects or URLs)
 * - imageUrls (array of URL strings)
 * - mainImageUrl (explicit main image field)
 * - imagesCount (explicit count field, various casings)
 * 
 * This helper ensures backward compatibility with existing Firestore data
 * while providing a unified interface for image display.
 */

export interface NormalizedCarImages {
  /** Main image URL (preferred image for display) */
  mainImageUrl: string | null;
  /** All image URLs (for gallery display) */
  imageUrls: string[];
  /** Total image count (prefer explicit count if trustworthy, else use imageUrls.length) */
  imagesCount: number;
}

/**
 * Normalize a number value (handles string numbers, various types)
 */
function normalizeNumber(value: any): number | null {
  if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n) && n >= 0) {
      return n;
    }
  }
  return null;
}

/**
 * Extract URLs from an imagesJson field (stringified JSON or direct array)
 */
function extractUrlsFromImagesJson(imagesJson: any): string[] {
  if (!imagesJson) return [];

  let parsed: any;
  
  // Handle stringified JSON
  if (typeof imagesJson === 'string' && imagesJson.trim() !== '') {
    try {
      parsed = JSON.parse(imagesJson);
    } catch (e) {
      console.warn('[carImageHelper] Failed to parse imagesJson string:', e);
      return [];
    }
  } else if (Array.isArray(imagesJson)) {
    parsed = imagesJson;
  } else if (imagesJson && typeof imagesJson === 'object') {
    // Handle nested structure { images: [...] } or { data: [...] }
    parsed = imagesJson.images || imagesJson.data;
  } else {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [];
  }

  const urls: string[] = [];
  
  parsed.forEach((item: any) => {
    if (typeof item === 'string' && item.trim()) {
      urls.push(item.trim());
    } else if (item && typeof item === 'object') {
      // Extract URL from various field names
      const url = item.originalUrl || item.url || item.imageUrl || item.downloadUrl;
      if (typeof url === 'string' && url.trim()) {
        urls.push(url.trim());
      }
    }
  });

  return urls.filter(Boolean);
}

/**
 * Extract URLs from an images array (various formats)
 */
function extractUrlsFromImagesArray(images: any): string[] {
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  const urls: string[] = [];
  
  images.forEach((item: any) => {
    if (typeof item === 'string' && item.trim()) {
      urls.push(item.trim());
    } else if (item && typeof item === 'object') {
      const url = item.originalUrl || item.url || item.imageUrl || item.downloadUrl;
      if (typeof url === 'string' && url.trim()) {
        urls.push(url.trim());
      }
    }
  });

  return urls.filter(Boolean);
}

/**
 * Extract URLs from an imageUrls array (simple string array)
 */
function extractUrlsFromImageUrlsArray(imageUrls: any): string[] {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }

  return imageUrls
    .filter((url: any) => typeof url === 'string' && url.trim())
    .map((url: string) => url.trim())
    .filter(Boolean);
}

/**
 * Normalize car images from raw Firestore document data
 * 
 * Precedence order:
 * 1. imageUrls array (if present and valid)
 * 2. imagesJson (parsed)
 * 3. images array
 * 4. mainImageUrl (if present, add to list)
 * 
 * For mainImageUrl:
 * - Use explicit mainImageUrl field if present and valid
 * - Else use first URL from imageUrls
 * - Else null
 * 
 * For imagesCount:
 * - Prefer explicit imagesCount/ImagesCount/images_count if it matches derived count
 * - Else use imageUrls.length
 * 
 * @param rawCar - Raw Firestore document data (any shape)
 * @returns Normalized image data
 */
export function normalizeCarImages(rawCar: any): NormalizedCarImages {
  if (!rawCar || typeof rawCar !== 'object') {
    return {
      mainImageUrl: null,
      imageUrls: [],
      imagesCount: 0,
    };
  }

  // Collect all URLs from various sources (priority order)
  const allUrls: string[] = [];
  
  // Priority 1: imageUrls array (most reliable for publicCars)
  if (Array.isArray(rawCar.imageUrls) && rawCar.imageUrls.length > 0) {
    const urls = extractUrlsFromImageUrlsArray(rawCar.imageUrls);
    allUrls.push(...urls);
  }
  
  // Priority 2: imagesJson (Android/web upload format)
  if (rawCar.imagesJson) {
    try {
      const urls = extractUrlsFromImagesJson(rawCar.imagesJson);
      // Only add if we don't already have URLs (avoid duplicates)
      if (allUrls.length === 0 && urls.length > 0) {
        allUrls.push(...urls);
      }
    } catch (e) {
      // extractUrlsFromImagesJson already handles errors, but add extra safety
      if (import.meta.env.DEV) {
        console.warn('[carImageHelper] Error extracting URLs from imagesJson:', e);
      }
    }
  }
  
  // Priority 3: images array (legacy format)
  if (Array.isArray(rawCar.images) && rawCar.images.length > 0) {
    try {
      const urls = extractUrlsFromImagesArray(rawCar.images);
      // Only add if we don't already have URLs
      if (allUrls.length === 0 && urls.length > 0) {
        allUrls.push(...urls);
      }
    } catch (e) {
      // extractUrlsFromImagesArray already handles errors, but add extra safety
      if (import.meta.env.DEV) {
        console.warn('[carImageHelper] Error extracting URLs from images array:', e);
      }
    }
  }
  
  // Deduplicate URLs and filter out invalid entries
  const uniqueUrls = Array.from(new Set(allUrls)).filter((url) => {
    // Ensure URL is a non-empty string and looks like a valid URL
    if (typeof url !== 'string' || !url.trim()) return false;
    // Basic URL validation (starts with http:// or https://)
    const trimmed = url.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  });
  
  // Determine mainImageUrl
  let mainImageUrl: string | null = null;
  
  // Prefer explicit mainImageUrl if present and valid
  if (rawCar.mainImageUrl && typeof rawCar.mainImageUrl === 'string' && rawCar.mainImageUrl.trim()) {
    const explicitMain = rawCar.mainImageUrl.trim();
    // Validate it's a proper URL
    if (explicitMain.startsWith('http://') || explicitMain.startsWith('https://')) {
      // If it's in our URL list, use it; otherwise add it
      if (uniqueUrls.includes(explicitMain)) {
        mainImageUrl = explicitMain;
      } else if (uniqueUrls.length === 0) {
        // Only use explicit mainImageUrl if we have no other URLs
        mainImageUrl = explicitMain;
        uniqueUrls.push(explicitMain);
      } else {
        // Prefer explicit mainImageUrl even if not in list (add it to front)
        mainImageUrl = explicitMain;
        uniqueUrls.unshift(explicitMain);
      }
    } else if (import.meta.env.DEV) {
      // Log invalid mainImageUrl in dev mode only
      console.warn('[carImageHelper] Invalid mainImageUrl format (not http/https):', explicitMain);
    }
  } else if (uniqueUrls.length > 0) {
    // Fallback to first URL
    mainImageUrl = uniqueUrls[0];
  }
  
  // Determine imagesCount
  // Start with imageUrls.length as the source of truth
  let imagesCount = uniqueUrls.length;
  
  // Check for explicit count fields (various casings)
  const explicitCount =
    normalizeNumber(rawCar.imagesCount) ??
    normalizeNumber(rawCar.ImagesCount) ??
    normalizeNumber(rawCar.images_count);
  
  // Use explicit count ONLY if:
  // 1. It's a valid positive number (> 0)
  // 2. It's >= actual URLs (might be more accurate, e.g., if some URLs failed to load)
  // Otherwise, trust imageUrls.length as the source of truth
  if (explicitCount !== null && explicitCount > 0) {
    if (explicitCount >= uniqueUrls.length) {
      // Explicit count is valid and >= URLs - trust it (might account for failed loads)
      imagesCount = explicitCount;
    } else {
      // Explicit count is lower than actual URLs - trust URLs (explicit count is stale/wrong)
      if (import.meta.env.DEV) {
        console.warn('[carImageHelper] Explicit imagesCount is lower than actual URLs, using URLs length', {
          explicitCount,
          actualUrls: uniqueUrls.length,
        });
      }
      imagesCount = uniqueUrls.length;
    }
  }
  // If explicitCount is null, 0, or negative, we already have imagesCount = uniqueUrls.length (correct)
  
  return {
    mainImageUrl,
    imageUrls: uniqueUrls,
    imagesCount,
  };
}

