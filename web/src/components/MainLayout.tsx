import { Link, NavLink, Outlet } from 'react-router-dom';
import './MainLayout.css';

export default function MainLayout() {
  return (
    <div className="main-layout">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <h1>CarExpert</h1>
            <span className="logo-subtitle">לאתר חיפוש רכבים</span>
          </Link>
          <nav className="nav">
            <NavLink 
              to="/" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              עמוד הבית
            </NavLink>
            <NavLink 
              to="/cars" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              רכבים למכירה
            </NavLink>
            <NavLink 
              to="/account" 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              האזור האישי
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

