/**
 * Central visual resolution for tenant homepage (live + builder preview + import assumptions).
 *
 * **Precedence (authoritative):**
 *
 * **A. Page root**
 * 1. Valid `pageBackgroundImageUrl` → full-bleed photo + overlay gradient (hero image never substitutes here).
 * 2. Else `backgroundColor` feeds `--tenant-background-color` (theme variables only).
 * 3. Else transparent/theme shell (CSS fallbacks).
 *
 * **B. Section surface layer** (additive on top of section CSS shells; separate from hero)
 * 1. Section background image **only** when `TENANT_SECTION_BACKGROUND_IMAGE_ENABLED` and URL is valid (normalized config already strips invalid URLs when disabled).
 * 2. Else `sectionBackgroundColor` when set.
 * 3. Else no inline layer — `backgroundMode` / hive / inverse tone remain on the existing class-based path.
 *
 * **C. Hero**
 * - `heroImageUrl` only drives the hero card background image; page backdrop never replaces it.
 * - Screenshot/URL imports must not map arbitrary imagery here unless `heroImageUrl` is explicitly set (unchanged product rule).
 *
 * **D. Body / section readable text**
 * - Page body `--tenant-text-color` is finalized against the **resolved** page surface (busy image vs solid bg).
 * - Optional per-section `color` override only when contrast against the **approximated** effective surface is insufficient (does not replace `textTone` in persisted config).
 */
import type { CSSProperties } from 'react';
import type { TenantBrandingModel } from './tenantBranding';
import { deriveSectionHivePalette, rgbToHex, type ResolvedSectionHiveColorContext } from './sectionHivePalette';
import {
  TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  TENANT_SECTION_STYLE_CAPABILITIES,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from './tenantSiteConfig';

type Rgb = { r: number; g: number; b: number };

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const NEAR_BLACK: Rgb = { r: 15, g: 23, b: 42 };
const INVERSE_SHELL_HEX = '#1e293b';
const DEFAULT_BODY_HEX = '#0f172a';
const MUTED_BODY_HEX = '#334155';
const INVERSE_BODY_HEX = '#ffffff';

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseCssColorForContrast(input: string): Rgb | null {
  const s = input.trim();
  if (!s) return null;
  const hex6 = /^#([0-9a-fA-F]{6})$/i.exec(s);
  if (hex6) {
    const h = hex6[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const hex3 = /^#([0-9a-fA-F]{3})$/i.exec(s);
  if (hex3) {
    const h = hex3[1];
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  const rgb = /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/i.exec(s);
  if (rgb) {
    return { r: clamp255(Number(rgb[1])), g: clamp255(Number(rgb[2])), b: clamp255(Number(rgb[3])) };
  }
  return null;
}

function channelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminanceForContrast(rgb: Rgb): number {
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatioForContrast(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminanceForContrast(a);
  const l2 = relativeLuminanceForContrast(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: clamp255(a.r + (b.r - a.r) * u),
    g: clamp255(a.g + (b.g - a.g) * u),
    b: clamp255(a.b + (b.b - a.b) * u),
  };
}

function pickReadableTextOnBackgroundRgb(bg: Rgb): string {
  const cw = contrastRatioForContrast(WHITE, bg);
  const cb = contrastRatioForContrast(NEAR_BLACK, bg);
  return cw >= cb ? '#ffffff' : '#0f172a';
}

/**
 * Import + runtime: nudge explicit text to meet ~4.5:1 on a solid background when both parse as sRGB.
 */
export function ensureTextReadableOnSolidBackground(textCss: string, bgCss: string): string | null {
  const fg = parseCssColorForContrast(textCss);
  const bg = parseCssColorForContrast(bgCss);
  if (!fg || !bg) return null;
  if (contrastRatioForContrast(fg, bg) >= 4.5) return textCss;
  return pickReadableTextOnBackgroundRgb(bg);
}

export type TenantPageRootSurfaceSource = 'pageBackgroundImage' | 'pageBackgroundColor' | 'themeFallback';

export type ResolvedTenantPageRootVisual = {
  rootCombinedStyle: CSSProperties;
  meta: {
    pageSurfaceSource: TenantPageRootSurfaceSource;
    effectivePageBackgroundImageUrl: string | null;
    effectivePageOverlayOpacity: number | null;
  };
};

export type ResolvedTenantSectionSurfaceVisual = {
  layerStyle: CSSProperties | undefined;
  meta: {
    sectionSurfaceSource: 'sectionBackgroundImage' | 'sectionBackgroundColor' | 'none';
  };
};

function pageOverlayGradient(opacity: number): string {
  const top = Math.max(0, Math.min(0.85, opacity));
  const soft = top * 0.72;
  return `linear-gradient(180deg, rgba(15,23,42,${top}), rgba(15,23,42,${soft}))`;
}

function tenantHomeThemeCssVariables(branding: TenantBrandingModel): CSSProperties {
  const vars: Record<string, string> = {};
  if (branding.theme.primaryColor) vars['--tenant-primary-color'] = branding.theme.primaryColor;
  if (branding.theme.secondaryColor) vars['--tenant-secondary-color'] = branding.theme.secondaryColor;
  if (branding.theme.accentColor) vars['--tenant-accent-color'] = branding.theme.accentColor;
  if (branding.textColor) vars['--tenant-text-color'] = branding.textColor;
  if (branding.backgroundColor) vars['--tenant-background-color'] = branding.backgroundColor;
  return vars as CSSProperties;
}

function clampPageOverlayOpacity(raw: number | null | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.min(0.85, raw));
  return 0.52;
}

/**
 * **A.** Page root: image wins over solid theme color; hero media is ignored here.
 */
export function resolveTenantPageRootVisual(
  branding: TenantBrandingModel,
  opts?: { isPreview?: boolean },
): ResolvedTenantPageRootVisual {
  const base = tenantHomeThemeCssVariables(branding);
  const img = branding.pageBackgroundImageUrl?.trim();
  if (!img) {
    return {
      rootCombinedStyle: base,
      meta: {
        pageSurfaceSource: branding.backgroundColor?.trim() ? 'pageBackgroundColor' : 'themeFallback',
        effectivePageBackgroundImageUrl: null,
        effectivePageOverlayOpacity: null,
      },
    };
  }
  const opacity = clampPageOverlayOpacity(branding.pageBackgroundOverlayOpacity);
  const overlay = pageOverlayGradient(opacity);
  return {
    rootCombinedStyle: {
      ...base,
      backgroundImage: `${overlay}, url(${img})`,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center center',
      backgroundAttachment: opts?.isPreview ? 'scroll' : 'fixed',
    },
    meta: {
      pageSurfaceSource: 'pageBackgroundImage',
      effectivePageBackgroundImageUrl: img,
      effectivePageOverlayOpacity: opacity,
    },
  };
}

/**
 * **B.** Section additive layer: gated image > solid color > none.
 */
export function resolveTenantSectionSurfaceLayerVisual(
  _sectionKey: TenantHomeSectionKey,
  style: TenantSectionStyle,
): ResolvedTenantSectionSurfaceVisual {
  const color = style.sectionBackgroundColor?.trim();
  const img =
    TENANT_SECTION_BACKGROUND_IMAGE_ENABLED && style.sectionBackgroundImageUrl?.trim()
      ? style.sectionBackgroundImageUrl.trim()
      : '';
  if (!color && !img) {
    return { layerStyle: undefined, meta: { sectionSurfaceSource: 'none' } };
  }
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
  return {
    layerStyle: o,
    meta: {
      sectionSurfaceSource: img ? 'sectionBackgroundImage' : color ? 'sectionBackgroundColor' : 'none',
    },
  };
}

function primaryRgbForSectionMix(branding: TenantBrandingModel): Rgb {
  const raw = branding.theme.primaryColor?.trim();
  const p = raw ? parseCssColorForContrast(raw) : null;
  return p ?? parseCssColorForContrast('#0ea5e9')!;
}

/** Mirrors non-hive `TenantHomeBlocks.css` section backgrounds for contrast approximation. */
function approximateNonHiveModeSurfaceHex(style: TenantSectionStyle, branding: TenantBrandingModel): string {
  const primary = primaryRgbForSectionMix(branding);
  switch (style.backgroundMode) {
    case 'surface':
      return '#f8fafc';
    case 'soft':
      return rgbToHex(mixRgb(primary, WHITE, 0.08));
    case 'accent':
      return rgbToHex(mixRgb(primary, WHITE, 0.14));
    case 'image':
      return '#f8fafc';
    default:
      return '#ffffff';
  }
}

/**
 * Approximates the section’s effective **background** for WCAG checks (classes + optional hive + inverse shell).
 * Not a pixel-perfect paint model — conservative for readability nudges only.
 */
export function approximateEffectiveSectionSurfaceHex(
  style: TenantSectionStyle,
  hiveCtx: ResolvedSectionHiveColorContext | null,
  branding: TenantBrandingModel,
): string | null {
  const custom = style.sectionBackgroundColor?.trim();
  if (custom) {
    const rgb = parseCssColorForContrast(custom);
    return rgb ? custom : null;
  }
  if (TENANT_SECTION_BACKGROUND_IMAGE_ENABLED && style.sectionBackgroundImageUrl?.trim()) {
    return '#e2e8f0';
  }
  if (style.textTone === 'inverse') {
    return INVERSE_SHELL_HEX;
  }
  if (hiveCtx?.hiveBaseHex) {
    const pal = deriveSectionHivePalette(hiveCtx.hiveBaseHex);
    if (!pal) return approximateNonHiveModeSurfaceHex(style, branding);
    switch (style.backgroundMode) {
      case 'surface':
        return pal.surface;
      case 'soft':
        return pal.soft;
      case 'accent':
        return pal.surface;
      case 'image':
        return '#f8fafc';
      default:
        return '#ffffff';
    }
  }
  return approximateNonHiveModeSurfaceHex(style, branding);
}

function intendedBodyColorForTextTone(textTone: TenantSectionStyle['textTone']): string {
  if (textTone === 'inverse') return INVERSE_BODY_HEX;
  if (textTone === 'muted') return MUTED_BODY_HEX;
  return DEFAULT_BODY_HEX;
}

/**
 * When the chosen `textTone` color would fail ~4.5:1 on the approximated surface, return a corrective `color` style.
 */
export function resolveSectionReadableTextColorIfNeeded(
  sectionKey: TenantHomeSectionKey,
  style: TenantSectionStyle,
  hiveCtx: ResolvedSectionHiveColorContext | null,
  branding: TenantBrandingModel,
): CSSProperties | undefined {
  const caps = TENANT_SECTION_STYLE_CAPABILITIES[sectionKey];
  if (!caps.textTone) return undefined;
  const surfaceHex = approximateEffectiveSectionSurfaceHex(style, hiveCtx, branding);
  if (!surfaceHex) return undefined;
  const intended = intendedBodyColorForTextTone(style.textTone);
  const bgRgb = parseCssColorForContrast(surfaceHex);
  const fgRgb = parseCssColorForContrast(intended);
  if (!bgRgb || !fgRgb) return undefined;
  if (contrastRatioForContrast(fgRgb, bgRgb) >= 4.5) return undefined;
  const fixedHex = pickReadableTextOnBackgroundRgb(bgRgb);
  const fixedRgb = parseCssColorForContrast(fixedHex);
  if (!fixedRgb) return undefined;
  if (contrastRatioForContrast(fixedRgb, bgRgb) <= contrastRatioForContrast(fgRgb, bgRgb)) return undefined;
  if (contrastRatioForContrast(fixedRgb, bgRgb) < 4.2 && contrastRatioForContrast(fgRgb, bgRgb) >= 4.2) return undefined;
  return { color: fixedHex };
}

/**
 * **D (page).** Final readable homepage body text color (CSS variable consumer), against resolved page surface.
 */
export function resolveTenantPageRootReadableBodyTextColor(
  branding: Pick<TenantBrandingModel, 'textColor' | 'backgroundColor' | 'pageBackgroundImageUrl'>,
): string | null {
  const t = branding.textColor?.trim() || null;
  const bg = branding.backgroundColor?.trim() || null;
  const img = branding.pageBackgroundImageUrl?.trim();
  if (img) {
    if (!t) return '#0f172a';
    const fg = parseCssColorForContrast(t);
    if (fg && relativeLuminanceForContrast(fg) > 0.58) return '#0f172a';
    return t;
  }
  if (t && bg) {
    const fixed = ensureTextReadableOnSolidBackground(t, bg);
    if (fixed) return fixed;
  }
  return t;
}

/** Hero card only — never uses `pageBackgroundImageUrl`. */
export function resolveHeroCardSurfaceStyle(
  branding: Pick<TenantBrandingModel, 'heroImageUrl'>,
  previewHeroBackgroundPosition: string | null | undefined,
): CSSProperties | undefined {
  const hero = branding.heroImageUrl?.trim();
  if (!hero) return undefined;
  return {
    backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url(${hero})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    ...(previewHeroBackgroundPosition?.trim()
      ? { backgroundPosition: previewHeroBackgroundPosition.trim() }
      : { backgroundPosition: 'center center' }),
  };
}
