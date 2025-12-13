import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchActivePromotionProducts,
} from '../api/promotionApi';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
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
      // Use Cloud Function to apply promotion server-side
      // This avoids client-side permission errors when writing to publicCars
      const applyPromotionToYardCar = httpsCallable(functions, 'applyPromotionToYardCar');
      
      const result = await applyPromotionToYardCar({
        yardCarId: car.id,
        promotionProductId: selectedProductId,
        scope: 'YARD_CAR',
      });

      const data = result.data as { success: boolean; yardCarId: string; publicCarId: string | null; promotionType: string };
      
      if (data.success) {
        setSuccess(true);
        
        if (onPromotionApplied) {
          onPromotionApplied();
        }
        
        // Close after a short delay
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        throw new Error('Failed to apply promotion');
      }
    } catch (err: any) {
      // Enhanced diagnostic logging (dev-only)
      const isDev = import.meta.env.DEV;
      const errorCode = err?.code || 'unknown';
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      
      if (isDev) {
        console.error('[YardCarPromotionDialog] Error applying promotion:', {
          code: errorCode,
          message: errorMessage,
          yardCarId: car.id,
          publicCarId: car.id, // May need mapping
          carAdId: null, // Not yet created
          promotionScope: 'YARD_CAR',
          selectedProductId,
          userId: firebaseUser?.uid,
          yardId: firebaseUser?.uid,
          failedOperation: errorCode === 'permission-denied' ? 'Cloud Function call' : 'unknown',
          fullError: err,
        });
      }
      
      // User-friendly error messages
      if (errorCode === 'permission-denied') {
        setError('אין הרשאה לפעולה זו. נסה לרענן את הדף או פנה לתמיכה.');
      } else if (errorCode === 'not-found') {
        setError('הרכב או חבילת הקידום לא נמצאו. נסה לרענן את הדף.');
      } else {
        setError(err.message || 'תקלה זמנית, נסה שוב');
      }
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

