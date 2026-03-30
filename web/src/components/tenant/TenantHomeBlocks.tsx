import { useEffect, useMemo, useState } from 'react';
import { fetchPublicCars, type PublicCar } from '../../api/publicCarsApi';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';
import { useTenantInventoryScope } from '../../hooks/useTenantInventoryScope';
import { useTenant } from '../../context/TenantContext';
import { getTenantHomepageSelectionMeta } from '../../tenant/tenantHomepageCars';
import TenantHomeSectionsView from './TenantHomeSectionsView';

export default function TenantHomeBlocks() {
  const { isTenantHost, normalized, branding } = useTenantSiteConfig();
  const scope = useTenantInventoryScope();
  const { tenantPublicSiteSuspended } = useTenant();
  const [cars, setCars] = useState<PublicCar[]>([]);

  /** Re-fetch when legacy id list changes; new-flow carousel flags refresh on navigation/remount (same scoped fetch). */
  const featuredKey = useMemo(() => normalized.layout.featuredCarIds.join('\u001f'), [normalized.layout.featuredCarIds]);

  useEffect(() => {
    if (!isTenantHost) return;
    if (tenantPublicSiteSuspended) {
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
        setCars(getTenantHomepageSelectionMeta(result, normalized.layout.featuredCarIds).cars);
      })
      .catch(() => {
        if (isCancelled) return;
        setCars([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [isTenantHost, scope, tenantPublicSiteSuspended, featuredKey]);

  if (!isTenantHost) return null;

  const scopeMissing = scope.isTenantHost && scope.scopeReason === 'missing-scope';

  return (
    <TenantHomeSectionsView
      normalized={normalized}
      branding={branding}
      isPreview={false}
      cars={cars}
      scopeMissing={scopeMissing}
      publicSiteSuspended={tenantPublicSiteSuspended}
    />
  );
}
