import { Link } from 'react-router-dom';
import type { PublicSearchResultItem } from '../../types/PublicSearchResult';
import { FavoriteHeart } from './FavoriteHeart';
import { CarImage } from './CarImage';
import './CarListItem.css';

export interface CarListItemProps {
  car: PublicSearchResultItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  carLink: string;
  formatPrice: (price: number) => string;
  isPromotionActive: (until: any) => boolean;
}

export function CarListItem({
  car,
  isFavorite,
  onToggleFavorite,
  carLink,
  formatPrice,
  isPromotionActive,
}: CarListItemProps) {
  return (
    <Link to={carLink} className="car-list-item card">
      <div className="car-list-item-content">
        {/* Right side: Image */}
        <div className="car-list-image">
          <CarImage src={car.mainImageUrl} alt={car.title} />
        </div>

        {/* Center: Main content */}
        <div className="car-list-main">
          <div className="car-list-header">
            <h3 className="car-list-title">{car.title}</h3>
            <div className="car-list-badges">
              {car.promotion?.highlightUntil && isPromotionActive(car.promotion.highlightUntil) && (
                <span className="promotion-badge promoted">מודעה מקודמת</span>
              )}
              {car.promotion?.boostUntil && isPromotionActive(car.promotion.boostUntil) && (
                <span className="promotion-badge boosted">מוקפץ</span>
              )}
              {car.yardPromotion && (
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
          <div className="car-list-price">
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

