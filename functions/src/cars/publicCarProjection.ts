/**
 * PUBLIC Car Projection Service
 * 
 * This module handles the public projection of yard cars
 * stored in publicCars/{carId}.
 * 
 * The publicCars collection is a projection derived from MASTER (carSales).
 * It contains only fields needed for listing, filtering, and basic display.
 */

import * as admin from "firebase-admin";
import type { PublicCar } from "../types/cars";
import { getYardCarMaster } from "./masterCarService";

const db = admin.firestore();

/**
 * Check if a master car document is published
 * 
 * Supports both legacy (status === 'published') and new (publicationStatus === 'PUBLISHED') formats.
 * 
 * @param data - Master car document data (from Firestore)
 * @returns true if the car is considered published
 */
export function isMasterCarPublished(data: any): boolean {
  const status = String(data?.status ?? '').toLowerCase();
  const pub = String(data?.publicationStatus ?? '').toUpperCase();
  return status === 'published' || pub === 'PUBLISHED';
}

/**
 * Create or update a public car projection from a YardCarMaster
 * 
 * This function enforces the invariant that:
 * - publicCars/{carId} uses the same carId as MASTER
 * - ownerType = 'yard'
 * - yardUid is stored
 * - isPublished + publishedAt are set correctly
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param carId - Car ID (must match MASTER carId)
 */
export async function upsertPublicCarFromMaster(
  yardUid: string,
  carId: string
): Promise<void> {
  try {
    // Step 1: Read MASTER from users/{yardUid}/carSales/{carId}
    const masterCar = await getYardCarMaster(yardUid, carId);
    
    if (!masterCar) {
      console.warn(`[publicCarProjection] MASTER car ${carId} not found for yard ${yardUid}, cannot create PUBLIC projection`);
      return;
    }
    
    // Step 2: Check if car is sold - sold cars should never be in publicCars
    if (masterCar.saleStatus === 'SOLD') {
      console.log(`[publicCarProjection] Car ${carId} is SOLD, unpublishing from publicCars`);
      await unpublishPublicCar(carId);
      return;
    }
    
    // Step 3: Only publish if status is 'published' OR publicationStatus is 'PUBLISHED'
    if (!isMasterCarPublished(masterCar)) {
      // If not published, delete from publicCars instead
      await unpublishPublicCar(carId);
      return;
    }
    
    // Step 4: Build PublicCar projection with safe field handling
    // Safely handle imageUrls array
    const safeImageUrls = Array.isArray(masterCar.imageUrls) ? masterCar.imageUrls : [];
    
    // Handle city fields - write both for backward compatibility
    const city = masterCar.city || masterCar.cityNameHe || null;
    const cityNameHe = masterCar.cityNameHe || masterCar.city || null;
    
    const publicCar: PublicCar = {
      carId: carId, // Same carId as MASTER
      yardUid: masterCar.yardUid,
      ownerType: 'yard',
      isPublished: true,
      publishedAt: Date.now(),
      highlightLevel: 'none', // Default, can be updated via promotions
      brand: masterCar.brand || null,
      model: masterCar.model || null,
      year: masterCar.year || null,
      mileageKm: masterCar.mileageKm || null,
      price: masterCar.price || null,
      gearType: masterCar.gearType || null,
      fuelType: masterCar.fuelType || null,
      cityNameHe: cityNameHe,
      mainImageUrl: masterCar.mainImageUrl || null,
      // Store a small subset of imageUrls for listing (first 5), safely handle empty/undefined
      imageUrls: safeImageUrls.slice(0, 5),
      bodyType: masterCar.bodyType || null,
      color: masterCar.color || null,
      createdAt: masterCar.createdAt || null,
      updatedAt: Date.now(),
    };
    
    // Step 5: Write to Firestore - include ALL fields Buyer reads with safe defaults
    const publicCarRef = db.collection("publicCars").doc(carId);
    await publicCarRef.set({
      ...publicCar,
      // Additional fields Buyer page reads (from carsApi.ts analysis):
      city: city, // Buyer reads data.city
      regionId: masterCar.regionId || null, // Buyer reads data.regionId
      cityId: masterCar.cityId || null, // Buyer reads data.cityId
      regionNameHe: masterCar.regionNameHe || null, // Buyer reads data.regionNameHe
      neighborhoodId: null, // Not in MASTER, but Buyer may read it
      neighborhoodNameHe: null, // Not in MASTER, but Buyer may read it
      // Legacy fields for backward compatibility (written directly, not in PublicCar type)
      ownerUid: masterCar.yardUid, // Some Buyer code may read ownerUid
      userId: masterCar.yardUid, // Some Buyer code may read userId
      gearboxType: masterCar.gearType || masterCar.gearboxType || null, // Buyer reads gearboxType (alias for gearType)
      gear: masterCar.gearType || null, // Buyer may read 'gear' as fallback
      // Ensure imageUrls is always an array (even if empty)
      imageUrls: safeImageUrls.slice(0, 5),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: publicCar.createdAt 
        ? admin.firestore.Timestamp.fromMillis(publicCar.createdAt)
        : admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    
    console.log(`[publicCarProjection] Upserted PUBLIC car projection: ${carId} for yard ${yardUid}`);
  } catch (error) {
    console.error(`[publicCarProjection] Error upserting PUBLIC car ${carId}:`, error);
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
    
    const publicCarRef = db.collection("publicCars").doc(carId);
    
    // Delete the document entirely
    // This is cleaner and ensures no stale data
    await publicCarRef.delete();
    
    console.log(`[publicCarProjection] Unpublished PUBLIC car (deleted): ${carId}`);
  } catch (error: any) {
    // If document doesn't exist, that's fine (already unpublished)
    if (error?.code === 5) { // NOT_FOUND error code
      console.log(`[publicCarProjection] PUBLIC car already unpublished: ${carId}`);
      return;
    }
    
    console.error(`[publicCarProjection] Error unpublishing PUBLIC car ${carId}:`, error);
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
    console.log(`[publicCarProjection] Batch unpublished cars: ${carIds.length}`);
  } catch (error) {
    console.error(`[publicCarProjection] Error batch unpublishing cars:`, error);
    throw error;
  }
}

