/**
 * CompleteProfilePage - Role selection for users missing profile/role
 * 
 * This page appears when:
 * - User has Firebase Auth but no Firestore /users/{uid} doc
 * - User has doc but primaryRole is null/undefined
 * 
 * Allows user to select role and complete their profile.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFirestoreAsync } from '../firebase/firebaseClientLazy';
import { buildUserProfileForWrite, ensureUserDocExistsOrMerge, type PrimaryRole } from '../services/auth/userProfile';
import type { User as FirebaseUser } from 'firebase/auth';
import './CompleteProfilePage.css';

export default function CompleteProfilePage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<PrimaryRole>('PRIVATE_USER');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already has profile with role (RequireAuthGuard handles unauthenticated)
  if (!loading && firebaseUser && userProfile?.primaryRole && userProfile.primaryRole.trim() !== '') {
    navigate('/account', { replace: true });
    return null;
  }

  if (loading || !firebaseUser) {
    return (
      <div className="complete-profile-page">
        <div className="card">
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const db = await getFirestoreAsync();
      const profilePayload = buildUserProfileForWrite(
        firebaseUser,
        displayName || null,
        phoneNumber || null,
        selectedRole
      );
      
      await ensureUserDocExistsOrMerge(db, firebaseUser.uid, profilePayload);
      
      console.log(`[CompleteProfile] Profile completed: ${firebaseUser.uid}, role=${selectedRole}`);
      
      // Refresh profile and redirect
      window.location.reload(); // Force reload to refresh auth context
    } catch (err: any) {
      console.error('[CompleteProfile] Failed to complete profile:', {
        uid: firebaseUser.uid,
        errorCode: err.code,
        errorMessage: err.message,
      });
      
      setError(
        `שגיאה בשמירת הפרופיל: ${err.message || 'נסה שוב מאוחר יותר'}`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPrivilegedRole = selectedRole === 'AGENT' || selectedRole === 'YARD';

  return (
    <div className="complete-profile-page">
      <div className="card">
        <h2>השלם את הפרופיל שלך</h2>
        <p className="subtitle">
          כדי להמשיך, אנא בחר את סוג המשתמש שלך
        </p>

        <form onSubmit={handleSubmit} className="complete-profile-form">
          <div className="form-group">
            <label>
              שם מלא (אופציונלי)
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="הכנס את שמך המלא"
                dir="rtl"
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              מספר טלפון (אופציונלי)
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="05X-XXXXXXX"
                dir="ltr"
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              סוג משתמש <span className="required">*</span>
            </label>
            <div className="role-selector">
              <label className="role-option">
                <input
                  type="radio"
                  name="role"
                  value="PRIVATE_USER"
                  checked={selectedRole === 'PRIVATE_USER'}
                  onChange={() => setSelectedRole('PRIVATE_USER')}
                />
                <div className="role-option-content">
                  <span className="role-option-title">משתמש פרטי</span>
                  <span className="role-option-desc">קנייה ומכירה פרטית של רכבים</span>
                </div>
              </label>

              <label className="role-option">
                <input
                  type="radio"
                  name="role"
                  value="AGENT"
                  checked={selectedRole === 'AGENT'}
                  onChange={() => setSelectedRole('AGENT')}
                />
                <div className="role-option-content">
                  <span className="role-option-title">סוכן</span>
                  <span className="role-option-desc">סוכן רכב - דורש אישור</span>
                </div>
              </label>

              <label className="role-option">
                <input
                  type="radio"
                  name="role"
                  value="YARD"
                  checked={selectedRole === 'YARD'}
                  onChange={() => setSelectedRole('YARD')}
                />
                <div className="role-option-content">
                  <span className="role-option-title">מגרש רכבים</span>
                  <span className="role-option-desc">מגרש רכבים - דורש אישור</span>
                </div>
              </label>
            </div>

            {isPrivilegedRole && (
              <div className="role-warning">
                <p>
                  <strong>שים לב:</strong> תפקיד זה דורש אישור מנהל.
                  החשבון שלך יהיה פעיל כמשתמש פרטי עד לאישור.
                </p>
              </div>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="primary-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'שומר...' : 'שמור והמשך'}
          </button>
        </form>
      </div>
    </div>
  );
}

