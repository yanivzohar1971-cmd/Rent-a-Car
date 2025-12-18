import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPromoThemeConfig, updatePromoThemeConfig, type PromoThemeMode, type CssPreset } from '../api/promoThemeApi';
import './AdminPromoThemePage.css';

export default function AdminPromoThemePage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<{ mode: PromoThemeMode; cssPreset: CssPreset } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    if (authLoading) return; // Wait for auth/profile to load
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    loadConfig();
  }, [authLoading, isAdmin]);

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getPromoThemeConfig();
      setConfig({
        mode: cfg.mode,
        cssPreset: cfg.cssPreset,
      });
    } catch (err: any) {
      console.error('Error loading promo theme config:', err);
      setError(err?.message || 'שגיאה בטעינת הגדרות ערכת נושא קידום');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updatePromoThemeConfig({
        mode: config.mode,
        cssPreset: config.cssPreset,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving promo theme config:', err);
      setError(err?.message || 'שגיאה בשמירת הגדרות');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="admin-page">
        <div className="admin-page-header">
          <h1>הגדרות ערכת נושא קידום</h1>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center' }}>טוען...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="admin-page">
        <div className="admin-page-header">
          <h1>הגדרות ערכת נושא קידום</h1>
        </div>
        <div style={{ padding: '2rem' }}>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1>הגדרות ערכת נושא קידום</h1>
        <p className="admin-page-description">
          הגדר את מצב התצוגה של רקעי הקידום: תמונות (AUTO/AVIF/PNG) או CSS בלבד
        </p>
      </div>

      <div className="admin-promo-theme-form">
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">ההגדרות נשמרו בהצלחה!</div>}

        <div className="form-group">
          <label htmlFor="mode">מצב תצוגה *</label>
          <select
            id="mode"
            value={config.mode}
            onChange={(e) => setConfig({ ...config, mode: e.target.value as PromoThemeMode })}
            disabled={saving}
          >
            <option value="AUTO">AUTO - בחירה אוטומטית (AVIF אם זמין, אחרת PNG)</option>
            <option value="AVIF">AVIF - תמונות AVIF בלבד</option>
            <option value="PNG">PNG - תמונות PNG בלבד</option>
            <option value="CSS">CSS - גרדיאנטים CSS בלבד (ללא תמונות)</option>
          </select>
          <p className="form-help">
            במצב CSS, רקעי הקידום יוצגו באמצעות גרדיאנטים CSS בלבד ללא שימוש בתמונות.
          </p>
        </div>

        {config.mode === 'CSS' && (
          <div className="form-group">
            <label htmlFor="cssPreset">ערכת CSS *</label>
            <select
              id="cssPreset"
              value={config.cssPreset}
              onChange={(e) => setConfig({ ...config, cssPreset: e.target.value as CssPreset })}
              disabled={saving}
            >
              <option value="classic">Classic - צבעים עשירים ורוויים</option>
              <option value="soft">Soft - צבעים רכים ומעומעמים</option>
              <option value="sparkle">Sparkle - צבעים בוהקים וניגודיים</option>
            </select>
            <p className="form-help">
              בחר את סגנון הגרדיאנטים שיוצגו במצב CSS.
            </p>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'שומר...' : 'שמור הגדרות'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadConfig}
            disabled={saving}
          >
            רענן
          </button>
        </div>

        <div className="config-info">
          <h3>מידע על המצבים:</h3>
          <ul>
            <li><strong>AUTO:</strong> המערכת בוחרת אוטומטית בין AVIF ל-PNG בהתאם לזמינות</li>
            <li><strong>AVIF:</strong> משתמש בתמונות AVIF בלבד (דורש תמיכה בדפדפן)</li>
            <li><strong>PNG:</strong> משתמש בתמונות PNG בלבד (תואם לכל הדפדפנים)</li>
            <li><strong>CSS:</strong> משתמש בגרדיאנטים CSS בלבד ללא תמונות (מהיר יותר, ללא תלות בקבצים)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
