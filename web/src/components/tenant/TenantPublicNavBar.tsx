import { Link, NavLink, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';
import { isTenantShellBlogNavEnabled } from '../../tenant/tenantShellFlags';
import './TenantPublicNavBar.css';

/**
 * Full white-label header for tenant storefronts only (custom domain or /tenant/:id preview).
 * Replaces the platform navbar — no account, sell, or marketplace CTAs.
 */
export default function TenantPublicNavBar() {
  const { isTenantHost, branding, siteConfig } = useTenantSiteConfig();
  const location = useLocation();
  const showBlog = isTenantShellBlogNavEnabled(siteConfig);

  const homePath = useMemo(() => {
    const m = location.pathname.match(/^\/tenant\/([^/]+)/);
    if (m) return `/tenant/${m[1]}`;
    return '/';
  }, [location.pathname]);

  const displayName = branding.displayName || branding.businessName || branding.siteName || 'האתר';

  if (!isTenantHost) return null;

  const contactTo = `${homePath}#tenant-contact`;

  return (
    <header className="tenant-public-nav" data-tenant-shell="header">
      <div className="tenant-public-nav__inner">
        <Link to={homePath} className="tenant-public-nav__brand" aria-label={`${displayName} — עמוד הבית`}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="" className="tenant-public-nav__logo" />
          ) : null}
          <span className="tenant-public-nav__name">{displayName}</span>
        </Link>
        <nav className="tenant-public-nav__links" aria-label="ניווט אתר">
          <NavLink
            to={homePath}
            end
            className={({ isActive }) => `tenant-public-nav__link${isActive ? ' tenant-public-nav__link--active' : ''}`}
          >
            עמוד הבית
          </NavLink>
          <NavLink
            to="/cars"
            className={({ isActive }) => `tenant-public-nav__link${isActive ? ' tenant-public-nav__link--active' : ''}`}
          >
            רכבים למכירה
          </NavLink>
          {showBlog ? (
            <NavLink
              to="/blog"
              className={({ isActive }) => `tenant-public-nav__link${isActive ? ' tenant-public-nav__link--active' : ''}`}
            >
              בלוג
            </NavLink>
          ) : null}
          <Link to={contactTo} className="tenant-public-nav__link">
            צור קשר
          </Link>
        </nav>
      </div>
      {/* TODO(seo): Decide canonical strategy for /blog on tenant host vs main platform domain; shell stays on tenant URL. */}
    </header>
  );
}
