import { collection, getDocsFromServer, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

/**
 * Yard car type (from users/{uid}/carSales collection)
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
  publicationStatus?: string; // 'DRAFT' | 'HIDDEN' | 'PUBLISHED'
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
}

/**
 * Fetch all yard cars for the current authenticated user
 */
export async function fetchYardCarsForUser(): Promise<YardCar[]> {
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

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
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
        publicationStatus: data.publicationStatus || 'DRAFT',
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
      };
    });
  } catch (error) {
    console.error('Error fetching yard cars:', error);
    throw error;
  }
}

