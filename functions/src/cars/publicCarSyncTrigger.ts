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

/** Split array into chunks of given size. */
function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Run async tasks with concurrency limit; returns settled results in task order. */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]();
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

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
    const correlationId = `proj_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const carData = change.after.exists ? change.after.data() : null;

    try {
      // Case 1: Car deleted
      if (!change.after.exists) {
        console.log(`[publicCarSyncTrigger] Car ${carId} deleted, removing from publicCars (correlationId: ${correlationId}, yardUid: ${yardUid})`);
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
        console.log(`[publicCarSyncTrigger] Car ${carId} is SOLD, removing from publicCars (correlationId: ${correlationId}, yardUid: ${yardUid})`);
        await unpublishPublicCar(carId);
        return;
      }

      // Case 3: Determine if car is published (support both new and legacy formats)
      if (isMasterCarPublished(carData)) {
        // Car is published and not sold: upsert to publicCars
        console.log(`[publicCarSyncTrigger] Car ${carId} is published, syncing to publicCars (correlationId: ${correlationId}, yardUid: ${yardUid})`);
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
        console.log(`[publicCarSyncTrigger] Car ${carId} is not published, removing from publicCars (correlationId: ${correlationId}, yardUid: ${yardUid})`);
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
        correlationId,
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
 * Firestore trigger: Re-project publicCars when yard profile changes.
 * Path: users/{yardUid} (onUpdate).
 * Guard: run ONLY if after.isYard === true OR after.primaryRole === 'YARD'.
 */
const YARD_PROFILE_CHUNK_SIZE = 50;
const YARD_PROFILE_CONCURRENCY = 5;

export const onYardProfileChangeUpdatePublicCars = functions.firestore
  .document("users/{yardUid}")
  .onUpdate(async (change, context) => {
    const yardUid = context.params.yardUid;
    const startMs = Date.now();
    const before = change.before.data();
    const after = change.after.data();

    if (!(after?.isYard === true || after?.primaryRole === "YARD")) {
      return;
    }

    const relevantFields = [
      "displayName",
      "fullName",
      "yardName",
      "businessName",
      "companyName",
      "name",
      "phone",
      "phoneNumber",
      "secondaryPhone",
      "contactPhone",
      "yardLogoUrl",
      "logoUrl",
      "city",
      "address",
      "streetAddress",
      "website",
      "whatsappServicePhone",
      "whatsappPhone",
      "whatsapp",
      "whatsApp",
      "yardWhatsappPhone",
      "roleStatus",
      "status",
      "primaryRole",
      "isYard",
    ];
    const hasRelevantChange = relevantFields.some((field) => before?.[field] !== after?.[field]);
    if (!hasRelevantChange) return;

    try {
      const snapshot1 = await db
        .collection("publicCars")
        .where("yardUid", "==", yardUid)
        .where("isPublished", "==", true)
        .get();
      let snapshot2: admin.firestore.QuerySnapshot;
      try {
        snapshot2 = await db
          .collection("publicCars")
          .where("yardUid", "==", yardUid)
          .where("isPublished", "==", null)
          .get();
      } catch (err: any) {
        console.warn(`[onYardProfileChangeUpdatePublicCars] Legacy query failed for yard ${yardUid}:`, err?.message || String(err));
        snapshot2 = { docs: [], empty: true, size: 0 } as unknown as admin.firestore.QuerySnapshot;
      }

      const allCarIds = Array.from(new Set([...snapshot1.docs.map((d) => d.id), ...snapshot2.docs.map((d) => d.id)]));
      const matchedCount = allCarIds.length;
      if (matchedCount === 0) {
        console.log(`[onYardProfileChangeUpdatePublicCars] No cars for yard ${yardUid}`);
        return;
      }

      const legacySet = new Set(snapshot2.docs.map((d) => d.id));
      const legacyData = new Map(snapshot2.docs.map((d) => [d.id, d.data()]));
      let processedCount = 0;
      let skipped = 0;
      let errorsCount = 0;

      const chunks = chunkArray(allCarIds, YARD_PROFILE_CHUNK_SIZE);
      for (const chunk of chunks) {
        const tasks = chunk.map((carId) => async (): Promise<"ok" | "skipped"> => {
          if (legacySet.has(carId)) {
            const data = legacyData.get(carId);
            const publicationStatus = String(data?.publicationStatus || "").toUpperCase();
            const status = String(data?.status || "").toLowerCase();
            if (
              publicationStatus === "HIDDEN" ||
              publicationStatus === "ARCHIVED" ||
              status === "hidden" ||
              status === "archived" ||
              status === "draft"
            ) {
              return "skipped";
            }
          }
          await upsertPublicCarFromMaster(yardUid, carId);
          return "ok";
        });
        const results = await runWithConcurrency(tasks, YARD_PROFILE_CONCURRENCY);
        results.forEach((r) => {
          if (r.status === "fulfilled") {
            if (r.value === "skipped") skipped++;
            else processedCount++;
          } else errorsCount++;
        });
      }

      const durationMs = Date.now() - startMs;
      console.log(`[onYardProfileChangeUpdatePublicCars] yardUid=${yardUid} matchedCount=${matchedCount} processedCount=${processedCount} skipped=${skipped} errorsCount=${errorsCount} durationMs=${durationMs}`);
    } catch (error) {
      const durationMs = Date.now() - startMs;
      console.error(`[onYardProfileChangeUpdatePublicCars] Error for yard ${yardUid}:`, { durationMs, error });
    }
  });

/**
 * Firestore trigger: Re-project publicCars when admin exposure changes (create/update/delete).
 * Path: adminSellerExposure/{sellerUid}
 * On delete, still re-project so derived fields reflect defaults.
 */
const EXPOSURE_PAGE_SIZE = 500;
const EXPOSURE_CHUNK_SIZE = 50;
const EXPOSURE_CONCURRENCY = 5;

export const onAdminSellerExposureChangeUpdatePublicCars = functions.firestore
  .document("adminSellerExposure/{sellerUid}")
  .onWrite(async (change, context) => {
    const sellerUid = context.params.sellerUid;
    const startMs = Date.now();
    const beforeData = change.before.exists ? change.before.data() : null;
    const afterData = change.after.exists ? change.after.data() : null;
    const exposureFields = [
      "showNameInBadge",
      "showLogo",
      "showPhone",
      "showWhatsapp",
      "showCity",
      "showAddress",
      "sellerType",
    ];
    const changedFields = exposureFields.filter(
      (f) => (beforeData?.[f] !== undefined || afterData?.[f] !== undefined) && beforeData?.[f] !== afterData?.[f]
    );

    console.log(`[onAdminSellerExposureChangeUpdatePublicCars] seller ${sellerUid}, changedFields: [${changedFields.join(", ") || "create/delete"}]`);

    try {
      const allCarIds: string[] = [];
      let lastDoc: admin.firestore.DocumentSnapshot | null = null;
      for (;;) {
        let q: admin.firestore.Query = db
          .collection("publicCars")
          .where("yardUid", "==", sellerUid)
          .where("isPublished", "==", true)
          .limit(EXPOSURE_PAGE_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snapshot = await q.get();
        snapshot.docs.forEach((d) => allCarIds.push(d.id));
        if (snapshot.empty || snapshot.docs.length < EXPOSURE_PAGE_SIZE) break;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }
      const matchedCount = allCarIds.length;

      if (matchedCount === 0) {
        console.log(`[onAdminSellerExposureChangeUpdatePublicCars] No published cars for seller ${sellerUid}`);
        return;
      }

      let processedCount = 0;
      let errorsCount = 0;
      const chunks = chunkArray(allCarIds, EXPOSURE_CHUNK_SIZE);
      for (const chunk of chunks) {
        const tasks = chunk.map((carId) => async (): Promise<"ok" | "skipped"> => {
          const publicCarDoc = await db.collection("publicCars").doc(carId).get();
          if (!publicCarDoc.exists) return "skipped";
          const yardUid = publicCarDoc.data()?.yardUid || sellerUid;
          await upsertPublicCarFromMaster(yardUid, carId);
          return "ok";
        });
        const results = await runWithConcurrency(tasks, EXPOSURE_CONCURRENCY);
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value === "ok") processedCount++;
          else if (r.status === "rejected") errorsCount++;
        });
      }

      const durationMs = Date.now() - startMs;
      console.log(`[onAdminSellerExposureChangeUpdatePublicCars] sellerUid=${sellerUid} changedFields=[${changedFields.join(", ") || "n/a"}] matchedCount=${matchedCount} processedCount=${processedCount} errorsCount=${errorsCount} durationMs=${durationMs}`);
    } catch (error) {
      const durationMs = Date.now() - startMs;
      console.error(`[onAdminSellerExposureChangeUpdatePublicCars] Error for seller ${sellerUid}:`, { changedFields: changedFields.length ? changedFields : "n/a", durationMs, error });
    }
  });