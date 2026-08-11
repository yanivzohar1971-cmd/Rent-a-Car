import type { PublicCar } from '../types/cars';

/**
 * Legacy homepage ordering helper: maps `layout.featuredCarIds` (persisted ids) to real `PublicCar` rows
 * in display order. Used only when {@link getTenantHomepageSelectionMeta} is in `legacy_fallback` mode
 * (no cars flagged with `showInHomeCarousel`). Not used for the primary yard-managed homepage path.
 */
export function orderPublicCarsByFeaturedIds(allCars: PublicCar[], featuredCarIds: string[]): PublicCar[] {
  if (featuredCarIds.length === 0) return [];
  const map = new Map(allCars.map((c) => [c.carId, c]));
  const out: PublicCar[] = [];
  for (const id of featuredCarIds) {
    const c = map.get(id);
    if (c) out.push(c);
  }
  return out;
}
