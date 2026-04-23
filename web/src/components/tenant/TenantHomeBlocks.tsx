import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchPublicCars, type PublicCar } from '../../api/publicCarsApi';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';
import { useTenantInventoryScope } from '../../hooks/useTenantInventoryScope';
import { useTenant } from '../../context/TenantContext';
import { getTenantHomepageSelectionMeta, tenantHomepageBuilderSummaryHe } from '../../tenant/tenantHomepageCars';
import {
  remapInternalHrefFromGlobalCarsToTenantPreview,
  tenantStorefrontCarDetailPath,
  tenantStorefrontCarsListPath,
} from '../../tenant/tenantStorefrontPaths';
import TenantHomeSectionsView from './TenantHomeSectionsView';
import { PublicTenantStorefrontDebugCopyButton } from './PublicTenantStorefrontDebugCopyButton';

export default function TenantHomeBlocks() {
  const location = useLocation();
  const { isTenantHost, normalized, branding } = useTenantSiteConfig();
  const scope = useTenantInventoryScope();
  const { tenantPublicSiteSuspended } = useTenant();
  const [cars, setCars] = useState<PublicCar[]>([]);
  const lastScopedFetchCarsRef = useRef<PublicCar[] | null>(null);

  const tenantStorefrontInAppPaths = useMemo(
    () => ({
      carsListPath: tenantStorefrontCarsListPath(location.pathname),
      remapListingHref: (href: string) => remapInternalHrefFromGlobalCarsToTenantPreview(location.pathname, href),
      carDetailPath: (carId: string) => tenantStorefrontCarDetailPath(location.pathname, carId),
    }),
    [location.pathname],
  );

  /** Re-fetch when legacy id list changes; new-flow carousel flags refresh on navigation/remount (same scoped fetch). */
  const featuredKey = useMemo(() => normalized.layout.featuredCarIds.join('\u001f'), [normalized.layout.featuredCarIds]);

  useEffect(() => {
    if (!isTenantHost) return;
    if (tenantPublicSiteSuspended) {
      lastScopedFetchCarsRef.current = null;
      setCars([]);
      return;
    }

    let isCancelled = false;
    fetchPublicCars(
      {},
      scope.shouldScopeInventory
        ? {
            tenantId: scope.tenantId,
            yardUid: scope.yardUid,
            sellerUid: scope.sellerUid,
          }
        : undefined,
    )
      .then((result) => {
        if (isCancelled) return;
        lastScopedFetchCarsRef.current = result;
        setCars(getTenantHomepageSelectionMeta(result, normalized.layout.featuredCarIds).cars);
      })
      .catch(() => {
        if (isCancelled) return;
        lastScopedFetchCarsRef.current = null;
        setCars([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [isTenantHost, scope, tenantPublicSiteSuspended, featuredKey]);

  if (!isTenantHost) return null;

  const scopeMissing = scope.isTenantHost && scope.scopeReason === 'missing-scope';

  const getHomeDebugPayload = useCallback((): Record<string, unknown> => {
    const raw = lastScopedFetchCarsRef.current;
    const featuredIds = normalized.layout.featuredCarIds;
    const meta = raw ? getTenantHomepageSelectionMeta(raw, featuredIds) : null;
    return {
      home: {
        publicCarsFetchedCount: raw?.length ?? null,
        featuredCarIdsConfigured: featuredIds.length,
        homepageSelectionMode: meta?.mode ?? (raw === null ? 'fetch_snapshot_not_ready' : 'none'),
        newFlowEligibleCount: meta?.newFlowEligibleCount ?? null,
        featuredCarsRendered: cars.length,
        scopeMissing,
        publicSiteSuspended: tenantPublicSiteSuspended,
        selectionSummaryHe: meta ? tenantHomepageBuilderSummaryHe(meta) : null,
      },
    };
  }, [
    normalized.layout.featuredCarIds,
    cars.length,
    scopeMissing,
    tenantPublicSiteSuspended,
  ]);

  return (
    <>
      <TenantHomeSectionsView
        normalized={normalized}
        branding={branding}
        isPreview={false}
        cars={cars}
        scopeMissing={scopeMissing}
        publicSiteSuspended={tenantPublicSiteSuspended}
        tenantStorefrontInAppPaths={tenantStorefrontInAppPaths}
      />
      <PublicTenantStorefrontDebugCopyButton page="home" getPagePayload={getHomeDebugPayload} />
    </>
  );
}
