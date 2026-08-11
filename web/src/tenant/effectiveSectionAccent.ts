import { getPresetByKey } from './sectionColorPresets';
import { resolveHomeSectionOrderForBranding } from './effectiveThemePack';
import {
  adjustAccentHexForStrategyIntensity,
  normalizeAccentBaseColor,
  resolveSectionHiveColorContext,
  resolveSectionHiveExplicitAccent,
  type ResolvedSectionHiveColorContext,
} from './sectionHivePalette';
import { getThemeBrandPresetByKey } from './themeBrandPresets';
import {
  getEffectiveThemeAccentStrategy,
  normalizePackAccentStrategy,
  type NormalizedThemeAccentStrategy,
  type ThemeAccentIntensity,
} from './themeAccentStrategy';
import {
  TENANT_SECTION_STYLE_CAPABILITIES,
  isAppliedSnapshotActiveForPack,
  type NormalizedTenantBranding,
  type NormalizedTenantLayout,
  type TenantHomeBrandingResolutionLayout,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from './tenantSiteConfig';

const CARD_SECTION_KEYS = new Set<TenantHomeSectionKey>(['featuredCars', 'benefits', 'testimonials']);
const CONTENT_SECTION_KEYS = new Set<TenantHomeSectionKey>(['about', 'finance', 'contact', 'map']);

export function accentTargetIncludesSection(
  scope: NormalizedThemeAccentStrategy['targetSections'],
  key: TenantHomeSectionKey,
): boolean {
  if (key === 'hero') return false;
  if (scope === 'all') return true;
  if (scope === 'cardsOnly') return CARD_SECTION_KEYS.has(key);
  return CONTENT_SECTION_KEYS.has(key);
}

/**
 * Deterministic accent energy distribution (no RNG):
 * - `map`: theme-driven hive is never applied (local hive still allowed elsewhere).
 * - `strong`: cap runs — after two consecutive eligible sections would use `strong`, the third uses `balanced` (resets run).
 */
export function buildDistributedAccentIntensityBySection(
  layout: Pick<NormalizedTenantLayout, 'homeSections'>,
  strat: NormalizedThemeAccentStrategy,
): Partial<Record<TenantHomeSectionKey, ThemeAccentIntensity>> {
  const order = resolveHomeSectionOrderForBranding(layout);
  const out: Partial<Record<TenantHomeSectionKey, ThemeAccentIntensity>> = {};
  let strongRun = 0;
  for (const key of order) {
    if (key === 'hero' || key === 'map') {
      strongRun = 0;
      continue;
    }
    if (!accentTargetIncludesSection(strat.targetSections, key)) {
      strongRun = 0;
      continue;
    }
    let eff: ThemeAccentIntensity = strat.intensity;
    if (eff === 'strong') {
      if (strongRun >= 2) {
        eff = 'balanced';
        strongRun = 0;
      } else {
        strongRun += 1;
      }
    } else {
      strongRun = 0;
    }
    out[key] = eff;
  }
  return out;
}

export function resolveSiteAccentStrategyOrigin(branding: NormalizedTenantBranding):
  | 'explicit-tenant'
  | 'frozen-pack'
  | 'live-pack'
  | 'none' {
  if (branding.themeAccentStrategy != null) {
    if (branding.themeAccentStrategy.mode === 'none') return 'none';
    return 'explicit-tenant';
  }
  const snap = branding.appliedThemeSnapshot;
  if (
    isAppliedSnapshotActiveForPack(snap, branding.siteThemePackKey) &&
    snap?.accentStrategyFromPack &&
    snap.accentStrategyFromPack.mode !== 'none'
  ) {
    return 'frozen-pack';
  }
  const live = branding.siteThemePackKey ? getThemeBrandPresetByKey(branding.siteThemePackKey) : null;
  if (live?.accentStrategy && normalizePackAccentStrategy(live.accentStrategy, live.primaryColor)) {
    return 'live-pack';
  }
  return 'none';
}

/**
 * Non-persisted hive fields derived from global accent strategy (accent inherit + no local hive only).
 * `map`: no theme-driven hive (distribution / role).
 */
export function computeThemeAccentVirtualFields(
  key: TenantHomeSectionKey,
  branding: NormalizedTenantBranding,
  layout: Pick<NormalizedTenantLayout, 'homeSections'>,
): Pick<TenantSectionStyle, 'accentBaseColor' | 'colorPreset'> | null {
  const caps = TENANT_SECTION_STYLE_CAPABILITIES[key];
  if (!caps?.accentColor || key === 'hero' || key === 'map') return null;

  const strat = getEffectiveThemeAccentStrategy({
    siteThemePackKey: branding.siteThemePackKey,
    themeAccentStrategy: branding.themeAccentStrategy,
    primaryColor: branding.primaryColor,
    appliedThemeSnapshot: branding.appliedThemeSnapshot,
  });
  if (strat.mode === 'none') return null;
  if (!accentTargetIncludesSection(strat.targetSections, key)) return null;

  if (strat.mode === 'preset') {
    const pk = strat.presetKey?.trim() ?? '';
    if (!pk || !getPresetByKey(pk)) return null;
    return { accentBaseColor: null, colorPreset: pk };
  }

  const primaryNorm = branding.primaryColor ? normalizeAccentBaseColor(branding.primaryColor) : null;
  const base = strat.baseColor ?? primaryNorm;
  if (!base) return null;
  const intensityMap = buildDistributedAccentIntensityBySection(layout, strat);
  const effIntensity = intensityMap[key] ?? strat.intensity;
  const adjusted = adjustAccentHexForStrategyIntensity(base, effIntensity) ?? base;
  return { accentBaseColor: adjusted, colorPreset: null };
}

export type SectionHiveAccentSource =
  | 'section-custom'
  | 'section-preset'
  | 'theme-preset'
  | 'theme-derived'
  | 'none';

export type ResolvedSectionHiveAccentResolution = {
  source: SectionHiveAccentSource;
  inheritedFromTheme: boolean;
  ctx: ResolvedSectionHiveColorContext;
  strategyOrigin: ReturnType<typeof resolveSiteAccentStrategyOrigin>;
  themePackDefaultsSource: 'frozen' | 'live-registry' | null;
  inheritsAccentFromTheme: boolean;
  inheritsStyleFromTheme: boolean;
};

export function resolveSectionHiveAccentResolution(
  key: TenantHomeSectionKey,
  layout: TenantHomeBrandingResolutionLayout,
  branding: NormalizedTenantBranding,
): ResolvedSectionHiveAccentResolution {
  const stored = layout.sectionStyles[key];
  const primary = branding.primaryColor;
  const caps = TENANT_SECTION_STYLE_CAPABILITIES[key];
  const baselineCtx = resolveSectionHiveColorContext(stored, primary);
  const inheritsAccentFromTheme = key !== 'hero' && layout.sectionInheritsSiteThemeAccent?.[key] === true;
  const inheritsStyleFromTheme = key !== 'hero' && layout.sectionInheritsSiteThemeStyle?.[key] === true;

  const frozen = isAppliedSnapshotActiveForPack(branding.appliedThemeSnapshot, branding.siteThemePackKey);

  if (!caps?.accentColor || key === 'hero') {
    return {
      source: 'none',
      inheritedFromTheme: false,
      ctx: baselineCtx,
      strategyOrigin: resolveSiteAccentStrategyOrigin(branding),
      themePackDefaultsSource: frozen ? 'frozen' : branding.siteThemePackKey ? 'live-registry' : null,
      inheritsAccentFromTheme,
      inheritsStyleFromTheme,
    };
  }

  const explicitHex = resolveSectionHiveExplicitAccent(stored);
  if (explicitHex) {
    const custom = normalizeAccentBaseColor(stored.accentBaseColor);
    return {
      source: custom ? 'section-custom' : 'section-preset',
      inheritedFromTheme: false,
      ctx: baselineCtx,
      strategyOrigin: resolveSiteAccentStrategyOrigin(branding),
      themePackDefaultsSource: frozen ? 'frozen' : branding.siteThemePackKey ? 'live-registry' : null,
      inheritsAccentFromTheme,
      inheritsStyleFromTheme,
    };
  }

  if (!inheritsAccentFromTheme) {
    return {
      source: 'none',
      inheritedFromTheme: false,
      ctx: baselineCtx,
      strategyOrigin: resolveSiteAccentStrategyOrigin(branding),
      themePackDefaultsSource: frozen ? 'frozen' : branding.siteThemePackKey ? 'live-registry' : null,
      inheritsAccentFromTheme,
      inheritsStyleFromTheme,
    };
  }

  const virtual = computeThemeAccentVirtualFields(key, branding, layout);
  if (!virtual) {
    return {
      source: 'none',
      inheritedFromTheme: false,
      ctx: baselineCtx,
      strategyOrigin: resolveSiteAccentStrategyOrigin(branding),
      themePackDefaultsSource: frozen ? 'frozen' : branding.siteThemePackKey ? 'live-registry' : null,
      inheritsAccentFromTheme,
      inheritsStyleFromTheme,
    };
  }

  const merged: TenantSectionStyle = { ...stored, ...virtual };
  const ctx = resolveSectionHiveColorContext(merged, primary);
  const source: SectionHiveAccentSource = virtual.colorPreset ? 'theme-preset' : 'theme-derived';
  return {
    source,
    inheritedFromTheme: true,
    ctx,
    strategyOrigin: resolveSiteAccentStrategyOrigin(branding),
    themePackDefaultsSource: frozen ? 'frozen' : branding.siteThemePackKey ? 'live-registry' : null,
    inheritsAccentFromTheme,
    inheritsStyleFromTheme,
  };
}
