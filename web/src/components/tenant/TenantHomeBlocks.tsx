import { useEffect, useMemo, useState } from 'react';
import { fetchPublicCars, type PublicCar } from '../../api/publicCarsApi';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';
import { useTenantInventoryScope } from '../../hooks/useTenantInventoryScope';
import { useTenant } from '../../context/TenantContext';
import { orderPublicCarsByFeaturedIds } from '../../tenant/tenantFeaturedCars';
import TenantHomeSectionsView from './TenantHomeSectionsView';

export default function TenantHomeBlocks() {
  const { isTenantHost, normalized, branding } = useTenantSiteConfig();
  const scope = useTenantInventoryScope();
  const { tenantPublicSiteSuspended } = useTenant();
  const [cars, setCars] = useState<PublicCar[]>([]);

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
        const ids = normalized.layout.featuredCarIds;
        const picked = ids.length > 0 ? orderPublicCarsByFeaturedIds(result, ids) : result.slice(0, 6);
        setCars(picked);
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
