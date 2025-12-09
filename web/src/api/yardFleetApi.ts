import { collection, getDocsFromServer, query, orderBy, where, doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { CarPublicationStatus } from './yardPublishApi';
import { normalizeCarImages } from '../utils/carImageHelper';

// Re-export for convenience
export type { CarPublicationStatus };

/**
 * Helper to normalize a value to a number.
 * Handles string numbers (e.g. "7") and returns null for invalid values.
 * File-local only - not exported.
 */
function normalizeNumber(value: any): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return null;
}

/**
 * Yard car type (from users/{uid}/carSales collection, enhanced with publicCars data)
 * 
 * Note: publicationStatus is determined by:
 *   1. First, check carSales.publicationStatus field (if exists and valid)
 *   2. If missing/invalid, check if car exists in publicCars with isPublished: true → PUBLISHED
 *   3. Otherwise, check legacy fields (isPublished, isHidden, status, etc.)
 *   4. Default to DRAFT only if no evidence of publication exists
 * 
 * Note: imageCount is determined by:
 *   1. First, check publicCars.imageUrls array length (if car is published)
 *   2. Otherwise, check carSales.imagesCount field (if exists)
 *   3. Otherwise, parse carSales.imagesJson
 *   4. Default to 0 if no images found
 */
export interface YardCar {
  id: string; // carSales doc ID
  publicCarId?: string | null; // matching document in publicCars, if any
  brandId?: string | null;
  brandText?: string;
  brand?: string; // Legacy
  modelId?: string | null;
  modelText?: string;
  model?: string; // Legacy
  year?: number | null;
  salePrice?: number;
  price?: number; // Alias for salePrice
  mileageKm?: number | null;
  city?: string | null;
  notes?: string | null;
  publicationStatus?: CarPublicationStatus; // 'DRAFT' | 'HIDDEN' | 'PUBLISHED' - single source of truth
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
  imageCount?: number; // Number of images (prefer imagesCount field from Firestore, fallback to parsing imagesJson)
  mainImageUrl?: string | null; // First image URL from publicCars (for Smart Publish image sharing)
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
    const carSalesRef = collection(db, 'users', user.uid, 'carSales');
    const q = query(
      carSalesRef,
      orderBy('updatedAt', 'desc')
    );
    const snapshot = await getDocsFromServer(q);

    // Fetch all published cars from publicCars collection for this yard
    // This helps us determine real publication status and get images count
    interface PublicCarMapEntry {
      publicCarId: string;
      isPublished: boolean;
      imageUrls?: string[];
      imagesCount?: number;
    }

    const publicCarsMap = new Map<string, PublicCarMapEntry>();
    try {
      const publicCarsRef = collection(db, 'publicCars');

      // Helper to add/merge a publicCars document into the map
      // Maps to ALL candidate keys to ensure we find the car regardless of which field links it
      const addPublicCarToMap = (docSnap: any) => {
        const pubData: any = docSnap.data();
        const publicCarId = docSnap.id; // actual publicCars doc ID

        // Collect all possible keys that could link this publicCars doc to a carSales doc
        const rawCandidates = [
          pubData.carSaleId,
          pubData.originalCarId,
          pubData.carId,
          pubData.id,
          publicCarId, // allow direct mapping by publicCars id as well
        ];

        const candidateKeys = Array.from(
          new Set(
            rawCandidates
              .map((v) => (typeof v === 'string' ? v.trim() : ''))
              .filter((v) => v.length > 0),
          ),
        );

        if (candidateKeys.length === 0) {
          console.warn('[YardFleet] publicCars doc without any linkable key', {
            publicCarId,
            pubData,
          });
          return;
        }

        // Normalize imagesCount from various field names/types (string, number, legacy casing)
        let normalizedImagesCount =
          normalizeNumber((pubData as any).imagesCount) ??
          normalizeNumber((pubData as any).ImagesCount) ??
          normalizeNumber((pubData as any).images_count);

        // If explicit count is missing, derive from imageUrls array length
        if (normalizedImagesCount === null && Array.isArray(pubData.imageUrls) && pubData.imageUrls.length > 0) {
          normalizedImagesCount = pubData.imageUrls.length;
        }

        const entry: PublicCarMapEntry = {
          publicCarId,
          isPublished: pubData.isPublished === true,
          imageUrls: Array.isArray(pubData.imageUrls) ? pubData.imageUrls : undefined,
          imagesCount: normalizedImagesCount ?? undefined,
        };

        // Map this entry under ALL candidate keys
        for (const key of candidateKeys) {
          const existing = publicCarsMap.get(key);
          if (existing) {
            // Merge duplicates from multiple docs defensively
            publicCarsMap.set(key, {
              publicCarId: existing.publicCarId || entry.publicCarId,
              isPublished: existing.isPublished || entry.isPublished,
              imageUrls: entry.imageUrls ?? existing.imageUrls,
              imagesCount:
                typeof entry.imagesCount === 'number'
                  ? entry.imagesCount
                  : existing.imagesCount,
            });
          } else {
            publicCarsMap.set(key, entry);
          }
        }
      };

      // Try all relevant owner fields: yardUid, ownerUid, userId
      const queries = [
        query(publicCarsRef, where('yardUid', '==', user.uid)),
        query(publicCarsRef, where('ownerUid', '==', user.uid)),
        query(publicCarsRef, where('userId', '==', user.uid)),
      ];

      for (const qPublic of queries) {
        try {
          const snap = await getDocsFromServer(qPublic);
          snap.docs.forEach(addPublicCarToMap);
        } catch (innerErr) {
          console.warn('Error fetching publicCars for yard fleet (sub-query, non-blocking):', innerErr);
        }
      }
    } catch (pubErr) {
      console.warn('Error initializing publicCars fetch for yard fleet (non-blocking):', pubErr);
      // Continue without publicCars data - will use carSales data only
    }

    let cars = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const carId = docSnap.id;
      
      // Check if this car exists in publicCars (indicates it's published)
      const publicCarData = publicCarsMap.get(carId);
      const existsInPublicCars = !!publicCarData;
      const isPublishedInPublicCars = publicCarData?.isPublished === true;
      const publicCarId = publicCarData?.publicCarId ?? null;
      
      // Read publicationStatus - check multiple sources to determine real status
      // Priority: 1) carSales.publicationStatus, 2) publicCars.isPublished, 3) legacy fields, 4) default
      let publicationStatus: string | undefined = data.publicationStatus;
      
      // If publicationStatus is missing or invalid, check publicCars first (most reliable)
      if (!publicationStatus || typeof publicationStatus !== 'string' || publicationStatus.trim() === '') {
        if (isPublishedInPublicCars) {
          // Car exists in publicCars with isPublished: true → definitely PUBLISHED
          publicationStatus = 'PUBLISHED';
          console.log(`Car ${carId} found in publicCars with isPublished: true, marking as PUBLISHED`);
        } else if (existsInPublicCars && !isPublishedInPublicCars) {
          // Exists in publicCars but not published → might be HIDDEN or DRAFT
          publicationStatus = 'HIDDEN';
        } else {
          // Not in publicCars, check legacy fields
          if (typeof data.isHidden === 'boolean' && data.isHidden === true) {
            publicationStatus = 'HIDDEN';
          } else if (typeof data.isPublished === 'boolean' && data.isPublished === true) {
            publicationStatus = 'PUBLISHED';
          } else if (typeof data.isPublished === 'boolean' && data.isPublished === false) {
            publicationStatus = 'DRAFT';
          } else if (typeof data.status === 'string' && data.status.trim() !== '') {
            publicationStatus = data.status;
          } else if (typeof data.carStatus === 'string' && data.carStatus.trim() !== '') {
            publicationStatus = data.carStatus;
          } else {
            // No clear evidence - default to DRAFT
            publicationStatus = 'DRAFT';
            if (!data.publicationStatus) {
              console.warn(`Car ${carId} missing publicationStatus field, defaulting to DRAFT`);
            }
          }
        }
      } else {
        // publicationStatus exists in carSales, but verify against publicCars for accuracy
        // If it exists in publicCars with isPublished: true, trust that over carSales field
        if (isPublishedInPublicCars && publicationStatus.toUpperCase() !== 'PUBLISHED') {
          console.warn(`Car ${carId} has publicationStatus='${publicationStatus}' in carSales but isPublished=true in publicCars. Using PUBLISHED.`);
          publicationStatus = 'PUBLISHED';
        }
      }
      
      // Normalize to uppercase to match CarPublicationStatus enum (handle lowercase/mixed case)
      publicationStatus = publicationStatus.toUpperCase().trim();
      if (!['DRAFT', 'HIDDEN', 'PUBLISHED'].includes(publicationStatus)) {
        console.warn(`Car ${carId} has unexpected status '${publicationStatus}', normalizing to PUBLISHED (Android default)`);
        publicationStatus = 'PUBLISHED'; // Match Android's backward compatibility default
      }
      
      // Normalize images using centralized helper
      // Priority: publicCars data first (most accurate for published cars), then carSales data
      let normalizedImages: ReturnType<typeof normalizeCarImages>;
      
      if (publicCarData) {
        // Merge publicCars data with carSales data for normalization
        // publicCars takes precedence for imageUrls and imagesCount
        // Pass all image-related fields to ensure normalizeCarImages can handle all formats
        const mergedData = {
          ...data,
          // Prioritize publicCars imageUrls (most reliable for published cars)
          imageUrls: publicCarData.imageUrls ?? data.imageUrls,
          // Prioritize publicCars imagesCount (if present)
          imagesCount: publicCarData.imagesCount ?? data.imagesCount,
          ImagesCount: publicCarData.imagesCount ?? (data as any).ImagesCount,
          images_count: (data as any).images_count, // Keep carSales variant if exists
          // Prioritize publicCars mainImageUrl
          mainImageUrl: publicCarData.imageUrls?.[0] ?? data.mainImageUrl,
          // Keep carSales legacy fields for fallback (imagesJson, images array)
          // These are already in data, so they'll be passed through
        };
        normalizedImages = normalizeCarImages(mergedData);
      } else {
        // Only carSales data available - normalize with all available fields
        normalizedImages = normalizeCarImages(data);
      }
      
      let imageCount = normalizedImages.imagesCount;
      const mainImageUrl = normalizedImages.mainImageUrl;
      
      // Debug log for cases where imageCount is 0 but there's image data
      // This helps diagnose cases where normalization might be missing something
      if (import.meta.env.DEV && imageCount === 0) {
        const hasPublicCarsImages = publicCarData?.imageUrls && publicCarData.imageUrls.length > 0;
        const hasPublicCarsCount = typeof publicCarData?.imagesCount === 'number' && publicCarData.imagesCount > 0;
        const hasCarSalesImages = Array.isArray((data as any).images) && (data as any).images.length > 0;
        const hasCarSalesImagesJson = !!(data as any).imagesJson;
        const hasCarSalesImageUrls = Array.isArray((data as any).imageUrls) && (data as any).imageUrls.length > 0;
        const hasCarSalesCount = normalizeNumber((data as any).imagesCount) ?? 
                                 normalizeNumber((data as any).ImagesCount) ?? 
                                 normalizeNumber((data as any).images_count);
        
        if (hasPublicCarsImages || hasPublicCarsCount || hasCarSalesImages || 
            hasCarSalesImagesJson || hasCarSalesImageUrls || (hasCarSalesCount && hasCarSalesCount > 0)) {
          console.debug('[YardFleet] image debug - imageCount=0 but image data exists', {
            carId,
            publicCarId,
            publicCarsImageUrlsLength: publicCarData?.imageUrls?.length ?? 0,
            publicCarsImagesCount: publicCarData?.imagesCount,
            carSalesImagesCount: normalizeNumber((data as any).imagesCount) ?? 
                                 normalizeNumber((data as any).ImagesCount) ?? 
                                 normalizeNumber((data as any).images_count),
            carSalesImagesArrayLength: Array.isArray((data as any).images) ? (data as any).images.length : null,
            hasImagesJson: !!(data as any).imagesJson,
            carSalesImageUrlsLength: Array.isArray((data as any).imageUrls) ? (data as any).imageUrls.length : null,
            normalizedResult: normalizedImages,
          });
        }
      }
      
      // Safety check: if publicCars has imageUrls but imageCount is still 0, force update
      // This handles edge cases where normalization might have missed something
      if (publicCarData?.imageUrls && Array.isArray(publicCarData.imageUrls) && publicCarData.imageUrls.length > 0) {
        if (imageCount === 0) {
          console.warn('[YardFleet] imageCount=0 but publicCars has imageUrls, forcing update', {
            carId,
            publicCarId,
            publicCarsImageUrlsLength: publicCarData.imageUrls.length,
            previousImageCount: imageCount,
          });
          // Force imageCount to match publicCars imageUrls length
          imageCount = publicCarData.imageUrls.length;
        }
      }
      
      return {
        id: carId,
        publicCarId,
        brandId: data.brandId || null,
        brandText: data.brandText || data.brand || '',
        brand: data.brand || data.brandText || '',
        modelId: data.modelId || null,
        modelText: data.modelText || data.model || '',
        model: data.model || data.modelText || '',
        year: data.year || null,
        salePrice: data.salePrice || 0,
        price: data.salePrice || data.price || 0,
        mileageKm: data.mileageKm || null,
        city: data.city || null,
        notes: data.notes || null,
        publicationStatus: publicationStatus as CarPublicationStatus,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        roleContext: data.roleContext || null,
        saleOwnerType: data.saleOwnerType || null,
        gearboxType: data.gearboxType || null,
        fuelType: data.fuelType || null,
        handCount: data.handCount || null,
        color: data.color || null,
        engineDisplacementCc: data.engineDisplacementCc || null,
        licensePlatePartial: data.licensePlatePartial || null,
        imageCount,
        mainImageUrl,
      };
    });

    // Apply filters (client-side)
    if (filters) {
      cars = cars.filter((car) => {
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
    if (sort) {
      cars.sort((a, b) => {
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
      cars.sort((a, b) => {
        const aValue = a.updatedAt || 0;
        const bValue = b.updatedAt || 0;
        return bValue - aValue;
      });
    }

    return cars;
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

