import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { useYardPublic } from '../context/YardPublicContext';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import { ContactFormCard } from '../components/contact/ContactFormCard';
import CarImageGallery from '../components/cars/CarImageGallery';
import YardCard from '../components/yard/YardCard';
import LicensePlateBadge from '../components/common/LicensePlateBadge';
import { formatHandHebrew } from '../utils/facebookPostHelper';
import { getPromotionBadges, getPromotionExpirySummary, MATERIAL_LABELS_HE } from '../utils/promotionLabels';
import type { LeadSource } from '../types/Lead';
import { isPromotionActive } from '../utils/promotionTime';
import { SHOW_PROMOTION_BADGES_PUBLIC } from '../config/featureFlags';
import { getActivePromotionTier, resolveMaterialFromPromotionTier } from '../utils/promotionTierTheme';
import { resolvePromoMaterialImageSet, type PromoMaterial } from '../utils/promoMaterialAssets';
import SeoHead from '../components/seo/SeoHead';
import { VehicleJsonLd } from '../seo/schema/vehicleJsonLd.tsx';
import { getCarDetailsUrl } from '../utils/carRouting';
import './CarDetailsPage.css';

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuth();
  const { activeYardId } = useYardPublic();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Advanced details always open - no collapse

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

  /**
   * Sanitize description/notes to remove import provenance markers
   * Removes patterns like "יובא מ-<digits>" or "Imported from <digits>"
   */
  const sanitizeDescription = (desc: string | null | undefined): string | null => {
    if (!desc || typeof desc !== 'string') return null;
    
    let sanitized = desc.trim();
    
    // If it matches ONLY provenance pattern, return null
    const onlyProvenancePattern = /^(יובא מ-|Imported from)\s*\d+$/i;
    if (onlyProvenancePattern.test(sanitized)) {
      return null;
    }
    
    // Remove provenance substring from mixed text
    sanitized = sanitized.replace(/\s*(יובא מ-|Imported from)\s*\d+\s*/gi, ' ').trim();
    
    // Return null if empty after sanitization
    return sanitized.length > 0 ? sanitized : null;
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

  // Generate SEO metadata
  const baseUrl = 'https://www.carexperts4u.com';
  const carUrl = id ? getCarDetailsUrl(car) : `${baseUrl}/cars/${id}`;
  const fullUrl = `${baseUrl}${carUrl}`;
  const carTitle = `${car.year} ${car.manufacturerHe} ${car.modelHe} למכירה${car.city ? ` | ${car.city}` : ''} | ${formatPrice(car.price)} ₪`;
  const carDescription = `${car.year} ${car.manufacturerHe} ${car.modelHe} למכירה${car.city ? ` ב${car.city}` : ''}. ${car.km ? `קילומטראז': ${car.km.toLocaleString('he-IL')} ק"מ. ` : ''}${car.gearboxType ? `תיבת הילוכים: ${car.gearboxType}. ` : ''}${car.fuelType ? `סוג דלק: ${car.fuelType}. ` : ''}מחיר: ${formatPrice(car.price)} ₪`;
  const carImage = car.mainImageUrl || (car.imageUrls && car.imageUrls.length > 0 ? car.imageUrls[0] : undefined);

  return (
    <>
      <SeoHead
        title={carTitle}
        description={carDescription}
        canonicalUrl={fullUrl}
        ogTitle={carTitle}
        ogDescription={carDescription}
        ogUrl={fullUrl}
        ogImage={carImage}
        ogType="product"
        twitterCard="summary_large_image"
        twitterTitle={carTitle}
        twitterDescription={carDescription}
        twitterImage={carImage}
      />
      <VehicleJsonLd car={car} url={fullUrl} imageUrl={carImage} />
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
                <div className="car-title-row">
                  <h1 className="car-title-large">
                    {car.year} {car.manufacturerHe} {car.modelHe}
                  </h1>
                  {car.licensePlatePartial && (
                    <LicensePlateBadge plate={car.licensePlatePartial} size="md" />
                  )}
                </div>
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
                            } else if (badge === 'TITANIUM' || badge === 'טיטניום') {
                              badgeClass += ' titanium';
                              badgeMaterial = 'TITANIUM';
                            } else if (badge === 'SILVER' || badge === 'כסף') {
                              badgeClass += ' silver';
                              badgeMaterial = 'SILVER';
                            } else if (badge === 'מוקפץ' || badge === MATERIAL_LABELS_HE.GOLD) {
                              badgeClass += ' boosted';
                              badgeMaterial = 'GOLD';
                            } else if (badge === 'נחושת' || badge === MATERIAL_LABELS_HE.COPPER) {
                              badgeClass += ' highlighted';
                              badgeMaterial = 'COPPER';
                            } else if (badge === 'ברונזה' || badge === MATERIAL_LABELS_HE.BRONZE) {
                              badgeClass += ' exposure-plus';
                              badgeMaterial = 'BRONZE';
                            }
                            
                            // Apply btn image-set (AVIF preferred, PNG fallback) if this badge represents the active material tier
                            if (badgeMaterial && badgeMaterial === promoMaterial) {
                              badgeClass += ' promo-material-btn';
                              badgeStyle['--promo-btn-bg'] = resolvePromoMaterialImageSet(badgeMaterial, 'btn');
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

              {/* Yard Card */}
              {car.yardUid && (
                <YardCard yardUid={car.yardUid} />
              )}

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

              {/* Advanced Details Section - Always Open */}
              {(() => {
                type DetailRow = { label: string; value: React.ReactNode; show?: boolean; };
                type DetailGroup = { title: string; rows: DetailRow[]; };

                // Helper to check if value is non-empty
                const hasValue = (val: any): boolean => {
                  if (val === null || val === undefined) return false;
                  if (typeof val === 'string') return val.trim().length > 0;
                  if (typeof val === 'number') return Number.isFinite(val) && val > 0;
                  if (typeof val === 'boolean') return true;
                  return true;
                };

                // Build detail rows grouped by category
                const groups: DetailGroup[] = [];

                // פרטים בסיסיים (Basic Details)
                const basicRows: DetailRow[] = [];
                if (hasValue(car.manufacturerHe)) {
                  basicRows.push({ label: 'יצרן', value: car.manufacturerHe });
                }
                if (hasValue(car.modelHe)) {
                  basicRows.push({ label: 'דגם', value: car.modelHe });
                }
                if (hasValue(car.year)) {
                  basicRows.push({ label: 'שנת ייצור', value: car.year });
                }
                if (hasValue(car.price)) {
                  basicRows.push({ label: 'מחיר', value: `${formatPrice(car.price)} ₪` });
                }
                if (hasValue(car.km)) {
                  basicRows.push({ label: 'קילומטראז׳', value: `${car.km.toLocaleString('he-IL')} ק״מ` });
                }
                if (hasValue(car.cityNameHe) || hasValue(car.city)) {
                  const location = car.cityNameHe || car.city;
                  const region = car.regionNameHe ? `, ${car.regionNameHe}` : '';
                  basicRows.push({ label: 'מיקום', value: `${location}${region}` });
                }
                if (basicRows.length > 0) {
                  groups.push({ title: 'פרטים בסיסיים', rows: basicRows });
                }

                // זיהוי (Identification)
                const identificationRows: DetailRow[] = [];
                if (hasValue(car.licensePlatePartial)) {
                  identificationRows.push({
                    label: 'מספר רישוי',
                    value: <LicensePlateBadge plate={car.licensePlatePartial} size="sm" />,
                  });
                }
                // Note: vin, stockNumber are not in Car type from publicCars, so we skip them
                if (identificationRows.length > 0) {
                  groups.push({ title: 'זיהוי', rows: identificationRows });
                }

                // פרטים טכניים (Technical Details)
                const technicalRows: DetailRow[] = [];
                if (hasValue(car.gearboxType)) {
                  technicalRows.push({ label: 'תיבת הילוכים', value: car.gearboxType });
                }
                if (hasValue(car.fuelType)) {
                  technicalRows.push({ label: 'סוג דלק', value: car.fuelType });
                }
                if (hasValue(car.bodyType)) {
                  technicalRows.push({ label: 'סוג מרכב', value: car.bodyType });
                }
                if (hasValue(car.engineDisplacementCc)) {
                  technicalRows.push({ label: 'נפח מנוע', value: `${car.engineDisplacementCc} סמ״ק` });
                }
                if (hasValue(car.horsepower)) {
                  technicalRows.push({ label: 'כוח סוס', value: `${car.horsepower} HP` });
                }
                if (hasValue(car.numberOfGears)) {
                  technicalRows.push({ label: 'מספר הילוכים', value: String(car.numberOfGears) });
                }
                if (technicalRows.length > 0) {
                  groups.push({ title: 'פרטים טכניים', rows: technicalRows });
                }

                // מצב ותוספות (Condition & Features)
                const conditionRows: DetailRow[] = [];
                if (hasValue(car.color)) {
                  conditionRows.push({ label: 'צבע', value: car.color });
                }
                const handValue = car.handCount;
                const isValidHand = typeof handValue === 'number' &&
                  Number.isFinite(handValue) &&
                  handValue > 0 &&
                  handValue <= 20;
                if (isValidHand) {
                  conditionRows.push({ label: 'מספר יד', value: formatHandHebrew(handValue) });
                }
                if (hasValue(car.ownershipType)) {
                  conditionRows.push({ label: 'סוג בעלות', value: car.ownershipType });
                }
                if (hasValue(car.importType)) {
                  conditionRows.push({ label: 'סוג יבוא', value: car.importType });
                }
                if (hasValue(car.previousUse)) {
                  conditionRows.push({ label: 'שימוש קודם', value: car.previousUse });
                }
                // AC field: always show, even if missing (with hint text)
                const hasACValue = car.hasAC ?? car.ac;
                const acText = (v: boolean | null | undefined): string => {
                  if (v === true) return 'כן';
                  if (v === false) return 'לא';
                  return 'בד״כ יש מזגן (לא צוין)';
                };
                conditionRows.push({ label: 'מזגן', value: acText(hasACValue), show: true });
                // Note: hasAccidents is not in Car type from publicCars, so we skip it
                if (conditionRows.length > 0) {
                  groups.push({ title: 'מצב ותוספות', rows: conditionRows });
                }

                // הערות (Notes)
                const sanitizedNotes = sanitizeDescription(car.notes);
                if (sanitizedNotes) {
                  groups.push({
                    title: 'הערות',
                    rows: [{ label: 'הערות/תיאור', value: sanitizedNotes }],
                  });
                }

                // Render groups
                if (groups.length === 0) {
                  return null;
                }

                return (
                  <div className="car-advanced-details">
                    <h3 className="advanced-details-title">פרטים נוספים מתקדמים</h3>
                    {groups.map((group, groupIdx) => (
                      <div key={groupIdx} className="detail-group">
                        <h4 className="detail-group-title">{group.title}</h4>
                        <div className="advanced-details-content">
                          {group.rows
                            .filter((row) => row.show !== false) // Hide if explicitly show: false, but show if show: true even if value is falsy
                            .map((row, rowIdx) => (
                              <div key={rowIdx} className="spec-item">
                                <span className="spec-label">{row.label}:</span>
                                <span className="spec-value">{row.value}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              
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
    </>
  );
}
