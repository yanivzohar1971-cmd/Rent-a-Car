/**
 * CKAN (data.gov.il) API client for vehicle lookup by plate.
 * Uses VEHICLES_RESOURCE_ID from Firebase config or env.
 */

import * as functions from "firebase-functions";
import type { CkanVehicleRecord } from "./govSyncMapping";

const CKAN_BASE = "https://data.gov.il/api/3/action/datastore_search";
const CKAN_FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function getResourceId(): string {
  try {
    const fromConfig = functions.config().env?.vehicles_resource_id;
    if (fromConfig && typeof fromConfig === "string") return fromConfig;
  } catch {
    // ignore
  }
  const fromEnv = process.env.VEHICLES_RESOURCE_ID;
  if (fromEnv && typeof fromEnv === "string") return fromEnv;
  throw new Error("VEHICLES_RESOURCE_ID is not configured (env or functions.config().env.vehicles_resource_id)");
}

export interface CkanSearchResult {
  success: boolean;
  result?: {
    records?: CkanVehicleRecord[];
    total?: number;
  };
  error?: { __type?: string; message?: string };
}

/**
 * Fetch one vehicle record by plate (mispar_rechev).
 * Plate should be digits-only.
 */
export async function fetchVehicleByPlate(plateDigits: string): Promise<CkanVehicleRecord | null> {
  const resourceId = getResourceId();
  const url = new URL(CKAN_BASE);
  url.searchParams.set("resource_id", resourceId);
  url.searchParams.set("limit", "1");
  // filters: exact match on mispar_rechev (can be string or number in dataset)
  const filters = JSON.stringify({ mispar_rechev: plateDigits });
  url.searchParams.set("filters", filters);

  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), CKAN_FETCH_TIMEOUT_MS);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`CKAN_TIMEOUT (${CKAN_FETCH_TIMEOUT_MS}ms)`);
    }
    throw err;
  }

  if (!res.ok) {
    throw new Error(`CKAN request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as CkanSearchResult;
  if (data.error) {
    throw new Error(data.error.message || String(data.error));
  }
  if (!data.success || !data.result?.records?.length) {
    return null;
  }
  return data.result.records[0] as CkanVehicleRecord;
}
