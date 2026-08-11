/**
 * Shared job runner for gov sync: enumerate cars and process with concurrency limit.
 * Used by the Firestore trigger onGovSyncJobCreated.
 */

import * as admin from "firebase-admin";
import { syncVehicleInternal } from "./syncVehicleInternal";

const db = admin.firestore();
const GOV_SYNC_CONCURRENCY = 3;

export type CarEntry = { id: string; plate: string };

export async function runGovSyncJob(
  jobRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>,
  jobId: string,
  yardUid: string,
  mode: string,
  statusFilter: string | null
): Promise<void> {
  const carSalesRef = db.collection("users").doc(yardUid).collection("carSales");
  const snapshot = await carSalesRef.get();

  const cars: CarEntry[] = [];

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const plate = (d.licensePlatePartial || d.licensePlate || "").toString().trim();
    const plateDigits = plate.replace(/\D/g, "");
    if (!plateDigits) continue;

    if (mode === "PUBLISHED") {
      const st = String(d.status || d.publicationStatus || "").toLowerCase();
      if (st !== "published" && st !== "publish") continue;
    }
    if (mode === "STATUS" && statusFilter) {
      const want = String(statusFilter).toUpperCase();
      const wantNorm = want === "HIDDEN" ? "archived" : want.toLowerCase();
      const st = String(d.status || d.publicationStatus || "").toLowerCase();
      const stNorm = st === "publish" ? "published" : st;
      if (stNorm !== wantNorm) continue;
    }

    cars.push({ id: doc.id, plate: plateDigits });
  }

  await jobRef.update({
    total: cars.length,
    state: cars.length === 0 ? "done" : "running",
    currentPlate: cars.length === 0 ? null : undefined,
  });

  if (cars.length === 0) return;

  const resultsRef = jobRef.collection("results");
  let completed = 0;
  let successCount = 0;
  let failCount = 0;

  const run = async (car: CarEntry) => {
    await jobRef.update({ currentPlate: car.plate });

    const result = await syncVehicleInternal(yardUid, car.id, car.plate);

    completed += 1;
    if (result.ok) successCount += 1;
    else failCount += 1;

    await resultsRef.add({
      plate: car.plate,
      carId: car.id,
      ok: result.ok,
      reason: result.reason || null,
      error: result.error || null,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await jobRef.update({
      completed,
      successCount,
      failCount,
      currentPlate: completed >= cars.length ? null : car.plate,
      state: completed >= cars.length ? "done" : "running",
    });
  };

  let index = 0;
  async function next(): Promise<void> {
    if (index >= cars.length) return;
    const car = cars[index++];
    await run(car);
    await next();
  }

  const workers = Array.from({ length: Math.min(GOV_SYNC_CONCURRENCY, cars.length) }, () => next());
  await Promise.all(workers);
}
