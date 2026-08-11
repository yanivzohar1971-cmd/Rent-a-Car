import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import type { YardProfileData } from '../api/yardProfileApi';
import { resolveTenantPageRootReadableBodyTextColor } from './tenantVisualResolver';
import {
  normalizeTenantSiteConfig,
  type NormalizedTenantSiteConfig,
  type TenantLogoSource,
  type TenantThemeVariant,
} from './tenantSiteConfig';

function trimOrNull(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t || null;
}

export interface TenantThemeTokens {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
}

export interface TenantContactInfo {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

export interface TenantBrandingModel {
  tenantId: string | null;
  displayName: string | null;
  businessName: string | null;
  siteName: string | null;
  logoUrl: string | null;
  logoSource: TenantLogoSource | null;
  logoWebsiteCandidate: string | null;
  logoYardCandidate: string | null;
  heroImageUrl: string | null;
  /** Same as normalized branding: ≥2 slides enables hero carousel. */
  heroImageUrls: string[];
  /** Page-level backdrop (not the hero card image). */
  pageBackgroundImageUrl: string | null;
  /** 0–0.85; null → default overlay in renderer. */
  pageBackgroundOverlayOpacity: number | null;
  contact: TenantContactInfo;
  theme: TenantThemeTokens;
  textColor: string | null;
  backgroundColor: string | null;
  /** Optional homepage primary CTA colors from site research. */
  primaryCtaBackgroundColor: string | null;
  primaryCtaTextColor: string | null;
  themeVariant: TenantThemeVariant;
}

/** True when the tenant shell shows the contact strip above the minimal footer (see #tenant-contact anchor). */
export function tenantBrandingHasPublicContactBar(b: TenantBrandingModel): boolean {
  const c = b.contact;
  return !!(
    trimOrNull(c.phone) ||
    trimOrNull(c.whatsapp) ||
    trimOrNull(c.email) ||
    trimOrNull(c.address) ||
    trimOrNull(c.city) ||
    trimOrNull(c.websiteUrl) ||
    trimOrNull(c.facebookUrl) ||
    trimOrNull(c.instagramUrl)
  );
}

export function tenantBrandingFromNormalized(n: NormalizedTenantSiteConfig): TenantBrandingModel {
  const name = n.branding.displayName ?? n.branding.siteName;

  return {
    tenantId: n.tenantId,
    displayName: name,
    businessName: name,
    siteName: n.branding.siteName ?? n.branding.displayName,
    logoUrl: n.branding.logoUrl,
    logoSource: n.branding.logoSource,
    logoWebsiteCandidate: n.branding.logoWebsiteCandidate,
    logoYardCandidate: n.branding.logoYardCandidate,
    heroImageUrl: n.branding.heroImageUrl,
    heroImageUrls: n.branding.heroImageUrls,
    pageBackgroundImageUrl: n.branding.pageBackgroundImageUrl,
    pageBackgroundOverlayOpacity: n.branding.pageBackgroundOverlayOpacity,
    contact: { ...n.contact },
    theme: {
      primaryColor: n.branding.primaryColor,
      secondaryColor: n.branding.secondaryColor,
      accentColor: n.branding.accentColor,
    },
    textColor: n.branding.textColor,
    backgroundColor: n.branding.backgroundColor,
    primaryCtaBackgroundColor: n.branding.primaryCtaBackgroundColor,
    primaryCtaTextColor: n.branding.primaryCtaTextColor,
    themeVariant: n.branding.themeVariant,
  };
}

export function resolveTenantBranding(siteConfig: TenantSiteConfig | null, tenantId: string | null): TenantBrandingModel {
  return tenantBrandingFromNormalized(normalizeTenantSiteConfig(siteConfig, tenantId));
}

/**
 * When tenant site config omits logo / contact / name, fall back to the linked yard public profile.
 * Does not mutate Firestore — display/runtime merge only. Preserves explicit config values.
 */
function resolveMergedTenantLogoUrl(base: TenantBrandingModel, yLogo: string | null): string | null {
  const site = trimOrNull(base.logoWebsiteCandidate ?? undefined);
  const manual = trimOrNull(base.logoUrl ?? undefined);
  const y = yLogo;
  switch (base.logoSource) {
    case 'yard':
      return y || manual || site || null;
    case 'website':
      return site || manual || y || null;
    case 'manual':
      return manual || null;
    default:
      return manual || y || site || null;
  }
}

export function mergeYardProfileIntoTenantBranding(
  base: TenantBrandingModel,
  yard: YardProfileData | null,
): TenantBrandingModel {
  if (!yard) return base;
  const yName = trimOrNull(yard.displayName);
  const yLogo = trimOrNull(yard.yardLogoUrl ?? undefined);
  const yPhone = trimOrNull(yard.phone);
  const yWhatsapp = trimOrNull(yard.whatsappServicePhone ?? undefined);
  const yEmail = trimOrNull(yard.email);
  const yAddress = trimOrNull(yard.address);
  const yCity = trimOrNull(yard.city);
  const yWebsite = trimOrNull(yard.website);

  return {
    ...base,
    logoUrl: resolveMergedTenantLogoUrl(base, yLogo),
    displayName: base.displayName ?? yName,
    businessName: base.businessName ?? yName,
    siteName: base.siteName ?? yName,
    contact: {
      phone: base.contact.phone ?? yPhone,
      whatsapp: base.contact.whatsapp ?? yWhatsapp,
      email: base.contact.email ?? yEmail,
      address: base.contact.address ?? yAddress,
      city: base.contact.city ?? yCity,
      facebookUrl: base.contact.facebookUrl,
      instagramUrl: base.contact.instagramUrl,
      websiteUrl: base.contact.websiteUrl ?? yWebsite,
    },
  };
}

/** SaaS tenant record name when yard profile is unavailable or has no displayName. */
export function applySaasTenantNameFallback(
  base: TenantBrandingModel,
  saasTenantName: string | null | undefined,
): TenantBrandingModel {
  const t = trimOrNull(saasTenantName ?? undefined);
  if (!t) return base;
  return {
    ...base,
    displayName: base.displayName ?? t,
    businessName: base.businessName ?? t,
    siteName: base.siteName ?? t,
  };
}

/** Single merge path for live + builder: yard profile + SaaS tenant name. */
export function finalizeTenantRuntimeBranding(
  base: TenantBrandingModel,
  yard: YardProfileData | null,
  saasTenantName: string | null | undefined,
): TenantBrandingModel {
  const merged = applySaasTenantNameFallback(mergeYardProfileIntoTenantBranding(base, yard), saasTenantName);
  const textColor = resolveTenantPageRootReadableBodyTextColor({
    textColor: merged.textColor,
    backgroundColor: merged.backgroundColor,
    pageBackgroundImageUrl: merged.pageBackgroundImageUrl,
  });
  if (textColor === merged.textColor) return merged;
  return { ...merged, textColor };
}
