import { collection, getDocsFromServer, doc, getDocFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { GearboxType, FuelType, BodyType } from '../types/carTypes';

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
};

export type CarFilters = {
  // Existing fields
  manufacturer?: string;
  model?: string;
  minYear?: number;
  maxPrice?: number;

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
};

const publicCarsCollection = collection(db, 'publicCars');

/**
 * Fetch cars from Firestore publicCars collection with filters
 * Reads from the public listings published by YARD users
 */
export async function fetchCarsFromFirestore(filters: CarFilters): Promise<Car[]> {
  try {
    // Query only published cars - force server fetch to avoid stale cache
    const q = query(publicCarsCollection, where('isPublished', '==', true));
    const snapshot = await getDocsFromServer(q);

    // Map Firestore documents to Car objects and keep raw data for filtering
    const carsWithData = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        car: {
          id: docSnap.id,
          manufacturerHe: data.brand ?? '',
          modelHe: data.model ?? '',
          year: typeof data.year === 'number' ? data.year : 0,
          price: typeof data.price === 'number' ? data.price : 0,
          km: typeof data.mileageKm === 'number' ? data.mileageKm : 0,
          city: data.city ?? '',
          mainImageUrl: data.mainImageUrl ?? undefined,
          imageUrls: Array.isArray(data.imageUrls)
            ? data.imageUrls
            : data.mainImageUrl ? [data.mainImageUrl] : [],
        },
        rawData: data,
      };
    });

    // In-memory filters
    const manufacturer = filters.manufacturer?.trim();
    const model = filters.model?.trim();

    // Apply all filters
    const filtered = carsWithData.filter(({ car, rawData }) => {
      // Existing filters
      if (manufacturer && !car.manufacturerHe.toLowerCase().includes(manufacturer.toLowerCase())) {
        return false;
      }
      if (model && !car.modelHe.toLowerCase().includes(model.toLowerCase())) {
        return false;
      }
      
      // Legacy minYear/maxPrice (backward compatibility)
      if (filters.minYear && car.year < filters.minYear) {
        return false;
      }
      if (filters.maxPrice && car.price > filters.maxPrice) {
        return false;
      }

      // Basic filters - year range
      if (filters.yearFrom !== undefined && car.year < filters.yearFrom) {
        return false;
      }
      if (filters.yearTo !== undefined && car.year > filters.yearTo) {
        return false;
      }

      // Basic filters - km range
      if (filters.kmFrom !== undefined && car.km < filters.kmFrom) {
        return false;
      }
      if (filters.kmTo !== undefined && car.km > filters.kmTo) {
        return false;
      }

      // Basic filters - price range
      if (filters.priceFrom !== undefined && car.price < filters.priceFrom) {
        return false;
      }
      if (filters.priceTo !== undefined && car.price > filters.priceTo) {
        return false;
      }

      // Advanced filters - hand count
      const handCount = typeof rawData.handCount === 'number' ? rawData.handCount : 
                        typeof rawData.hand === 'number' ? rawData.hand : null;
      if (handCount !== null) {
        if (filters.handFrom !== undefined && handCount < filters.handFrom) {
          return false;
        }
        if (filters.handTo !== undefined && handCount > filters.handTo) {
          return false;
        }
      }

      // Advanced filters - engine displacement
      const engineCc = typeof rawData.engineDisplacementCc === 'number' ? rawData.engineDisplacementCc :
                       typeof rawData.engineCc === 'number' ? rawData.engineCc : null;
      if (engineCc !== null) {
        if (filters.engineCcFrom !== undefined && engineCc < filters.engineCcFrom) {
          return false;
        }
        if (filters.engineCcTo !== undefined && engineCc > filters.engineCcTo) {
          return false;
        }
      }

      // Advanced filters - horsepower
      const hp = typeof rawData.enginePowerHp === 'number' ? rawData.enginePowerHp :
                 typeof rawData.hp === 'number' ? rawData.hp : null;
      if (hp !== null) {
        if (filters.hpFrom !== undefined && hp < filters.hpFrom) {
          return false;
        }
        if (filters.hpTo !== undefined && hp > filters.hpTo) {
          return false;
        }
      }

      // Advanced filters - gear count
      const gears = typeof rawData.gearCount === 'number' ? rawData.gearCount : null;
      if (gears !== null) {
        if (filters.gearsFrom !== undefined && gears < filters.gearsFrom) {
          return false;
        }
        if (filters.gearsTo !== undefined && gears > filters.gearsTo) {
          return false;
        }
      }

      // Advanced filters - gearbox type
      if (filters.gearboxTypes && filters.gearboxTypes.length > 0) {
        const carGearbox = rawData.gearboxType || rawData.gear;
        if (!carGearbox || !filters.gearboxTypes.includes(carGearbox as GearboxType)) {
          return false;
        }
      }

      // Advanced filters - fuel type
      if (filters.fuelTypes && filters.fuelTypes.length > 0) {
        const carFuel = rawData.fuelType || rawData.fuel;
        if (!carFuel || !filters.fuelTypes.includes(carFuel as FuelType)) {
          return false;
        }
      }

      // Advanced filters - body type
      if (filters.bodyTypes && filters.bodyTypes.length > 0) {
        const carBody = rawData.bodyType || rawData.body;
        if (!carBody || !filters.bodyTypes.includes(carBody as BodyType)) {
          return false;
        }
      }

      // Advanced filters - AC
      if (filters.acRequired !== null && filters.acRequired !== undefined) {
        const carAc = typeof rawData.ac === 'boolean' ? rawData.ac :
                      typeof rawData.airConditioning === 'boolean' ? rawData.airConditioning : null;
        if (carAc !== null && carAc !== filters.acRequired) {
          return false;
        }
      }

      // Advanced filters - color
      if (filters.color && filters.color.trim()) {
        const carColor = rawData.color || rawData.colour;
        if (!carColor || !carColor.toLowerCase().includes(filters.color.toLowerCase().trim())) {
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
    return {
      id: docSnap.id,
      manufacturerHe: data.brand ?? '',
      modelHe: data.model ?? '',
      year: typeof data.year === 'number' ? data.year : 0,
      price: typeof data.price === 'number' ? data.price : 0,
      km: typeof data.mileageKm === 'number' ? data.mileageKm : 0,
      city: data.city ?? '',
      mainImageUrl: data.mainImageUrl ?? undefined,
      imageUrls: Array.isArray(data.imageUrls)
        ? data.imageUrls
        : data.mainImageUrl ? [data.mainImageUrl] : [],
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

