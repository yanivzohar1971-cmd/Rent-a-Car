/**
 * MASTER Car Service
 * 
 * Centralized service for writing MASTER car documents to Firestore.
 * All Excel imports and backend car writes should go through this service.
 */

import * as admin from "firebase-admin";
import type { YardCarMaster, ImportRowNormalized } from "../types/cars";

const db = admin.firestore();

/**
 * Generate a deterministic carId from import row data
 * 
 * Uses licenseClean + year + yardUid to create a unique but deterministic ID.
 * Falls back to Firestore auto-ID if needed.
 */
export function generateCarIdFromImportRow(
  normalized: ImportRowNormalized,
  yardUid: string
): string {
  // Try to create deterministic ID from license + year
  if (normalized.licenseClean && normalized.year) {
    // Format: {yardUid}_{licenseClean}_{year}
    const cleanLicense = normalized.licenseClean.replace(/\s+/g, "");
    return `${yardUid}_${cleanLicense}_${normalized.year}`;
  }
  
  // Fallback: use timestamp-based ID
  return `${yardUid}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Build YardCarMaster data from an import row
 */
export function buildYardCarMasterDataFromImportRow(
  normalized: ImportRowNormalized,
  yardUid: string,
  carId: string,
  options?: {
    status?: 'draft' | 'published' | 'archived';
    importJobId?: string;
    importedAt?: admin.firestore.Timestamp;
  }
): YardCarMaster {
  // Map gear to gearType
  let gearType: string | null = null;
  if (normalized.gear) {
    const gearLower = String(normalized.gear).toLowerCase();
    if (gearLower.includes("automatic") || gearLower.includes("auto") || gearLower.includes("אוטו")) {
      gearType = "AUTOMATIC";
    } else if (gearLower.includes("manual") || gearLower.includes("ידני")) {
      gearType = "MANUAL";
    } else if (gearLower.includes("cvt")) {
      gearType = "CVT";
    } else if (gearLower.includes("dct")) {
      gearType = "DCT";
    } else if (gearLower.includes("amt")) {
      gearType = "AMT";
    } else {
      gearType = "OTHER";
    }
  }

  const now = Date.now();
  const status = options?.status || 'draft';

  return {
    id: carId,
    yardUid: yardUid,
    ownerType: 'yard',
    status: status,
    brand: normalized.manufacturer || null,
    model: normalized.model || null,
    year: normalized.year || null,
    mileageKm: normalized.mileage || null,
    price: normalized.askPrice || normalized.listPrice || null,
    currency: 'ILS', // Default to ILS
    gearType: gearType,
    fuelType: null, // Not available in Excel import
    bodyType: null, // Not available in Excel import
    color: normalized.color || null,
    engineDisplacementCc: normalized.engineCc || null,
    handCount: normalized.hand || null,
    imageUrls: [], // Initialize empty - images added later
    mainImageUrl: null,
    city: null,
    cityNameHe: null,
    notes: normalized.license 
      ? `יובא מ-${normalized.license}` 
      : "יובא מקובץ אקסל",
    licensePlatePartial: normalized.licenseClean || null,
    createdAt: now,
    updatedAt: now,
    // Legacy fields for backward compatibility
    brandText: normalized.manufacturer || null,
    modelText: normalized.model || null,
    salePrice: normalized.askPrice || normalized.listPrice || null,
    gearboxType: gearType, // Alias
    publicationStatus: status === 'published' ? 'PUBLISHED' : status === 'archived' ? 'HIDDEN' : 'DRAFT',
  };
}

/**
 * Upsert a MASTER car document
 * 
 * Creates or updates a car document in users/{yardUid}/carSales/{carId}
 */
export async function upsertYardCarMaster(
  yardUid: string,
  carId: string,
  data: Partial<YardCarMaster>
): Promise<void> {
  try {
    const carRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales")
      .doc(carId);

    // Check if document exists
    const existingDoc = await carRef.get();
    const nowMillis = Date.now();

    // Prepare document data
    const docData: any = {
      id: carId, // Ensure ID is set
      yardUid: yardUid,
      ownerType: data.ownerType || 'yard',
      status: data.status || 'draft',
      brand: data.brand || null,
      model: data.model || null,
      year: data.year || null,
      mileageKm: data.mileageKm || null,
      price: data.price || null,
      currency: data.currency || 'ILS',
      gearType: data.gearType || null,
      fuelType: data.fuelType || null,
      bodyType: data.bodyType || null,
      color: data.color || null,
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
      mainImageUrl: data.mainImageUrl || null,
      city: data.city || null,
      cityNameHe: data.cityNameHe || null,
      cityId: data.cityId || null,
      regionId: data.regionId || null,
      regionNameHe: data.regionNameHe || null,
      notes: data.notes || null,
      licensePlatePartial: data.licensePlatePartial || null,
      updatedAt: nowMillis,
    };

    // Add optional fields if present
    if (data.engineDisplacementCc !== null && data.engineDisplacementCc !== undefined) {
      docData.engineDisplacementCc = data.engineDisplacementCc;
    }
    if (data.horsepower !== null && data.horsepower !== undefined) {
      docData.horsepower = data.horsepower;
    }
    if (data.numberOfGears !== null && data.numberOfGears !== undefined) {
      docData.numberOfGears = data.numberOfGears;
    }
    if (data.handCount !== null && data.handCount !== undefined) {
      docData.handCount = data.handCount;
    }

    // Handle createdAt (only set on create, preserve on update)
    if (!existingDoc.exists) {
      docData.createdAt = nowMillis;
    } else {
      // Preserve existing createdAt
      const existingData = existingDoc.data();
      if (existingData?.createdAt) {
        docData.createdAt = existingData.createdAt;
      } else {
        docData.createdAt = nowMillis;
      }
    }

    // Legacy field support (for backward compatibility)
    if (data.brandText) docData.brandText = data.brandText;
    if (data.modelText) docData.modelText = data.modelText;
    if (data.salePrice !== null && data.salePrice !== undefined) docData.salePrice = data.salePrice;
    if (data.gearboxType) docData.gearboxType = data.gearboxType;
    
    // Map status to legacy publicationStatus
    if (data.status === 'published') {
      docData.publicationStatus = 'PUBLISHED';
    } else if (data.status === 'archived') {
      docData.publicationStatus = 'HIDDEN';
    } else {
      docData.publicationStatus = 'DRAFT';
    }

    // Use set with merge to handle both create and update
    await carRef.set(docData, { merge: true });

    console.log(`[masterCarService] Upserted MASTER car: ${carId} for yard ${yardUid}, status: ${data.status || 'draft'}`);
  } catch (error) {
    console.error(`[masterCarService] Error upserting MASTER car ${carId}:`, error);
    throw error;
  }
}

/**
 * Get a MASTER car by ID
 */
export async function getYardCarMaster(
  yardUid: string,
  carId: string
): Promise<YardCarMaster | null> {
  try {
    const carRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales")
      .doc(carId);
    
    const docSnap = await carRef.get();
    
    if (!docSnap.exists) {
      return null;
    }
    
    const data = docSnap.data();
    if (!data) {
      return null;
    }

    // Map Firestore data to YardCarMaster
    // Handle both new format and legacy format
    let status: 'draft' | 'published' | 'archived' = 'draft';
    if (data.status) {
      const statusLower = String(data.status).toLowerCase();
      if (statusLower === 'published' || statusLower === 'publish') {
        status = 'published';
      } else if (statusLower === 'archived') {
        status = 'archived';
      } else {
        status = 'draft';
      }
    } else if (data.publicationStatus) {
      // Legacy field support
      const pubStatus = String(data.publicationStatus).toUpperCase();
      if (pubStatus === 'PUBLISHED') {
        status = 'published';
      } else if (pubStatus === 'HIDDEN') {
        status = 'draft'; // HIDDEN maps to draft
      } else {
        status = 'draft';
      }
    }

    return {
      id: carId,
      yardUid: data.yardUid || yardUid,
      ownerType: data.ownerType || 'yard',
      status: status,
      brand: data.brand || data.brandText || null,
      model: data.model || data.modelText || null,
      year: typeof data.year === 'number' ? data.year : null,
      mileageKm: typeof data.mileageKm === 'number' ? data.mileageKm : null,
      price: typeof data.price === 'number' ? data.price : (typeof data.salePrice === 'number' ? data.salePrice : null),
      currency: data.currency || 'ILS',
      gearType: data.gearType || data.gearboxType || null,
      fuelType: data.fuelType || null,
      bodyType: data.bodyType || null,
      color: data.color || null,
      engineDisplacementCc: typeof data.engineDisplacementCc === 'number' ? data.engineDisplacementCc : null,
      horsepower: typeof data.horsepower === 'number' ? data.horsepower : null,
      numberOfGears: typeof data.numberOfGears === 'number' ? data.numberOfGears : null,
      handCount: typeof data.handCount === 'number' ? data.handCount : null,
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
      mainImageUrl: data.mainImageUrl || null,
      city: data.city || null,
      cityNameHe: data.cityNameHe || null,
      cityId: data.cityId || null,
      regionId: data.regionId || null,
      regionNameHe: data.regionNameHe || null,
      notes: data.notes || null,
      licensePlatePartial: data.licensePlatePartial || null,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : (data.createdAt?.toMillis ? data.createdAt.toMillis() : null),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null),
      brandId: data.brandId || null,
      brandText: data.brandText || data.brand || null,
      modelId: data.modelId || null,
      modelText: data.modelText || data.model || null,
      salePrice: typeof data.salePrice === 'number' ? data.salePrice : null,
      gearboxType: data.gearboxType || data.gearType || null,
      publicationStatus: status === 'published' ? 'PUBLISHED' : status === 'archived' ? 'HIDDEN' : 'DRAFT',
    };
  } catch (error) {
    console.error(`[masterCarService] Error fetching MASTER car ${carId}:`, error);
    throw error;
  }
}

