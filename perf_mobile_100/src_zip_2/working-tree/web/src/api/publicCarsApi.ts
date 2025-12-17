/**
 * PUBLIC Car Projection API
 * 
 * This module handles the public projection of yard cars
 * stored in publicCars/{carId}.
 * 
 * The publicCars collection is a projection derived from MASTER (carSales).
 * It contains only fields needed for listing, filtering, and basic display.
 * 
 * IMPORTANT: This module should NOT be used for yard management screens.
 * Yard screens should use carsMasterApi.ts instead.
 */

import { doc, setDoc, deleteDoc, serverTimestamp, collection, query, where, getDocsFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/firebaseClient';
import type { YardCarMaster, PublicCar } from '../types/cars';
import type { CarFilters } from './carsApi';
import { getCityById, getRegions } from '../catalog/locationCatalog';
import { normalizeRanges } from '../utils/rangeValidation';
import { normalizeCarImages } from '../utils/carImageHelper';

/**
 * Normalize text for comparison (trim, lowercase, remove double spaces, normalize punctuation)
 * Handles Hebrew apostrophe variants (צ'רי / צ׳רי) and quotes
 */
function normalizeComparableText(s: string): string {
  if (typeof s !== 'string') return '';
  
  let normalized = s.trim();
  
  // Convert Hebrew geresh ׳ and typographic ' to ASCII '
  normalized = normalized.replace(/['׳']/g, "'");
  
  // Remove quotes (Hebrew ״ and ASCII ")
  normalized = normalized.replace(/["״]/g, '');
  
  // Replace hyphens with space
  normalized = normalized.replace(/[־-]/g, ' ');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Remove extra punctuation (keep letters/numbers/spaces and apostrophes)
  normalized = normalized.replace(/[.,;:]/g, '').trim();
  
  return normalized.toLowerCase();
}

/**
 * Check if value matches any token in selected array (normalized comparison)
 * Supports both exact match and contains (bidirectional tolerance)
 */
function matchesAnyToken(value: string, selected: string[]): boolean {
  if (!value || selected.length === 0) return false;
  
  const normalizedValue = normalizeComparableText(value);
  
  for (const token of selected) {
    const normalizedToken = normalizeComparableText(token);
    // Exact match OR contains (bidirectional)
    if (normalizedValue === normalizedToken || 
        normalizedValue.includes(normalizedToken) || 
        normalizedToken.includes(normalizedValue)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Normalize city string for comparison (trim, remove double spaces, normalize punctuation)
 * Handles common Tel Aviv variants and abbreviations
 */
function normalizeCity(s: unknown): string {
  if (typeof s !== 'string') return '';
  
  let normalized = s.trim();
  
  // Replace hyphen variations (Hebrew hyphen "־" and regular "-") with space
  normalized = normalized.replace(/[־-]/g, ' ');
  
  // Normalize common Tel Aviv abbreviations
  normalized = normalized.replace(/ת״א|ת''א|ת"א/g, 'תל אביב');
  
  // Handle common Tel Aviv variants (remove "יפו" suffix)
  normalized = normalized.replace(/תל אביב יפו/gi, 'תל אביב');
  
  // Collapse multiple spaces and remove punctuation
  normalized = normalized.replace(/\s+/g, ' ').replace(/[.,;:]/g, '').trim();
  
  // Remove duplicate adjacent tokens (e.g. "תל אביב תל אביב" -> "תל אביב")
  // Match any sequence of non-space chars followed by space(s) and the same sequence
  // Apply until convergent (handles multiple duplicates like "תל אביב תל אביב תל אביב")
  let prev;
  do {
    prev = normalized;
    normalized = normalized.replace(/([^\s]+)\s+\1/g, '$1');
  } while (normalized !== prev);
  
  return normalized.toLowerCase();
}

/**
 * Convert value to array, handling string, array, comma-delimited, or undefined
 */
function toArray<T extends string>(v: T | T[] | string | undefined): T[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const parts = v.split(',').map(s => s.trim()).filter(Boolean);
    return parts as T[];
  }
  return [];
}

// Re-export PublicCar for convenience
export type { PublicCar };

/**
 * Create or update a public car projection from a YardCarMaster
 * 
 * This function enforces the invariant that:
 * - publicCars/{carId} uses the same carId as MASTER
 * - ownerType = 'yard'
 * - yardUid is stored
 * - isPublished + publishedAt are set correctly
 * 
 * @param yardCar - The MASTER car to project to public
 */
export async function upsertPublicCarFromYardCar(yardCar: YardCarMaster): Promise<void> {
  try {
    // Enforce invariants
    if (!yardCar.id || !yardCar.yardUid) {
      throw new Error('YardCarMaster must have id and yardUid');
    }
    
    if (yardCar.ownerType !== 'yard') {
      throw new Error('YardCarMaster must have ownerType="yard"');
    }
    
    // Only publish if status is 'published'
    if (yardCar.status !== 'published') {
      // If not published, delete from publicCars instead
      if (import.meta.env.DEV) {
        console.log('[publicCarsApi] Car not published, unpublishing:', {
          carId: yardCar.id,
          status: yardCar.status,
        });
      }
      await unpublishPublicCar(yardCar.id);
      return;
    }
    
    // Build PublicCar projection
    const cityNameHe = yardCar.cityNameHe || yardCar.city || null;
    const city = yardCar.city || yardCar.cityNameHe || null;
    
    // Extract and validate imageUrls (cap at 20 for details gallery)
    const urls = (yardCar.imageUrls || []).filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
    const urlsCapped = urls.slice(0, 20);
    
    // Safe main fallback: use mainImageUrl if valid, otherwise first URL
    const main = (typeof yardCar.mainImageUrl === 'string' && /^https?:\/\//.test(yardCar.mainImageUrl))
      ? yardCar.mainImageUrl
      : (urlsCapped[0] ?? null);
    
    const publicCar: PublicCar = {
      carId: yardCar.id, // Same carId as MASTER
      yardUid: yardCar.yardUid,
      ownerType: 'yard',
      isPublished: true,
      publishedAt: Date.now(),
      highlightLevel: 'none', // Default, can be updated via promotions
      brand: yardCar.brand,
      model: yardCar.model,
      year: yardCar.year,
      mileageKm: yardCar.mileageKm,
      price: yardCar.price,
      gearType: yardCar.gearType,
      fuelType: yardCar.fuelType,
      cityNameHe: cityNameHe,
      mainImageUrl: main,
      // Store enough imageUrls for details gallery (capped at 20)
      imageUrls: urlsCapped,
      bodyType: yardCar.bodyType || null,
      color: yardCar.color || null,
      createdAt: yardCar.createdAt || null,
      updatedAt: Date.now(),
    };
    
    // Write to Firestore - include both cityNameHe and city for backward compatibility
    const publicCarRef = doc(db, 'publicCars', yardCar.id);
    await setDoc(publicCarRef, {
      ...publicCar,
      city: city, // Also write 'city' field for backward compatibility with Buyer page
      updatedAt: serverTimestamp(),
      createdAt: publicCar.createdAt ? serverTimestamp() : serverTimestamp(),
    }, { merge: true });
    
    if (import.meta.env.DEV) {
      console.log('[publicCarsApi] Upserted public car projection:', {
        carId: yardCar.id,
        yardUid: yardCar.yardUid,
        isPublished: true,
        status: yardCar.status,
      });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[publicCarsApi] Error upserting public car:', error);
    }
    throw error;
  }
}

/**
 * Unpublish a car (delete from publicCars or mark as unpublished)
 * 
 * @param carId - Car ID (must match MASTER carId)
 */
export async function unpublishPublicCar(carId: string): Promise<void> {
  try {
    if (!carId || typeof carId !== 'string' || carId.trim() === '') {
      throw new Error('carId must be a non-empty string');
    }
    
    const publicCarRef = doc(db, 'publicCars', carId);
    
    // Option 1: Delete the document entirely
    // This is cleaner and ensures no stale data
    await deleteDoc(publicCarRef);
    
    if (import.meta.env.DEV) {
      console.log('[publicCarsApi] Unpublished public car (deleted):', { carId });
    }
  } catch (error: any) {
    // If document doesn't exist, that's fine (already unpublished)
    // Firestore uses different error codes depending on the SDK version
    const errorCode = error?.code || error?.errorInfo?.code || '';
    if (errorCode === 'not-found' || errorCode === 'NOT_FOUND' || errorCode === 5) {
      if (import.meta.env.DEV) {
        console.log('[publicCarsApi] Public car already unpublished (not found):', { carId });
      }
      return; // Silently succeed if already unpublished
    }
    
    // For permission errors, also log but don't fail (car might not be published yet)
    if (errorCode === 'permission-denied' || errorCode === 'PERMISSION_DENIED' || errorCode === 7) {
      if (import.meta.env.DEV) {
        console.warn('[publicCarsApi] Permission denied when unpublishing (may not exist):', { carId });
      }
      return; // Silently succeed - car is effectively unpublished
    }
    
    // For other errors, log and rethrow
    if (import.meta.env.DEV) {
      console.error('[publicCarsApi] Error unpublishing public car:', {
        carId,
        errorCode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

/**
 * Batch unpublish multiple cars
 * 
 * @param carIds - Array of car IDs to unpublish
 */
export async function batchUnpublishPublicCars(carIds: string[]): Promise<void> {
  try {
    await Promise.all(carIds.map(carId => unpublishPublicCar(carId)));
    if (import.meta.env.DEV) {
      console.log('[publicCarsApi] Batch unpublished cars:', { count: carIds.length });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[publicCarsApi] Error batch unpublishing cars:', error);
    }
    throw error;
  }
}

/**
 * Fetch published public cars from Firestore
 * 
 * Reads ONLY from publicCars collection with isPublished == true.
 * No auth dependency - public read access.
 * 
 * @param filters - Filter criteria (same as CarFilters for compatibility)
 * @returns Array of PublicCar documents
 */
export async function fetchPublicCars(filters: CarFilters): Promise<PublicCar[]> {
  try {
    // Defense-in-depth: normalize ranges before building query
    // This ensures reversed ranges never reach Firestore filters
    const rangeNormalized = normalizeRanges(filters);
    const normalizedFilters = rangeNormalized.normalized;
    
    // Query only published cars - force server fetch to avoid stale cache
    const publicCarsCollection = collection(db, 'publicCars');
    const q = query(publicCarsCollection, where('isPublished', '==', true));
    const snapshot = await getDocsFromServer(q);

    // Map Firestore documents to PublicCar objects with defensive normalization
    const publicCars: PublicCar[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      
      // Defensive normalization: extract images from various formats (legacy support)
      const normalized = normalizeCarImages(data);
      
      return {
        carId: docSnap.id,
        yardUid: data.yardUid || '',
        ownerType: 'yard' as const,
        isPublished: data.isPublished === true,
        publishedAt: data.publishedAt || null,
        highlightLevel: data.highlightLevel || 'none',
        brand: data.brand || null,
        model: data.model || null,
        year: data.year || null,
        mileageKm: data.mileageKm || null,
        price: data.price || null,
        gearType: data.gearType || null,
        fuelType: data.fuelType || null,
        cityNameHe: data.cityNameHe || data.city || null,
        city: data.city || data.cityNameHe || null,
        mainImageUrl: normalized.mainImageUrl,
        imageUrls: normalized.imageUrls,
        bodyType: data.bodyType || null,
        color: data.color || null,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      };
    });

    // Apply in-memory filters (same logic as carsApi for compatibility)
    // Use normalizedFilters to ensure ranges are correct
    const manufacturerIds = normalizedFilters.manufacturerIds && normalizedFilters.manufacturerIds.length > 0
      ? normalizedFilters.manufacturerIds
      : normalizedFilters.manufacturer
        ? [normalizedFilters.manufacturer.trim()]
        : [];
    const model = normalizedFilters.model?.trim();
    
    // Location filter: support both cityId (from location catalog) and city/cityNameHe (from data)
    // Map cityId to cityNameHe if needed
    let cityNameHeFilter: string | undefined = undefined;
    if (normalizedFilters.cityId) {
      // Try to resolve cityId to cityNameHe using location catalog
      try {
        if (normalizedFilters.regionId) {
          const city = getCityById(normalizedFilters.regionId, normalizedFilters.cityId);
          if (city) {
            cityNameHeFilter = city.labelHe;
          }
        }
        // If regionId not provided, search all regions
        if (!cityNameHeFilter) {
          const regions = getRegions();
          for (const region of regions) {
            const city = region.cities.find(c => c.id === normalizedFilters.cityId);
            if (city) {
              cityNameHeFilter = city.labelHe;
              break;
            }
          }
        }
      } catch (err) {
        // Fallback: use cityId as-is (might be a name already)
        if (import.meta.env.DEV) {
          console.warn('[publicCarsApi] Could not resolve cityId to cityNameHe:', normalizedFilters.cityId);
        }
      }
      // If resolution failed, fail open (don't filter by city)
      if (!cityNameHeFilter) {
        if (import.meta.env.DEV) {
          console.log('[publicCarsApi] cityId could not be resolved, skipping city filter:', normalizedFilters.cityId);
        }
      }
    }

    const filtered = publicCars.filter((car) => {
      // Yard filter
      if (normalizedFilters.lockedYardId && car.yardUid !== normalizedFilters.lockedYardId) {
        return false;
      }

      // Brand filter - STRICT: require brand field if filter is active
      if (manufacturerIds.length > 0) {
        if (!car.brand || typeof car.brand !== 'string' || car.brand.trim() === '') {
          return false; // Exclude cars without brand when filter is active
        }
        if (!matchesAnyToken(car.brand, manufacturerIds)) {
          return false;
        }
      }

      // Model filter - STRICT: require model field if filter is active
      if (model) {
        if (!car.model || typeof car.model !== 'string' || car.model.trim() === '') {
          return false; // Exclude cars without model when filter is active
        }
        const normalizedCarModel = normalizeComparableText(car.model);
        const normalizedFilter = normalizeComparableText(model);
        if (normalizedCarModel !== normalizedFilter && 
            !normalizedCarModel.includes(normalizedFilter) && 
            !normalizedFilter.includes(normalizedCarModel)) {
          return false;
        }
      }

      // Year filters - STRICT: require year field if filter is active
      // Use normalizedFilters to ensure ranges are correct
      if (normalizedFilters.minYear !== undefined) {
        if (car.year === null || car.year === undefined || typeof car.year !== 'number') {
          return false;
        }
        if (car.year < normalizedFilters.minYear) {
          return false;
        }
      }
      if (normalizedFilters.yearFrom !== undefined) {
        if (car.year === null || car.year === undefined || typeof car.year !== 'number') {
          return false;
        }
        if (car.year < normalizedFilters.yearFrom) {
          return false;
        }
      }
      if (normalizedFilters.yearTo !== undefined) {
        if (car.year === null || car.year === undefined || typeof car.year !== 'number') {
          return false;
        }
        if (car.year > normalizedFilters.yearTo) {
          return false;
        }
      }

      // Price filters - STRICT: require price field if filter is active
      if (normalizedFilters.maxPrice !== undefined) {
        if (car.price === null || car.price === undefined || typeof car.price !== 'number') {
          return false;
        }
        if (car.price > normalizedFilters.maxPrice) {
          return false;
        }
      }
      if (normalizedFilters.priceFrom !== undefined) {
        if (car.price === null || car.price === undefined || typeof car.price !== 'number') {
          return false;
        }
        if (car.price < normalizedFilters.priceFrom) {
          return false;
        }
      }
      if (normalizedFilters.priceTo !== undefined) {
        if (car.price === null || car.price === undefined || typeof car.price !== 'number') {
          return false;
        }
        if (car.price > normalizedFilters.priceTo) {
          return false;
        }
      }

      // Mileage filters - STRICT: require mileageKm field if filter is active
      if (normalizedFilters.kmFrom !== undefined) {
        if (car.mileageKm === null || car.mileageKm === undefined || typeof car.mileageKm !== 'number') {
          return false;
        }
        if (car.mileageKm < normalizedFilters.kmFrom) {
          return false;
        }
      }
      if (normalizedFilters.kmTo !== undefined) {
        if (car.mileageKm === null || car.mileageKm === undefined || typeof car.mileageKm !== 'number') {
          return false;
        }
        if (car.mileageKm > normalizedFilters.kmTo) {
          return false;
        }
      }

      // Location filters - STRICT: require city field if filter is active
      if (cityNameHeFilter) {
        const carCity = car.cityNameHe || car.city;
        if (!carCity || typeof carCity !== 'string' || carCity.trim() === '') {
          return false; // Exclude cars without city when filter is active
        }
        const normalizedFilter = normalizeCity(cityNameHeFilter);
        const carCityCandidates = [
          normalizeCity(car.cityNameHe),
          normalizeCity(car.city),
          normalizeCity((car as any).cityName), // Legacy field if exists
        ].filter(Boolean);
        
        const matches = carCityCandidates.some(candidate => candidate === normalizedFilter);
        if (!matches) {
          return false;
        }
      } else if (filters.cityId) {
        const carCity = car.cityNameHe || car.city;
        if (!carCity || typeof carCity !== 'string' || carCity.trim() === '') {
          return false; // Exclude cars without city when filter is active
        }
        const normalizedFilter = normalizeCity(filters.cityId);
        const carCityCandidates = [
          normalizeCity(car.cityNameHe),
          normalizeCity(car.city),
          normalizeCity((car as any).cityName),
        ].filter(Boolean);
        
        const matches = carCityCandidates.some(candidate => candidate === normalizedFilter);
        if (!matches) {
          return false;
        }
      }

      // Advanced filters - STRICT: require field if filter is active
      const gearboxTypes = toArray(normalizedFilters.gearboxTypes);
      if (gearboxTypes.length > 0) {
        if (!car.gearType || typeof car.gearType !== 'string') {
          return false; // Exclude cars without gearType when filter is active
        }
        const carGearbox = String(car.gearType);
        if (!gearboxTypes.includes(carGearbox as any)) {
          return false;
        }
      }
      
      const fuelTypes = toArray(normalizedFilters.fuelTypes);
      if (fuelTypes.length > 0) {
        if (!car.fuelType || typeof car.fuelType !== 'string') {
          return false; // Exclude cars without fuelType when filter is active
        }
        const carFuel = String(car.fuelType);
        if (!fuelTypes.includes(carFuel as any)) {
          return false;
        }
      }
      
      const bodyTypes = toArray(normalizedFilters.bodyTypes);
      if (bodyTypes.length > 0) {
        if (!car.bodyType || typeof car.bodyType !== 'string') {
          return false; // Exclude cars without bodyType when filter is active
        }
        const carBody = String(car.bodyType);
        if (!bodyTypes.includes(carBody as any)) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[publicCarsApi] Error fetching public cars:', error);
    }
    throw error;
  }
}

// --- throttle guard: prevents spam rebuild calls
const _rebuildLastRunMs = new Map<string, number>();

export async function rebuildPublicCarsForYardThrottled(
  yardUid: string,
  minIntervalMs: number = 60_000
): Promise<{ skipped: boolean }> {
  const now = Date.now();
  const last = _rebuildLastRunMs.get(yardUid) ?? 0;
  if (now - last < minIntervalMs) return { skipped: true };
  _rebuildLastRunMs.set(yardUid, now);
  await rebuildPublicCarsForYard();
  return { skipped: false };
}

/**
 * Rebuild publicCars projection for the current yard (legacy, non-throttled)
 * 
 * @deprecated Use rebuildPublicCarsForYardThrottled instead
 * @returns Promise with rebuild statistics
 */
export async function rebuildPublicCarsForYard(): Promise<{
  success: boolean;
  processed: number;
  upserted: number;
  unpublished: number;
  errors: number;
  message: string;
}> {
  try {
    const rebuildFn = httpsCallable(functions, 'rebuildPublicCarsForYard');
    const result = await rebuildFn();
    const data = result.data as any;
    
    if (import.meta.env.DEV) {
      console.log('[publicCarsApi] Rebuild completed:', data);
    }
    return {
      success: data.success || false,
      processed: data.processed || 0,
      upserted: data.upserted || 0,
      unpublished: data.unpublished || 0,
      errors: data.errors || 0,
      message: data.message || 'Rebuild completed',
    };
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.error('[publicCarsApi] Error calling rebuildPublicCarsForYard:', error);
    }
    throw new Error(error.message || 'Failed to rebuild publicCars projection');
  }
}

