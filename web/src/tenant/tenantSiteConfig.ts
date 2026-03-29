import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';

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

export type TenantThemeVariant = 'classic' | 'modern' | 'luxury' | 'minimal';

const THEME_VARIANTS = new Set<TenantThemeVariant>(['classic', 'modern', 'luxury', 'minimal']);

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
 * Featured cars on the tenant site: car id references only (no duplicated manual fields).
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

export interface NormalizedTenantBranding {
  siteName: string | null;
  displayName: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  themeVariant: TenantThemeVariant;
}

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
  showAbout: boolean;
  showBenefits: boolean;
  showFinance: boolean;
  showTestimonials: boolean;
  showContact: boolean;
  showMap: boolean;
  /** Public car document ids, in display order. Empty = fall back to first N from scoped inventory. */
  featuredCarIds: string[];
}

export interface NormalizedTenantDataScope {
  yardUid: string | null;
  sellerUid: string | null;
}

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

  return {
    tenantId,
    raw: siteConfig,
    branding: {
      siteName,
      displayName,
      logoUrl: asTrimmedString(branding.logoUrl) ?? asTrimmedString(brand.logoUrl),
      heroImageUrl: asTrimmedString(branding.heroImageUrl),
      primaryColor: asTrimmedString(branding.primaryColor) ?? asTrimmedString(brand.primaryColor),
      secondaryColor: asTrimmedString(branding.secondaryColor) ?? asTrimmedString(brand.secondaryColor),
      accentColor: asTrimmedString(branding.accentColor) ?? asTrimmedString(brand.accentColor),
      textColor: asTrimmedString(branding.textColor),
      backgroundColor: asTrimmedString(branding.backgroundColor),
      themeVariant: THEME_VARIANTS.has(themeVariant) ? themeVariant : 'classic',
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
      showAbout: parseBooleanFlag(layout.showAbout, true),
      showBenefits: parseBooleanFlag(layout.showBenefits, true),
      showFinance: parseBooleanFlag(layout.showFinance, true),
      showTestimonials: parseBooleanFlag(layout.showTestimonials, false),
      showContact: parseBooleanFlag(layout.showContact, true),
      showMap: parseBooleanFlag(layout.showMap, false),
      featuredCarIds,
    },
    dataScope: {
      yardUid: asTrimmedString(dataScope.yardId) ?? asTrimmedString(dataScope.yardUid),
      sellerUid: asTrimmedString(dataScope.sellerId) ?? asTrimmedString(dataScope.sellerUid),
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
