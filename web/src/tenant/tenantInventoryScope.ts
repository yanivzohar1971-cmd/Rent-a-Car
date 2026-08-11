import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';

export interface TenantInventoryScope {
  tenantId: string | null;
  yardUid: string | null;
  sellerUid: string | null;
  isTenantHost: boolean;
  shouldScopeInventory: boolean;
  scopeReason: 'tenant-yard' | 'tenant-seller' | 'hostname-map' | 'no-tenant' | 'missing-scope';
}

/** Sentinel stored on scope when tenant is active but inventory keys are missing — never a real Firestore yardUid. */
export const TENANT_INVENTORY_SCOPE_SENTINEL_YARD_UID = '__tenant_scope_missing__';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function resolveTenantInventoryScope(
  siteConfig: TenantSiteConfig | null,
  tenantId: string | null,
  isTenantHost: boolean,
  hostnameYardUid: string | null = null,
): TenantInventoryScope {
  if (!isTenantHost || !tenantId) {
    return {
      tenantId: null,
      yardUid: null,
      sellerUid: null,
      isTenantHost: false,
      shouldScopeInventory: false,
      scopeReason: 'no-tenant',
    };
  }

  const root = asRecord(siteConfig);
  const dataScope = asRecord(root.dataScope);

  const yardUid =
    asTrimmedString(dataScope.yardId) ??
    asTrimmedString(dataScope.yardUid) ??
    asTrimmedString(dataScope.yard_id) ??
    asTrimmedString(dataScope.yardUID);
  const sellerUid =
    asTrimmedString(dataScope.sellerId) ??
    asTrimmedString(dataScope.sellerUid) ??
    asTrimmedString(dataScope.seller_id) ??
    asTrimmedString(dataScope.sellerUID);

  if (yardUid) {
    return {
      tenantId,
      yardUid,
      sellerUid,
      isTenantHost: true,
      shouldScopeInventory: true,
      scopeReason: 'tenant-yard',
    };
  }

  if (sellerUid) {
    return {
      tenantId,
      yardUid: null,
      sellerUid,
      isTenantHost: true,
      shouldScopeInventory: true,
      scopeReason: 'tenant-seller',
    };
  }

  if (hostnameYardUid) {
    return {
      tenantId,
      yardUid: hostnameYardUid,
      sellerUid: null,
      isTenantHost: true,
      shouldScopeInventory: true,
      scopeReason: 'hostname-map',
    };
  }

  // Fail-safe: tenant host without configured scope must not fall back to marketplace inventory.
  return {
    tenantId,
    yardUid: TENANT_INVENTORY_SCOPE_SENTINEL_YARD_UID,
    sellerUid: null,
    isTenantHost: true,
    shouldScopeInventory: true,
    scopeReason: 'missing-scope',
  };
}
