import { collection, query, where, doc, getDocsFromServer, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { CarPublicationStatus } from './yardPublishApi';
import { fetchYardCarsForUser as fetchYardCarsForUserMaster, type YardFleetFilters as MasterFilters, type YardFleetSort as MasterSort } from './carsMasterApi';
import type { CarPromotionState } from '../types/Promotion';

// Re-export for convenience
export type { CarPublicationStatus };


/**
 * Yard car type (legacy interface for backward compatibility)
 * 
 * This type wraps YardCarMaster and provides legacy fields for compatibility.
 * New code should use YardCarMaster from types/cars.ts directly.
 * 
 * @deprecated Use YardCarMaster from types/cars.ts instead
 */
export interface YardCar {
  id: string;
  publicCarId?: string | null; // Deprecated - no longer used
  brandId?: string | null;
  brandText?: string;
  brand?: string;
  modelId?: string | null;
  modelText?: string;
  model?: string;
  year?: number | null;
  salePrice?: number;
  price?: number;
  mileageKm?: number | null;
  city?: string | null;
  notes?: string | null;
  publicationStatus?: CarPublicationStatus;
  saleStatus?: 'ACTIVE' | 'SOLD';
  soldAt?: number | null;
  soldPrice?: number | null;
  createdAt?: number;
  updatedAt?: number;
  roleContext?: string;
  saleOwnerType?: string;
  gearboxType?: string | null;
  fuelType?: string | null;
  handCount?: number | null;
  color?: string | null;
  engineDisplacementCc?: number | null;
  licensePlatePartial?: string | null;
  imageCount?: number; // Derived from imageUrls.length
  mainImageUrl?: string | null;
  promotion?: CarPromotionState;
  highlightLevel?: 'none' | 'basic' | 'plus' | 'premium' | 'platinum' | 'diamond';
  importState?: 'IN_IMPORT' | 'REMOVED_FROM_IMPORT';
}

/**
 * Fleet filters
 */
export type ImageFilterMode = 'all' | 'withImages' | 'withoutImages';

export interface YardFleetFilters {
  text?: string; // Search in brand, model, licensePlatePartial, notes
  status?: CarPublicationStatus | 'ALL';
  yearFrom?: number;
  yearTo?: number;
  imageFilter?: ImageFilterMode; // Filter by image presence
}

/**
 * Sort field
 */
export type YardFleetSortField = 'createdAt' | 'updatedAt' | 'price' | 'mileageKm' | 'year';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort configuration
 */
export interface YardFleetSort {
  field: YardFleetSortField;
  direction: SortDirection;
}

/**
 * Fetch all yard cars for the current authenticated user
 * 
 * This function now uses the MASTER API (carsMasterApi) which reads ONLY from carSales.
 * It does NOT query or merge with publicCars.
 * 
 * Note: Filters and sorting are applied client-side for now
 */
export async function fetchYardCarsForUser(
  filters?: YardFleetFilters,
  sort?: YardFleetSort
): Promise<YardCar[]> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to fetch yard cars');
  }

  try {
    // Use MASTER API - reads ONLY from carSales
    // CRITICAL: Map CarPublicationStatus to YardCarMaster.status correctly
    // HIDDEN must map to 'archived' (not 'draft') to match the status update logic
    const masterFilters: MasterFilters | undefined = filters ? {
      text: filters.text,
      status: filters.status === 'ALL' ? undefined : (filters.status === 'PUBLISHED' ? 'published' : filters.status === 'HIDDEN' ? 'archived' : filters.status === 'DRAFT' ? 'draft' : undefined),
      yearFrom: filters.yearFrom,
      yearTo: filters.yearTo,
      imageFilter: filters.imageFilter,
    } : undefined;
    
    const masterSort: MasterSort | undefined = sort ? {
      field: sort.field,
      direction: sort.direction,
    } : undefined;
    
    const masterCars = await fetchYardCarsForUserMaster(user.uid, masterFilters, masterSort);
    
    // Convert YardCarMaster to legacy YardCar format for backward compatibility
    const cars = masterCars.map((masterCar): YardCar => {
      // Map status to publicationStatus
      let publicationStatus: CarPublicationStatus = 'DRAFT';
      if (masterCar.status === 'published') {
        publicationStatus = 'PUBLISHED';
      } else if (masterCar.status === 'archived') {
        publicationStatus = 'HIDDEN';
      } else {
        publicationStatus = 'DRAFT';
      }
      
      return {
        id: masterCar.id,
        publicCarId: null, // No longer used
        brandId: masterCar.brandId || null,
        brandText: masterCar.brandText || masterCar.brand || '',
        brand: masterCar.brand || masterCar.brandText || '',
        modelId: masterCar.modelId || null,
        modelText: masterCar.modelText || masterCar.model || '',
        model: masterCar.model || masterCar.modelText || '',
        year: masterCar.year,
        salePrice: masterCar.salePrice || masterCar.price || 0,
        price: masterCar.price || masterCar.salePrice || 0,
        mileageKm: masterCar.mileageKm,
        city: masterCar.city || masterCar.cityNameHe || null,
        notes: masterCar.notes || null,
        publicationStatus,
        saleStatus: masterCar.saleStatus || 'ACTIVE',
        soldAt: masterCar.soldAt || undefined,
        soldPrice: masterCar.soldPrice || undefined,
        createdAt: masterCar.createdAt || undefined,
        updatedAt: masterCar.updatedAt || undefined,
        roleContext: undefined, // Legacy field
        saleOwnerType: undefined, // Legacy field
        gearboxType: masterCar.gearType || masterCar.gearboxType || null,
        fuelType: masterCar.fuelType || null,
        handCount: masterCar.handCount || null,
        color: masterCar.color || null,
        engineDisplacementCc: masterCar.engineDisplacementCc || null,
        licensePlatePartial: masterCar.licensePlatePartial || null,
        imageCount: masterCar.imageUrls.length, // Derived from imageUrls.length
        mainImageUrl: masterCar.mainImageUrl || null,
        promotion: masterCar.promotion,
        highlightLevel: masterCar.highlightLevel,
        importState: masterCar.importState,
      };
    });
    
    // Note: Filters are already applied by carsMasterApi, but we keep this for backward compatibility
    // The master API applies filters, so this should be a no-op, but we keep it for safety
    let filteredCars: YardCar[] = cars;
    
    if (filters) {
      filteredCars = cars.filter((car: YardCar) => {
        // Text search
        if (filters.text) {
          const searchText = filters.text.toLowerCase();
          const searchableText = [
            car.brandText,
            car.modelText,
            car.licensePlatePartial,
            car.notes,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!searchableText.includes(searchText)) {
            return false;
          }
        }

        // Status filter
        if (filters.status && filters.status !== 'ALL') {
          if (car.publicationStatus !== filters.status) {
            return false;
          }
        }

        // Year range
        if (filters.yearFrom && car.year && car.year < filters.yearFrom) {
          return false;
        }
        if (filters.yearTo && car.year && car.year > filters.yearTo) {
          return false;
        }

        // Image filter
        if (filters.imageFilter) {
          const imageCount = car.imageCount || 0;
          if (filters.imageFilter === 'withImages' && imageCount === 0) {
            return false;
          }
          if (filters.imageFilter === 'withoutImages' && imageCount > 0) {
            return false;
          }
        }

        return true;
      });
    }

    // Apply sorting (client-side)
    // Note: Sorting is already applied by carsMasterApi, but we keep this for backward compatibility
    if (sort) {
      filteredCars.sort((a: YardCar, b: YardCar) => {
        let aValue: any;
        let bValue: any;

        switch (sort.field) {
          case 'createdAt':
            aValue = a.createdAt || 0;
            bValue = b.createdAt || 0;
            break;
          case 'updatedAt':
            aValue = a.updatedAt || 0;
            bValue = b.updatedAt || 0;
            break;
          case 'price':
            aValue = a.salePrice || 0;
            bValue = b.salePrice || 0;
            break;
          case 'mileageKm':
            aValue = a.mileageKm || 0;
            bValue = b.mileageKm || 0;
            break;
          case 'year':
            aValue = a.year || 0;
            bValue = b.year || 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sort.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sort.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    } else {
      // Default sort by updatedAt desc
      filteredCars.sort((a: YardCar, b: YardCar) => {
        const aValue = a.updatedAt || 0;
        const bValue = b.updatedAt || 0;
        return bValue - aValue;
      });
    }

    return filteredCars;
  } catch (error) {
    console.error('Error fetching yard cars:', error);
    throw error;
  }
}

/**
 * Resolve the publicCars document ID for a given yard carSaleId.
 *
 * This is a robust, read-only helper used at share time (Smart Publish),
 * in case the initial publicCarsMap mapping missed some documents.
 *
 * Resolution strategy:
 *   1. Try "carSaleId" == carSaleId
 *   2. Try "originalCarId" == carSaleId
 *   3. Try "carId" == carSaleId
 *   4. As a last resort, if exactly one publicCars doc exists with id == carSaleId,
 *      use that (handles legacy flows where publicCars doc ID matches carSales doc ID).
 *
 * Returns:
 *   - publicCars doc ID (string) if found
 *   - null if no matching public listing is found
 */
export async function resolvePublicCarIdForCarSale(
  carSaleId: string
): Promise<string | null> {
  if (!carSaleId || typeof carSaleId !== 'string') {
    console.warn('[resolvePublicCarIdForCarSale] Invalid carSaleId provided:', carSaleId);
    return null;
  }

  try {
    const publicCarsRef = collection(db, 'publicCars');
    const results: string[] = [];

    // Helper to run a query & push doc IDs into results
    async function addMatches(field: string) {
      try {
        const q = query(publicCarsRef, where(field, '==', carSaleId));
        const snap = await getDocsFromServer(q);
        snap.docs.forEach((docSnap) => {
          const id = docSnap.id;
          if (id && !results.includes(id)) {
            results.push(id);
          }
        });
      } catch (queryErr) {
        // Non-blocking: log and continue to next query
        console.warn(`[resolvePublicCarIdForCarSale] Query on ${field} failed:`, queryErr);
      }
    }

    // Try multiple linkage fields
    await addMatches('carSaleId');
    await addMatches('originalCarId');
    await addMatches('carId');

    // If we found any matches, return the first one
    if (results.length > 0) {
      console.log('[resolvePublicCarIdForCarSale] Found publicCarId via field query:', {
        carSaleId,
        publicCarId: results[0],
        totalMatches: results.length,
      });
      return results[0];
    }

    // Last resort: check if a publicCars doc exists with ID == carSaleId
    // This handles legacy flows where the publicCars doc ID matches the carSales doc ID directly
    try {
      const docRef = doc(publicCarsRef, carSaleId);
      const docSnap = await getDocFromServer(docRef);
      if (docSnap.exists()) {
        console.log('[resolvePublicCarIdForCarSale] Found publicCars doc by direct ID match:', {
          carSaleId,
          publicCarId: docSnap.id,
        });
        return docSnap.id;
      }
    } catch (directErr) {
      console.warn('[resolvePublicCarIdForCarSale] Direct doc lookup failed:', directErr);
    }

    // No matching publicCars document found
    console.warn('[resolvePublicCarIdForCarSale] No publicCars doc found for carSaleId:', carSaleId);
    return null;
  } catch (error) {
    console.error('[resolvePublicCarIdForCarSale] Error resolving publicCarId:', error);
    return null;
  }
}

