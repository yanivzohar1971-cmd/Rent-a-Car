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
import { rebuildPublicCarsForYardThrottled } from './publicCarsApi';

/**
 * Bulk update car publication status using Firestore batch writes
 * 
 * This function:
 * 1. Uses Firestore writeBatch for efficient bulk updates (up to 500 per batch)
 * 2. Updates only status fields (status + publicationStatus for backward compatibility)
 * 3. Chunks large updates into multiple batches if needed
 * 4. Yields to the event loop between batches to keep UI responsive
 * 5. Supports progress callbacks for real-time UI updates
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param carIds - Array of car IDs to update
 * @param status - Target publication status
 * @param opts - Optional configuration
 * @param opts.batchSize - Override batch size (default: 25 for large, 1 for small)
 * @param opts.onProgress - Callback called after each chunk with progress info
 * @param opts.onChunkCommitted - Callback called after each chunk commit with chunk IDs
 * @param opts.runBackfill - Whether to run legacy rebuild (default: false, uses server trigger)
 * @returns Statistics about the update operation
 */
export async function bulkUpdateCarStatus(
  yardUid: string,
  carIds: string[],
  status: CarPublicationStatus,
  opts?: {
    batchSize?: number;
    onProgress?: (p: { done: number; total: number; updated: number; errors: number }) => void;
    onChunkCommitted?: (chunkIds: string[], chunkUpdatedCount: number) => void;
    runBackfill?: boolean;
  }
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
  
  // Determine batch size: use provided override, or default based on total
  const defaultBatchSize = carIds.length <= 60 ? 1 : (opts?.batchSize ?? 25);
  const BATCH_SIZE = Math.min(opts?.batchSize ?? defaultBatchSize, 450); // Cap at 450 to leave room under Firestore's 500 limit
  
  let updated = 0;
  let errors = 0;
  let done = 0;
  let preparedIds: string[] = [];

  // Process in chunks
  for (let i = 0; i < carIds.length; i += BATCH_SIZE) {
    const chunk = carIds.slice(i, i + BATCH_SIZE);
    const batch = fsWriteBatch(db);
    preparedIds = [];

    // Add all updates to this batch
    for (const carId of chunk) {
      try {
        const carRef = doc(db, 'users', yardUid, 'carSales', carId);
        fsBatchUpdate(batch, carRef, {
          status: newStatus,
          publicationStatus: publicationStatus,
          updatedAt: serverTimestamp(),
        });
        preparedIds.push(carId);
      } catch (error) {
        console.error(`[yardBulkStatusApi] Error preparing update for car ${carId}:`, error);
        errors++;
      }
    }

    // Commit this batch
    let chunkUpdated = 0;
    try {
      await batch.commit();
      chunkUpdated = preparedIds.length;
      updated += chunkUpdated;
      done += chunk.length; // done tracks all cars processed (including errors)
      
      // Call onChunkCommitted callback with the successfully committed chunk IDs
      if (opts?.onChunkCommitted && chunkUpdated > 0) {
        opts.onChunkCommitted(preparedIds, chunkUpdated);
      }
      
      // Log progress in dev mode
      if (import.meta.env.MODE !== 'production') {
        console.log(`[yardBulkStatusApi] Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${chunkUpdated} cars updated`);
      }
    } catch (error) {
      console.error(`[yardBulkStatusApi] Error committing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
      errors += chunk.length;
      done += chunk.length;
    }

    // Call progress callback after each chunk
    if (opts?.onProgress) {
      opts.onProgress({
        done,
        total: carIds.length,
        updated,
        errors,
      });
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

  // After all batches complete, optionally run backfill (default: false, rely on server trigger)
  if (opts?.runBackfill && updated > 0 && (status === 'PUBLISHED' || status === 'HIDDEN' || status === 'DRAFT')) {
    try {
      if (import.meta.env.DEV) {
        console.log('[yardBulkStatusApi] Running throttled publicCars rebuild after bulk update');
      }
      await rebuildPublicCarsForYardThrottled(yardUid, 30_000);
    } catch (backfillError) {
      // Log but don't fail the bulk update
      console.error('[yardBulkStatusApi] Error running rebuild after bulk update:', backfillError);
    }
  }

  return stats;
}
