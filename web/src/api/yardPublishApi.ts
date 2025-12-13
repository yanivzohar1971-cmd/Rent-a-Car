import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import { getYardCarById, saveYardCar } from './carsMasterApi';
import { upsertPublicCarFromYardCar, unpublishPublicCar } from './publicCarsApi';
import type { YardCarMaster } from '../types/cars';

/**
 * Car publication status (matches Android CarPublicationStatus enum)
 */
export type CarPublicationStatus = 'DRAFT' | 'HIDDEN' | 'PUBLISHED';

/**
 * Update publication status for a single car
 * 
 * This function:
 * 1. Updates the MASTER document (carSales) with new status
 * 2. Updates the PUBLIC projection (publicCars) accordingly
 */
export async function updateCarPublicationStatus(
  carId: string,
  status: CarPublicationStatus
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to update car status');
  }

  try {
    // Step 1: Get the current MASTER car
    const yardCar = await getYardCarById(user.uid, carId);
    if (!yardCar) {
      throw new Error(`Car ${carId} not found`);
    }
    
    // Step 2: Map CarPublicationStatus to YardCarMaster.status
    // CRITICAL: HIDDEN must map to 'archived' (not 'draft') so that saveYardCar
    // correctly sets publicationStatus='HIDDEN' and yardFleetApi maps it back correctly
    let newStatus: 'draft' | 'published' | 'archived';
    if (status === 'PUBLISHED') {
      newStatus = 'published';
    } else if (status === 'HIDDEN') {
      newStatus = 'archived'; // HIDDEN maps to archived (not draft)
    } else {
      newStatus = 'draft';
    }
    
    // Step 3: Update MASTER with new status
    const updatedCar: YardCarMaster = {
      ...yardCar,
      status: newStatus,
    };
    await saveYardCar(user.uid, updatedCar);
    
    // Step 4: Update PUBLIC projection
    // Note: We update publicCars projection, but don't fail the whole operation if it fails
    // The MASTER update (Step 3) is the source of truth
    try {
      if (newStatus === 'published') {
        await upsertPublicCarFromYardCar(updatedCar);
      } else {
        await unpublishPublicCar(carId);
      }
    } catch (publicError: any) {
      // Log but don't fail - MASTER update already succeeded
      console.warn('[yardPublishApi] Public projection update failed (non-critical):', {
        carId,
        inputStatus: status,
        masterStatus: newStatus,
        publicError: publicError instanceof Error ? publicError.message : String(publicError),
      });
      // Continue - the MASTER update is what matters
    }
    
    console.log('[yardPublishApi] Updated car publication status:', { 
      carId, 
      inputStatus: status, 
      masterStatus: newStatus,
      userId: user.uid 
    });
  } catch (error) {
    console.error('[yardPublishApi] Error updating car publication status:', {
      carId,
      inputStatus: status,
      userId: user.uid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Batch update publication status for multiple cars
 * 
 * This function updates both MASTER and PUBLIC projections for multiple cars.
 */
export async function batchUpdateCarPublicationStatus(
  carIds: string[],
  status: CarPublicationStatus
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to batch update car status');
  }

  if (carIds.length === 0) {
    return; // Nothing to update
  }

  try {
    // Map status
    // CRITICAL: HIDDEN must map to 'archived' (not 'draft') so that saveYardCar
    // correctly sets publicationStatus='HIDDEN' and yardFleetApi maps it back correctly
    let newStatus: 'draft' | 'published' | 'archived';
    if (status === 'PUBLISHED') {
      newStatus = 'published';
    } else if (status === 'HIDDEN') {
      newStatus = 'archived'; // HIDDEN maps to archived (not draft)
    } else {
      newStatus = 'draft';
    }
    
    // Process each car
    const updatePromises = carIds.map(async (carId) => {
      try {
        const yardCar = await getYardCarById(user.uid, carId);
        if (!yardCar) {
          console.warn(`[yardPublishApi] Car ${carId} not found, skipping`);
          return;
        }
        
        const updatedCar: YardCarMaster = {
          ...yardCar,
          status: newStatus,
        };
        
        // Update MASTER
        await saveYardCar(user.uid, updatedCar);
        
        // Update PUBLIC projection
        if (newStatus === 'published') {
          await upsertPublicCarFromYardCar(updatedCar);
        } else {
          await unpublishPublicCar(carId);
        }
      } catch (error) {
        console.error(`[yardPublishApi] Error updating car ${carId}:`, error);
        // Continue with other cars even if one fails
      }
    });
    
    await Promise.all(updatePromises);
    console.log('[yardPublishApi] Batch updated car publication status:', { count: carIds.length, status: newStatus });
  } catch (error) {
    console.error('[yardPublishApi] Error batch updating car publication status:', error);
    throw error;
  }
}

/**
 * Get cars by publication status
 */
export async function fetchCarsByStatus(
  status: CarPublicationStatus | null
): Promise<string[]> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to fetch cars by status');
  }

  try {
    const carSalesRef = collection(db, 'users', user.uid, 'carSales');
    
    let q;
    if (status) {
      q = query(carSalesRef, where('publicationStatus', '==', status));
    } else {
      q = query(carSalesRef);
    }

    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map((docSnap) => docSnap.id);
  } catch (error) {
    console.error('Error fetching cars by status:', error);
    throw error;
  }
}

