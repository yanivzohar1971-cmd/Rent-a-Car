/**
 * Bulk Status Update API
 * 
 * This module provides efficient batch updates for car publication status
 * using Firestore batch writes (up to 500 operations per batch).
 */

import { doc, getFirestore, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { fsWriteBatch, fsBatchUpdate } from './firestoreWrite';
import type { CarPublicationStatus } from './yardPublishApi';
import { rebuildPublicCarsForYard } from './publicCarsApi';

/**
 * Bulk update car publication status using Firestore batch writes
 * 
 * This function:
 * 1. Uses Firestore writeBatch for efficient bulk updates (up to 500 per batch)
 * 2. Updates only status fields (status + publicationStatus for backward compatibility)
 * 3. Chunks large updates into multiple batches if needed
 * 4. Yields to the event loop between batches to keep UI responsive
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param carIds - Array of car IDs to update
 * @param status - Target publication status
 * @returns Statistics about the update operation
 */
export async function bulkUpdateCarStatus(
  yardUid: string,
  carIds: string[],
  status: CarPublicationStatus
): Promise<{
  total: number;
  updated: number;
  errors: number;
}> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to bulk update car status');
  }

  if (carIds.length === 0) {
    return { total: 0, updated: 0, errors: 0 };
  }

  // Map CarPublicationStatus to internal status format
  let newStatus: 'draft' | 'published' | 'archived';
  let publicationStatus: 'DRAFT' | 'HIDDEN' | 'PUBLISHED';
  
  if (status === 'PUBLISHED') {
    newStatus = 'published';
    publicationStatus = 'PUBLISHED';
  } else if (status === 'HIDDEN') {
    newStatus = 'archived'; // HIDDEN maps to archived (not draft)
    publicationStatus = 'HIDDEN';
  } else {
    newStatus = 'draft';
    publicationStatus = 'DRAFT';
  }

  const db = getFirestore();
  const BATCH_SIZE = 450; // Leave room under Firestore's 500 limit
  let updated = 0;
  let errors = 0;

  // Process in chunks
  for (let i = 0; i < carIds.length; i += BATCH_SIZE) {
    const chunk = carIds.slice(i, i + BATCH_SIZE);
    const batch = fsWriteBatch(db);

    // Add all updates to this batch
    for (const carId of chunk) {
      try {
        const carRef = doc(db, 'users', yardUid, 'carSales', carId);
        fsBatchUpdate(batch, carRef, {
          status: newStatus,
          publicationStatus: publicationStatus,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error(`[yardBulkStatusApi] Error preparing update for car ${carId}:`, error);
        errors++;
      }
    }

    // Commit this batch
    try {
      await batch.commit();
      updated += chunk.length;
      
      // Log progress in dev mode
      if (import.meta.env.MODE !== 'production') {
        console.log(`[yardBulkStatusApi] Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${chunk.length} cars updated`);
      }
    } catch (error) {
      console.error(`[yardBulkStatusApi] Error committing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
      errors += chunk.length;
    }

    // Yield to event loop between batches to keep UI responsive
    if (i + BATCH_SIZE < carIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const stats = {
    total: carIds.length,
    updated,
    errors,
  };

  if (import.meta.env.MODE !== 'production') {
    console.log('[yardBulkStatusApi] Bulk update completed:', {
      ...stats,
      status: newStatus,
      publicationStatus,
    });
  }

  // After all batches complete, run backfill to keep publicCars projection in sync
  if (updated > 0 && (status === 'PUBLISHED' || status === 'HIDDEN' || status === 'DRAFT')) {
    try {
      if (import.meta.env.DEV) {
        console.log('[yardBulkStatusApi] Running publicCars backfill after bulk update');
      }
      await rebuildPublicCarsForYard();
    } catch (backfillError) {
      // Log but don't fail the bulk update
      console.error('[yardBulkStatusApi] Error running backfill after bulk update:', backfillError);
    }
  }

  return stats;
}
