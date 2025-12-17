import { Link } from 'react-router-dom';
import type { PublicSearchResultItem } from '../../types/PublicSearchResult';
import { FavoriteHeart } from './FavoriteHeart';
import { CarImage } from './CarImage';
import { isRecommendedYard } from '../../utils/yardPromotionHelpers';
import type { Timestamp } from 'firebase/firestore';
import { PROMO_PROOF_MODE } from '../../config/flags';
import { formatTimeRemaining, getPromotionTier, calculatePromotionScore } from '../../utils/promotionProofHelpers';
import { useAuth } from '../../context/AuthContext';
import { getPromotionBadges } from '../../utils/promotionLabels';
import './CarListItem.css';

export interface CarListItemProps {
  car: PublicSearchResultItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  carLink: string;
  formatPrice: (price: number) => string;
  isPromotionActive: (until: Timestamp | undefined) => boolean;
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
  const isPlatinum = car.promotion?.platinumUntil && isPromotionActive(car.promotion.platinumUntil);
  const isHighlighted = car.promotion?.highlightUntil && isPromotionActive(car.promotion.highlightUntil);
  const isBoosted = car.promotion?.boostUntil && isPromotionActive(car.promotion.boostUntil);
  const isExposurePlus = car.promotion?.exposurePlusUntil && isPromotionActive(car.promotion.exposurePlusUntil);
  const isRecommendedYardFlag = isRecommendedYard(car.yardPromotion);
  
  // Get promotion badges using contract labels
  const promotionBadges = getPromotionBadges(car.promotion, isPromotionActive);
  
  // Build className with promotion states
  const className = [
    'car-list-item',
    'card',
    isPlatinum ? 'is-platinum' : '',
    isHighlighted ? 'is-highlighted' : '',
    isBoosted ? 'is-boosted' : '',
    isExposurePlus ? 'is-exposure-plus' : '',
  ].filter(Boolean).join(' ');
  
  // Fallback to first imageUrl if mainImageUrl is missing
  const cardSrc = car.mainImageUrl || (car.imageUrls && car.imageUrls.length > 0 ? car.imageUrls[0] : undefined);

  return (
    <Link to={carLink} className={className}>
      <div className="car-list-item-content">
        {/* Right side: Image */}
        <div className="car-list-image">
          <CarImage src={cardSrc} alt={car.title} />
        </div>

        {/* Center: Main content */}
        <div className="car-list-main">
          <div className="car-list-header" style={{ position: 'relative' }}>
            {isBoosted && <span className="boost-ribbon" aria-hidden="true">↑</span>}
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
              {/* Use contract labels for badges */}
              {promotionBadges.map((badge, idx) => {
                let badgeClass = 'promotion-badge';
                if (badge === 'PLATINUM') badgeClass += ' platinum';
                else if (badge === 'מוקפץ') badgeClass += ' boosted';
                else if (badge === 'מובלט') badgeClass += ' promoted';
                else if (badge === 'מודעה מודגשת') badgeClass += ' exposure-plus';
                
                return (
                  <span key={idx} className={badgeClass}>{badge}</span>
                );
              })}
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

