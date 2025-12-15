import { useState, useEffect } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import type { Timestamp } from 'firebase/firestore';
import './PromotionVerifyModal.css';

interface PromotionVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  carId: string;
  yardUid?: string; // For yard cars, to read from master collection
}

export default function PromotionVerifyModal({
  isOpen,
  onClose,
  carId,
  yardUid,
}: PromotionVerifyModalProps) {
  const [loading, setLoading] = useState(false);
  const [publicCarData, setPublicCarData] = useState<any>(null);
  const [masterCarData, setMasterCarData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && carId) {
      loadPromotionData();
    } else {
      // Reset on close
      setPublicCarData(null);
      setMasterCarData(null);
      setError(null);
    }
  }, [isOpen, carId, yardUid]);

  const loadPromotionData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Read publicCars document
      const publicCarRef = doc(db, 'publicCars', carId);
      const publicCarDoc = await getDocFromServer(publicCarRef);
      
      if (publicCarDoc.exists()) {
        setPublicCarData(publicCarDoc.data());
      } else {
        setPublicCarData(null);
      }

      // Read master car document if yardUid is provided
      if (yardUid) {
        const masterCarRef = doc(db, 'users', yardUid, 'carSales', carId);
        try {
          const masterCarDoc = await getDocFromServer(masterCarRef);
          if (masterCarDoc.exists()) {
            setMasterCarData(masterCarDoc.data());
          } else {
            setMasterCarData(null);
          }
        } catch (err: any) {
          // Master doc might not exist or be accessible - not critical
          if (import.meta.env.DEV) {
            console.warn('Could not read master car doc:', err);
          }
          setMasterCarData(null);
        }
      }
    } catch (err: any) {
      console.error('Error loading promotion data:', err);
      setError(err.message || 'שגיאה בטעינת נתוני הקידום');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatTimestamp = (ts: Timestamp | any): string => {
    if (!ts) return 'לא קיים';
    try {
      if (ts.toDate) {
        return ts.toDate().toLocaleString('he-IL');
      }
      if (ts.seconds) {
        return new Date(ts.seconds * 1000).toLocaleString('he-IL');
      }
      return String(ts);
    } catch {
      return 'שגיאה';
    }
  };

  const checkConsistency = () => {
    const checks: Array<{ label: string; status: 'ok' | 'warning' | 'error'; message: string }> = [];

    // Check if publicCars has promotion
    if (!publicCarData) {
      checks.push({ label: 'מסמך publicCars', status: 'error', message: 'לא נמצא' });
    } else {
      checks.push({ label: 'מסמך publicCars', status: 'ok', message: 'קיים' });
      
      if (!publicCarData.promotion) {
        checks.push({ label: 'שדה promotion', status: 'warning', message: 'חסר במסמך publicCars' });
      } else {
        checks.push({ label: 'שדה promotion', status: 'ok', message: 'קיים' });
        
        // Check boostUntil
        if (publicCarData.promotion.boostUntil) {
          try {
            const date = publicCarData.promotion.boostUntil.toDate();
            if (date > new Date()) {
              checks.push({ label: 'boostUntil', status: 'ok', message: `פעיל עד ${formatTimestamp(publicCarData.promotion.boostUntil)}` });
            } else {
              checks.push({ label: 'boostUntil', status: 'warning', message: 'פג תוקף' });
            }
          } catch {
            checks.push({ label: 'boostUntil', status: 'error', message: 'פורמט שגוי' });
          }
        }
        
        // Check highlightUntil
        if (publicCarData.promotion.highlightUntil) {
          try {
            const date = publicCarData.promotion.highlightUntil.toDate();
            if (date > new Date()) {
              checks.push({ label: 'highlightUntil', status: 'ok', message: `פעיל עד ${formatTimestamp(publicCarData.promotion.highlightUntil)}` });
            } else {
              checks.push({ label: 'highlightUntil', status: 'warning', message: 'פג תוקף' });
            }
          } catch {
            checks.push({ label: 'highlightUntil', status: 'error', message: 'פורמט שגוי' });
          }
        }
        
        // Check bumpedAt (for BOOST/BUNDLE)
        if (publicCarData.promotion.bumpedAt) {
          checks.push({ label: 'bumpedAt', status: 'ok', message: `קיים: ${formatTimestamp(publicCarData.promotion.bumpedAt)}` });
        } else if (publicCarData.promotion.boostUntil) {
          checks.push({ label: 'bumpedAt', status: 'warning', message: 'חסר (נדרש ל-BOOST)' });
        }
      }
    }

    // Check master car if available
    if (yardUid) {
      if (!masterCarData) {
        checks.push({ label: 'מסמך MASTER', status: 'warning', message: 'לא נמצא או לא נגיש' });
      } else {
        checks.push({ label: 'מסמך MASTER', status: 'ok', message: 'קיים' });
      }
    }

    return checks;
  };

  const consistencyChecks = checkConsistency();

  return (
    <div className="promotion-verify-modal-overlay" onClick={onClose}>
      <div className="promotion-verify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="promotion-verify-modal-header">
          <h2>אימות קידום</h2>
          <button className="promotion-verify-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="promotion-verify-modal-body">
          {loading ? (
            <div className="promotion-verify-loading">טוען נתונים...</div>
          ) : error ? (
            <div className="promotion-verify-error">{error}</div>
          ) : (
            <>
              {/* Consistency Status */}
              <div className="promotion-verify-section">
                <h3>סטטוס עקביות</h3>
                <div className="consistency-checks">
                  {consistencyChecks.map((check, idx) => (
                    <div key={idx} className={`consistency-check ${check.status}`}>
                      <span className="check-icon">
                        {check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌'}
                      </span>
                      <span className="check-label">{check.label}:</span>
                      <span className="check-message">{check.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* publicCars Document */}
              <div className="promotion-verify-section">
                <h3>מסמך publicCars/{carId}</h3>
                {publicCarData ? (
                  <div className="promotion-verify-json">
                    <div className="json-field">
                      <strong>promotion:</strong>
                      <pre>{JSON.stringify(publicCarData.promotion || null, null, 2)}</pre>
                    </div>
                    <div className="json-field">
                      <strong>highlightLevel:</strong>
                      <pre>{JSON.stringify(publicCarData.highlightLevel || null, null, 2)}</pre>
                    </div>
                    <div className="json-field">
                      <strong>updatedAt:</strong>
                      <pre>{formatTimestamp(publicCarData.updatedAt)}</pre>
                    </div>
                    {publicCarData.promotion?.lastPromotionAppliedAt && (
                      <div className="json-field">
                        <strong>lastPromotionAppliedAt:</strong>
                        <pre>{formatTimestamp(publicCarData.promotion.lastPromotionAppliedAt)}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="promotion-verify-error">מסמך לא נמצא</div>
                )}
              </div>

              {/* Master Car Document (if yardUid provided) */}
              {yardUid && (
                <div className="promotion-verify-section">
                  <h3>מסמך MASTER (users/{yardUid}/carSales/{carId})</h3>
                  {masterCarData ? (
                    <div className="promotion-verify-json">
                      <div className="json-field">
                        <strong>promotion:</strong>
                        <pre>{JSON.stringify(masterCarData.promotion || null, null, 2)}</pre>
                      </div>
                      <div className="json-field">
                        <strong>status:</strong>
                        <pre>{JSON.stringify(masterCarData.status || null, null, 2)}</pre>
                      </div>
                      <div className="json-field">
                        <strong>updatedAt:</strong>
                        <pre>{formatTimestamp(masterCarData.updatedAt)}</pre>
                      </div>
                    </div>
                  ) : (
                    <div className="promotion-verify-warning">מסמך לא נמצא או לא נגיש</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="promotion-verify-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
