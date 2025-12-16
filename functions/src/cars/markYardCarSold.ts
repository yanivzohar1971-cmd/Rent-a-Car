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
import { markYardCarSoldInternal } from "./markYardCarSoldInternal";

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
    // Use shared internal helper
    await markYardCarSoldInternal(yardUid, carId);
    
    return {
      success: true,
      message: "Car marked as sold and images deleted",
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
