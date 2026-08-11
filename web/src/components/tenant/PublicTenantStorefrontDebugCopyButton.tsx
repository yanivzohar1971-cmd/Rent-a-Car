import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { subscribeFeatureFlags, type FeatureFlags } from '../../api/featureFlagsApi';
import { CopyJsonButton } from '../debug/CopyJsonButton';
import { normalizeBuilderSectionVisibility } from '../../tenant/builderSectionVisibility';
import { useTenantBranding } from '../../hooks/useTenantBranding';
import { useTenant } from '../../context/TenantContext';
import { useTenantInventoryScope } from '../../hooks/useTenantInventoryScope';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';

/** Bumped when envelope fields change — page payloads stay under getPagePayload(). */
export const PUBLIC_TENANT_STOREFRONT_DEBUG_SNAPSHOT_VERSION = 2;

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

  const getValue = useCallback(async () => {
    let pagePayload: Record<string, unknown> = {};
    try {
      pagePayload = getPagePayload() ?? {};
    } catch {
      pagePayload = { pagePayloadError: 'getPagePayload() threw' };
    }

    try {
      const yardUidRaw = scope.yardUid?.trim() || null;
      const missingScope = scope.scopeReason === 'missing-scope';
      const yardUidForDebug =
        missingScope || !yardUidRaw ? null : yardUidRaw;

      const layoutVis = normalizeBuilderSectionVisibility({
        homeSections: normalized.layout.homeSections,
        showFeaturedCars: normalized.layout.showFeaturedCars,
        showAbout: normalized.layout.showAbout,
        showBenefits: normalized.layout.showBenefits,
        showFinance: normalized.layout.showFinance,
        showTestimonials: normalized.layout.showTestimonials,
        showContact: normalized.layout.showContact,
        showMap: normalized.layout.showMap,
      });

      return {
        snapshotVersion: PUBLIC_TENANT_STOREFRONT_DEBUG_SNAPSHOT_VERSION,
        capturedAt: new Date().toISOString(),
        page,
        pathname: location.pathname,
        search: location.search || '',
        tenantId,
        tenantDomainStatus: domainStatus,
        tenantContextLoading: tenantCtx.isLoading,
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
          visibleSections: layoutVis.visibleSectionOrder,
          featuredCarIdsConfigured: normalized.layout.featuredCarIds.length,
          defaultSectionThemePresetId: normalized.layout.defaultSectionThemePresetId,
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
        ...pagePayload,
      };
    } catch {
      return {
        snapshotVersion: PUBLIC_TENANT_STOREFRONT_DEBUG_SNAPSHOT_VERSION,
        capturedAt: new Date().toISOString(),
        page,
        pathname: location.pathname,
        search: location.search || '',
        snapshotBuildError: 'debug_snapshot_failed',
        ...pagePayload,
      };
    }
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
    tenantCtx.isLoading,
    tenantCtx.error,
    scope.shouldScopeInventory,
    scope.scopeReason,
    scope.tenantId,
    scope.yardUid,
    scope.sellerUid,
    siteConfig,
    normalized.layout.homeSections,
    normalized.layout.showFeaturedCars,
    normalized.layout.showAbout,
    normalized.layout.showBenefits,
    normalized.layout.showFinance,
    normalized.layout.showTestimonials,
    normalized.layout.showContact,
    normalized.layout.showMap,
    normalized.layout.featuredCarIds.length,
    normalized.layout.defaultSectionThemePresetId,
    featureFlags,
    getPagePayload,
  ]);

  const enabled = featureFlags?.enablePublicTenantDebugButton === true;
  if (!enabled || !isTenantHost) {
    return null;
  }

  return (
    <CopyJsonButton
      mode="json"
      getValue={getValue}
      label="DEBUG"
      copiedLabel="Copied"
      size="sm"
      style={BTN_STYLE}
    />
  );
}
