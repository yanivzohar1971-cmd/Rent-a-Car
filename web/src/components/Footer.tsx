import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-links">
          <Link to="/legal/terms" className="footer-link">
            תקנון ותנאי שימוש
          </Link>
          <span className="footer-separator">|</span>
          <Link to="/legal/content-policy" className="footer-link">
            מדיניות תוכן ומודעות
          </Link>
        </div>
        <p className="footer-copyright">
          © {new Date().getFullYear()} CarExpert. כל הזכויות שמורות.
        </p>
      </div>
    </footer>
  );
}

