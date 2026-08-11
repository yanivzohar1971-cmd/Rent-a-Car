/**
 * Share utilities for social media sharing
 * Used by Smart Promotion / פרסום חכם flows
 *
 * Facebook share uses the sharer.php endpoint which reads Open Graph meta tags
 * from the target URL. For the best preview, ensure the public car page has
 * proper og:title, og:description, og:image, and og:url meta tags.
 *
 * IMPORTANT: Route mapping for car URLs:
 * - YARD cars (publicCars collection) → /cars/:id (CarDetailsPage)
 * - Private seller ads (carAds collection) → /car/:id (PublicCarPage)
 *
 * This matches the routing in CarsSearchPage and router.tsx.
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
 * Seller type for URL building
 */
export type CarSellerType = 'YARD' | 'PRIVATE';

/**
 * Build public URL for a car page based on seller type
 *
 * Route mapping (mirrors CarsSearchPage and router.tsx):
 * - YARD cars (from publicCars) → /cars/:id (CarDetailsPage)
 * - Private seller ads (from carAds) → /car/:id (PublicCarPage)
 *
 * @param carId - The car's document ID
 * @param sellerType - 'YARD' for yard cars (publicCars), 'PRIVATE' for private seller ads (carAds)
 * @returns Full absolute URL to the public car page
 */
export function buildPublicCarUrl(carId: string, sellerType: CarSellerType = 'YARD'): string {
  const origin = getAppOrigin();
  // YARD cars use /cars/:id (CarDetailsPage)
  // PRIVATE seller ads use /car/:id (PublicCarPage)
  const path = sellerType === 'YARD' ? `/cars/${carId}` : `/car/${carId}`;
  return `${origin}${path}`;
}

/**
 * Build public URL for a yard car (from publicCars collection)
 * This is a convenience wrapper for yard-specific flows like Smart Publish.
 *
 * @param carId - The car's document ID (from publicCars collection)
 * @returns Full absolute URL using /cars/:id route
 */
export function buildPublicYardCarUrl(carId: string): string {
  return buildPublicCarUrl(carId, 'YARD');
}

/**
 * Build public URL for a private seller car ad (from carAds collection)
 *
 * @param carAdId - The car ad's document ID (from carAds collection)
 * @returns Full absolute URL using /car/:id route
 */
export function buildPublicCarAdUrl(carAdId: string): string {
  return buildPublicCarUrl(carAdId, 'PRIVATE');
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

