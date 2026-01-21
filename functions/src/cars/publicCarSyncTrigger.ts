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
        try {
          await upsertPublicCarFromMaster(yardUid, carId);
        } catch (upsertError: any) {
          // Enhanced error logging with carId/yardUid context
          console.error(`[publicCarSyncTrigger] Error upserting publicCars/${carId} for yard ${yardUid}:`, {
            carId,
            yardUid,
            error: upsertError instanceof Error ? upsertError.message : String(upsertError),
            errorCode: upsertError?.code,
            stack: upsertError instanceof Error ? upsertError.stack : undefined,
          });
          // Don't throw - projection errors shouldn't break car creation/update
        }
      } else {
        // Car is not published: remove from publicCars
        console.log(`[publicCarSyncTrigger] Car ${carId} is not published, removing from publicCars`);
        try {
          await unpublishPublicCar(carId);
        } catch (unpublishError: any) {
          // Enhanced error logging with carId/yardUid context
          console.error(`[publicCarSyncTrigger] Error unpublishing publicCars/${carId} for yard ${yardUid}:`, {
            carId,
            yardUid,
            error: unpublishError instanceof Error ? unpublishError.message : String(unpublishError),
            errorCode: unpublishError?.code,
            stack: unpublishError instanceof Error ? unpublishError.stack : undefined,
          });
          // Don't throw - projection errors shouldn't break car creation/update
        }
      }
    } catch (error: any) {
      // Log but don't fail - projection errors shouldn't break car creation/update
      console.error(`[publicCarSyncTrigger] Error maintaining publicCars projection for car ${carId}:`, {
        carId,
        yardUid,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error?.code,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - we want the car operation to succeed even if projection fails
    }
  });

/**
 * Firestore trigger: Update publicCars seller snapshot when yard profile changes
 * 
 * Path: users/{yardUid}
 * 
 * When a yard's profile is updated (displayName, phone, logoUrl, etc.),
 * or when a yard is approved (roleStatus changes to APPROVED),
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
      'roleStatus', // Added: trigger on yard approval
      'status', // Added: trigger on status change
      'primaryRole', // Added: trigger on role assignment
      'isYard', // Added: trigger on yard flag change
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
    
    // Check if this is a yard approval event
    const wasApproved = before?.roleStatus !== 'APPROVED' && 
                       after?.roleStatus === 'APPROVED' &&
                       (after?.isYard === true || after?.primaryRole === 'YARD');
    
    if (wasApproved) {
      console.log(`[onYardProfileChangeUpdatePublicCars] Yard ${yardUid} was APPROVED, updating publicCars seller snapshots to expose seller details`);
    } else {
      console.log(`[onYardProfileChangeUpdatePublicCars] Yard profile changed for ${yardUid}, updating publicCars seller snapshots`);
    }
    
    try {
      // Find all published cars from this yard (Q1: isPublished == true)
      const publicCarsQuery1 = db
        .collection("publicCars")
        .where("yardUid", "==", yardUid)
        .where("isPublished", "==", true);
      
      const snapshot1 = await publicCarsQuery1.get();
      
      // Backward compatibility: Also find legacy docs missing isPublished field (Q2: isPublished == null)
      // These are "public-eligible" docs that need snapshot repair
      const publicCarsQuery2 = db
        .collection("publicCars")
        .where("yardUid", "==", yardUid)
        .where("isPublished", "==", null);
      
      let snapshot2;
      try {
        snapshot2 = await publicCarsQuery2.get();
      } catch (error: any) {
        // If query fails (e.g., missing index), log and continue with Q1 only
        console.warn(`[onYardProfileChangeUpdatePublicCars] Legacy query failed for yard ${yardUid}:`, error?.message || String(error));
        snapshot2 = { docs: [], empty: true, size: 0 } as any;
      }
      
      // Merge results (deduplicate by carId)
      const allCarIds = new Set<string>();
      snapshot1.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => allCarIds.add(doc.id));
      snapshot2.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => allCarIds.add(doc.id));
      
      if (allCarIds.size === 0) {
        console.log(`[onYardProfileChangeUpdatePublicCars] No published or legacy cars found for yard ${yardUid}`);
        return;
      }
      
      // Update each car's projection (this will refresh seller snapshot)
      // Use batched writes to avoid unbounded fan-out loops
      const batchSize = 10; // Process in batches to prevent quota explosions
      const totalCars = allCarIds.size;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      
      // Process in batches
      const carIdsArray = Array.from(allCarIds);
      for (let i = 0; i < carIdsArray.length; i += batchSize) {
        const batch = carIdsArray.slice(i, i + batchSize);
        const batchPromises = batch.map(async (carId) => {
          try {
            // Check if this is a legacy doc (from Q2)
            const isLegacy = snapshot2.docs.some((doc: admin.firestore.QueryDocumentSnapshot) => doc.id === carId);
            
            if (isLegacy) {
              // For legacy docs, check if they're truly public-eligible
              const legacyDoc = snapshot2.docs.find((doc: admin.firestore.QueryDocumentSnapshot) => doc.id === carId);
              if (legacyDoc) {
                const data = legacyDoc.data();
                // Skip if doc has publicationStatus/status signals indicating hidden/archived
                const publicationStatus = String(data?.publicationStatus || '').toUpperCase();
                const status = String(data?.status || '').toLowerCase();
                if (publicationStatus === 'HIDDEN' || publicationStatus === 'ARCHIVED' || 
                    status === 'hidden' || status === 'archived' || status === 'draft') {
                  skipped++;
                  return;
                }
                
                // Re-run projection to get snapshot fields (merge: true)
                await upsertPublicCarFromMaster(yardUid, carId);
                updated++;
              }
            } else {
              // Regular published car - full projection update
              await upsertPublicCarFromMaster(yardUid, carId);
              updated++;
            }
          } catch (error) {
            errors++;
            console.error(`[onYardProfileChangeUpdatePublicCars] Error updating car ${carId}:`, error);
            // Continue with other cars
          }
        });
        
        // Wait for batch to complete before proceeding
        await Promise.all(batchPromises);
      }
      
      console.log(`[onYardProfileChangeUpdatePublicCars] Updated ${updated}/${totalCars} cars for yard ${yardUid} (${skipped} skipped, ${errors} errors)`);
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