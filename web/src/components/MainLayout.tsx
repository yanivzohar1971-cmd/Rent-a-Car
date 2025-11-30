import { Link, Outlet } from 'react-router-dom';
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
            <Link to="/" className="nav-link">עמוד הבית</Link>
            <Link to="/cars" className="nav-link">רכבים למכירה</Link>
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

