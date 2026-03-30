import type { CSSProperties } from 'react';

import { getPresetByKey } from './sectionColorPresets';

/** Four derived tones from one section accent base (deterministic, sRGB). */
export type SectionHivePalette = {
  strong: string;
  medium: string;
  soft: string;
  surface: string;
};

const WHITE = { r: 255, g: 255, b: 255 };
const NEAR_BLACK = { r: 15, g: 23, b: 42 };

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: clamp255(a.r + (b.r - a.r) * u),
    g: clamp255(a.g + (b.g - a.g) * u),
    b: clamp255(a.b + (b.b - a.b) * u),
  };
}

export function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

function hexToRgbInternal(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return null;
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function normalizeAccentBaseColor(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  let body = t.startsWith('#') ? t.slice(1) : t;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(body)) return null;
  if (body.length === 3) {
    body = [...body].map((c) => c + c).join('');
  }
  return `#${body.toLowerCase()}`;
}

const WHITE_RGB_MIX = { r: 255, g: 255, b: 255 };
const NEAR_BLACK_MIX = { r: 15, g: 15, b: 15 };

/** Tune derived accent base for theme accent intensity (deterministic, no new deps). */
export function adjustAccentHexForStrategyIntensity(
  hex: string,
  intensity: 'soft' | 'balanced' | 'strong',
): string | null {
  const norm = normalizeAccentBaseColor(hex);
  if (!norm) return null;
  const rgb = hexToRgbInternal(norm);
  if (!rgb) return null;
  if (intensity === 'balanced') return norm;
  if (intensity === 'soft') return rgbToHexInternal(mixRgb(rgb, WHITE_RGB_MIX, 0.14));
  return rgbToHexInternal(mixRgb(rgb, NEAR_BLACK_MIX, 0.1));
}

function rgbToHexInternal(rgb: { r: number; g: number; b: number }): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of `rgb` as background with #ffffff foreground. */
export function contrastWithWhite(rgb: { r: number; g: number; b: number }): number {
  const L2 = relativeLuminance(rgb);
  return (1 + 0.05) / (L2 + 0.05);
}

/** WCAG 2.1 contrast ratio (1–21) for two #rrggbb colors; lighter vs darker order handled internally. */
export function getContrastRatio(hex1: string, hex2: string): number | null {
  const n1 = normalizeAccentBaseColor(hex1);
  const n2 = normalizeAccentBaseColor(hex2);
  if (!n1 || !n2) return null;
  const rgb1 = hexToRgbInternal(n1);
  const rgb2 = hexToRgbInternal(n2);
  if (!rgb1 || !rgb2) return null;
  const L1 = relativeLuminance(rgb1);
  const L2 = relativeLuminance(rgb2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when the accent base is dark enough that default (dark) body text on hive surfaces may need inverse tone. */
export function isColorDark(hex: string): boolean {
  const norm = normalizeAccentBaseColor(hex);
  if (!norm) return false;
  const rgb = hexToRgbInternal(norm);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.45;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
      default:
        break;
    }
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let hn = (h / 360) % 1;
  if (hn < 0) hn += 1;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  return { r: clamp255(r * 255), g: clamp255(g * 255), b: clamp255(b * 255) };
}

/**
 * Builds a coherent 4-tone family from a single hex base.
 * Strong is darkened until contrast vs white is at least `minStrongContrast` (for CTA fill + white label).
 */
export function deriveSectionHivePalette(baseHex: string, minStrongContrast = 4.5): SectionHivePalette | null {
  const norm = normalizeAccentBaseColor(baseHex);
  if (!norm) return null;
  const baseRgb = hexToRgbInternal(norm);
  if (!baseRgb) return null;

  const baseLum = relativeLuminance(baseRgb);

  const surfaceRgb = mixRgb(baseRgb, WHITE, 0.91);
  const softRgb = mixRgb(baseRgb, WHITE, 0.76);

  let { h, s, l } = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);
  if (s < 0.06) s = 0.12;
  s = Math.min(0.75, s * 0.9);
  const medL = 0.52 + (l - 0.5) * 0.22;
  let mediumRgb = hslToRgb(h, s, Math.max(0.4, Math.min(0.58, Math.max(0.4, medL))));

  let sStrong = Math.min(0.92, Math.max(0.15, s + 0.08));
  let lStrong = Math.min(0.42, l * 0.48 + 0.06);
  if (baseLum > 0.82) lStrong = Math.min(lStrong, 0.34);
  if (baseLum < 0.08) lStrong = Math.max(lStrong, 0.35);

  let strongRgb = hslToRgb(h, sStrong, lStrong);
  let guard = 0;
  while (contrastWithWhite(strongRgb) < minStrongContrast && lStrong > 0.085 && guard < 28) {
    lStrong *= 0.93;
    strongRgb = hslToRgb(h, sStrong, lStrong);
    guard++;
  }
  if (contrastWithWhite(strongRgb) < minStrongContrast) {
    strongRgb = mixRgb(strongRgb, NEAR_BLACK, 0.42);
    let g2 = 0;
    while (contrastWithWhite(strongRgb) < minStrongContrast && g2 < 12) {
      strongRgb = mixRgb(strongRgb, NEAR_BLACK, 0.22);
      g2++;
    }
  }

  if (relativeLuminance(surfaceRgb) < 0.88) {
    const bumped = mixRgb(surfaceRgb, WHITE, 0.35);
    Object.assign(surfaceRgb, bumped);
  }
  Object.assign(softRgb, mixRgb(softRgb, surfaceRgb, 0.12));

  mediumRgb = mixRgb(mediumRgb, mixRgb(baseRgb, NEAR_BLACK, 0.08), 0.55);

  return {
    strong: rgbToHex(strongRgb),
    medium: rgbToHex(mediumRgb),
    soft: rgbToHex(softRgb),
    surface: rgbToHex(surfaceRgb),
  };
}

/**
 * Single contract for section hive color (preview, live, builder, smart defaults, contrast).
 *
 * **Product rule:** per-section hive CSS (`--section-hive-*` / `tenant-section-hive`) applies only when
 * the admin set a **custom** `accentBaseColor` or a **valid** `colorPreset`. Tenant primary alone does
 * **not** activate a per-section hive; global CSS uses `--tenant-primary-color` for non-hive soft/accent.
 *
 * `tenantPrimaryHex` is normalized when `tenantPrimaryFallback` is provided; used for global backgrounds
 * and picker/chip previews, not merged into `hiveBaseHex`.
 */
export type SectionHiveColorSourceKind = 'custom' | 'preset' | 'none';

export type ResolvedSectionHiveColorContext = {
  kind: SectionHiveColorSourceKind;
  /** #rrggbb for `--section-hive-*`; null ⇒ no per-section hive (live + preview agree). */
  hiveBaseHex: string | null;
  customHex: string | null;
  presetKey: string | null;
  tenantPrimaryHex: string | null;
};

export function resolveSectionHiveColorContext(
  style: { accentBaseColor?: string | null; colorPreset?: string | null },
  tenantPrimaryFallback?: string | null,
): ResolvedSectionHiveColorContext {
  const tenantPrimaryHex = normalizeAccentBaseColor(
    tenantPrimaryFallback != null && String(tenantPrimaryFallback).trim() !== ''
      ? String(tenantPrimaryFallback)
      : null,
  );

  const customHex = normalizeAccentBaseColor(style.accentBaseColor);
  if (customHex) {
    return {
      kind: 'custom',
      hiveBaseHex: customHex,
      customHex,
      presetKey: null,
      tenantPrimaryHex,
    };
  }

  const presetKeyRaw = typeof style.colorPreset === 'string' ? style.colorPreset.trim() : '';
  if (presetKeyRaw) {
    const preset = getPresetByKey(presetKeyRaw);
    if (preset) {
      const hive = normalizeAccentBaseColor(preset.baseColor);
      if (hive) {
        return {
          kind: 'preset',
          hiveBaseHex: hive,
          customHex: null,
          presetKey: presetKeyRaw,
          tenantPrimaryHex,
        };
      }
    }
  }

  return {
    kind: 'none',
    hiveBaseHex: null,
    customHex: null,
    presetKey: null,
    tenantPrimaryHex,
  };
}

/** Custom hex or valid preset base only — never tenant primary. */
export function resolveSectionHiveExplicitAccent(style: {
  accentBaseColor?: string | null;
  colorPreset?: string | null;
}): string | null {
  return resolveSectionHiveColorContext(style, null).hiveBaseHex;
}

/** CSS custom properties for section roots when `hiveBaseHex` is set. */
export function sectionHiveCssProperties(accentBaseColor: string | null | undefined): CSSProperties | undefined {
  if (accentBaseColor == null || accentBaseColor === '') return undefined;
  const palette = deriveSectionHivePalette(accentBaseColor);
  if (!palette) return undefined;
  return {
    '--section-hive-strong': palette.strong,
    '--section-hive-medium': palette.medium,
    '--section-hive-soft': palette.soft,
    '--section-hive-surface': palette.surface,
  } as CSSProperties;
}

/** Applies hive vars from unified context (no-op when `kind === 'none'`). */
export function sectionHiveShellCssProperties(ctx: ResolvedSectionHiveColorContext): CSSProperties | undefined {
  return sectionHiveCssProperties(ctx.hiveBaseHex);
}
