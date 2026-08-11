import { useMemo } from 'react';
import { useTenant } from '../context/TenantContext';
import { normalizeTenantSiteConfig, type NormalizedTenantSiteConfig } from '../tenant/tenantSiteConfig';
import { finalizeTenantRuntimeBranding, tenantBrandingFromNormalized, type TenantBrandingModel } from '../tenant/tenantBranding';

export function useTenantSiteConfig(): {
  isTenantHost: boolean;
  tenantId: string | null;
  siteConfig: ReturnType<typeof useTenant>['siteConfig'];
  normalized: NormalizedTenantSiteConfig;
  branding: TenantBrandingModel;
  isLoading: boolean;
  error: string | null;
} {
  const tenantState = useTenant();
  const isTenantHost = tenantState.domainStatus === 'resolved' && !!tenantState.tenantId;

  const normalized = useMemo(
    () => normalizeTenantSiteConfig(tenantState.siteConfig, tenantState.tenantId),
    [tenantState.siteConfig, tenantState.tenantId],
  );

  const branding = useMemo((): TenantBrandingModel => {
    const base = tenantBrandingFromNormalized(normalized);
    return finalizeTenantRuntimeBranding(base, tenantState.yardPublicProfile, tenantState.tenantRecord?.name ?? null);
  }, [normalized, tenantState.yardPublicProfile, tenantState.tenantRecord?.name]);

  return {
    isTenantHost,
    tenantId: tenantState.tenantId,
    siteConfig: tenantState.siteConfig,
    normalized,
    branding,
    isLoading: tenantState.isLoading,
    error: tenantState.error,
  };
}
