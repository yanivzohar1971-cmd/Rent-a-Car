import { collection, getDocsFromServer, doc, getDocFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { GearboxType, FuelType, BodyType } from '../types/carTypes';
import { normalizeCarImages } from '../utils/carImageHelper';
import { normalizeRanges } from '../utils/rangeValidation';

/**
 * Car type for web frontend
 * 
 * TODO: Future image integration from Android app
 * - Android app stores images in Firebase Storage at: users/{uid}/cars/{carId}/images/{imageId}.jpg
 * - Images are stored in CarSale.imagesJson as JSON array of {id, originalUrl, thumbUrl, order}
 * - For public listings, images may be copied to: public/listings/{listingId}/{imageId}.jpg
 * - mainImageUrl will eventually come from:
 *   1. First image in imagesJson array (CarImage.originalUrl), OR
 *   2. A public listing copy in public/listings/{listingId}/main.jpg
 * - Current fallback: uses mainImageUrl field directly from publicCars collection or mock data
 */
export type Car = {
  id: string;
  manufacturerHe: string;
  modelHe: string;
  year: number;
  price: number;
  km: number;
  city: string;
  mainImageUrl?: string; // Optional - fallback to placeholder if missing
  imageUrls?: string[]; // All image URLs for gallery
  yardUid?: string; // Owner of the car (for tracking views)
  
  // Location metadata (from publicCars)
  regionId?: string | null;
  regionNameHe?: string | null;
  cityId?: string | null;
  cityNameHe?: string | null;
  neighborhoodId?: string | null;
  neighborhoodNameHe?: string | null;
  
  // Advanced details (optional)
  gearboxType?: string | null;
  fuelType?: string | null;
  bodyType?: string | null;
  engineDisplacementCc?: number | null;
  horsepower?: number | null;
  ownershipType?: string | null;
  importType?: string | null;
  previousUse?: string | null;
  handCount?: number | null;
  numberOfGears?: number | null;
  color?: string | null;
  hasAC?: boolean | null;
  ac?: boolean | null;
  licensePlatePartial?: string | null;
  notes?: string | null;
  
  // Promotion fields (from publicCars)
  promotion?: any; // CarPromotionState from publicCars
  highlightLevel?: string | null; // 'none' | 'basic' | 'plus' | 'premium'
};

export type CarFilters = {
  // Existing fields
  manufacturer?: string; // Legacy single brand (for backward compatibility)
  manufacturerIds?: string[]; // Array of brand names (up to 4) - primary field for multi-brand selection
  model?: string;
  minYear?: number;
  maxPrice?: number;
  lockedYardId?: string; // When set, filter to cars from this yard only

  // Basic filters - ranges
  yearFrom?: number;
  yearTo?: number;
  kmFrom?: number;
  kmTo?: number;
  priceFrom?: number;
  priceTo?: number;

  // Advanced filters - numeric ranges
  handFrom?: number;
  handTo?: number;
  engineCcFrom?: number;
  engineCcTo?: number;
  hpFrom?: number;
  hpTo?: number;
  gearsFrom?: number;
  gearsTo?: number;

  // Advanced filters - categorical
  gearboxTypes?: GearboxType[];
  fuelTypes?: FuelType[];
  bodyTypes?: BodyType[];
  acRequired?: boolean | null; // null = don't care; true = must have AC
  color?: string;

  // Location filters (single selection for now)
  regionId?: string;
  cityId?: string;
};

const publicCarsCollection = collection(db, 'publicCars');

/**
 * Fetch cars from Firestore publicCars collection with filters
 * Reads from the public listings published by YARD users
 */
export async function fetchCarsFromFirestore(filters: CarFilters): Promise<Car[]> {
  try {
    // Defense-in-depth: normalize ranges before building query
    // This ensures reversed ranges never reach Firestore filters
    const rangeNormalized = normalizeRanges(filters);
    const normalizedFilters = rangeNormalized.normalized;
    
    // Query only published cars - force server fetch to avoid stale cache
    const q = query(publicCarsCollection, where('isPublished', '==', true));
    const snapshot = await getDocsFromServer(q);

    // Map Firestore documents to Car objects and keep raw data for filtering
    const carsWithData = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      
      // Normalize images using centralized helper
      const normalizedImages = normalizeCarImages(data);
      
      return {
        car: {
          id: docSnap.id,
          manufacturerHe: data.brand ?? '',
          modelHe: data.model ?? '',
          year: typeof data.year === 'number' ? data.year : 0,
          price: typeof data.price === 'number' ? data.price : 0,
          km: typeof data.mileageKm === 'number' ? data.mileageKm : 0,
          city: data.city ?? '',
          mainImageUrl: normalizedImages.mainImageUrl ?? undefined,
          imageUrls: normalizedImages.imageUrls,
          // Some publicCars docs use ownerUid as the owner field (see yardFleetApi)
          yardUid: data.yardUid || data.ownerUid || data.userId || undefined,
          // Location metadata
          regionId: data.regionId ?? null,
          regionNameHe: data.regionNameHe ?? null,
          cityId: data.cityId ?? null,
          cityNameHe: data.cityNameHe ?? null,
          neighborhoodId: data.neighborhoodId ?? null,
          neighborhoodNameHe: data.neighborhoodNameHe ?? null,
          // Advanced details
          gearboxType: data.gearboxType ?? null,
          fuelType: data.fuelType ?? null,
          bodyType: data.bodyType ?? null,
          engineDisplacementCc: typeof data.engineDisplacementCc === 'number' ? data.engineDisplacementCc : 
                                typeof data.engineCc === 'number' ? data.engineCc : null,
          horsepower: typeof data.enginePowerHp === 'number' ? data.enginePowerHp :
                      typeof data.hp === 'number' ? data.hp : null,
          ownershipType: data.ownershipType ?? null,
          importType: data.importType ?? null,
          previousUse: data.previousUse ?? null,
          handCount: typeof data.handCount === 'number' ? data.handCount :
                     typeof data.hand === 'number' ? data.hand : null,
          numberOfGears: typeof data.numberOfGears === 'number' ? data.numberOfGears :
                         typeof data.gears === 'number' ? data.gears : null,
          color: data.color ?? null,
          hasAC: typeof data.hasAC === 'boolean' ? data.hasAC :
                 typeof data.ac === 'boolean' ? data.ac :
                 typeof data.airConditioning === 'boolean' ? data.airConditioning : null,
          ac: typeof data.ac === 'boolean' ? data.ac :
              typeof data.hasAC === 'boolean' ? data.hasAC :
              typeof data.airConditioning === 'boolean' ? data.airConditioning : null,
          licensePlatePartial: data.licensePlatePartial ?? null,
          notes: data.notes ?? null,
          // Promotion fields
          promotion: data.promotion ?? undefined,
          highlightLevel: data.highlightLevel ?? null,
        },
        rawData: data,
      };
    });

    // In-memory filters
    // Support both legacy single manufacturer and new manufacturerIds array
    // Use normalizedFilters to ensure ranges are correct
    const manufacturerIds = normalizedFilters.manufacturerIds && normalizedFilters.manufacturerIds.length > 0
      ? normalizedFilters.manufacturerIds
      : normalizedFilters.manufacturer
        ? [normalizedFilters.manufacturer.trim()]
        : [];
    const model = normalizedFilters.model?.trim();
    const regionFilter = normalizedFilters.regionId?.trim();
    const cityFilter = normalizedFilters.cityId?.trim();

    // Apply all filters
    const filtered = carsWithData.filter(({ car, rawData }) => {
      // Yard filter (if lockedYardId is provided)
      // Align with yardFleetApi: try yardUid, ownerUid, userId
      if (normalizedFilters.lockedYardId) {
        const carYardUid =
          car.yardUid ||
          rawData.yardUid ||
          rawData.ownerUid ||
          rawData.userId;

        if (carYardUid !== normalizedFilters.lockedYardId) {
          return false;
        }
      }

      // Brand filter - support multiple brands
      if (manufacturerIds.length > 0) {
        const carBrandLower = car.manufacturerHe.toLowerCase();
        const matchesBrand = manufacturerIds.some(brandId => 
          carBrandLower.includes(brandId.toLowerCase())
        );
        if (!matchesBrand) {
          return false;
        }
      }
      if (model && !car.modelHe.toLowerCase().includes(model.toLowerCase())) {
        return false;
      }
      
      // Legacy minYear/maxPrice (backward compatibility)
      if (normalizedFilters.minYear && car.year < normalizedFilters.minYear) {
        return false;
      }
      if (normalizedFilters.maxPrice && car.price > normalizedFilters.maxPrice) {
        return false;
      }

      // Basic filters - year range
      if (normalizedFilters.yearFrom !== undefined && car.year < normalizedFilters.yearFrom) {
        return false;
      }
      if (normalizedFilters.yearTo !== undefined && car.year > normalizedFilters.yearTo) {
        return false;
      }

      // Basic filters - km range
      if (normalizedFilters.kmFrom !== undefined && car.km < normalizedFilters.kmFrom) {
        return false;
      }
      if (normalizedFilters.kmTo !== undefined && car.km > normalizedFilters.kmTo) {
        return false;
      }

      // Basic filters - price range
      if (normalizedFilters.priceFrom !== undefined && car.price < normalizedFilters.priceFrom) {
        return false;
      }
      if (normalizedFilters.priceTo !== undefined && car.price > normalizedFilters.priceTo) {
        return false;
      }

      // Advanced filters - hand count
      const handCount = typeof rawData.handCount === 'number' ? rawData.handCount : 
                        typeof rawData.hand === 'number' ? rawData.hand : null;
      if (handCount !== null) {
        if (normalizedFilters.handFrom !== undefined && handCount < normalizedFilters.handFrom) {
          return false;
        }
        if (normalizedFilters.handTo !== undefined && handCount > normalizedFilters.handTo) {
          return false;
        }
      }

      // Advanced filters - engine displacement
      const engineCc = typeof rawData.engineDisplacementCc === 'number' ? rawData.engineDisplacementCc :
                       typeof rawData.engineCc === 'number' ? rawData.engineCc : null;
      if (engineCc !== null) {
        if (normalizedFilters.engineCcFrom !== undefined && engineCc < normalizedFilters.engineCcFrom) {
          return false;
        }
        if (normalizedFilters.engineCcTo !== undefined && engineCc > normalizedFilters.engineCcTo) {
          return false;
        }
      }

      // Advanced filters - horsepower
      const hp = typeof rawData.enginePowerHp === 'number' ? rawData.enginePowerHp :
                 typeof rawData.hp === 'number' ? rawData.hp : null;
      if (hp !== null) {
        if (normalizedFilters.hpFrom !== undefined && hp < normalizedFilters.hpFrom) {
          return false;
        }
        if (normalizedFilters.hpTo !== undefined && hp > normalizedFilters.hpTo) {
          return false;
        }
      }

      // Advanced filters - gear count
      const gears = typeof rawData.numberOfGears === 'number' ? rawData.numberOfGears :
                    typeof rawData.gearCount === 'number' ? rawData.gearCount : null;
      if (gears !== null) {
        if (normalizedFilters.gearsFrom !== undefined && gears < normalizedFilters.gearsFrom) {
          return false;
        }
        if (normalizedFilters.gearsTo !== undefined && gears > normalizedFilters.gearsTo) {
          return false;
        }
      }

      // Advanced filters - gearbox type
      if (normalizedFilters.gearboxTypes && normalizedFilters.gearboxTypes.length > 0) {
        const carGearbox = rawData.gearboxType || rawData.gear;
        if (!carGearbox || !normalizedFilters.gearboxTypes.includes(carGearbox as GearboxType)) {
          return false;
        }
      }

      // Advanced filters - fuel type
      if (normalizedFilters.fuelTypes && normalizedFilters.fuelTypes.length > 0) {
        const carFuel = rawData.fuelType || rawData.fuel;
        if (!carFuel || !normalizedFilters.fuelTypes.includes(carFuel as FuelType)) {
          return false;
        }
      }

      // Advanced filters - body type
      if (normalizedFilters.bodyTypes && normalizedFilters.bodyTypes.length > 0) {
        const carBody = rawData.bodyType || rawData.body;
        if (!carBody || !normalizedFilters.bodyTypes.includes(carBody as BodyType)) {
          return false;
        }
      }

      // Advanced filters - AC
      if (normalizedFilters.acRequired !== null && normalizedFilters.acRequired !== undefined) {
        const carAc = typeof rawData.hasAC === 'boolean' ? rawData.hasAC :
                      typeof rawData.ac === 'boolean' ? rawData.ac :
                      typeof rawData.airConditioning === 'boolean' ? rawData.airConditioning : null;
        if (carAc !== null && carAc !== normalizedFilters.acRequired) {
          return false;
        }
      }

      // Advanced filters - color
      if (normalizedFilters.color && normalizedFilters.color.trim()) {
        const carColor = rawData.color || rawData.colour;
        if (!carColor || !carColor.toLowerCase().includes(normalizedFilters.color.toLowerCase().trim())) {
          return false;
        }
      }

      // Location: region
      if (regionFilter) {
        const carRegionId = rawData.regionId as string | undefined;
        if (!carRegionId || carRegionId !== regionFilter) {
          return false;
        }
      }

      // Location: city (depends on region but can also stand alone)
      if (cityFilter) {
        const carCityId = rawData.cityId as string | undefined;
        if (!carCityId || carCityId !== cityFilter) {
          return false;
        }
      }

      return true;
    });

    return filtered.map(({ car }) => car);
  } catch (error) {
    console.error('Error fetching cars from Firestore:', error);
    throw error;
  }
}

/**
 * Fetch a single car by ID from Firestore publicCars collection
 */
export async function fetchCarByIdFromFirestore(id: string): Promise<Car | null> {
  try {
    const docRef = doc(db, 'publicCars', id);
    // Force server fetch to avoid stale cache
    const docSnap = await getDocFromServer(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    
    // Normalize images using centralized helper
    const normalizedImages = normalizeCarImages(data);
    
    return {
      id: docSnap.id,
      manufacturerHe: data.brand ?? '',
      modelHe: data.model ?? '',
      year: typeof data.year === 'number' ? data.year : 0,
      price: typeof data.price === 'number' ? data.price : 0,
      km: typeof data.mileageKm === 'number' ? data.mileageKm : 0,
      city: data.city ?? '',
      mainImageUrl: normalizedImages.mainImageUrl ?? undefined,
      imageUrls: normalizedImages.imageUrls,
      // Some publicCars docs use ownerUid as the owner field (see yardFleetApi)
      yardUid: data.yardUid || data.ownerUid || data.userId || undefined,
      // Location metadata
      regionId: data.regionId ?? null,
      regionNameHe: data.regionNameHe ?? null,
      cityId: data.cityId ?? null,
      cityNameHe: data.cityNameHe ?? null,
      neighborhoodId: data.neighborhoodId ?? null,
      neighborhoodNameHe: data.neighborhoodNameHe ?? null,
          // Advanced details
          gearboxType: data.gearboxType ?? null,
          fuelType: data.fuelType ?? null,
          bodyType: data.bodyType ?? null,
          engineDisplacementCc: typeof data.engineDisplacementCc === 'number' ? data.engineDisplacementCc : 
                                typeof data.engineCc === 'number' ? data.engineCc : null,
          horsepower: typeof data.enginePowerHp === 'number' ? data.enginePowerHp :
                      typeof data.hp === 'number' ? data.hp : null,
          ownershipType: data.ownershipType ?? null,
          importType: data.importType ?? null,
          previousUse: data.previousUse ?? null,
          handCount: typeof data.handCount === 'number' ? data.handCount :
                     typeof data.hand === 'number' ? data.hand : null,
          numberOfGears: typeof data.numberOfGears === 'number' ? data.numberOfGears :
                         typeof data.gears === 'number' ? data.gears : null,
          color: data.color ?? null,
          hasAC: typeof data.hasAC === 'boolean' ? data.hasAC :
                 typeof data.ac === 'boolean' ? data.ac :
                 typeof data.airConditioning === 'boolean' ? data.airConditioning : null,
          ac: typeof data.ac === 'boolean' ? data.ac :
              typeof data.hasAC === 'boolean' ? data.hasAC :
              typeof data.airConditioning === 'boolean' ? data.airConditioning : null,
          licensePlatePartial: data.licensePlatePartial ?? null,
          notes: data.notes ?? null,
          // Promotion fields
          promotion: data.promotion ?? undefined,
          highlightLevel: data.highlightLevel ?? null,
    };
  } catch (error) {
    console.error('Error fetching car by id from Firestore:', error);
    throw error;
  }
}

/**
 * Fetch cars from Firestore (production behavior)
 * 
 * NOTE: This function behaves exactly like fetchCarsFromFirestore.
 * The function name is kept for backward compatibility with existing page components.
 */
export async function fetchCarsWithFallback(filters: CarFilters): Promise<Car[]> {
  // For production: Firestore-only, no mock fallback.
  return await fetchCarsFromFirestore(filters);
}

/**
 * Fetch a car by ID from Firestore (production behavior)
 * 
 * NOTE: This function behaves exactly like fetchCarByIdFromFirestore.
 * The function name is kept for backward compatibility with existing page components.
 * If Firestore returns null or throws, the caller should handle it and show "הרכב לא נמצא" / error message.
 */
export async function fetchCarByIdWithFallback(id: string): Promise<Car | null> {
  // For production: Firestore only, no silent fallback to mock.
  return await fetchCarByIdFromFirestore(id);
}

/**
 * Verify that a publicCars document exists and is readable.
 * Used as a safety check before generating share URLs.
 * 
 * @param id - The publicCars document ID to verify
 * @returns true if the document exists and is readable, false otherwise
 */
export async function verifyPublicCarExists(id: string): Promise<boolean> {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return false;
  }

  try {
    const docRef = doc(db, 'publicCars', id.trim());
    const snap = await getDocFromServer(docRef);
    return snap.exists();
  } catch (error) {
    console.error('[verifyPublicCarExists] Error checking publicCars doc', { id, error });
    return false;
  }
}

