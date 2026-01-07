/**
 * Admin Seller Exposure Management Page
 * 
 * Allows admin to control what each seller (yard/agent) exposes publicly:
 * - Show seller name in badge
 * - Show seller logo
 * - Show seller phone
 * - Show seller WhatsApp
 * - Show city/address
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import './AdminSellerExposurePage.css';

interface AdminSellerExposure {
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

interface SellerInfo {
  uid: string;
  displayName: string | null;
  email: string | null;
  sellerType: 'YARD' | 'AGENT' | 'UNKNOWN';
}

export default function AdminSellerExposurePage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [searchUid, setSearchUid] = useState('');
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [exposure, setExposure] = useState<AdminSellerExposure | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin (wait for auth to load first)
  useEffect(() => {
    if (authLoading) return; // Wait for auth/profile to load
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  // Load seller info and exposure flags
  const loadSeller = async (uid: string) => {
    if (!uid || uid.trim() === '') {
      setError('נא להזין UID של מוכר');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setSellerInfo(null);
    setExposure(null);

    try {
      // Load seller profile from users/{uid}
      const userDocRef = doc(db, 'users', uid.trim());
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setError('מוכר לא נמצא');
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const displayName = userData.displayName || userData.fullName || userData.yardName || null;
      const email = userData.email || null;
      
      // Determine seller type
      let sellerType: 'YARD' | 'AGENT' | 'UNKNOWN' = 'UNKNOWN';
      if (userData.isYard === true || userData.primaryRole === 'YARD') {
        sellerType = 'YARD';
      } else if (userData.isAgent === true || userData.primaryRole === 'AGENT') {
        sellerType = 'AGENT';
      }

      setSellerInfo({
        uid: uid.trim(),
        displayName,
        email,
        sellerType,
      });

      // Load admin exposure flags
      const exposureDocRef = doc(db, 'adminSellerExposure', uid.trim());
      const exposureDoc = await getDoc(exposureDocRef);

      if (exposureDoc.exists()) {
        const exposureData = exposureDoc.data();
        setExposure({
          sellerUid: uid.trim(),
          sellerType: exposureData.sellerType || (sellerType !== 'UNKNOWN' ? sellerType : undefined),
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
          sellerUid: uid.trim(),
          sellerType: sellerType !== 'UNKNOWN' ? sellerType : undefined,
          showNameInBadge: true,
          showLogo: true,
          showPhone: true,
          showWhatsapp: true,
          showCity: true,
          showAddress: false,
        });
      }
    } catch (err: any) {
      console.error('Error loading seller:', err);
      setError(`שגיאה בטעינת מוכר: ${err.message || 'שגיאה לא ידועה'}`);
    } finally {
      setLoading(false);
    }
  };

  // Save exposure flags
  const saveExposure = async () => {
    if (!exposure || !sellerInfo) {
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
        sellerType: exposure.sellerType || sellerInfo.sellerType !== 'UNKNOWN' ? sellerInfo.sellerType : undefined,
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
      await loadSeller(exposure.sellerUid);
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

  if (authLoading) {
    return (
      <div className="admin-seller-exposure-page">
        <div className="page-container">
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-seller-exposure-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">ניהול חשיפת מוכרים</h1>
          <p className="page-subtitle">בקרת מה שכל מוכר מציג בפומבי: שם, לוגו, טלפון, וואטסאפ</p>
        </div>

        {/* Search Section */}
        <div className="search-section">
          <div className="search-input-group">
            <label htmlFor="seller-uid">UID של מוכר:</label>
            <input
              id="seller-uid"
              type="text"
              value={searchUid}
              onChange={(e) => setSearchUid(e.target.value)}
              placeholder="הזן UID של מגרש או סוכן"
              dir="ltr"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadSeller(searchUid);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => loadSeller(searchUid)}
              disabled={loading || !searchUid.trim()}
            >
              {loading ? 'טוען...' : 'טען מוכר'}
            </button>
          </div>
        </div>

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

        {/* Seller Info & Exposure Form */}
        {sellerInfo && exposure && (
          <div className="exposure-form-section">
            <div className="seller-info-card">
              <h3>פרטי מוכר</h3>
              <div className="seller-info-row">
                <span className="info-label">UID:</span>
                <span className="info-value" dir="ltr">{sellerInfo.uid}</span>
              </div>
              {sellerInfo.displayName && (
                <div className="seller-info-row">
                  <span className="info-label">שם:</span>
                  <span className="info-value">{sellerInfo.displayName}</span>
                </div>
              )}
              {sellerInfo.email && (
                <div className="seller-info-row">
                  <span className="info-label">אימייל:</span>
                  <span className="info-value" dir="ltr">{sellerInfo.email}</span>
                </div>
              )}
              <div className="seller-info-row">
                <span className="info-label">סוג:</span>
                <span className="info-value">
                  {sellerInfo.sellerType === 'YARD' ? 'מגרש' : 
                   sellerInfo.sellerType === 'AGENT' ? 'סוכן' : 
                   'לא ידוע'}
                </span>
              </div>
            </div>

            <div className="exposure-flags-card">
              <h3>הגדרות חשיפה</h3>
              
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
          </div>
        )}
      </div>
    </div>
  );
}

