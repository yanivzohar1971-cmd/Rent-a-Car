import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { subscribeFeatureFlags, type FeatureFlags } from '../../api/featureFlagsApi';
import { SmartCopyButton } from '../common/SmartCopyButton';
import { useTenantBranding } from '../../hooks/useTenantBranding';
import { useTenant } from '../../context/TenantContext';
import { useTenantInventoryScope } from '../../hooks/useTenantInventoryScope';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';

const BTN_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: '10px',
  left: '10px',
  zIndex: 50,
  fontSize: '11px',
  padding: '4px 8px',
  opacity: 0.92,
  background: '#334155',
  color: '#f8fafc',
  border: '1px solid #475569',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'system-ui, sans-serif',
};

export type PublicTenantStorefrontDebugPage = 'home' | 'cars' | 'carDetails';

export type PublicTenantStorefrontDebugCopyButtonProps = {
  page: PublicTenantStorefrontDebugPage;
  /** Merged into the snapshot at click time (no secrets / no giant payloads). */
  getPagePayload: () => Record<string, unknown>;
};

export function PublicTenantStorefrontDebugCopyButton({
  page,
  getPagePayload,
}: PublicTenantStorefrontDebugCopyButtonProps) {
  const location = useLocation();
  const { isTenantHost, tenantId, domainStatus } = useTenantBranding();
  const tenantCtx = useTenant();
  const scope = useTenantInventoryScope();
  const { normalized, siteConfig } = useTenantSiteConfig();
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags | null>(null);

  useEffect(() => {
    return subscribeFeatureFlags((f) => setFeatureFlags(f));
  }, []);

  const enabled = featureFlags?.enablePublicTenantDebugButton === true;
  if (!enabled || !isTenantHost) {
    return null;
  }

  const getValue = useCallback(async () => {
    const yardUidRaw = scope.yardUid?.trim() || null;
    const missingScope = scope.scopeReason === 'missing-scope';
    const yardUidForDebug =
      missingScope || !yardUidRaw ? null : yardUidRaw;

    return {
      snapshotVersion: 1,
      page,
      pathname: location.pathname,
      search: location.search || '',
      tenantId,
      tenantDomainStatus: domainStatus,
      isTenantHostByHostname: tenantCtx.isTenantHostByHostname,
      hostnameYardUid: tenantCtx.hostnameYardUid,
      inventoryScope: {
        shouldScopeInventory: scope.shouldScopeInventory,
        scopeReason: scope.scopeReason,
        tenantId: scope.tenantId,
        yardUid: yardUidForDebug,
        sellerUid: scope.sellerUid?.trim() || null,
        hasYardUid: Boolean(yardUidForDebug),
        hasSellerUid: Boolean(scope.sellerUid?.trim()),
      },
      tenantLifecycle: {
        tenantPublicSiteSuspended: tenantCtx.tenantPublicSiteSuspended,
        tenantSuspendReason: tenantCtx.tenantSuspendReason,
        tenantLifecycleLoading: tenantCtx.tenantLifecycleLoading,
      },
      siteConfigSummary: {
        hasSiteConfig: Boolean(siteConfig),
        featuredCarIdsConfigured: normalized.layout.featuredCarIds.length,
        tenantContextError: tenantCtx.error,
      },
      debugFeatureFlags: featureFlags
        ? {
            enablePublicTenantDebugButton: featureFlags.enablePublicTenantDebugButton,
            enablePublicCarDebugButtonCards: featureFlags.enablePublicCarDebugButtonCards,
            enablePublicCarDebugButtonCarDetails: featureFlags.enablePublicCarDebugButtonCarDetails,
            enablePublicCarDebugOverlayCards: featureFlags.enablePublicCarDebugOverlayCards,
          }
        : null,
      ...getPagePayload(),
    };
  }, [
    page,
    location.pathname,
    location.search,
    tenantId,
    domainStatus,
    tenantCtx.isTenantHostByHostname,
    tenantCtx.hostnameYardUid,
    tenantCtx.tenantPublicSiteSuspended,
    tenantCtx.tenantSuspendReason,
    tenantCtx.tenantLifecycleLoading,
    tenantCtx.error,
    scope.shouldScopeInventory,
    scope.scopeReason,
    scope.tenantId,
    scope.yardUid,
    scope.sellerUid,
    siteConfig,
    normalized.layout.featuredCarIds.length,
    featureFlags,
    getPagePayload,
  ]);

  return (
    <SmartCopyButton
      mode="json"
      getValue={getValue}
      label="DEBUG"
      copiedLabel="Copied"
      size="sm"
      style={BTN_STYLE}
    />
  );
}
