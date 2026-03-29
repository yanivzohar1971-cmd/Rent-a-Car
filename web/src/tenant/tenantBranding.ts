import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import { normalizeTenantSiteConfig, type NormalizedTenantSiteConfig, type TenantThemeVariant } from './tenantSiteConfig';

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
  heroImageUrl: string | null;
  contact: TenantContactInfo;
  theme: TenantThemeTokens;
  textColor: string | null;
  backgroundColor: string | null;
  themeVariant: TenantThemeVariant;
}

export function tenantBrandingFromNormalized(n: NormalizedTenantSiteConfig): TenantBrandingModel {
  const name = n.branding.displayName ?? n.branding.siteName;

  return {
    tenantId: n.tenantId,
    displayName: name,
    businessName: name,
    siteName: n.branding.siteName ?? n.branding.displayName,
    logoUrl: n.branding.logoUrl,
    heroImageUrl: n.branding.heroImageUrl,
    contact: { ...n.contact },
    theme: {
      primaryColor: n.branding.primaryColor,
      secondaryColor: n.branding.secondaryColor,
      accentColor: n.branding.accentColor,
    },
    textColor: n.branding.textColor,
    backgroundColor: n.branding.backgroundColor,
    themeVariant: n.branding.themeVariant,
  };
}

export function resolveTenantBranding(siteConfig: TenantSiteConfig | null, tenantId: string | null): TenantBrandingModel {
  return tenantBrandingFromNormalized(normalizeTenantSiteConfig(siteConfig, tenantId));
}
