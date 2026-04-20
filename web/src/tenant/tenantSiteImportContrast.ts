import type { TenantSiteConfigWritePayload } from '../api/tenantSiteConfigsApi';

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
  const fg = parseCssColor(tc);
  const bg = parseCssColor(bgc);
  if (!fg || !bg) return patch;
  if (contrastRatio(fg, bg) >= 4.5) return patch;
  branding.textColor = pickReadableTextOnBackground(bg);
  return { ...patch, branding };
}
