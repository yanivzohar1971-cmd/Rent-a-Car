/**
 * Resolve seller/yard display data from publicCar (publicCars projection).
 *
 * Aligns card and details page rendering: snapshot-first, then flat fallbacks.
 * Use in both CarListItem (cards) and CarDetailsPage for consistency.
 */

export interface ResolvedPublicCarDisplay {
  displayName: string | null;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
}

/**
 * Resolve display name, logo, phone, WhatsApp from publicCar.
 * Priority: yardSnapshot / sellerSnapshot first, then flat fields (backward compat).
 *
 * @param publicCar - Raw publicCar from Firestore or PublicSearchResultItem (has yardSnapshot, sellerSnapshot)
 */
export function resolvePublicCarDisplay(publicCar: unknown): ResolvedPublicCarDisplay {
  const c = publicCar as Record<string, unknown>;
  if (!c) {
    return { displayName: null, logoUrl: null, phone: null, whatsapp: null };
  }

  const yardSnap =
    c.yardSnapshot && typeof c.yardSnapshot === 'object'
      ? (c.yardSnapshot as Record<string, unknown>)
      : null;
  const sellerSnap =
    c.sellerSnapshot && typeof c.sellerSnapshot === 'object'
      ? (c.sellerSnapshot as Record<string, unknown>)
      : null;

  const displayName =
    (yardSnap?.yardName as string) ||
    (sellerSnap?.sellerName as string) ||
    (c.sellerDisplayName as string) ||
    (c.yardDisplayName as string) ||
    (c.yardName as string) ||
    null;

  const logoUrl =
    (yardSnap?.yardLogoUrl as string) ||
    (sellerSnap?.sellerLogoUrl as string) ||
    ((c.yardLogoUrl as string) ?? (c.sellerLogoUrl as string) ?? null);

  const phone =
    (yardSnap?.yardPhone as string) ||
    (sellerSnap?.sellerPhone as string) ||
    ((c.yardPhone as string) ?? (c.sellerPhone as string) ?? null);

  const whatsapp =
    (yardSnap?.yardWhatsapp as string) ||
    (sellerSnap?.sellerWhatsapp as string) ||
    (sellerSnap?.sellerWhatsappPhone as string) ||
    ((c.yardWhatsappPhone as string) ?? (c.sellerWhatsappPhone as string) ?? null);

  return { displayName, logoUrl, phone, whatsapp };
}
