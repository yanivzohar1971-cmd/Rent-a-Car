/**
 * Public Car Snapshots Sync
 * 
 * Ensures that publicCars/{carId} always has yard/seller snapshots
 * populated from users/{yardUid} for public display.
 * 
 * This allows guest/incognito users to see phone/logo without
 * needing read access to users/{uid} collection.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { resolveYardProfile } from "./publicCarProjection";

const db = admin.firestore();

// Import isAdmin helper (reuse from index.ts pattern)
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    const adminDoc = await db.collection("config").doc("admins").get();
    if (!adminDoc.exists) {
      return false;
    }
    const data = adminDoc.data();
    const uids = (data?.uids as string[]) || [];
    return uids.includes(callerUid);
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Build yard snapshot from resolved profile
 * Returns snapshot object and missing fields list
 */
function buildYardSnapshotFromProfile(profile: {
  source: string;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  missingFields: string[];
}): {
  yardSnapshot: {
    yardName: string | null;
    yardPhone: string | null;
    yardWhatsapp: string | null;
    yardLogoUrl: string | null;
    yardAddress: string | null;
    yardCity: string | null;
  };
  sellerSnapshot: {
    sellerName: string | null;
    sellerPhone: string | null;
    sellerWhatsapp: string | null;
    sellerLogoUrl: string | null;
    sellerAddress: string | null;
    sellerCity: string | null;
  };
  missingFields: string[];
} {
  const yardSnapshot = {
    yardName: profile.name,
    yardPhone: profile.phone,
    yardWhatsapp: profile.whatsapp,
    yardLogoUrl: profile.logoUrl,
    yardAddress: profile.address,
    yardCity: profile.city,
  };

  // For YARD type, sellerSnapshot mirrors yardSnapshot
  const sellerSnapshot = {
    sellerName: profile.name,
    sellerPhone: profile.phone,
    sellerWhatsapp: profile.whatsapp,
    sellerLogoUrl: profile.logoUrl,
    sellerAddress: profile.address,
    sellerCity: profile.city,
  };

  return {
    yardSnapshot,
    sellerSnapshot,
    missingFields: profile.missingFields,
  };
}

/**
 * Sync snapshots for a public car document
 * Returns true if snapshots were updated, false if skipped
 */
async function syncPublicCarSnapshots(carId: string, publicCarData: any): Promise<boolean> {
  // Only process YARD type cars
  const sellerType = publicCarData?.sellerType || publicCarData?.ownerType;
  if (sellerType !== 'YARD' && sellerType !== 'yard') {
    return false;
  }

  // Resolve yardUid
  const yardUid = publicCarData?.yardUid || publicCarData?.ownerUid;
  if (!yardUid || typeof yardUid !== 'string') {
    console.warn(`[syncPublicCarSnapshots] Car ${carId} has no yardUid, skipping snapshot sync`);
    return false;
  }

  // Check if snapshot already exists and is recent (avoid unnecessary updates)
  const existingSnapshot = publicCarData?.yardSnapshot;
  const snapshotUpdatedAt = publicCarData?.snapshotUpdatedAt;
  const hasYardSnapshot = publicCarData?.hasYardSnapshot === true;
  
  // If snapshot exists and has key fields, skip unless forced
  if (hasYardSnapshot && existingSnapshot && 
      (existingSnapshot.yardPhone || existingSnapshot.yardLogoUrl)) {
    // Check if snapshot is stale (older than 1 hour) - optional optimization
    if (snapshotUpdatedAt) {
      const updatedAt = snapshotUpdatedAt.toMillis ? snapshotUpdatedAt.toMillis() : 
                       (snapshotUpdatedAt.seconds ? snapshotUpdatedAt.seconds * 1000 : 0);
      const ageMs = Date.now() - updatedAt;
      if (ageMs < 3600000) { // 1 hour
        // Snapshot is fresh, skip
        return false;
      }
    } else {
      // Snapshot exists but no timestamp - assume it's valid
      return false;
    }
  }

  // Resolve yard profile
  const profile = await resolveYardProfile(yardUid);
  if (profile.source === 'none') {
    console.warn(`[syncPublicCarSnapshots] Could not resolve yard profile for ${yardUid}, car ${carId}`);
    // Still update with empty snapshot to mark as attempted
    const update: any = {
      hasYardSnapshot: false,
      hasSellerSnapshot: false,
      yardSnapshotSource: 'none',
      yardSnapshotMissing: ['name', 'phone', 'whatsapp', 'logoUrl', 'address', 'city'],
      snapshotUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      snapshotVersion: 1,
    };
    await db.collection('publicCars').doc(carId).set(update, { merge: true });
    return true;
  }

  // Build snapshots
  const { yardSnapshot, sellerSnapshot, missingFields } = buildYardSnapshotFromProfile(profile);

  // Determine if we have a valid snapshot (at least one key field)
  const hasValidSnapshot = !!(yardSnapshot.yardPhone || yardSnapshot.yardLogoUrl || yardSnapshot.yardName);

  // Update publicCars document
  const update: any = {
    hasYardSnapshot: hasValidSnapshot,
    hasSellerSnapshot: hasValidSnapshot,
    yardSnapshot: yardSnapshot,
    sellerSnapshot: sellerSnapshot,
    yardSnapshotSource: profile.source,
    snapshotUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    snapshotVersion: 1,
  };

  // Also update flat fields for backward compatibility
  if (yardSnapshot.yardName) {
    update.yardName = yardSnapshot.yardName;
    update.yardDisplayName = yardSnapshot.yardName;
    update.sellerDisplayName = yardSnapshot.yardName;
  }
  if (yardSnapshot.yardPhone) {
    update.yardPhone = yardSnapshot.yardPhone;
    update.sellerPhone = yardSnapshot.yardPhone;
  }
  if (yardSnapshot.yardWhatsapp) {
    update.yardWhatsappPhone = yardSnapshot.yardWhatsapp;
    update.sellerWhatsappPhone = yardSnapshot.yardWhatsapp;
  }
  if (yardSnapshot.yardLogoUrl) {
    update.yardLogoUrl = yardSnapshot.yardLogoUrl;
    update.sellerLogoUrl = yardSnapshot.yardLogoUrl;
  }
  if (yardSnapshot.yardAddress) {
    update.sellerAddress = yardSnapshot.yardAddress;
  }
  if (yardSnapshot.yardCity) {
    update.sellerCity = yardSnapshot.yardCity;
  }

  // Add missing fields list if any
  if (missingFields.length > 0) {
    update.yardSnapshotMissing = missingFields;
  }

  await db.collection('publicCars').doc(carId).set(update, { merge: true });
  
  console.log(`[syncPublicCarSnapshots] Updated snapshots for car ${carId} from ${profile.source}, missing: ${missingFields.join(', ')}`);
  return true;
}

/**
 * Firestore trigger: Sync snapshots when publicCars document is created/updated
 */
export const onPublicCarWriteSyncSnapshots = functions.firestore
  .document("publicCars/{carId}")
  .onWrite(async (change, context) => {
    const carId = context.params.carId;
    
    // Only process if document exists (after write)
    if (!change.after.exists) {
      return; // Document deleted, nothing to sync
    }

    const publicCarData = change.after.data();
    if (!publicCarData) {
      return;
    }

    try {
      await syncPublicCarSnapshots(carId, publicCarData);
    } catch (error: any) {
      console.error(`[onPublicCarWriteSyncSnapshots] Error syncing snapshots for car ${carId}:`, {
        carId,
        error: error instanceof Error ? error.message : String(error),
        errorCode: error?.code,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - snapshot sync errors shouldn't break car creation/update
    }
  });

/**
 * Admin-only callable: Backfill missing snapshots for existing publicCars
 * 
 * Inputs:
 * - carId (optional): if provided, only process that car
 * - limit (optional, default 200): max number of cars to process
 * - dryRun (optional, default false): if true, don't write changes
 * 
 * Returns:
 * - scanned: number of cars checked
 * - updated: number of cars updated
 * - skipped: number of cars skipped (already have snapshots)
 * - errors: number of errors
 */
export const backfillPublicCarSnapshots = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can backfill snapshots"
    );
  }

  const carId = data?.carId;
  const limit = data?.limit || 200;
  const dryRun = data?.dryRun === true;

  const correlationId = `backfill-snapshots-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[backfillPublicCarSnapshots] Starting backfill (carId: ${carId || 'all'}, limit: ${limit}, dryRun: ${dryRun}, correlationId: ${correlationId})`);

  try {
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    if (carId) {
      // Single car mode
      const carDoc = await db.collection('publicCars').doc(carId).get();
      if (!carDoc.exists) {
        return {
          ok: false,
          reason: 'car not found',
          carId,
          correlationId,
        };
      }

      scanned = 1;
      const carData = carDoc.data();
      if (!carData) {
        return {
          ok: false,
          reason: 'car has no data',
          carId,
          correlationId,
        };
      }

      try {
        if (!dryRun) {
          const wasUpdated = await syncPublicCarSnapshots(carId, carData);
          if (wasUpdated) {
            updated = 1;
          } else {
            skipped = 1;
          }
        } else {
          // Dry run: check if snapshot is missing
          const hasYardSnapshot = carData?.hasYardSnapshot === true;
          const yardSnapshot = carData?.yardSnapshot;
          const hasPhone = yardSnapshot?.yardPhone || carData?.yardPhone;
          const hasLogo = yardSnapshot?.yardLogoUrl || carData?.yardLogoUrl;
          if (hasYardSnapshot && hasPhone && hasLogo) {
            skipped = 1;
          } else {
            updated = 1; // Would update
          }
        }
      } catch (error: any) {
        errors = 1;
        console.error(`[backfillPublicCarSnapshots] Error processing car ${carId}:`, error);
      }
    } else {
      // Batch mode: query cars with missing snapshots
      let query = db.collection('publicCars')
        .where('sellerType', '==', 'YARD')
        .limit(limit);

      const snapshot = await query.get();
      scanned = snapshot.size;

      for (const docSnap of snapshot.docs) {
        const carId = docSnap.id;
        const carData = docSnap.data();

        try {
          // Check if snapshot is missing
          const hasYardSnapshot = carData?.hasYardSnapshot === true;
          const yardSnapshot = carData?.yardSnapshot;
          const hasPhone = yardSnapshot?.yardPhone || carData?.yardPhone;
          const hasLogo = yardSnapshot?.yardLogoUrl || carData?.yardLogoUrl;

          if (hasYardSnapshot && hasPhone && hasLogo) {
            skipped++;
            continue;
          }

          // Sync snapshot
          if (!dryRun) {
            await syncPublicCarSnapshots(carId, carData);
            updated++;
          } else {
            // Dry run: just count
            updated++;
          }
        } catch (error: any) {
          errors++;
          console.error(`[backfillPublicCarSnapshots] Error processing car ${carId}:`, error);
        }
      }
    }

    console.log(`[backfillPublicCarSnapshots] Backfill complete (correlationId: ${correlationId}): scanned=${scanned}, updated=${updated}, skipped=${skipped}, errors=${errors}`);

    return {
      ok: true,
      scanned,
      updated,
      skipped,
      errors,
      dryRun,
      correlationId,
    };
  } catch (error: any) {
    console.error(`[backfillPublicCarSnapshots] Error in backfill:`, error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to backfill snapshots: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.message : String(error)
    );
  }
});
