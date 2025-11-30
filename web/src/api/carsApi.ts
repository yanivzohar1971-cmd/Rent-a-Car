import { collection, getDocsFromServer, doc, getDocFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';

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
  manufacturer?: string;
  model?: string;
  minYear?: number;
  maxPrice?: number;
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

    const cars: Car[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        manufacturerHe: data.brand ?? '',
        modelHe: data.model ?? '',
        year: typeof data.year === 'number' ? data.year : 0,
        price: typeof data.price === 'number' ? data.price : 0,
        km: typeof data.mileageKm === 'number' ? data.mileageKm : 0,
        city: data.city ?? '',
        // mainImageUrl comes directly from the public listing
        mainImageUrl: data.mainImageUrl ?? undefined,
        imageUrls: Array.isArray(data.imageUrls)
          ? data.imageUrls
          : data.mainImageUrl ? [data.mainImageUrl] : [],
      };
    });

    // In-memory filters
    const manufacturer = filters.manufacturer?.trim();
    const model = filters.model?.trim();

    return cars.filter((car) => {
      if (manufacturer && !car.manufacturerHe.toLowerCase().includes(manufacturer.toLowerCase())) {
        return false;
      }
      if (model && !car.modelHe.toLowerCase().includes(model.toLowerCase())) {
        return false;
      }
      if (filters.minYear && car.year < filters.minYear) {
        return false;
      }
      if (filters.maxPrice && car.price > filters.maxPrice) {
        return false;
      }
      return true;
    });
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

