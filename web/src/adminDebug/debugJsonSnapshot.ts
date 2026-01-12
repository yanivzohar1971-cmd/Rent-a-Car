/**
 * Admin Debug JSON Snapshot Loader
 * 
 * Loads yards and cars from static JSON files served from /public/adminDebug/
 * Uses module-scope singleton cache to ensure single load per session.
 * NO Firebase/Firestore/Function calls - pure static JSON.
 */

export type YardLite = { yardUid: string; name?: string | null; phones?: string[] | null };
export type CarLite = { carId: string; plateNumber?: string | null; make?: string | null; model?: string | null; year?: number | null; title?: string | null };

// Module-scope singleton cache
let LOADED = false;
let LOAD_ERROR: string | null = null;
let YARDS: YardLite[] = [];
let CARS_BY_YARD: Record<string, CarLite[]> = {};

export interface SnapshotResult {
  loaded: boolean;
  error: string | null;
  yards: YardLite[];
  carsByYard: Record<string, CarLite[]>;
}

/**
 * Ensures the debug snapshot JSON files are loaded into memory.
 * Returns cached data if already loaded, otherwise fetches from /public/adminDebug/
 * 
 * @returns Promise resolving to snapshot data (yards and carsByYard)
 */
export async function ensureDebugSnapshotLoaded(): Promise<SnapshotResult> {
  // Return cached data if already loaded
  if (LOADED) {
    return {
      loaded: true,
      error: null,
      yards: YARDS,
      carsByYard: CARS_BY_YARD,
    };
  }

  // If there was a previous error, return it (don't retry automatically)
  if (LOAD_ERROR !== null) {
    return {
      loaded: false,
      error: LOAD_ERROR,
      yards: YARDS, // Keep last good data
      carsByYard: CARS_BY_YARD,
    };
  }

  try {
    // Fetch both JSON files from same origin (no network calls to Firebase)
    const [yardsResponse, carsResponse] = await Promise.all([
      fetch('/adminDebug/yards.json', { cache: 'no-store' }),
      fetch('/adminDebug/carsByYard.json', { cache: 'no-store' }),
    ]);

    // Check if both requests succeeded
    if (!yardsResponse.ok) {
      throw new Error(`Failed to load yards.json: ${yardsResponse.status} ${yardsResponse.statusText}`);
    }
    if (!carsResponse.ok) {
      throw new Error(`Failed to load carsByYard.json: ${carsResponse.status} ${carsResponse.statusText}`);
    }

    // Parse JSON
    const yardsData = await yardsResponse.json();
    const carsData = await carsResponse.json();

    // Minimal validation: ensure arrays/objects
    if (!Array.isArray(yardsData)) {
      throw new Error('yards.json must be an array');
    }
    if (typeof carsData !== 'object' || carsData === null || Array.isArray(carsData)) {
      throw new Error('carsByYard.json must be an object');
    }

    // Set module-scope cache
    YARDS = yardsData as YardLite[];
    CARS_BY_YARD = carsData as Record<string, CarLite[]>;
    LOADED = true;
    LOAD_ERROR = null;

    return {
      loaded: true,
      error: null,
      yards: YARDS,
      carsByYard: CARS_BY_YARD,
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to load debug snapshot JSON';
    LOAD_ERROR = `Missing debug snapshot JSON (/public/adminDebug/*.json): ${errorMessage}`;
    
    // DO NOT clear YARDS or CARS_BY_YARD - keep last good data
    
    return {
      loaded: false,
      error: LOAD_ERROR,
      yards: YARDS,
      carsByYard: CARS_BY_YARD,
    };
  }
}

/**
 * Reset the cache (for testing or manual refresh if needed)
 * Note: This is not used by the UI, but available for debugging
 */
export function resetDebugSnapshotCache(): void {
  LOADED = false;
  LOAD_ERROR = null;
  YARDS = [];
  CARS_BY_YARD = {};
}
