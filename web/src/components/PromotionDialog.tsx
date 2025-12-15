import { useState } from 'react';
import { createPromotionOrderDraft } from '../api/promotionApi';
import PromotionSelector from './PromotionSelector';
import PromotionVerifyModal from './promo/PromotionVerifyModal';
import type { CarPromotionState } from '../types/Promotion';
import type { PromotionScope } from '../types/Promotion';
import { PROMO_PROOF_MODE } from '../config/flags';
import { useAuth } from '../context/AuthContext';
import { getPromotionExpirySummary, getPromotionEffectSummary, getPromotionBadges } from '../utils/promotionLabels';
import type { Timestamp } from 'firebase/firestore';
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
  const { userProfile } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  
  const isProofMode = PROMO_PROOF_MODE && (userProfile?.isYard || userProfile?.isAdmin);

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
      const result = await createPromotionOrderDraft(
        userId,
        carId,
        [{ productId: selectedProductId, quantity: 1 }],
        true // auto-mark as PAID (simulated)
      );
      
      setSuccess(true);
      
      // Build detailed success message
      const isPromotionActive = (until: Timestamp | undefined): boolean => {
        if (!until) return false;
        try {
          const date = until.toDate();
          return date > new Date();
        } catch {
          return false;
        }
      };
      
      // Use current promotion if available, or result promotion
      const appliedPromotion = (result as any)?.promotion || currentPromotion;
      if (appliedPromotion) {
        const expiry = getPromotionExpirySummary(appliedPromotion, isPromotionActive);
        const effect = getPromotionEffectSummary(appliedPromotion, isPromotionActive);
        const badges = getPromotionBadges(appliedPromotion, isPromotionActive);
        
        const successMessage = `הקידום הופעל: ${badges.join(' + ')}\n${expiry}\n${effect}`;
        (window as any).__lastPromotionSuccess = successMessage;
      }
      
      if (onPromotionApplied) {
        onPromotionApplied();
      }
      
      // Close after a longer delay to read message
      setTimeout(() => {
        handleClose();
      }, 3000);
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
              <p style={{ fontWeight: 600, marginBottom: '1rem' }}>הקידום יושם בהצלחה!</p>
              {(window as any).__lastPromotionSuccess && (
                <div style={{ 
                  background: '#f5f5f5', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-line',
                  textAlign: 'right',
                  marginBottom: '1rem'
                }}>
                  {(window as any).__lastPromotionSuccess}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Proof mode: Verify button */}
              {isProofMode && (
                <div style={{ marginBottom: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowVerifyModal(true)}
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  >
                    אימות קידום (Proof Mode)
                  </button>
                </div>
              )}

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

      {/* Promotion Verify Modal (Proof Mode) */}
      {isProofMode && (
        <PromotionVerifyModal
          isOpen={showVerifyModal}
          onClose={() => setShowVerifyModal(false)}
          carId={carId}
          yardUid={scope === 'YARD_CAR' ? undefined : undefined} // Only for yard cars, but we don't have yardUid here
        />
      )}
    </div>
  );
}

