/**
 * MASTER Car API
 * 
 * This module provides centralized access to MASTER car documents
 * stored in users/{yardUid}/carSales/{carId}.
 * 
 * This is the single source of truth for yard inventory.
 * 
 * IMPORTANT: This API does NOT query or merge with publicCars.
 * For public-facing data, use publicCarsApi.ts instead.
 */

import { collection, getDocsFromServer, doc, getDocFromServer, setDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { YardCarMaster } from '../types/cars';
import { normalizeCarImages } from '../utils/carImageHelper';

/**
 * Filters for yard fleet queries
 */
export interface YardFleetFilters {
  text?: string; // Search in brand, model, licensePlatePartial, notes
  status?: 'draft' | 'published' | 'archived' | 'ALL';
  yearFrom?: number;
  yearTo?: number;
  imageFilter?: 'all' | 'withImages' | 'withoutImages';
}

/**
 * Sort configuration
 */
export interface YardFleetSort {
  field: 'createdAt' | 'updatedAt' | 'price' | 'mileageKm' | 'year';
  direction: 'asc' | 'desc';
}

/**
 * Fetch all yard cars for a user (MASTER only)
 * 
 * This function reads ONLY from users/{yardUid}/carSales.
 * It does NOT query or merge with publicCars.
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param filters - Optional filters (applied client-side)
 * @param sort - Optional sort configuration
 * @returns Array of YardCarMaster objects
 */
export async function fetchYardCarsForUser(
  yardUid: string,
  filters?: YardFleetFilters,
  sort?: YardFleetSort
): Promise<YardCarMaster[]> {
  try {
    const carSalesRef = collection(db, 'users', yardUid, 'carSales');
    
    // Build query - always order by updatedAt desc by default
    const orderByField = sort?.field || 'updatedAt';
    const orderByDirection = sort?.direction || 'desc';
    const q = query(carSalesRef, orderBy(orderByField, orderByDirection));
    
    const snapshot = await getDocsFromServer(q);

    // Map Firestore documents to YardCarMaster
    let cars = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const carId = docSnap.id;
      
      // Normalize images from MASTER data only
      const normalizedImages = normalizeCarImages(data);
      
      // Map status field (support both 'status' and legacy 'publicationStatus')
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
      
      // Build YardCarMaster object
      const car: YardCarMaster = {
        id: carId,
        yardUid: data.yardUid || yardUid, // Ensure yardUid is set
        ownerType: 'yard',
        status,
        brand: data.brand || data.brandText || null,
        model: data.model || data.modelText || null,
        year: typeof data.year === 'number' ? data.year : null,
        mileageKm: typeof data.mileageKm === 'number' ? data.mileageKm : null,
        price: typeof data.price === 'number' ? data.price : (typeof data.salePrice === 'number' ? data.salePrice : null),
        currency: data.currency || null,
        gearType: data.gearType || data.gearboxType || null,
        fuelType: data.fuelType || null,
        bodyType: data.bodyType || null,
        color: data.color || null,
        engineDisplacementCc: typeof data.engineDisplacementCc === 'number' ? data.engineDisplacementCc : null,
        horsepower: typeof data.horsepower === 'number' ? data.horsepower : null,
        numberOfGears: typeof data.numberOfGears === 'number' ? data.numberOfGears : null,
        handCount: typeof data.handCount === 'number' ? data.handCount : null,
        imageUrls: normalizedImages.imageUrls,
        mainImageUrl: normalizedImages.mainImageUrl,
        city: data.city || null,
        cityNameHe: data.cityNameHe || null,
        cityId: data.cityId || null,
        regionId: data.regionId || null,
        regionNameHe: data.regionNameHe || null,
        notes: data.notes || null,
        licensePlatePartial: data.licensePlatePartial || null,
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : (data.createdAt?.toMillis ? data.createdAt.toMillis() : null),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null),
        // Legacy fields for backward compatibility
        brandId: data.brandId || null,
        brandText: data.brandText || data.brand || null,
        modelId: data.modelId || null,
        modelText: data.modelText || data.model || null,
        salePrice: typeof data.salePrice === 'number' ? data.salePrice : null,
        gearboxType: data.gearboxType || data.gearType || null,
      };
      
      return car;
    });

    // Apply filters (client-side)
    if (filters) {
      cars = cars.filter((car) => {
        // Text search
        if (filters.text) {
          const searchText = filters.text.toLowerCase();
          const searchableText = [
            car.brand,
            car.model,
            car.licensePlatePartial,
            car.notes,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!searchableText.includes(searchText)) {
            return false;
          }
        }

        // Status filter
        if (filters.status && filters.status !== 'ALL') {
          if (car.status !== filters.status) {
            return false;
          }
        }

        // Year range
        if (filters.yearFrom && car.year !== null && car.year < filters.yearFrom) {
          return false;
        }
        if (filters.yearTo && car.year !== null && car.year > filters.yearTo) {
          return false;
        }

        // Image filter
        if (filters.imageFilter) {
          const hasImages = car.imageUrls.length > 0;
          if (filters.imageFilter === 'withImages' && !hasImages) {
            return false;
          }
          if (filters.imageFilter === 'withoutImages' && hasImages) {
            return false;
          }
        }

        return true;
      });
    }

    return cars;
  } catch (error) {
    console.error('[carsMasterApi] Error fetching yard cars:', error);
    throw error;
  }
}

/**
 * Get a single yard car by ID (MASTER only)
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param carId - Car document ID
 * @returns YardCarMaster or null if not found
 */
export async function getYardCarById(
  yardUid: string,
  carId: string
): Promise<YardCarMaster | null> {
  try {
    const carRef = doc(db, 'users', yardUid, 'carSales', carId);
    const docSnap = await getDocFromServer(carRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    
    // Normalize images
    const normalizedImages = normalizeCarImages(data);
    
    // Map status
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
      const pubStatus = String(data.publicationStatus).toUpperCase();
      if (pubStatus === 'PUBLISHED') {
        status = 'published';
      } else if (pubStatus === 'HIDDEN') {
        status = 'draft';
      } else {
        status = 'draft';
      }
    }
    
    return {
      id: carId,
      yardUid: data.yardUid || yardUid,
      ownerType: 'yard',
      status,
      brand: data.brand || data.brandText || null,
      model: data.model || data.modelText || null,
      year: typeof data.year === 'number' ? data.year : null,
      mileageKm: typeof data.mileageKm === 'number' ? data.mileageKm : null,
      price: typeof data.price === 'number' ? data.price : (typeof data.salePrice === 'number' ? data.salePrice : null),
      currency: data.currency || null,
      gearType: data.gearType || data.gearboxType || null,
      fuelType: data.fuelType || null,
      bodyType: data.bodyType || null,
      color: data.color || null,
      engineDisplacementCc: typeof data.engineDisplacementCc === 'number' ? data.engineDisplacementCc : null,
      horsepower: typeof data.horsepower === 'number' ? data.horsepower : null,
      numberOfGears: typeof data.numberOfGears === 'number' ? data.numberOfGears : null,
      handCount: typeof data.handCount === 'number' ? data.handCount : null,
      imageUrls: normalizedImages.imageUrls,
      mainImageUrl: normalizedImages.mainImageUrl,
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
    };
  } catch (error) {
    console.error('[carsMasterApi] Error fetching yard car by ID:', error);
    throw error;
  }
}

/**
 * Save a yard car (create or update MASTER document)
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param car - YardCarMaster object (id field must match doc.id)
 */
export async function saveYardCar(
  yardUid: string,
  car: YardCarMaster
): Promise<void> {
  try {
    const carRef = doc(db, 'users', yardUid, 'carSales', car.id);
    
    // Prepare Firestore document data
    const docData: any = {
      yardUid: car.yardUid,
      ownerType: car.ownerType,
      status: car.status,
      brand: car.brand,
      model: car.model,
      year: car.year,
      mileageKm: car.mileageKm,
      price: car.price,
      currency: car.currency || null,
      gearType: car.gearType,
      fuelType: car.fuelType,
      bodyType: car.bodyType,
      color: car.color,
      imageUrls: car.imageUrls,
      mainImageUrl: car.mainImageUrl,
      city: car.city || null,
      cityNameHe: car.cityNameHe || null,
      cityId: car.cityId || null,
      regionId: car.regionId || null,
      regionNameHe: car.regionNameHe || null,
      notes: car.notes || null,
      licensePlatePartial: car.licensePlatePartial || null,
      updatedAt: serverTimestamp(),
    };
    
    // Add optional fields if present
    if (car.engineDisplacementCc !== null && car.engineDisplacementCc !== undefined) {
      docData.engineDisplacementCc = car.engineDisplacementCc;
    }
    if (car.horsepower !== null && car.horsepower !== undefined) {
      docData.horsepower = car.horsepower;
    }
    if (car.numberOfGears !== null && car.numberOfGears !== undefined) {
      docData.numberOfGears = car.numberOfGears;
    }
    if (car.handCount !== null && car.handCount !== undefined) {
      docData.handCount = car.handCount;
    }
    
    // Handle createdAt (only set on create, not update)
    const existingDoc = await getDocFromServer(carRef);
    if (!existingDoc.exists()) {
      docData.createdAt = serverTimestamp();
    } else {
      // Preserve existing createdAt
      const existingData = existingDoc.data();
      if (existingData.createdAt) {
        docData.createdAt = existingData.createdAt;
      }
    }
    
    // Legacy field support (for backward compatibility)
    if (car.brandId) docData.brandId = car.brandId;
    if (car.brandText) docData.brandText = car.brandText;
    if (car.modelId) docData.modelId = car.modelId;
    if (car.modelText) docData.modelText = car.modelText;
    if (car.salePrice !== null && car.salePrice !== undefined) docData.salePrice = car.salePrice;
    if (car.gearboxType) docData.gearboxType = car.gearboxType;
    
    // Also set publicationStatus for backward compatibility
    if (car.status === 'published') {
      docData.publicationStatus = 'PUBLISHED';
    } else if (car.status === 'archived') {
      docData.publicationStatus = 'HIDDEN'; // Map archived to HIDDEN for legacy
    } else {
      docData.publicationStatus = 'DRAFT';
    }
    
    await setDoc(carRef, docData, { merge: true });
    
    console.log('[carsMasterApi] Saved yard car:', { yardUid, carId: car.id, status: car.status });
  } catch (error) {
    console.error('[carsMasterApi] Error saving yard car:', error);
    throw error;
  }
}

