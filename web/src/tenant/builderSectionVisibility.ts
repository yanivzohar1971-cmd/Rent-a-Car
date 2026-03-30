import type { NormalizedTenantLayout, TenantHomeSectionKey } from './tenantSiteConfig';

/**
 * Homepage section visibility contract (builder + persisted `layout`):
 *
 * 1. **Order** — `layout.homeSections` lists every known section key once and defines on-page order
 *    ({@link normalizeHomeSectionOrderForBuilder} enforces completeness).
 * 2. **Feature flags** — Each section except `hero` is gated by a `layout.show*` boolean
 *    (`showAbout`, `showBenefits`, …). When false, the block must not render on the public homepage
 *    or in the Website Builder live preview (no “fake” placement).
 * 3. **Live site** — {@link TenantHomeSectionsView} may still hide blocks when required content is empty;
 *    when the feature flag is true, the builder preview shows empty shells so the block stays editable.
 *
 * Hiding in the builder sets the feature flag to `false` and keeps the key in `homeSections` so order is
 * preserved. Restoring visibility must set the flag back to `true` (explicit button or reorder gesture).
 */
export type TenantLayoutShowFlags = Pick<
  NormalizedTenantLayout,
  | 'showFeaturedCars'
  | 'showAbout'
  | 'showBenefits'
  | 'showFinance'
  | 'showTestimonials'
  | 'showContact'
  | 'showMap'
>;

/** True when the layout allows this section to render (hero is always allowed). */
export function isTenantHomeSectionFeatureEnabled(
  layout: TenantLayoutShowFlags,
  key: TenantHomeSectionKey,
): boolean {
  switch (key) {
    case 'hero':
      return true;
    case 'featuredCars':
      return layout.showFeaturedCars;
    case 'about':
      return layout.showAbout;
    case 'benefits':
      return layout.showBenefits;
    case 'finance':
      return layout.showFinance;
    case 'testimonials':
      return layout.showTestimonials;
    case 'contact':
      return layout.showContact;
    case 'map':
      return layout.showMap;
    default:
      return true;
  }
}

/** Alias for builder UI / preview code paths that think in terms of “visible in builder”. */
export const isSectionVisibleInBuilder = isTenantHomeSectionFeatureEnabled;
