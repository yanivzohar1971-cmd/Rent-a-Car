import {
  parsePersistedThemeAccentStrategy,
  type NormalizedThemeAccentStrategy,
} from '../../../tenant/themeAccentStrategy';
import {
  normalizeHomeSectionOrderForBuilder,
  normalizeTenantSectionStylesRecord,
  parseAppliedThemeSnapshot,
  parseSiteThemeSectionDefaultsObject,
  TENANT_HOME_SECTION_KEYS,
  type NormalizedAppliedThemeSnapshot,
  type NormalizedTenantBranding,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from '../../../tenant/tenantSiteConfig';

/** Shape of `JSON.stringify(formSnapshot)` in AdminTenantSiteBuilderPage — used to restore draft from baseline. */
export type BuilderFormBaselineSnapshot = {
  siteName: string;
  displayName: string;
  logoUrl: string;
  heroImageUrl: string;
  pageBackgroundImageUrl: string;
  pageBackgroundOverlayOpacity: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  themeVariant: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroCtaLink: string;
  aboutTitle: string;
  aboutText: string;
  benefitsTitle: string;
  benefitsItemsText: string;
  financeTitle: string;
  financeText: string;
  contactTitle: string;
  contactSubtitle: string;
  testimonialsTitle: string;
  testimonialsText: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  facebookUrl: string;
  instagramUrl: string;
  websiteUrl: string;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string;
  sectionOrder: TenantHomeSectionKey[];
  showFeaturedCars: boolean;
  showAbout: boolean;
  showBenefits: boolean;
  showFinance: boolean;
  showTestimonials: boolean;
  showContact: boolean;
  showMap: boolean;
  yardUid: string;
  sellerUid: string;
  featuredCarIds: string[];
  sectionStyles: Record<TenantHomeSectionKey, TenantSectionStyle>;
  siteThemePackKey: string;
  /** Legacy single map: expanded to style+accent when split maps absent. */
  sectionInheritsSiteTheme: Partial<Record<TenantHomeSectionKey, boolean>>;
  sectionInheritsSiteThemeStyle: Partial<Record<TenantHomeSectionKey, boolean>>;
  sectionInheritsSiteThemeAccent: Partial<Record<TenantHomeSectionKey, boolean>>;
  themeAccentStrategy: NormalizedThemeAccentStrategy | null;
  appliedThemeSnapshot: NormalizedAppliedThemeSnapshot | null;
  /** Optional `branding.theme.sectionDefaults` patch (site-wide section tendencies). */
  siteThemeSectionDefaults: NormalizedTenantBranding['siteThemeSectionDefaults'];
};

function pickString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function parseInheritMap(raw: unknown): Partial<Record<TenantHomeSectionKey, boolean>> {
  const out: Partial<Record<TenantHomeSectionKey, boolean>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const ir = raw as Record<string, unknown>;
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k === 'hero') continue;
    if (ir[k] === true) out[k] = true;
  }
  return out;
}

function inheritMapHasKeys(m: Partial<Record<TenantHomeSectionKey, boolean>>): boolean {
  return Object.keys(m).length > 0;
}

/** Safe parse for baseline JSON (from last load/save snapshot). */
export function parseBuilderFormBaselineSnapshot(rawJson: string): BuilderFormBaselineSnapshot | null {
  if (!rawJson.trim()) return null;
  let o: unknown;
  try {
    o = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const so = r.sectionOrder;
  if (!Array.isArray(so)) return null;
  const keys = so.filter((x): x is TenantHomeSectionKey => typeof x === 'string');
  const featured = r.featuredCarIds;
  const featuredCarIds =
    Array.isArray(featured) && featured.every((x) => typeof x === 'string') ? (featured as string[]) : [];
  const sectionStyles = normalizeTenantSectionStylesRecord(r.sectionStyles);
  const sectionInheritsSiteThemeStyle = parseInheritMap(r.sectionInheritsSiteThemeStyle);
  const sectionInheritsSiteThemeAccent = parseInheritMap(r.sectionInheritsSiteThemeAccent);
  const legacyOnly = parseInheritMap(r.sectionInheritsSiteTheme);
  let styleSyn = { ...sectionInheritsSiteThemeStyle };
  let accentSyn = { ...sectionInheritsSiteThemeAccent };
  if (!inheritMapHasKeys(styleSyn) && !inheritMapHasKeys(accentSyn) && inheritMapHasKeys(legacyOnly)) {
    styleSyn = { ...legacyOnly };
    accentSyn = { ...legacyOnly };
  }
  const sectionInheritsSiteTheme: Partial<Record<TenantHomeSectionKey, boolean>> = {};
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k === 'hero') continue;
    if (styleSyn[k] === true && accentSyn[k] === true) sectionInheritsSiteTheme[k] = true;
  }

  return {
    siteName: pickString(r.siteName),
    displayName: pickString(r.displayName),
    logoUrl: pickString(r.logoUrl),
    heroImageUrl: pickString(r.heroImageUrl),
    pageBackgroundImageUrl: pickString(r.pageBackgroundImageUrl),
    pageBackgroundOverlayOpacity: pickString(r.pageBackgroundOverlayOpacity),
    primaryColor: pickString(r.primaryColor),
    secondaryColor: pickString(r.secondaryColor),
    accentColor: pickString(r.accentColor),
    textColor: pickString(r.textColor),
    backgroundColor: pickString(r.backgroundColor),
    themeVariant: pickString(r.themeVariant) || 'classic',
    heroTitle: pickString(r.heroTitle),
    heroSubtitle: pickString(r.heroSubtitle),
    heroCtaText: pickString(r.heroCtaText),
    heroCtaLink: pickString(r.heroCtaLink),
    aboutTitle: pickString(r.aboutTitle),
    aboutText: pickString(r.aboutText),
    benefitsTitle: pickString(r.benefitsTitle),
    benefitsItemsText: pickString(r.benefitsItemsText),
    financeTitle: pickString(r.financeTitle),
    financeText: pickString(r.financeText),
    contactTitle: pickString(r.contactTitle),
    contactSubtitle: pickString(r.contactSubtitle),
    testimonialsTitle: pickString(r.testimonialsTitle),
    testimonialsText: pickString(r.testimonialsText),
    phone: pickString(r.phone),
    whatsapp: pickString(r.whatsapp),
    email: pickString(r.email),
    address: pickString(r.address),
    city: pickString(r.city),
    facebookUrl: pickString(r.facebookUrl),
    instagramUrl: pickString(r.instagramUrl),
    websiteUrl: pickString(r.websiteUrl),
    seoTitle: pickString(r.seoTitle),
    seoDescription: pickString(r.seoDescription),
    ogImageUrl: pickString(r.ogImageUrl),
    sectionOrder: normalizeHomeSectionOrderForBuilder(keys),
    showFeaturedCars: pickBool(r.showFeaturedCars, true),
    showAbout: pickBool(r.showAbout, true),
    showBenefits: pickBool(r.showBenefits, true),
    showFinance: pickBool(r.showFinance, true),
    showTestimonials: pickBool(r.showTestimonials, false),
    showContact: pickBool(r.showContact, true),
    showMap: pickBool(r.showMap, false),
    yardUid: pickString(r.yardUid),
    sellerUid: pickString(r.sellerUid),
    featuredCarIds,
    sectionStyles,
    siteThemePackKey: pickString(r.siteThemePackKey),
    sectionInheritsSiteTheme,
    sectionInheritsSiteThemeStyle: styleSyn,
    sectionInheritsSiteThemeAccent: accentSyn,
    themeAccentStrategy: parsePersistedThemeAccentStrategy(r.themeAccentStrategy),
    appliedThemeSnapshot: parseAppliedThemeSnapshot(r.appliedThemeSnapshot),
    siteThemeSectionDefaults: parseSiteThemeSectionDefaultsObject(r.siteThemeSectionDefaults ?? null),
  };
}
