import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchActivePromotionProducts,
  createPromotionOrderDraft,
} from '../api/promotionApi';
import type { YardCar } from '../api/yardFleetApi';
import PromotionSelector from './PromotionSelector';
import './PromotionDialog.css';

interface YardCarPromotionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  car: YardCar;
  onPromotionApplied?: () => void;
}

export default function YardCarPromotionDialog({
  isOpen,
  onClose,
  car,
  onPromotionApplied,
}: YardCarPromotionDialogProps) {
  const { firebaseUser } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    if (isOpen) {
      async function loadProducts() {
        setLoadingProducts(true);
        setError(null);
        try {
          // Products are loaded by PromotionSelector component
          await fetchActivePromotionProducts('YARD_CAR');
        } catch (err: any) {
          console.error('Error loading promotion products:', err);
          setError('שגיאה בטעינת מוצרי קידום');
        } finally {
          setLoadingProducts(false);
        }
      }
      loadProducts();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedProductId || !firebaseUser) {
      setError('נא לבחור חבילת קידום');
      return;
    }

    setIsApplying(true);
    setError(null);
    setSuccess(false);

    try {
      // Create promotion order with yard car ID
      // Note: When car is published to carAds, the promotion will be applied
      // For now, we create the order - it can be applied later when car is published
      await createPromotionOrderDraft(
        firebaseUser.uid,
        car.id, // Use yard car ID - will need mapping when car is published
        [{ productId: selectedProductId, quantity: 1 }],
        true // auto-mark as PAID (simulated)
      );
      
      setSuccess(true);
      
      if (onPromotionApplied) {
        onPromotionApplied();
      }
      
      // Close after a short delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error applying promotion:', err);
      setError(err.message || 'שגיאה ביישום הקידום');
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    setSelectedProductId(null);
    setError(null);
    setSuccess(false);
    onClose();
  };

  const carTitle = `${car.year || ''} ${car.brandText || car.brand || ''} ${car.modelText || car.model || ''}`.trim();

  return (
    <div className="promotion-dialog-overlay" onClick={handleClose}>
      <div className="promotion-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="promotion-dialog-header">
          <h2>קידום רכב</h2>
          <button className="promotion-dialog-close" onClick={handleClose}>
            ×
          </button>
        </div>
        
        <div className="promotion-dialog-body">
          <p className="dialog-subtitle">
            בחר חבילת קידום לרכב: <strong>{carTitle}</strong>
          </p>

          {success ? (
            <div className="promotion-success">
              <p>הקידום יושם בהצלחה!</p>
              <p className="promotion-note">
                הערה: הקידום ייושם כאשר הרכב יפורסם.
              </p>
            </div>
          ) : (
            <>
              {loadingProducts ? (
                <div className="promotion-selector-loading">טוען מוצרי קידום...</div>
              ) : error ? (
                <div className="promotion-selector-error">{error}</div>
              ) : (
                <PromotionSelector
                  scope="YARD_CAR"
                  carId={car.id}
                  currentPromotion={null} // Yard cars don't have promotion state yet in carSales
                  onSelectionChange={setSelectedProductId}
                  disabled={isApplying}
                />
              )}
              
              {error && <div className="promotion-dialog-error">{error}</div>}
            </>
          )}
        </div>
        
        {!success && (
          <div className="promotion-dialog-footer">
            <button
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={isApplying}
            >
              ביטול
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApply}
              disabled={isApplying || !selectedProductId}
            >
              {isApplying ? 'מיישם...' : 'החל קידום'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

