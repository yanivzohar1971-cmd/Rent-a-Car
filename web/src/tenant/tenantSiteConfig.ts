/**
 * Tenant site configuration normalization (Firestore `tenantSiteConfigs` → {@link NormalizedTenantSiteConfig}).
 * External and AI-generated JSON must go through `tenantSiteConfigImport.ts` before reaching builder state or writes.
 * @see docs/TENANT_SITE_CONFIG_IMPORT_CONTRACT.md
 */
import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import { getPresetByKey } from './sectionColorPresets';
import { getSectionThemePresetById } from './sectionThemePresets';
import { normalizeAccentBaseColor } from './sectionHivePalette';
import { getThemeBrandPresetByKey, type ThemeBrandPreset } from './themeBrandPresets';
import {
  normalizePackAccentStrategy,
  parsePersistedThemeAccentStrategy,
  serializeThemeAccentStrategyForFirestore,
  type NormalizedThemeAccentStrategy,
} from './themeAccentStrategy';

export const TENANT_HOME_SECTION_KEYS = [
  'hero',
  'featuredCars',
  'about',
  'benefits',
  'finance',
  'testimonials',
  'contact',
  'map',
] as const;

export type TenantHomeSectionKey = (typeof TENANT_HOME_SECTION_KEYS)[number];

const SECTION_KEY_SET = new Set<string>(TENANT_HOME_SECTION_KEYS);

export function isTenantHomeSectionKey(key: string): key is TenantHomeSectionKey {
  return SECTION_KEY_SET.has(key);
}

export type TenantThemeVariant = 'classic' | 'modern' | 'luxury' | 'minimal';

/** Where the active tenant logo URL was chosen from (additive metadata). */
export type TenantLogoSource = 'website' | 'yard' | 'manual';

/** Featured inventory block layout on the tenant homepage. */
export type TenantFeaturedCarsPresentation = 'grid' | 'carsCarousel';

const THEME_VARIANTS = new Set<TenantThemeVariant>(['classic', 'modern', 'luxury', 'minimal']);

/** Single source of truth for builder + import validation (order stable). */
export const CANONICAL_TENANT_THEME_VARIANTS: readonly TenantThemeVariant[] = ['classic', 'modern', 'luxury', 'minimal'];

const DEFAULT_SECTION_ORDER: TenantHomeSectionKey[] = [
  'hero',
  'featuredCars',
  'about',
  'benefits',
  'finance',
  'testimonials',
  'contact',
  'map',
];

export type TenantSectionBackgroundMode = 'default' | 'surface' | 'soft' | 'image' | 'accent';
export type TenantSectionTextTone = 'default' | 'muted' | 'inverse';
export type TenantSectionAlign = 'right' | 'center' | 'left';
export type TenantSectionLayoutVariant = 'default' | 'compact' | 'split' | 'highlight';
export type TenantSectionPaddingDensity = 'sm' | 'md' | 'lg';
export type TenantSectionCardStyle = 'default' | 'soft' | 'outline' | 'elevated';

/**
 * Per-section background photos are gated until Storage/UX is fully aligned.
 * Section background *color* ships independently.
 */
export const TENANT_SECTION_BACKGROUND_IMAGE_ENABLED = false;

const SECTION_BACKGROUND_MODES = new Set<TenantSectionBackgroundMode>(['default', 'surface', 'soft', 'image', 'accent']);
const SECTION_TEXT_TONES = new Set<TenantSectionTextTone>(['default', 'muted', 'inverse']);
const SECTION_ALIGNS = new Set<TenantSectionAlign>(['right', 'center', 'left']);
const SECTION_LAYOUT_VARIANTS = new Set<TenantSectionLayoutVariant>(['default', 'compact', 'split', 'highlight']);
const SECTION_PADDING_DENSITIES = new Set<TenantSectionPaddingDensity>(['sm', 'md', 'lg']);
const SECTION_CARD_STYLES = new Set<TenantSectionCardStyle>(['default', 'soft', 'outline', 'elevated']);

/** Import / carousel / extraction must use these literals only (invalid values sanitize to defaults). */
export const CANONICAL_TENANT_SECTION_BACKGROUND_MODES: readonly TenantSectionBackgroundMode[] = [
  'default',
  'surface',
  'soft',
  'image',
  'accent',
];
export const CANONICAL_TENANT_SECTION_TEXT_TONES: readonly TenantSectionTextTone[] = ['default', 'muted', 'inverse'];
export const CANONICAL_TENANT_SECTION_ALIGNS: readonly TenantSectionAlign[] = ['right', 'center', 'left'];
export const CANONICAL_TENANT_SECTION_LAYOUT_VARIANTS: readonly TenantSectionLayoutVariant[] = [
  'default',
  'compact',
  'split',
  'highlight',
];
export const CANONICAL_TENANT_SECTION_PADDING_DENSITIES: readonly TenantSectionPaddingDensity[] = ['sm', 'md', 'lg'];
export const CANONICAL_TENANT_SECTION_CARD_STYLES: readonly TenantSectionCardStyle[] = [
  'default',
  'soft',
  'outline',
  'elevated',
];

export interface TenantSectionStyle {
  backgroundMode: TenantSectionBackgroundMode;
  textTone: TenantSectionTextTone;
  align: TenantSectionAlign;
  layoutVariant: TenantSectionLayoutVariant;
  paddingDensity: TenantSectionPaddingDensity;
  cardStyle: TenantSectionCardStyle;
  /** Optional hive base (#rrggbb). When null/absent, global tenant color tokens apply. */
  accentBaseColor: string | null;
  /** Optional brand palette key; ignored when accentBaseColor is set. */
  colorPreset: string | null;
  /**
   * Optional solid fill for the section surface (additive; null keeps preset `backgroundMode` only).
   * Does not replace hero imagery — hero remains branding.heroImageUrl.
   */
  sectionBackgroundColor: string | null;
  /**
   * Optional section background photo (https). Applied only when {@link TENANT_SECTION_BACKGROUND_IMAGE_ENABLED} is true.
   */
  sectionBackgroundImageUrl: string | null;
  /**
   * Optional built-in section theme preset id (`sectionThemePresets`). `null` inherits page {@link NormalizedTenantLayout.defaultSectionThemePresetId} when set.
   */
  sectionThemePresetId: string | null;
}

export const DEFAULT_TENANT_SECTION_STYLE: TenantSectionStyle = {
  backgroundMode: 'default',
  textTone: 'default',
  align: 'right',
  layoutVariant: 'default',
  paddingDensity: 'md',
  cardStyle: 'default',
  accentBaseColor: null,
  colorPreset: null,
  sectionBackgroundColor: null,
  sectionBackgroundImageUrl: null,
  sectionThemePresetId: null,
};

export type TenantSectionStyleCapability = {
  background: boolean;
  textTone: boolean;
  align: boolean;
  density: boolean;
  layoutVariant: boolean;
  cardStyle: boolean;
  /** Per-section optional hive accent (single base → derived 4-tone family). */
  accentColor: boolean;
  /** Optional CSS color override on top of `backgroundMode`. */
  sectionBackgroundColor: boolean;
  /** Optional background image URL (gated globally at runtime). */
  sectionBackgroundImage: boolean;
};

export const TENANT_SECTION_STYLE_CAPABILITIES: Record<TenantHomeSectionKey, TenantSectionStyleCapability> = {
  hero: {
    background: false,
    textTone: false,
    align: false,
    density: false,
    layoutVariant: false,
    cardStyle: false,
    accentColor: false,
    sectionBackgroundColor: false,
    sectionBackgroundImage: false,
  },
  featuredCars: {
    background: true,
    textTone: true,
    align: true,
    density: true,
    layoutVariant: true,
    cardStyle: true,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
  about: {
    background: true,
    textTone: true,
    align: true,
    density: true,
    layoutVariant: true,
    cardStyle: true,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
  benefits: {
    background: true,
    textTone: true,
    align: true,
    density: true,
    layoutVariant: true,
    cardStyle: true,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
  finance: {
    background: true,
    textTone: true,
    align: true,
    density: true,
    layoutVariant: true,
    cardStyle: true,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
  testimonials: {
    background: true,
    textTone: true,
    align: true,
    density: true,
    layoutVariant: true,
    cardStyle: true,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
  contact: {
    background: true,
    textTone: true,
    align: true,
    density: true,
    layoutVariant: true,
    cardStyle: true,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
  map: {
    background: true,
    textTone: true,
    align: false,
    density: true,
    layoutVariant: false,
    cardStyle: false,
    accentColor: true,
    sectionBackgroundColor: true,
    sectionBackgroundImage: TENANT_SECTION_BACKGROUND_IMAGE_ENABLED,
  },
};

export function normalizeTenantSectionStyle(
  value: unknown,
  capabilities: TenantSectionStyleCapability,
): TenantSectionStyle {
  const rec = asRecord(value);
  const backgroundMode = asTrimmedString(rec.backgroundMode);
  const textTone = asTrimmedString(rec.textTone);
  const align = asTrimmedString(rec.align);
  const layoutVariant = asTrimmedString(rec.layoutVariant);
  const paddingDensity = asTrimmedString(rec.paddingDensity);
  const cardStyle = asTrimmedString(rec.cardStyle);

  const accentRaw = rec.accentBaseColor;
  const rawAccent =
    capabilities.accentColor && accentRaw != null && accentRaw !== ''
      ? normalizeAccentBaseColor(typeof accentRaw === 'string' ? accentRaw : String(accentRaw))
      : null;

  let colorPreset: string | null = null;
  if (capabilities.accentColor && !rawAccent) {
    const pr = rec.colorPreset;
    if (pr != null && pr !== '') {
      const key = typeof pr === 'string' ? pr.trim() : String(pr).trim();
      if (key && getPresetByKey(key)) colorPreset = key;
    }
  }

  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
  if (isDev && capabilities.accentColor) {
    const pr = rec.colorPreset;
    if (pr != null && pr !== '' && !rawAccent) {
      const key = typeof pr === 'string' ? pr.trim() : String(pr).trim();
      if (key && !getPresetByKey(key)) {
        console.warn('[normalizeTenantSectionStyle] Invalid colorPreset dropped:', key);
      }
    }
    if (rawAccent && pr != null && pr !== '') {
      const pk = typeof pr === 'string' ? pr.trim() : String(pr).trim();
      if (pk) console.warn('[normalizeTenantSectionStyle] accentBaseColor wins; dropping colorPreset from output:', pk);
    }
  }

  const sbRaw = rec.sectionBackgroundColor;
  let sectionBackgroundColor: string | null = null;
  if (capabilities.sectionBackgroundColor && sbRaw != null && sbRaw !== '') {
    const sc = typeof sbRaw === 'string' ? sbRaw.trim() : String(sbRaw).trim();
    if (sc) {
      const vr = validateColorInput(sc);
      if (vr.ok) sectionBackgroundColor = vr.value;
    }
  }

  let sectionBackgroundImageUrl: string | null = null;
  if (capabilities.sectionBackgroundImage && TENANT_SECTION_BACKGROUND_IMAGE_ENABLED) {
    const imgRaw = rec.sectionBackgroundImageUrl;
    if (imgRaw != null && imgRaw !== '') {
      const u = typeof imgRaw === 'string' ? imgRaw.trim() : String(imgRaw).trim();
      if (u) {
        const ur = validateOptionalUrl(u);
        if (ur.ok && ur.value) sectionBackgroundImageUrl = ur.value;
      }
    }
  }

  let sectionThemePresetId: string | null = null;
  const stpRaw = rec.sectionThemePresetId;
  if (stpRaw != null && stpRaw !== '') {
    const pk = typeof stpRaw === 'string' ? stpRaw.trim() : String(stpRaw).trim();
    if (pk && getSectionThemePresetById(pk)) sectionThemePresetId = pk;
  }

  return {
    backgroundMode:
      capabilities.background && backgroundMode && SECTION_BACKGROUND_MODES.has(backgroundMode as TenantSectionBackgroundMode)
        ? (backgroundMode as TenantSectionBackgroundMode)
        : DEFAULT_TENANT_SECTION_STYLE.backgroundMode,
    textTone:
      capabilities.textTone && textTone && SECTION_TEXT_TONES.has(textTone as TenantSectionTextTone)
        ? (textTone as TenantSectionTextTone)
        : DEFAULT_TENANT_SECTION_STYLE.textTone,
    align:
      capabilities.align && align && SECTION_ALIGNS.has(align as TenantSectionAlign)
        ? (align as TenantSectionAlign)
        : DEFAULT_TENANT_SECTION_STYLE.align,
    layoutVariant:
      capabilities.layoutVariant && layoutVariant && SECTION_LAYOUT_VARIANTS.has(layoutVariant as TenantSectionLayoutVariant)
        ? (layoutVariant as TenantSectionLayoutVariant)
        : DEFAULT_TENANT_SECTION_STYLE.layoutVariant,
    paddingDensity:
      capabilities.density && paddingDensity && SECTION_PADDING_DENSITIES.has(paddingDensity as TenantSectionPaddingDensity)
        ? (paddingDensity as TenantSectionPaddingDensity)
        : DEFAULT_TENANT_SECTION_STYLE.paddingDensity,
    cardStyle:
      capabilities.cardStyle && cardStyle && SECTION_CARD_STYLES.has(cardStyle as TenantSectionCardStyle)
        ? (cardStyle as TenantSectionCardStyle)
        : DEFAULT_TENANT_SECTION_STYLE.cardStyle,
    accentBaseColor: capabilities.accentColor ? rawAccent : DEFAULT_TENANT_SECTION_STYLE.accentBaseColor,
    colorPreset: capabilities.accentColor ? (rawAccent ? null : colorPreset) : DEFAULT_TENANT_SECTION_STYLE.colorPreset,
    sectionBackgroundColor: capabilities.sectionBackgroundColor ? sectionBackgroundColor : DEFAULT_TENANT_SECTION_STYLE.sectionBackgroundColor,
    sectionBackgroundImageUrl: capabilities.sectionBackgroundImage ? sectionBackgroundImageUrl : DEFAULT_TENANT_SECTION_STYLE.sectionBackgroundImageUrl,
    sectionThemePresetId,
  };
}

export function normalizeTenantSectionStylesRecord(
  value: unknown,
): Record<TenantHomeSectionKey, TenantSectionStyle> {
  const raw = asRecord(value);
  return {
    hero: normalizeTenantSectionStyle(raw.hero, TENANT_SECTION_STYLE_CAPABILITIES.hero),
    featuredCars: normalizeTenantSectionStyle(raw.featuredCars, TENANT_SECTION_STYLE_CAPABILITIES.featuredCars),
    about: normalizeTenantSectionStyle(raw.about, TENANT_SECTION_STYLE_CAPABILITIES.about),
    benefits: normalizeTenantSectionStyle(raw.benefits, TENANT_SECTION_STYLE_CAPABILITIES.benefits),
    finance: normalizeTenantSectionStyle(raw.finance, TENANT_SECTION_STYLE_CAPABILITIES.finance),
    testimonials: normalizeTenantSectionStyle(raw.testimonials, TENANT_SECTION_STYLE_CAPABILITIES.testimonials),
    contact: normalizeTenantSectionStyle(raw.contact, TENANT_SECTION_STYLE_CAPABILITIES.contact),
    map: normalizeTenantSectionStyle(raw.map, TENANT_SECTION_STYLE_CAPABILITIES.map),
  };
}

/** Copy `template` into `target` only for fields the section supports (builder “apply to all”, preview-safe). */
export function applySectionStyleRespectingCapabilities(
  template: TenantSectionStyle,
  target: TenantSectionStyle,
  capabilities: TenantSectionStyleCapability,
): TenantSectionStyle {
  const supportsAnyVisual =
    capabilities.background ||
    capabilities.textTone ||
    capabilities.sectionBackgroundColor ||
    capabilities.accentColor ||
    capabilities.cardStyle;
  return {
    backgroundMode: capabilities.background ? template.backgroundMode : target.backgroundMode,
    textTone: capabilities.textTone ? template.textTone : target.textTone,
    align: capabilities.align ? template.align : target.align,
    layoutVariant: capabilities.layoutVariant ? template.layoutVariant : target.layoutVariant,
    paddingDensity: capabilities.density ? template.paddingDensity : target.paddingDensity,
    cardStyle: capabilities.cardStyle ? template.cardStyle : target.cardStyle,
    accentBaseColor: capabilities.accentColor ? template.accentBaseColor : target.accentBaseColor,
    colorPreset: capabilities.accentColor ? template.colorPreset : target.colorPreset,
    sectionBackgroundColor: capabilities.sectionBackgroundColor ? template.sectionBackgroundColor : target.sectionBackgroundColor,
    sectionBackgroundImageUrl: capabilities.sectionBackgroundImage ? template.sectionBackgroundImageUrl : target.sectionBackgroundImageUrl,
    sectionThemePresetId: supportsAnyVisual ? template.sectionThemePresetId : target.sectionThemePresetId,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (t) out.push(t);
  }
  return out;
}

function dedupeStringIdsPreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function carIdFromUnknownFeaturedEntry(item: unknown): string | null {
  if (typeof item === 'string') {
    const t = item.trim();
    return t || null;
  }
  if (typeof item !== 'object' || item === null) return null;
  const o = item as Record<string, unknown>;
  if (typeof o.carId === 'string' && o.carId.trim()) return o.carId.trim();
  if (typeof o.id === 'string' && o.id.trim()) return o.id.trim();
  return null;
}

/**
 * Parses stored homepage car id lists for {@link NormalizedTenantLayout.featuredCarIds}.
 * Used only as **legacy fallback** when no scoped published cars have `showInHomeCarousel` (see tenantHomepageCars).
 * Reads layout.featuredCarIds, then legacy layout.featuredCars / content.featuredCars (objects with carId/id).
 */
export function parseFeaturedCarIdsFromRecords(
  layout: Record<string, unknown>,
  content: Record<string, unknown>,
): string[] {
  const fromLayoutIds = asStringArray(layout.featuredCarIds);
  if (fromLayoutIds.length > 0) return dedupeStringIdsPreserveOrder(fromLayoutIds);

  const legacyLayout = layout.featuredCars;
  if (Array.isArray(legacyLayout)) {
    const withOrder: { id: string; order: number }[] = [];
    for (let i = 0; i < legacyLayout.length; i++) {
      const id = carIdFromUnknownFeaturedEntry(legacyLayout[i]);
      if (!id) continue;
      const item = legacyLayout[i];
      let order = i;
      if (typeof item === 'object' && item !== null) {
        const so = (item as Record<string, unknown>).sortOrder;
        if (typeof so === 'number' && !Number.isNaN(so)) order = so;
      }
      withOrder.push({ id, order });
    }
    if (withOrder.length > 0) {
      withOrder.sort((a, b) => a.order - b.order);
      return dedupeStringIdsPreserveOrder(withOrder.map((x) => x.id));
    }
  }

  const contentFeatured = content.featuredCars;
  if (Array.isArray(contentFeatured)) {
    const ids: string[] = [];
    for (const item of contentFeatured) {
      const id = carIdFromUnknownFeaturedEntry(item);
      if (id) ids.push(id);
    }
    if (ids.length > 0) return dedupeStringIdsPreserveOrder(ids);
  }

  return [];
}

function parseThemeVariant(value: unknown): TenantThemeVariant | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'classic' || v === 'modern' || v === 'luxury' || v === 'minimal') return v;
  return null;
}

function parseBooleanFlag(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

function parsePageBackgroundOverlayOpacity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(0.85, value));
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(0.85, n));
  }
  return null;
}

export function parseHomeSectionsList(raw: unknown): TenantHomeSectionKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SECTION_ORDER];
  const seen = new Set<string>();
  const out: TenantHomeSectionKey[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const k = item.trim() as TenantHomeSectionKey;
    if (!SECTION_KEY_SET.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.length > 0 ? out : [...DEFAULT_SECTION_ORDER];
}

export function validateHomeSectionsInput(raw: string[]): { ok: true; value: TenantHomeSectionKey[] } | { ok: false; error: string } {
  const seen = new Set<string>();
  const out: TenantHomeSectionKey[] = [];
  for (const item of raw) {
    const k = (typeof item === 'string' ? item : '').trim() as TenantHomeSectionKey;
    if (!k) continue;
    if (!SECTION_KEY_SET.has(k)) {
      return { ok: false, error: `Unsupported section key: ${k}` };
    }
    if (seen.has(k)) {
      return { ok: false, error: `Duplicate section key: ${k}` };
    }
    seen.add(k);
    out.push(k);
  }
  return { ok: true, value: out.length > 0 ? out : [...DEFAULT_SECTION_ORDER] };
}

/** Dedupe and append any missing keys so persisted layout always lists every section once (order preserved). */
export function normalizeHomeSectionOrderForBuilder(order: TenantHomeSectionKey[]): TenantHomeSectionKey[] {
  const seen = new Set<TenantHomeSectionKey>();
  const out: TenantHomeSectionKey[] = [];
  for (const k of order) {
    if (SECTION_KEY_SET.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

export const TENANT_HOME_SECTION_LABELS_HE: Record<TenantHomeSectionKey, string> = {
  hero: 'כותרת ראשית',
  featuredCars: 'רכבים נבחרים',
  about: 'אודות',
  benefits: 'יתרונות',
  finance: 'מימון',
  testimonials: 'המלצות',
  contact: 'יצירת קשר',
  map: 'מפה',
};

/** Accepts #rgb, #rrggbb, rgba(...), hsl(...), and common CSS color keywords (loose). */
export function validateColorInput(value: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = value.trim();
  if (!v) return { ok: false, error: 'ריק' };
  if (v.length > 120) return { ok: false, error: 'ערך ארוך מדי' };
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return { ok: true, value: v };
  if (/^(rgb|hsl)a?\(/i.test(v)) return { ok: true, value: v };
  if (/^[a-zA-Z]+$/.test(v) && v.length <= 40) return { ok: true, value: v };
  return { ok: false, error: 'פורמט צבע לא מזוהה (השתמשו ב-#hex או rgb/rgba)' };
}

export function validateOptionalUrl(value: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = value.trim();
  if (!v) return { ok: true, value: null };
  if (v.length > 2048) return { ok: false, error: 'URL ארוך מדי' };
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'רק http/https' };
    }
    return { ok: true, value: v };
  } catch {
    return { ok: false, error: 'URL לא תקין' };
  }
}

/** Absolute http(s) URL or in-app path starting with `/`. */
export function validateOptionalUrlOrPath(value: string): { ok: true } | { ok: false; error: string } {
  const v = value.trim();
  if (!v) return { ok: true };
  if (v.startsWith('/') && v.length <= 2048) return { ok: true };
  const r = validateOptionalUrl(v);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

const MAX_HERO_IMAGE_URLS = 8;

function parseBrandingHeroImageFields(branding: Record<string, unknown>): { heroImageUrl: string | null; heroImageUrls: string[] } {
  const fromArr: string[] = [];
  const rawList = branding.heroImageUrls;
  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      if (!t) continue;
      const ur = validateOptionalUrl(t);
      if (!ur.ok || !ur.value) continue;
      if (!fromArr.includes(ur.value)) fromArr.push(ur.value);
      if (fromArr.length >= MAX_HERO_IMAGE_URLS) break;
    }
  }
  const singleRaw = asTrimmedString(branding.heroImageUrl);
  const singleUr = singleRaw ? validateOptionalUrl(singleRaw) : { ok: false as const, value: null as string | null };
  const single = singleUr.ok && singleUr.value ? singleUr.value : null;

  if (fromArr.length >= 2) {
    return { heroImageUrl: fromArr[0] ?? null, heroImageUrls: fromArr };
  }
  if (fromArr.length === 1) {
    return { heroImageUrl: fromArr[0], heroImageUrls: [] };
  }
  if (single) {
    return { heroImageUrl: single, heroImageUrls: [] };
  }
  return { heroImageUrl: null, heroImageUrls: [] };
}

export interface NormalizedTenantBranding {
  siteName: string | null;
  displayName: string | null;
  logoUrl: string | null;
  /** Additive: explicit logo origin for builder + merge resolution. */
  logoSource: TenantLogoSource | null;
  /** Detected / imported website header logo (https), optional. */
  logoWebsiteCandidate: string | null;
  /** Optional snapshot of yard logo URL when admin chose yard (https). */
  logoYardCandidate: string | null;
  heroImageUrl: string | null;
  /**
   * Ordered homepage hero slides (https), same-origin as stored. When length ≥ 2, storefront shows a slider.
   * When empty, use {@link heroImageUrl} only (single-image mode).
   */
  heroImageUrls: string[];
  /**
   * Full-page backdrop image (https), separate from {@link heroImageUrl}.
   * When absent, page uses {@link backgroundColor} / theme only.
   */
  pageBackgroundImageUrl: string | null;
  /**
   * Darkening overlay strength for {@link pageBackgroundImageUrl} (0–0.85). `null` → runtime default (~0.5).
   */
  pageBackgroundOverlayOpacity: number | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  /** Optional hero primary CTA colors from site research (https tenant pages only). */
  primaryCtaBackgroundColor: string | null;
  primaryCtaTextColor: string | null;
  themeVariant: TenantThemeVariant;
  /** Curated Website Builder branding pack key (`branding.theme.siteThemePackKey`), additive. */
  siteThemePackKey: string | null;
  /** Optional extra section tendencies merged after the pack (`branding.theme.sectionDefaults`). */
  siteThemeSectionDefaults: Partial<
    Pick<
      TenantSectionStyle,
      | 'backgroundMode'
      | 'textTone'
      | 'paddingDensity'
      | 'cardStyle'
      | 'layoutVariant'
      | 'align'
    >
  > | null;
  /**
   * Optional `branding.theme.accentStrategy`; `null` means follow pack default when the pack defines one.
   * `{ mode: 'none' }` disables theme-driven hive for inheriting sections.
   */
  themeAccentStrategy: NormalizedThemeAccentStrategy | null;
  /**
   * Frozen pack payload when admin applied theme colors (`branding.theme.appliedThemeSnapshot`).
   * Decouples live tenants from future edits to `THEME_BRAND_PRESETS`.
   */
  appliedThemeSnapshot: NormalizedAppliedThemeSnapshot | null;
}

/** Slide URLs in order; single-image → one element. */
export function resolveTenantHeroSlideUrls(
  b: Pick<NormalizedTenantBranding, 'heroImageUrl' | 'heroImageUrls'>,
): string[] {
  if (b.heroImageUrls.length >= 2) return b.heroImageUrls;
  const one = b.heroImageUrl?.trim();
  return one ? [one] : [];
}

/** Frozen at theme-apply time; see `buildAppliedThemeSnapshotFromPreset`. */
export type NormalizedAppliedThemeSnapshot = {
  packKey: string;
  packVersion: number;
  registryVersion: number | null;
  sectionDefaults: NormalizedTenantBranding['siteThemeSectionDefaults'];
  accentStrategyFromPack: NormalizedThemeAccentStrategy | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
};

export interface NormalizedTenantContent {
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroCtaText: string | null;
  heroCtaLink: string | null;
  aboutTitle: string | null;
  aboutText: string | null;
  benefitsTitle: string | null;
  benefitsItems: string[];
  financeTitle: string | null;
  financeText: string | null;
  contactTitle: string | null;
  contactSubtitle: string | null;
  testimonialsTitle: string | null;
  testimonialsText: string | null;
}

export interface NormalizedTenantContact {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

export interface NormalizedTenantSeo {
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
}

export interface NormalizedTenantLayout {
  homeSections: TenantHomeSectionKey[];
  showFeaturedCars: boolean;
  /** `grid` when absent in Firestore (backward compatible). */
  featuredCarsPresentation: TenantFeaturedCarsPresentation;
  showAbout: boolean;
  showBenefits: boolean;
  showFinance: boolean;
  showTestimonials: boolean;
  showContact: boolean;
  showMap: boolean;
  /**
   * Legacy ordered public car ids (homepage fallback only when no `showInHomeCarousel` flags in scoped inventory).
   * Not edited in the site builder after the yard-managed homepage flow; kept for persistence compatibility.
   */
  featuredCarIds: string[];
  sectionStyles: Record<TenantHomeSectionKey, TenantSectionStyle>;
  /**
   * Inherit section chrome (background, density, cards, etc.) from the effective theme pack / patch.
   * Additive with `sectionInheritsSiteThemeAccent`; if absent at load, derived from legacy `sectionInheritsSiteTheme`.
   */
  sectionInheritsSiteThemeStyle: Partial<Record<TenantHomeSectionKey, boolean>>;
  /**
   * Inherit theme-driven Hive accent (virtual) when no local `accentBaseColor` / `colorPreset`.
   * Additive with `sectionInheritsSiteThemeStyle`.
   */
  sectionInheritsSiteThemeAccent: Partial<Record<TenantHomeSectionKey, boolean>>;
  /**
   * Legacy single flag: historically meant both style + accent. On normalize, still populated as
   * `style && accent` for backward-compatible saves and older readers.
   */
  sectionInheritsSiteTheme: Partial<Record<TenantHomeSectionKey, boolean>>;
  /**
   * Optional page-wide default for {@link TenantSectionStyle.sectionThemePresetId} when section id is null.
   */
  defaultSectionThemePresetId: string | null;
}

export interface NormalizedTenantDataScope {
  yardUid: string | null;
  sellerUid: string | null;
}

/**
 * Normalized view of `tenantSiteConfigs/{tenantId}` after {@link normalizeTenantSiteConfig}.
 *
 * **Persisted vs derived:** Firestore stores the loose bucket records (`TenantSiteConfig`); this object adds
 * defaults and coercions. Effective Hive accents, merged section chrome, and runtime `TenantBrandingModel.theme`
 * tokens are **not** persisted here — see `docs/TENANT_SITE_CONFIG_IMPORT_CONTRACT.md`.
 */
export interface NormalizedTenantSiteConfig {
  tenantId: string | null;
  branding: NormalizedTenantBranding;
  content: NormalizedTenantContent;
  contact: NormalizedTenantContact;
  seo: NormalizedTenantSeo;
  layout: NormalizedTenantLayout;
  dataScope: NormalizedTenantDataScope;
  raw: TenantSiteConfig | null;
}

/** Layout slice used by branding / Hive resolution (live + builder). */
export type TenantHomeBrandingResolutionLayout = Pick<
  NormalizedTenantLayout,
  | 'homeSections'
  | 'sectionStyles'
  | 'sectionInheritsSiteThemeStyle'
  | 'sectionInheritsSiteThemeAccent'
  | 'defaultSectionThemePresetId'
>;

function parseSectionInheritsSiteTheme(raw: unknown): Partial<Record<TenantHomeSectionKey, boolean>> {
  const out: Partial<Record<TenantHomeSectionKey, boolean>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as Record<string, unknown>;
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k === 'hero') continue;
    if (o[k] === true) out[k] = true;
  }
  return out;
}

/** Parse `branding.theme.sectionDefaults` or a frozen snapshot `sectionDefaults` object. */
export function parseSiteThemeSectionDefaultsObject(sd: unknown): NormalizedTenantBranding['siteThemeSectionDefaults'] {
  if (typeof sd !== 'object' || sd === null) return null;
  const r = sd as Record<string, unknown>;
  const backgroundMode = asTrimmedString(r.backgroundMode);
  const textTone = asTrimmedString(r.textTone);
  const align = asTrimmedString(r.align);
  const layoutVariant = asTrimmedString(r.layoutVariant);
  const paddingDensity = asTrimmedString(r.paddingDensity);
  const cardStyle = asTrimmedString(r.cardStyle);
  const pick: Record<string, unknown> = {};
  if (backgroundMode && SECTION_BACKGROUND_MODES.has(backgroundMode as TenantSectionBackgroundMode)) {
    pick.backgroundMode = backgroundMode;
  }
  if (textTone && SECTION_TEXT_TONES.has(textTone as TenantSectionTextTone)) {
    pick.textTone = textTone;
  }
  if (align && SECTION_ALIGNS.has(align as TenantSectionAlign)) {
    pick.align = align;
  }
  if (layoutVariant && SECTION_LAYOUT_VARIANTS.has(layoutVariant as TenantSectionLayoutVariant)) {
    pick.layoutVariant = layoutVariant;
  }
  if (paddingDensity && SECTION_PADDING_DENSITIES.has(paddingDensity as TenantSectionPaddingDensity)) {
    pick.paddingDensity = paddingDensity;
  }
  if (cardStyle && SECTION_CARD_STYLES.has(cardStyle as TenantSectionCardStyle)) {
    pick.cardStyle = cardStyle;
  }
  return Object.keys(pick).length > 0 ? (pick as NormalizedTenantBranding['siteThemeSectionDefaults']) : null;
}

/** Persistable subset of {@link NormalizedTenantBranding.siteThemeSectionDefaults} for `branding.theme.sectionDefaults`. */
export function serializeSiteThemeSectionDefaultsForFirestore(
  sd: NormalizedTenantBranding['siteThemeSectionDefaults'],
): Record<string, unknown> | null {
  const cleaned = parseSiteThemeSectionDefaultsObject(sd ?? null);
  if (!cleaned || Object.keys(cleaned).length === 0) return null;
  return cleaned as Record<string, unknown>;
}

function parseSiteThemeSectionDefaultsPatch(
  themeRec: Record<string, unknown>,
): NormalizedTenantBranding['siteThemeSectionDefaults'] {
  return parseSiteThemeSectionDefaultsObject(themeRec.sectionDefaults);
}

function parseSectionThemeInheritance(layout: Record<string, unknown>): Pick<
  NormalizedTenantLayout,
  'sectionInheritsSiteTheme' | 'sectionInheritsSiteThemeStyle' | 'sectionInheritsSiteThemeAccent'
> {
  const legacy = parseSectionInheritsSiteTheme(layout.sectionInheritsSiteTheme);
  const styleOnly = parseSectionInheritsSiteTheme(layout.sectionInheritsSiteThemeStyle);
  const accentOnly = parseSectionInheritsSiteTheme(layout.sectionInheritsSiteThemeAccent);

  const hasSplit =
    typeof layout.sectionInheritsSiteThemeStyle === 'object' &&
    layout.sectionInheritsSiteThemeStyle !== null &&
    Object.keys(layout.sectionInheritsSiteThemeStyle as object).length > 0;
  const hasSplitAccent =
    typeof layout.sectionInheritsSiteThemeAccent === 'object' &&
    layout.sectionInheritsSiteThemeAccent !== null &&
    Object.keys(layout.sectionInheritsSiteThemeAccent as object).length > 0;

  const sectionInheritsSiteThemeStyle: Partial<Record<TenantHomeSectionKey, boolean>> = { ...styleOnly };
  const sectionInheritsSiteThemeAccent: Partial<Record<TenantHomeSectionKey, boolean>> = { ...accentOnly };

  if (!hasSplit && !hasSplitAccent) {
    for (const k of TENANT_HOME_SECTION_KEYS) {
      if (k === 'hero') continue;
      if (legacy[k] === true) {
        sectionInheritsSiteThemeStyle[k] = true;
        sectionInheritsSiteThemeAccent[k] = true;
      }
    }
  } else {
    for (const k of TENANT_HOME_SECTION_KEYS) {
      if (k === 'hero') continue;
      if (legacy[k] === true) {
        if (sectionInheritsSiteThemeStyle[k] !== true && sectionInheritsSiteThemeStyle[k] !== false) {
          sectionInheritsSiteThemeStyle[k] = true;
        }
        if (sectionInheritsSiteThemeAccent[k] !== true && sectionInheritsSiteThemeAccent[k] !== false) {
          sectionInheritsSiteThemeAccent[k] = true;
        }
      }
    }
  }

  const sectionInheritsSiteTheme: Partial<Record<TenantHomeSectionKey, boolean>> = {};
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k === 'hero') continue;
    if (sectionInheritsSiteThemeStyle[k] === true && sectionInheritsSiteThemeAccent[k] === true) {
      sectionInheritsSiteTheme[k] = true;
    }
  }

  return { sectionInheritsSiteTheme, sectionInheritsSiteThemeStyle, sectionInheritsSiteThemeAccent };
}

export function parseAppliedThemeSnapshot(raw: unknown): NormalizedAppliedThemeSnapshot | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const packKey = asTrimmedString(r.packKey);
  if (!packKey) return null;
  const packVersion = typeof r.packVersion === 'number' && Number.isFinite(r.packVersion) ? r.packVersion : 1;
  const registryVersion =
    typeof r.registryVersion === 'number' && Number.isFinite(r.registryVersion) ? r.registryVersion : null;
  const sectionDefaults = parseSiteThemeSectionDefaultsObject(r.sectionDefaults);
  const accentRaw =
    r.accentStrategyFromPack !== undefined
      ? r.accentStrategyFromPack
      : r.packAccentStrategy !== undefined
        ? r.packAccentStrategy
        : undefined;
  const accentStrategyFromPack =
    accentRaw === null || accentRaw === undefined ? null : parsePersistedThemeAccentStrategy(accentRaw);
  return {
    packKey,
    packVersion,
    registryVersion,
    sectionDefaults,
    accentStrategyFromPack,
    primaryColor: asTrimmedString(r.primaryColor),
    secondaryColor: asTrimmedString(r.secondaryColor),
    accentColor: asTrimmedString(r.accentColor),
  };
}

export function buildAppliedThemeSnapshotFromPreset(pack: ThemeBrandPreset): NormalizedAppliedThemeSnapshot {
  return {
    packKey: pack.key,
    packVersion: pack.packVersion,
    registryVersion: null,
    sectionDefaults: parseSiteThemeSectionDefaultsObject((pack.sectionDefaults ?? {}) as unknown as Record<string, unknown>),
    accentStrategyFromPack: normalizePackAccentStrategy(pack.accentStrategy, pack.primaryColor),
    primaryColor: pack.primaryColor,
    secondaryColor: pack.secondaryColor,
    accentColor: pack.accentColor,
  };
}

export function serializeAppliedThemeSnapshotForFirestore(s: NormalizedAppliedThemeSnapshot): Record<string, unknown> {
  const o: Record<string, unknown> = {
    packKey: s.packKey,
    packVersion: s.packVersion,
    primaryColor: s.primaryColor,
    secondaryColor: s.secondaryColor,
    accentColor: s.accentColor,
  };
  if (s.registryVersion != null) o.registryVersion = s.registryVersion;
  if (s.sectionDefaults && Object.keys(s.sectionDefaults).length > 0) {
    o.sectionDefaults = s.sectionDefaults;
  }
  if (s.accentStrategyFromPack != null) {
    const ser = serializeThemeAccentStrategyForFirestore(s.accentStrategyFromPack);
    if (ser) o.accentStrategyFromPack = ser;
  }
  return o;
}

export function isAppliedSnapshotActiveForPack(
  snapshot: NormalizedAppliedThemeSnapshot | null,
  siteThemePackKey: string | null,
): boolean {
  if (!snapshot || !siteThemePackKey) return false;
  return snapshot.packKey === siteThemePackKey.trim();
}

function parseSiteThemeFromBranding(branding: Record<string, unknown>): {
  siteThemePackKey: string | null;
  siteThemeSectionDefaults: NormalizedTenantBranding['siteThemeSectionDefaults'];
  themeAccentStrategy: NormalizedTenantBranding['themeAccentStrategy'];
  appliedThemeSnapshot: NormalizedTenantBranding['appliedThemeSnapshot'];
} {
  const themeRec = asRecord(branding.theme);
  const rawPack = asTrimmedString(themeRec.siteThemePackKey);
  let siteThemePackKey: string | null = null;
  if (rawPack) {
    siteThemePackKey = getThemeBrandPresetByKey(rawPack) ? rawPack : null;
    const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
    if (isDev && rawPack && !siteThemePackKey) {
      console.warn('[normalizeTenantSiteConfig] Invalid siteThemePackKey dropped:', rawPack);
    }
  }
  const siteThemeSectionDefaults = Object.keys(themeRec).length > 0 ? parseSiteThemeSectionDefaultsPatch(themeRec) : null;
  const themeAccentStrategy = parsePersistedThemeAccentStrategy(themeRec.accentStrategy);
  let appliedThemeSnapshot = parseAppliedThemeSnapshot(themeRec.appliedThemeSnapshot);
  if (appliedThemeSnapshot && siteThemePackKey && appliedThemeSnapshot.packKey !== siteThemePackKey) {
    appliedThemeSnapshot = null;
  }
  return { siteThemePackKey, siteThemeSectionDefaults, themeAccentStrategy, appliedThemeSnapshot };
}

export function normalizeTenantSiteConfig(siteConfig: TenantSiteConfig | null, tenantId: string | null): NormalizedTenantSiteConfig {
  const root = asRecord(siteConfig);
  const branding = asRecord(root.branding);
  const brand = asRecord(root.brand);
  const content = asRecord(root.content);
  const contact = asRecord(root.contact);
  const seo = asRecord(root.seo);
  const layout = asRecord(root.layout);
  const dataScope = asRecord(root.dataScope);

  const siteName =
    asTrimmedString(branding.siteName) ??
    asTrimmedString(content.siteName) ??
    asTrimmedString(branding.displayName) ??
    asTrimmedString(branding.businessName) ??
    asTrimmedString(brand.name) ??
    asTrimmedString(content.businessName);

  const displayName =
    asTrimmedString(branding.displayName) ??
    asTrimmedString(branding.businessName) ??
    asTrimmedString(brand.name) ??
    asTrimmedString(content.businessName) ??
    siteName;

  const themeVariant =
    parseThemeVariant(branding.themeVariant) ??
    parseThemeVariant(layout.variant) ??
    parseThemeVariant(layout.themeVariant) ??
    'classic';

  const homeSections = parseHomeSectionsList(layout.homeSections);
  const featuredCarIds = parseFeaturedCarIdsFromRecords(layout, content);
  const sectionStyles = normalizeTenantSectionStylesRecord(layout.sectionStyles);
  const sectionThemeInherit = parseSectionThemeInheritance(layout);
  const siteTheme = parseSiteThemeFromBranding(branding);
  const heroFields = parseBrandingHeroImageFields(branding);

  const parseLogoSource = (raw: unknown): TenantLogoSource | null => {
    const s = asTrimmedString(raw)?.toLowerCase();
    if (s === 'website' || s === 'yard' || s === 'manual') return s;
    return null;
  };

  const parseFeaturedCarsPresentation = (raw: unknown): TenantFeaturedCarsPresentation => {
    const s = asTrimmedString(raw)?.toLowerCase();
    if (s === 'carscarousel' || s === 'cars_carousel' || s === 'carousel') return 'carsCarousel';
    return 'grid';
  };

  const logoWebsiteRaw = asTrimmedString(branding.logoWebsiteCandidate);
  const logoWebsiteUr = logoWebsiteRaw ? validateOptionalUrl(logoWebsiteRaw) : { ok: false as const, value: null as string | null };
  const logoYardRaw = asTrimmedString(branding.logoYardCandidate);
  const logoYardUr = logoYardRaw ? validateOptionalUrl(logoYardRaw) : { ok: false as const, value: null as string | null };

  const primaryCtaBgRaw = asTrimmedString(branding.primaryCtaBackgroundColor);
  const primaryCtaBg = primaryCtaBgRaw ? validateColorInput(primaryCtaBgRaw) : { ok: false as const, error: '' };
  const primaryCtaFgRaw = asTrimmedString(branding.primaryCtaTextColor);
  const primaryCtaFg = primaryCtaFgRaw ? validateColorInput(primaryCtaFgRaw) : { ok: false as const, error: '' };

  return {
    tenantId,
    raw: siteConfig,
    branding: {
      siteName,
      displayName,
      logoUrl: asTrimmedString(branding.logoUrl) ?? asTrimmedString(brand.logoUrl),
      logoSource: parseLogoSource(branding.logoSource),
      logoWebsiteCandidate: logoWebsiteUr.ok && logoWebsiteUr.value ? logoWebsiteUr.value : null,
      logoYardCandidate: logoYardUr.ok && logoYardUr.value ? logoYardUr.value : null,
      heroImageUrl: heroFields.heroImageUrl,
      heroImageUrls: heroFields.heroImageUrls,
      pageBackgroundImageUrl: (() => {
        const raw = asTrimmedString(branding.pageBackgroundImageUrl);
        if (!raw) return null;
        const ur = validateOptionalUrl(raw);
        return ur.ok && ur.value ? ur.value : null;
      })(),
      pageBackgroundOverlayOpacity: parsePageBackgroundOverlayOpacity(branding.pageBackgroundOverlayOpacity),
      primaryColor: asTrimmedString(branding.primaryColor) ?? asTrimmedString(brand.primaryColor),
      secondaryColor: asTrimmedString(branding.secondaryColor) ?? asTrimmedString(brand.secondaryColor),
      accentColor: asTrimmedString(branding.accentColor) ?? asTrimmedString(brand.accentColor),
      textColor: asTrimmedString(branding.textColor),
      backgroundColor: asTrimmedString(branding.backgroundColor),
      primaryCtaBackgroundColor: primaryCtaBg.ok ? primaryCtaBg.value : null,
      primaryCtaTextColor: primaryCtaFg.ok ? primaryCtaFg.value : null,
      themeVariant: THEME_VARIANTS.has(themeVariant) ? themeVariant : 'classic',
      siteThemePackKey: siteTheme.siteThemePackKey,
      siteThemeSectionDefaults: siteTheme.siteThemeSectionDefaults,
      themeAccentStrategy: siteTheme.themeAccentStrategy,
      appliedThemeSnapshot: siteTheme.appliedThemeSnapshot,
    },
    content: {
      heroTitle: asTrimmedString(content.heroTitle),
      heroSubtitle: asTrimmedString(content.heroSubtitle),
      heroCtaText: asTrimmedString(content.heroCtaText),
      heroCtaLink: asTrimmedString(content.heroCtaLink),
      aboutTitle: asTrimmedString(content.aboutTitle),
      aboutText: asTrimmedString(content.aboutText) ?? asTrimmedString(content.about),
      benefitsTitle: asTrimmedString(content.benefitsTitle),
      benefitsItems: asStringArray(content.benefitsItems),
      financeTitle: asTrimmedString(content.financeTitle),
      financeText: asTrimmedString(content.financeText),
      contactTitle: asTrimmedString(content.contactTitle),
      contactSubtitle: asTrimmedString(content.contactSubtitle),
      testimonialsTitle: asTrimmedString(content.testimonialsTitle),
      testimonialsText: asTrimmedString(content.testimonialsText),
    },
    contact: {
      phone: asTrimmedString(contact.phone),
      whatsapp: asTrimmedString(contact.whatsapp),
      email: asTrimmedString(contact.email),
      address: asTrimmedString(contact.address),
      city: asTrimmedString(contact.city),
      facebookUrl: asTrimmedString(contact.facebookUrl),
      instagramUrl: asTrimmedString(contact.instagramUrl),
      websiteUrl: asTrimmedString(contact.websiteUrl),
    },
    seo: {
      title: asTrimmedString(seo.title),
      description: asTrimmedString(seo.description),
      ogImageUrl: asTrimmedString(seo.ogImageUrl),
    },
    layout: {
      homeSections,
      showFeaturedCars: parseBooleanFlag(layout.showFeaturedCars, true),
      featuredCarsPresentation: parseFeaturedCarsPresentation(layout.featuredCarsPresentation),
      showAbout: parseBooleanFlag(layout.showAbout, true),
      showBenefits: parseBooleanFlag(layout.showBenefits, true),
      showFinance: parseBooleanFlag(layout.showFinance, true),
      showTestimonials: parseBooleanFlag(layout.showTestimonials, false),
      showContact: parseBooleanFlag(layout.showContact, true),
      showMap: parseBooleanFlag(layout.showMap, false),
      featuredCarIds,
      sectionStyles,
      sectionInheritsSiteTheme: sectionThemeInherit.sectionInheritsSiteTheme,
      sectionInheritsSiteThemeStyle: sectionThemeInherit.sectionInheritsSiteThemeStyle,
      sectionInheritsSiteThemeAccent: sectionThemeInherit.sectionInheritsSiteThemeAccent,
      defaultSectionThemePresetId: (() => {
        const raw = asTrimmedString(layout.defaultSectionThemePresetId);
        return raw && getSectionThemePresetById(raw) ? raw : null;
      })(),
    },
    dataScope: {
      yardUid:
        asTrimmedString(dataScope.yardId) ??
        asTrimmedString(dataScope.yardUid) ??
        asTrimmedString(dataScope.yard_id) ??
        asTrimmedString(dataScope.yardUID),
      sellerUid:
        asTrimmedString(dataScope.sellerId) ??
        asTrimmedString(dataScope.sellerUid) ??
        asTrimmedString(dataScope.seller_id) ??
        asTrimmedString(dataScope.sellerUID),
    },
  };
}

export function getUnsupportedHomeSectionKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const bad: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const k = item.trim();
    if (!k || SECTION_KEY_SET.has(k)) continue;
    if (!bad.includes(k)) bad.push(k);
  }
  return bad;
}
