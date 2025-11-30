import { collection, doc, setDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

/**
 * Car data structure for YARD car edit form
 */
export interface YardCarFormData {
  // Core fields
  brandId: string | null;
  brandText: string;
  modelId: string | null;
  modelText: string;
  year: string;
  price: string;
  mileageKm: string;
  city?: string;
  
  // Additional fields (extend as needed)
  notes?: string;
  
  // Backward compatibility - legacy fields
  brand?: string;  // Maps to brandText
  model?: string;  // Maps to modelText
}

/**
 * Save or update a car in the user's private collection
 * This saves to users/{uid}/carSales/{carId} for YARD users
 */
export async function saveYardCar(
  carId: string | null,
  carData: YardCarFormData
): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to save cars');
  }

  try {
    // Prepare document data
    const docData: any = {
      // Canonical IDs
      brandId: carData.brandId || null,
      modelId: carData.modelId || null,
      
      // Raw text fields
      brandText: carData.brandText || '',
      modelText: carData.modelText || '',
      
      // Backward compatibility - map to legacy fields
      brand: carData.brandText || carData.brand || '',
      model: carData.modelText || carData.model || '',
      
      // Other fields
      year: carData.year ? parseInt(carData.year, 10) : null,
      salePrice: carData.price ? parseFloat(carData.price) : 0,
      mileageKm: carData.mileageKm ? parseInt(carData.mileageKm, 10) : null,
      city: carData.city || null,
      notes: carData.notes || null,
      
      // Metadata
      updatedAt: serverTimestamp(),
      roleContext: 'YARD',
    };

    // If creating new car, add createdAt
    if (!carId) {
      docData.createdAt = serverTimestamp();
    }

    // Save to users/{uid}/carSales/{carId}
    const userCarsRef = collection(db, 'users', user.uid, 'carSales');
    const carDocRef = carId ? doc(userCarsRef, carId) : doc(userCarsRef);
    
    await setDoc(carDocRef, docData, { merge: true });

    return carDocRef.id;
  } catch (error) {
    console.error('Error saving yard car:', error);
    throw error;
  }
}

/**
 * Load a car from the user's private collection
 */
export async function loadYardCar(carId: string): Promise<YardCarFormData | null> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to load cars');
  }

  try {
    const carDocRef = doc(db, 'users', user.uid, 'carSales', carId);
    const carDoc = await getDocFromServer(carDocRef);

    if (!carDoc.exists()) {
      return null;
    }

    const data = carDoc.data();

    return {
      brandId: data.brandId || null,
      brandText: data.brandText || data.brand || '',
      modelId: data.modelId || null,
      modelText: data.modelText || data.model || '',
      year: data.year?.toString() || '',
      price: data.salePrice?.toString() || '',
      mileageKm: data.mileageKm?.toString() || '',
      city: data.city || '',
      notes: data.notes || '',
      // Backward compatibility
      brand: data.brand || data.brandText || '',
      model: data.model || data.modelText || '',
    };
  } catch (error) {
    console.error('Error loading yard car:', error);
    throw error;
  }
}

