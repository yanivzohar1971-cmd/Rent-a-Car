import type { PromotionProduct } from '../../types/Promotion';
import { getTierFromProductType, getPromotionTierTheme } from '../../utils/promotionTierTheme';
import { CarImage } from '../cars/CarImage';
import './PromotionPreviewCard.css';

interface PromotionPreviewCardProps {
  selectedProduct: PromotionProduct | null;
}

/**
 * Preview card component showing how a car card will look with the selected promotion
 */
export function PromotionPreviewCard({ selectedProduct }: PromotionPreviewCardProps) {
  // Sample car data for preview
  const sampleCar = {
    title: 'טויוטה קורולה 2018',
    price: 78000,
    mileageKm: 82000,
    city: 'תל אביב',
    mainImageUrl: 'https://via.placeholder.com/400x240?text=Preview',
  };

  // Get tier from selected product
  const tier = selectedProduct ? getTierFromProductType(selectedProduct.type) : undefined;
  const tierTheme = getPromotionTierTheme(tier);

  // CSS variables for tier background images
  const cardStyle: React.CSSProperties = tierTheme ? {
    '--promo-accent': tierTheme.accent,
    '--promo-bg-desktop': `url(${tierTheme.bgDesktop})`,
    '--promo-bg-mobile': `url(${tierTheme.bgMobile})`,
    '--promo-bg-desktop-webp': `url(${tierTheme.fallbackDesktopWebp})`,
    '--promo-bg-mobile-webp': `url(${tierTheme.fallbackMobileWebp})`,
  } as React.CSSProperties : {};

  const cardClassName = [
    'promotion-preview-card',
    'car-card',
    'card',
    tier ? `is-${tier.toLowerCase().replace(/_/g, '-')}` : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="promotion-preview-container">
      <h4 className="promotion-preview-title">תצוגה מקדימה</h4>
      <div className={cardClassName} style={cardStyle}>
        <div className="car-image">
          <CarImage src={sampleCar.mainImageUrl} alt={sampleCar.title} />
        </div>
        <div className="car-info">
          <div className="car-header-row">
            <h3 className="car-title">{sampleCar.title}</h3>
            <div className="car-badges">
              {tierTheme && (
                <span className="promotion-badge" style={{ background: tierTheme.accent, color: 'white' }}>
                  {tierTheme.labelHe}
                </span>
              )}
            </div>
          </div>
          <p className="car-price">מחיר: {sampleCar.price.toLocaleString('he-IL')} ₪</p>
          <p className="car-km">ק״מ: {sampleCar.mileageKm.toLocaleString('he-IL')}</p>
          <p className="car-location">מיקום: {sampleCar.city}</p>
          <div className="car-view-button-wrapper">
            <span className="car-view-text">לצפייה בפרטים</span>
          </div>
        </div>
      </div>
      {!selectedProduct && (
        <p className="promotion-preview-note">בחר חבילת קידום כדי לראות תצוגה מקדימה</p>
      )}
    </div>
  );
}
