/**
 * Builds the public URL for a yard's QR code
 * @param yardId - The yard's user ID (Firebase Auth UID)
 * @returns The full URL to the yard's public page
 */
export function buildYardPublicUrl(yardId: string): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://carexpert-94faa.web.app'; // fallback for SSR

  return `${origin}/yard/${yardId}`;
}

