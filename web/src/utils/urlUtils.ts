/**
 * Normalize website URL by:
 * - Removing accidental leading slash before protocol (e.g., "/https://...")
 * - Adding https:// protocol if missing
 * - Trimming whitespace
 * 
 * @param raw - Raw URL string from user input
 * @returns Normalized URL string or null if input is empty/null/undefined
 */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  
  let url = raw.trim();
  
  // Remove accidental leading slash before the URL, e.g. "/https://..."
  if (url.startsWith("/http://") || url.startsWith("/https://")) {
    url = url.slice(1);
  }
  
  // If missing protocol, default to https
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  
  return url;
}

/**
 * Get a clean display label for a website URL (removes protocol for cleaner display)
 * 
 * @param url - Full URL
 * @returns Clean label without protocol prefix
 */
export function getWebsiteLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

