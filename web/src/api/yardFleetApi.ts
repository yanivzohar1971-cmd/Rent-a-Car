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
      // Robust fallback logic to handle all Android field variations
      // Note: Android defaults to PUBLISHED for backward compatibility (see CarPublicationStatus.fromString)
      let publicationStatus: string | undefined = data.publicationStatus;
      
      // If publicationStatus is missing or invalid, check for alternative fields
      if (!publicationStatus || typeof publicationStatus !== 'string' || publicationStatus.trim() === '') {
        // Check for boolean flags (legacy Android support)
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
          // Android defaults to PUBLISHED for backward compatibility when field is missing/invalid
          // However, for safety, we default to DRAFT here (unpublished) unless we have evidence it's published
          // If the car has images and other required fields, it's likely published
          const hasImages = (data.imagesJson && typeof data.imagesJson === 'string' && data.imagesJson.trim() !== '') ||
                           (typeof data.imagesCount === 'number' && data.imagesCount > 0) ||
                           (Array.isArray(data.images) && data.images.length > 0);
          const hasRequiredFields = data.brand || data.brandText || data.model || data.modelText;
          
          // If car has images and required fields, likely published (match Android behavior)
          // Otherwise, default to DRAFT (safer for new/unfinished listings)
          publicationStatus = (hasImages && hasRequiredFields) ? 'PUBLISHED' : 'DRAFT';
          
          if (!data.publicationStatus) {
            console.warn(`Car ${docSnap.id} missing publicationStatus field, inferring ${publicationStatus} based on content`);
          }
        }
      }
      
      // Normalize to uppercase to match CarPublicationStatus enum (handle lowercase/mixed case)
      publicationStatus = publicationStatus.toUpperCase().trim();
      if (!['DRAFT', 'HIDDEN', 'PUBLISHED'].includes(publicationStatus)) {
        console.warn(`Car ${docSnap.id} has unexpected status '${publicationStatus}', normalizing to PUBLISHED (Android default)`);
        publicationStatus = 'PUBLISHED'; // Match Android's backward compatibility default
      }
      
      // Calculate image count - prefer direct imagesCount field if available
      // Otherwise, parse imagesJson to count images (Android writes imagesJson as JSON array string)
      let imageCount = 0;
      
      // 1) New numeric field (preferred, maintained by web image operations)
      if (typeof data.imagesCount === 'number' && data.imagesCount >= 0) {
        imageCount = data.imagesCount;
      }
      // 2) Array field written by Android (if it exists as a direct array)
      else if (Array.isArray(data.images) && data.images.length > 0) {
        imageCount = data.images.length;
      }
      // 3) Stringified JSON (Android writes imagesJson as JSON string containing array of CarImage)
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
            console.warn(`Car ${docSnap.id} has invalid imagesJson, cannot parse image count:`, e);
          }
        } else if (Array.isArray(data.imagesJson)) {
          // imagesJson might be stored as an array directly (unlikely but handle it)
          imageCount = data.imagesJson.length;
        }
      }
      
      // Debug logging for cars with images but count showing 0
      if (imageCount === 0 && data.imagesJson && typeof data.imagesJson === 'string' && data.imagesJson.trim().length > 10) {
        console.warn(`Car ${docSnap.id} has imagesJson (${data.imagesJson.length} chars) but imageCount is 0. Content: ${data.imagesJson.substring(0, 100)}...`);
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

