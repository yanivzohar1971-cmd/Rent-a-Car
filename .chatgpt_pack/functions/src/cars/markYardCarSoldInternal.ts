/**
 * Internal helper: Mark a yard car as sold and delete images
 * 
 * This is shared logic extracted from markYardCarSold callable function
 * to enable reuse in yardImportCommitJob for bulk operations.
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param carId - Car ID to mark as sold
 * @returns Promise that resolves when operation completes
 */

import * as admin from "firebase-admin";
import { unpublishPublicCar } from "./publicCarProjection";

const db = admin.firestore();
const storage = admin.storage();

export async function markYardCarSoldInternal(
  yardUid: string,
  carId: string
): Promise<void> {
  console.log(`[markYardCarSoldInternal] Marking car ${carId} as sold for yard ${yardUid}`);

  try {
    // Step 1: Read MASTER doc and validate ownership
    const carRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales")
      .doc(carId);
    
    const carDoc = await carRef.get();
    
    if (!carDoc.exists) {
      throw new Error(`Car ${carId} not found`);
    }

    const carData = carDoc.data();
    if (!carData) {
      throw new Error(`Car ${carId} data is empty`);
    }

    // Validate ownership
    if (carData.yardUid !== yardUid) {
      throw new Error(`You do not own this car`);
    }

    // Check if already sold
    if (carData.saleStatus === 'SOLD') {
      console.log(`[markYardCarSoldInternal] Car ${carId} is already marked as SOLD`);
      return;
    }

    // Step 2: Collect image URLs before clearing (for Storage deletion)
    const imageUrls = Array.isArray(carData.imageUrls) ? carData.imageUrls : [];
    const mainImageUrl = carData.mainImageUrl || null;
    const allImageUrls = [...imageUrls];
    if (mainImageUrl && !allImageUrls.includes(mainImageUrl)) {
      allImageUrls.push(mainImageUrl);
    }

    // Step 3: Calculate profitability snapshots (if not already set)
    // This ensures historical results don't change when commission rules are updated later
    const salePrice = typeof carData.soldPrice === 'number' ? carData.soldPrice : 
                      (typeof carData.price === 'number' ? carData.price : 0);
    const costPrice = typeof carData.costPrice === 'number' ? carData.costPrice : null;
    const commissionType = carData.commissionType || null;
    const commissionValue = typeof carData.commissionValue === 'number' ? carData.commissionValue : null;
    
    // Calculate snapshots only if they don't already exist (preserve historical data)
    let profitSnapshot: number | null = null;
    let commissionSnapshot: number | null = null;
    let netProfitSnapshot: number | null = null;
    
    // Profit snapshot: salePrice - costPrice (if costPrice exists)
    if (costPrice !== null && costPrice !== undefined) {
      profitSnapshot = salePrice - costPrice;
    }
    
    // Commission snapshot: calculate based on commissionType and commissionValue
    if (commissionType && commissionValue !== null && commissionValue !== undefined) {
      if (commissionType === 'FIXED') {
        commissionSnapshot = commissionValue;
      } else if (commissionType === 'PERCENT_OF_SALE') {
        commissionSnapshot = salePrice * (commissionValue / 100);
      } else if (commissionType === 'PERCENT_OF_PROFIT') {
        const profit = profitSnapshot !== null ? Math.max(profitSnapshot, 0) : 0;
        commissionSnapshot = profit * (commissionValue / 100);
      }
    }
    
    // Net profit snapshot: profitSnapshot - commissionSnapshot
    if (profitSnapshot !== null && commissionSnapshot !== null) {
      netProfitSnapshot = profitSnapshot - commissionSnapshot;
    }

    // Step 4: Update MASTER doc
    const now = admin.firestore.Timestamp.now();
    const updateData: any = {
      saleStatus: 'SOLD',
      soldAt: now,
      status: 'archived', // Ensure it won't be published
      publicationStatus: 'HIDDEN', // Legacy support
      // Clear all image metadata fields
      imageUrls: [],
      mainImageUrl: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Store snapshots only if they don't already exist (preserve historical data)
    // This ensures that if a car is marked as sold again, we don't overwrite existing snapshots
    if (carData.profitSnapshot === undefined && profitSnapshot !== null) {
      updateData.profitSnapshot = profitSnapshot;
    }
    if (carData.commissionSnapshot === undefined && commissionSnapshot !== null) {
      updateData.commissionSnapshot = commissionSnapshot;
    }
    if (carData.netProfitSnapshot === undefined && netProfitSnapshot !== null) {
      updateData.netProfitSnapshot = netProfitSnapshot;
    }

    // Clear additional image fields if they exist
    if (carData.imagesJson) {
      updateData.imagesJson = admin.firestore.FieldValue.delete();
    }
    if (carData.images) {
      updateData.images = admin.firestore.FieldValue.delete();
    }
    if (carData.imagesCount !== undefined) {
      updateData.imagesCount = 0;
    }
    if (carData.ImagesCount !== undefined) {
      updateData.ImagesCount = 0;
    }
    if (carData.imageCount !== undefined) {
      updateData.imageCount = 0;
    }

    await carRef.update(updateData);
    console.log(`[markYardCarSoldInternal] Updated MASTER doc for car ${carId}`, {
      profitSnapshot: updateData.profitSnapshot !== undefined ? updateData.profitSnapshot : 'preserved',
      commissionSnapshot: updateData.commissionSnapshot !== undefined ? updateData.commissionSnapshot : 'preserved',
      netProfitSnapshot: updateData.netProfitSnapshot !== undefined ? updateData.netProfitSnapshot : 'preserved',
    });

    // Step 5: Delete PUBLIC projection
    try {
      await unpublishPublicCar(carId);
      console.log(`[markYardCarSoldInternal] Deleted publicCars projection for car ${carId}`);
    } catch (unpubError: any) {
      // Non-critical: log but continue
      console.warn(`[markYardCarSoldInternal] Error deleting publicCars (non-critical):`, unpubError);
    }

    // Step 6: Delete ALL Storage files for this car
    // Storage path pattern: users/{uid}/cars/{carId}/images/{imageId}.jpg
    // Must be precise to avoid deleting other cars' files
    const storagePrefix = `users/${yardUid}/cars/${carId}/images/`;
    const bucket = storage.bucket();
    
    try {
      const [files] = await bucket.getFiles({ prefix: storagePrefix });
      console.log(`[markYardCarSoldInternal] Found ${files.length} files to delete in Storage for car ${carId}`);
      
      if (files.length > 0) {
        // Delete all files
        await Promise.all(files.map(file => file.delete()));
        console.log(`[markYardCarSoldInternal] Deleted ${files.length} Storage files for car ${carId}`);
      }
    } catch (storageError: any) {
      // Log but don't fail - Storage deletion is best-effort
      console.error(`[markYardCarSoldInternal] Error deleting Storage files (non-critical):`, storageError);
    }

    // Also try to delete files from imageUrls if they're in Storage
    if (allImageUrls.length > 0) {
      try {
        const bucketName = bucket.name;
        for (const imageUrl of allImageUrls) {
          // Extract file path from Storage URL if it's a Storage URL
          if (imageUrl.includes(bucketName) || imageUrl.includes('firebasestorage')) {
            try {
              // Try to extract path and delete
              const urlObj = new URL(imageUrl);
              const pathMatch = urlObj.pathname.match(/\/o\/(.+)\?/);
              if (pathMatch) {
                const filePath = decodeURIComponent(pathMatch[1]);
                const file = bucket.file(filePath);
                await file.delete().catch(() => {
                  // Ignore individual file deletion errors
                });
              }
            } catch {
              // Ignore URL parsing errors
            }
          }
        }
      } catch (urlError) {
        console.warn(`[markYardCarSoldInternal] Error deleting files from imageUrls (non-critical):`, urlError);
      }
    }

    console.log(`[markYardCarSoldInternal] Successfully marked car ${carId} as sold`);
  } catch (error: any) {
    console.error(`[markYardCarSoldInternal] Error marking car ${carId} as sold:`, error);
    throw error;
  }
}
