import { normalizeHomeSectionOrderForBuilder, type TenantHomeSectionKey } from '../../../tenant/tenantSiteConfig';

/** Shape of `JSON.stringify(formSnapshot)` in AdminTenantSiteBuilderPage — used to restore draft from baseline. */
export type BuilderFormBaselineSnapshot = {
  siteName: string;
  displayName: string;
  logoUrl: string;
  heroImageUrl: string;
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
};

function pickString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
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

  return {
    siteName: pickString(r.siteName),
    displayName: pickString(r.displayName),
    logoUrl: pickString(r.logoUrl),
    heroImageUrl: pickString(r.heroImageUrl),
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
  };
}
