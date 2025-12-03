import { useState, useEffect } from 'react';
import { fetchActivePromotionProducts, createPromotionOrderDraft, applyPromotionOrderToCar } from '../api/promotionApi';
import type { PromotionProduct, PromotionScope, CarPromotionState } from '../types/Promotion';
import type { Timestamp } from 'firebase/firestore';
import './PromotionSelector.css';

interface PromotionSelectorProps {
  scope: PromotionScope;
  carId?: string | null; // For existing ads, null for new ads
  currentPromotion?: CarPromotionState | null;
  onSelectionChange?: (selectedProductId: string | null) => void;
  disabled?: boolean;
}

export default function PromotionSelector({
  scope,
  carId = null,
  currentPromotion = null,
  onSelectionChange,
  disabled = false,
}: PromotionSelectorProps) {
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);
        setError(null);
        const activeProducts = await fetchActivePromotionProducts(scope);
        setProducts(activeProducts);
      } catch (err: any) {
        console.error('Error loading promotion products:', err);
        setError('שגיאה בטעינת מוצרי קידום. ניתן לפרסם מודעה ללא קידום.');
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, [scope]);

  const handleSelectionChange = (productId: string | null) => {
    setSelectedProductId(productId);
    if (onSelectionChange) {
      onSelectionChange(productId);
    }
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isPromotionActive = (until: Timestamp | undefined): boolean => {
    if (!until) return false;
    return until.toDate() > new Date();
  };

  if (loading) {
    return (
      <div className="promotion-selector">
        <p className="promotion-loading">טוען מוצרי קידום...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="promotion-selector">
        <p className="promotion-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="promotion-selector">
      {/* Current Promotion Status */}
      {currentPromotion && carId && (
        <div className="current-promotion-status">
          <h4>סטטוס קידום נוכחי:</h4>
          {currentPromotion.boostUntil && isPromotionActive(currentPromotion.boostUntil) && (
            <div className="promotion-status-item">
              <span className="promotion-badge">מוקפץ</span>
              <span>עד {formatDate(currentPromotion.boostUntil)}</span>
            </div>
          )}
          {currentPromotion.highlightUntil && isPromotionActive(currentPromotion.highlightUntil) && (
            <div className="promotion-status-item">
              <span className="promotion-badge">מודגש</span>
              <span>עד {formatDate(currentPromotion.highlightUntil)}</span>
            </div>
          )}
          {currentPromotion.mediaPlusEnabled && (
            <div className="promotion-status-item">
              <span className="promotion-badge">Media+</span>
              <span>פעיל</span>
            </div>
          )}
        </div>
      )}

      {/* Basic/Free Option */}
      <div className="promotion-option">
        <label className="promotion-option-label">
          <input
            type="radio"
            name="promotion"
            value=""
            checked={selectedProductId === null}
            onChange={() => handleSelectionChange(null)}
            disabled={disabled}
          />
          <div className="promotion-option-content">
            <div className="promotion-option-header">
              <span className="promotion-option-name">פרסום בסיסי (חינם)</span>
              <span className="promotion-option-price">₪0</span>
            </div>
            <p className="promotion-option-description">פרסום בסיסי ללא קידום נוסף</p>
          </div>
        </label>
      </div>

      {/* Paid Promotion Options */}
      {products.length === 0 ? (
        <p className="promotion-empty">אין מוצרי קידום זמינים כרגע</p>
      ) : (
        products.map((product) => (
          <div key={product.id} className="promotion-option">
            <label className="promotion-option-label">
              <input
                type="radio"
                name="promotion"
                value={product.id}
                checked={selectedProductId === product.id}
                onChange={() => handleSelectionChange(product.id)}
                disabled={disabled}
              />
              <div className="promotion-option-content">
                <div className="promotion-option-header">
                  <span className="promotion-option-name">{product.name}</span>
                  <span className="promotion-option-price">₪{product.price.toLocaleString()}</span>
                </div>
                {product.description && (
                  <p className="promotion-option-description">{product.description}</p>
                )}
                {product.durationDays && (
                  <p className="promotion-option-meta">
                    משך: {product.durationDays} יום{product.durationDays !== 1 ? 'ים' : ''}
                  </p>
                )}
                {product.numBumps && (
                  <p className="promotion-option-meta">
                    מספר הקפצות: {product.numBumps}
                  </p>
                )}
              </div>
            </label>
          </div>
        ))
      )}
    </div>
  );
}

