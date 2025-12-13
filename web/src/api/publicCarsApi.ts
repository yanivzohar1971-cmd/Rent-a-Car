/**
 * PUBLIC Car Projection API
 * 
 * This module handles the public projection of yard cars
 * stored in publicCars/{carId}.
 * 
 * The publicCars collection is a projection derived from MASTER (carSales).
 * It contains only fields needed for listing, filtering, and basic display.
 * 
 * IMPORTANT: This module should NOT be used for yard management screens.
 * Yard screens should use carsMasterApi.ts instead.
 */

import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { YardCarMaster, PublicCar } from '../types/cars';

/**
 * Create or update a public car projection from a YardCarMaster
 * 
 * This function enforces the invariant that:
 * - publicCars/{carId} uses the same carId as MASTER
 * - ownerType = 'yard'
 * - yardUid is stored
 * - isPublished + publishedAt are set correctly
 * 
 * @param yardCar - The MASTER car to project to public
 */
export async function upsertPublicCarFromYardCar(yardCar: YardCarMaster): Promise<void> {
  try {
    // Enforce invariants
    if (!yardCar.id || !yardCar.yardUid) {
      throw new Error('YardCarMaster must have id and yardUid');
    }
    
    if (yardCar.ownerType !== 'yard') {
      throw new Error('YardCarMaster must have ownerType="yard"');
    }
    
    // Only publish if status is 'published'
    if (yardCar.status !== 'published') {
      // If not published, delete from publicCars instead
      console.log('[publicCarsApi] Car not published, unpublishing:', {
        carId: yardCar.id,
        status: yardCar.status,
      });
      await unpublishPublicCar(yardCar.id);
      return;
    }
    
    // Build PublicCar projection
    const cityNameHe = yardCar.cityNameHe || yardCar.city || null;
    const city = yardCar.city || yardCar.cityNameHe || null;
    
    const publicCar: PublicCar = {
      carId: yardCar.id, // Same carId as MASTER
      yardUid: yardCar.yardUid,
      ownerType: 'yard',
      isPublished: true,
      publishedAt: Date.now(),
      highlightLevel: 'none', // Default, can be updated via promotions
      brand: yardCar.brand,
      model: yardCar.model,
      year: yardCar.year,
      mileageKm: yardCar.mileageKm,
      price: yardCar.price,
      gearType: yardCar.gearType,
      fuelType: yardCar.fuelType,
      cityNameHe: cityNameHe,
      mainImageUrl: yardCar.mainImageUrl,
      // Store a small subset of imageUrls for listing (first 5)
      imageUrls: (yardCar.imageUrls || []).slice(0, 5),
      bodyType: yardCar.bodyType || null,
      color: yardCar.color || null,
      createdAt: yardCar.createdAt || null,
      updatedAt: Date.now(),
    };
    
    // Write to Firestore - include both cityNameHe and city for backward compatibility
    const publicCarRef = doc(db, 'publicCars', yardCar.id);
    await setDoc(publicCarRef, {
      ...publicCar,
      city: city, // Also write 'city' field for backward compatibility with Buyer page
      updatedAt: serverTimestamp(),
      createdAt: publicCar.createdAt ? serverTimestamp() : serverTimestamp(),
    }, { merge: true });
    
    console.log('[publicCarsApi] Upserted public car projection:', {
      carId: yardCar.id,
      yardUid: yardCar.yardUid,
      isPublished: true,
      status: yardCar.status,
    });
  } catch (error) {
    console.error('[publicCarsApi] Error upserting public car:', error);
    throw error;
  }
}

/**
 * Unpublish a car (delete from publicCars or mark as unpublished)
 * 
 * @param carId - Car ID (must match MASTER carId)
 */
export async function unpublishPublicCar(carId: string): Promise<void> {
  try {
    if (!carId || typeof carId !== 'string' || carId.trim() === '') {
      throw new Error('carId must be a non-empty string');
    }
    
    const publicCarRef = doc(db, 'publicCars', carId);
    
    // Option 1: Delete the document entirely
    // This is cleaner and ensures no stale data
    await deleteDoc(publicCarRef);
    
    console.log('[publicCarsApi] Unpublished public car (deleted):', { carId });
  } catch (error: any) {
    // If document doesn't exist, that's fine (already unpublished)
    // Firestore uses different error codes depending on the SDK version
    const errorCode = error?.code || error?.errorInfo?.code || '';
    if (errorCode === 'not-found' || errorCode === 'NOT_FOUND' || errorCode === 5) {
      console.log('[publicCarsApi] Public car already unpublished (not found):', { carId });
      return; // Silently succeed if already unpublished
    }
    
    // For permission errors, also log but don't fail (car might not be published yet)
    if (errorCode === 'permission-denied' || errorCode === 'PERMISSION_DENIED' || errorCode === 7) {
      console.warn('[publicCarsApi] Permission denied when unpublishing (may not exist):', { carId });
      return; // Silently succeed - car is effectively unpublished
    }
    
    // For other errors, log and rethrow
    console.error('[publicCarsApi] Error unpublishing public car:', {
      carId,
      errorCode,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Batch unpublish multiple cars
 * 
 * @param carIds - Array of car IDs to unpublish
 */
export async function batchUnpublishPublicCars(carIds: string[]): Promise<void> {
  try {
    await Promise.all(carIds.map(carId => unpublishPublicCar(carId)));
    console.log('[publicCarsApi] Batch unpublished cars:', { count: carIds.length });
  } catch (error) {
    console.error('[publicCarsApi] Error batch unpublishing cars:', error);
    throw error;
  }
}

