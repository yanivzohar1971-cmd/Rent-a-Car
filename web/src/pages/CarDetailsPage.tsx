import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions, functionsEuWest1 } from '../firebase/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { useYardPublic } from '../context/YardPublicContext';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import { ContactFormCard } from '../components/contact/ContactFormCard';
import CarImageGallery from '../components/cars/CarImageGallery';
import YardCard from '../components/yard/YardCard';
import LicensePlateBadge from '../components/common/LicensePlateBadge';
import { normalizeHandCount } from '../utils/handCount';
import { getPromotionBadges, getPromotionExpirySummary, MATERIAL_LABELS_HE } from '../utils/promotionLabels';
import type { LeadSource } from '../types/Lead';
import { isPromotionActive } from '../utils/promotionTime';
import { SHOW_PROMOTION_BADGES_PUBLIC } from '../config/featureFlags';
import { getActivePromotionTier, resolveMaterialFromPromotionTier } from '../utils/promotionTierTheme';
import { resolvePromoMaterialImageSet, type PromoMaterial } from '../utils/promoMaterialAssets';
import SeoHead from '../components/seo/SeoHead';
import { VehicleJsonLd } from '../seo/schema/vehicleJsonLd.tsx';
import { getCarDetailsUrl } from '../utils/carRouting';
import { resolvePublicCarDisplay } from '../utils/resolvePublicCarDisplay';
import { subscribeFeatureFlags } from '../api/featureFlagsApi';
import PublicCarDebugModal from '../components/debug/PublicCarDebugModal';
import { useTenantInventoryScope } from '../hooks/useTenantInventoryScope';
import { useTenant } from '../context/TenantContext';
import { useTenantBranding } from '../hooks/useTenantBranding';
import './CarDetailsPage.css';

/** Set to false to avoid duplicate seller block; hero-bottom seller-strip is the single source. */
const SHOW_YARD_CARD_ON_DETAILS = false;

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { activeYardId } = useYardPublic();
  const tenantInventoryScope = useTenantInventoryScope();
  const { tenantPublicSiteSuspended } = useTenant();
  const { isTenantHost } = useTenantBranding();
  const tenantStorefrontSuspended = isTenantHost && tenantPublicSiteSuspended;
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // State for collapsed sections (פרטים טכניים and בעלות ותוקף default collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['פרטים טכניים', 'בעלות ותוקף']));
  const [backfillAttempted, setBackfillAttempted] = useState(false); // Track if we've tried backfill
  
  // Debug feature flags
  const [debugButtonEnabled, setDebugButtonEnabled] = useState(false);
  const [debugModalOpen, setDebugModalOpen] = useState(false);

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

  // Subscribe to feature flags for debug button
  // CRITICAL: Subscription is created once and persists across carId changes
  // This ensures flags are always fresh and don't require Ctrl+F5
  useEffect(() => {
    const unsubscribe = subscribeFeatureFlags((flags) => {
      // Always update state when flags change, even if carId changes
      // This prevents stale false values from persisting
      setDebugButtonEnabled(flags.enablePublicCarDebugButtonCarDetails ?? false);
    });
    return () => unsubscribe();
  }, []); // Empty deps: subscription should persist across route changes

  useEffect(() => {
    // CRITICAL: Reset all state when carId changes to prevent stale data from previous car
    // This ensures DEBUG button and yard phone/logo always reflect the current car, not cached previous car
    setCar(null);
    setError(null);
    setBackfillAttempted(false); // Reset backfill attempt for new car
    setDebugModalOpen(false); // Close debug modal when navigating to new car
    
    if (!id) {
      setError('הרכב לא נמצא');
      setLoading(false);
      return;
    }

    if (tenantStorefrontSuspended) {
      setCar(null);
      setError('האתר אינו פעיל כרגע — לא ניתן לצפות ברכבים.');
      setLoading(false);
      return;
    }

    setLoading(true);

    fetchCarByIdWithFallback(
      id,
      tenantInventoryScope.shouldScopeInventory
        ? {
            tenantId: tenantInventoryScope.tenantId,
            yardUid: tenantInventoryScope.yardUid,
            sellerUid: tenantInventoryScope.sellerUid,
          }
        : undefined,
    )
      .then((result) => {
        if (!result) {
          if (import.meta.env.DEV) {
            console.error('[CarDetailsPage] Car not found in publicCars:', { carId: id });
          }
          setError('הרכב לא נמצא');
        } else {
          // Block public view when isPublished !== true (unless admin)
          const isAdmin = userProfile?.primaryRole === 'ADMIN' || userProfile?.isAdmin === true;
          const isPublished = result.isPublished === true;
          
          if (!isPublished && !isAdmin) {
            // Not published and not admin - treat as not found
            if (import.meta.env.DEV) {
              console.warn('[CarDetailsPage] Car is not published, blocking public view:', { carId: id, isPublished });
            }
            setError('הרכב לא נמצא');
            setCar(null);
          } else {
            // Published OR admin - allow view
            setCar(result);
          }
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
  }, [id, tenantInventoryScope, tenantStorefrontSuspended, userProfile?.isAdmin, userProfile?.primaryRole]); // CRITICAL: Include id in dependencies so effect re-runs when carId changes (client-side navigation)

  // Self-heal: Backfill seller snapshot if missing (one-time attempt per page load)
  useEffect(() => {
    if (!car || !id || backfillAttempted) {
      return; // Skip if no car, no id, or already attempted
    }

    // Detect missing seller snapshot:
    // - Car has yardUid (seller exists)
    // - BUT all seller fields are null/empty (snapshot missing)
    const hasYardUid = Boolean(car.yardUid);
    const hasMissingSnapshot = hasYardUid && 
      (!car.yardName || car.yardName.trim() === '') &&
      (!car.yardPhone || car.yardPhone.trim() === '') &&
      (!car.yardLogoUrl || car.yardLogoUrl.trim() === '');
    
    if (!hasMissingSnapshot) {
      return; // Seller snapshot exists, no backfill needed
    }

    // Mark backfill as attempted to prevent loops
    setBackfillAttempted(true);

    if (import.meta.env.DEV) {
      console.log('[CarDetailsPage] Seller snapshot missing, triggering backfill:', {
        carId: id,
        yardUid: car.yardUid,
        yardName: car.yardName,
        yardPhone: car.yardPhone,
        yardLogoUrl: car.yardLogoUrl,
      });
    }

    // Trigger backfill asynchronously (non-blocking)
    const triggerBackfill = async () => {
      try {
        const backfillFn = httpsCallable(functionsEuWest1, 'backfillPublicCarById');
        await backfillFn({ carId: id });
        
        if (import.meta.env.DEV) {
          console.log('[CarDetailsPage] Backfill succeeded, refetching car...');
        }

        // Refetch car after backfill to get updated seller snapshot
        const refetchedCar = await fetchCarByIdWithFallback(
          id,
          tenantInventoryScope.shouldScopeInventory
            ? {
                tenantId: tenantInventoryScope.tenantId,
                yardUid: tenantInventoryScope.yardUid,
                sellerUid: tenantInventoryScope.sellerUid,
              }
            : undefined,
        );
        if (refetchedCar) {
          setCar(refetchedCar);
          if (import.meta.env.DEV) {
            console.log('[CarDetailsPage] Car refetched with seller snapshot:', {
              carId: id,
              yardName: refetchedCar.yardName,
              yardPhone: refetchedCar.yardPhone,
              yardLogoUrl: refetchedCar.yardLogoUrl,
            });
          }
        }
      } catch (backfillError: any) {
        // Silently fail - don't show errors to user, but log for debugging
        if (import.meta.env.DEV) {
          console.error('[CarDetailsPage] Backfill failed:', {
            carId: id,
            error: backfillError instanceof Error ? backfillError.message : String(backfillError),
            errorCode: backfillError?.code,
          });
        }
      }
    };

    // Run backfill asynchronously
    triggerBackfill();
  }, [car, id, backfillAttempted, tenantInventoryScope]);

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

  /** Build seller location string; avoid appending city when address already contains it. */
  const buildSellerLocation = (
    sellerAddress?: string | null,
    sellerCity?: string | null
  ): string | null => {
    const normalize = (s?: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .replace(/[,\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!sellerAddress && !sellerCity) return null;
    if (!sellerAddress) return sellerCity ?? null;
    if (!sellerCity) return sellerAddress;
    const addrNorm = normalize(sellerAddress);
    const cityNorm = normalize(sellerCity);
    if (cityNorm && addrNorm.includes(cityNorm)) return sellerAddress;
    return `${sellerAddress}, ${sellerCity}`;
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
        fetchCarByIdWithFallback(
          id,
          tenantInventoryScope.shouldScopeInventory
            ? {
                tenantId: tenantInventoryScope.tenantId,
                yardUid: tenantInventoryScope.yardUid,
                sellerUid: tenantInventoryScope.sellerUid,
              }
            : undefined,
        )
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

  // Single source of truth for location: same as seller/yard block (buildSellerLocation + fallbacks)
  const { address: yardAddress, city: yardCity } = resolvePublicCarDisplay(car);
  const sellerLocationText = buildSellerLocation(yardAddress ?? '', yardCity ?? (car as any).city ?? '');
  const regionText = car.regionNameHe || '';
  const baseLocationText =
    sellerLocationText ||
    (car as any).location ||
    car.cityNameHe ||
    car.city ||
    (car as any).addressCity ||
    (car as any).customerCity ||
    null;
  const locationText = baseLocationText
    ? `${baseLocationText}${regionText ? `, ${regionText}` : ''}`
    : 'לא צוין';

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
        <button onClick={() => navigate(-1)} className="back-button" title="חזור לדף הקודם">
          ← חזור
        </button>

      {/* Admin-only unpublished banner */}
      {car && car.isPublished !== true && (userProfile?.primaryRole === 'ADMIN' || userProfile?.isAdmin === true) && (
        <div style={{
          margin: '1rem auto',
          maxWidth: '1200px',
          padding: '0.75rem 1rem',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          color: '#856404',
          textAlign: 'center',
          fontWeight: 500,
        }}>
          ⚠️ UNPUBLISHED (admin view) - Contact actions disabled
        </div>
      )}

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
                <div className="car-hero">
                  <div className="car-hero-top">
                    <div className="car-hero-title-block">
                      <div className="car-title-row">
                        <h1 className="car-title-large">
                          {car.year} {car.manufacturerHe} {car.modelHe}
                        </h1>
                      </div>
                      <div className="car-plate-wrapper">
                        {car.licensePlatePartial ? (
                          <LicensePlateBadge plate={car.licensePlatePartial} size="md" />
                        ) : (
                          <span className="car-plate-placeholder">—</span>
                        )}
                      </div>
                    </div>
                    <p className="car-price-large">{formatPrice(car.price)} ₪</p>
                    <div className="car-hero-meta">
                      <span className="car-hero-meta-chip">
                        צפיות: {car.viewsCount !== null && car.viewsCount !== undefined ? car.viewsCount.toLocaleString('he-IL') : '0'}
                      </span>
                      <span className="car-hero-meta-chip">
                        קילומטראז׳: {car.km.toLocaleString('he-IL')} ק״מ
                      </span>
                      <span className="car-hero-meta-chip">
                        מיקום: {locationText}
                      </span>
                    </div>
                    {/* Promotion badges - show to admin/yard or public if flag enabled */}
                    {car.promotion && (() => {
                      const canSeePromotionBadges = Boolean(userProfile?.isAdmin || userProfile?.isYard || SHOW_PROMOTION_BADGES_PUBLIC);
                      if (!canSeePromotionBadges) return null;
                      const badges = getPromotionBadges(car.promotion, isPromotionActive);
                      const expiry = getPromotionExpirySummary(car.promotion, isPromotionActive);
                      const activeTier = getActivePromotionTier(car.promotion, isPromotionActive);
                      const promoMaterial = resolveMaterialFromPromotionTier(activeTier) as PromoMaterial | undefined;
                      if (badges.length > 0) {
                        return (
                          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {badges.map((badge, idx) => {
                                let badgeClass = 'promotion-badge';
                                const badgeStyle: React.CSSProperties & Record<string, string> = {};
                                let badgeMaterial: PromoMaterial | undefined;
                                if (badge === 'DIAMOND') { badgeClass += ' diamond'; badgeMaterial = 'DIAMOND'; }
                                else if (badge === 'PLATINUM') { badgeClass += ' platinum'; badgeMaterial = 'PLATINUM'; }
                                else if (badge === 'TITANIUM' || badge === 'טיטניום') { badgeClass += ' titanium'; badgeMaterial = 'TITANIUM'; }
                                else if (badge === 'SILVER' || badge === 'כסף') { badgeClass += ' silver'; badgeMaterial = 'SILVER'; }
                                else if (badge === 'מוקפץ' || badge === MATERIAL_LABELS_HE.GOLD) { badgeClass += ' boosted'; badgeMaterial = 'GOLD'; }
                                else if (badge === 'נחושת' || badge === MATERIAL_LABELS_HE.COPPER) { badgeClass += ' highlighted'; badgeMaterial = 'COPPER'; }
                                else if (badge === 'ברונזה' || badge === MATERIAL_LABELS_HE.BRONZE) { badgeClass += ' exposure-plus'; badgeMaterial = 'BRONZE'; }
                                if (badgeMaterial && badgeMaterial === promoMaterial) {
                                  badgeClass += ' promo-material-btn';
                                  badgeStyle['--promo-btn-bg'] = resolvePromoMaterialImageSet(badgeMaterial, 'btn');
                                }
                                return (
                                  <span key={idx} className={badgeClass} style={Object.keys(badgeStyle).length > 0 ? badgeStyle : undefined}>{badge}</span>
                                );
                              })}
                            </div>
                            {expiry && <div style={{ fontSize: '0.875rem', color: '#666' }}>{expiry}</div>}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="car-hero-bottom">
                    <div className="seller-strip">
                      {car.yardUid && (() => {
                        const { displayName: yardName, logoUrl: yardLogoUrl } = resolvePublicCarDisplay(car);
                        const showLogo = ((car as any).showLogo ?? (car as any).showSellerLogo ?? true) !== false;
                        if (!yardName) return null;
                        return (
                          <>
                            {yardLogoUrl && showLogo ? (
                              <img src={yardLogoUrl} alt={yardName} className="seller-strip-logo" />
                            ) : (
                              <div className="seller-strip-logo seller-strip-logo-placeholder">
                                {yardName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="seller-strip-info">
                              <span className="seller-strip-name">{yardName}</span>
                              <span className="yard-header-label">
                                {car.sellerType === 'PRIVATE' ? 'מוכר פרטי' : car.sellerType === 'AGENT' ? 'סוכן' : 'מגרש'}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="contact-strip">
                      {(() => {
                        const { phone: p, whatsapp: w } = resolvePublicCarDisplay(car);
                        const rawPhone = p ?? (car as any).phone ?? null;
                        const rawWhatsapp = w ?? null;
                        const phoneDigits = rawPhone ? rawPhone.replace(/[^\d]/g, '') : null;
                        const telUrl = phoneDigits ? `tel:${phoneDigits}` : null;
                        const whatsappSource = rawWhatsapp || rawPhone;
                        const whatsappDigits = whatsappSource ? whatsappSource.replace(/[^\d]/g, '').replace(/^0/, '972').replace(/^972/, '972') : null;
                        const whatsappUrl = whatsappDigits ? `https://wa.me/${whatsappDigits}` : null;
                        return (
                          <>
                            {whatsappUrl && (
                              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="car-phone-icon-link" title="וואטסאפ">
                                <svg className="car-phone-icon car-phone-icon-whatsapp" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="currentColor"/>
                                </svg>
                              </a>
                            )}
                            {telUrl && (
                              <a href={telUrl} className="car-phone-icon-link" title="חייג">
                                <svg className="car-phone-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="currentColor"/>
                                </svg>
                              </a>
                            )}
                            <span className="car-phone-number">{rawPhone ? rawPhone : 'לא זמין'}</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Seller Card - disabled to avoid duplicate; hero-bottom seller-strip is the single seller block */}
              {SHOW_YARD_CARD_ON_DETAILS && (car.yardUid || car.sellerType) && car.isPublished === true && (() => {
                const { displayName, logoUrl, phone, whatsapp, address, city, mapsUrl } = resolvePublicCarDisplay(car);
                return (
                <YardCard 
                  yardUid={car.yardUid ?? null} 
                  yardNameOverride={displayName ?? null}
                  yardPhoneOverride={phone ?? null}
                  yardLogoUrlOverride={logoUrl ?? null}
                  yardWhatsappPhoneOverride={whatsapp ?? null}
                  yardAddressOverride={address ?? null}
                  yardCityOverride={city ?? null}
                  yardMapsUrlOverride={mapsUrl ?? null}
                  yardContactNameOverride={(car as any).yardSnapshot?.yardContactName || ((car as any).yardContactName ?? (car as any).sellerContactName ?? null)}
                  showSellerLogo={((car as any).showLogo ?? (car as any).showSellerLogo) !== false}
                  showSellerPhone={((car as any).showPhone ?? (car as any).showSellerPhone) !== false}
                  showSellerWhatsapp={((car as any).showWhatsapp ?? (car as any).showSellerWhatsapp) !== false}
                  sellerType={car.sellerType ?? null}
                />
                );
              })()}

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
                    value: locationText,
                  },
                  // מס' יד - from handCount, hand, handNumber, numHands, yad, ownerCount, previousOwners (Excel/import variants)
                  { 
                    label: "מס' יד", 
                    value: (() => {
                      const raw = (car as any).hand ?? (car as any).handNumber ?? (car as any).numHands ?? (car as any).yad ?? (car as any).ownerCount ?? (car as any).previousOwners ?? car.handCount;
                      const n = normalizeHandCount(raw);
                      return n != null ? String(n) : 'לא צוין';
                    })(),
                    show: true
                  },
                  // Color - moved from מצב ותוספות
                  { label: 'צבע', value: formatValue(car.color), show: true },
                  // Engine displacement + gearbox in Basic Details (not under Technical)
                  { 
                    label: 'נפח מנוע', 
                    value: (car.engineDisplacementCc && typeof car.engineDisplacementCc === 'number' && car.engineDisplacementCc > 0)
                      ? `${car.engineDisplacementCc} סמ״ק`
                      : 'לא צוין',
                    show: true
                  },
                  { label: 'תיבת הילוכים', value: formatValue(car.gearboxType), show: true },
                  // מקוריות (ownership) - in פרטים בסיסיים per requirement; do not show under בעלות ותוקף
                  {
                    label: 'מקוריות',
                    value: (() => {
                      const raw = (car as any).ownership ?? (car as any).ownerShip ?? (car as any).origin ?? (car as any).ownerType ?? (car as any).baalut ?? (car as any).originality ?? car.ownershipType;
                      if (!raw || typeof raw !== 'string') return 'לא צוין';
                      const s = String(raw).trim();
                      if (/השכר/.test(s)) return 'השכרה';
                      if (/ליסינג/.test(s)) return 'ליסינג';
                      if (/פרטי/.test(s)) return 'פרטי';
                      return s;
                    })(),
                    show: true
                  },
                  // AC: not specified => כן, explicitly false => לא
                  { 
                    label: 'מזגן', 
                    value: (() => {
                      const hasACValue = car.hasAC ?? (car as any).ac;
                      if (hasACValue === false) return 'לא';
                      return 'כן'; // includes undefined/null => YES
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

                // פרטים טכניים (Technical Details) - DEFAULT COLLAPSED (engine + gearbox moved to Basic)
                const technicalRows: DetailRow[] = [
                  { 
                    label: 'סוג דלק', 
                    value: formatFuelType(car.fuelType), 
                    show: true // MUST SHOW
                  },
                  { label: 'סוג מרכב', value: formatValue(car.bodyType), show: true },
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

                // בעלות ותוקף (Ownership & Validity) - DEFAULT COLLAPSED (מקוריות shown in פרטים בסיסיים)
                const ownershipRows: DetailRow[] = [
                  { label: 'סוג יבוא', value: formatValue(car.importType), show: true },
                  { label: 'שימוש קודם', value: formatValue(car.previousUse), show: true },
                  // Single row: עליה לכביש/טסט (prefer test date, else road/first registration)
                  {
                    label: 'עליה לכביש/טסט',
                    value: formatDate(
                      (car as any).testDate ?? (car as any).testUntil ?? car.testUntil ?? car.testDate ?? (car as any).roadDate ?? (car as any).onRoadDate ?? (car as any).firstRegistration ?? car.registrationDate
                    ),
                    show: true
                  },
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

          {/* Contact Form - Right Side on Desktop - only show if published OR admin */}
          {car.isPublished === true && (
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
          )}
        </div>
      </section>

      {/* Debug Button (floating bottom-left) - Admin only, gated by feature flag */}
      {/* CRITICAL: Render condition depends only on flags + car, not on userProfile state
          This prevents flicker when userProfile loads asynchronously */}
      {(() => {
        const isAdmin = userProfile?.primaryRole === 'ADMIN' || userProfile?.isAdmin === true;
        // Only render if: admin + flag enabled + car loaded
        // Do NOT render if flags are undefined (they will be set by subscription)
        const showEmergencyDebugButton = isAdmin && debugButtonEnabled === true && car !== null;
        return showEmergencyDebugButton ? (
          <>
            <button
              className="public-car-debug-button"
              onClick={() => setDebugModalOpen(true)}
              title="Debug seller/yard snapshot data"
            >
              🔍 DEBUG מוכר/מגרש
            </button>
            <PublicCarDebugModal
              car={car}
              isOpen={debugModalOpen}
              onClose={() => setDebugModalOpen(false)}
            />
          </>
        ) : null;
      })()}
      </div>
    </>
  );
}
