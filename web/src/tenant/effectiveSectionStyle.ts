import { computeThemeAccentVirtualFields } from './effectiveSectionAccent';
import { flattenEffectiveThemeSectionDefaults } from './effectiveThemePack';
import { resolveSectionHiveExplicitAccent } from './sectionHivePalette';
import {
  TENANT_HOME_SECTION_KEYS,
  TENANT_SECTION_STYLE_CAPABILITIES,
  normalizeTenantSectionStyle,
  type NormalizedTenantBranding,
  type TenantHomeBrandingResolutionLayout,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from './tenantSiteConfig';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Expanded section-style-shaped object: effective pack (frozen or live) + optional `branding.theme.sectionDefaults` patch.
 * Hive keys remain defaults — merged from stored / virtual separately.
 */
export function flattenSiteThemeSectionDefaults(branding: NormalizedTenantBranding): Record<string, unknown> {
  return flattenEffectiveThemeSectionDefaults(branding);
}

/**
 * One section’s effective style for the homepage (live + builder preview).
 * Style inheritance and accent inheritance are explicit; legacy tenants expand both from `sectionInheritsSiteTheme` at parse time.
 */
export function resolveEffectiveSectionStyle(
  key: TenantHomeSectionKey,
  layout: TenantHomeBrandingResolutionLayout,
  branding: NormalizedTenantBranding,
): TenantSectionStyle {
  const caps = TENANT_SECTION_STYLE_CAPABILITIES[key];
  const stored = layout.sectionStyles[key];
  const inheritStyle = key !== 'hero' && layout.sectionInheritsSiteThemeStyle?.[key] === true;
  const inheritAccent = key !== 'hero' && layout.sectionInheritsSiteThemeAccent?.[key] === true;

  if (!inheritStyle && !inheritAccent) {
    return normalizeTenantSectionStyle(stored, caps);
  }

  if (!inheritStyle && inheritAccent) {
    const merged: Record<string, unknown> = { ...asRecord(stored as unknown) };
    if (!resolveSectionHiveExplicitAccent(stored as TenantSectionStyle)) {
      const virtual = computeThemeAccentVirtualFields(key, branding, layout);
      if (virtual) {
        merged.accentBaseColor = virtual.accentBaseColor;
        merged.colorPreset = virtual.colorPreset;
      }
    }
    return normalizeTenantSectionStyle(merged, caps);
  }

  const themeBase = flattenEffectiveThemeSectionDefaults(branding);
  const storedRec = asRecord(stored as unknown);
  const storedStyle = stored as TenantSectionStyle;

  if (inheritStyle && !inheritAccent) {
    const merged: Record<string, unknown> = {
      ...themeBase,
      accentBaseColor: storedRec.accentBaseColor ?? themeBase.accentBaseColor,
      colorPreset: storedRec.colorPreset ?? themeBase.colorPreset,
    };
    return normalizeTenantSectionStyle(merged, caps);
  }

  const merged: Record<string, unknown> = {
    ...themeBase,
    accentBaseColor: storedRec.accentBaseColor ?? themeBase.accentBaseColor,
    colorPreset: storedRec.colorPreset ?? themeBase.colorPreset,
  };
  if (!resolveSectionHiveExplicitAccent(storedStyle)) {
    const virtual = computeThemeAccentVirtualFields(key, branding, layout);
    if (virtual) {
      merged.accentBaseColor = virtual.accentBaseColor;
      merged.colorPreset = virtual.colorPreset;
    }
  }
  return normalizeTenantSectionStyle(merged, caps);
}

export function resolveEffectiveSectionStylesRecord(
  layout: TenantHomeBrandingResolutionLayout,
  branding: NormalizedTenantBranding,
): Record<TenantHomeSectionKey, TenantSectionStyle> {
  const out = {} as Record<TenantHomeSectionKey, TenantSectionStyle>;
  for (const key of TENANT_HOME_SECTION_KEYS) {
    out[key] = resolveEffectiveSectionStyle(key, layout, branding);
  }
  return out;
}
