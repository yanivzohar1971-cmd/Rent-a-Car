import type { PromotionProduct } from '../../types/Promotion';
import { getTierFromProductType, getPromotionTierTheme, resolveMaterialFromPromotionTier } from '../../utils/promotionTierTheme';
import { getMaterialLabelForProductType } from '../../utils/promotionLabels';
import { resolvePromoMaterialUrl, cssUrl, type PromoMaterial } from '../../utils/promoMaterialAssets';
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
  
  // Get material for PNG backgrounds and button
  const material = tier ? resolveMaterialFromPromotionTier(tier) : undefined;
  const promoMaterial = material as PromoMaterial | undefined;

  // CSS variables for tier background images (PNG)
  const cardStyle: React.CSSProperties & Record<string, string> = {};
  if (tierTheme) {
    cardStyle['--promo-accent'] = tierTheme.accent;
  }
  if (promoMaterial) {
    cardStyle['--promo-bg-desktop'] = cssUrl(resolvePromoMaterialUrl(promoMaterial, 'bg-desktop'));
    cardStyle['--promo-bg-mobile'] = cssUrl(resolvePromoMaterialUrl(promoMaterial, 'bg-mobile'));
  }
  
  // Button style for promotion badge
  const badgeStyle: React.CSSProperties & Record<string, string> = tierTheme ? { background: tierTheme.accent, color: 'white' } : {};
  if (promoMaterial) {
    badgeStyle['--promo-btn-bg'] = cssUrl(resolvePromoMaterialUrl(promoMaterial, 'btn'));
  }

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
              {selectedProduct && (
                <span className="promotion-badge promo-material-btn" style={badgeStyle}>
                  {getMaterialLabelForProductType(selectedProduct.type)}
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
