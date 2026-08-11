/**
 * Ministry of Transport (gov.il) sync API - callables and job types.
 * syncVehicleReliable: CKAN-only; no Cloud Function calls from the web app.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
import type { Unsubscribe } from 'firebase/firestore';
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';

const CKAN_BASE = 'https://data.gov.il/api/3/action/datastore_search';
const CKAN_RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3';
const CKAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ckanCache = new Map<string, { ts: number; data: CkanFetchResult }>();

function buildCkanUrl(plateDigits: string): string {
  const filters = encodeURIComponent(JSON.stringify({ mispar_rechev: plateDigits }));
  return `${CKAN_BASE}?resource_id=${CKAN_RESOURCE_ID}&filters=${filters}&limit=1`;
}

export interface CkanVehicleRecord {
  mispar_rechev?: string | number | null;
  tozeret_cd?: string | number | null;
  tozeret_nm?: string | null;
  degem_cd?: string | number | null;
  degem_nm?: string | null;
  sug_degem?: string | null;
  kinuy_mishari?: string | null;
  ramat_gimur?: string | null;
  ramat_eivzur_betihuty?: string | null;
  kvutzat_zihum?: string | null;
  shnat_yitzur?: string | number | null;
  baalut?: string | null;
  tokef_dt?: string | null;
  mivchan_acharon_dt?: string | null;
  tzeva_rechev?: string | null;
  [key: string]: unknown;
}

export interface GovMappedRecord {
  plate?: string | null;
  manufacturerCode?: string | number | null;
  manufacturerName?: string | null;
  modelCode?: string | number | null;
  modelNumber?: string | null;
  modelType?: string | null;
  commercialName?: string | null;
  trimLevel?: string | null;
  safetyLevel?: string | null;
  pollutionGroup?: string | null;
  year?: number | null;
  ownership?: string | null;
  licenseValidUntil?: string | null;
  lastTestDate?: string | null;
  color?: string | null;
}

function mapCkanToGovMappedClient(record: CkanVehicleRecord): GovMappedRecord {
  const num = (v: string | number | null | undefined): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: string | number | null | undefined): string | null =>
    v != null && String(v).trim() !== '' ? String(v).trim() : null;
  return {
    plate: str(record.mispar_rechev),
    manufacturerCode: num(record.tozeret_cd) ?? str(record.tozeret_cd),
    manufacturerName: str(record.tozeret_nm),
    modelCode: num(record.degem_cd) ?? str(record.degem_cd),
    modelNumber: str(record.degem_nm),
    modelType: str(record.sug_degem),
    commercialName: str(record.kinuy_mishari),
    trimLevel: str(record.ramat_gimur),
    safetyLevel: str(record.ramat_eivzur_betihuty),
    pollutionGroup: str(record.kvutzat_zihum),
    year: num(record.shnat_yitzur),
    ownership: str(record.baalut),
    licenseValidUntil: str(record.tokef_dt),
    lastTestDate: str(record.mivchan_acharon_dt),
    color: str(record.tzeva_rechev),
  };
}

interface CkanFetchResultOk {
  ok: true;
  record: CkanVehicleRecord;
  raw: unknown;
}
interface CkanFetchResultFail {
  ok: false;
  error: { name: string; message: string };
  raw?: unknown;
}
type CkanFetchResult = CkanFetchResultOk | CkanFetchResultFail;

async function fetchCkanVehicleByPlate(plateDigits: string): Promise<CkanFetchResult> {
  const cached = ckanCache.get(plateDigits);
  if (cached && Date.now() - cached.ts < CKAN_CACHE_TTL_MS) {
    return cached.data;
  }
  const t0 = Date.now();
  const url = buildCkanUrl(plateDigits);
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    const json = (await res.json()) as { success?: boolean; result?: { records?: unknown[] }; error?: unknown };
    const ms = Date.now() - t0;
    if (json?.success === true && Array.isArray(json?.result?.records)) {
      const record = json.result.records[0] as CkanVehicleRecord | undefined;
      const out: CkanFetchResultOk = { ok: true, record: record ?? ({} as CkanVehicleRecord), raw: json };
      ckanCache.set(plateDigits, { ts: Date.now(), data: out });
      if (import.meta.env.DEV) console.log('[GOV_SYNC] CKAN fetch ok', { plateDigits, ms, hasRecord: !!record });
      return out;
    }
    const out: CkanFetchResultFail = {
      ok: false,
      error: { name: 'CKAN', message: json?.error ? String(json.error) : 'No records' },
      raw: json,
    };
    ckanCache.set(plateDigits, { ts: Date.now(), data: out });
    return out;
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    const message = err instanceof Error ? err.message : String(err);
    if (import.meta.env.DEV) console.warn('[GOV_SYNC] CKAN fetch error', { plateDigits, name, message, ms: Date.now() - t0 });
    return { ok: false, error: { name, message }, raw: undefined };
  }
}

export interface SyncVehicleReliableResult {
  ok: boolean;
  reason?: string;
  error?: string;
  source: 'ckan';
  mapped?: GovMappedRecord;
  raw?: unknown;
}

/** CKAN-only sync. No Cloud Function calls. */
export async function syncVehicleReliable(params: {
  plateDigits: string;
  carId?: string;
}): Promise<SyncVehicleReliableResult> {
  const { plateDigits } = params;

  const ckanResult = await fetchCkanVehicleByPlate(plateDigits);

  if (ckanResult.ok && ckanResult.record && Object.keys(ckanResult.record).length > 0) {
    const mapped = mapCkanToGovMappedClient(ckanResult.record);
    console.log('[GOV_SYNC] reliable sync done', { plateDigits, source: 'ckan', reason: 'ckan_primary' });
    return {
      ok: true,
      source: 'ckan',
      reason: 'ckan_primary',
      mapped,
      raw: ckanResult.raw,
    };
  }

  // CKAN failed (no record or error) — return failure, no cloud call
  console.log('[GOV_SYNC] reliable sync done', { plateDigits, source: 'ckan', ok: false, reason: ckanResult.ok ? 'NOT_FOUND' : 'ERROR' });
  return {
    ok: false,
    source: 'ckan',
    reason: ckanResult.ok ? 'NOT_FOUND' : 'ERROR',
    error: !ckanResult.ok ? ckanResult.error.message : undefined,
    raw: ckanResult.ok ? ckanResult.raw : undefined,
  };
}

/** URL used for CKAN sync (for debugger display). Returns exact data.gov.il datastore_search URL. */
export function getCkanSyncRequestUrl(plateDigits: string): string {
  return buildCkanUrl(plateDigits);
}

export type GovSyncMode = 'ALL' | 'PUBLISHED' | 'STATUS';

export interface SyncVehicleByPlateInput {
  plate: string;
  carId?: string;
}

export interface SyncVehicleByPlateResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

export interface StartGovSyncJobInput {
  mode: GovSyncMode;
  status?: string;
}

export interface StartGovSyncJobResult {
  ok: boolean;
  jobId?: string;
}

export interface GovSyncJobDoc {
  createdAt?: { toDate: () => Date };
  createdBy?: string;
  mode?: GovSyncMode;
  statusFilter?: string | null;
  yardUid?: string;
  total: number;
  completed: number;
  successCount: number;
  failCount: number;
  currentPlate: string | null;
  state: 'pending' | 'running' | 'done' | 'failed';
  lastError?: string;
}

export interface GovSyncResultDoc {
  plate: string;
  carId: string;
  ok: boolean;
  reason?: string | null;
  error?: string | null;
  finishedAt?: { toDate: () => Date };
}

const startGovSyncJobCallable = httpsCallable<StartGovSyncJobInput, StartGovSyncJobResult>(
  functions,
  'startGovSyncJob'
);

export async function startGovSyncJob(mode: GovSyncMode, status?: string): Promise<StartGovSyncJobResult> {
  const res = await startGovSyncJobCallable({ mode, status });
  return res.data;
}

export function subscribeGovSyncJob(
  jobId: string,
  onJob: (data: GovSyncJobDoc) => void
): Unsubscribe {
  const ref = doc(db, 'govSyncJobs', jobId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const d = snap.data() as GovSyncJobDoc;
      if (d.createdAt && typeof (d.createdAt as any).toDate === 'function') {
        (d as any).createdAt = (d.createdAt as any);
      }
      onJob(d);
    }
  });
}

export async function fetchGovSyncJobRecentResults(jobId: string, limitCount: number = 10): Promise<GovSyncResultDoc[]> {
  const resultsRef = collection(db, 'govSyncJobs', jobId, 'results');
  const q = query(resultsRef, orderBy('finishedAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as GovSyncResultDoc);
}

export function subscribeGovSyncJobResults(
  jobId: string,
  limitCount: number,
  onResults: (results: GovSyncResultDoc[]) => void
): Unsubscribe {
  const resultsRef = collection(db, 'govSyncJobs', jobId, 'results');
  const q = query(resultsRef, orderBy('finishedAt', 'desc'), limit(limitCount));
  return onSnapshot(q, (snap) => {
    const results = snap.docs.map((d) => d.data() as GovSyncResultDoc);
    onResults(results);
  });
}
