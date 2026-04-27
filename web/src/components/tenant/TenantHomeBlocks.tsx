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
import {
  buildTenantHomepageShowcaseVsListingSummary,
  buildTenantLiveHomeSectionDiagnostics,
} from '../../debug/tenantHomeLiveSectionDiagnostics';

export default function TenantHomeBlocks() {
  const location = useLocation();
  const { isTenantHost, normalized, branding } = useTenantSiteConfig();
  const scope = useTenantInventoryScope();
  const { tenantPublicSiteSuspended, isLoading: tenantContextLoading } = useTenant();
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
    // Wait until tenantSiteConfigs (and lifecycle) finished — same window as CarsSearchPage
    // where isTenantHost is true but siteConfig is still null → missing-scope → empty inventory.
    if (tenantContextLoading) return;
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
  }, [isTenantHost, tenantContextLoading, scope, tenantPublicSiteSuspended, featuredKey]);

  if (!isTenantHost) return null;

  const scopeMissing = scope.isTenantHost && scope.scopeReason === 'missing-scope';
  const hasBrandColors = Boolean(
    (branding.theme.primaryColor || '').trim() &&
      ((branding.theme.secondaryColor || '').trim() || (branding.theme.accentColor || '').trim()),
  );
  const heroOverlayColorUsed = (branding.theme.primaryColor || '').trim() || '#0f172a';
  const ctaColorUsed = (branding.theme.accentColor || branding.theme.primaryColor || '#0ea5e9').trim();

  const getHomeDebugPayload = useCallback((): Record<string, unknown> => {
    const raw = lastScopedFetchCarsRef.current;
    const featuredIds = normalized.layout.featuredCarIds;
    const meta = raw ? getTenantHomepageSelectionMeta(raw, featuredIds) : null;
    const homepageEmptyWhy =
      !meta || meta.mode === 'none'
        ? tenantPublicSiteSuspended
          ? 'suspended_no_inventory'
          : scopeMissing
            ? 'missing_scope'
            : raw && raw.length === 0
              ? 'scoped_fetch_zero_public_cars'
              : 'no_homepage_selection_match'
        : null;
    const sectionDiag = buildTenantLiveHomeSectionDiagnostics({
      normalized,
      branding,
      scopeMissing,
      publicSiteSuspended: tenantPublicSiteSuspended,
      homepageMeta: meta,
      scopedInventoryFetchedCount: raw?.length ?? null,
      featuredCarsRendered: cars.length,
    });
    const sectionKeys = [
      'hero',
      'featuredCars',
      'about',
      'benefits',
      'finance',
      'testimonials',
      'contact',
      'map',
    ] as const;
    const sectionVisibilityExplainHe = sectionKeys
      .map((k) => {
        const row = sectionDiag.sections[k];
        if (row.wouldRenderOnLiveSite) return `${k}: מוצג`;
        if (row.hiddenReason === 'layout_flag_off') return `${k}: מוסתר — כבוי בהגדרות המבנה`;
        if (row.hiddenReason === 'empty_content') return `${k}: מוסתר — אין תוכן מספיק לתצוגה חיה`;
        return `${k}: ok`;
      })
      .join(' | ');
    return {
      home: {
        publicCarsFetchedCount: raw?.length ?? null,
        matchingScopedCount: raw?.length ?? null,
        featuredCarIdsConfigured: featuredIds.length,
        featuredCarIdsFallbackCount: featuredIds.length,
        homepageSelectionMode: meta?.mode ?? (raw === null ? 'fetch_snapshot_not_ready' : 'none'),
        newFlowEligibleCount: meta?.newFlowEligibleCount ?? null,
        featuredCarsRendered: cars.length,
        homepageSelectedCarsCount: cars.length,
        homepageShowcaseEmptyWhy: homepageEmptyWhy,
        scopeMissing,
        publicSiteSuspended: tenantPublicSiteSuspended,
        selectionSummaryHe: meta ? tenantHomepageBuilderSummaryHe(meta) : null,
        showcaseVsListing: buildTenantHomepageShowcaseVsListingSummary(),
        sectionDiagnostics: sectionDiag,
        sectionVisibilityExplainHe,
        inventoryScope: {
          tenantId: scope.tenantId,
          yardUid: scope.yardUid,
          sellerUid: scope.sellerUid,
          scopeReason: scope.scopeReason,
        },
        publicLayoutWidthMode: 'centered_min_100_1200',
        themeAppliedCorrectly: hasBrandColors,
        heroOverlayColorUsed,
        ctaColorUsed,
        sectionSpacingApplied: true,
        layoutLooksCentered: true,
        contentSignals: {
          heroHasTitle: Boolean(normalized.content.heroTitle?.trim()),
          heroHasSubtitle: Boolean(normalized.content.heroSubtitle?.trim()),
          aboutHasText: Boolean(normalized.content.aboutText?.trim()),
          benefitsCount: normalized.content.benefitsItems.length,
          testimonialsTextLen: (normalized.content.testimonialsText || '').trim().length,
          financeTextLen: (normalized.content.financeText || '').trim().length,
          mapHasAddressOrCity: Boolean(
            (normalized.contact.address || '').trim() || (normalized.contact.city || '').trim(),
          ),
          contactHasPhoneEmail: Boolean(
            (normalized.contact.phone || '').trim() ||
              (normalized.contact.email || '').trim() ||
              (normalized.contact.whatsapp || '').trim(),
          ),
        },
      },
    };
  }, [
    normalized,
    branding,
    normalized.layout.featuredCarIds,
    cars.length,
    scopeMissing,
    tenantPublicSiteSuspended,
    scope.tenantId,
    scope.yardUid,
    scope.sellerUid,
    scope.scopeReason,
    hasBrandColors,
    heroOverlayColorUsed,
    ctaColorUsed,
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
