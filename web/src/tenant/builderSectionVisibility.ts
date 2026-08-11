import {
  normalizeHomeSectionOrderForBuilder,
  type NormalizedTenantLayout,
  type TenantHomeSectionKey,
} from './tenantSiteConfig';

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

export type TenantLayoutVisibilityInput = TenantLayoutShowFlags &
  Pick<NormalizedTenantLayout, 'homeSections'>;

export type NormalizedBuilderSectionVisibility = {
  sectionOrder: TenantHomeSectionKey[];
  visibleSectionOrder: TenantHomeSectionKey[];
  hiddenSectionOrder: TenantHomeSectionKey[];
  isVisible: (key: TenantHomeSectionKey) => boolean;
};

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

/**
 * Builder/public canonical visibility resolver:
 * - order comes from `layout.homeSections` (normalized to include all keys once),
 * - visibility comes from `show*` flags.
 */
export function normalizeBuilderSectionVisibility(
  layout: TenantLayoutVisibilityInput,
): NormalizedBuilderSectionVisibility {
  const sectionOrder = normalizeHomeSectionOrderForBuilder(layout.homeSections);
  const isVisible = (key: TenantHomeSectionKey) => isTenantHomeSectionFeatureEnabled(layout, key);
  return {
    sectionOrder,
    visibleSectionOrder: sectionOrder.filter((key) => isVisible(key)),
    hiddenSectionOrder: sectionOrder.filter((key) => !isVisible(key)),
    isVisible,
  };
}

export type BuilderSectionVisibilitySetters = {
  setShowFeaturedCars: (next: boolean) => void;
  setShowAbout: (next: boolean) => void;
  setShowBenefits: (next: boolean) => void;
  setShowFinance: (next: boolean) => void;
  setShowTestimonials: (next: boolean) => void;
  setShowContact: (next: boolean) => void;
  setShowMap: (next: boolean) => void;
};

/** Restores hidden section by turning its `show*` flag on (hero is always visible). */
export function restoreBuilderSectionVisibility(
  key: TenantHomeSectionKey,
  setters: BuilderSectionVisibilitySetters,
): void {
  if (key === 'hero') return;
  switch (key) {
    case 'featuredCars':
      setters.setShowFeaturedCars(true);
      break;
    case 'about':
      setters.setShowAbout(true);
      break;
    case 'benefits':
      setters.setShowBenefits(true);
      break;
    case 'finance':
      setters.setShowFinance(true);
      break;
    case 'testimonials':
      setters.setShowTestimonials(true);
      break;
    case 'contact':
      setters.setShowContact(true);
      break;
    case 'map':
      setters.setShowMap(true);
      break;
    default:
      break;
  }
}
