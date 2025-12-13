import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadYardProfile, saveYardProfile, uploadYardLogo, deleteYardLogo, type YardProfileData } from '../api/yardProfileApi';
import { normalizeWebsiteUrl } from '../utils/urlUtils';
import YardPageHeader from '../components/yard/YardPageHeader';
import './YardProfilePage.css';

/**
 * YardProfilePage.tsx - Yard Profile Edit Screen
 * 
 * YARD LOGO UPLOAD FLOW EXPLANATION:
 * 
 * 1. User clicks "העלה לוגו" / "החלף לוגו" button which triggers the hidden file input
 * 2. handleLogoUpload is called with the selected file:
 *    - Sets isUploadingLogo = true (button shows "מעלה...")
 *    - Clears any previous logoUploadError
 *    - Calls uploadYardLogo(file) from yardProfileApi.ts
 * 
 * 3. uploadYardLogo (in yardProfileApi.ts):
 *    - Validates file type (must be image/*) and size (max 5MB)
 *    - Uploads to Firebase Storage at path: users/{uid}/yard/logo.{ext}
 *    - Has 30s timeout protection via Promise.race (prevents infinite hang)
 *    - Gets the download URL from Storage
 *    - Updates Firestore user doc with the new yardLogoUrl
 *    - Returns the download URL
 * 
 * 4. On success:
 *    - Updates local profile state with the new yardLogoUrl
 *    - Calls refreshProfile() to sync AuthContext
 * 
 * 5. On error (catch block):
 *    - Sets logoUploadError to display the error message to user
 *    - Logs full error to console for debugging
 * 
 * 6. Finally block (ALWAYS runs):
 *    - Sets isUploadingLogo = false (button returns to normal state)
 *    - Clears the file input value
 *    - Wrapped in its own try/catch to GUARANTEE isUploadingLogo is reset
 * 
 * PREVENTING "STUCK ON מעלה..." BUG:
 * - uploadYardLogo has a 30s timeout that rejects if upload hangs
 * - finally block uses nested try/catch to ensure setIsUploadingLogo(false) always runs
 * - Even if refreshProfile() or file input reset throws, state is still reset
 * - Save button is disabled during upload to prevent premature form submission
 */

export default function YardProfilePage() {
  const { firebaseUser, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<YardProfileData>({
    displayName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    companyNumber: '',
    vatId: '',
    website: '',
    secondaryPhone: '',
    yardLogoUrl: null,
    yardDescription: null,
    openingHours: null,
    yardLocationLat: null,
    yardLocationLng: null,
    yardMapsUrl: null,
  });

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load profile on mount
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;

      setIsLoading(true);
      setError(null);
      try {
        const loaded = await loadYardProfile();
        if (loaded) {
          setProfile(loaded);
        } else {
          // Initialize with user profile data if no yard profile exists
          setProfile({
            displayName: userProfile?.fullName || '',
            phone: userProfile?.phone || '',
            email: userProfile?.email || '',
            address: '',
            city: '',
            companyNumber: '',
            vatId: '',
            website: '',
            secondaryPhone: '',
            yardLogoUrl: null,
            yardDescription: null,
            openingHours: null,
            yardLocationLat: null,
            yardLocationLng: null,
            yardMapsUrl: null,
          });
        }
      } catch (err: any) {
        console.error('Error loading yard profile:', err);
        setError('שגיאה בטעינת פרטי המגרש');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser, userProfile]);

  const handleSave = async () => {
    if (!firebaseUser) return;

    setIsSaving(true);
    setError(null);

    try {
      // Normalize website URL before saving
      const normalizedProfile = {
        ...profile,
        website: normalizeWebsiteUrl(profile.website) || undefined,
      };
      await saveYardProfile(normalizedProfile);
      await refreshProfile(); // Refresh user profile in context
      setIsEditing(false);
      // Show success message (could be a toast in the future)
      alert('פרטי המגרש נשמרו בהצלחה');
    } catch (err: any) {
      console.error('Error saving yard profile:', err);
      setError('שגיאה בשמירת פרטי המגרש');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reload original data
    loadYardProfile().then((loaded) => {
      if (loaded) {
        setProfile(loaded);
      }
    }).catch(console.error);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log('[YardLogoDebug] handleLogoUpload: No file selected, returning early');
      return;
    }

    console.log('[YardLogoDebug] handleLogoUpload: Starting upload for file:', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    setIsUploadingLogo(true);
    setLogoUploadError(null);
    setError(null);

    try {
      console.log('[YardLogoDebug] handleLogoUpload: Calling uploadYardLogo...');
      const uploadStartTime = Date.now();
      
      const logoUrl = await uploadYardLogo(file);
      
      const uploadDuration = Date.now() - uploadStartTime;
      console.log('[YardLogoDebug] handleLogoUpload: uploadYardLogo resolved in', uploadDuration, 'ms, URL:', logoUrl);
      
      // Update local state with the new logo URL
      setProfile((prevProfile) => ({ ...prevProfile, yardLogoUrl: logoUrl }));
      console.log('[YardLogoDebug] handleLogoUpload: Local profile state updated');
      
      // Refresh AuthContext profile (may throw, but finally block will still run)
      console.log('[YardLogoDebug] handleLogoUpload: Calling refreshProfile...');
      await refreshProfile();
      console.log('[YardLogoDebug] handleLogoUpload: refreshProfile completed');
      
      setLogoUploadError(null); // Clear any previous errors on success
    } catch (err: any) {
      // Log full error details for debugging
      console.error('[YardLogoDebug] handleLogoUpload: Upload threw error:', {
        message: err?.message,
        code: err?.code,
        name: err?.name,
        stack: err?.stack,
      });
      
      // Determine user-friendly error message
      let errorMessage = 'שגיאה בהעלאת הלוגו';
      
      if (err?.message) {
        // Use the message from uploadYardLogo (already in Hebrew for known errors)
        errorMessage = err.message;
      }
      
      // Additional handling for network/offline errors
      if (err?.code === 'storage/retry-limit-exceeded' || 
          err?.name === 'FirebaseError' && err?.message?.includes('network')) {
        errorMessage = 'בעיית רשת. אנא בדוק את החיבור לאינטרנט ונסה שוב.';
      }
      
      console.log('[YardLogoDebug] handleLogoUpload: Setting logoUploadError to:', errorMessage);
      setLogoUploadError(errorMessage);
      // Don't set general error, keep it specific to logo upload
    } finally {
      // CRITICAL: This block MUST reset isUploadingLogo to false, no matter what.
      // Wrap all operations in their own try/catch to guarantee state reset.
      console.log('[YardLogoDebug] handleLogoUpload: Entering finally block');
      
      try {
        // Reset the file input value so the same file can be re-selected if needed
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
          console.log('[YardLogoDebug] handleLogoUpload: File input cleared');
        }
      } catch (finallyErr) {
        // Even if file input reset fails, continue to reset isUploadingLogo
        console.error('[YardLogoDebug] handleLogoUpload: Error in finally block clearing file input:', finallyErr);
      }
      
      // ALWAYS reset isUploadingLogo - this is the critical fix for the "stuck" bug
      setIsUploadingLogo(false);
      console.log('[YardLogoDebug] handleLogoUpload: isUploadingLogo set to false, finally block complete');
    }
  };

  const handleLogoDelete = async () => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הלוגו?')) {
      return;
    }

    setIsUploadingLogo(true);
    setLogoUploadError(null);
    setError(null);

    try {
      await deleteYardLogo();
      setProfile({ ...profile, yardLogoUrl: null });
      await refreshProfile();
      setLogoUploadError(null);
    } catch (err: any) {
      console.error('[YardProfilePage] Error deleting logo:', err);
      setLogoUploadError(err.message || 'שגיאה במחיקת הלוגו');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  if (isLoading) {
    return (
      <div className="yard-profile-page">
        <div className="loading-container">
          <p>טוען פרטי מגרש...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-profile-page">
      <div className="page-container">
        <YardPageHeader
          title="פרטי המגרש"
          actions={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/account')}
            >
              חזרה לאזור האישי
            </button>
          }
        />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!isEditing ? (
          <div className="profile-view">
            <div className="profile-card">
              {/* Logo Section */}
              {profile.yardLogoUrl && (
                <div className="profile-field profile-logo">
                  <label>לוגו המגרש</label>
                  <div className="logo-preview">
                    <img src={profile.yardLogoUrl} alt="Yard Logo" />
                  </div>
                </div>
              )}

              <div className="profile-field">
                <label>שם המגרש</label>
                <p>{profile.displayName || 'לא הוגדר'}</p>
              </div>
              <div className="profile-field">
                <label>דוא״ל</label>
                <p dir="ltr">{profile.email || 'לא הוגדר'}</p>
              </div>
              <div className="profile-field">
                <label>טלפון ראשי</label>
                <p dir="ltr">{profile.phone || 'לא הוגדר'}</p>
              </div>
              {profile.secondaryPhone && (
                <div className="profile-field">
                  <label>טלפון משני</label>
                  <p dir="ltr">{profile.secondaryPhone}</p>
                </div>
              )}
              <div className="profile-field">
                <label>עיר</label>
                <p>{profile.city || 'לא הוגדר'}</p>
              </div>
              <div className="profile-field">
                <label>כתובת</label>
                <p>{profile.address || 'לא הוגדר'}</p>
              </div>
              {profile.companyNumber && (
                <div className="profile-field">
                  <label>ח.פ</label>
                  <p dir="ltr">{profile.companyNumber}</p>
                </div>
              )}
              {profile.vatId && (
                <div className="profile-field">
                  <label>מע״מ</label>
                  <p dir="ltr">{profile.vatId}</p>
                </div>
              )}
              <div className="profile-field">
                <label>אתר אינטרנט</label>
                {profile.website ? (
                  <p dir="ltr">
                    <a 
                      href={profile.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="website-link"
                      dir="ltr"
                      style={{ direction: 'ltr' }}
                    >
                      {profile.website}
                    </a>
                  </p>
                ) : (
                  <p>לא הוגדר</p>
                )}
              </div>
              {profile.yardDescription && (
                <div className="profile-field">
                  <label>תיאור המגרש</label>
                  <p className="multiline-text">{profile.yardDescription}</p>
                </div>
              )}
              {profile.openingHours && (
                <div className="profile-field">
                  <label>שעות פתיחה</label>
                  <p className="multiline-text">{profile.openingHours}</p>
                </div>
              )}
              {(profile.yardLocationLat || profile.yardLocationLng || profile.yardMapsUrl) && (
                <div className="profile-field">
                  <label>מיקום</label>
                  <div className="location-info">
                    {profile.yardLocationLat && profile.yardLocationLng && (
                      <p>קואורדינטות: {profile.yardLocationLat.toFixed(6)}, {profile.yardLocationLng.toFixed(6)}</p>
                    )}
                    {profile.yardMapsUrl && (
                      <p>
                        <a href={profile.yardMapsUrl} target="_blank" rel="noopener noreferrer" dir="ltr">
                          פתח במפות
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="profile-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsEditing(true)}
              >
                עריכה
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    const loaded = await loadYardProfile();
                    if (loaded) {
                      setProfile(loaded);
                    }
                  } catch (err) {
                    setError('שגיאה ברענון הנתונים');
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                רענן מהשרת
              </button>
            </div>
          </div>
        ) : (
          <form
            className="profile-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="form-section">
              <h2 className="section-title">פרטי המגרש</h2>

              {/* Logo Upload */}
              <div className="form-group">
                <label className="form-label">לוגו המגרש</label>
                <div className="logo-upload-section">
                  {profile.yardLogoUrl && (
                    <div className="logo-preview-edit">
                      <img src={profile.yardLogoUrl} alt="Current Logo" />
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={handleLogoDelete}
                        disabled={isUploadingLogo}
                      >
                        מחק לוגו
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={isUploadingLogo}
                    style={{ display: 'none' }}
                    id="logo-upload-input"
                  />
                  <label htmlFor="logo-upload-input" className="btn btn-secondary">
                    {isUploadingLogo ? 'מעלה...' : profile.yardLogoUrl ? 'החלף לוגו' : 'העלה לוגו'}
                  </label>
                  {logoUploadError && (
                    <div className="error-message" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                      {logoUploadError}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">שם המגרש *</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.displayName || ''}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">דוא״ל</label>
                <input
                  type="email"
                  className="form-input"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  dir="ltr"
                />
              </div>

              <div className="form-group">
                <label className="form-label">טלפון ראשי</label>
                <input
                  type="tel"
                  className="form-input"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  dir="ltr"
                />
              </div>

              <div className="form-group">
                <label className="form-label">טלפון משני</label>
                <input
                  type="tel"
                  className="form-input"
                  value={profile.secondaryPhone || ''}
                  onChange={(e) => setProfile({ ...profile, secondaryPhone: e.target.value })}
                  dir="ltr"
                />
              </div>

              <div className="form-group">
                <label className="form-label">עיר</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.city || ''}
                  onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">כתובת</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.address || ''}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">ח.פ</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.companyNumber || ''}
                  onChange={(e) => setProfile({ ...profile, companyNumber: e.target.value })}
                  dir="ltr"
                />
              </div>

              <div className="form-group">
                <label className="form-label">מע״מ</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.vatId || ''}
                  onChange={(e) => setProfile({ ...profile, vatId: e.target.value })}
                  dir="ltr"
                />
              </div>

              <div className="form-group">
                <label className="form-label">אתר אינטרנט</label>
                <input
                  type="url"
                  className="form-input"
                  value={profile.website || ''}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  inputMode="url"
                  placeholder="https://..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">תיאור המגרש</label>
                <textarea
                  className="form-input form-textarea"
                  value={profile.yardDescription || ''}
                  onChange={(e) => setProfile({ ...profile, yardDescription: e.target.value })}
                  rows={4}
                  maxLength={1000}
                  placeholder="תיאור המגרש, שירותים, היסטוריה וכו'..."
                />
                <div className="char-count">
                  {(profile.yardDescription || '').length} / 1000
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">שעות פתיחה</label>
                <textarea
                  className="form-input form-textarea"
                  value={profile.openingHours || ''}
                  onChange={(e) => setProfile({ ...profile, openingHours: e.target.value })}
                  rows={3}
                  placeholder="ראשון-חמישי: 09:00-18:00&#10;שישי: 09:00-13:00&#10;שבת: סגור"
                />
              </div>

              <div className="form-group">
                <label className="form-label">קישור למפות (Google Maps / Waze)</label>
                <input
                  type="url"
                  className="form-input"
                  value={profile.yardMapsUrl || ''}
                  onChange={(e) => setProfile({ ...profile, yardMapsUrl: e.target.value })}
                  dir="ltr"
                  placeholder="https://maps.google.com/..."
                />
              </div>

              <div className="form-group form-group-row">
                <div className="form-group-half">
                  <label className="form-label">קו רוחב (Latitude)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={profile.yardLocationLat || ''}
                    onChange={(e) => setProfile({ ...profile, yardLocationLat: e.target.value ? parseFloat(e.target.value) : null })}
                    dir="ltr"
                    placeholder="31.7683"
                  />
                </div>
                <div className="form-group-half">
                  <label className="form-label">קו אורך (Longitude)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={profile.yardLocationLng || ''}
                    onChange={(e) => setProfile({ ...profile, yardLocationLng: e.target.value ? parseFloat(e.target.value) : null })}
                    dir="ltr"
                    placeholder="35.2137"
                  />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={isSaving || isUploadingLogo}
              >
                ביטול
              </button>
              {/* 
                Save button is disabled when:
                - isSaving is true (form is being saved)
                - isUploadingLogo is true (logo upload in progress)
                This prevents the user from submitting the form while an upload is still pending,
                which could cause the upload to be abandoned or cause a race condition.
              */}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving || isUploadingLogo}
              >
                {isSaving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
