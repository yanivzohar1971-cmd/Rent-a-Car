import type { TenantSiteConfig, TenantSiteConfigWritePayload } from '../api/tenantSiteConfigsApi';
import { normalizeTenantSiteConfig } from './tenantSiteConfig';

/**
 * Full Website Builder seed for a new tenant. Compatible with `normalizeTenantSiteConfig`.
 * Home order uses `benefits` (not `whyUs`) — that is the canonical key for “למה אנחנו” bullets.
 */
export function createDefaultTenantSiteConfig(tenantId: string, tenantDisplayName?: string): TenantSiteConfigWritePayload {
  const id = tenantId.trim();
  const name = (tenantDisplayName ?? id).trim() || id;

  const payload: TenantSiteConfigWritePayload = {
    branding: {
      siteName: name,
      displayName: name,
      primaryColor: '#0ea5e9',
      secondaryColor: '#111827',
      accentColor: '#22c55e',
      themeVariant: 'modern',
    },
    layout: {
      homeSections: ['hero', 'featuredCars', 'about', 'benefits', 'contact'],
      showFeaturedCars: true,
      showAbout: true,
      showBenefits: true,
      showFinance: false,
      showTestimonials: false,
      showContact: true,
      showMap: false,
    },
    content: {
      heroTitle: `ברוכים הבאים ל-${name}`,
      heroSubtitle: 'רכבים איכותיים במחירים מעולים',
      heroCtaText: 'לצפייה ברכבים',
      aboutTitle: 'קצת עלינו',
      aboutText:
        'אנו מתמחים במכירת רכבים איכותיים ומספקים שירות אמין ומקצועי. המטרה שלנו היא ללוות אתכם לבחירה הנכונה — בנוחות, בשקיפות ובמחיר הוגן.',
      benefitsTitle: 'למה לבחור בנו',
      benefitsItems: ['אמינות', 'שירות אישי', 'רכבים נבחרים'],
      contactTitle: 'יצירת קשר',
      contactSubtitle: 'נשמח לעמוד לשירותכם',
    },
    contact: {
      phone: '050-0000000',
      whatsapp: '0500000000',
    },
    seo: {
      title: `${name} - רכבים למכירה`,
      description: 'מבחר רכבים איכותיים במחירים משתלמים',
    },
  };

  // `payload` here is locally constructed with plain objects (not FieldValue sentinels).
  const assembled: TenantSiteConfig = { tenantId: id, ...payload } as TenantSiteConfig;
  normalizeTenantSiteConfig(assembled, id);

  return payload;
}
