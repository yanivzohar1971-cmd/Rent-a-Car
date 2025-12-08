/**
 * Share utilities for social media sharing
 * Used by Smart Promotion / פרסום חכם flows
 */

/**
 * Gets the app origin URL
 */
function getAppOrigin(): string {
  return typeof window !== 'undefined'
    ? window.location.origin
    : 'https://carexpert-94faa.web.app';
}

/**
 * Build public URL for a car page
 * Uses the existing /car/:id route for public car pages
 * @param carId - The car's document ID (from publicCars collection)
 */
export function buildPublicCarUrl(carId: string): string {
  const origin = getAppOrigin();
  return `${origin}/car/${carId}`;
}

/**
 * Build public URL for a yard page
 * Uses the existing /yard/:yardId route for public yard pages
 * @param yardId - The yard's user ID (Firebase Auth UID)
 */
export function buildPublicYardUrl(yardId: string): string {
  const origin = getAppOrigin();
  return `${origin}/yard/${yardId}`;
}

/**
 * Options for opening a Facebook share dialog
 */
interface FacebookShareOptions {
  /** Public URL of the car/ad to share */
  url: string;
  /** Optional title (car title / model) */
  title?: string;
  /** Optional short description */
  description?: string;
}

/**
 * Opens Facebook share dialog with the given URL and optional quote text
 * Uses the Facebook sharer dialog (no API tokens required)
 * @param options - Share options including URL, title, and description
 */
export function openFacebookShareDialog(options: FacebookShareOptions): void {
  const { url, title, description } = options;

  // Build quote text from title and description
  const parts: string[] = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  const quote = parts.join(' · ');

  // Build Facebook sharer URL
  const fbUrl =
    'https://www.facebook.com/sharer/sharer.php?' +
    `u=${encodeURIComponent(url)}` +
    (quote ? `&quote=${encodeURIComponent(quote)}` : '');

  // Open in new window/tab
  window.open(fbUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
}

