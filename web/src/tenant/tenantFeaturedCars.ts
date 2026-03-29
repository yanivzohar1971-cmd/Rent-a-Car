import type { PublicCar } from '../types/cars';

/** Map config order to real cars; drops missing/unpublished ids safely. */
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
