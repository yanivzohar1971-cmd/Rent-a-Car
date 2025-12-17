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
import { upsertPublicCarFromMaster, unpublishPublicCar, isMasterCarPublished } from "./publicCarProjection";

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
