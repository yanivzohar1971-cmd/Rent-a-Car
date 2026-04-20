import { getThemeBrandPresetByKey, type ThemeBrandPreset } from './themeBrandPresets';
import {
  DEFAULT_TENANT_SECTION_STYLE,
  TENANT_HOME_SECTION_KEYS,
  isAppliedSnapshotActiveForPack,
  type NormalizedTenantBranding,
  type NormalizedTenantLayout,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from './tenantSiteConfig';

export type ResolvedEffectiveThemePack = {
  effectivePackKey: string | null;
  livePack: ThemeBrandPreset | null;
  /** True when `appliedThemeSnapshot` matches `siteThemePackKey` — pack defaults/accent-from-pack come from freeze. */
  usesFrozenSnapshot: boolean;
  snapshotPackVersion: number | null;
  livePackVersion: number | null;
  /** Section tendencies: frozen copy when active, else from live pack (may differ if registry changed). */
  packSectionDefaults: Partial<
    Pick<
      TenantSectionStyle,
      'backgroundMode' | 'textTone' | 'paddingDensity' | 'cardStyle' | 'layoutVariant' | 'align'
    >
  >;
};

export function resolveEffectiveThemePack(branding: NormalizedTenantBranding): ResolvedEffectiveThemePack {
  const key = branding.siteThemePackKey;
  const live = key ? getThemeBrandPresetByKey(key) : null;
  const snap = branding.appliedThemeSnapshot;
  const active = isAppliedSnapshotActiveForPack(snap, key);

  const frozenDefaults = active && snap?.sectionDefaults ? snap.sectionDefaults : null;
  const liveDefaults = (live?.sectionDefaults ?? {}) as Partial<
    Pick<
      TenantSectionStyle,
      'backgroundMode' | 'textTone' | 'paddingDensity' | 'cardStyle' | 'layoutVariant' | 'align'
    >
  >;

  const packSectionDefaults = {
    ...(active && frozenDefaults ? frozenDefaults : liveDefaults),
  };

  return {
    effectivePackKey: key,
    livePack: live,
    usesFrozenSnapshot: active,
    snapshotPackVersion: active && snap ? snap.packVersion : null,
    livePackVersion: live?.packVersion ?? null,
    packSectionDefaults,
  };
}

/**
 * Theme base for section style merge: defaults + effective pack section tendencies + admin `branding.theme.sectionDefaults` patch.
 * Hive keys stay at defaults — callers merge stored/virtual hive separately.
 */
export function flattenEffectiveThemeSectionDefaults(branding: NormalizedTenantBranding): Record<string, unknown> {
  const r = resolveEffectiveThemePack(branding);
  const fromPack = r.packSectionDefaults as Record<string, unknown>;
  const patch = (branding.siteThemeSectionDefaults ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_TENANT_SECTION_STYLE,
    ...fromPack,
    ...patch,
    accentBaseColor: DEFAULT_TENANT_SECTION_STYLE.accentBaseColor,
    colorPreset: DEFAULT_TENANT_SECTION_STYLE.colorPreset,
    sectionBackgroundColor: DEFAULT_TENANT_SECTION_STYLE.sectionBackgroundColor,
    sectionBackgroundImageUrl: DEFAULT_TENANT_SECTION_STYLE.sectionBackgroundImageUrl,
  };
}

/** Human-readable: frozen vs live registry for debug UI. */
export function themePackResolutionSourceLabel(r: ResolvedEffectiveThemePack): 'frozen' | 'live-registry' {
  return r.usesFrozenSnapshot ? 'frozen' : 'live-registry';
}

/** Order used for accent distribution (homepage section order). */
export function resolveHomeSectionOrderForBranding(layout: Pick<NormalizedTenantLayout, 'homeSections'>): TenantHomeSectionKey[] {
  if (Array.isArray(layout.homeSections) && layout.homeSections.length > 0) return layout.homeSections;
  return [...TENANT_HOME_SECTION_KEYS];
}
