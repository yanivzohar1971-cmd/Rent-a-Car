import { computeThemeAccentVirtualFields } from './effectiveSectionAccent';
import { flattenEffectiveThemeSectionDefaults } from './effectiveThemePack';
import { getSectionThemePresetById } from './sectionThemePresets';
import { normalizeAccentBaseColor, resolveSectionHiveExplicitAccent } from './sectionHivePalette';
import {
  TENANT_HOME_SECTION_KEYS,
  TENANT_SECTION_STYLE_CAPABILITIES,
  normalizeTenantSectionStyle,
  validateColorInput,
  type NormalizedTenantBranding,
  type TenantHomeBrandingResolutionLayout,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from './tenantSiteConfig';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function mergeSectionThemePresetLayer(
  key: TenantHomeSectionKey,
  resolved: TenantSectionStyle,
  storedNorm: TenantSectionStyle,
  layout: TenantHomeBrandingResolutionLayout,
): TenantSectionStyle {
  const caps = TENANT_SECTION_STYLE_CAPABILITIES[key];
  const fromSection = storedNorm.sectionThemePresetId?.trim();
  const fromPage = layout.defaultSectionThemePresetId?.trim();
  const presetId =
    (fromSection && getSectionThemePresetById(fromSection) ? fromSection : null) ??
    (fromPage && getSectionThemePresetById(fromPage) ? fromPage : null);
  if (!presetId) return resolved;
  const preset = getSectionThemePresetById(presetId);
  if (!preset) return resolved;

  const customBg = !!(storedNorm.sectionBackgroundColor?.trim());
  const customAccent = resolveSectionHiveExplicitAccent(storedNorm);
  const out: TenantSectionStyle = { ...resolved };

  if (caps.background && !customBg) {
    out.backgroundMode = preset.backgroundMode;
  }
  if (caps.textTone) {
    out.textTone = preset.textTone;
  }
  if (caps.sectionBackgroundColor && !customBg && preset.sectionBackgroundColor?.trim()) {
    const vr = validateColorInput(preset.sectionBackgroundColor.trim());
    if (vr.ok) out.sectionBackgroundColor = vr.value;
  }
  if (caps.accentColor && !customAccent) {
    const norm = normalizeAccentBaseColor(preset.accentBaseColor);
    if (norm) {
      out.accentBaseColor = norm;
      out.colorPreset = null;
    }
  }
  if (caps.cardStyle && preset.cardStyle) {
    out.cardStyle = preset.cardStyle;
  }
  return normalizeTenantSectionStyle(out, caps);
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
  const storedNorm = normalizeTenantSectionStyle(stored, caps);
  const inheritStyle = key !== 'hero' && layout.sectionInheritsSiteThemeStyle?.[key] === true;
  const inheritAccent = key !== 'hero' && layout.sectionInheritsSiteThemeAccent?.[key] === true;

  let resolved: TenantSectionStyle;

  if (!inheritStyle && !inheritAccent) {
    resolved = storedNorm;
  } else if (!inheritStyle && inheritAccent) {
    const merged: Record<string, unknown> = { ...asRecord(stored as unknown) };
    if (!resolveSectionHiveExplicitAccent(storedNorm)) {
      const virtual = computeThemeAccentVirtualFields(key, branding, layout);
      if (virtual) {
        merged.accentBaseColor = virtual.accentBaseColor;
        merged.colorPreset = virtual.colorPreset;
      }
    }
    resolved = normalizeTenantSectionStyle(merged, caps);
  } else {
    const themeBase = flattenEffectiveThemeSectionDefaults(branding);
    const storedRec = asRecord(stored as unknown);
    const storedStyle = stored as TenantSectionStyle;

    if (inheritStyle && !inheritAccent) {
      const merged: Record<string, unknown> = {
        ...themeBase,
        accentBaseColor: storedRec.accentBaseColor ?? themeBase.accentBaseColor,
        colorPreset: storedRec.colorPreset ?? themeBase.colorPreset,
        sectionThemePresetId: storedNorm.sectionThemePresetId,
      };
      resolved = normalizeTenantSectionStyle(merged, caps);
    } else {
      const merged: Record<string, unknown> = {
        ...themeBase,
        accentBaseColor: storedRec.accentBaseColor ?? themeBase.accentBaseColor,
        colorPreset: storedRec.colorPreset ?? themeBase.colorPreset,
        sectionThemePresetId: storedNorm.sectionThemePresetId,
      };
      if (!resolveSectionHiveExplicitAccent(storedStyle)) {
        const virtual = computeThemeAccentVirtualFields(key, branding, layout);
        if (virtual) {
          merged.accentBaseColor = virtual.accentBaseColor;
          merged.colorPreset = virtual.colorPreset;
        }
      }
      resolved = normalizeTenantSectionStyle(merged, caps);
    }
  }

  return mergeSectionThemePresetLayer(key, resolved, storedNorm, layout);
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
