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

function darkenRgb(base: Rgb, amount: number): Rgb {
  return mixRgb(base, NEAR_BLACK, Math.max(0, Math.min(1, amount)));
}

export type TenantRendererBrandColors = {
  rendererFinalPrimary: string;
  rendererFinalAccent: string;
  rendererUsingFallbackAccent: boolean;
};

/**
 * Runtime renderer colors: primary must dominate visual hierarchy.
 * Accent falls back to a darker primary variant (never neutral gray fallback).
 */
export function resolveTenantRendererBrandColors(branding: TenantBrandingModel): TenantRendererBrandColors {
  const primaryRaw = branding.theme.primaryColor?.trim() || branding.theme.secondaryColor?.trim() || '#0ea5e9';
  const primaryRgb = parseCssColorForContrast(primaryRaw) ?? parseCssColorForContrast('#0ea5e9') ?? { r: 14, g: 165, b: 233 };
  const primaryHex = rgbToHex(primaryRgb);
  const accentRaw = branding.theme.accentColor?.trim() || '';
  if (accentRaw) {
    return {
      rendererFinalPrimary: primaryHex,
      rendererFinalAccent: accentRaw,
      rendererUsingFallbackAccent: false,
    };
  }
  const fallbackAccent = rgbToHex(darkenRgb(primaryRgb, 0.15));
  return {
    rendererFinalPrimary: primaryHex,
    rendererFinalAccent: fallbackAccent,
    rendererUsingFallbackAccent: true,
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

/** Fixed contact strip in `TenantHomeBlocks.css` uses gradients; single sRGB hex for contrast checks only. */
const CONTACT_PANEL_SURFACE_LIGHT = '#e2e8f0';
const CONTACT_PANEL_SURFACE_DARK = '#172033';

const CONTACT_CRITICAL_CONTRAST_MIN = 4.5;
/** Large UI / borders: relaxed vs body text (still visible on noisy themes). */
const CONTACT_EDGE_CONTRAST_MIN = 2.75;

function pickFirstColorMeetingContrast(bgRgb: Rgb, candidates: string[], minRatio: number): string | null {
  for (const raw of candidates) {
    const t = raw?.trim();
    if (!t) continue;
    const fg = parseCssColorForContrast(t);
    if (!fg) continue;
    if (contrastRatioForContrast(fg, bgRgb) >= minRatio) return t;
  }
  return null;
}

export function approximateTenantContactPanelSurfaceHex(textToneInverse: boolean): string {
  return textToneInverse ? CONTACT_PANEL_SURFACE_DARK : CONTACT_PANEL_SURFACE_LIGHT;
}

export type TenantContactPanelCriticalUi = {
  emailColor: string;
  ghost: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    hoverBackgroundColor: string;
    hoverBorderColor: string;
    hoverColor: string;
  };
};

export type TenantGhostCtaUi = TenantContactPanelCriticalUi['ghost'];

function resolveGhostUiOnBackgroundRgb(
  bgRgb: Rgb,
  branding: TenantBrandingModel,
  textToneInverse: boolean,
): TenantGhostCtaUi {
  const hardBody = textToneInverse ? '#ffffff' : '#111111';
  const primary = branding.theme.primaryColor?.trim() ?? '';
  const secondary = branding.theme.secondaryColor?.trim() ?? '';
  const accent = branding.theme.accentColor?.trim() ?? '';

  const ghostColor =
    pickFirstColorMeetingContrast(bgRgb, [secondary, accent, primary, hardBody], CONTACT_CRITICAL_CONTRAST_MIN) ||
    pickReadableTextOnBackgroundRgb(bgRgb);

  const accentRgb = accent ? parseCssColorForContrast(accent) : null;
  const accentOkForBorder =
    accentRgb != null && contrastRatioForContrast(accentRgb, bgRgb) >= CONTACT_EDGE_CONTRAST_MIN ? accent : null;
  let ghostBorder =
    accentOkForBorder ?? (textToneInverse ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)');
  const borderRgb = parseCssColorForContrast(ghostBorder);
  if (!borderRgb || contrastRatioForContrast(borderRgb, bgRgb) < CONTACT_EDGE_CONTRAST_MIN) {
    ghostBorder = textToneInverse ? 'rgba(255,255,255,0.52)' : 'rgba(15,23,42,0.42)';
  }

  const ghostBg = textToneInverse ? 'rgba(255,255,255,0.1)' : '#ffffff';
  const ghostHoverBg = textToneInverse ? 'rgba(255,255,255,0.18)' : '#f1f5f9';
  const ghostHoverBorder =
    accentOkForBorder ?? (textToneInverse ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)');

  const hoverBgApproxHex = textToneInverse ? '#2c384d' : '#f1f5f9';
  const hoverBgRgb = parseCssColorForContrast(hoverBgApproxHex) ?? bgRgb;
  const ghostHoverColor =
    pickFirstColorMeetingContrast(hoverBgRgb, [ghostColor, secondary, accent, primary, hardBody], CONTACT_CRITICAL_CONTRAST_MIN) ||
    ghostColor;

  return {
    color: ghostColor,
    backgroundColor: ghostBg,
    borderColor: ghostBorder,
    hoverBackgroundColor: ghostHoverBg,
    hoverBorderColor: ghostHoverBorder,
    hoverColor: ghostHoverColor,
  };
}

/** Inline style + hover CSS vars (same contract as contact ghost CTA). */
export function tenantGhostCtaInlineStyleFromUi(ghost: TenantGhostCtaUi): CSSProperties {
  return {
    color: ghost.color,
    backgroundColor: ghost.backgroundColor,
    borderColor: ghost.borderColor,
    borderWidth: 1,
    borderStyle: 'solid',
    opacity: 1,
    ['--tenant-contact-ghost-hover-bg' as string]: ghost.hoverBackgroundColor,
    ['--tenant-contact-ghost-hover-border' as string]: ghost.hoverBorderColor,
    ['--tenant-contact-ghost-hover-color' as string]: ghost.hoverColor,
  };
}

/**
 * Ghost/outline CTA on an arbitrary section surface (map, prose blocks, etc.).
 * Falls back to light card (#fff) or inverse shell when `surfaceCssHex` is missing.
 */
export function resolveTenantGhostCtaOnSurfaceHex(
  branding: TenantBrandingModel,
  surfaceCssHex: string | null | undefined,
  textToneInverse: boolean,
): TenantGhostCtaUi {
  const fallbackHex = textToneInverse ? CONTACT_PANEL_SURFACE_DARK : '#ffffff';
  const hex = (typeof surfaceCssHex === 'string' && surfaceCssHex.trim()) || fallbackHex;
  const bgRgb = parseCssColorForContrast(hex.trim()) ?? parseCssColorForContrast(fallbackHex);
  if (!bgRgb) {
    const hardBody = textToneInverse ? '#ffffff' : '#111111';
    return {
      color: hardBody,
      backgroundColor: textToneInverse ? 'rgba(255,255,255,0.1)' : '#ffffff',
      borderColor: textToneInverse ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)',
      hoverBackgroundColor: textToneInverse ? 'rgba(255,255,255,0.18)' : '#f1f5f9',
      hoverBorderColor: textToneInverse ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)',
      hoverColor: hardBody,
    };
  }
  return resolveGhostUiOnBackgroundRgb(bgRgb, branding, textToneInverse);
}

/**
 * Hero primary pill: ensure label contrast vs theme accent/primary (handles very light brand colors).
 * When {@link TenantBrandingModel.primaryCtaBackgroundColor} is set (URL research), prefer it with optional explicit text color.
 */
export function resolveHeroPrimaryCtaContrastedStyle(branding: TenantBrandingModel): CSSProperties {
  const detectedBg = branding.primaryCtaBackgroundColor?.trim();
  const detectedFg = branding.primaryCtaTextColor?.trim();
  const finalColors = resolveTenantRendererBrandColors(branding);
  const rawBg = detectedBg || finalColors.rendererFinalPrimary;
  const bgRgb = parseCssColorForContrast(rawBg);
  if (!bgRgb) {
    return { color: detectedFg || '#ffffff', backgroundColor: rawBg };
  }
  if (detectedFg) {
    const fgRgb = parseCssColorForContrast(detectedFg);
    if (fgRgb && contrastRatioForContrast(fgRgb, bgRgb) >= 3) {
      return {
        color: detectedFg,
        backgroundColor: rawBg,
        border: '1px solid rgba(15,23,42,0.14)',
        opacity: 1,
      };
    }
  }
  const whiteOk = contrastRatioForContrast(WHITE, bgRgb);
  if (whiteOk >= 4.5) {
    return {
      color: '#ffffff',
      backgroundColor: rawBg,
      border: '1px solid rgba(255,255,255,0.2)',
      opacity: 1,
    };
  }
  const dark = '#0f172a';
  const darkRgb = parseCssColorForContrast(dark) ?? NEAR_BLACK;
  const darkOk = contrastRatioForContrast(darkRgb, bgRgb);
  const fg = darkOk >= 4.5 ? dark : pickReadableTextOnBackgroundRgb(bgRgb);
  return {
    color: fg,
    backgroundColor: rawBg,
    border: '1px solid rgba(15,23,42,0.18)',
    opacity: 1,
  };
}

/**
 * Contrast guard for the tenant home **contact** strip only (mailto + ghost CTA).
 * Theme order: primary → secondary → accent, then `#111` / `#fff` / auto pickReadable.
 */
export function resolveTenantContactPanelCriticalUi(
  branding: TenantBrandingModel,
  textToneInverse: boolean,
): TenantContactPanelCriticalUi {
  const bgHex = approximateTenantContactPanelSurfaceHex(textToneInverse);
  const bgRgb = parseCssColorForContrast(bgHex);
  const hardBody = textToneInverse ? '#ffffff' : '#111111';

  if (!bgRgb) {
    return {
      emailColor: hardBody,
      ghost: {
        color: hardBody,
        backgroundColor: textToneInverse ? 'rgba(255,255,255,0.1)' : '#ffffff',
        borderColor: textToneInverse ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.2)',
        hoverBackgroundColor: textToneInverse ? 'rgba(255,255,255,0.18)' : '#f1f5f9',
        hoverBorderColor: textToneInverse ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)',
        hoverColor: hardBody,
      },
    };
  }

  const primary = branding.theme.primaryColor?.trim() ?? '';
  const secondary = branding.theme.secondaryColor?.trim() ?? '';
  const accent = branding.theme.accentColor?.trim() ?? '';

  const emailColor =
    pickFirstColorMeetingContrast(bgRgb, [DEFAULT_BODY_HEX, MUTED_BODY_HEX, hardBody, primary, secondary, accent], CONTACT_CRITICAL_CONTRAST_MIN) ||
    pickReadableTextOnBackgroundRgb(bgRgb);

  return {
    emailColor,
    ghost: resolveGhostUiOnBackgroundRgb(bgRgb, branding, textToneInverse),
  };
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
    backgroundImage: `url(${hero})`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    ...(previewHeroBackgroundPosition?.trim()
      ? { backgroundPosition: previewHeroBackgroundPosition.trim() }
      : { backgroundPosition: 'center center' }),
  };
}
