/**
 * Theme carousel: curated presets and import-shaped payloads for safe Firestore apply.
 * @see docs/TENANT_SITE_CONFIG_IMPORT_CONTRACT.md
 */
import type { ThemeCarouselApplyImportInput } from './tenantSiteConfigImport';
import type { ThemeBrandPreset } from './themeBrandPresets';
import { getThemeBrandPresetByKey, THEME_BRAND_PRESETS } from './themeBrandPresets';
import {
  buildAppliedThemeSnapshotFromPreset,
  serializeAppliedThemeSnapshotForFirestore,
  serializeSiteThemeSectionDefaultsForFirestore,
  parseSiteThemeSectionDefaultsObject,
} from './tenantSiteConfig';

/** Optional layout hints per preset; coerced through the same pipeline as imports. */
export type ThemeCarouselLayoutDefaults = Partial<{
  homeSections: readonly string[];
  showFeaturedCars: boolean;
  showAbout: boolean;
  showBenefits: boolean;
  showFinance: boolean;
  showTestimonials: boolean;
  showContact: boolean;
  showMap: boolean;
  featuredCarIds: readonly string[];
  variant: string;
  themeVariant: string;
}>;

export type ThemeCarouselPresetEntry = {
  packKey: string;
  layoutDefaults?: ThemeCarouselLayoutDefaults;
};

const LAYOUT_HINTS: Partial<Record<string, ThemeCarouselLayoutDefaults>> = {
  /** Emphasize inventory + social proof — still merges with existing section order/styles. */
  showroom: { showTestimonials: true },
  luxury: { showMap: true },
};

/** Single source for carousel cards; order matches `THEME_BRAND_PRESETS`. */
export const THEME_CAROUSEL_PRESETS: readonly ThemeCarouselPresetEntry[] = THEME_BRAND_PRESETS.map((p) => ({
  packKey: p.key,
  layoutDefaults: LAYOUT_HINTS[p.key],
}));

const PRESET_META_BY_KEY: Record<string, ThemeCarouselPresetEntry> = Object.fromEntries(
  THEME_CAROUSEL_PRESETS.map((e) => [e.packKey, e]),
);

export function getThemeCarouselPresetEntry(packKey: string): ThemeCarouselPresetEntry | null {
  const k = packKey.trim();
  return k ? PRESET_META_BY_KEY[k] ?? null : null;
}

function layoutDefaultsToImportLayout(layoutDefaults: ThemeCarouselLayoutDefaults): Record<string, unknown> | undefined {
  const layout: Record<string, unknown> = {};
  if (layoutDefaults.homeSections !== undefined) {
    layout.homeSections = [...layoutDefaults.homeSections];
  }
  const boolKeys = [
    'showFeaturedCars',
    'showAbout',
    'showBenefits',
    'showFinance',
    'showTestimonials',
    'showContact',
    'showMap',
  ] as const;
  for (const k of boolKeys) {
    if (layoutDefaults[k] !== undefined) layout[k] = layoutDefaults[k];
  }
  if (layoutDefaults.featuredCarIds !== undefined) {
    layout.featuredCarIds = [...layoutDefaults.featuredCarIds];
  }
  if (layoutDefaults.variant !== undefined) layout.variant = layoutDefaults.variant;
  if (layoutDefaults.themeVariant !== undefined) layout.themeVariant = layoutDefaults.themeVariant;
  return Object.keys(layout).length > 0 ? layout : undefined;
}

/**
 * Partial import body: branding colors + `branding.theme` (pack, section defaults, frozen snapshot).
 * Does not set `branding.theme.accentStrategy` so an explicit tenant strategy survives merge when present.
 */
export function buildThemeCarouselApplyImportInput(
  pack: ThemeBrandPreset,
  layoutDefaults?: ThemeCarouselLayoutDefaults | undefined,
): ThemeCarouselApplyImportInput {
  const snapshot = buildAppliedThemeSnapshotFromPreset(pack);
  const sectionDefaultsParsed = parseSiteThemeSectionDefaultsObject(
    (pack.sectionDefaults ?? {}) as unknown as Record<string, unknown>,
  );
  const sectionDefaultsSer = serializeSiteThemeSectionDefaultsForFirestore(sectionDefaultsParsed);

  const theme: Record<string, unknown> = {
    siteThemePackKey: pack.key,
    appliedThemeSnapshot: serializeAppliedThemeSnapshotForFirestore(snapshot),
  };
  if (sectionDefaultsSer) theme.sectionDefaults = sectionDefaultsSer;

  const out: ThemeCarouselApplyImportInput = {
    branding: {
      primaryColor: pack.primaryColor,
      secondaryColor: pack.secondaryColor,
      accentColor: pack.accentColor,
      theme,
    },
  };

  const layout = layoutDefaults ? layoutDefaultsToImportLayout(layoutDefaults) : undefined;
  if (layout) out.layout = layout;

  return out;
}

export function buildThemeCarouselApplyImportInputForPackKey(packKey: string): ThemeCarouselApplyImportInput | null {
  const pack = getThemeBrandPresetByKey(packKey);
  if (!pack) return null;
  const meta = getThemeCarouselPresetEntry(pack.key);
  return buildThemeCarouselApplyImportInput(pack, meta?.layoutDefaults);
}
