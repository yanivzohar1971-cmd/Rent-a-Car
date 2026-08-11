import {
  collection,
  db,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  Timestamp,
} from '../firebase/firebaseClient';
import { fsSetDoc, fsUpdateDoc } from './firestoreWrite';
import { getTenantSiteConfigByTenantId, upsertTenantSiteConfig } from './tenantSiteConfigsApi';
import { createDefaultTenantSiteConfig } from '../tenant/defaultTenantSiteConfig';

/** Public-safe projection for storefront lifecycle banners (no name/plan/createdAt). */
export const TENANT_PUBLIC_STATE_COLLECTION = 'tenantPublicState';

export type TenantPlan = 'basic' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'trial' | 'blocked';

export interface Tenant {
  id: string;
  name: string;
  createdAt: Timestamp | null;
  status: TenantStatus;
  plan: TenantPlan;
  trialEndsAt: Timestamp | null;
  subscriptionEndsAt: Timestamp | null;
  isBlocked: boolean;
}

export type TenantPublicSuspendReason = 'blocked' | 'trial_expired' | 'subscription_expired';

/** Soft product limit — UI-only hints (see AdminTenantsPage / builder warnings). */
export const BASIC_PLAN_MAX_CARS = 20;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asTimestamp(value: unknown): Timestamp | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value !== null && typeof (value as Timestamp).toMillis === 'function') {
    return value as Timestamp;
  }
  return null;
}

export function timestampToMillis(ts: Timestamp | null): number | null {
  if (!ts) return null;
  try {
    return ts.toMillis();
  } catch {
    return null;
  }
}

export function parseTenantDoc(tenantId: string, data: Record<string, unknown> | undefined): Tenant {
  const statusRaw = asTrimmedString(data?.status);
  const planRaw = asTrimmedString(data?.plan);
  const status: TenantStatus =
    statusRaw === 'active' || statusRaw === 'trial' || statusRaw === 'blocked' ? statusRaw : 'active';
  const plan: TenantPlan =
    planRaw === 'basic' || planRaw === 'pro' || planRaw === 'enterprise' ? planRaw : 'basic';

  return {
    id: tenantId,
    name: asTrimmedString(data?.name) || tenantId,
    createdAt: asTimestamp(data?.createdAt),
    status,
    plan,
    trialEndsAt: asTimestamp(data?.trialEndsAt),
    subscriptionEndsAt: asTimestamp(data?.subscriptionEndsAt),
    isBlocked: data?.isBlocked === true || status === 'blocked',
  };
}

export function isTrialActive(record: Tenant | null, nowMs: number): boolean {
  if (!record || record.status !== 'trial') return false;
  const end = timestampToMillis(record.trialEndsAt);
  if (end === null) return true;
  return nowMs <= end;
}

export function isSubscriptionActive(record: Tenant | null, nowMs: number): boolean {
  if (!record || record.status !== 'active') return false;
  const end = timestampToMillis(record.subscriptionEndsAt);
  if (end === null) return true;
  return nowMs <= end;
}

export function computeTenantPublicSiteSuspended(
  record: Tenant | null,
  nowMs: number,
): { suspended: boolean; reason: TenantPublicSuspendReason | null } {
  if (!record) {
    return { suspended: false, reason: null };
  }
  if (record.isBlocked || record.status === 'blocked') {
    return { suspended: true, reason: 'blocked' };
  }
  if (record.status === 'trial') {
    const end = timestampToMillis(record.trialEndsAt);
    if (end !== null && nowMs > end) {
      return { suspended: true, reason: 'trial_expired' };
    }
    return { suspended: false, reason: null };
  }
  if (record.status === 'active') {
    const end = timestampToMillis(record.subscriptionEndsAt);
    if (end !== null && nowMs > end) {
      return { suspended: true, reason: 'subscription_expired' };
    }
    return { suspended: false, reason: null };
  }
  return { suspended: false, reason: null };
}

export function computeTenantTrialEndingSoon(record: Tenant | null, nowMs: number, withinMs: number): boolean {
  if (!record || record.status !== 'trial') return false;
  const end = timestampToMillis(record.trialEndsAt);
  if (end === null) return false;
  const left = end - nowMs;
  return left > 0 && left <= withinMs;
}

export async function getTenantById(tenantIdInput: string): Promise<Tenant | null> {
  const tenantId = tenantIdInput.trim();
  if (!tenantId) return null;

  const ref = doc(collection(db, 'tenants'), tenantId);
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return null;
  return parseTenantDoc(tenantId, snap.data() as Record<string, unknown>);
}

/** Storefront (anonymous) lifecycle read — Firestore rules allow only this collection publicly, not full `tenants`. */
export async function getTenantPublicLifecycleForStorefront(tenantIdInput: string): Promise<Tenant | null> {
  const tenantId = tenantIdInput.trim();
  if (!tenantId) return null;

  const ref = doc(collection(db, TENANT_PUBLIC_STATE_COLLECTION), tenantId);
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) return null;
  return parseTenantDoc(tenantId, snap.data() as Record<string, unknown>);
}

export async function writeTenantPublicLifecycleFromTenant(tenant: Tenant): Promise<void> {
  await fsSetDoc(
    doc(collection(db, TENANT_PUBLIC_STATE_COLLECTION), tenant.id),
    {
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
      isBlocked: tenant.isBlocked,
    },
    { merge: true },
  );
}

/** Admin-only backfill: push canonical tenant lifecycle fields to public projection (uses already-loaded rows). */
export async function syncTenantPublicLifecycleFromRows(tenants: Tenant[]): Promise<void> {
  await Promise.all(tenants.map((t) => writeTenantPublicLifecycleFromTenant(t)));
}

export async function listTenants(): Promise<Tenant[]> {
  const snapshot = await getDocsFromServer(collection(db, 'tenants'));
  const rows: Tenant[] = [];
  for (const s of snapshot.docs) {
    rows.push(parseTenantDoc(s.id, s.data() as Record<string, unknown>));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return rows;
}

export interface CreateTenantInput {
  name: string;
  plan?: TenantPlan;
  status?: TenantStatus;
  trialDays?: number;
  subscriptionEndsAt?: Date | null;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Creates tenants/{id}. If tenantSiteConfigs/{id} is missing, seeds a full default builder config (idempotent).
 * Optional domain mapping is done by caller.
 */
export async function createTenantRecord(input: CreateTenantInput): Promise<{ tenantId: string }> {
  const name = input.name.trim();
  if (!name) throw new Error('שם הלקוח נדרש');

  const tenantRef = doc(collection(db, 'tenants'));
  const tenantId = tenantRef.id;
  const plan = input.plan ?? 'basic';
  const status = input.status ?? 'trial';
  const now = new Date();
  const trialDays = typeof input.trialDays === 'number' && input.trialDays > 0 ? input.trialDays : 14;

  const trialEndsAtTs = status === 'trial' ? Timestamp.fromDate(addDays(now, trialDays)) : null;
  const subscriptionEndsAtTs =
    status === 'active' && input.subscriptionEndsAt ? Timestamp.fromDate(input.subscriptionEndsAt) : null;

  const payload: Record<string, unknown> = {
    name,
    createdAt: serverTimestamp(),
    status,
    plan,
    isBlocked: status === 'blocked',
  };

  if (status === 'trial') {
    payload.trialEndsAt = trialEndsAtTs;
  }
  if (status === 'active' && input.subscriptionEndsAt) {
    payload.subscriptionEndsAt = subscriptionEndsAtTs;
  }

  await fsSetDoc(tenantRef, payload);

  const existingSiteConfig = await getTenantSiteConfigByTenantId(tenantId);
  if (!existingSiteConfig) {
    await upsertTenantSiteConfig(tenantId, createDefaultTenantSiteConfig(tenantId, name));
  }

  await writeTenantPublicLifecycleFromTenant({
    id: tenantId,
    name,
    createdAt: null,
    status,
    plan,
    trialEndsAt: trialEndsAtTs,
    subscriptionEndsAt: subscriptionEndsAtTs,
    isBlocked: status === 'blocked',
  });

  return { tenantId };
}

export interface UpdateTenantInput {
  name?: string;
  plan?: TenantPlan;
  status?: TenantStatus;
  trialEndsAt?: Date | null;
  subscriptionEndsAt?: Date | null;
  isBlocked?: boolean;
}

export async function updateTenantRecord(tenantIdInput: string, input: UpdateTenantInput): Promise<void> {
  const tenantId = tenantIdInput.trim();
  if (!tenantId) throw new Error('tenantId נדרש');

  const ref = doc(collection(db, 'tenants'), tenantId);
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('שם לא יכול להיות ריק');
    patch.name = n;
  }
  if (input.plan !== undefined) patch.plan = input.plan;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.isBlocked === undefined) {
      patch.isBlocked = input.status === 'blocked';
    }
  }
  if (input.isBlocked !== undefined) patch.isBlocked = input.isBlocked;

  if (input.trialEndsAt !== undefined) {
    patch.trialEndsAt = input.trialEndsAt ? Timestamp.fromDate(input.trialEndsAt) : null;
  }
  if (input.subscriptionEndsAt !== undefined) {
    patch.subscriptionEndsAt = input.subscriptionEndsAt ? Timestamp.fromDate(input.subscriptionEndsAt) : null;
  }

  if (Object.keys(patch).length === 0) return;
  await fsUpdateDoc(ref, patch);

  const next = await getTenantById(tenantId);
  if (next) {
    await writeTenantPublicLifecycleFromTenant(next);
  }
}

export async function extendTenantTrial(tenantIdInput: string, extraDays: number): Promise<void> {
  const tenantId = tenantIdInput.trim();
  if (!tenantId) throw new Error('tenantId נדרש');
  const days = Math.max(1, Math.min(extraDays || 7, 365));

  const current = await getTenantById(tenantId);
  if (!current) throw new Error('הלקוח לא נמצא');

  const now = Date.now();
  const prevEndMs = timestampToMillis(current.trialEndsAt);
  const base = prevEndMs !== null && prevEndMs > now ? prevEndMs : now;
  const next = new Date(base + days * 24 * 60 * 60 * 1000);

  await fsUpdateDoc(doc(collection(db, 'tenants'), tenantId), {
    status: 'trial',
    trialEndsAt: Timestamp.fromDate(next),
    isBlocked: false,
  });

  const refreshed = await getTenantById(tenantId);
  if (refreshed) {
    await writeTenantPublicLifecycleFromTenant(refreshed);
  }
}
