import { collection, getDocsFromServer, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { CarPublicationStatus } from './yardPublishApi';

// Re-export for convenience
export type { CarPublicationStatus };

/**
 * Yard car type (from users/{uid}/carSales collection)
 * 
 * Note: publicationStatus is the single source of truth for yard car status across Android + Web.
 * Note: imageCount is maintained centrally (Cloud Function or Android logic) and is used by Yard Fleet to show the current photo count.
 *       If imagesCount field exists directly in Firestore, it's preferred over parsing imagesJson.
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

    let cars = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      
      // Read publicationStatus - single source of truth for yard car status across Android + Web
      // If missing, default to 'DRAFT' but log a warning for debugging
      let publicationStatus = data.publicationStatus;
      if (!publicationStatus || typeof publicationStatus !== 'string') {
        // Check for alternative field names (legacy support)
        publicationStatus = data.status || data.carStatus || 'DRAFT';
        if (publicationStatus === 'DRAFT' && !data.publicationStatus) {
          console.warn(`Car ${docSnap.id} missing publicationStatus field, defaulting to DRAFT`);
        }
      }
      // Normalize to uppercase to match CarPublicationStatus enum
      publicationStatus = publicationStatus.toUpperCase();
      if (!['DRAFT', 'HIDDEN', 'PUBLISHED'].includes(publicationStatus)) {
        publicationStatus = 'DRAFT';
      }
      
      // Calculate image count - prefer direct imagesCount field if available (maintained by Cloud Function or Android)
      // Otherwise, parse imagesJson to count images
      let imageCount = 0;
      
      // First, check if imagesCount field exists directly (preferred, maintained centrally)
      if (typeof data.imagesCount === 'number') {
        imageCount = data.imagesCount;
      } else if (data.imagesJson) {
        // Fallback: parse imagesJson to count images
        try {
          const parsed = JSON.parse(data.imagesJson);
          if (Array.isArray(parsed)) {
            imageCount = parsed.length;
          } else if (parsed && typeof parsed === 'object' && parsed.images && Array.isArray(parsed.images)) {
            // Handle nested structure if images are in a nested array
            imageCount = parsed.images.length;
          }
        } catch (e) {
          // Invalid JSON, imageCount remains 0
          console.warn(`Car ${docSnap.id} has invalid imagesJson, cannot parse image count`, e);
        }
      }
      
      return {
        id: docSnap.id,
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

