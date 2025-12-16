import { useEffect, useState, useRef } from 'react';
import { fetchVisibleRentalCompaniesForPlacement, type RentalCompany, type AdPlacement, type OutboundPolicy } from '../../api/rentalCompaniesApi';
import './PartnerAdsStrip.css';

const CAROUSEL_AUTO_ROTATE_INTERVAL = 5500; // 5.5 seconds (less aggressive)

interface PartnerAdsStripProps {
  placement: AdPlacement;
}

/**
 * Get rel attribute based on outbound policy
 */
function getRelAttribute(outboundPolicy?: OutboundPolicy): string {
  switch (outboundPolicy) {
    case 'SPONSORED_NOFOLLOW':
      return 'sponsored nofollow noopener noreferrer';
    case 'NOFOLLOW':
      return 'nofollow noopener noreferrer';
    case 'FOLLOW':
      return 'noopener noreferrer';
    default:
      return 'sponsored nofollow noopener noreferrer';
  }
}

/**
 * Append UTM parameters to external URL (safe, preserves existing params)
 */
function appendUtmParams(url: string, placement: AdPlacement): string {
  try {
    const urlObj = new URL(url);
    
    // Don't overwrite existing UTM params
    if (urlObj.searchParams.has('utm_source')) {
      return url;
    }
    
    urlObj.searchParams.set('utm_source', 'carexperts4u');
    urlObj.searchParams.set('utm_medium', 'partner_ad');
    urlObj.searchParams.set('utm_campaign', placement.toLowerCase().replace(/_/g, '-'));
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Track partner click (non-blocking, external clicks only)
 * Includes per-session throttle (10 seconds) to prevent double-counting
 */
function trackPartnerClick(partnerId: string, placement: AdPlacement, clickTrackingEnabled?: boolean): void {
  if (clickTrackingEnabled === false) {
    return;
  }

  // Throttle: check if clicked within last 10 seconds
  const throttleKey = `ad_click_${partnerId}_${placement}`;
  const now = Date.now();
  
  try {
    const lastClickStr = sessionStorage.getItem(throttleKey);
    if (lastClickStr) {
      const lastClick = parseInt(lastClickStr, 10);
      if (now - lastClick < 10000) {
        // Within throttle window - skip tracking (but still allow navigation)
        return;
      }
    }
    
    // Update throttle timestamp
    sessionStorage.setItem(throttleKey, now.toString());
  } catch {
    // If sessionStorage fails, continue anyway (tracking is non-critical)
  }

  // Use the deployed function URL (adjust region if needed)
  const trackingUrl = 'https://us-central1-carexpert-94faa.cloudfunctions.net/trackPartnerClick';
  const payload = JSON.stringify({ partnerId, placement });

  // Use sendBeacon if available (best for navigation)
  // Send as plain string (most compatible across browsers)
  if (navigator.sendBeacon) {
    try {
      // Some browsers prefer plain string, others Blob - try string first
      const sent = navigator.sendBeacon(trackingUrl, payload);
      if (!sent) {
        // Fallback to fetch if sendBeacon fails
        fetch(trackingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // Silently fail - tracking is non-critical
        });
      }
    } catch {
      // Fallback to fetch if sendBeacon throws
      fetch(trackingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Silently fail - tracking is non-critical
      });
    }
  } else {
    // Fallback to fetch with keepalive
    fetch(trackingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Silently fail - tracking is non-critical
    });
  }
}

/**
 * Deterministic rotation: hash today's date + company ID to pick subset
 * Ensures same companies shown on same day (no flicker)
 */
function shouldShowCompany(company: RentalCompany, _index: number, maxItems: number, allCompanies: RentalCompany[]): boolean {
  if (allCompanies.length <= maxItems) {
    return true;
  }

  // Simple hash function
  const hash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const hashValue = hash(`${today}_${company.id}`);
  const selectedIndex = hashValue % allCompanies.length;

  // Show if this company is in the selected subset
  return selectedIndex < maxItems && allCompanies[selectedIndex] === company;
}

export default function PartnerAdsStrip({ placement }: PartnerAdsStripProps) {
  const [companies, setCompanies] = useState<RentalCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const carouselIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const pauseUntilRef = useRef<number>(0); // Timestamp until which to pause auto-advance

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Load companies
  useEffect(() => {
    async function loadCompanies() {
      try {
        setLoading(true);
        setError(null);
        const companiesList = await fetchVisibleRentalCompaniesForPlacement(placement);
        setCompanies(companiesList);
      } catch (err: any) {
        console.error('Error loading partner ads:', err);
        setError('אירעה שגיאה בטעינת פרסומות.');
      } finally {
        setLoading(false);
      }
    }

    loadCompanies();
  }, [placement]);

  // Auto-rotate carousel (only on mobile, only if not paused, only if reduced motion is off)
  useEffect(() => {
    if (loading || error || companies.length === 0) return;
    if (prefersReducedMotion || isPaused) {
      if (carouselIntervalRef.current) {
        clearInterval(carouselIntervalRef.current);
        carouselIntervalRef.current = null;
      }
      return;
    }

    // Only auto-rotate on mobile (check window width)
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      return;
    }

    carouselIntervalRef.current = setInterval(() => {
      // Check if we should pause due to recent user interaction
      const now = Date.now();
      if (now < pauseUntilRef.current) {
        return; // Skip this tick
      }
      setCurrentSlide((prev) => (prev + 1) % companies.length);
    }, CAROUSEL_AUTO_ROTATE_INTERVAL);

    return () => {
      if (carouselIntervalRef.current) {
        clearInterval(carouselIntervalRef.current);
      }
    };
  }, [loading, error, companies.length, isPaused, prefersReducedMotion]);

  // Handle touch/drag/scroll to pause auto-advance
  useEffect(() => {
    const container = carouselContainerRef.current;
    if (!container) return;

    const pauseAutoAdvance = () => {
      // Pause for 12 seconds after user interaction
      pauseUntilRef.current = Date.now() + 12000;
      setIsPaused(true);
      // Also resume isPaused after delay (for existing logic)
      setTimeout(() => setIsPaused(false), 2000);
    };

    const handleTouchStart = () => {
      pauseAutoAdvance();
    };

    const handleTouchEnd = () => {
      pauseAutoAdvance();
    };

    const handlePointerDown = () => {
      pauseAutoAdvance();
    };

    const handleWheel = () => {
      pauseAutoAdvance();
    };

    const handleMouseEnter = () => {
      setIsPaused(true);
    };

    const handleMouseLeave = () => {
      setIsPaused(false);
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (error || companies.length === 0) {
    return null; // Don't show section if no companies
  }

  // Group companies: FEATURED first, then SPONSORED, then NEUTRAL
  const featured = companies.filter(
    (c) => c.displayType === 'FEATURED' || c.isFeatured
  );
  const sponsored = companies.filter((c) => c.displayType === 'SPONSORED');
  const neutral = companies.filter(
    (c) => c.displayType === 'NEUTRAL' && !c.isFeatured
  );

  // Desktop: show up to 8 logos (apply rotation if needed)
  const MAX_DESKTOP_ITEMS = 8;
  const allForDesktop = [...featured, ...sponsored, ...neutral];
  const desktopItems = allForDesktop.filter((company, index) => 
    shouldShowCompany(company, index, MAX_DESKTOP_ITEMS, allForDesktop)
  ).slice(0, MAX_DESKTOP_ITEMS);

  // Mobile: carousel includes all (no limit)
  const mobileItems = [...featured, ...sponsored, ...neutral];

  // Handle external click with tracking (non-blocking)
  const handleExternalClick = (company: RentalCompany, _e: React.MouseEvent<HTMLAnchorElement>) => {
    // Track only external clicks (paid destination)
    // Do NOT call preventDefault - let navigation proceed normally
    trackPartnerClick(company.id, placement, company.clickTrackingEnabled);
  };

  return (
    <section className="partner-ads-strip" aria-label="פרסומות שותפים">
      {/* Desktop Grid */}
      <div className="partner-ads-desktop">
        {desktopItems.length > 0 && (
          <div className="partner-ads-grid">
            {desktopItems.map((company) => {
              // Main click always goes to external paid URL
              const externalUrl = appendUtmParams(company.websiteUrl, placement);
              const hasLandingPage = !!company.slug;
              
              return (
                <div key={company.id} className="partner-ad-card">
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel={getRelAttribute(company.outboundPolicy)}
                    className="partner-ad-logo-link"
                    aria-label={`ביקור באתר ${company.nameHe}`}
                    onClick={(e) => handleExternalClick(company, e)}
                  >
                    <img
                      src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                      alt={company.logoAlt || `לוגו ${company.nameHe}`}
                      className="partner-ad-logo"
                      loading="lazy"
                      decoding="async"
                      width="120"
                      height="80"
                    />
                  </a>
                  {hasLandingPage && (
                    <a
                      href={`/partner/${company.slug}`}
                      className="partner-ad-info-link"
                      aria-label={`פרטים על ${company.nameHe}`}
                    >
                      מידע
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile Carousel */}
      <div className="partner-ads-mobile" ref={carouselContainerRef}>
        {mobileItems.length > 0 && (
          <>
            <div
              className="partner-ads-carousel"
              style={{
                transform: `translateX(-${currentSlide * 100}%)`,
                transition: prefersReducedMotion ? 'none' : 'transform 0.5s ease',
              }}
            >
              {mobileItems.map((company) => {
                // Main click always goes to external paid URL
                const externalUrl = appendUtmParams(company.websiteUrl, placement);
                const hasLandingPage = !!company.slug;
                
                return (
                  <div key={company.id} className="partner-ad-carousel-slide">
                    <div className="partner-ad-carousel-content">
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel={getRelAttribute(company.outboundPolicy)}
                        className="partner-ad-logo-link"
                        aria-label={`ביקור באתר ${company.nameHe}`}
                        onClick={(e) => handleExternalClick(company, e)}
                      >
                        <img
                          src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                          alt={company.logoAlt || `לוגו ${company.nameHe}`}
                          className="partner-ad-logo"
                          loading="lazy"
                          decoding="async"
                          width="120"
                          height="80"
                        />
                      </a>
                      {hasLandingPage && (
                        <a
                          href={`/partner/${company.slug}`}
                          className="partner-ad-info-link"
                          aria-label={`פרטים על ${company.nameHe}`}
                        >
                          מידע
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Carousel indicators */}
            {mobileItems.length > 1 && (
              <div className="carousel-indicators">
                {mobileItems.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`carousel-indicator ${index === currentSlide ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentSlide(index);
                      setIsPaused(true);
                      setTimeout(() => setIsPaused(false), 2000);
                    }}
                    aria-label={`עבור לשקופית ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
