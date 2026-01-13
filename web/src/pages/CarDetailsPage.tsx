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
  const { userProfile } = useAuth();
  const { activeYardId } = useYardPublic();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // State for collapsed sections (פרטים טכניים and בעלות ותוקף default collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['פרטים טכניים', 'בעלות ותוקף']));

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

  // Track car view (non-blocking, called once per mount with client-side rate limiting)
  useEffect(() => {
    if (!id || !car) {
      return;
    }

    // Client-side rate limiting: check sessionStorage
    const rateLimitKey = `viewed:${id}`;
    const lastViewed = sessionStorage.getItem(rateLimitKey);
    const now = Date.now();
    const RATE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

    if (lastViewed) {
      const lastViewedTime = parseInt(lastViewed, 10);
      if (now - lastViewedTime < RATE_LIMIT_MS) {
        // Within rate limit window, skip logging
        if (import.meta.env.DEV) {
          console.log(`[CarDetailsPage] Skipping view log for ${id} (rate limited)`);
        }
        return;
      }
    }

    // Update sessionStorage with current timestamp
    sessionStorage.setItem(rateLimitKey, now.toString());

    // Call logCarView asynchronously, non-blocking (public - no auth required)
    const trackView = async () => {
      try {
        const logCarView = httpsCallable(functions, 'logCarView');
        await logCarView({ carId: id });
      } catch (err) {
        // Silently fail - don't show errors to user
        if (import.meta.env.DEV) {
          console.error('Error tracking car view:', err);
        }
      }
    };

    trackView();
  }, [id, car]); // Only call once when car is loaded

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
  const carUrl = id ? getCarDetailsUrl({ ...car, sellerType: car.sellerType || undefined }) : `${baseUrl}/cars/${id}`;
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
                </div>
                <div className="car-header-bottom">
                  <div className="car-plate-wrapper">
                    {car.licensePlatePartial ? (
                      <LicensePlateBadge plate={car.licensePlatePartial} size="md" />
                    ) : (
                      <span className="car-plate-placeholder">—</span>
                    )}
                  </div>
                  <p className="car-price-large">{formatPrice(car.price)} ₪</p>
                </div>
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

              {/* Yard Header - Prominent display of yard logo and name */}
              {car.yardUid && (car.yardName || car.sellerDisplayName) && (
                <div className="yard-header-prominent">
                  <div className="yard-header-content">
                    {(() => {
                      const yardLogoUrl = car.yardLogoUrl ?? (car as any).sellerLogoUrl ?? null;
                      const yardName = car.yardName ?? car.sellerDisplayName ?? '';
                      const showLogo = (car as any).showSellerLogo !== false;
                      
                      return (
                        <>
                          {yardLogoUrl && showLogo ? (
                            <img
                              src={yardLogoUrl}
                              alt={yardName}
                              className="yard-header-logo"
                            />
                          ) : (
                            <div className="yard-header-logo-placeholder">
                              {yardName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="yard-header-info">
                            <div className="yard-header-name-row">
                              <span className="yard-header-name">{yardName}</span>
                              <span className="yard-header-label">מגרש</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Seller Card - Use seller snapshot from publicCars (no users/ read) */}
              {/* FAIL-SAFE: Always show seller card if sellerType exists, even if data is incomplete */}
              {(car.yardUid || car.sellerType) && (
                <YardCard 
                  yardUid={car.yardUid ?? null} 
                  yardNameOverride={car.yardName ?? car.sellerDisplayName ?? null}
                  yardPhoneOverride={car.yardPhone ?? (car as any).sellerPhone ?? null}
                  yardLogoUrlOverride={car.yardLogoUrl ?? (car as any).sellerLogoUrl ?? null}
                  yardWhatsappPhoneOverride={car.yardWhatsappPhone ?? (car as any).sellerWhatsappPhone ?? null}
                  showSellerLogo={(car as any).showSellerLogo}
                  showSellerPhone={(car as any).showSellerPhone}
                  showSellerWhatsapp={(car as any).showSellerWhatsapp}
                  sellerType={car.sellerType ?? null}
                />
              )}

              <div className="car-specs">
                <div className="spec-item">
                  <span className="spec-label">קילומטראז׳:</span>
                  <span className="spec-value">{car.km.toLocaleString('he-IL')} ק״מ</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">מיקום:</span>
                  <span className="spec-value">
                    {(() => {
                      // Location fallback: use location field, then cityNameHe/city, then customer city/addressCity
                      const locationText = (car as any).location || car.cityNameHe || car.city || 
                        (car as any).addressCity || (car as any).customerCity || null;
                      const regionText = car.regionNameHe || '';
                      return locationText 
                        ? `${locationText}${regionText ? `, ${regionText}` : ''}`
                        : 'לא צוין';
                    })()}
                  </span>
                </div>
              </div>

              {/* Advanced Details Section - With Collapsible Groups */}
              {(() => {
                type DetailRow = { label: string; value: React.ReactNode; show?: boolean; };
                type DetailGroup = { title: string; rows: DetailRow[]; defaultCollapsed?: boolean; };
                
                const toggleGroup = (title: string) => {
                  setCollapsedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(title)) {
                      next.delete(title);
                    } else {
                      next.add(title);
                    }
                    return next;
                  });
                };

                // Helper to format value or return "לא צוין"
                const formatValue = (val: any, formatter?: (v: any) => string | React.ReactNode): React.ReactNode => {
                  if (val === null || val === undefined || val === '') {
                    return 'לא צוין';
                  }
                  if (formatter) {
                    return formatter(val);
                  }
                  if (typeof val === 'boolean') {
                    return val ? 'כן' : 'לא';
                  }
                  return String(val);
                };

                // Helper to format date (timestamp or date string) to Israeli format
                const formatDate = (val: string | number | null | undefined): string => {
                  if (!val) return 'לא צוין';
                  try {
                    const date = typeof val === 'number' ? new Date(val) : new Date(val);
                    if (isNaN(date.getTime())) return 'לא צוין';
                    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  } catch {
                    return 'לא צוין';
                  }
                };

                // Helper to format fuel type (normalize common values)
                const formatFuelType = (val: string | null | undefined): string => {
                  if (!val || typeof val !== 'string') return 'לא צוין';
                  const normalized = val.trim().toLowerCase();
                  const fuelMap: Record<string, string> = {
                    'benzin': 'בנזין',
                    'benzine': 'בנזין',
                    'diesel': 'דיזל',
                    'hybrid': 'היברידי',
                    'plug_in': 'היברידי נטען',
                    'phev': 'היברידי נטען',
                    'electric': 'חשמלי',
                    'ev': 'חשמלי',
                  };
                  return fuelMap[normalized] || val; // Return as-is if not in map
                };

                // Build detail rows grouped by category
                const groups: DetailGroup[] = [];

                // פרטים בסיסיים (Basic Details) - ALWAYS SHOW, ALWAYS OPEN
                const basicRows: DetailRow[] = [
                  { label: 'יצרן', value: formatValue(car.manufacturerHe) },
                  { label: 'דגם', value: formatValue(car.modelHe) },
                  { label: 'שנת ייצור', value: formatValue(car.year) },
                  { 
                    label: 'מחיר', 
                    value: car.price && typeof car.price === 'number' && car.price > 0 
                      ? `${formatPrice(car.price)} ₪` 
                      : 'לא צוין' 
                  },
                  { 
                    label: 'קילומטראז׳', 
                    value: car.km && typeof car.km === 'number' && car.km >= 0
                      ? `${car.km.toLocaleString('he-IL')} ק״מ`
                      : 'לא צוין'
                  },
                  { 
                    label: 'מיקום', 
                    value: (() => {
                      // Location fallback: use location field, then cityNameHe/city, then customer city/addressCity
                      const locationText = (car as any).location || car.cityNameHe || car.city || 
                        (car as any).addressCity || (car as any).customerCity || null;
                      const regionText = car.regionNameHe || '';
                      return locationText 
                        ? `${locationText}${regionText ? `, ${regionText}` : ''}`
                        : 'לא צוין';
                    })()
                  },
                  // Hand count - MUST SHOW
                  { 
                    label: 'מספר יד', 
                    value: (car.handCount && typeof car.handCount === 'number' && car.handCount > 0 && car.handCount <= 20)
                      ? formatHandHebrew(car.handCount)
                      : 'לא צוין',
                    show: true
                  },
                  // Color - moved from מצב ותוספות
                  { label: 'צבע', value: formatValue(car.color), show: true },
                  // AC - moved from מצב ותוספות
                  { 
                    label: 'מזגן', 
                    value: (() => {
                      const hasACValue = car.hasAC ?? car.ac;
                      if (hasACValue === true) return 'כן';
                      if (hasACValue === false) return 'לא';
                      return 'בד״כ יש מזגן (לא צוין)';
                    })(), 
                    show: true 
                  },
                ];
                groups.push({ title: 'פרטים בסיסיים', rows: basicRows, defaultCollapsed: false });

                // זיהוי (Identification) - ALWAYS SHOW, ALWAYS OPEN
                const identificationRows: DetailRow[] = [
                  {
                    label: 'מספר רישוי',
                    value: car.licensePlatePartial 
                      ? <LicensePlateBadge plate={car.licensePlatePartial} size="sm" />
                      : 'לא צוין',
                    show: true
                  },
                ];
                groups.push({ title: 'זיהוי', rows: identificationRows, defaultCollapsed: false });

                // פרטים טכניים (Technical Details) - DEFAULT COLLAPSED
                const technicalRows: DetailRow[] = [
                  { label: 'תיבת הילוכים', value: formatValue(car.gearboxType), show: true },
                  { 
                    label: 'סוג דלק', 
                    value: formatFuelType(car.fuelType), 
                    show: true // MUST SHOW
                  },
                  { label: 'סוג מרכב', value: formatValue(car.bodyType), show: true },
                  { 
                    label: 'נפח מנוע', 
                    value: (car.engineDisplacementCc && typeof car.engineDisplacementCc === 'number' && car.engineDisplacementCc > 0)
                      ? `${car.engineDisplacementCc} סמ״ק`
                      : 'לא צוין',
                    show: true
                  },
                  { 
                    label: 'כוח סוס', 
                    value: (car.horsepower && typeof car.horsepower === 'number' && car.horsepower > 0)
                      ? `${car.horsepower} HP`
                      : 'לא צוין',
                    show: true
                  },
                  { 
                    label: 'מספר הילוכים', 
                    value: (car.numberOfGears && typeof car.numberOfGears === 'number' && car.numberOfGears > 0)
                      ? String(car.numberOfGears)
                      : 'לא צוין',
                    show: true
                  },
                ];
                groups.push({ title: 'פרטים טכניים', rows: technicalRows, defaultCollapsed: true });

                // בעלות ותוקף (Ownership & Validity) - DEFAULT COLLAPSED
                const ownershipRows: DetailRow[] = [
                  { label: 'סוג בעלות', value: formatValue(car.ownershipType), show: true },
                  { label: 'סוג יבוא', value: formatValue(car.importType), show: true },
                  { label: 'שימוש קודם', value: formatValue(car.previousUse), show: true },
                  { label: 'תוקף טסט', value: formatDate(car.testUntil || car.testDate), show: true },
                  { label: 'תאריך עליה לכביש', value: formatDate(car.registrationDate), show: true },
                  // VIN - moved from זיהוי
                  { label: 'מספר שלדה (VIN)', value: formatValue(car.vin), show: true },
                  // Internal ID - moved from זיהוי
                  { label: 'מספר פנימי', value: formatValue(car.stockNumber), show: true },
                  // Accidents - moved from מצב ותוספות
                  { 
                    label: 'תאונות', 
                    value: typeof car.hasAccidents === 'boolean' 
                      ? (car.hasAccidents ? 'כן' : 'לא')
                      : 'לא צוין',
                    show: true
                  },
                ];
                groups.push({ title: 'בעלות ותוקף', rows: ownershipRows, defaultCollapsed: true });

                // הערות (Notes) - SHOW IF EXISTS
                const sanitizedNotes = sanitizeDescription(car.notes);
                if (sanitizedNotes) {
                  groups.push({
                    title: 'הערות',
                    rows: [{ label: 'הערות/תיאור', value: sanitizedNotes, show: true }],
                  });
                }

                // Render groups
                if (groups.length === 0) {
                  return null;
                }

                return (
                  <div className="car-advanced-details">
                    <h3 className="advanced-details-title">פרטים נוספים מתקדמים</h3>
                    {groups.map((group, groupIdx) => {
                      const isCollapsed = collapsedGroups.has(group.title);
                      const shouldBeCollapsed = group.defaultCollapsed !== false && isCollapsed;
                      
                      return (
                        <div key={groupIdx} className="detail-group">
                          <button
                            type="button"
                            className="detail-group-header"
                            onClick={() => toggleGroup(group.title)}
                            aria-expanded={!shouldBeCollapsed}
                          >
                            <h4 className="detail-group-title">{group.title}</h4>
                            <span className="detail-group-chevron" aria-hidden="true">
                              {shouldBeCollapsed ? '▼' : '▲'}
                            </span>
                          </button>
                          {!shouldBeCollapsed && (
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
                          )}
                        </div>
                      );
                    })}
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
              yardPhone={car?.yardPhone ?? null}
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
