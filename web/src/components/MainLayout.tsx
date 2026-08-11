import { Link, NavLink, Outlet } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';
import NotificationBell from './NotificationBell';
import Footer from './Footer';
import { TenantFooterSurface } from './tenant/TenantShellSurface';
import TenantPublicNavBar from './tenant/TenantPublicNavBar';
import TenantPublicFooterStrip from './tenant/TenantPublicFooterStrip';
import TenantLifecycleBanner from './tenant/TenantLifecycleBanner';
import { useTenantSiteConfig } from '../hooks/useTenantSiteConfig';
import { BRAND_NAME } from '../config/branding';
import './MainLayout.css';

export default function MainLayout() {
  const { isTenantHost } = useTenantSiteConfig();

  return (
    <div className={`main-layout${isTenantHost ? ' main-layout--tenant-shell' : ''}`}>
      <ScrollToTop />
      {isTenantHost ? (
        <TenantPublicNavBar />
      ) : (
        <header className="header">
          <div className="header-content">
            <Link to="/" className="logo">
              <h1>{BRAND_NAME}</h1>
              <span className="logo-subtitle">לאתר חיפוש רכבים</span>
            </Link>
            <nav className="nav">
              <Link to="/sell" className="nav-cta-button">
                הוספת מודעה
              </Link>
              <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                עמוד הבית
              </NavLink>
              <NavLink to="/cars" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                רכבים למכירה
              </NavLink>
              <NavLink to="/blog" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                בלוג
              </NavLink>
              <NavLink to="/account" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                האזור האישי
              </NavLink>
              <NotificationBell />
            </nav>
          </div>
        </header>
      )}
      <main className="main-content">
        <TenantLifecycleBanner />
        <Outlet />
      </main>
      <TenantFooterSurface />
      {isTenantHost ? <TenantPublicFooterStrip /> : <Footer />}
    </div>
  );
}
