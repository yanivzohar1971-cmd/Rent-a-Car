import { useTenantBranding } from '../../hooks/useTenantBranding';
import { buildTenantPhoneHref, buildTenantWhatsappHref } from '../../tenant/tenantContact';
import { tenantBrandingHasPublicContactBar } from '../../tenant/tenantBranding';
import './TenantShellSurface.css';

/** Header chrome lives in {@link TenantPublicNavBar}; this module is the tenant contact strip above the slim copyright footer. */

export function TenantFooterSurface() {
  const { isTenantHost, branding } = useTenantBranding();
  if (!isTenantHost) return null;

  const tenantName = branding.displayName || branding.businessName || 'Tenant';
  const phoneHref = buildTenantPhoneHref(branding.contact.phone);
  const whatsappHref = buildTenantWhatsappHref(branding.contact.whatsapp, branding.contact.phone);
  if (!tenantBrandingHasPublicContactBar(branding)) return null;

  const locationLine = [branding.contact.address, branding.contact.city].filter(Boolean).join(' · ');

  return (
    <section
      id="tenant-contact"
      className={`tenant-shell-surface tenant-shell-footer tenant-shell-variant-${branding.themeVariant}`}
    >
      <h3 className="tenant-shell-footer-title">יצירת קשר - {tenantName}</h3>
      <div className="tenant-shell-footer-grid">
        {branding.contact.phone ? (
          <p>
            טלפון:{' '}
            {phoneHref ? (
              <a href={phoneHref} className="tenant-shell-action-link">
                {branding.contact.phone}
              </a>
            ) : (
              branding.contact.phone
            )}
          </p>
        ) : null}
        {branding.contact.whatsapp ? (
          <p>
            WhatsApp:{' '}
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="tenant-shell-action-link tenant-shell-whatsapp-link">
                {branding.contact.whatsapp}
              </a>
            ) : (
              branding.contact.whatsapp
            )}
          </p>
        ) : null}
        {branding.contact.email ? (
          <p>
            אימייל:{' '}
            <a href={`mailto:${branding.contact.email}`} className="tenant-shell-action-link">
              {branding.contact.email}
            </a>
          </p>
        ) : null}
        {locationLine ? <p>כתובת: {locationLine}</p> : null}
        {branding.contact.websiteUrl ? (
          <p>
            <a href={branding.contact.websiteUrl} className="tenant-shell-action-link" target="_blank" rel="noreferrer">
              אתר
            </a>
          </p>
        ) : null}
        <div className="tenant-shell-social-row">
          {branding.contact.facebookUrl ? (
            <a href={branding.contact.facebookUrl} className="tenant-shell-action-link" target="_blank" rel="noreferrer">
              Facebook
            </a>
          ) : null}
          {branding.contact.instagramUrl ? (
            <a href={branding.contact.instagramUrl} className="tenant-shell-action-link" target="_blank" rel="noreferrer">
              Instagram
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
