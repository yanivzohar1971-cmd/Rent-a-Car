/**
 * Mark Yard Car as Sold - Callable Function
 * 
 * This function marks a car as sold and performs cleanup:
 * - Updates MASTER doc with saleStatus = "SOLD"
 * - Removes from publicCars projection
 * - Deletes all Storage images permanently
 * - Clears image metadata fields
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { unpublishPublicCar } from "./publicCarProjection";

const db = admin.firestore();
const storage = admin.storage();

/**
 * Mark a yard car as sold
 * 
 * Auth required: caller must be authenticated and own the car
 */
export const markYardCarSold = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const yardUid = context.auth.uid;
  const { carId } = data;

  // Validate input
  if (!carId || typeof carId !== 'string') {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "carId is required and must be a string"
    );
  }

  console.log(`[markYardCarSold] Marking car ${carId} as sold for yard ${yardUid}`);

  try {
    // Step 1: Read MASTER doc and validate ownership
    const carRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales")
      .doc(carId);
    
    const carDoc = await carRef.get();
    
    if (!carDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `Car ${carId} not found`
      );
    }

    const carData = carDoc.data();
    if (!carData) {
      throw new functions.https.HttpsError(
        "not-found",
        `Car ${carId} data is empty`
      );
    }

    // Validate ownership
    if (carData.yardUid !== yardUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not own this car"
      );
    }

    // Check if already sold
    if (carData.saleStatus === 'SOLD') {
      console.log(`[markYardCarSold] Car ${carId} is already marked as SOLD`);
      return { success: true, message: "Car is already marked as sold" };
    }

    // Step 2: Collect image URLs before clearing (for Storage deletion)
    const imageUrls = Array.isArray(carData.imageUrls) ? carData.imageUrls : [];
    const mainImageUrl = carData.mainImageUrl || null;
    const allImageUrls = [...imageUrls];
    if (mainImageUrl && !allImageUrls.includes(mainImageUrl)) {
      allImageUrls.push(mainImageUrl);
    }

    // Step 3: Calculate profitability snapshots (only if not already set)
    const salePrice = carData.soldPrice || carData.salePrice || carData.price || 0;
    const costPrice = typeof carData.costPrice === 'number' ? carData.costPrice : null;
    
    // Calculate profitSnapshot if costPrice is present and snapshot not already set
    let profitSnapshot = carData.profitSnapshot;
    if (profitSnapshot === undefined && costPrice !== null && typeof costPrice === 'number') {
      profitSnapshot = salePrice - costPrice;
    }
    
    // Calculate commissionSnapshot if commission config exists and snapshot not already set
    let commissionSnapshot = carData.commissionSnapshot;
    if (commissionSnapshot === undefined) {
      const commissionType = carData.commissionType;
      const commissionValue = typeof carData.commissionValue === 'number' ? carData.commissionValue : null;
      
      if (commissionType && commissionValue !== null) {
        if (commissionType === 'FIXED') {
          commissionSnapshot = commissionValue;
        } else if (commissionType === 'PERCENT_OF_SALE') {
          commissionSnapshot = salePrice * (commissionValue / 100);
        } else if (commissionType === 'PERCENT_OF_PROFIT') {
          const profit = profitSnapshot !== undefined && profitSnapshot !== null ? profitSnapshot : (costPrice !== null ? salePrice - costPrice : 0);
          commissionSnapshot = Math.max(profit, 0) * (commissionValue / 100);
        }
      }
    }
    
    // Calculate netProfitSnapshot if both profit and commission are available
    let netProfitSnapshot = carData.netProfitSnapshot;
    if (netProfitSnapshot === undefined && 
        profitSnapshot !== undefined && profitSnapshot !== null &&
        commissionSnapshot !== undefined && commissionSnapshot !== null) {
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
    
    // Set snapshots only if they were calculated (preserve existing snapshots)
    if (profitSnapshot !== undefined) {
      updateData.profitSnapshot = profitSnapshot;
    }
    if (commissionSnapshot !== undefined) {
      updateData.commissionSnapshot = commissionSnapshot;
    }
    if (netProfitSnapshot !== undefined) {
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
    console.log(`[markYardCarSold] Updated MASTER doc for car ${carId}${profitSnapshot !== undefined ? ` (profitSnapshot: ${profitSnapshot})` : ''}${commissionSnapshot !== undefined ? ` (commissionSnapshot: ${commissionSnapshot})` : ''}`);

    // Step 5: Delete PUBLIC projection
    try {
      await unpublishPublicCar(carId);
      console.log(`[markYardCarSold] Deleted publicCars projection for car ${carId}`);
    } catch (unpubError: any) {
      // Non-critical: log but continue
      console.warn(`[markYardCarSold] Error deleting publicCars (non-critical):`, unpubError);
    }

    // Step 6: Delete ALL Storage files for this car
    // Storage path pattern: users/{uid}/cars/{carId}/images/{imageId}.jpg
    // Must be precise to avoid deleting other cars' files
    const storagePrefix = `users/${yardUid}/cars/${carId}/images/`;
    const bucket = storage.bucket();
    
    try {
      const [files] = await bucket.getFiles({ prefix: storagePrefix });
      console.log(`[markYardCarSold] Found ${files.length} files to delete in Storage for car ${carId}`);
      
      if (files.length > 0) {
        // Delete all files
        await Promise.all(files.map(file => file.delete()));
        console.log(`[markYardCarSold] Deleted ${files.length} Storage files for car ${carId}`);
      }
    } catch (storageError: any) {
      // Log but don't fail - Storage deletion is best-effort
      console.error(`[markYardCarSold] Error deleting Storage files (non-critical):`, storageError);
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
        console.warn(`[markYardCarSold] Error deleting files from imageUrls (non-critical):`, urlError);
      }
    }

    console.log(`[markYardCarSold] Successfully marked car ${carId} as sold`);
    return {
      success: true,
      message: "Car marked as sold and images deleted",
      deletedFilesCount: allImageUrls.length,
    };
  } catch (error: any) {
    console.error(`[markYardCarSold] Error marking car ${carId} as sold:`, error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to mark car as sold",
      error instanceof Error ? error.message : String(error)
    );
  }
});
