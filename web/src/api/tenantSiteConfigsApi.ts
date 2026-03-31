/**
 * Firestore document `tenantSiteConfigs/{tenantId}` — loose buckets.
 * External JSON must be coerced via `tenantSiteConfigImport.ts` before merge writes.
 * @see docs/TENANT_SITE_CONFIG_IMPORT_CONTRACT.md
 */
import { collection, db, doc, getDocFromServer } from '../firebase/firebaseClient';
import { fsSetDoc } from './firestoreWrite';
import type { FieldValue } from 'firebase/firestore';

export interface TenantSiteConfig {
  tenantId: string;
  branding?: Record<string, unknown>;
  content?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  dataScope?: Record<string, unknown>;
}

export async function getTenantSiteConfigByTenantId(tenantIdInput: string): Promise<TenantSiteConfig | null> {
  const tenantId = tenantIdInput.trim();
  if (!tenantId) return null;

  const tenantSiteConfigsRef = collection(db, 'tenantSiteConfigs');
  const tenantConfigRef = doc(tenantSiteConfigsRef, tenantId);
  const snap = await getDocFromServer(tenantConfigRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data() as Record<string, unknown>;

  return {
    tenantId,
    branding: typeof data.branding === 'object' && data.branding !== null ? (data.branding as Record<string, unknown>) : undefined,
    content: typeof data.content === 'object' && data.content !== null ? (data.content as Record<string, unknown>) : undefined,
    contact: typeof data.contact === 'object' && data.contact !== null ? (data.contact as Record<string, unknown>) : undefined,
    seo: typeof data.seo === 'object' && data.seo !== null ? (data.seo as Record<string, unknown>) : undefined,
    layout: typeof data.layout === 'object' && data.layout !== null ? (data.layout as Record<string, unknown>) : undefined,
    dataScope: typeof data.dataScope === 'object' && data.dataScope !== null ? (data.dataScope as Record<string, unknown>) : undefined,
  };
}

export interface TenantSiteConfigWritePayload {
  branding?: Record<string, unknown> | FieldValue;
  content?: Record<string, unknown> | FieldValue;
  contact?: Record<string, unknown> | FieldValue;
  seo?: Record<string, unknown> | FieldValue;
  layout?: Record<string, unknown> | FieldValue;
  dataScope?: Record<string, unknown> | FieldValue;
}

/**
 * Upserts tenantSiteConfigs/{tenantId}. Uses merge so partial top-level keys from other writers are preserved.
 */
export async function upsertTenantSiteConfig(tenantIdInput: string, payload: TenantSiteConfigWritePayload): Promise<void> {
  const tenantId = tenantIdInput.trim();
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const tenantSiteConfigsRef = collection(db, 'tenantSiteConfigs');
  const tenantConfigRef = doc(tenantSiteConfigsRef, tenantId);
  await fsSetDoc(tenantConfigRef, { ...payload }, { merge: true });
}
