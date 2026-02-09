/**
 * Public Car Projection Callable Functions
 * 
 * Provides callable functions for manual projection repair/backfill
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { 
  upsertPublicCarFromMaster, 
  unpublishPublicCar,
  loadPublicSellerProfile,
  loadAdminSellerExposure,
  isMasterCarPublished
} from "./publicCarProjection";
import { getYardCarMaster } from "./masterCarService";

const db = admin.firestore();

/**
 * Diagnostic function to check publicCars projection for a specific yard
 * 
 * Returns:
 * - Count of cars in MASTER (users/{yardUid}/carSales)
 * - Count of published cars in MASTER
 * - Count of cars in publicCars for this yard
 * - Count of published cars in publicCars (isPublished==true)
 * - Sample car IDs from each collection
 * 
 * Auth: Admin only OR yard owner (yardUid must match caller's UID)
 */
export const diagnoseYardPublicCars = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const yardUid = data?.yardUid || callerUid;

  // Check if caller is admin or yard owner
  const callerIsAdmin = await isAdmin(callerUid);
  if (!callerIsAdmin && yardUid !== callerUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can diagnose other yards"
    );
  }

  try {
    // Get projectId from admin app
    const projectId = admin.app().options.projectId || null;

    // Step 1: Count cars in MASTER
    const masterCarsRef = db.collection("users").doc(yardUid).collection("carSales");
    const masterCarsSnapshot = await masterCarsRef.limit(1000).get();
    const masterCars = masterCarsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
    }));

    // Count published cars in MASTER
    let publishedInMaster = 0;
    const publishedCarIds: string[] = [];
    masterCars.forEach(car => {
      const status = String(car.data?.status || '').toLowerCase();
      const pubStatus = String(car.data?.publicationStatus || '').toUpperCase();
      const isPublished = status === 'published' || pubStatus === 'PUBLISHED';
      const isSold = String(car.data?.saleStatus || '').toUpperCase() === 'SOLD';
      
      if (isPublished && !isSold) {
        publishedInMaster++;
        publishedCarIds.push(car.id);
      }
    });

    // Step 2: Query publicCars for this yardUid
    const publicCarsQuery = db.collection("publicCars")
      .where("yardUid", "==", yardUid);
    const publicCarsSnapshot = await publicCarsQuery.limit(1000).get();
    const publicCars = publicCarsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
    }));

    // Step 3: Compute publicCars statistics
    let isPublishedTrue = 0;
    const statusBreakdown: Record<string, number> = {};
    const sampleDocs: Array<{
      docId: string;
      isPublished: boolean | null;
      status: string | null;
      publicationStatus: string | null;
      yardUid: string | null;
      carId: string | null;
      brand: string | null;
      model: string | null;
      year: number | null;
      price: number | null;
    }> = [];

    publicCars.forEach(car => {
      // Count isPublished==true
      if (car.data?.isPublished === true) {
        isPublishedTrue++;
      }

      // Status breakdown
      const status = car.data?.status || 'unknown';
      statusBreakdown[String(status)] = (statusBreakdown[String(status)] || 0) + 1;

      // Collect sample docs (up to 5)
      if (sampleDocs.length < 5) {
        sampleDocs.push({
          docId: car.id,
          isPublished: car.data?.isPublished ?? null,
          status: car.data?.status ?? null,
          publicationStatus: car.data?.publicationStatus ?? null,
          yardUid: car.data?.yardUid ?? null,
          carId: car.data?.carId ?? null,
          brand: car.data?.brand ?? null,
          model: car.data?.model ?? null,
          year: typeof car.data?.year === 'number' ? car.data.year : null,
          price: typeof car.data?.price === 'number' ? car.data.price : null,
        });
      }
    });

    // Step 4: Compute missing projections (published in MASTER but not in publicCars)
    const publicCarIdsSet = new Set(publicCars.map(pc => pc.id));
    const missingProjections = publishedCarIds
      .filter(id => !publicCarIdsSet.has(id))
      .slice(0, 20); // Cap at 20

    // Step 5: Find stale projections (in publicCars but not published in MASTER)
    const staleProjections = publicCars
      .filter(pc => {
        const masterCar = masterCars.find(mc => mc.id === pc.id);
        if (!masterCar) return true; // Car deleted from MASTER
        
        const status = String(masterCar.data?.status || '').toLowerCase();
        const pubStatus = String(masterCar.data?.publicationStatus || '').toUpperCase();
        const isPublished = status === 'published' || pubStatus === 'PUBLISHED';
        const isSold = String(masterCar.data?.saleStatus || '').toUpperCase() === 'SOLD';
        
        return !isPublished || isSold;
      })
      .map(pc => pc.id)
      .slice(0, 20); // Cap at 20

    return {
      success: true,
      projectId,
      yardUid,
      master: {
        total: masterCars.length,
        published: publishedInMaster,
        publishedCarIds: publishedCarIds.slice(0, 10), // Sample
      },
      publicCars: {
        total: publicCars.length,
        isPublishedTrue,
        statusBreakdown,
        sampleDocs,
      },
      issues: {
        missingProjections,
        staleProjections,
        missingCount: missingProjections.length,
        staleCount: staleProjections.length,
      },
      diagnosis: [
        `MASTER: ${masterCars.length} total, ${publishedInMaster} published`,
        `publicCars: ${publicCars.length} total, ${isPublishedTrue} with isPublished==true`,
        missingProjections.length > 0 
          ? `⚠️ ${missingProjections.length} published cars missing from publicCars`
          : '✅ All published cars have publicCars projections',
        staleProjections.length > 0
          ? `⚠️ ${staleProjections.length} stale projections in publicCars (should be unpublished)`
          : '✅ No stale projections found',
      ],
    };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to diagnose yard publicCars"
    );
  }
});

/**
 * Helper to check if user is admin.
 * Checks custom claim admin=true OR existence in config/admins collection.
 */
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(callerUid);
    if (user.customClaims?.admin === true) {
      return true;
    }
    const adminDoc = await db.collection("config").doc("admins").get();
    if (!adminDoc.exists) return false;
    const data = adminDoc.data();
    const uids = (data?.uids as string[]) || [];
    return uids.includes(callerUid);
  } catch (error) {
    console.error(`[isAdmin] Error checking admin status for ${callerUid}:`, error);
    return false;
  }
}

/** Parse functions.config().admins?.uids (comma-separated or array); return true if uid in list. */
function isAdminByConfigUids(callerUid: string): boolean {
  try {
    const cfg = (functions as any).config?.();
    const uidsRaw = cfg?.admins?.uids;
    if (uidsRaw === undefined || uidsRaw === null) return false;
    const uids = Array.isArray(uidsRaw)
      ? (uidsRaw as string[]).map((s) => String(s).trim())
      : (typeof uidsRaw === "string" ? uidsRaw.split(",").map((s) => s.trim()) : []);
    return uids.includes(callerUid);
  } catch {
    return false;
  }
}

/**
 * Admin-only: Re-project publicCars by yard (or single car) for emergency repair.
 *
 * When exposure or yard profile changes, triggers normally re-project; this
 * endpoint allows on-demand refresh. Security: Firebase Auth user with admin
 * claim or listed in config/admins (or env allow-list if configured).
 *
 * Inputs:
 *   - yardUid (required)
 *   - carId (optional): if provided, re-project only this car
 *   - limit (optional, default 500, max 2000): max docs when querying by yardUid
 *   - dryRun (optional, default false): if true, no writes, return matched count only
 *
 * Returns: { yardUid, carId?, matched, processed, errors, durationMs }
 */
export const adminReprojectPublicCars = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }
  const callerUid = context.auth.uid;
  const adminByClaim = context.auth.token?.admin === true;
  const adminByConfig = isAdminByConfigUids(callerUid);
  const adminByFirestore = await isAdmin(callerUid);
  if (!adminByClaim && !adminByConfig && !adminByFirestore) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can call adminReprojectPublicCars");
  }

  const yardUid = typeof data?.yardUid === "string" ? data.yardUid.trim() : "";
  if (!yardUid) {
    throw new functions.https.HttpsError("invalid-argument", "yardUid is required");
  }

  const carId = typeof data?.carId === "string" ? data.carId.trim() || null : null;
  const limitRaw = typeof data?.limit === "number" ? data.limit : 500;
  const limit = Math.min(2000, Math.max(1, limitRaw));
  const dryRun = data?.dryRun === true;
  const startMs = Date.now();
  const errors: string[] = [];

  if (carId) {
    const publicCarRef = db.collection("publicCars").doc(carId);
    const publicCarDoc = await publicCarRef.get();
    const docYardUid = publicCarDoc.exists ? publicCarDoc.data()?.yardUid : null;
    const effectiveYardUid = yardUid || docYardUid || "";
    if (publicCarDoc.exists && docYardUid && yardUid && docYardUid !== yardUid) {
      const durationMs = Date.now() - startMs;
      return {
        yardUid: effectiveYardUid,
        carId,
        matched: 1,
        processed: 0,
        errors: ["car document yardUid does not match requested yardUid"],
        durationMs,
      };
    }
    if (!dryRun && effectiveYardUid) {
      try {
        await upsertPublicCarFromMaster(effectiveYardUid, carId);
      } catch (e) {
        errors.push(String(e instanceof Error ? e.message : e));
      }
    }
    const durationMs = Date.now() - startMs;
    return {
      yardUid: effectiveYardUid,
      carId,
      matched: publicCarDoc.exists ? 1 : 0,
      processed: dryRun ? 0 : errors.length === 0 ? 1 : 0,
      errors,
      durationMs,
    };
  }

  const snapshot = await db
    .collection("publicCars")
    .where("yardUid", "==", yardUid)
    .limit(limit)
    .get();

  const matched = snapshot.docs.length;
  let processed = 0;
  const CONCURRENCY = 5;
  const ids = snapshot.docs.map((d) => d.id);

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const group = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      group.map((id) => (dryRun ? Promise.resolve() : upsertPublicCarFromMaster(yardUid, id)))
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") processed++;
      else errors.push(`${group[idx]}: ${r.reason}`);
    });
  }

  const durationMs = Date.now() - startMs;
  return {
    yardUid,
    matched,
    processed: dryRun ? 0 : processed,
    errors,
    durationMs,
  };
});

/**
 * Plan rebuild of publicCars projection for a yard (read-only, no writes)
 * 
 * Scans all cars from users/{yardUid}/carSales and computes what would happen
 * during a rebuild WITHOUT making any changes. Returns actionable car IDs,
 * status breakdown, and samples for analysis.
 * 
 * Use this before running rebuildPublicCarsForYard to see what will be processed.
 * 
 * Auth required: caller must be authenticated (admin or yard owner)
 */
export const adminDebugPlanRebuildPublicCarsForYard = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);

  // Accept both yardUid (preferred) and yardId (legacy)
  const requestedYardUid =
    (data?.yardUid as string) ||
    (data?.yardId as string) ||
    '';

  let yardUid: string;
  if (callerIsAdmin) {
    yardUid = requestedYardUid || callerUid;
  } else {
    yardUid = callerUid; // ignore requested yard for non-admin
  }

  const correlationId = (data?.correlationId as string) || `plan_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const sampleSize = Math.min(Math.max(parseInt(String(data?.sampleSize || 10)), 1), 20);

  console.log(`[adminDebugPlanRebuildPublicCarsForYard] Planning rebuild for yard ${yardUid} (correlationId: ${correlationId})`);

  try {
    // Read all cars from users/{yardUid}/carSales
    const carSalesRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales");
    
    const snapshot = await carSalesRef.get();
    
    if (snapshot.empty) {
      console.log(`[adminDebugPlanRebuildPublicCarsForYard] No cars found for yard ${yardUid}`);
      return {
        success: true,
        correlationId,
        yardUid,
        plan: {
          scannedTotal: 0,
          actionableCount: 0,
          wouldUnpublishCount: 0,
          skippedCount: 0,
          reasons: {
            sold: 0,
            notPublished: 0,
            missingProjectionInputs: 0,
            other: 0,
          },
          actionableCarIds: [],
          samples: { sold: [], notPublished: [], missingProjectionInputs: [] },
        },
        message: "No cars found for this yard",
      };
    }

    const scannedTotal = snapshot.docs.length;
    const actionableCarIds: string[] = [];
    const wouldUnpublishCarIds: string[] = [];
    
    const reasons = {
      sold: 0,
      notPublished: 0,
      missingProjectionInputs: 0,
      other: 0,
    };
    
    const samples: {
      sold: string[];
      notPublished: string[];
      missingProjectionInputs: string[];
      actionableUpsert: string[];
      wouldUnpublish: string[];
    } = {
      sold: [],
      notPublished: [],
      missingProjectionInputs: [],
      actionableUpsert: [],
      wouldUnpublish: [],
    };

    // Process each car (read-only)
    for (const docSnap of snapshot.docs) {
      const carId = docSnap.id;
      const carData = docSnap.data();
      
      // Check if car is sold
      const saleStatus = String(carData.saleStatus || '').toUpperCase();
      if (saleStatus === 'SOLD') {
        reasons.sold++;
        wouldUnpublishCarIds.push(carId);
        if (samples.sold.length < sampleSize) samples.sold.push(carId);
        if (samples.wouldUnpublish.length < sampleSize) samples.wouldUnpublish.push(carId);
        continue;
      }
      
      // Determine if car is published
      const statusLower = String(carData.status || '').toLowerCase();
      const pubUpper = String(carData.publicationStatus || '').toUpperCase();
      const isPublished = statusLower === 'published' || pubUpper === 'PUBLISHED';
      
      if (!isPublished) {
        reasons.notPublished++;
        wouldUnpublishCarIds.push(carId);
        if (samples.notPublished.length < sampleSize) samples.notPublished.push(carId);
        if (samples.wouldUnpublish.length < sampleSize) samples.wouldUnpublish.push(carId);
        continue;
      }
      
      // Car is published and not sold: actionable for upsert
      actionableCarIds.push(carId);
      if (samples.actionableUpsert.length < sampleSize) samples.actionableUpsert.push(carId);
    }

    const plan = {
      scannedTotal,
      actionableCount: actionableCarIds.length,
      wouldUnpublishCount: wouldUnpublishCarIds.length,
      skippedCount: reasons.sold + reasons.notPublished + reasons.missingProjectionInputs + reasons.other,
      reasons,
      // Return actionableCarIds only if <= 500 to avoid payload size issues
      actionableCarIds: actionableCarIds.length <= 500 ? actionableCarIds : [],
      actionableCarIdsStored: actionableCarIds.length > 500,
      samples,
    };

    // If actionableCarIds is too large, store in progress doc for later retrieval
    if (actionableCarIds.length > 500) {
      const progressRef = db.collection("adminDebugProgress").doc(correlationId);
      await progressRef.set({
        op: 'rebuildPlan',
        yardUid,
        plan: {
          scannedTotal: plan.scannedTotal,
          actionableCount: plan.actionableCount,
          wouldUnpublishCount: plan.wouldUnpublishCount,
          skippedCount: plan.skippedCount,
          reasons: plan.reasons,
          samples: plan.samples,
        },
        actionableCarIds, // Store full list server-side
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`[adminDebugPlanRebuildPublicCarsForYard] Plan complete for yard ${yardUid}: ${plan.actionableCount} actionable, ${plan.wouldUnpublishCount} would unpublish, ${plan.skippedCount} skipped`);

    return {
      success: true,
      correlationId,
      yardUid,
      plan,
      message: `Plan complete: ${plan.actionableCount} cars actionable (would upsert), ${plan.wouldUnpublishCount} would unpublish, ${plan.skippedCount} skipped`,
    };
  } catch (error: any) {
    console.error(`[adminDebugPlanRebuildPublicCarsForYard] Error planning rebuild for yard ${yardUid}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to plan rebuild: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/**
 * Rebuild publicCars projection for a yard
 * 
 * This callable function allows manual repair/backfill of the publicCars projection.
 * It reads all cars from users/{yardUid}/carSales and ensures publicCars/{carId}
 * is in sync for each car.
 * 
 * Supports two modes:
 * - mode="all" (default): Process all cars (legacy behavior)
 * - mode="actionable": Process only actionable cars (from plan or provided list)
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

  // Accept both yardUid (preferred, used by web) and yardId (legacy)
  const requestedYardUid =
    (data?.yardUid as string) ||
    (data?.yardId as string) ||
    '';

  let yardUid: string;
  if (callerIsAdmin) {
    yardUid = requestedYardUid || callerUid;
  } else {
    yardUid = callerUid; // ignore requested yard for non-admin
  }

  const correlationId = (data?.correlationId as string) || `rebuild_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const progressRef = db.collection("adminDebugProgress").doc(correlationId);
  
  // Support mode: "all" (legacy) or "actionable" (only process actionable cars)
  const mode = (data?.mode as string) === 'actionable' ? 'actionable' : 'all';
  const providedActionableCarIds = (data?.actionableCarIds as string[]) || null;

  console.log(`[rebuildPublicCarsForYard] Starting rebuild for yard ${yardUid} (correlationId: ${correlationId}, mode: ${mode})`);

  const writeProgress = async (progress: {
    total: number;
    processed: number;
    upserted: number;
    unpublished: number;
    skipped: number;
    errors: number;
    scannedTotal?: number;
    actionableTotal?: number;
    done?: boolean;
    reasons?: Record<string, number>;
  }) => {
    try {
      const payload: Record<string, unknown> = {
        op: 'rebuildYardPublicCars',
        yardUid,
        mode,
        ...progress,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (progress.processed === 0 && !progress.done) {
        payload.startedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await progressRef.set(payload, { merge: true });
    } catch (e) {
      console.warn(`[rebuildPublicCarsForYard] Failed to write progress:`, e);
    }
  };

  try {
    // Read all cars from users/{yardUid}/carSales
    const carSalesRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales");
    
    const snapshot = await carSalesRef.get();
    
    if (snapshot.empty) {
      console.log(`[rebuildPublicCarsForYard] No cars found for yard ${yardUid}`);
      await writeProgress({ total: 0, processed: 0, upserted: 0, unpublished: 0, skipped: 0, errors: 0, scannedTotal: 0, actionableTotal: 0, done: true });
      return {
        success: true,
        correlationId,
        yardUid,
        mode,
        progress: { total: 0, processed: 0, upserted: 0, unpublished: 0, skipped: 0, errors: 0, scannedTotal: 0, actionableTotal: 0 },
        message: "No cars found for this yard",
      };
    }

    const scannedTotal = snapshot.docs.length;
    
    // Determine actionable set based on mode
    let actionableCarIds: Set<string>;
    const reasons = { sold: 0, notPublished: 0, other: 0 };
    
    if (mode === 'actionable' && providedActionableCarIds && providedActionableCarIds.length > 0) {
      // Use provided list
      actionableCarIds = new Set(providedActionableCarIds);
    } else if (mode === 'actionable') {
      // Re-compute actionable list (lightweight planning)
      actionableCarIds = new Set<string>();
      for (const docSnap of snapshot.docs) {
        const carId = docSnap.id;
        const carData = docSnap.data();
        const saleStatus = String(carData.saleStatus || '').toUpperCase();
        if (saleStatus === 'SOLD') {
          reasons.sold++;
          continue;
        }
        const statusLower = String(carData.status || '').toLowerCase();
        const pubUpper = String(carData.publicationStatus || '').toUpperCase();
        const isPublished = statusLower === 'published' || pubUpper === 'PUBLISHED';
        if (!isPublished) {
          reasons.notPublished++;
          continue;
        }
        actionableCarIds.add(carId);
      }
    } else {
      // mode="all": all cars are actionable (legacy behavior)
      actionableCarIds = new Set(snapshot.docs.map(d => d.id));
    }

    const actionableTotal = actionableCarIds.size;
    
    // For progress bar: total = actionableTotal in actionable mode, scannedTotal in all mode
    const progressTotal = mode === 'actionable' ? actionableTotal : scannedTotal;
    
    let processed = 0;
    let upserted = 0;
    let unpublished = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    await writeProgress({ 
      total: progressTotal, 
      processed: 0, 
      upserted: 0, 
      unpublished: 0, 
      skipped: 0,
      errors: 0,
      scannedTotal,
      actionableTotal,
      reasons,
    });

    // Process each car
    for (const docSnap of snapshot.docs) {
      const carId = docSnap.id;
      const carData = docSnap.data();
      
      // In actionable mode, skip non-actionable cars
      if (mode === 'actionable' && !actionableCarIds.has(carId)) {
        skipped++;
        continue;
      }
      
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
        // Continue with other cars even if one fails — do NOT abort whole rebuild
      }

      await writeProgress({ 
        total: progressTotal, 
        processed, 
        upserted, 
        unpublished, 
        skipped,
        errors,
        scannedTotal,
        actionableTotal,
        reasons,
      });
    }

    // Completion: done when processed >= progressTotal (actionable: processed/actionableTotal; all: processed/scannedTotal)
    const done = progressTotal > 0 ? processed >= progressTotal : true;
    await writeProgress({ 
      total: progressTotal, 
      processed, 
      upserted, 
      unpublished, 
      skipped,
      errors,
      scannedTotal,
      actionableTotal,
      reasons,
      done,
    });

    const progress = { 
      total: progressTotal, 
      processed, 
      upserted, 
      unpublished, 
      skipped,
      errors,
      scannedTotal,
      actionableTotal,
      reasons,
    };
    const result = {
      success: true,
      correlationId,
      yardUid,
      mode,
      progress,
      processed,
      upserted,
      unpublished,
      skipped,
      errors,
      message: `Processed ${processed} cars: ${upserted} upserted, ${unpublished} unpublished${skipped > 0 ? `, ${skipped} skipped` : ''}${errors > 0 ? `, ${errors} errors` : ''}`,
    };

    if (errors > 0) {
      result.message += `. Errors: ${errorDetails.join('; ')}`;
    }

    console.log(`[rebuildPublicCarsForYard] Completed rebuild for yard ${yardUid} (called by ${callerUid}, admin: ${callerIsAdmin}, mode: ${mode}):`, result);
    return result;
  } catch (error: any) {
    console.error(`[rebuildPublicCarsForYard] Error rebuilding publicCars for yard ${yardUid}:`, error);
    // Never throw — return stable shape so client can rely on progress doc
    const progress = { total: 0, processed: 0, upserted: 0, unpublished: 0, errors: 1 };
    return {
      success: false,
      correlationId,
      yardUid,
      progress,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
});

/**
 * Backfill a single publicCar by carId
 * 
 * This callable function ensures a specific car's publicCars/{carId} document
 * contains complete seller snapshot and all car details by re-running the projection.
 * 
 * Auth required: caller must be authenticated
 * - If caller is admin: can backfill any car
 * - If caller is not admin: can only backfill their own yard's cars (yardUid must match caller's UID)
 * 
 * @param data.carId - Car ID to backfill
 * @returns { success: true } or throws error
 */
export const backfillPublicCarById = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const carId = data?.carId;

  if (!carId || typeof carId !== 'string' || carId.trim() === '') {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "carId is required and must be a non-empty string"
    );
  }

  // Generate correlationId for tracing
  const correlationId = `backfill-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  console.log(`[backfillPublicCarById] Backfilling car ${carId} (requested by ${callerUid}, correlationId: ${correlationId})`);

  try {
    // Step 1: Check if publicCars doc exists
    const publicCarRef = db.collection("publicCars").doc(carId);
    const publicCarDoc = await publicCarRef.get();
    const publicDocExisted = publicCarDoc.exists;
    const publicCarData = publicCarDoc.exists ? publicCarDoc.data() : null;
    
    // Step 2: Find master car to determine published status
    let yardUid: string | null = null;
    let masterCar: any = null;
    let published = false;
    
    // Try to get yardUid from existing publicCars doc first
    if (publicCarData?.yardUid) {
      yardUid = publicCarData.yardUid;
      try {
        masterCar = await getYardCarMaster(yardUid as string, carId);
        if (masterCar) {
          published = isMasterCarPublished(masterCar);
        }
      } catch (error) {
        console.warn(`[backfillPublicCarById] Error loading master car from publicCars yardUid ${yardUid}:`, error);
      }
    }
    
    // If not found via publicCars, search for master car
    if (!masterCar) {
      // Try caller's own yard first
      const callerCarRef = db
        .collection("users")
        .doc(callerUid)
        .collection("carSales")
        .doc(carId);
      const callerCarDoc = await callerCarRef.get();
      
      if (callerCarDoc.exists) {
        yardUid = callerUid;
        masterCar = callerCarDoc.data();
        published = isMasterCarPublished(masterCar);
      } else {
        // If not found in caller's yard and caller is not admin, deny
        const callerIsAdmin = await isAdmin(callerUid);
        if (!callerIsAdmin) {
          if (!publicDocExisted) {
            throw new functions.https.HttpsError(
              "not-found",
              `Car ${carId} not found in publicCars or caller's yard`
            );
          }
          // If publicCars exists but master not found, we can still do snapshot repair
          yardUid = publicCarData?.yardUid || null;
        } else {
          // Admin can search other yards (expensive, but necessary for backfill)
          console.log(`[backfillPublicCarById] Admin searching all yards for car ${carId}...`);
          const usersSnapshot = await db.collection("users").get();
          
          for (const userDoc of usersSnapshot.docs) {
            const candidateYardUid = userDoc.id;
            const carRef = userDoc.ref.collection("carSales").doc(carId);
            const carDoc = await carRef.get();
            
            if (carDoc.exists) {
              yardUid = candidateYardUid;
              masterCar = carDoc.data();
              published = isMasterCarPublished(masterCar);
              break;
            }
          }
        }
      }
    }
    
    // Step 3: Determine mode and execute
    if (published) {
      // Published: do full rebuild
      if (!yardUid) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Car ${carId} is published but yardUid could not be determined`
        );
      }
      
      // Check permissions: admin can backfill any car, non-admin can only backfill their own
      const callerIsAdmin = await isAdmin(callerUid);
      if (!callerIsAdmin && yardUid !== callerUid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          `You can only backfill cars from your own yard. Car ${carId} belongs to yard ${yardUid}`
        );
      }
      
      // Capture "before" snapshot state
      const beforeSnapshot = {
        yardName: publicCarData?.yardName || publicCarData?.sellerDisplayName || null,
        yardPhone: publicCarData?.yardPhone || publicCarData?.sellerPhone || null,
        yardWhatsappPhone: publicCarData?.yardWhatsappPhone || publicCarData?.sellerWhatsappPhone || null,
        yardLogoUrl: publicCarData?.yardLogoUrl || publicCarData?.sellerLogoUrl || null,
        sellerCity: publicCarData?.sellerCity || null,
        sellerAddress: publicCarData?.sellerAddress || null,
      };
      
      const beforeHasSnapshot = Boolean(
        beforeSnapshot.yardName || 
        beforeSnapshot.yardPhone || 
        beforeSnapshot.yardWhatsappPhone || 
        beforeSnapshot.yardLogoUrl
      );
      
      // Re-run full projection
      await upsertPublicCarFromMaster(yardUid, carId);
      
      // Read "after" state
      const afterDoc = await publicCarRef.get();
      const afterData = afterDoc.data();
      
      const afterSnapshot = {
        yardName: afterData?.yardName || afterData?.sellerDisplayName || null,
        yardPhone: afterData?.yardPhone || afterData?.sellerPhone || null,
        yardWhatsappPhone: afterData?.yardWhatsappPhone || afterData?.sellerWhatsappPhone || null,
        yardLogoUrl: afterData?.yardLogoUrl || afterData?.sellerLogoUrl || null,
        sellerCity: afterData?.sellerCity || null,
        sellerAddress: afterData?.sellerAddress || null,
      };
      
      const afterHasSnapshot = Boolean(
        afterSnapshot.yardName || 
        afterSnapshot.yardPhone || 
        afterSnapshot.yardWhatsappPhone || 
        afterSnapshot.yardLogoUrl
      );
      
      // Compute missing fields after backfill
      const missingAfterBackfill: string[] = [];
      if (!afterSnapshot.yardName) missingAfterBackfill.push('yardName');
      if (!afterSnapshot.yardPhone) missingAfterBackfill.push('yardPhone');
      if (!afterSnapshot.yardWhatsappPhone) missingAfterBackfill.push('yardWhatsappPhone');
      if (!afterSnapshot.yardLogoUrl) missingAfterBackfill.push('yardLogoUrl');
      if (!afterSnapshot.sellerCity) missingAfterBackfill.push('sellerCity');
      if (!afterSnapshot.sellerAddress) missingAfterBackfill.push('sellerAddress');
      
      const snapshotSource = afterData?.yardSnapshotSource || 'unknown';
      console.log(`[backfillPublicCarById] FULL_REBUILD: carId=${carId}, yardUid=${yardUid}, mode=FULL_REBUILD, snapshotSource=${snapshotSource}, correlationId=${correlationId}`);
      console.log(`[backfillPublicCarById] FULL_REBUILD: car ${carId} for yard ${yardUid}. Before: ${beforeHasSnapshot ? 'HAS' : 'MISSING'} snapshot, After: ${afterHasSnapshot ? 'HAS' : 'MISSING'} snapshot`);
      
      return { 
        success: true, 
        message: `Backfilled car ${carId} (FULL_REBUILD)`,
        carId: carId,
        yardUid: yardUid,
        sellerType: afterData?.sellerType || 'YARD',
        published: true,
        publicDocExisted: publicDocExisted,
        mode: "FULL_REBUILD",
        correlationId: correlationId,
        before: {
          hasSnapshot: beforeHasSnapshot,
          snapshot: beforeSnapshot,
        },
        after: {
          hasSnapshot: afterHasSnapshot,
          snapshot: afterSnapshot,
          missingFields: missingAfterBackfill.length > 0 ? missingAfterBackfill : [],
        },
        snapshotSource: snapshotSource,
      };
    } else {
      // Not published
      if (!publicDocExisted) {
        // No publicCars doc exists: skip (do not create)
        console.log(`[backfillPublicCarById] SKIP_NO_PUBLIC_DOC: carId=${carId}, mode=SKIP_NO_PUBLIC_DOC, correlationId=${correlationId}`);
        console.log(`[backfillPublicCarById] SKIP: car ${carId} is not published and no publicCars doc exists`);
        
        return {
          success: true,
          message: `Skipped car ${carId} (not published, no publicCars doc exists)`,
          carId: carId,
          published: false,
          publicDocExisted: false,
          mode: "SKIP_NO_PUBLIC_DOC",
          correlationId: correlationId,
        };
      }
      
      // publicCars doc exists but car is not published: snapshot-only repair
      if (!yardUid) {
        yardUid = publicCarData?.yardUid || null;
        if (!yardUid) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `Car ${carId} exists in publicCars but has no yardUid and master car not found`
          );
        }
      }
      
      // Check permissions: admin can backfill any car, non-admin can only backfill their own
      const callerIsAdmin = await isAdmin(callerUid);
      if (!callerIsAdmin && yardUid !== callerUid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          `You can only backfill cars from your own yard. Car ${carId} belongs to yard ${yardUid}`
        );
      }
      
      // Capture "before" snapshot state
      const beforeSnapshot = {
        yardName: publicCarData?.yardName || publicCarData?.sellerDisplayName || null,
        yardPhone: publicCarData?.yardPhone || publicCarData?.sellerPhone || null,
        yardWhatsappPhone: publicCarData?.yardWhatsappPhone || publicCarData?.sellerWhatsappPhone || null,
        yardLogoUrl: publicCarData?.yardLogoUrl || publicCarData?.sellerLogoUrl || null,
        sellerCity: publicCarData?.sellerCity || null,
        sellerAddress: publicCarData?.sellerAddress || null,
      };
      
      const beforeHasSnapshot = Boolean(
        beforeSnapshot.yardName || 
        beforeSnapshot.yardPhone || 
        beforeSnapshot.yardWhatsappPhone || 
        beforeSnapshot.yardLogoUrl
      );
      
      // Perform snapshot-only repair
      // Load seller snapshot (same logic as upsertPublicCarFromMaster)
      let sellerType: 'YARD' | 'AGENT' | 'PRIVATE' = 'PRIVATE';
      if (masterCar) {
        const masterSellerType = (masterCar as any).sellerType;
        if (masterSellerType && ['YARD', 'AGENT', 'PRIVATE'].includes(masterSellerType)) {
          sellerType = masterSellerType;
        } else if (masterCar.yardUid) {
          sellerType = 'YARD';
        } else if ((masterCar as any).agentUid) {
          sellerType = 'AGENT';
        }
      } else {
        // Fallback to existing sellerType in publicCars
        sellerType = (publicCarData?.sellerType as any) || 'YARD';
      }
      
      const sellerUid = yardUid || (masterCar?.yardUid) || ((masterCar as any)?.agentUid) || null;
      const sellerSnapshot = sellerUid ? await loadPublicSellerProfile(sellerUid, sellerType) : null;
      
      // Extract snapshot source and missing fields
      const yardSnapshotSource = sellerSnapshot?.source || 'none';
      const yardSnapshotMissing = sellerSnapshot?.missingFields || [];
      
      // Load admin exposure flags (only for YARD/AGENT, not PRIVATE)
      const adminExposure = (sellerUid && (sellerType === 'YARD' || sellerType === 'AGENT')) 
        ? await loadAdminSellerExposure(sellerUid)
        : null;
      
      // Build snapshot-only update (merge, do not touch pricing/visibility/publication flags)
      const snapshotUpdate: any = {
        // Snapshot diagnostic fields
        yardSnapshotSource: yardSnapshotSource,
        ...(yardSnapshotMissing.length > 0 ? { yardSnapshotMissing } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      // Apply seller snapshot fields (respecting admin exposure flags)
      if (!sellerSnapshot) {
        // No snapshot available - leave fields as-is (don't overwrite with null)
        console.log(`[backfillPublicCarById] SNAPSHOT_REPAIR: No seller snapshot available for ${sellerUid}`);
      } else {
        // Apply exposure flags to seller fields
        if (adminExposure?.showNameInBadge !== false && sellerSnapshot.sellerName) {
          snapshotUpdate.yardName = sellerSnapshot.sellerName;
          snapshotUpdate.yardDisplayName = sellerSnapshot.sellerName;
          snapshotUpdate.sellerDisplayName = sellerSnapshot.sellerName;
        }
        
        if (adminExposure?.showPhone !== false && sellerSnapshot.sellerPhone) {
          snapshotUpdate.yardPhone = sellerSnapshot.sellerPhone;
          snapshotUpdate.sellerPhone = sellerSnapshot.sellerPhone;
        }
        
        if (adminExposure?.showWhatsapp !== false && sellerSnapshot.sellerWhatsappPhone) {
          snapshotUpdate.yardWhatsappPhone = sellerSnapshot.sellerWhatsappPhone;
          snapshotUpdate.sellerWhatsappPhone = sellerSnapshot.sellerWhatsappPhone;
        }
        
        if (adminExposure?.showLogo !== false && sellerSnapshot.sellerLogoUrl) {
          snapshotUpdate.yardLogoUrl = sellerSnapshot.sellerLogoUrl;
          snapshotUpdate.sellerLogoUrl = sellerSnapshot.sellerLogoUrl;
        }
        
        if (adminExposure?.showCity !== false && sellerSnapshot.sellerCity) {
          snapshotUpdate.sellerCity = sellerSnapshot.sellerCity;
        }
        
        if (adminExposure?.showAddress !== false && sellerSnapshot.sellerAddress) {
          snapshotUpdate.sellerAddress = sellerSnapshot.sellerAddress;
        }
        
        // Contact person (always include if available, no exposure flag needed)
        if (sellerSnapshot.sellerContactName) {
          snapshotUpdate.yardContactName = sellerSnapshot.sellerContactName;
          snapshotUpdate.sellerContactName = sellerSnapshot.sellerContactName;
        }
      }
      
      // Compute hasYardSnapshot and hasSellerSnapshot flags
      const hasYardSnapshot = Boolean(
        snapshotUpdate.yardName || 
        snapshotUpdate.yardPhone || 
        snapshotUpdate.yardWhatsappPhone || 
        snapshotUpdate.yardLogoUrl
      );
      const hasSellerSnapshot = Boolean(
        snapshotUpdate.sellerDisplayName || 
        snapshotUpdate.sellerPhone || 
        snapshotUpdate.sellerWhatsappPhone || 
        snapshotUpdate.sellerLogoUrl
      );
      
      // Always write snapshot flags (even if false) for UI to check
      snapshotUpdate.hasYardSnapshot = hasYardSnapshot;
      snapshotUpdate.hasSellerSnapshot = hasSellerSnapshot;
      
      // Write snapshot-only update (merge, preserves existing fields)
      await publicCarRef.set(snapshotUpdate, { merge: true });
      
      // Read "after" state
      const afterDoc = await publicCarRef.get();
      const afterData = afterDoc.data();
      
      const afterSnapshot = {
        yardName: afterData?.yardName || afterData?.sellerDisplayName || null,
        yardPhone: afterData?.yardPhone || afterData?.sellerPhone || null,
        yardWhatsappPhone: afterData?.yardWhatsappPhone || afterData?.sellerWhatsappPhone || null,
        yardLogoUrl: afterData?.yardLogoUrl || afterData?.sellerLogoUrl || null,
        sellerCity: afterData?.sellerCity || null,
        sellerAddress: afterData?.sellerAddress || null,
      };
      
      const afterHasSnapshot = Boolean(
        afterSnapshot.yardName || 
        afterSnapshot.yardPhone || 
        afterSnapshot.yardWhatsappPhone || 
        afterSnapshot.yardLogoUrl
      );
      
      // Compute missing fields after repair
      const missingAfterRepair: string[] = [];
      if (!afterSnapshot.yardName) missingAfterRepair.push('yardName');
      if (!afterSnapshot.yardPhone) missingAfterRepair.push('yardPhone');
      if (!afterSnapshot.yardWhatsappPhone) missingAfterRepair.push('yardWhatsappPhone');
      if (!afterSnapshot.yardLogoUrl) missingAfterRepair.push('yardLogoUrl');
      if (!afterSnapshot.sellerCity) missingAfterRepair.push('sellerCity');
      if (!afterSnapshot.sellerAddress) missingAfterRepair.push('sellerAddress');
      
      const finalSnapshotSource = afterData?.yardSnapshotSource || yardSnapshotSource;
      console.log(`[backfillPublicCarById] SNAPSHOT_REPAIR: carId=${carId}, yardUid=${yardUid}, mode=SNAPSHOT_REPAIR, snapshotSource=${finalSnapshotSource}, correlationId=${correlationId}`);
      console.log(`[backfillPublicCarById] SNAPSHOT_REPAIR: car ${carId} for yard ${yardUid}. Before: ${beforeHasSnapshot ? 'HAS' : 'MISSING'} snapshot, After: ${afterHasSnapshot ? 'HAS' : 'MISSING'} snapshot`);
      
      return { 
        success: true, 
        message: `Repaired snapshot for car ${carId} (SNAPSHOT_REPAIR)`,
        carId: carId,
        yardUid: yardUid,
        sellerType: afterData?.sellerType || sellerType,
        published: false,
        publicDocExisted: true,
        mode: "SNAPSHOT_REPAIR",
        correlationId: correlationId,
        before: {
          hasSnapshot: beforeHasSnapshot,
          snapshot: beforeSnapshot,
        },
        after: {
          hasSnapshot: afterHasSnapshot,
          snapshot: afterSnapshot,
          missingFields: missingAfterRepair.length > 0 ? missingAfterRepair : [],
        },
        snapshotSource: finalSnapshotSource,
      };
    }
  } catch (error: any) {
    console.error(`[backfillPublicCarById] Error backfilling car ${carId}:`, error);
    
    // Re-throw HttpsError as-is
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // Wrap other errors
    throw new functions.https.HttpsError(
      "internal",
      `Failed to backfill car ${carId}`,
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Bulk repair publicCars snapshots (chunked, resumable)
 * 
 * This admin-only callable function repairs snapshot fields for existing publicCars docs.
 * Processes in batches to avoid timeouts. Returns cursor for resumable operation.
 * 
 * Only repairs snapshot fields (yardName, yardPhone, etc.) - does NOT create new docs.
 * 
 * Auth required: caller must be admin
 * 
 * @param data.yardUid - Optional: filter by specific yard
 * @param data.batchSize - Batch size (default 75, max 150)
 * @param data.cursor - Last processed docId for resumable operation
 * @param data.dryRun - If true, don't write changes (default false)
 */
export const bulkRepairPublicCarSnapshots = functions.https.onCall(async (data, context) => {
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
      "Only admins can bulk repair snapshots"
    );
  }

  // Accept correlationId from client (so all batches share same progress doc) or generate
  const correlationId = (data?.correlationId as string) || `bulk-repair-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Parse input
  const yardUid = data?.yardUid || null;
  const batchSize = Math.min(Math.max(parseInt(String(data?.batchSize || 75)), 1), 150);
  const cursor = data?.cursor || null;
  const dryRun = data?.dryRun === true;

  const progressRef = db.collection("adminDebugProgress").doc(correlationId);
  const isFirstBatch = !cursor;

  console.log(`[bulkRepairPublicCarSnapshots] Starting batch: yardUid=${yardUid || 'ALL'}, batchSize=${batchSize}, cursor=${cursor || 'START'}, dryRun=${dryRun}, correlationId=${correlationId}`);

  const writeProgress = async (payload: {
    total?: number;
    processed?: number;
    scanned?: number;
    fixed?: number;
    skipped?: number;
    failed?: number;
    errors?: number;
    done?: boolean;
    message?: string;
    useIncrement?: boolean;
  }) => {
    try {
      const base: Record<string, unknown> = {
        op: 'bulkSnapshotRepair',
        yardUid: yardUid || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...payload,
      };
      delete (base as any).useIncrement;
      if (payload.useIncrement) {
        await progressRef.set({
          op: 'bulkSnapshotRepair',
          yardUid: yardUid || null,
          scanned: admin.firestore.FieldValue.increment(payload.scanned ?? 0),
          fixed: admin.firestore.FieldValue.increment(payload.fixed ?? 0),
          skipped: admin.firestore.FieldValue.increment(payload.skipped ?? 0),
          failed: admin.firestore.FieldValue.increment(payload.failed ?? 0),
          errors: admin.firestore.FieldValue.increment(payload.errors ?? payload.failed ?? 0),
          processed: admin.firestore.FieldValue.increment(payload.processed ?? payload.scanned ?? 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          done: payload.done ?? false,
          ...(payload.message ? { message: payload.message } : {}),
        }, { merge: true });
      } else {
        if (isFirstBatch && payload.processed === 0 && !payload.done) {
          (base as any).startedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        await progressRef.set(base, { merge: true });
      }
    } catch (e) {
      console.warn(`[bulkRepairPublicCarSnapshots] Failed to write progress:`, e);
    }
  };

  // Write initial progress doc immediately (so UI shows doc exists right away)
  if (isFirstBatch) {
    try {
      await progressRef.set({
        op: 'bulkSnapshotRepair',
        yardUid: yardUid || null,
        total: 0,
        processed: 0,
        scanned: 0,
        fixed: 0,
        skipped: 0,
        failed: 0,
        errors: 0,
        done: false,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn(`[bulkRepairPublicCarSnapshots] Failed to write initial progress:`, e);
    }
  }

  try {
    // Build query: publicCars where sellerType=="YARD"
    let query: admin.firestore.Query = db.collection("publicCars")
      .where("sellerType", "==", "YARD")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(batchSize);

    // Add yardUid filter if provided
    if (yardUid) {
      query = query.where("yardUid", "==", yardUid);
    }

    // Add cursor for resumable operation
    if (cursor) {
      const cursorDoc = await db.collection("publicCars").doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Execute query
    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log(`[bulkRepairPublicCarSnapshots] No docs found, done. correlationId=${correlationId}`);
      if (isFirstBatch) {
        await writeProgress({ total: 0, processed: 0, scanned: 0, fixed: 0, skipped: 0, failed: 0, errors: 0, done: true, message: 'No documents to process' });
      } else {
        const snap = await progressRef.get();
        const d = snap.data() || {};
        const totalScanned = d.scanned ?? 0;
        await progressRef.set({ total: totalScanned, processed: totalScanned, done: true, message: 'Completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      return {
        ok: true,
        correlationId,
        progress: { total: 0, processed: 0, scanned: 0, fixed: 0, skipped: 0, failed: 0, done: true },
        batch: {
          scanned: 0,
          fixed: 0,
          skippedAlreadyOk: 0,
          skippedNoYardUid: 0,
          skippedNoSourceData: 0,
          failed: 0,
        },
        cursorOut: null,
        done: true,
        itemsSample: [],
        success: true,
        message: 'No documents to process',
      };
    }

    // Process batch (initial progress doc already written above)
    let scanned = 0;
    let fixed = 0;
    let skippedAlreadyOk = 0;
    let skippedNoYardUid = 0;
    let skippedNoSourceData = 0;
    let failed = 0;
    const itemsSample: Array<{
      carId: string;
      status: string;
      snapshotSource?: string;
      missingFields?: string[];
    }> = [];

    let lastWrittenScanned = 0;
    let lastWrittenFixed = 0;
    let lastWrittenSkipped = 0;
    let lastWrittenFailed = 0;

    for (const docSnap of snapshot.docs) {
      const carId = docSnap.id;
      const publicCarData = docSnap.data();
      scanned++;

      try {
        // Check if snapshot already present
        const hasSnapshot = Boolean(
          publicCarData?.yardName || 
          publicCarData?.sellerDisplayName ||
          publicCarData?.yardPhone || 
          publicCarData?.sellerPhone ||
          publicCarData?.yardLogoUrl || 
          publicCarData?.sellerLogoUrl
        );

        if (hasSnapshot) {
          skippedAlreadyOk++;
          itemsSample.push({ carId, status: "SKIP_ALREADY_OK" });
          continue;
        }

        // Check yardUid
        const docYardUid = publicCarData?.yardUid;
        if (!docYardUid) {
          skippedNoYardUid++;
          itemsSample.push({ carId, status: "SKIP_NO_YARD_UID" });
          continue;
        }

        // Resolve seller snapshot
        const sellerType = (publicCarData?.sellerType as any) || 'YARD';
        const sellerSnapshot = await loadPublicSellerProfile(docYardUid, sellerType);
        
        if (!sellerSnapshot) {
          skippedNoSourceData++;
          itemsSample.push({ carId, status: "SKIP_NO_SOURCE_DATA", snapshotSource: 'none' });
          continue;
        }

        // Load admin exposure flags
        const adminExposure = (sellerType === 'YARD' || sellerType === 'AGENT')
          ? await loadAdminSellerExposure(docYardUid)
          : null;

        // Build snapshot update (same fields as SNAPSHOT_REPAIR)
        const snapshotUpdate: any = {
          yardSnapshotSource: sellerSnapshot.source || 'none',
          ...(sellerSnapshot.missingFields && sellerSnapshot.missingFields.length > 0 
            ? { yardSnapshotMissing: sellerSnapshot.missingFields } 
            : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Apply seller snapshot fields (respecting admin exposure flags)
        if (adminExposure?.showNameInBadge !== false && sellerSnapshot.sellerName) {
          snapshotUpdate.yardName = sellerSnapshot.sellerName;
          snapshotUpdate.yardDisplayName = sellerSnapshot.sellerName;
          snapshotUpdate.sellerDisplayName = sellerSnapshot.sellerName;
        }

        if (adminExposure?.showPhone !== false && sellerSnapshot.sellerPhone) {
          snapshotUpdate.yardPhone = sellerSnapshot.sellerPhone;
          snapshotUpdate.sellerPhone = sellerSnapshot.sellerPhone;
        }

        if (adminExposure?.showWhatsapp !== false && sellerSnapshot.sellerWhatsappPhone) {
          snapshotUpdate.yardWhatsappPhone = sellerSnapshot.sellerWhatsappPhone;
          snapshotUpdate.sellerWhatsappPhone = sellerSnapshot.sellerWhatsappPhone;
        }

        if (adminExposure?.showLogo !== false && sellerSnapshot.sellerLogoUrl) {
          snapshotUpdate.yardLogoUrl = sellerSnapshot.sellerLogoUrl;
          snapshotUpdate.sellerLogoUrl = sellerSnapshot.sellerLogoUrl;
        }

        if (adminExposure?.showCity !== false && sellerSnapshot.sellerCity) {
          snapshotUpdate.sellerCity = sellerSnapshot.sellerCity;
        }

        if (adminExposure?.showAddress !== false && sellerSnapshot.sellerAddress) {
          snapshotUpdate.sellerAddress = sellerSnapshot.sellerAddress;
        }

        // Check if we have any snapshot data to write
        const hasSnapshotData = Boolean(
          snapshotUpdate.yardName ||
          snapshotUpdate.yardPhone ||
          snapshotUpdate.yardWhatsappPhone ||
          snapshotUpdate.yardLogoUrl ||
          snapshotUpdate.sellerCity ||
          snapshotUpdate.sellerAddress
        );

        if (!hasSnapshotData) {
          skippedNoSourceData++;
          itemsSample.push({ 
            carId, 
            status: "SKIP_NO_SOURCE_DATA", 
            snapshotSource: sellerSnapshot.source,
            missingFields: sellerSnapshot.missingFields 
          });
          continue;
        }

        // Write update (if not dry run)
        if (!dryRun) {
          const publicCarRef = db.collection("publicCars").doc(carId);
          await publicCarRef.set(snapshotUpdate, { merge: true });
        }

        fixed++;
        itemsSample.push({ 
          carId, 
          status: dryRun ? "FIX_DRY_RUN" : "FIXED",
          snapshotSource: sellerSnapshot.source,
          missingFields: sellerSnapshot.missingFields 
        });

      } catch (error: any) {
        failed++;
        console.error(`[bulkRepairPublicCarSnapshots] Error processing car ${carId}:`, error);
        itemsSample.push({ 
          carId, 
          status: `FAILED: ${error instanceof Error ? error.message : String(error)}` 
        });
      }

      // Update progress every 10 items (live bar movement)
      if (scanned % 10 === 0) {
        const skippedTotal = skippedAlreadyOk + skippedNoYardUid + skippedNoSourceData;
        const dScanned = scanned - lastWrittenScanned;
        const dFixed = fixed - lastWrittenFixed;
        const dSkipped = skippedTotal - lastWrittenSkipped;
        const dFailed = failed - lastWrittenFailed;
        if (dScanned > 0 || dFixed > 0 || dSkipped > 0 || dFailed > 0) {
          await writeProgress({
            scanned: dScanned,
            processed: dScanned,
            fixed: dFixed,
            skipped: dSkipped,
            failed: dFailed,
            errors: dFailed,
            useIncrement: true,
          });
          lastWrittenScanned = scanned;
          lastWrittenFixed = fixed;
          lastWrittenSkipped = skippedTotal;
          lastWrittenFailed = failed;
        }
      }
    }

    // Determine cursor and done status
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const cursorOut = snapshot.docs.length < batchSize ? null : lastDoc.id;
    const done = snapshot.docs.length < batchSize;
    const skipped = skippedAlreadyOk + skippedNoYardUid + skippedNoSourceData;

    // Write progress (increment remainder since last mid-batch write)
    const dScanned = scanned - lastWrittenScanned;
    const dFixed = fixed - lastWrittenFixed;
    const dSkipped = skipped - lastWrittenSkipped;
    const dFailed = failed - lastWrittenFailed;
    if (dScanned > 0 || dFixed > 0 || dSkipped > 0 || dFailed > 0) {
      await writeProgress({
        scanned: dScanned,
        processed: dScanned,
        fixed: dFixed,
        skipped: dSkipped,
        failed: dFailed,
        errors: dFailed,
        done,
        message: done ? 'Completed' : undefined,
        useIncrement: true,
      });
    } else if (done) {
      await writeProgress({ done: true, message: 'Completed' });
    }

    // When done, set total = processed (for UI to show 100%)
    if (done) {
      const currentSnap = await progressRef.get();
      const d = currentSnap.data() || {};
      const totalScanned = d.scanned ?? scanned;
      await progressRef.set({ total: totalScanned, processed: totalScanned }, { merge: true });
    }

    console.log(`[bulkRepairPublicCarSnapshots] Batch complete: scanned=${scanned}, fixed=${fixed}, skippedAlreadyOk=${skippedAlreadyOk}, skippedNoYardUid=${skippedNoYardUid}, skippedNoSourceData=${skippedNoSourceData}, failed=${failed}, cursorOut=${cursorOut || 'DONE'}, correlationId=${correlationId}`);

    const progress = {
      total: 0,
      processed: scanned,
      scanned,
      fixed,
      skipped,
      failed,
      done,
    };

    return {
      ok: true,
      correlationId,
      success: true,
      progress,
      message: done ? 'Completed' : undefined,
      batch: {
        scanned,
        fixed,
        skippedAlreadyOk,
        skippedNoYardUid,
        skippedNoSourceData,
        failed,
      },
      cursorOut,
      done,
      itemsSample: itemsSample.slice(0, 20), // Limit sample to 20 items
    };

  } catch (error: any) {
    console.error(`[bulkRepairPublicCarSnapshots] Error in batch:`, error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to bulk repair snapshots: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Repair snapshot fields for a specific publicCar document
 * 
 * This admin-only callable function repairs ONLY snapshot fields (yardName, yardPhone, etc.)
 * for an existing publicCars/{carId} document. Does NOT create new docs or change publish state.
 * 
 * Auth required: caller must be admin
 * 
 * @param data.carId - Car ID to repair
 * @returns { ok: true, updatedFields: [...], correlationId }
 */
export const repairPublicCarSnapshotsById = functions.https.onCall(async (data, context) => {
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
      "Only admins can repair snapshots"
    );
  }

  const carId = data?.carId;
  if (!carId || typeof carId !== 'string' || carId.trim() === '') {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "carId is required and must be a non-empty string"
    );
  }

  // Generate correlationId
  const correlationId = `repair-snapshot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  console.log(`[repairPublicCarSnapshotsById] Repairing snapshot for car ${carId} (correlationId: ${correlationId})`);

  try {
    // Load publicCars doc
    const publicCarRef = db.collection("publicCars").doc(carId);
    const publicCarDoc = await publicCarRef.get();
    
    if (!publicCarDoc.exists) {
      return {
        ok: false,
        reason: "public doc missing",
        carId,
        correlationId,
      };
    }

    const publicCarData = publicCarDoc.data();
    if (!publicCarData) {
      return {
        ok: false,
        reason: "public doc has no data",
        carId,
        correlationId,
      };
    }

    // Determine yardUid & sellerType
    const yardUid = publicCarData.yardUid || null;
    const sellerType = (publicCarData.sellerType || 'YARD') as 'YARD' | 'AGENT' | 'PRIVATE';
    
    if (!yardUid) {
      return {
        ok: false,
        reason: "no yardUid in public doc",
        carId,
        correlationId,
      };
    }

    // Load seller profile using resolveYardProfile (users/{uid} first, then yards/{uid} fallback)
    const sellerProfile = await loadPublicSellerProfile(yardUid, sellerType);
    if (!sellerProfile) {
      return {
        ok: false,
        reason: "could not load seller profile",
        carId,
        yardUid,
        correlationId,
      };
    }

    // Load admin exposure flags
    const adminExposure = await loadAdminSellerExposure(yardUid);

    // Build snapshot fields update (merge: true, snapshot fields only)
    // Only patch fields that are currently missing/null (merge-only, don't overwrite existing values)
    const snapshotUpdate: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Check current values to only patch missing/null fields
    const currentYardName = publicCarData.yardName || publicCarData.yardDisplayName || publicCarData.sellerDisplayName;
    const currentYardPhone = publicCarData.yardPhone || publicCarData.sellerPhone;
    const currentYardWhatsapp = publicCarData.yardWhatsappPhone || publicCarData.sellerWhatsappPhone;
    const currentYardLogo = publicCarData.yardLogoUrl || publicCarData.sellerLogoUrl;
    const currentSellerCity = publicCarData.sellerCity;
    const currentSellerAddress = publicCarData.sellerAddress;
    const currentYardContactName = publicCarData.yardContactName || publicCarData.sellerContactName;

    // Apply exposure flags and populate snapshot fields (only if currently missing/null)
    if (adminExposure?.showNameInBadge !== false && sellerProfile.sellerName && !currentYardName) {
      snapshotUpdate.yardName = sellerProfile.sellerName;
      snapshotUpdate.yardDisplayName = sellerProfile.sellerName;
      snapshotUpdate.sellerDisplayName = sellerProfile.sellerName;
    }
    
    if (adminExposure?.showPhone !== false && sellerProfile.sellerPhone && !currentYardPhone) {
      snapshotUpdate.yardPhone = sellerProfile.sellerPhone;
      snapshotUpdate.sellerPhone = sellerProfile.sellerPhone;
    }
    
    if (adminExposure?.showPhone !== false && sellerProfile.sellerWhatsappPhone && !currentYardWhatsapp) {
      snapshotUpdate.yardWhatsappPhone = sellerProfile.sellerWhatsappPhone;
      snapshotUpdate.sellerWhatsappPhone = sellerProfile.sellerWhatsappPhone;
    }
    
    if (adminExposure?.showLogo !== false && sellerProfile.sellerLogoUrl && !currentYardLogo) {
      snapshotUpdate.yardLogoUrl = sellerProfile.sellerLogoUrl;
      snapshotUpdate.sellerLogoUrl = sellerProfile.sellerLogoUrl;
    }
    
    if (sellerProfile.sellerCity && !currentSellerCity) {
      snapshotUpdate.sellerCity = sellerProfile.sellerCity;
    }
    
    if (sellerProfile.sellerAddress && !currentSellerAddress) {
      snapshotUpdate.sellerAddress = sellerProfile.sellerAddress;
    }
    
    if (sellerProfile.sellerContactName && !currentYardContactName) {
      snapshotUpdate.yardContactName = sellerProfile.sellerContactName;
      snapshotUpdate.sellerContactName = sellerProfile.sellerContactName;
    }

    // Build nested snapshots (only if sellerType=YARD and we have data)
    if (sellerType === 'YARD' && sellerProfile) {
      const currentYardSnapshot = publicCarData.yardSnapshot;
      const currentSellerSnapshot = publicCarData.sellerSnapshot;
      
      // Only set nested snapshots if missing or if we have new data
      if (!currentYardSnapshot || !currentSellerSnapshot) {
        snapshotUpdate.yardSnapshot = {
          yardName: sellerProfile.sellerName,
          yardPhone: sellerProfile.sellerPhone,
          yardWhatsapp: sellerProfile.sellerWhatsappPhone,
          yardLogoUrl: sellerProfile.sellerLogoUrl,
          yardAddress: sellerProfile.sellerAddress,
          yardContactName: sellerProfile.sellerContactName || null,
        };
        
        snapshotUpdate.sellerSnapshot = {
          sellerName: sellerProfile.sellerName,
          sellerPhone: sellerProfile.sellerPhone,
          sellerWhatsapp: sellerProfile.sellerWhatsappPhone,
          sellerLogoUrl: sellerProfile.sellerLogoUrl,
          sellerAddress: sellerProfile.sellerAddress,
          sellerContactName: sellerProfile.sellerContactName || null,
        };
      }
    }

    // Set snapshot flags
    const hasYardSnapshot = Boolean(
      snapshotUpdate.yardName || 
      snapshotUpdate.yardPhone || 
      snapshotUpdate.yardWhatsappPhone || 
      snapshotUpdate.yardLogoUrl ||
      (snapshotUpdate.yardSnapshot && (
        snapshotUpdate.yardSnapshot.yardName ||
        snapshotUpdate.yardSnapshot.yardPhone ||
        snapshotUpdate.yardSnapshot.yardWhatsapp ||
        snapshotUpdate.yardSnapshot.yardLogoUrl
      )) ||
      (publicCarData.yardName || publicCarData.yardPhone || publicCarData.yardWhatsappPhone || publicCarData.yardLogoUrl) ||
      (publicCarData.yardSnapshot && (
        publicCarData.yardSnapshot.yardName ||
        publicCarData.yardSnapshot.yardPhone ||
        publicCarData.yardSnapshot.yardWhatsapp ||
        publicCarData.yardSnapshot.yardLogoUrl
      ))
    );
    const hasSellerSnapshot = hasYardSnapshot; // For YARD, they're the same
    
    snapshotUpdate.hasYardSnapshot = hasYardSnapshot;
    snapshotUpdate.hasSellerSnapshot = hasSellerSnapshot;
    snapshotUpdate.yardSnapshotSource = sellerProfile.source === 'yards' ? `yards/${yardUid}` : sellerProfile.source === 'users' ? `users/${yardUid}` : 'none';

    // Update publicCars doc (merge: true)
    await publicCarRef.set(snapshotUpdate, { merge: true });

    const patchedFields = Object.keys(snapshotUpdate).filter(k => k !== 'updatedAt');
    
    console.log(`[repairPublicCarSnapshotsById] Repaired snapshot for car ${carId}: ${patchedFields.length} fields updated (correlationId: ${correlationId})`);

    return {
      ok: true,
      updatedFields: patchedFields,
      patchedFields, // Alias for clarity
      carId,
      yardUid,
      source: snapshotUpdate.yardSnapshotSource,
      hasYardSnapshot,
      hasSellerSnapshot,
      snapshotSource: snapshotUpdate.yardSnapshotSource,
      correlationId,
    };
  } catch (error: any) {
    console.error(`[repairPublicCarSnapshotsById] Error repairing snapshot for car ${carId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to repair snapshot: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Backfill all publicCars with seller snapshot and full details
 * 
 * This admin-only callable function scans all published cars and ensures
 * publicCars/{carId} contains complete seller snapshot and all car details.
 * 
 * Auth required: caller must be admin
 */
export const backfillPublicCars = functions.https.onCall(async (data, context) => {
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
      "Only admins can backfill publicCars"
    );
  }

  console.log(`[backfillPublicCars] Starting backfill (called by admin ${callerUid})`);

  try {
    let processed = 0;
    let upserted = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const batchSize = 50; // Process in batches to avoid timeout

    // Get all users (yards) that have carSales
    const usersSnapshot = await db.collection("users").get();
    
    for (const userDoc of usersSnapshot.docs) {
      const yardUid = userDoc.id;
      const carSalesRef = userDoc.ref.collection("carSales");
      
      // Get all cars for this yard
      const carsSnapshot = await carSalesRef.get();
      
      if (carsSnapshot.empty) {
        continue; // Skip yards with no cars
      }

      // Process each car
      for (const carDoc of carsSnapshot.docs) {
        const carId = carDoc.id;
        const carData = carDoc.data();
        
        try {
          processed++;
          
          // Check if car is sold - sold cars should never be in publicCars
          const saleStatus = String(carData.saleStatus || '').toUpperCase();
          if (saleStatus === 'SOLD') {
            // Skip sold cars
            continue;
          }
          
          // Determine if car is published
          const statusLower = String(carData.status || '').toLowerCase();
          const pubUpper = String(carData.publicationStatus || '').toUpperCase();
          const isPublished = statusLower === 'published' || pubUpper === 'PUBLISHED';
          
          if (isPublished) {
            // Car is published: upsert to publicCars (this will include seller snapshot)
            // Uses merge writes to avoid overwriting existing data blindly
            await upsertPublicCarFromMaster(yardUid, carId);
            upserted++;
            
            if (upserted % batchSize === 0) {
              console.log(`[backfillPublicCars] Progress: ${processed} processed, ${upserted} upserted...`);
            }
          }
        } catch (error: any) {
          errors++;
          const errorMsg = `Car ${carId} (yard ${yardUid}): ${error instanceof Error ? error.message : String(error)}`;
          errorDetails.push(errorMsg);
          console.error(`[backfillPublicCars] Error processing car ${carId}:`, error);
          // Continue with other cars even if one fails
        }
      }
    }

    const result = {
      success: true,
      processed,
      upserted,
      errors,
      message: `Backfill completed: ${processed} cars processed, ${upserted} upserted${errors > 0 ? `, ${errors} errors` : ''}`,
    };

    if (errors > 0 && errorDetails.length > 0) {
      // Limit error details to first 10 to avoid response size issues
      result.message += `. First errors: ${errorDetails.slice(0, 10).join('; ')}`;
    }

    console.log(`[backfillPublicCars] Completed backfill (called by admin ${callerUid}):`, result);
    return result;
  } catch (error: any) {
    console.error(`[backfillPublicCars] Error during backfill:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to backfill publicCars",
      error instanceof Error ? error.message : String(error)
    );
  }
});