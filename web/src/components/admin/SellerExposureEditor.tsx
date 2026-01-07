/**
 * Seller Exposure Editor Component
 * 
 * Reusable component for editing adminSellerExposure/{sellerUid} flags.
 * Used by AdminSellerExposurePage and AdminCustomersPage modal.
 */

import { useEffect, useState } from 'react';
import { doc, getDocFromServer, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import './SellerExposureEditor.css';

export interface AdminSellerExposure {
  sellerUid: string;
  sellerType?: 'YARD' | 'AGENT';
  showNameInBadge?: boolean;
  showLogo?: boolean;
  showPhone?: boolean;
  showWhatsapp?: boolean;
  showCity?: boolean;
  showAddress?: boolean;
  updatedAt?: Timestamp;
}

interface SellerExposureEditorProps {
  sellerUid: string;
  onSave?: () => void;
  showTitle?: boolean;
}

export default function SellerExposureEditor({ sellerUid, onSave, showTitle = true }: SellerExposureEditorProps) {
  const [exposure, setExposure] = useState<AdminSellerExposure | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load exposure flags
  useEffect(() => {
    if (!sellerUid) {
      setLoading(false);
      return;
    }

    async function loadExposure() {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const exposureDocRef = doc(db, 'adminSellerExposure', sellerUid);
        const exposureDoc = await getDocFromServer(exposureDocRef);

        if (exposureDoc.exists()) {
          const exposureData = exposureDoc.data();
          setExposure({
            sellerUid,
            sellerType: exposureData.sellerType || undefined,
            showNameInBadge: exposureData.showNameInBadge !== undefined ? exposureData.showNameInBadge : true,
            showLogo: exposureData.showLogo !== undefined ? exposureData.showLogo : true,
            showPhone: exposureData.showPhone !== undefined ? exposureData.showPhone : true,
            showWhatsapp: exposureData.showWhatsapp !== undefined ? exposureData.showWhatsapp : true,
            showCity: exposureData.showCity !== undefined ? exposureData.showCity : true,
            showAddress: exposureData.showAddress !== undefined ? exposureData.showAddress : false,
            updatedAt: exposureData.updatedAt || undefined,
          });
        } else {
          // Default values (missing doc => defaults)
          setExposure({
            sellerUid,
            showNameInBadge: true,
            showLogo: true,
            showPhone: true,
            showWhatsapp: true,
            showCity: true,
            showAddress: false,
          });
        }
      } catch (err: any) {
        console.error('Error loading seller exposure:', err);
        setError(`שגיאה בטעינת הגדרות חשיפה: ${err.message || 'שגיאה לא ידועה'}`);
      } finally {
        setLoading(false);
      }
    }

    loadExposure();
  }, [sellerUid]);

  // Save exposure flags
  const saveExposure = async () => {
    if (!exposure) {
      setError('אין נתונים לשמירה');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const exposureDocRef = doc(db, 'adminSellerExposure', exposure.sellerUid);
      await setDoc(exposureDocRef, {
        sellerUid: exposure.sellerUid,
        sellerType: exposure.sellerType || undefined,
        showNameInBadge: exposure.showNameInBadge,
        showLogo: exposure.showLogo,
        showPhone: exposure.showPhone,
        showWhatsapp: exposure.showWhatsapp,
        showCity: exposure.showCity,
        showAddress: exposure.showAddress,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      setSuccess('הגדרות החשיפה נשמרו בהצלחה');
      
      // Reload to show updated timestamp
      const exposureDoc = await getDocFromServer(exposureDocRef);
      if (exposureDoc.exists()) {
        const exposureData = exposureDoc.data();
        setExposure({
          ...exposure,
          updatedAt: exposureData.updatedAt || undefined,
        });
      }

      // Call optional onSave callback
      if (onSave) {
        onSave();
      }
    } catch (err: any) {
      console.error('Error saving exposure:', err);
      setError(`שגיאה בשמירה: ${err.message || 'שגיאה לא ידועה'}`);
    } finally {
      setSaving(false);
    }
  };

  // Quick presets
  const applyPreset = (preset: 'showAll' | 'hideName' | 'hideLogo' | 'hidePhone' | 'hideWhatsapp') => {
    if (!exposure) return;

    const updated = { ...exposure };

    switch (preset) {
      case 'showAll':
        updated.showNameInBadge = true;
        updated.showLogo = true;
        updated.showPhone = true;
        updated.showWhatsapp = true;
        updated.showCity = true;
        updated.showAddress = false; // Address default false
        break;
      case 'hideName':
        updated.showNameInBadge = false;
        break;
      case 'hideLogo':
        updated.showLogo = false;
        break;
      case 'hidePhone':
        updated.showPhone = false;
        break;
      case 'hideWhatsapp':
        updated.showWhatsapp = false;
        break;
    }

    setExposure(updated);
  };

  if (loading) {
    return (
      <div className="seller-exposure-editor">
        <div className="loading-state">
          <p>טוען הגדרות חשיפה...</p>
        </div>
      </div>
    );
  }

  if (!exposure) {
    return (
      <div className="seller-exposure-editor">
        <div className="error-state">
          <p>לא ניתן לטעון הגדרות חשיפה</p>
        </div>
      </div>
    );
  }

  return (
    <div className="seller-exposure-editor">
      {showTitle && <h3>הגדרות חשיפה</h3>}
      
      {/* Error/Success Messages */}
      {error && (
        <div className="error-state">
          <p>{error}</p>
          <button type="button" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {success && (
        <div className="success-state">
          <p>{success}</p>
          <button type="button" onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}

      {/* Quick Presets */}
      <div className="presets-section">
        <label>הגדרות מהירות:</label>
        <div className="presets-buttons">
          <button
            type="button"
            className="btn btn-secondary preset-btn"
            onClick={() => applyPreset('showAll')}
          >
            הצג הכל
          </button>
          <button
            type="button"
            className="btn btn-secondary preset-btn"
            onClick={() => applyPreset('hideName')}
          >
            הסתר שם
          </button>
          <button
            type="button"
            className="btn btn-secondary preset-btn"
            onClick={() => applyPreset('hideLogo')}
          >
            הסתר לוגו
          </button>
          <button
            type="button"
            className="btn btn-secondary preset-btn"
            onClick={() => applyPreset('hidePhone')}
          >
            הסתר טלפון
          </button>
          <button
            type="button"
            className="btn btn-secondary preset-btn"
            onClick={() => applyPreset('hideWhatsapp')}
          >
            הסתר וואטסאפ
          </button>
        </div>
      </div>

      {/* Exposure Flags */}
      <div className="flags-section">
        <div className="flag-row">
          <label>
            <input
              type="checkbox"
              checked={exposure.showNameInBadge !== false}
              onChange={(e) => setExposure({ ...exposure, showNameInBadge: e.target.checked })}
            />
            <span>הצג שם בתג (Badge)</span>
          </label>
          <span className="flag-description">הצגת שם המוכר בתגית על כרטיסי רכבים</span>
        </div>

        <div className="flag-row">
          <label>
            <input
              type="checkbox"
              checked={exposure.showLogo !== false}
              onChange={(e) => setExposure({ ...exposure, showLogo: e.target.checked })}
            />
            <span>הצג לוגו</span>
          </label>
          <span className="flag-description">הצגת לוגו המוכר בכרטיס המוכר</span>
        </div>

        <div className="flag-row">
          <label>
            <input
              type="checkbox"
              checked={exposure.showPhone !== false}
              onChange={(e) => setExposure({ ...exposure, showPhone: e.target.checked })}
            />
            <span>הצג טלפון</span>
          </label>
          <span className="flag-description">הצגת כפתור התקשר בכרטיס המוכר</span>
        </div>

        <div className="flag-row">
          <label>
            <input
              type="checkbox"
              checked={exposure.showWhatsapp !== false}
              onChange={(e) => setExposure({ ...exposure, showWhatsapp: e.target.checked })}
            />
            <span>הצג וואטסאפ</span>
          </label>
          <span className="flag-description">הצגת כפתור וואטסאפ בכרטיס המוכר</span>
        </div>

        <div className="flag-row">
          <label>
            <input
              type="checkbox"
              checked={exposure.showCity !== false}
              onChange={(e) => setExposure({ ...exposure, showCity: e.target.checked })}
            />
            <span>הצג עיר</span>
          </label>
          <span className="flag-description">הצגת עיר המוכר בכרטיס המוכר</span>
        </div>

        <div className="flag-row">
          <label>
            <input
              type="checkbox"
              checked={exposure.showAddress === true}
              onChange={(e) => setExposure({ ...exposure, showAddress: e.target.checked })}
            />
            <span>הצג כתובת</span>
          </label>
          <span className="flag-description">הצגת כתובת המוכר בכרטיס המוכר (ברירת מחדל: מוסתר)</span>
        </div>
      </div>

      {/* Save Button */}
      <div className="save-section">
        <button
          type="button"
          className="btn btn-primary save-btn"
          onClick={saveExposure}
          disabled={saving}
        >
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </button>
        {exposure.updatedAt && (
          <p className="last-updated">
            עודכן לאחרונה: {exposure.updatedAt.toDate().toLocaleString('he-IL')}
          </p>
        )}
      </div>
    </div>
  );
}

