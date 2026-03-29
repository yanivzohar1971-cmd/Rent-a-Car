import { useMemo } from 'react';
import { useTenant } from '../context/TenantContext';
import { resolveTenantBranding } from '../tenant/tenantBranding';

export function useTenantBranding() {
  const tenantState = useTenant();

  const branding = useMemo(
    () => resolveTenantBranding(tenantState.siteConfig, tenantState.tenantId),
    [tenantState.siteConfig, tenantState.tenantId],
  );

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
