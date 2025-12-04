import { collection, getDocsFromServer, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { CarPublicationStatus } from './yardPublishApi';

// Re-export for convenience
export type { CarPublicationStatus };

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
  id: string;
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
    const publicCarsMap = new Map<string, { isPublished: boolean; imageUrls?: string[]; imagesCount?: number }>();
    try {
      const publicCarsRef = collection(db, 'publicCars');

      // Helper to add/merge a publicCars document into the map
      const addPublicCarToMap = (docSnap: any) => {
        const pubData: any = docSnap.data();
        // Try multiple ways to link publicCars to carSales:
        // 1. carSaleId field (if exists)
        // 2. originalCarId field (if exists)
        // 3. carId field (if exists)
        // 4. Document ID (assuming it matches carSales ID)
        const carSaleId =
          pubData.carSaleId ||
          pubData.originalCarId ||
          pubData.carId ||
          pubData.id ||
          docSnap.id;

        const existing = publicCarsMap.get(carSaleId);

        // If multiple publicCars docs map to same carSaleId, prefer the one with isPublished: true
        if (!existing || pubData.isPublished === true) {
          publicCarsMap.set(carSaleId, {
            isPublished: pubData.isPublished === true,
            imageUrls: Array.isArray(pubData.imageUrls) ? pubData.imageUrls : undefined,
            imagesCount:
              typeof pubData.imagesCount === 'number' ? pubData.imagesCount : undefined,
          });
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
      
      // Calculate image count - prefer publicCars data (most accurate for published cars)
      // Then fall back to carSales data
      let imageCount = 0;
      
      // 1) Check publicCars first (most accurate for published cars)
      if (publicCarData) {
        if (typeof publicCarData.imagesCount === 'number' && publicCarData.imagesCount >= 0) {
          imageCount = publicCarData.imagesCount;
        } else if (Array.isArray(publicCarData.imageUrls) && publicCarData.imageUrls.length > 0) {
          imageCount = publicCarData.imageUrls.length;
        }
      }
      
      // 2) If no images from publicCars, check carSales data
      if (imageCount === 0) {
        // New numeric field (preferred, maintained by web image operations)
        if (typeof data.imagesCount === 'number' && data.imagesCount >= 0) {
          imageCount = data.imagesCount;
        }
        // Array field written by Android (if it exists as a direct array)
        else if (Array.isArray(data.images) && data.images.length > 0) {
          imageCount = data.images.length;
        }
        // Stringified JSON (Android writes imagesJson as JSON string containing array of CarImage)
        else if (data.imagesJson) {
          if (typeof data.imagesJson === 'string' && data.imagesJson.trim() !== '') {
            try {
              const parsed = JSON.parse(data.imagesJson);
              if (Array.isArray(parsed)) {
                // Direct array of image objects
                imageCount = parsed.length;
              } else if (parsed && typeof parsed === 'object') {
                // Handle nested structure if images are in a nested object
                if (Array.isArray((parsed as any).images)) {
                  imageCount = (parsed as any).images.length;
                } else if (Array.isArray((parsed as any).data)) {
                  imageCount = (parsed as any).data.length;
                }
              }
            } catch (e) {
              // Invalid JSON, log warning but don't fail
              console.warn(`Car ${carId} has invalid imagesJson, cannot parse image count:`, e);
            }
          } else if (Array.isArray(data.imagesJson)) {
            // imagesJson might be stored as an array directly (unlikely but handle it)
            imageCount = data.imagesJson.length;
          }
        }
      }
      
      // Debug logging for cars with images but count showing 0
      if (imageCount === 0 && publicCarData && Array.isArray(publicCarData.imageUrls) && publicCarData.imageUrls.length > 0) {
        console.warn(`Car ${carId} has ${publicCarData.imageUrls.length} images in publicCars but imageCount is 0`);
      }
      
      return {
        id: carId,
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
        imageCount: imageCount,
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

