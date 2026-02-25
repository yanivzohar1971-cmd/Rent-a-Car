/**
 * Shared internal logic: sync one vehicle by carId + plate.
 * Fetches from CKAN, maps, writes to users/{yardUid}/carSales/{carId} gov.* and sync meta.
 */

import * as admin from "firebase-admin";
import { fetchVehicleByPlate } from "./ckanClient";
import { mapCkanToGovMapped, type CkanVehicleRecord } from "./govSyncMapping";

const db = admin.firestore();

function normalizePlateToDigits(plate: string): string {
  return String(plate).replace(/\D/g, "");
}

export interface SyncVehicleResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

/**
 * Sync one vehicle: CKAN lookup by plate, then merge gov.* into car doc.
 * Uses merge: true. Sets gov.lastSyncAt, gov.syncStatus, gov.syncError.
 */
export async function syncVehicleInternal(
  yardUid: string,
  carId: string,
  plate: string
): Promise<SyncVehicleResult> {
  const plateDigits = normalizePlateToDigits(plate);
  if (!plateDigits) {
    return { ok: false, reason: "INVALID_PLATE", error: "Plate is empty or has no digits" };
  }

  const carRef = db.collection("users").doc(yardUid).collection("carSales").doc(carId);

  const t0 = Date.now();
  console.log(`[govSync] start carId=${carId} plate=${plateDigits}`);

  try {
    const t1 = Date.now();
    const record = await fetchVehicleByPlate(plateDigits);
    console.log(`[govSync] ckan done ms=${Date.now() - t1} found=${!!record}`);

    if (!record) {
      const t2 = Date.now();
      await carRef.set(
        {
          gov: {
            raw: null,
            mapped: null,
            lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
            syncStatus: "fail",
            syncError: "NOT_FOUND",
          },
        },
        { merge: true }
      );
      console.log(`[govSync] firestore set ms=${Date.now() - t2} totalMs=${Date.now() - t0}`);
      return { ok: false, reason: "NOT_FOUND" };
    }

    const mapped = mapCkanToGovMapped(record as CkanVehicleRecord);
    const t2 = Date.now();
    await carRef.set(
      {
        gov: {
          raw: record,
          mapped,
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          syncStatus: "ok",
          syncError: null,
        },
      },
      { merge: true }
    );
    console.log(`[govSync] firestore set ms=${Date.now() - t2} totalMs=${Date.now() - t0}`);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[govSync] fail totalMs=${Date.now() - t0} err=${message}`);
    await carRef.set(
      {
        gov: {
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          syncStatus: "fail",
          syncError: message,
        },
      },
      { merge: true }
    );
    return { ok: false, reason: "ERROR", error: message };
  }
}
