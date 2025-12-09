import { collection, doc, setDoc, getDocFromServer, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

/**
 * Car data structure for YARD car edit form
 * Extended to include all fields from search filters and domain model
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
  
  // Identification fields
  licensePlatePartial?: string;  // Last digits of license plate
  vin?: string;                  // Vehicle Identification Number
  stockNumber?: string;          // Internal stock/inventory number
  
  // Technical/Mechanical fields
  gearboxType?: string;          // AUTOMATIC, MANUAL, ROBOTIC, CVT
  fuelType?: string;             // BENZIN, DIESEL, HYBRID, PLUG_IN, ELECTRIC
  bodyType?: string;             // SEDAN, HATCHBACK, SUV, etc.
  engineDisplacementCc?: string; // Engine capacity in cc
  horsepower?: string;           // HP
  numberOfGears?: string;        // Number of gears
  color?: string;                // Car color
  
  // Ownership fields
  handCount?: string;            // Number of previous owners (יד)
  ownershipType?: string;        // private, lease, company
  importType?: string;           // official, parallel, personal
  previousUse?: string;          // rental, lease, taxi, etc.
  
  // Condition fields
  hasAccidents?: boolean;        // Had accidents
  hasAC?: boolean;               // Has air conditioning
  
  // Additional fields
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
      
      // Core fields
      year: carData.year ? parseInt(carData.year, 10) : null,
      salePrice: carData.price ? parseFloat(carData.price) : 0,
      mileageKm: carData.mileageKm ? parseInt(carData.mileageKm, 10) : null,
      city: carData.city || null,
      
      // Identification fields
      licensePlatePartial: carData.licensePlatePartial || null,
      vin: carData.vin || null,
      stockNumber: carData.stockNumber || null,
      
      // Technical/Mechanical fields
      gearboxType: carData.gearboxType || null,
      fuelType: carData.fuelType || null,
      bodyType: carData.bodyType || null,
      engineDisplacementCc: carData.engineDisplacementCc ? parseInt(carData.engineDisplacementCc, 10) : null,
      horsepower: carData.horsepower ? parseInt(carData.horsepower, 10) : null,
      numberOfGears: carData.numberOfGears ? parseInt(carData.numberOfGears, 10) : null,
      color: carData.color || null,
      
      // Ownership fields
      handCount: carData.handCount ? parseInt(carData.handCount, 10) : null,
      ownershipType: carData.ownershipType || null,
      importType: carData.importType || null,
      previousUse: carData.previousUse || null,
      
      // Condition fields
      hasAccidents: carData.hasAccidents ?? null,
      hasAC: carData.hasAC ?? null,
      
      // Additional fields
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
      // Core fields
      brandId: data.brandId || null,
      brandText: data.brandText || data.brand || '',
      modelId: data.modelId || null,
      modelText: data.modelText || data.model || '',
      year: data.year?.toString() || '',
      price: (data.salePrice ?? data.price)?.toString() || '',
      mileageKm: data.mileageKm?.toString() || '',
      city: data.city || '',
      
      // Identification fields
      licensePlatePartial: data.licensePlatePartial || '',
      vin: data.vin || '',
      stockNumber: data.stockNumber || '',
      
      // Technical/Mechanical fields
      gearboxType: data.gearboxType || '',
      fuelType: data.fuelType || '',
      bodyType: data.bodyType || '',
      engineDisplacementCc: data.engineDisplacementCc?.toString() || '',
      horsepower: data.horsepower?.toString() || '',
      numberOfGears: data.numberOfGears?.toString() || '',
      color: data.color || '',
      
      // Ownership fields
      handCount: data.handCount?.toString() || '',
      ownershipType: data.ownershipType || '',
      importType: data.importType || '',
      previousUse: data.previousUse || '',
      
      // Condition fields
      hasAccidents: data.hasAccidents ?? undefined,
      hasAC: data.hasAC ?? undefined,
      
      // Additional fields
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

