import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { PublicCar } from '../../types/cars';
import type { TenantBrandingModel } from '../../tenant/tenantBranding';
import type { NormalizedTenantSiteConfig, TenantHomeSectionKey } from '../../tenant/tenantSiteConfig';
import { buildTenantPhoneHref, buildTenantWhatsappHref } from '../../tenant/tenantContact';
import './TenantHomeBlocks.css';

function formatPrice(price: number | null): string {
  return typeof price === 'number' ? `${price.toLocaleString('he-IL')} ₪` : 'מחיר זמין בפרטים';
}

function resolveCtaHref(link: string | null): { external: boolean; href: string } | null {
  if (!link) return null;
  const t = link.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return { external: true, href: t };
  const path = t.startsWith('/') ? t : `/${t}`;
  return { external: false, href: path };
}

function previewThemeStyle(branding: TenantBrandingModel): CSSProperties {
  const vars: Record<string, string> = {};
  if (branding.theme.primaryColor) vars['--tenant-primary-color'] = branding.theme.primaryColor;
  if (branding.theme.secondaryColor) vars['--tenant-secondary-color'] = branding.theme.secondaryColor;
  if (branding.theme.accentColor) vars['--tenant-accent-color'] = branding.theme.accentColor;
  if (branding.textColor) vars['--tenant-text-color'] = branding.textColor;
  if (branding.backgroundColor) vars['--tenant-background-color'] = branding.backgroundColor;
  return vars as CSSProperties;
}

export interface TenantHomeSectionsViewProps {
  normalized: NormalizedTenantSiteConfig;
  branding: TenantBrandingModel;
  isPreview?: boolean;
  cars?: PublicCar[];
  scopeMissing?: boolean;
  /** SaaS: hide featured inventory messaging on live tenant site */
  publicSiteSuspended?: boolean;
  rootClassName?: string;
}

export default function TenantHomeSectionsView({
  normalized,
  branding,
  isPreview = false,
  cars = [],
  scopeMissing = false,
  publicSiteSuspended = false,
  rootClassName = '',
}: TenantHomeSectionsViewProps) {
  const { content, contact, layout } = normalized;
  const tenantName = branding.displayName || branding.businessName || 'האתר';

  const phoneHref = buildTenantPhoneHref(contact.phone ?? branding.contact.phone);
  const whatsappHref = buildTenantWhatsappHref(contact.whatsapp ?? branding.contact.whatsapp, contact.phone ?? branding.contact.phone);

  const mergedContact = {
    phone: contact.phone ?? branding.contact.phone,
    whatsapp: contact.whatsapp ?? branding.contact.whatsapp,
    email: contact.email ?? branding.contact.email,
    address: contact.address ?? branding.contact.address,
    city: contact.city ?? branding.contact.city,
    facebookUrl: contact.facebookUrl ?? branding.contact.facebookUrl,
    instagramUrl: contact.instagramUrl ?? branding.contact.instagramUrl,
    websiteUrl: contact.websiteUrl ?? branding.contact.websiteUrl,
  };

  const heroTitle = content.heroTitle || tenantName;
  const heroSubtitle = content.heroSubtitle || `ברוכים הבאים לאתר הרכבים של ${tenantName}`;
  const cta = resolveCtaHref(content.heroCtaLink);
  const ctaLabel = content.heroCtaText || `לרכבים של ${tenantName}`;

  const hasQuickContact = !!(mergedContact.phone || mergedContact.whatsapp);

  const sectionAllowed = (key: TenantHomeSectionKey): boolean => {
    switch (key) {
      case 'featuredCars':
        return layout.showFeaturedCars;
      case 'about':
        return layout.showAbout;
      case 'benefits':
        return layout.showBenefits;
      case 'finance':
        return layout.showFinance;
      case 'testimonials':
        return layout.showTestimonials;
      case 'contact':
        return layout.showContact;
      case 'map':
        return layout.showMap;
      default:
        return true;
    }
  };

  const shouldRenderSection = (key: TenantHomeSectionKey): boolean => {
    if (!sectionAllowed(key)) return false;
    switch (key) {
      case 'hero':
        return true;
      case 'featuredCars':
        return layout.showFeaturedCars;
      case 'about':
        return !!(content.aboutText || content.aboutTitle);
      case 'benefits':
        return !!(content.benefitsItems.length > 0 || content.benefitsTitle);
      case 'finance':
        return !!(content.financeText || content.financeTitle);
      case 'testimonials':
        return !!(content.testimonialsText || content.testimonialsTitle);
      case 'contact':
        return layout.showContact && (hasQuickContact || !!content.contactTitle || !!content.contactSubtitle || !!mergedContact.email);
      case 'map':
        return !!(mergedContact.address || mergedContact.city);
      default:
        return false;
    }
  };

  const orderedSections = layout.homeSections.filter((k) => shouldRenderSection(k));
  const sectionsToRender: TenantHomeSectionKey[] =
    orderedSections.length > 0 ? orderedSections : (['hero'] as TenantHomeSectionKey[]);

  const variantClass = `tenant-variant-${branding.themeVariant}`;

  const heroStyle: CSSProperties | undefined = branding.heroImageUrl
    ? {
        backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url(${branding.heroImageUrl})`,
      }
    : undefined;

  const renderCta = () => {
    if (isPreview) {
      return <span className="tenant-home-primary-btn tenant-home-preview-fake-btn">{ctaLabel}</span>;
    }
    if (cta) {
      if (cta.external) {
        return (
          <a href={cta.href} className="tenant-home-primary-btn" target="_blank" rel="noreferrer">
            {ctaLabel}
          </a>
        );
      }
      return (
        <Link to={cta.href} className="tenant-home-primary-btn">
          {ctaLabel}
        </Link>
      );
    }
    return (
      <Link to="/cars" className="tenant-home-primary-btn">
        {ctaLabel}
      </Link>
    );
  };

  const renderSection = (key: TenantHomeSectionKey) => {
    switch (key) {
      case 'hero':
        return (
          <div key={key} className="tenant-home-hero" style={heroStyle}>
            <h2>{heroTitle}</h2>
            <p>{heroSubtitle}</p>
            <div className="tenant-home-hero-cta-row">{renderCta()}</div>
          </div>
        );
      case 'featuredCars':
        return (
          <div key={key} className="tenant-home-featured-cars">
            <h3>רכבים נבחרים</h3>
            {isPreview ? (
              <>
                {cars.length > 0 ? (
                  <>
                    <p className="tenant-home-muted">תצוגה מקדימה (טיוטה) — לאחר שמירה יוצגו בדומיין החי.</p>
                    <div className="tenant-home-cars-grid">
                      {cars.map((car) => (
                        <div key={car.carId} className="tenant-home-car-card tenant-home-preview-car-card">
                          {car.mainImageUrl ? (
                            <img src={car.mainImageUrl} alt={`${car.brand || ''} ${car.model || ''}`} loading="lazy" />
                          ) : (
                            <div className="tenant-home-preview-thumb" />
                          )}
                          <div className="tenant-home-car-meta">
                            <strong>
                              {car.year || ''} {car.brand || ''} {car.model || ''}
                            </strong>
                            <span>{formatPrice(car.price)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="tenant-home-muted">
                    אין רכבים לתצוגה מקדימה. הגדירו yardUid ב־data scope, הוסיפו רכבים מפורסמים למלאי, ובחרו רכבים נבחרים בעורך האתר.
                  </p>
                )}
              </>
            ) : publicSiteSuspended ? (
              <p className="tenant-home-muted">האתר אינו מציג מלאי כרגע (מנוי / סטטוס).</p>
            ) : scopeMissing ? (
              <p className="tenant-home-muted">היקף מלאי לא הוגדר לדומיין זה. יש להגדיר yardUid ב־tenantSiteConfigs.</p>
            ) : cars.length > 0 ? (
              <div className="tenant-home-cars-grid">
                {cars.map((car) => (
                  <Link key={car.carId} to={`/cars/${car.carId}`} className="tenant-home-car-card">
                    {car.mainImageUrl ? <img src={car.mainImageUrl} alt={`${car.brand || ''} ${car.model || ''}`} loading="lazy" /> : null}
                    <div className="tenant-home-car-meta">
                      <strong>
                        {car.year || ''} {car.brand || ''} {car.model || ''}
                      </strong>
                      <span>{formatPrice(car.price)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="tenant-home-muted">אין רכבים זמינים להצגה כרגע.</p>
            )}
          </div>
        );
      case 'about':
        return (
          <div key={key} className="tenant-home-about">
            <h3>{content.aboutTitle || 'קצת עלינו'}</h3>
            {content.aboutText ? <p>{content.aboutText}</p> : null}
          </div>
        );
      case 'benefits':
        return (
          <div key={key} className="tenant-home-benefits">
            <h3>{content.benefitsTitle || 'למה לבחור בנו'}</h3>
            {content.benefitsItems.length > 0 ? (
              <ul>
                {content.benefitsItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      case 'finance':
        return (
          <div key={key} className="tenant-home-finance">
            <h3>{content.financeTitle || 'מימון'}</h3>
            {content.financeText ? <p>{content.financeText}</p> : null}
          </div>
        );
      case 'testimonials':
        return (
          <div key={key} className="tenant-home-testimonials">
            <h3>{content.testimonialsTitle || 'מה לקוחות אומרים'}</h3>
            {content.testimonialsText ? <p>{content.testimonialsText}</p> : null}
          </div>
        );
      case 'contact':
        return (
          <div key={key} className="tenant-home-contact-cta">
            <h3>{content.contactTitle || 'יצירת קשר'}</h3>
            {content.contactSubtitle ? <p className="tenant-home-contact-sub">{content.contactSubtitle}</p> : null}
            <div className="tenant-home-contact-actions">
              {phoneHref ? (
                <a href={phoneHref} className="tenant-home-action-link">
                  טלפון: {mergedContact.phone}
                </a>
              ) : null}
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer" className="tenant-home-action-link tenant-home-whatsapp-link">
                  WhatsApp
                </a>
              ) : null}
              {mergedContact.email ? (
                <a href={`mailto:${mergedContact.email}`} className="tenant-home-action-link">
                  {mergedContact.email}
                </a>
              ) : null}
              {isPreview ? (
                <span className="tenant-home-action-link tenant-home-preview-fake-link">{ctaLabel}</span>
              ) : (
                <Link to="/cars" className="tenant-home-action-link">
                  {ctaLabel}
                </Link>
              )}
            </div>
          </div>
        );
      case 'map': {
        const query = [mergedContact.address, mergedContact.city].filter(Boolean).join(', ');
        const mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
        return mapsUrl ? (
          <div key={key} className="tenant-home-map">
            <h3>מיקום</h3>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="tenant-home-action-link">
              פתיחה במפות Google
            </a>
          </div>
        ) : null;
      }
      default:
        return null;
    }
  };

  const rootStyle = isPreview ? previewThemeStyle(branding) : undefined;

  return (
    <section className={`tenant-home-blocks ${variantClass} ${isPreview ? 'tenant-home-blocks-preview' : ''} ${rootClassName}`.trim()} style={rootStyle}>
      {sectionsToRender.map((key) => renderSection(key))}
    </section>
  );
}
