import type { CSSProperties } from 'react';
import type { TenantBrandingModel } from './tenantBranding';
import {
  TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from './tenantSiteConfig';

/** Theme CSS variables applied to the homepage root (preview + live). */
export function tenantHomeThemeCssVariables(branding: TenantBrandingModel): CSSProperties {
  const vars: Record<string, string> = {};
  if (branding.theme.primaryColor) vars['--tenant-primary-color'] = branding.theme.primaryColor;
  if (branding.theme.secondaryColor) vars['--tenant-secondary-color'] = branding.theme.secondaryColor;
  if (branding.theme.accentColor) vars['--tenant-accent-color'] = branding.theme.accentColor;
  if (branding.textColor) vars['--tenant-text-color'] = branding.textColor;
  if (branding.backgroundColor) vars['--tenant-background-color'] = branding.backgroundColor;
  return vars as CSSProperties;
}

function pageOverlayGradient(opacity: number): string {
  const top = Math.max(0, Math.min(0.85, opacity));
  const soft = top * 0.72;
  return `linear-gradient(180deg, rgba(15,23,42,${top}), rgba(15,23,42,${soft}))`;
}

/**
 * Merges theme variables with optional full-page background image (separate from hero).
 */
export function resolveTenantHomeRootSurfaceStyle(
  branding: TenantBrandingModel,
  opts?: { isPreview?: boolean },
): CSSProperties {
  const base = tenantHomeThemeCssVariables(branding);
  const img = branding.pageBackgroundImageUrl?.trim();
  if (!img) return base;
  const rawOp = branding.pageBackgroundOverlayOpacity;
  const opacity =
    typeof rawOp === 'number' && Number.isFinite(rawOp) ? Math.max(0, Math.min(0.85, rawOp)) : 0.52;
  const overlay = pageOverlayGradient(opacity);
  return {
    ...base,
    backgroundImage: `${overlay}, url(${img})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    backgroundAttachment: opts?.isPreview ? 'scroll' : 'fixed',
  };
}

/**
 * Per-section paint: custom fill and (when enabled) background photo with legibility overlay.
 */
export function resolveSectionSurfaceLayerStyle(
  _sectionKey: TenantHomeSectionKey,
  style: TenantSectionStyle,
): CSSProperties | undefined {
  const color = style.sectionBackgroundColor?.trim();
  const img = TENANT_SECTION_BACKGROUND_IMAGE_ENABLED ? style.sectionBackgroundImageUrl?.trim() : '';
  if (!color && !img) return undefined;
  const o: CSSProperties = {};
  if (color) {
    o.backgroundColor = color;
  }
  if (img) {
    const overlay = 'linear-gradient(135deg, rgba(15,23,42,0.42), rgba(15,23,42,0.18))';
    o.backgroundImage = `${overlay}, url(${img})`;
    o.backgroundSize = 'cover';
    o.backgroundPosition = 'center center';
    o.backgroundRepeat = 'no-repeat';
  }
  return o;
}
