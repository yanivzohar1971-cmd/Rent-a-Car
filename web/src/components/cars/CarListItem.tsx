import { Link } from 'react-router-dom';
import type { PublicSearchResultItem } from '../../types/PublicSearchResult';
import { FavoriteHeart } from './FavoriteHeart';
import { CarImage } from './CarImage';
import { isRecommendedYard } from '../../utils/yardPromotionHelpers';
import { PROMO_PROOF_MODE } from '../../config/flags';
import { formatTimeRemaining, getPromotionTier, calculatePromotionScore } from '../../utils/promotionProofHelpers';
import { useAuth } from '../../context/AuthContext';
import type { PromotionUntil } from '../../utils/promotionTime';
import { getActivePromotionTier, getPromotionTierTheme } from '../../utils/promotionTierTheme';
import './CarListItem.css';

export interface CarListItemProps {
  car: PublicSearchResultItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  carLink: string;
  formatPrice: (price: number) => string;
  isPromotionActive: (until: PromotionUntil) => boolean;
  rankIndex?: number; // 1-based rank in current search results (proof mode only)
  totalResults?: number; // Total results count (proof mode only)
}

export function CarListItem({
  car,
  isFavorite,
  onToggleFavorite,
  carLink,
  formatPrice,
  isPromotionActive,
  rankIndex,
  totalResults,
}: CarListItemProps) {
  const { userProfile } = useAuth();
  const isProofMode = PROMO_PROOF_MODE && (userProfile?.isYard || userProfile?.isAdmin);
  
  // Compute promotion flags using contract labels
  const isDiamond = car.promotion?.diamondUntil && isPromotionActive(car.promotion.diamondUntil);
  const isPlatinum = car.promotion?.platinumUntil && isPromotionActive(car.promotion.platinumUntil);
  const isHighlighted = car.promotion?.highlightUntil && isPromotionActive(car.promotion.highlightUntil);
  const isBoosted = car.promotion?.boostUntil && isPromotionActive(car.promotion.boostUntil);
  const isExposurePlus = car.promotion?.exposurePlusUntil && isPromotionActive(car.promotion.exposurePlusUntil);
  const isRecommendedYardFlag = isRecommendedYard(car.yardPromotion);
  
  // Check if stripes should be shown (only for PLATINUM or DIAMOND with showStripes flag)
  const hasStripes = Boolean(
    car.promotion?.showStripes &&
    (isPlatinum || isDiamond)
  );
  
  // Get active promotion tier for background theme
  const activeTier = getActivePromotionTier(car.promotion, isPromotionActive);
  const tierTheme = getPromotionTierTheme(activeTier);
  
  // Build className with promotion states
  // Include 'car-card' as base class for promo styling consistency
  const className = [
    'car-card',
    'car-list-item',
    'card',
    isDiamond ? 'is-diamond' : '',
    isPlatinum ? 'is-platinum' : '',
    isHighlighted ? 'is-highlighted' : '',
    isBoosted ? 'is-boosted' : '',
    isExposurePlus ? 'is-exposure-plus' : '',
    hasStripes ? 'has-stripes' : '',
  ].filter(Boolean).join(' ');
  
  // CSS variables for tier background images
  // Use image-set with AVIF/WEBP fallback
  // For mobile, use mobile variant (handled via media query in CSS or JS)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const cardStyle: React.CSSProperties = tierTheme ? {
    '--promo-accent': tierTheme.accent,
    backgroundImage: `image-set(
      url("${isMobile ? tierTheme.bgMobile : tierTheme.bgDesktop}") type("image/avif"),
      url("${isMobile ? tierTheme.fallbackMobileWebp : tierTheme.fallbackDesktopWebp}") type("image/webp")
    )`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  } as React.CSSProperties : {};
  
  // Fallback to first imageUrl if mainImageUrl is missing
  const cardSrc = car.mainImageUrl || (car.imageUrls && car.imageUrls.length > 0 ? car.imageUrls[0] : undefined);

  return (
    <Link to={carLink} className={className} style={cardStyle}>
      <div className="car-list-item-content">
        {/* Right side: Image */}
        <div className="car-list-image">
          <CarImage src={cardSrc} alt={car.title} width={200} height={150} />
        </div>

        {/* Center: Main content */}
        <div className="car-list-main">
          <div className="car-list-header" style={{ position: 'relative' }}>
            <h3 className={`car-list-title ${isHighlighted ? 'is-highlighted-title' : ''} ${isExposurePlus ? 'is-exposure-plus-title' : ''}`}>
              {car.title}
            </h3>
            {/* Proof mode: rank display */}
            {isProofMode && rankIndex !== undefined && totalResults !== undefined && (
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
                Rank #{rankIndex} / {totalResults}
              </div>
            )}
            {/* Proof mode: promotion debug info */}
            {isProofMode && car.promotion && (
              <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
                <div>Promo: tier={getPromotionTier(car.promotion)} | score={calculatePromotionScore(car.promotion)}</div>
                {car.promotion.boostUntil && (
                  <div>Boost: {formatTimeRemaining(car.promotion.boostUntil)}</div>
                )}
                {car.promotion.highlightUntil && (
                  <div>Highlight: {formatTimeRemaining(car.promotion.highlightUntil)}</div>
                )}
                {/* bumpedAt property not available in CarPromotionState type */}
              </div>
            )}
            <div className="car-list-badges">
              {isRecommendedYardFlag && (
                <span className="promotion-badge recommended-yard">מגרש מומלץ</span>
              )}
              <span className={`seller-type-badge ${car.sellerType === 'YARD' ? 'yard' : 'private'}`}>
                {car.sellerType === 'YARD' ? 'מגרש' : 'מוכר פרטי'}
              </span>
            </div>
          </div>

          {/* Subline - version/engine (placeholder for now) */}
          <div className="car-list-subline">
            {/* Can be enhanced with actual version/engine data if available */}
          </div>

          {/* Metadata row */}
          <div className="car-list-metadata">
            {car.year && <span className="car-list-meta-item">שנה: {car.year}</span>}
            {car.mileageKm !== undefined && (
              <span className="car-list-meta-item">ק״מ: {car.mileageKm.toLocaleString('he-IL')}</span>
            )}
            {car.city && <span className="car-list-meta-item">מיקום: {car.city}</span>}
          </div>

          {/* Tags row */}
          <div className="car-list-tags">
            {/* Placeholder tags - can be enhanced with actual car features */}
            {/* Example tags: "חשמלי", "גלגלי מגנזיום", "בקרת שיוט אדפטיבית" */}
          </div>
        </div>

        {/* Left side: Price and Heart */}
        <div className="car-list-right">
          <div className={`car-list-price ${isExposurePlus ? 'is-exposure-plus-price' : ''}`}>
            {car.price ? formatPrice(car.price) : 'מחיר לפי בקשה'} ₪
          </div>
          <div className="car-list-heart">
            <FavoriteHeart
              isFavorite={isFavorite}
              onToggle={onToggleFavorite}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

