import { Link, Outlet } from 'react-router-dom';
import './MainLayout.css';

export default function MainLayout() {
  return (
    <div className="main-layout">
      <header className="header">
        <div className="header-content">
          <Link to="/" className="logo">
            <h1>CarExpert</h1>
            <span className="logo-subtitle">Rent A Car</span>
          </Link>
          <nav className="nav">
            <Link to="/cars" className="nav-link">רכבים</Link>
            <Link to="/" className="nav-link">על השירות</Link>
          </nav>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

