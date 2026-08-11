/**
 * Shared cache module for Admin Debug data (yards and cars)
 * Single source of truth - NO React dependencies, pure cache helpers
 */

export type YardLite = {
  yardUid: string;
  name?: string | null;
  phones?: string[] | null;
};

export type CarLite = {
  carId: string;
  plateNumber?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  title?: string | null;
};

const TTL_MS = 10 * 60 * 1000; // 10 minutes

// Internal caches (module-level)
let yardsCache: { ts: number; items: YardLite[] } | null = null;
const carsCacheByYard: Record<string, { ts: number; items: CarLite[] }> = {};

export function isExpired(ts: number): boolean {
  return Date.now() - ts >= TTL_MS;
}

// Yards cache functions
export function getCachedYards(): YardLite[] | null {
  if (!yardsCache || isExpired(yardsCache.ts)) {
    return null;
  }
  return yardsCache.items;
}

export function setCachedYards(items: YardLite[]): void {
  yardsCache = { ts: Date.now(), items };
}

export function clearYardsCache(): void {
  yardsCache = null;
}

// Cars cache functions (per-yard)
export function getCachedCars(yardUid: string): CarLite[] | null {
  const cache = carsCacheByYard[yardUid];
  if (!cache || isExpired(cache.ts)) {
    return null;
  }
  return cache.items;
}

export function setCachedCars(yardUid: string, items: CarLite[]): void {
  carsCacheByYard[yardUid] = { ts: Date.now(), items };
}

export function clearCarsCache(yardUid?: string): void {
  if (yardUid) {
    delete carsCacheByYard[yardUid];
  } else {
    // Clear all
    Object.keys(carsCacheByYard).forEach(key => {
      delete carsCacheByYard[key];
    });
  }
}