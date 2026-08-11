/**
 * Compact homepage section diagnostics for DEBUG JSON (tenant public + admin builder preview).
 * Mirrors {@link TenantHomeSectionsView} `shouldRenderSectionLive` / featured empty states — no JSX.
 */
import type { TenantBrandingModel } from '../tenant/tenantBranding';
import { normalizeBuilderSectionVisibility } from '../tenant/builderSectionVisibility';
import type { NormalizedTenantSiteConfig, TenantHomeSectionKey } from '../tenant/tenantSiteConfig';
import type { TenantHomepageSelectionMeta } from '../tenant/tenantHomepageCars';

export type TenantFeaturedEmptyCause =
  | 'ok'
  | 'layout_disabled'
  | 'public_site_suspended'
  | 'scope_missing'
  | 'no_homepage_cars';

export type TenantSectionDiagnosticRow = {
  layoutEnabled: boolean;
  /** Same gate as live `shouldRenderSectionLive` (featured: true when layout on). */
  passesLiveContentThreshold: boolean;
  /** False when layout flag off → section omitted from live ordered list. */
  wouldRenderOnLiveSite: boolean;
  hiddenReason: 'layout_flag_off' | 'empty_content' | 'ok';
};

function mergeContact(n: NormalizedTenantSiteConfig, b: TenantBrandingModel) {
  const c = n.contact;
  const bc = b.contact;
  return {
    phone: c.phone ?? bc.phone,
    whatsapp: c.whatsapp ?? bc.whatsapp,
    email: c.email ?? bc.email,
    address: c.address ?? bc.address,
    city: c.city ?? bc.city,
  };
}

function liveContentThreshold(
  key: TenantHomeSectionKey,
  n: NormalizedTenantSiteConfig,
  merged: ReturnType<typeof mergeContact>,
): boolean {
  const { content } = n;
  const hasQuickContact = !!(merged.phone || merged.whatsapp);
  switch (key) {
    case 'hero':
      return true;
    case 'featuredCars':
      return true;
    case 'about':
      return !!(content.aboutText || content.aboutTitle);
    case 'benefits':
      return !!(content.benefitsItems.length > 0 || content.benefitsTitle);
    case 'finance':
      return !!(content.financeText || content.financeTitle);
    case 'testimonials':
      return !!(content.testimonialsText || content.testimonialsTitle);
    case 'contact':
      return hasQuickContact || !!content.contactTitle || !!content.contactSubtitle || !!merged.email;
    case 'map':
      return !!(merged.address || merged.city);
    default:
      return false;
  }
}

function hiddenReasonFor(row: { layoutEnabled: boolean; passesLiveContentThreshold: boolean }): TenantSectionDiagnosticRow['hiddenReason'] {
  if (!row.layoutEnabled) return 'layout_flag_off';
  if (!row.passesLiveContentThreshold) return 'empty_content';
  return 'ok';
}

function featuredEmptyCause(params: {
  layoutEnabled: boolean;
  publicSiteSuspended: boolean;
  scopeMissing: boolean;
  featuredCarsRendered: number;
}): TenantFeaturedEmptyCause {
  if (!params.layoutEnabled) return 'layout_disabled';
  if (params.publicSiteSuspended) return 'public_site_suspended';
  if (params.scopeMissing) return 'scope_missing';
  if (params.featuredCarsRendered > 0) return 'ok';
  return 'no_homepage_cars';
}

export function buildTenantLiveHomeSectionDiagnostics(params: {
  normalized: NormalizedTenantSiteConfig;
  branding: TenantBrandingModel;
  scopeMissing: boolean;
  publicSiteSuspended: boolean;
  homepageMeta: TenantHomepageSelectionMeta | null;
  scopedInventoryFetchedCount: number | null;
  featuredCarsRendered: number;
}): {
  snapshotSectionDiagnosticsVersion: 1;
  visibleSectionsInOrder: TenantHomeSectionKey[];
  sections: Record<TenantHomeSectionKey, TenantSectionDiagnosticRow & { featured?: { emptyCause: TenantFeaturedEmptyCause } }>;
} {
  const { normalized, branding } = params;
  const vis = normalizeBuilderSectionVisibility({
    homeSections: normalized.layout.homeSections,
    showFeaturedCars: normalized.layout.showFeaturedCars,
    showAbout: normalized.layout.showAbout,
    showBenefits: normalized.layout.showBenefits,
    showFinance: normalized.layout.showFinance,
    showTestimonials: normalized.layout.showTestimonials,
    showContact: normalized.layout.showContact,
    showMap: normalized.layout.showMap,
  });
  const merged = mergeContact(normalized, branding);
  const keys: TenantHomeSectionKey[] = [
    'hero',
    'featuredCars',
    'about',
    'benefits',
    'finance',
    'testimonials',
    'contact',
    'map',
  ];
  const sections = {} as Record<
    TenantHomeSectionKey,
    TenantSectionDiagnosticRow & { featured?: { emptyCause: TenantFeaturedEmptyCause } }
  >;
  for (const key of keys) {
    const layoutEnabled = vis.isVisible(key);
    const passesLiveContentThreshold = layoutEnabled && liveContentThreshold(key, normalized, merged);
    const wouldRenderOnLiveSite = passesLiveContentThreshold;
    const base: TenantSectionDiagnosticRow = {
      layoutEnabled,
      passesLiveContentThreshold,
      wouldRenderOnLiveSite,
      hiddenReason: hiddenReasonFor({ layoutEnabled, passesLiveContentThreshold }),
    };
    if (key === 'featuredCars') {
      sections[key] = {
        ...base,
        featured: {
          emptyCause: featuredEmptyCause({
            layoutEnabled,
            publicSiteSuspended: params.publicSiteSuspended,
            scopeMissing: params.scopeMissing,
            featuredCarsRendered: params.featuredCarsRendered,
          }),
        },
      };
    } else {
      sections[key] = base;
    }
  }
  return {
    snapshotSectionDiagnosticsVersion: 1,
    visibleSectionsInOrder: vis.visibleSectionOrder,
    sections,
  };
}

export function buildTenantHomepageShowcaseVsListingSummary(): {
  homepageShowcase: { source: 'getTenantHomepageSelectionMeta'; usesShowInHomeCarouselNewFlow: true; usesLegacyFeaturedCarIdsFallback: true };
  tenantCarsListing: { source: 'fetchPublicCars'; usesHomepageShowcaseSubset: false };
} {
  return {
    homepageShowcase: {
      source: 'getTenantHomepageSelectionMeta',
      usesShowInHomeCarouselNewFlow: true,
      usesLegacyFeaturedCarIdsFallback: true,
    },
    tenantCarsListing: {
      source: 'fetchPublicCars',
      usesHomepageShowcaseSubset: false,
    },
  };
}
