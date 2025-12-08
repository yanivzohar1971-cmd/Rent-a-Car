/**
 * Share utilities for social media sharing
 * Used by Smart Promotion / פרסום חכם flows
 *
 * Facebook share uses the sharer.php endpoint which reads Open Graph meta tags
 * from the target URL. For the best preview, ensure the public car page has
 * proper og:title, og:description, og:image, and og:url meta tags.
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
  /** Optional title (car title / model) - used for quote text */
  title?: string;
  /** Optional short description - used for quote text */
  description?: string;
}

/**
 * Opens a centered Facebook share popup window
 *
 * We use Facebook's sharer.php endpoint which:
 * - Requires no API tokens or app registration
 * - Reads Open Graph meta tags from the shared URL
 * - Shows a compose dialog where user can add their own text
 *
 * @param options - Share options including URL, title, and description
 */
export function openFacebookShareDialog(options: FacebookShareOptions): void {
  // Guard against SSR or missing window
  if (typeof window === 'undefined') return;

  const { url, title, description } = options;

  if (!url) {
    console.warn('openFacebookShareDialog: no URL provided');
    return;
  }

  // Build quote text from title and description (pre-filled text for user)
  const parts: string[] = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  const quote = parts.join(' · ');

  // Build Facebook sharer URL
  const fbUrl =
    'https://www.facebook.com/sharer/sharer.php?' +
    `u=${encodeURIComponent(url)}` +
    (quote ? `&quote=${encodeURIComponent(quote)}` : '');

  // Calculate centered popup position
  const width = 600;
  const height = 500;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

  // Open centered popup window
  window.open(
    fbUrl,
    'fbShareWindow',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}

