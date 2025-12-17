import { useEffect, useState, useRef } from 'react';
import { fetchVisibleRentalCompanies, type RentalCompany } from '../../api/rentalCompaniesApi';
import './RentalCompanyLogosSection.css';

const CAROUSEL_AUTO_ROTATE_INTERVAL = 3000; // 3 seconds

export default function RentalCompanyLogosSection() {
  const [companies, setCompanies] = useState<RentalCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const carouselIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);

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
        const companiesList = await fetchVisibleRentalCompanies();
        setCompanies(companiesList);
      } catch (err: any) {
        console.error('Error loading rental companies:', err);
        setError('אירעה שגיאה בטעינת חברות השכרה.');
      } finally {
        setLoading(false);
      }
    }

    loadCompanies();
  }, []);

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
      setCurrentSlide((prev) => (prev + 1) % companies.length);
    }, CAROUSEL_AUTO_ROTATE_INTERVAL);

    return () => {
      if (carouselIntervalRef.current) {
        clearInterval(carouselIntervalRef.current);
      }
    };
  }, [loading, error, companies.length, isPaused, prefersReducedMotion]);

  // Handle touch/drag to pause
  useEffect(() => {
    const container = carouselContainerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      setIsPaused(true);
    };

    const handleTouchEnd = () => {
      // Resume after a delay
      setTimeout(() => setIsPaused(false), 2000);
    };

    const handleMouseEnter = () => {
      setIsPaused(true);
    };

    const handleMouseLeave = () => {
      setIsPaused(false);
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
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

  // Group companies
  const featured = companies.filter(
    (c) => c.displayType === 'FEATURED' || c.isFeatured
  );
  const sponsored = companies.filter((c) => c.displayType === 'SPONSORED');
  const neutral = companies.filter(
    (c) => c.displayType === 'NEUTRAL' && !c.isFeatured
  );

  // Determine rel attribute for links
  const getRelAttribute = (displayType: string) => {
    if (displayType === 'SPONSORED') {
      return 'nofollow sponsored noopener noreferrer';
    }
    return 'nofollow noopener noreferrer';
  };

  return (
    <section className="rental-companies-section" aria-labelledby="rental-companies-heading">
      <h2 id="rental-companies-heading" className="rental-companies-heading">
        חברות השכרה מובילות
      </h2>

      {/* Desktop Grid */}
      <div className="rental-companies-desktop">
        {featured.length > 0 && (
          <div className="rental-companies-group featured-group">
            <div className="rental-companies-grid">
              {featured.map((company) => (
                <a
                  key={company.id}
                  href={company.websiteUrl}
                  target="_blank"
                  rel={getRelAttribute(company.displayType)}
                  className="rental-company-logo-link"
                  aria-label={`ביקור באתר ${company.nameHe}`}
                >
                  <img
                    src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                    alt={company.logoAlt || `לוגו ${company.nameHe}`}
                    className="rental-company-logo"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {sponsored.length > 0 && (
          <div className="rental-companies-group sponsored-group">
            <div className="rental-companies-grid">
              {sponsored.map((company) => (
                <a
                  key={company.id}
                  href={company.websiteUrl}
                  target="_blank"
                  rel={getRelAttribute(company.displayType)}
                  className="rental-company-logo-link"
                  aria-label={`ביקור באתר ${company.nameHe}`}
                >
                  <img
                    src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                    alt={company.logoAlt || `לוגו ${company.nameHe}`}
                    className="rental-company-logo"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {neutral.length > 0 && (
          <div className="rental-companies-group neutral-group">
            <div className="rental-companies-grid">
              {neutral.map((company) => (
                <a
                  key={company.id}
                  href={company.websiteUrl}
                  target="_blank"
                  rel={getRelAttribute(company.displayType)}
                  className="rental-company-logo-link"
                  aria-label={`ביקור באתר ${company.nameHe}`}
                >
                  <img
                    src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                    alt={company.logoAlt || `לוגו ${company.nameHe}`}
                    className="rental-company-logo"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Carousel */}
      <div className="rental-companies-mobile" ref={carouselContainerRef}>
        <div
          className="rental-companies-carousel"
          style={{
            transform: `translateX(-${currentSlide * 100}%)`,
            transition: prefersReducedMotion ? 'none' : 'transform 0.5s ease',
          }}
        >
          {companies.map((company) => (
            <div key={company.id} className="rental-company-carousel-slide">
              <a
                href={company.websiteUrl}
                target="_blank"
                rel={getRelAttribute(company.displayType)}
                className="rental-company-logo-link"
                aria-label={`ביקור באתר ${company.nameHe}`}
              >
                <img
                  src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                  alt={company.logoAlt || `לוגו ${company.nameHe}`}
                  className="rental-company-logo"
                  loading="lazy"
                />
              </a>
            </div>
          ))}
        </div>

        {/* Carousel indicators */}
        {companies.length > 1 && (
          <div className="carousel-indicators">
            {companies.map((_, index) => (
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
      </div>
    </section>
  );
}
