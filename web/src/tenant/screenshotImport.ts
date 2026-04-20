import { parseHomeSectionsList, type TenantHomeSectionKey } from './tenantSiteConfig';
import { callAnalyzeTenantSiteScreenshot } from '../api/tenantSiteScreenshotImportApi';
import type { ScreenshotDerivedSiteConfigImportInput } from './tenantSiteConfigImport';

type Rgb = { r: number; g: number; b: number };

export type ScreenshotAnalysisConfidence = 'low' | 'medium' | 'high';

export type ScreenshotAnalysisResult = {
  payload: ScreenshotDerivedSiteConfigImportInput;
  diagnostics: {
    sectionConfidence: ScreenshotAnalysisConfidence;
    textConfidence: ScreenshotAnalysisConfidence;
    paletteConfidence: ScreenshotAnalysisConfidence;
    notes: string[];
    extractionSource?: 'local' | 'cloud';
    extractorModel?: string;
    warnings?: string[];
  };
};

export type ScreenshotAnalysisOptions = {
  fallbackSectionOrder?: TenantHomeSectionKey[];
};

const SCREENSHOT_SECTION_ORDER_FALLBACK: TenantHomeSectionKey[] = ['hero', 'featuredCars', 'about', 'benefits', 'contact'];

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

function normalizeCallableMime(mime: string): string {
  const t = (mime || 'image/jpeg').toLowerCase();
  if (t === 'image/jpeg' || t === 'image/png' || t === 'image/webp' || t === 'image/gif') {
    return t;
  }
  return 'image/jpeg';
}

async function readFileAsBase64Parts(file: File): Promise<{ imageBase64: string; mimeType: string }> {
  if (file.size === 0 || file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error(`Image must be 1 byte–${MAX_SCREENSHOT_BYTES} bytes`);
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      const m = /^data:([^;]+);base64,(.*)$/i.exec(s);
      if (!m) {
        reject(new Error('Could not read image as base64'));
        return;
      }
      resolve({
        imageBase64: m[2].replace(/\s/g, ''),
        mimeType: normalizeCallableMime(m[1] || 'image/jpeg'),
      });
    };
    r.onerror = () => reject(r.error ?? new Error('Failed reading image'));
    r.readAsDataURL(file);
  });
}

/**
 * Primary path: Claude vision via Cloud Function (admin-only). Falls back to local heuristics on failure.
 */
export async function runScreenshotAnalysisPreferringCloud(
  imageFile: File,
  options?: ScreenshotAnalysisOptions,
): Promise<ScreenshotAnalysisResult> {
  try {
    const { imageBase64, mimeType } = await readFileAsBase64Parts(imageFile);
    const res = await callAnalyzeTenantSiteScreenshot(imageBase64, mimeType);
    if (!res?.ok || res.payload === undefined) {
      throw new Error('Invalid analyzer response');
    }
    const payload = res.payload as ScreenshotDerivedSiteConfigImportInput;
    const notes = [...(res.diagnostics?.notes ?? [])];
    if (res.diagnostics?.warnings?.length) {
      for (const w of res.diagnostics.warnings) {
        notes.push(`Warning: ${w}`);
      }
    }
    return {
      payload,
      diagnostics: {
        paletteConfidence: 'high',
        sectionConfidence: 'high',
        textConfidence: 'high',
        notes,
        extractionSource: 'cloud',
        extractorModel: res.diagnostics?.model,
        warnings: res.diagnostics?.warnings,
      },
    };
  } catch (e) {
    console.warn('runScreenshotAnalysisPreferringCloud: falling back to local heuristics', e);
    return runScreenshotAnalysis(imageFile, options);
  }
}

function clamp8(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function componentToHex(v: number): string {
  return clamp8(v).toString(16).padStart(2, '0');
}

function rgbToHex(rgb: Rgb): string {
  return `#${componentToHex(rgb.r)}${componentToHex(rgb.g)}${componentToHex(rgb.b)}`;
}

function normalizeHex(hex: string): string {
  const v = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  return '#1f2937';
}

function luminance(rgb: Rgb): number {
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function loadImageBitmap(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => null);
  }
  return Promise.resolve(null);
}

async function decodeImage(file: File): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');

  const bm = await loadImageBitmap(file);
  if (bm) {
    const scale = Math.min(1, 1200 / Math.max(bm.width, bm.height));
    canvas.width = Math.max(1, Math.round(bm.width * scale));
    canvas.height = Math.max(1, Math.round(bm.height * scale));
    ctx.drawImage(bm, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, data: pixels };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(fr.error ?? new Error('Failed reading image'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image decode failed'));
    el.src = dataUrl;
  });
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, data: pixels };
}

function quantizeColor(c: Rgb): string {
  const q = (v: number) => Math.round(v / 24) * 24;
  return `${q(c.r)}-${q(c.g)}-${q(c.b)}`;
}

function extractPalette(data: Uint8ClampedArray): { primary: Rgb; secondary: Rgb; accent: Rgb; confidence: ScreenshotAnalysisConfidence } {
  const bins = new Map<string, { color: Rgb; count: number; sat: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const a = data[i + 3] ?? 255;
    if (a < 20) continue;
    const color = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const key = quantizeColor(color);
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const prev = bins.get(key);
    if (prev) {
      prev.count += 1;
      prev.sat += sat;
    } else {
      bins.set(key, { color, count: 1, sat });
    }
  }

  const ranked = [...bins.values()].sort((a, b) => b.count - a.count);
  if (ranked.length === 0) {
    return {
      primary: { r: 31, g: 41, b: 55 },
      secondary: { r: 71, g: 85, b: 105 },
      accent: { r: 14, g: 165, b: 233 },
      confidence: 'low',
    };
  }
  const primary = ranked[0].color;
  const secondary = ranked.find((c) => colorDistance(c.color, primary) > 42)?.color ?? ranked[Math.min(1, ranked.length - 1)].color;
  const accentCandidate = [...ranked]
    .filter((c) => colorDistance(c.color, primary) > 40)
    .sort((a, b) => b.sat / Math.max(1, b.count) - a.sat / Math.max(1, a.count))[0];
  const accent = accentCandidate?.color ?? secondary;
  const confidence: ScreenshotAnalysisConfidence = ranked.length >= 4 ? 'high' : ranked.length >= 2 ? 'medium' : 'low';
  return { primary, secondary, accent, confidence };
}

function inferSections(_: { width: number; height: number }, fallbackOrder: TenantHomeSectionKey[]): TenantHomeSectionKey[] {
  return parseHomeSectionsList(fallbackOrder.length ? fallbackOrder : SCREENSHOT_SECTION_ORDER_FALLBACK);
}

export async function runScreenshotAnalysis(
  imageFile: File,
  options?: ScreenshotAnalysisOptions,
): Promise<ScreenshotAnalysisResult> {
  const decoded = await decodeImage(imageFile);
  const palette = extractPalette(decoded.data);
  const sections = inferSections(decoded, options?.fallbackSectionOrder ?? SCREENSHOT_SECTION_ORDER_FALLBACK);

  const payload: ScreenshotDerivedSiteConfigImportInput = {
    branding: {
      primaryColor: normalizeHex(rgbToHex(palette.primary)),
      secondaryColor: normalizeHex(rgbToHex(palette.secondary)),
      accentColor: normalizeHex(rgbToHex(palette.accent)),
    },
    layout: {
      homeSections: sections,
    },
  };

  return {
    payload,
    diagnostics: {
      paletteConfidence: palette.confidence,
      sectionConfidence: 'low',
      textConfidence: 'low',
      notes: [
        'Text extraction is conservative; low-confidence OCR is intentionally omitted.',
        'Section detection uses canonical fallback order when uncertain.',
      ],
      extractionSource: 'local',
    },
  };
}
