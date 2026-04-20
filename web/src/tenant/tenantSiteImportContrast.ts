import type { TenantSiteConfigWritePayload } from '../api/tenantSiteConfigsApi';
import { TENANT_HOME_SECTION_KEYS } from './tenantSiteConfig';
import {
  contrastRatioForContrast,
  parseCssColorForContrast,
  resolveTenantPageRootReadableBodyTextColor,
} from './tenantVisualResolver';

type Rgb = { r: number; g: number; b: number };

export type RuntimeTenantTextContrastInput = {
  textColor: string | null;
  backgroundColor: string | null;
  pageBackgroundImageUrl: string | null;
};

/**
 * Builder + live homepage: keep body text readable against solid page color or busy page photo.
 * Delegates to {@link resolveTenantPageRootReadableBodyTextColor}.
 */
export function resolveRuntimeTenantTextColor(params: RuntimeTenantTextContrastInput): string | null {
  return resolveTenantPageRootReadableBodyTextColor(params);
}

/**
 * Central import-time guardrail: align `textColor` with {@link resolveTenantPageRootReadableBodyTextColor}
 * (solid pair + busy page photo), without persisting resolver-only metadata.
 */
export function applyTenantSiteImportContrastGuardrails(patch: TenantSiteConfigWritePayload): TenantSiteConfigWritePayload {
  if (!patch.branding || typeof patch.branding !== 'object') return patch;
  const branding = { ...(patch.branding as Record<string, unknown>) };
  const imgRaw = branding.pageBackgroundImageUrl;
  const img = typeof imgRaw === 'string' && imgRaw.trim() ? imgRaw.trim() : '';
  const before =
    typeof branding.textColor === 'string' && branding.textColor.trim() ? branding.textColor.trim() : null;
  const bgRaw = branding.backgroundColor;
  const bg = typeof bgRaw === 'string' && bgRaw.trim() ? bgRaw.trim() : null;
  const resolved = resolveTenantPageRootReadableBodyTextColor({
    textColor: before,
    backgroundColor: bg,
    pageBackgroundImageUrl: img || null,
  });
  if (resolved === before) return patch;
  if (resolved != null) {
    branding.textColor = resolved;
    return { ...patch, branding };
  }
  return patch;
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
    const bgRgb = parseCssColorForContrast(sur);
    if (!bgRgb) {
      delete rec.sectionBackgroundColor;
      ss[key] = rec;
      changed = true;
      continue;
    }
    const tone = typeof rec.textTone === 'string' ? rec.textTone.trim() : 'default';
    if (tone === 'inverse') {
      if (contrastRatioForContrast(lightFg, bgRgb) < 4.2) {
        rec.textTone = 'default';
        changed = true;
      }
    } else if (tone === 'default' || tone === 'muted') {
      if (contrastRatioForContrast(body, bgRgb) < 4.2) {
        if (contrastRatioForContrast(lightFg, bgRgb) >= 4.2) {
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
