import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import type { TenantHomepageSelectionMeta } from '../../../tenant/tenantHomepageCars';
import './FeaturedCarsSelector.css';

export type FeaturedCarsSelectorProps = {
  yardUid: string;
  sellerUid: string;
  onYardUid: (v: string) => void;
  onSellerUid: (v: string) => void;
  showFeaturedCars: boolean;
  onShowFeaturedCars: (v: boolean) => void;
  inventoryLoading: boolean;
  inventoryError: string | null;
  /** Persisted legacy id list (read-only here); used only for empty-state hints when mode is `none`. */
  featuredCarIds: string[];
  /** Precomputed alongside builder preview — single source with {@link tenantHomepageBuilderSummaryHe}. */
  homepageSelectionMeta: TenantHomepageSelectionMeta;
  formBusy: boolean;
};

function modeLabelHe(mode: TenantHomepageSelectionMeta['mode']): string {
  switch (mode) {
    case 'yard_managed':
      return 'מקור: מלאי (סימון בדף הבית)';
    case 'legacy_fallback':
      return 'מקור: רשימה ישנה (fallback)';
    case 'none':
    default:
      return 'אין רכבים לדף הבית';
  }
}

export default function FeaturedCarsSelector({
  yardUid,
  sellerUid,
  onYardUid,
  onSellerUid,
  showFeaturedCars,
  onShowFeaturedCars,
  inventoryLoading,
  inventoryError,
  featuredCarIds,
  homepageSelectionMeta,
  formBusy,
}: FeaturedCarsSelectorProps) {
  const { userProfile, loading: authLoading } = useAuth();
  const canNavigateYardFleet = !authLoading && userProfile?.isYard === true;

  const scopeOk = yardUid.trim() || sellerUid.trim();
  const { mode, cars, newFlowEligibleCount } = homepageSelectionMeta;
  const displayedCount = cars.length;

  return (
    <div className="featured-cars-selector">
      <label className="featured-cars-selector__toggle-row">
        <input type="checkbox" checked={showFeaturedCars} onChange={(e) => onShowFeaturedCars(e.target.checked)} disabled={formBusy} />
        <span>הצג סקשן רכבים בדף הבית</span>
      </label>

      <div className="featured-cars-selector__toolbar">
        <div className="featured-cars-selector__scope-grid">
          <label>
            מזהה חצר (yardUid)
            <input value={yardUid} onChange={(e) => onYardUid(e.target.value)} dir="ltr" disabled={formBusy} />
          </label>
          <label>
            מזהה מוכר (אופציונלי)
            <input value={sellerUid} onChange={(e) => onSellerUid(e.target.value)} dir="ltr" disabled={formBusy} />
          </label>
        </div>
      </div>

      <div className="featured-cars-selector__info-panel">
        <div className="featured-cars-selector__panel-head">
          <h4 className="featured-cars-selector__panel-title">רכבים בדף הבית</h4>
          {!scopeOk || inventoryLoading || inventoryError ? null : (
            <span
              className={`featured-cars-selector__status-pill featured-cars-selector__status-pill--${mode}`}
              title="מצב פנימי לבניית האתר בלבד"
            >
              {modeLabelHe(mode)}
            </span>
          )}
        </div>
        {!scopeOk ? (
          <div className="featured-cars-selector__empty">
            <p>הגדירו yardUid או sellerUid ב־data scope כדי לטעון מלאי ולחשב כמה רכבים יוצגו.</p>
          </div>
        ) : inventoryLoading ? (
          <div className="featured-cars-selector__empty">
            <p>טוען מלאי…</p>
          </div>
        ) : inventoryError ? (
          <p className="form-error" style={{ margin: 0 }}>
            {inventoryError}
          </p>
        ) : (
          <>
            <p className="featured-cars-selector__info-lead">
              הרכבים שמוצגים בדף הבית נקבעים ב<strong>ניהול המלאי</strong> (סימון &quot;בדף הבית&quot; לכל רכב מפורסם). העורך כאן אינו בוחר רכבים
              ידנית.
            </p>
            <div className="featured-cars-selector__stat featured-cars-selector__stat--primary">
              <span className="featured-cars-selector__stat-value">{newFlowEligibleCount}</span>
              <span className="featured-cars-selector__stat-label">רכבים עם סימון מלאי (מקור עדכני)</span>
            </div>
            {mode === 'yard_managed' ? (
              <p className="featured-cars-selector__hint featured-cars-selector__hint--success">
                יוצגו בדף הבית {displayedCount} רכבים לפי הסימון במלאי. רכבים שיורדים מפרסום או נמכרים ייעלמו אוטומטית.
              </p>
            ) : mode === 'legacy_fallback' ? (
              <>
                <p className="featured-cars-selector__hint featured-cars-selector__hint--legacy">
                  כרגע נעשה שימוש ברשימת מזהים ישנה שנשמרה בהגדרות (לפני ניהול מהמלאי). יוצגו {displayedCount} רכבים. כדי להעביר את האתר
                  למקור העדכני בלבד, סמנו רכבים ב&quot;בדף הבית&quot; בעמוד המלאי — אז רשימה זו תתעלם אוטומטית.
                </p>
              </>
            ) : featuredCarIds.length > 0 ? (
              <p className="featured-cars-selector__hint">
                נשמרה רשימת מזהים ישנה בהגדרות, אך אין רכבים תואמים במלאי המסונן — לא יוצגו כרטיסים עד שיוסדר מלאי או סימון במלאי.
              </p>
            ) : (
              <div className="featured-cars-selector__empty featured-cars-selector__empty--soft">
                <p>אין רכבים לדף הבית. פרסמו רכבים וסמנו אותם בדף המלאי.</p>
              </div>
            )}
            {authLoading ? (
              <p className="featured-cars-selector__cta-footnote">בודק הרשאות…</p>
            ) : canNavigateYardFleet ? (
              <Link to="/yard/fleet" className="featured-cars-selector__cta-link">
                נהל רכבים שמוצגים בדף הבית
              </Link>
            ) : (
              <p className="featured-cars-selector__cta-footnote">
                לניהול המלאי וסימון &quot;בדף הבית&quot; יש להתחבר כמשתמש מגרש (YARD) ואז לפתוח את עמוד המלאי —{' '}
                <code className="featured-cars-selector__cta-code">/yard/fleet</code>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
