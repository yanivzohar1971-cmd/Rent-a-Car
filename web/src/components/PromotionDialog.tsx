import { useState } from 'react';
import { createPromotionOrderDraft } from '../api/promotionApi';
import PromotionSelector from './PromotionSelector';
import type { CarPromotionState } from '../types/Promotion';
import type { PromotionScope } from '../types/Promotion';
import './PromotionDialog.css';

interface PromotionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  scope: PromotionScope;
  carId: string;
  userId: string;
  currentPromotion?: CarPromotionState | null;
  onPromotionApplied?: () => void;
}

export default function PromotionDialog({
  isOpen,
  onClose,
  scope,
  carId,
  userId,
  currentPromotion = null,
  onPromotionApplied,
}: PromotionDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedProductId) {
      setError('נא לבחור חבילת קידום');
      return;
    }

    setIsApplying(true);
    setError(null);
    setSuccess(false);

    try {
      await createPromotionOrderDraft(
        userId,
        carId,
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

  return (
    <div className="promotion-dialog-overlay" onClick={handleClose}>
      <div className="promotion-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="promotion-dialog-header">
          <h2>קידום מודעה</h2>
          <button className="promotion-dialog-close" onClick={handleClose}>
            ×
          </button>
        </div>
        
        <div className="promotion-dialog-body">
          {success ? (
            <div className="promotion-success">
              <p>הקידום יושם בהצלחה!</p>
            </div>
          ) : (
            <>
              <PromotionSelector
                scope={scope}
                carId={carId}
                currentPromotion={currentPromotion}
                onSelectionChange={setSelectedProductId}
                disabled={isApplying}
              />
              
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

