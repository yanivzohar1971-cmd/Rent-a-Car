import type { CSSProperties } from 'react';
import type { TenantBrandingModel } from './tenantBranding';
import {
  resolveTenantPageRootVisual,
  resolveTenantSectionSurfaceLayerVisual,
} from './tenantVisualResolver';
import type { TenantHomeSectionKey, TenantSectionStyle } from './tenantSiteConfig';

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

/**
 * Merges theme variables with optional full-page background image (separate from hero).
 * @see resolveTenantPageRootVisual
 */
export function resolveTenantHomeRootSurfaceStyle(
  branding: TenantBrandingModel,
  opts?: { isPreview?: boolean },
): CSSProperties {
  return resolveTenantPageRootVisual(branding, opts).rootCombinedStyle;
}

/**
 * Per-section paint: custom fill and (when enabled) background photo with legibility overlay.
 * @see resolveTenantSectionSurfaceLayerVisual
 */
export function resolveSectionSurfaceLayerStyle(_sectionKey: TenantHomeSectionKey, style: TenantSectionStyle): CSSProperties | undefined {
  return resolveTenantSectionSurfaceLayerVisual(_sectionKey, style).layerStyle;
}
