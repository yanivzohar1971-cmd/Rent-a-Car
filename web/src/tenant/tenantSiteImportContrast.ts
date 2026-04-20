import type { TenantSiteConfigWritePayload } from '../api/tenantSiteConfigsApi';
import { TENANT_HOME_SECTION_KEYS } from './tenantSiteConfig';

type Rgb = { r: number; g: number; b: number };

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseCssColor(input: string): Rgb | null {
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

function relativeLuminance(rgb: Rgb): number {
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function pickReadableTextOnBackground(bg: Rgb): string {
  const white: Rgb = { r: 255, g: 255, b: 255 };
  const nearBlack: Rgb = { r: 15, g: 23, b: 42 };
  const cw = contrastRatio(white, bg);
  const cb = contrastRatio(nearBlack, bg);
  return cw >= cb ? '#ffffff' : '#0f172a';
}

function ensureTextReadableOnSolidBackground(textCss: string, bgCss: string): string | null {
  const fg = parseCssColor(textCss);
  const bg = parseCssColor(bgCss);
  if (!fg || !bg) return null;
  if (contrastRatio(fg, bg) >= 4.5) return textCss;
  return pickReadableTextOnBackground(bg);
}

export type RuntimeTenantTextContrastInput = {
  textColor: string | null;
  backgroundColor: string | null;
  pageBackgroundImageUrl: string | null;
};

/**
 * Builder + live homepage: keep body text readable against solid page color or busy page photo.
 */
export function resolveRuntimeTenantTextColor(params: RuntimeTenantTextContrastInput): string | null {
  const t = params.textColor?.trim() || null;
  const bg = params.backgroundColor?.trim() || null;
  const img = params.pageBackgroundImageUrl?.trim();
  if (img) {
    if (!t) return '#0f172a';
    const fg = parseCssColor(t);
    if (fg && relativeLuminance(fg) > 0.58) return '#0f172a';
    return t;
  }
  if (t && bg) {
    const fixed = ensureTextReadableOnSolidBackground(t, bg);
    if (fixed) return fixed;
  }
  return t;
}

/**
 * Central import-time guardrail: keep explicit `textColor` readable against `backgroundColor`
 * when both are present and parseable.
 */
export function applyTenantSiteImportContrastGuardrails(patch: TenantSiteConfigWritePayload): TenantSiteConfigWritePayload {
  if (!patch.branding || typeof patch.branding !== 'object') return patch;
  const branding = { ...(patch.branding as Record<string, unknown>) };
  const tcRaw = branding.textColor;
  const bgRaw = branding.backgroundColor;
  if (typeof tcRaw !== 'string' || typeof bgRaw !== 'string') return patch;
  const tc = tcRaw.trim();
  const bgc = bgRaw.trim();
  if (!tc || !bgc) return patch;
  const fixed = ensureTextReadableOnSolidBackground(tc, bgc);
  if (!fixed || fixed === tc) return patch;
  branding.textColor = fixed;
  return { ...patch, branding };
}

/**
 * When imports set a custom section fill, align `textTone` so default body copy stays readable.
 */
export function applyTenantSiteImportSectionContrastGuardrails(patch: TenantSiteConfigWritePayload): TenantSiteConfigWritePayload {
  if (!patch.layout || typeof patch.layout !== 'object') return patch;
  const layout = { ...(patch.layout as Record<string, unknown>) };
  const ssRaw = layout.sectionStyles;
  if (typeof ssRaw !== 'object' || ssRaw === null) return patch;
  const ss = { ...(ssRaw as Record<string, unknown>) };
  let changed = false;
  const body: Rgb = { r: 15, g: 23, b: 42 };
  const lightFg: Rgb = { r: 248, g: 250, b: 252 };

  for (const key of TENANT_HOME_SECTION_KEYS) {
    if (key === 'hero') continue;
    const sec = ss[key];
    if (typeof sec !== 'object' || sec === null) continue;
    const rec = { ...(sec as Record<string, unknown>) };
    const sur = typeof rec.sectionBackgroundColor === 'string' ? rec.sectionBackgroundColor.trim() : '';
    if (!sur) continue;
    const bgRgb = parseCssColor(sur);
    if (!bgRgb) {
      delete rec.sectionBackgroundColor;
      ss[key] = rec;
      changed = true;
      continue;
    }
    const tone = typeof rec.textTone === 'string' ? rec.textTone.trim() : 'default';
    if (tone === 'inverse') {
      if (contrastRatio(lightFg, bgRgb) < 4.2) {
        rec.textTone = 'default';
        changed = true;
      }
    } else if (tone === 'default' || tone === 'muted') {
      if (contrastRatio(body, bgRgb) < 4.2) {
        if (contrastRatio(lightFg, bgRgb) >= 4.2) {
          rec.textTone = 'inverse';
        } else {
          rec.textTone = 'muted';
        }
        changed = true;
      }
    }
    ss[key] = rec;
  }

  if (!changed) return patch;
  return { ...patch, layout: { ...layout, sectionStyles: ss } };
}

export function applyTenantSiteImportVisualGuardrails(patch: TenantSiteConfigWritePayload): TenantSiteConfigWritePayload {
  let next = applyTenantSiteImportContrastGuardrails(patch);
  next = applyTenantSiteImportSectionContrastGuardrails(next);
  return next;
}
