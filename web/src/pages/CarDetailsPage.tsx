import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { useYardPublic } from '../context/YardPublicContext';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import { ContactFormCard } from '../components/contact/ContactFormCard';
import CarImageGallery from '../components/cars/CarImageGallery';
import { getPromotionBadges, getPromotionExpirySummary } from '../utils/promotionLabels';
import type { LeadSource } from '../types/Lead';
import { isPromotionActive } from '../utils/promotionTime';
import { SHOW_PROMOTION_BADGES_PUBLIC } from '../config/featureFlags';
import { getActivePromotionTier, resolveMaterialFromPromotionTier } from '../utils/promotionTierTheme';
import { resolvePromoMaterialUrl, cssUrl, type PromoMaterial } from '../utils/promoMaterialAssets';
import './CarDetailsPage.css';

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuth();
  const { activeYardId } = useYardPublic();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  // Scroll to top on mount - safe helper that never throws
  function scrollToTopSafe() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  useEffect(() => {
    scrollToTopSafe();
  }, []);

  useEffect(() => {
    if (!id) {
      setError('הרכב לא נמצא');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchCarByIdWithFallback(id)
      .then((result) => {
        if (!result) {
          if (import.meta.env.DEV) {
            console.error('[CarDetailsPage] Car not found in publicCars:', { carId: id });
          }
          setError('הרכב לא נמצא');
        } else {
          setCar(result);
        }
      })
      .catch((err: any) => {
        // Enhanced error logging with context
        const errorCode = err?.code || 'unknown';
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        if (import.meta.env.DEV) {
          console.error('[CarDetailsPage] Error loading car details:', {
            carId: id,
            errorCode,
            errorMessage,
            fullError: err,
          });
        }
        setError('אירעה שגיאה בטעינת פרטי הרכב');
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Track car view (non-blocking, called once per mount)
  useEffect(() => {
    if (!id || !car || !firebaseUser || !car.yardUid) {
      return;
    }

    // Only track views for published cars (we assume publicCars only has published cars)
    // Call trackCarView asynchronously, non-blocking
    const trackView = async () => {
      try {
        const trackCarView = httpsCallable(functions, 'trackCarView');
        await trackCarView({
          yardUid: car.yardUid,
          carId: id,
        });
      } catch (err) {
        // Silently fail - don't show errors to user
        if (import.meta.env.DEV) {
          console.error('Error tracking car view:', err);
        }
      }
    };

    trackView();
  }, [id, car, firebaseUser]); // Only call once when car is loaded

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  if (loading) {
    return (
      <div className="car-details-page">
        <div className="card">
          <p className="text-center">טוען פרטי רכב...</p>
        </div>
      </div>
    );
  }

  if (error || !car) {
    const handleRetry = () => {
      if (id) {
        setLoading(true);
        setError(null);
        fetchCarByIdWithFallback(id)
          .then((result) => {
            if (!result) {
              setError('הרכב לא נמצא');
            } else {
              setCar(result);
            }
          })
          .catch((err: any) => {
            if (import.meta.env.DEV) {
              console.error('[CarDetailsPage] Retry error:', { carId: id, error: err });
            }
            setError('אירעה שגיאה בטעינת פרטי הרכב');
          })
          .finally(() => setLoading(false));
      }
    };

    return (
      <div className="car-details-page">
        <div className="card not-found-card">
          <h1>הרכב לא נמצא</h1>
          <p>הרכב המבוקש לא נמצא במערכת.</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button onClick={handleRetry} className="btn btn-secondary">
              נסה שוב
            </button>
            <Link to="/cars" className="btn btn-primary">
              חזור לתוצאות
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="car-details-page">
      <button onClick={() => navigate(-1)} className="back-button">
        ← חזור
      </button>

      {/* Gallery Section - Full Width at Top */}
      <section className="car-details-gallery-section">
        <CarImageGallery
          imageUrls={car.imageUrls}
          mainImageUrl={car.mainImageUrl}
          altText={`${car.year} ${car.manufacturerHe} ${car.modelHe}`}
        />
      </section>

      {/* Details Section - Below Gallery */}
      <section className="car-details-info-section">
        <div className="car-details-content-layout">
          <div className="car-details-main">
            <div className="car-details-card card">
              <div className="car-header">
                <h1 className="car-title-large">
                  {car.year} {car.manufacturerHe} {car.modelHe}
                </h1>
                <p className="car-price-large">{formatPrice(car.price)} ₪</p>
                {/* Promotion badges - show to admin/yard or public if flag enabled */}
                {car.promotion && (() => {
                  const canSeePromotionBadges = Boolean(userProfile?.isAdmin || userProfile?.isYard || SHOW_PROMOTION_BADGES_PUBLIC);
                  if (!canSeePromotionBadges) return null;
                  
                  const badges = getPromotionBadges(car.promotion, isPromotionActive);
                  const expiry = getPromotionExpirySummary(car.promotion, isPromotionActive);
                  
                  // Get active promotion tier and material for btn.png
                  const activeTier = getActivePromotionTier(car.promotion, isPromotionActive);
                  const promoMaterial = resolveMaterialFromPromotionTier(activeTier) as PromoMaterial | undefined;
                  
                  if (badges.length > 0) {
                    return (
                      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {badges.map((badge, idx) => {
                            let badgeClass = 'promotion-badge';
                            const badgeStyle: React.CSSProperties & Record<string, string> = {};
                            
                            // Map badge to material tier for btn.png application
                            let badgeMaterial: PromoMaterial | undefined;
                            if (badge === 'DIAMOND') {
                              badgeClass += ' diamond';
                              badgeMaterial = 'DIAMOND';
                            } else if (badge === 'PLATINUM') {
                              badgeClass += ' platinum';
                              badgeMaterial = 'PLATINUM';
                            } else if (badge === 'מוקפץ') {
                              badgeClass += ' boosted';
                              badgeMaterial = 'GOLD';
                            } else if (badge === 'נחושת') {
                              badgeClass += ' highlighted';
                              badgeMaterial = 'COPPER';
                            } else if (badge === 'ברונזה') {
                              badgeClass += ' exposure-plus';
                              badgeMaterial = 'BRONZE';
                            }
                            
                            // Apply btn.png if this badge represents the active material tier
                            if (badgeMaterial && badgeMaterial === promoMaterial) {
                              badgeClass += ' promo-material-btn';
                              badgeStyle['--promo-btn-bg'] = cssUrl(resolvePromoMaterialUrl(badgeMaterial, 'btn'));
                            }
                            
                            return (
                              <span key={idx} className={badgeClass} style={Object.keys(badgeStyle).length > 0 ? badgeStyle : undefined}>
                                {badge}
                              </span>
                            );
                          })}
                        </div>
                        {expiry && (
                          <div style={{ fontSize: '0.875rem', color: '#666' }}>
                            {expiry}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="car-specs">
                <div className="spec-item">
                  <span className="spec-label">קילומטראז׳:</span>
                  <span className="spec-value">{car.km.toLocaleString('he-IL')} ק״מ</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">מיקום:</span>
                  <span className="spec-value">
                    {car.cityNameHe || car.city}
                    {car.regionNameHe ? `, ${car.regionNameHe}` : ''}
                  </span>
                </div>
              </div>

              {/* Advanced Details Section */}
              <div className="car-advanced-details">
                <button
                  type="button"
                  className="advanced-details-toggle"
                  onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                >
                  <span>פרטים נוספים מתקדמים</span>
                  <span className="toggle-icon">{showAdvancedDetails ? '▼' : '▶'}</span>
                </button>
                {showAdvancedDetails && (
                  <div className="advanced-details-content">
                    {car.gearboxType && (
                      <div className="spec-item">
                        <span className="spec-label">תיבת הילוכים:</span>
                        <span className="spec-value">{car.gearboxType}</span>
                      </div>
                    )}
                    {car.fuelType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג דלק:</span>
                        <span className="spec-value">{car.fuelType}</span>
                      </div>
                    )}
                    {car.bodyType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג מרכב:</span>
                        <span className="spec-value">{car.bodyType}</span>
                      </div>
                    )}
                    {car.engineDisplacementCc && (
                      <div className="spec-item">
                        <span className="spec-label">נפח מנוע:</span>
                        <span className="spec-value">{car.engineDisplacementCc} סמ״ק</span>
                      </div>
                    )}
                    {car.horsepower && (
                      <div className="spec-item">
                        <span className="spec-label">כוח סוס:</span>
                        <span className="spec-value">{car.horsepower} HP</span>
                      </div>
                    )}
                    {car.ownershipType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג בעלות:</span>
                        <span className="spec-value">{car.ownershipType}</span>
                      </div>
                    )}
                    {car.importType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג יבוא:</span>
                        <span className="spec-value">{car.importType}</span>
                      </div>
                    )}
                    {car.previousUse && (
                      <div className="spec-item">
                        <span className="spec-label">שימוש קודם:</span>
                        <span className="spec-value">{car.previousUse}</span>
                      </div>
                    )}
                    {car.handCount !== null && car.handCount !== undefined && (
                      <div className="spec-item">
                        <span className="spec-label">מספר יד:</span>
                        <span className="spec-value">{car.handCount}</span>
                      </div>
                    )}
                    {car.color && (
                      <div className="spec-item">
                        <span className="spec-label">צבע:</span>
                        <span className="spec-value">{car.color}</span>
                      </div>
                    )}
                    {car.numberOfGears !== null && car.numberOfGears !== undefined && (
                      <div className="spec-item">
                        <span className="spec-label">מספר הילוכים:</span>
                        <span className="spec-value">{car.numberOfGears}</span>
                      </div>
                    )}
                    {(car.hasAC !== null && car.hasAC !== undefined) || (car.ac !== null && car.ac !== undefined) ? (
                      <div className="spec-item">
                        <span className="spec-label">מזגן:</span>
                        <span className="spec-value">{(car.hasAC ?? car.ac) ? 'כן' : 'לא'}</span>
                      </div>
                    ) : null}
                    {car.licensePlatePartial && (
                      <div className="spec-item">
                        <span className="spec-label">מספר רישוי חלקי:</span>
                        <span className="spec-value">{car.licensePlatePartial}</span>
                      </div>
                    )}
                    {car.notes && (
                      <div className="spec-item">
                        <span className="spec-label">הערות/תיאור:</span>
                        <span className="spec-value">{car.notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Remove placeholder description if we have notes */}
              {!car.notes && (
                <div className="car-description">
                  <h3>תיאור</h3>
                  <p>
                    בגיר אוטומטי, בעלים פרטיים, שמור ומטופל. טקסט זה יוחלף בנתונים אמיתיים מהמערכת.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Form - Right Side on Desktop */}
          <div className="car-contact-form-wrapper">
            <ContactFormCard
              carId={car?.id || null}
              yardPhone={null}
              sellerType="YARD"
              sellerId={car?.yardUid || null}
              carTitle={car ? `${car.year} ${car.manufacturerHe} ${car.modelHe}`.trim() : null}
              source={(activeYardId ? 'YARD_QR' : 'WEB_SEARCH') as LeadSource}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
