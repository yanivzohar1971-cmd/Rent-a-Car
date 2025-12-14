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
      mainImageUrl: yardCar.mainImageUrl,
      // Store a small subset of imageUrls for listing (first 5)
      imageUrls: (yardCar.imageUrls || []).slice(0, 5),
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
    // Query only published cars - force server fetch to avoid stale cache
    const publicCarsCollection = collection(db, 'publicCars');
    const q = query(publicCarsCollection, where('isPublished', '==', true));
    const snapshot = await getDocsFromServer(q);

    // Map Firestore documents to PublicCar objects
    const publicCars: PublicCar[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
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
        mainImageUrl: data.mainImageUrl || null,
        imageUrls: data.imageUrls || [],
        bodyType: data.bodyType || null,
        color: data.color || null,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      };
    });

    // Apply in-memory filters (same logic as carsApi for compatibility)
    const manufacturerIds = filters.manufacturerIds && filters.manufacturerIds.length > 0
      ? filters.manufacturerIds
      : filters.manufacturer
        ? [filters.manufacturer.trim()]
        : [];
    const model = filters.model?.trim();
    
    // Location filter: support both cityId (from location catalog) and city/cityNameHe (from data)
    // Map cityId to cityNameHe if needed
    let cityNameHeFilter: string | undefined = undefined;
    let cityNameEnFilter: string | undefined = undefined;
    if (filters.cityId) {
      // Try to resolve cityId to cityNameHe using location catalog
      try {
        if (filters.regionId) {
          const city = getCityById(filters.regionId, filters.cityId);
          if (city) {
            cityNameHeFilter = city.labelHe;
          }
        }
        // If regionId not provided, search all regions
        if (!cityNameHeFilter) {
          const regions = getRegions();
          for (const region of regions) {
            const city = region.cities.find(c => c.id === filters.cityId);
            if (city) {
              cityNameHeFilter = city.labelHe;
              break;
            }
          }
        }
      } catch (err) {
        // Fallback: use cityId as-is (might be a name already)
        if (import.meta.env.DEV) {
          console.warn('[publicCarsApi] Could not resolve cityId to cityNameHe:', filters.cityId);
        }
      }
      // If resolution failed, fail open (don't filter by city)
      if (!cityNameHeFilter) {
        if (import.meta.env.DEV) {
          console.log('[publicCarsApi] cityId could not be resolved, skipping city filter:', filters.cityId);
        }
      }
    }

    const filtered = publicCars.filter((car) => {
      // Yard filter
      if (filters.lockedYardId && car.yardUid !== filters.lockedYardId) {
        return false;
      }

      // Brand filter
      if (manufacturerIds.length > 0 && car.brand) {
        const carBrandLower = car.brand.toLowerCase();
        const matchesBrand = manufacturerIds.some(brandId => 
          carBrandLower.includes(brandId.toLowerCase())
        );
        if (!matchesBrand) {
          return false;
        }
      }

      // Model filter
      if (model && car.model && !car.model.toLowerCase().includes(model.toLowerCase())) {
        return false;
      }

      // Year filters
      if (filters.minYear && car.year && car.year < filters.minYear) {
        return false;
      }
      if (filters.yearFrom !== undefined && car.year && car.year < filters.yearFrom) {
        return false;
      }
      if (filters.yearTo !== undefined && car.year && car.year > filters.yearTo) {
        return false;
      }

      // Price filters
      if (filters.maxPrice && car.price && car.price > filters.maxPrice) {
        return false;
      }
      if (filters.priceFrom !== undefined && car.price && car.price < filters.priceFrom) {
        return false;
      }
      if (filters.priceTo !== undefined && car.price && car.price > filters.priceTo) {
        return false;
      }

      // Mileage filters
      if (filters.kmFrom !== undefined && car.mileageKm && car.mileageKm < filters.kmFrom) {
        return false;
      }
      if (filters.kmTo !== undefined && car.mileageKm && car.mileageKm > filters.kmTo) {
        return false;
      }

      // Location filters: support cityId (mapped to cityNameHe) OR direct city/cityNameHe match
      // Normalize and compare against all possible city fields
      if (cityNameHeFilter) {
        const normalizedFilter = normalizeCity(cityNameHeFilter);
        // Check all possible city fields in car data
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
        // Fallback: try direct match with normalized comparison
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

      // Advanced filters: gearboxTypes, fuelTypes, bodyTypes (normalized to arrays)
      const gearboxTypes = toArray(filters.gearboxTypes);
      if (gearboxTypes.length > 0 && car.gearType) {
        const carGearbox = String(car.gearType);
        if (!gearboxTypes.includes(carGearbox as any)) {
          return false;
        }
      }
      
      const fuelTypes = toArray(filters.fuelTypes);
      if (fuelTypes.length > 0 && car.fuelType) {
        const carFuel = String(car.fuelType);
        if (!fuelTypes.includes(carFuel as any)) {
          return false;
        }
      }
      
      const bodyTypes = toArray(filters.bodyTypes);
      if (bodyTypes.length > 0 && car.bodyType) {
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

/**
 * Rebuild publicCars projection for the current yard
 * 
 * This callable function triggers a server-side rebuild of the publicCars projection
 * for all cars in the authenticated yard's inventory. Useful for repair/backfill
 * when projection is out of sync.
 * 
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

