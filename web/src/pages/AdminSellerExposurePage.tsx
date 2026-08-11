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
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import SellerExposureEditor from '../components/admin/SellerExposureEditor';
import './AdminSellerExposurePage.css';

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
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSellerInfo(null);
    setSelectedUid(null);

    try {
      // Load seller profile from users/{uid}
      const userDocRef = doc(db, 'users', uid.trim());
      const userDoc = await getDocFromServer(userDocRef);

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
      
      setSelectedUid(uid.trim());
    } catch (err: any) {
      console.error('Error loading seller:', err);
      setError(`שגיאה בטעינת מוכר: ${err.message || 'שגיאה לא ידועה'}`);
    } finally {
      setLoading(false);
    }
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

        {/* Seller Info & Exposure Form */}
        {sellerInfo && selectedUid && (
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
              <SellerExposureEditor sellerUid={selectedUid} showTitle={false} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

