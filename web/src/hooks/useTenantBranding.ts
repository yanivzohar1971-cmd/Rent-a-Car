import { useMemo } from 'react';
import { useTenant } from '../context/TenantContext';
import { finalizeTenantRuntimeBranding, resolveTenantBranding } from '../tenant/tenantBranding';

export function useTenantBranding() {
  const tenantState = useTenant();

  const branding = useMemo(() => {
    const base = resolveTenantBranding(tenantState.siteConfig, tenantState.tenantId);
    return finalizeTenantRuntimeBranding(base, tenantState.yardPublicProfile, tenantState.tenantRecord?.name ?? null);
  }, [
    tenantState.siteConfig,
    tenantState.tenantId,
    tenantState.yardPublicProfile,
    tenantState.tenantRecord?.name,
  ]);

  return {
    isTenantHost: tenantState.domainStatus === 'resolved' && !!tenantState.tenantId,
    domainStatus: tenantState.domainStatus,
    tenantId: tenantState.tenantId,
    siteConfig: tenantState.siteConfig,
    branding,
    isLoading: tenantState.isLoading,
    error: tenantState.error,
  };
}
