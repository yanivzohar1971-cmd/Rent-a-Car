import { Link } from 'react-router-dom';
import { useTenantBranding } from '../../hooks/useTenantBranding';
import { buildTenantPhoneHref, buildTenantWhatsappHref } from '../../tenant/tenantContact';
import './TenantShellSurface.css';

export function TenantHeaderSurface() {
  const { isTenantHost, branding } = useTenantBranding();
  if (!isTenantHost) return null;

  const tenantName = branding.displayName || branding.businessName || 'Tenant';
  const phoneHref = buildTenantPhoneHref(branding.contact.phone);
  const whatsappHref = buildTenantWhatsappHref(branding.contact.whatsapp, branding.contact.phone);

  return (
    <div className={`tenant-shell-surface tenant-shell-header tenant-shell-variant-${branding.themeVariant}`}>
      <Link to="/" className="tenant-shell-brand">
        {branding.logoUrl ? <img src={branding.logoUrl} alt={tenantName} className="tenant-shell-logo" /> : null}
        <span className="tenant-shell-name">{tenantName}</span>
      </Link>
      <div className="tenant-shell-actions">
        {branding.contact.websiteUrl ? (
          <a href={branding.contact.websiteUrl} className="tenant-shell-action-link" target="_blank" rel="noreferrer">
            אתר
          </a>
        ) : null}
        {phoneHref ? (
          <a href={phoneHref} className="tenant-shell-action-link">
            {branding.contact.phone}
          </a>
        ) : null}
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className="tenant-shell-action-link tenant-shell-whatsapp-link">
            WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function TenantFooterSurface() {
  const { isTenantHost, branding } = useTenantBranding();
  if (!isTenantHost) return null;

  const tenantName = branding.displayName || branding.businessName || 'Tenant';
  const phoneHref = buildTenantPhoneHref(branding.contact.phone);
  const whatsappHref = buildTenantWhatsappHref(branding.contact.whatsapp, branding.contact.phone);
  const hasContact =
    !!branding.contact.phone ||
    !!branding.contact.whatsapp ||
    !!branding.contact.email ||
    !!branding.contact.address ||
    !!branding.contact.city ||
    !!branding.contact.websiteUrl ||
    !!branding.contact.facebookUrl ||
    !!branding.contact.instagramUrl;

  if (!hasContact) return null;

  const locationLine = [branding.contact.address, branding.contact.city].filter(Boolean).join(' · ');

  return (
    <section className={`tenant-shell-surface tenant-shell-footer tenant-shell-variant-${branding.themeVariant}`}>
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
