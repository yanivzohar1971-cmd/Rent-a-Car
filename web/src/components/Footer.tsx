import { Link } from 'react-router-dom';
import './Footer.css';
import { DEPLOY_LABEL, BUILD_VERSION } from '../config/buildInfo';

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
        <div className="footer-meta">
          <p className="footer-deploy">
            Deploy: {DEPLOY_LABEL} | Version: {BUILD_VERSION}
          </p>
          <p className="footer-copyright">
            © {new Date().getFullYear()} CarExpert. כל הזכויות שמורות.
          </p>
        </div>
      </div>
    </footer>
  );
}

