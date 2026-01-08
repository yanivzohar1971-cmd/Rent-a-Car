/**
 * Public Car Projection Sync Trigger
 * 
 * Dedicated Firestore trigger that maintains publicCars projection
 * whenever MASTER (users/{yardUid}/carSales/{carId}) changes.
 * 
 * This trigger is separate from carAlertTriggers to ensure projection
 * sync happens independently of alert logic.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { upsertPublicCarFromMaster, unpublishPublicCar, isMasterCarPublished } from "./publicCarProjection";

const db = admin.firestore();

/**
 * Firestore trigger: Maintain publicCars projection when MASTER changes
 * 
 * Path: users/{yardUid}/carSales/{carId}
 * 
 * This trigger ensures publicCars/{carId} is always in sync with MASTER:
 * - If MASTER is deleted => delete publicCars/{carId}
 * - If MASTER is SOLD => delete publicCars/{carId}
 * - If MASTER is published AND not SOLD => upsert publicCars/{carId}
 * - If MASTER is not published => delete publicCars/{carId}
 */
export const onCarSaleChangePublicProjection = functions.firestore
  .document("users/{yardUid}/carSales/{carId}")
  .onWrite(async (change, context) => {
    const carId = context.params.carId;
    const yardUid = context.params.yardUid;
    const carData = change.after.exists ? change.after.data() : null;

    try {
      // Case 1: Car deleted
      if (!change.after.exists) {
        console.log(`[publicCarSyncTrigger] Car ${carId} deleted, removing from publicCars`);
        await unpublishPublicCar(carId);
        return;
      }

      if (!carData) {
        console.warn(`[publicCarSyncTrigger] Car ${carId} exists but has no data`);
        return;
      }

      // Case 2: Check if car is sold - sold cars should never be in publicCars
      const saleStatus = String(carData.saleStatus || '').toUpperCase();
      if (saleStatus === 'SOLD') {
        console.log(`[publicCarSyncTrigger] Car ${carId} is SOLD, removing from publicCars`);
        await unpublishPublicCar(carId);
        return;
      }

      // Case 3: Determine if car is published (support both new and legacy formats)
      if (isMasterCarPublished(carData)) {
        // Car is published and not sold: upsert to publicCars
        console.log(`[publicCarSyncTrigger] Car ${carId} is published, syncing to publicCars`);
        await upsertPublicCarFromMaster(yardUid, carId);
      } else {
        // Car is not published: remove from publicCars
        console.log(`[publicCarSyncTrigger] Car ${carId} is not published, removing from publicCars`);
        await unpublishPublicCar(carId);
      }
    } catch (error) {
      // Log but don't fail - projection errors shouldn't break car creation/update
      console.error(`[publicCarSyncTrigger] Error maintaining publicCars projection for car ${carId}:`, error);
      // Don't throw - we want the car operation to succeed even if projection fails
    }
  });

/**
 * Firestore trigger: Update publicCars seller snapshot when yard profile changes
 * 
 * Path: users/{yardUid}
 * 
 * When a yard's profile is updated (displayName, phone, logoUrl, etc.),
 * this trigger updates all published cars from that yard in publicCars
 * to refresh the seller snapshot.
 */
export const onYardProfileChangeUpdatePublicCars = functions.firestore
  .document("users/{yardUid}")
  .onUpdate(async (change, context) => {
    const yardUid = context.params.yardUid;
    
    // Check if relevant profile fields changed
    const before = change.before.data();
    const after = change.after.data();
    
    const relevantFields = [
      'displayName',
      'fullName',
      'phone',
      'secondaryPhone',
      'yardLogoUrl',
      'city',
      'address',
    ];
    
    const hasRelevantChange = relevantFields.some(field => {
      const beforeValue = before?.[field];
      const afterValue = after?.[field];
      return beforeValue !== afterValue;
    });
    
    if (!hasRelevantChange) {
      // No relevant changes, skip update
      return;
    }
    
    console.log(`[onYardProfileChangeUpdatePublicCars] Yard profile changed for ${yardUid}, updating publicCars seller snapshots`);
    
    try {
      // Find all published cars from this yard
      const publicCarsQuery = db
        .collection("publicCars")
        .where("yardUid", "==", yardUid)
        .where("isPublished", "==", true);
      
      const snapshot = await publicCarsQuery.get();
      
      if (snapshot.empty) {
        console.log(`[onYardProfileChangeUpdatePublicCars] No published cars found for yard ${yardUid}`);
        return;
      }
      
      // Update each car's projection (this will refresh seller snapshot)
      // Use batched writes to avoid unbounded fan-out loops
      const batchSize = 10; // Process in batches to prevent quota explosions
      const totalCars = snapshot.size;
      let updated = 0;
      let errors = 0;
      
      // Process in batches
      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = snapshot.docs.slice(i, i + batchSize);
        const batchPromises = batch.map(async (docSnap) => {
          const carId = docSnap.id;
          try {
            // Re-run projection to update seller snapshot
            await upsertPublicCarFromMaster(yardUid, carId);
            updated++;
          } catch (error) {
            errors++;
            console.error(`[onYardProfileChangeUpdatePublicCars] Error updating car ${carId}:`, error);
            // Continue with other cars
          }
        });
        
        // Wait for batch to complete before proceeding
        await Promise.all(batchPromises);
      }
      
      console.log(`[onYardProfileChangeUpdatePublicCars] Updated ${updated}/${totalCars} cars for yard ${yardUid}${errors > 0 ? ` (${errors} errors)` : ''}`);
    } catch (error) {
      // Log but don't fail - profile update should succeed even if publicCars update fails
      console.error(`[onYardProfileChangeUpdatePublicCars] Error updating publicCars for yard ${yardUid}:`, error);
    }
  });

/**
 * Firestore trigger: Update publicCars seller exposure when admin exposure flags change
 * 
 * Path: adminSellerExposure/{sellerUid}
 * 
 * When admin changes seller exposure flags (showNameInBadge, showLogo, showPhone, etc.),
 * this trigger updates all published cars from that seller in publicCars
 * to refresh the seller exposure fields.
 */
export const onAdminSellerExposureChangeUpdatePublicCars = functions.firestore
  .document("adminSellerExposure/{sellerUid}")
  .onWrite(async (change, context) => {
    const sellerUid = context.params.sellerUid;
    
    console.log(`[onAdminSellerExposureChangeUpdatePublicCars] Admin exposure changed for seller ${sellerUid}, updating publicCars`);
    
    try {
      // Find all published cars from this seller
      // Note: publicCars uses yardUid field for both yards and agents
      // (agents may have their UID in yardUid field)
      const publicCarsQuery = db
        .collection("publicCars")
        .where("yardUid", "==", sellerUid)
        .where("isPublished", "==", true);
      
      const snapshot = await publicCarsQuery.get();
      
      // Get all car IDs
      const allCarIds = new Set<string>();
      snapshot.docs.forEach(doc => allCarIds.add(doc.id));
      
      if (allCarIds.size === 0) {
        console.log(`[onAdminSellerExposureChangeUpdatePublicCars] No published cars found for seller ${sellerUid}`);
        return;
      }
      
      // Get master car data to determine yardUid for each car
      // We need yardUid to call upsertPublicCarFromMaster
      const batchSize = 100; // Safe batch size
      let updated = 0;
      let errors = 0;
      
      // Process in batches
      const carIdsArray = Array.from(allCarIds);
      for (let i = 0; i < carIdsArray.length; i += batchSize) {
        const batch = carIdsArray.slice(i, i + batchSize);
        const batchPromises = batch.map(async (carId) => {
          try {
            // Read publicCar to get yardUid
            const publicCarDoc = await db.collection("publicCars").doc(carId).get();
            if (!publicCarDoc.exists) {
              return; // Car no longer exists
            }
            
            const publicCarData = publicCarDoc.data();
            const yardUid = publicCarData?.yardUid || sellerUid; // Fallback to sellerUid if missing
            
            // Re-run projection to update seller exposure fields
            await upsertPublicCarFromMaster(yardUid, carId);
            updated++;
          } catch (error) {
            errors++;
            console.error(`[onAdminSellerExposureChangeUpdatePublicCars] Error updating car ${carId}:`, error);
            // Continue with other cars
          }
        });
        
        // Wait for batch to complete before proceeding
        await Promise.all(batchPromises);
        
        // Log progress for large batches
        if (i + batchSize < carIdsArray.length) {
          console.log(`[onAdminSellerExposureChangeUpdatePublicCars] Progress: ${updated} updated, ${errors} errors...`);
        }
      }
      
      console.log(`[onAdminSellerExposureChangeUpdatePublicCars] Updated ${updated}/${allCarIds.size} cars for seller ${sellerUid}${errors > 0 ? ` (${errors} errors)` : ''}`);
    } catch (error) {
      // Log but don't fail - exposure update should succeed even if publicCars update fails
      console.error(`[onAdminSellerExposureChangeUpdatePublicCars] Error updating publicCars for seller ${sellerUid}:`, error);
    }
  });