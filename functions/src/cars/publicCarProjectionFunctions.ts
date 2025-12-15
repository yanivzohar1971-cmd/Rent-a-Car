/**
 * Public Car Projection Callable Functions
 * 
 * Provides callable functions for manual projection repair/backfill
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { upsertPublicCarFromMaster, unpublishPublicCar } from "./publicCarProjection";

const db = admin.firestore();

/**
 * Helper to check if user is admin.
 * Checks custom claim admin=true OR existence in config/admins collection.
 */
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    // Check custom claim first (preferred)
    const user = await admin.auth().getUser(callerUid);
    if (user.customClaims?.admin === true) {
      return true;
    }
    
    // Fallback to config/admins collection
    const adminDoc = await db.collection("config").doc("admins").get();
    if (!adminDoc.exists) {
      return false;
    }
    const data = adminDoc.data();
    const uids = (data?.uids as string[]) || [];
    return uids.includes(callerUid);
  } catch (error) {
    console.error(`[isAdmin] Error checking admin status for ${callerUid}:`, error);
    return false;
  }
}

/**
 * Rebuild publicCars projection for a yard
 * 
 * This callable function allows manual repair/backfill of the publicCars projection.
 * It reads all cars from users/{yardUid}/carSales and ensures publicCars/{carId}
 * is in sync for each car.
 * 
 * Auth required: caller must be authenticated
 * - If caller is admin: optional yardId parameter (defaults to caller's UID if not provided)
 * - If caller is not admin: yardUid must match caller's UID (yard owner only)
 */
export const rebuildPublicCarsForYard = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  
  // Determine target yardUid
  let yardUid: string;
  if (callerIsAdmin) {
    // Admin can specify optional yardId, or use their own UID
    yardUid = (data?.yardId as string) || callerUid;
  } else {
    // Non-admin can only rebuild their own yard
    yardUid = callerUid;
  }
  
  console.log(`[rebuildPublicCarsForYard] Starting rebuild for yard ${yardUid}`);

  try {
    // Read all cars from users/{yardUid}/carSales
    const carSalesRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales");
    
    const snapshot = await carSalesRef.get();
    
    if (snapshot.empty) {
      console.log(`[rebuildPublicCarsForYard] No cars found for yard ${yardUid}`);
      return {
        success: true,
        processed: 0,
        upserted: 0,
        unpublished: 0,
        errors: 0,
        message: "No cars found for this yard",
      };
    }

    let processed = 0;
    let upserted = 0;
    let unpublished = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process each car
    for (const docSnap of snapshot.docs) {
      const carId = docSnap.id;
      const carData = docSnap.data();
      
      try {
        processed++;
        
        // Check if car is sold - sold cars should never be in publicCars
        const saleStatus = String(carData.saleStatus || '').toUpperCase();
        if (saleStatus === 'SOLD') {
          // Car is sold: ensure it's removed from publicCars
          try {
            await unpublishPublicCar(carId);
            unpublished++;
            console.log(`[rebuildPublicCarsForYard] Removed SOLD car ${carId} from publicCars`);
          } catch (unpubError: any) {
            // If unpublish fails with NOT_FOUND, that's fine (already unpublished)
            if (unpubError?.code !== 5) {
              throw unpubError;
            }
            unpublished++;
          }
          continue; // Skip to next car
        }
        
        // Determine if car is published (support both new and legacy formats)
        const statusLower = String(carData.status || '').toLowerCase();
        const pubUpper = String(carData.publicationStatus || '').toUpperCase();
        const isPublished = statusLower === 'published' || pubUpper === 'PUBLISHED';
        
        if (isPublished) {
          // Car is published and not sold: upsert to publicCars
          await upsertPublicCarFromMaster(yardUid, carId);
          upserted++;
          console.log(`[rebuildPublicCarsForYard] Upserted car ${carId}`);
        } else {
          // Car is not published: ensure it's removed from publicCars
          try {
            await unpublishPublicCar(carId);
            unpublished++;
            console.log(`[rebuildPublicCarsForYard] Unpublished car ${carId}`);
          } catch (unpubError: any) {
            // If unpublish fails with NOT_FOUND, that's fine (already unpublished)
            if (unpubError?.code !== 5) {
              throw unpubError;
            }
            unpublished++;
          }
        }
      } catch (error: any) {
        errors++;
        const errorMsg = `Car ${carId}: ${error instanceof Error ? error.message : String(error)}`;
        errorDetails.push(errorMsg);
        console.error(`[rebuildPublicCarsForYard] Error processing car ${carId}:`, error);
        // Continue with other cars even if one fails
      }
    }

    const result = {
      success: true,
      processed,
      upserted,
      unpublished,
      errors,
      message: `Processed ${processed} cars: ${upserted} upserted, ${unpublished} unpublished${errors > 0 ? `, ${errors} errors` : ''}`,
    };

    if (errors > 0) {
      result.message += `. Errors: ${errorDetails.join('; ')}`;
    }

    console.log(`[rebuildPublicCarsForYard] Completed rebuild for yard ${yardUid} (called by ${callerUid}, admin: ${callerIsAdmin}):`, result);
    return result;
  } catch (error: any) {
    console.error(`[rebuildPublicCarsForYard] Error rebuilding publicCars for yard ${yardUid}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to rebuild publicCars projection",
      error instanceof Error ? error.message : String(error)
    );
  }
});
