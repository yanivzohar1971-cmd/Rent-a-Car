import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';
import { tenantBrandingHasPublicContactBar } from '../../tenant/tenantBranding';
import './TenantPublicFooterStrip.css';

/**
 * Minimal tenant-only footer (no platform links, no CarExperts copyright).
 * Sits after {@link TenantFooterSurface} contact block when present.
 */
export default function TenantPublicFooterStrip() {
  const { isTenantHost, branding } = useTenantSiteConfig();
  if (!isTenantHost) return null;

  const name = branding.displayName || branding.businessName || branding.siteName || 'האתר';
  const year = new Date().getFullYear();
  const contactAnchorHere = !tenantBrandingHasPublicContactBar(branding);

  return (
    <footer
      className="tenant-public-footer-strip"
      data-tenant-shell="footer"
      id={contactAnchorHere ? 'tenant-contact' : undefined}
    >
      <div className="tenant-public-footer-strip__inner">
        <p className="tenant-public-footer-strip__copy">© {year} {name}</p>
        <p className="tenant-public-footer-strip__disclaimer">
          ט.ל.ח. | המידע מוצג כמות שהוא ואינו מהווה התחייבות.
        </p>
      </div>
    </footer>
  );
}
