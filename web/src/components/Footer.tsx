import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';
import { BUILD_LABEL } from '../config/buildInfo';
import { BuildInfoDialog } from './BuildInfoDialog';
import { BRAND_NAME } from '../config/branding';

// NOTE (AI / Cursor):
// The build version indicator and the "Build Info" button in this footer
// are mandatory diagnostics. Do NOT remove them.
// You may improve styling or layout, but the features must remain.
// See web/docs/AI_GLOBAL_RULES.md (Build Info Center section).

export default function Footer() {
  const [isBuildInfoOpen, setIsBuildInfoOpen] = useState(false);

  return (
    <>
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-links">
            <Link to="/topics" className="footer-link">
              מדריכים ועמודי מידע
            </Link>
            <span className="footer-separator">|</span>
            <Link to="/legal/terms" className="footer-link">
              תקנון ותנאי שימוש
            </Link>
            <span className="footer-separator">|</span>
            <Link to="/legal/content-policy" className="footer-link">
              מדיניות תוכן ומודעות
            </Link>
          </div>
          <div className="footer-meta">
            <p className="footer-copyright">
              © {new Date().getFullYear()} {BRAND_NAME}. כל הזכויות שמורות.
            </p>
            {/* Bilingual E&O / AS-IS disclaimer */}
            <p className="footer-disclaimer">
              ט.ל.ח. | ייתכנו שגיאות או אי־דיוקים במידע המוצג; המידע מוצג כמות שהוא ואינו מהווה התחייבות מכל סוג.
              <br />
              Errors and omissions excepted | The information is provided as-is and does not constitute any form of commitment.
            </p>
            {/* Deploy version indicator */}
            <p className="footer-version">
              גרסת מערכת:&nbsp;
              <span className="footer-version-value">{BUILD_LABEL}</span>
              <button
                type="button"
                className="footer-buildinfo-button"
                onClick={() => setIsBuildInfoOpen(true)}
              >
                Build Info
              </button>
            </p>
          </div>
        </div>
      </footer>

      <BuildInfoDialog
        open={isBuildInfoOpen}
        onClose={() => setIsBuildInfoOpen(false)}
      />
    </>
  );
}

