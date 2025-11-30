import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { MOCK_CARS } from '../mock/cars';

export type Car = {
  id: string;
  manufacturerHe: string;
  modelHe: string;
  year: number;
  price: number;
  km: number;
  city: string;
  mainImageUrl: string;
};

export type CarFilters = {
  manufacturer?: string;
  model?: string;
  minYear?: number;
  maxPrice?: number;
};

const carsCollection = collection(db, 'publicCars');

/**
 * Fetch cars from Firestore with filters
 */
export async function fetchCarsFromFirestore(filters: CarFilters): Promise<Car[]> {
  try {
    // Basic query: only active cars
    const q = query(carsCollection, where('isActive', '==', true));
    const snapshot = await getDocs(q);

    const cars: Car[] = snapshot.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        manufacturerHe: data.manufacturerHe ?? data.brand ?? '',
        modelHe: data.modelHe ?? data.model ?? '',
        year: typeof data.year === 'number' ? data.year : 0,
        price: typeof data.price === 'number' ? data.price : data.salePrice ?? 0,
        km: typeof data.km === 'number' ? data.km : data.mileageKm ?? 0,
        city: data.city ?? '',
        mainImageUrl: data.mainImageUrl ?? data.imagesJson ? JSON.parse(data.imagesJson)?.[0]?.originalUrl : '',
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
 * Fetch a single car by ID from Firestore
 */
export async function fetchCarByIdFromFirestore(id: string): Promise<Car | null> {
  try {
    const all = await fetchCarsFromFirestore({});
    return all.find((c) => c.id === id) ?? null;
  } catch (error) {
    console.error('Error fetching car by id from Firestore:', error);
    throw error;
  }
}

/**
 * Fetch cars with fallback to MOCK_CARS if Firestore fails or is empty
 */
export async function fetchCarsWithFallback(filters: CarFilters): Promise<Car[]> {
  try {
    const firestoreCars = await fetchCarsFromFirestore(filters);
    if (firestoreCars.length > 0) {
      return firestoreCars;
    }
  } catch (e) {
    console.error('Error fetching cars from Firestore, falling back to mock data', e);
  }

  // Fallback: filter MOCK_CARS with same logic
  const manufacturer = filters.manufacturer?.trim();
  const model = filters.model?.trim();

  return MOCK_CARS.filter((car) => {
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
}

/**
 * Fetch a car by ID with fallback to MOCK_CARS if Firestore fails or car not found
 */
export async function fetchCarByIdWithFallback(id: string): Promise<Car | null> {
  try {
    const car = await fetchCarByIdFromFirestore(id);
    if (car) {
      return car;
    }
  } catch (e) {
    console.error('Error fetching car by id from Firestore, falling back to mock data', e);
  }

  // Fallback: search in MOCK_CARS
  return MOCK_CARS.find((c) => c.id === id) ?? null;
}

