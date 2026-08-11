import { useMemo } from 'react';
import { useTenantBranding } from './useTenantBranding';
import { useTenant } from '../context/TenantContext';
import { resolveTenantInventoryScope } from '../tenant/tenantInventoryScope';

export function useTenantInventoryScope() {
  const tenant = useTenantBranding();
  const tenantContext = useTenant();

  return useMemo(
    () =>
      resolveTenantInventoryScope(
        tenant.siteConfig,
        tenant.tenantId,
        tenant.isTenantHost || tenantContext.isTenantHostByHostname,
        tenantContext.hostnameYardUid,
      ),
    [tenant.siteConfig, tenant.tenantId, tenant.isTenantHost, tenantContext.isTenantHostByHostname, tenantContext.hostnameYardUid],
  );
}
