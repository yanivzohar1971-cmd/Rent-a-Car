import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchAllRentalCompanies,
  createRentalCompany,
  updateRentalCompany,
  deleteRentalCompany,
  type RentalCompany,
  type DisplayType,
  type AdPlacement,
  type OutboundPolicy,
  type CreateRentalCompanyInput,
  type UpdateRentalCompanyInput,
} from '../api/rentalCompaniesApi';
import { Timestamp } from 'firebase/firestore';
import LogoDropzone from '../components/admin/LogoDropzone';
import './AdminRentalCompaniesPage.css';

export default function AdminRentalCompaniesPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<RentalCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit/Create modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<RentalCompany | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form state
  const [formNameHe, setFormNameHe] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formWebsiteUrl, setFormWebsiteUrl] = useState('');
  const [formDisplayType, setFormDisplayType] = useState<DisplayType>('NEUTRAL');
  const [formSortOrder, setFormSortOrder] = useState('');
  const [formIsVisible, setFormIsVisible] = useState(true);
  const [formIsFeatured, setFormIsFeatured] = useState(false);
  const [formLogoFile, setFormLogoFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Phase 1: Advertising fields
  const [formPlacements, setFormPlacements] = useState<AdPlacement[]>(['HOME_TOP_STRIP']);
  const [formSlug, setFormSlug] = useState('');
  const [formHeadlineHe, setFormHeadlineHe] = useState('');
  const [formDescriptionHe, setFormDescriptionHe] = useState('');
  const [formSeoKeywordsHe, setFormSeoKeywordsHe] = useState('');
  const [formOutboundPolicy, setFormOutboundPolicy] = useState<OutboundPolicy>('SPONSORED_NOFOLLOW');
  const [formActiveFrom, setFormActiveFrom] = useState('');
  const [formActiveTo, setFormActiveTo] = useState('');
  const [formBudgetMonthlyNis, setFormBudgetMonthlyNis] = useState('');
  const [formIsPaid, setFormIsPaid] = useState(false);
  const [formClickTrackingEnabled, setFormClickTrackingEnabled] = useState(true);

  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  // Load companies
  useEffect(() => {
    if (authLoading || !isAdmin) return;

    async function loadCompanies() {
      setLoading(true);
      setError(null);
      try {
        const companiesList = await fetchAllRentalCompanies();
        setCompanies(companiesList);
      } catch (err: any) {
        console.error('AdminRentalCompaniesPage load error:', err);
        const errorMessage = err?.code === 'permission-denied'
          ? 'אין הרשאה לטעון חברות השכרה. ודא שהמשתמש שלך מסומן כמנהל במערכת.'
          : err?.message || 'אירעה שגיאה בטעינת החברות. נסה שוב מאוחר יותר.';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }

    loadCompanies();
  }, [authLoading, isAdmin]);

  // Open modal for create
  const handleCreateClick = () => {
    setEditingCompany(null);
    setFormNameHe('');
    setFormNameEn('');
    setFormWebsiteUrl('');
    setFormDisplayType('NEUTRAL');
    setFormSortOrder('');
    setFormIsVisible(true);
    setFormIsFeatured(false);
    setFormLogoFile(null);
    setFormError(null);
    // Phase 1: Reset advertising fields
    setFormPlacements(['HOME_TOP_STRIP']);
    setFormSlug('');
    setFormHeadlineHe('');
    setFormDescriptionHe('');
    setFormSeoKeywordsHe('');
    setFormOutboundPolicy('SPONSORED_NOFOLLOW');
    setFormActiveFrom('');
    setFormActiveTo('');
    setFormBudgetMonthlyNis('');
    setFormIsPaid(false);
    setFormClickTrackingEnabled(true);
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleEditClick = (company: RentalCompany) => {
    setEditingCompany(company);
    setFormNameHe(company.nameHe);
    setFormNameEn(company.nameEn || '');
    setFormWebsiteUrl(company.websiteUrl);
    setFormDisplayType(company.displayType);
    setFormSortOrder(company.sortOrder.toString());
    setFormIsVisible(company.isVisible);
    setFormIsFeatured(company.isFeatured);
    setFormLogoFile(null);
    setFormError(null);
    // Phase 1: Load advertising fields
    setFormPlacements(company.placements || ['HOME_TOP_STRIP']);
    setFormSlug(company.slug || '');
    setFormHeadlineHe(company.headlineHe || '');
    setFormDescriptionHe(company.descriptionHe || '');
    setFormSeoKeywordsHe(company.seoKeywordsHe?.join(', ') || '');
    setFormOutboundPolicy(company.outboundPolicy || 'SPONSORED_NOFOLLOW');
    setFormActiveFrom(company.activeFrom?.toDate ? 
      new Date(company.activeFrom.toDate()).toISOString().slice(0, 16) : '');
    setFormActiveTo(company.activeTo?.toDate ? 
      new Date(company.activeTo.toDate()).toISOString().slice(0, 16) : '');
    setFormBudgetMonthlyNis(company.budgetMonthlyNis?.toString() || '');
    setFormIsPaid(company.isPaid || false);
    setFormClickTrackingEnabled(company.clickTrackingEnabled !== undefined ? company.clickTrackingEnabled : 
      (company.displayType === 'SPONSORED'));
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    if (saving || uploading) return;
    setIsModalOpen(false);
    setEditingCompany(null);
    setFormError(null);
  };

  // Generate slug from nameHe (URL-safe)
  const generateSlug = (nameHe: string): string => {
    // Simple transliteration: Hebrew to Latin (minimal)
    // For production, consider a proper transliteration library
    return nameHe
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Spaces to hyphens
      .replace(/-+/g, '-') // Multiple hyphens to single
      .trim();
  };

  // Validate form
  const validateForm = (): string | null => {
    if (!formNameHe.trim()) {
      return 'שם החברה בעברית הוא שדה חובה';
    }
    if (!formWebsiteUrl.trim()) {
      return 'כתובת האתר היא שדה חובה';
    }
    // URL validation - warn if not https
    try {
      const url = new URL(formWebsiteUrl);
      if (url.protocol !== 'https:') {
        // Warning, not error
        console.warn('Website URL should use https://');
      }
    } catch {
      return 'כתובת האתר אינה תקינה';
    }
    if (!editingCompany && !formLogoFile) {
      return 'יש להעלות לוגו בעת יצירת חברה חדשה';
    }
    if (formSortOrder && isNaN(parseInt(formSortOrder))) {
      return 'סדר התצוגה חייב להיות מספר';
    }
    // Phase 1: Validate slug
    if (formSlug.trim()) {
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(formSlug.trim())) {
        return 'הסלאג חייב להכיל רק אותיות קטנות באנגלית, ספרות ומקפים';
      }
    }
    // Phase 1: Validate description length (recommendation, not mandatory)
    if (formDescriptionHe.trim() && formDescriptionHe.trim().length < 120) {
      // Warning only, not blocking
      console.warn('Description should be at least 120 characters for SEO');
    }
    return null;
  };

  // Handle save
  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setSaving(true);
    setUploading(!!formLogoFile);
    setUploadProgress(0);

    try {
      // Phase 1: Prepare advertising fields
      const activeFromTimestamp = formActiveFrom.trim() 
        ? Timestamp.fromDate(new Date(formActiveFrom)) 
        : null;
      const activeToTimestamp = formActiveTo.trim() 
        ? Timestamp.fromDate(new Date(formActiveTo)) 
        : null;
      const seoKeywordsArray = formSeoKeywordsHe.trim()
        ? formSeoKeywordsHe.split(',').map(k => k.trim()).filter(Boolean)
        : undefined;

      if (editingCompany) {
        // Update existing
        const updateData: UpdateRentalCompanyInput = {
          nameHe: formNameHe.trim(),
          nameEn: formNameEn.trim() || undefined,
          websiteUrl: formWebsiteUrl.trim(),
          displayType: formDisplayType,
          sortOrder: formSortOrder ? parseInt(formSortOrder, 10) : undefined,
          isVisible: formIsVisible,
          isFeatured: formIsFeatured,
          // Phase 1: Advertising fields
          placements: formPlacements.length > 0 ? formPlacements : undefined,
          slug: formSlug.trim() || undefined,
          headlineHe: formHeadlineHe.trim() || undefined,
          descriptionHe: formDescriptionHe.trim() || undefined,
          seoKeywordsHe: seoKeywordsArray,
          outboundPolicy: formOutboundPolicy,
          activeFrom: activeFromTimestamp,
          activeTo: activeToTimestamp,
          budgetMonthlyNis: formBudgetMonthlyNis.trim() ? parseFloat(formBudgetMonthlyNis) : undefined,
          isPaid: formIsPaid,
          clickTrackingEnabled: formClickTrackingEnabled,
        };

        await updateRentalCompany(editingCompany.id, updateData, formLogoFile || undefined);
      } else {
        // Create new
        const createData: CreateRentalCompanyInput = {
          nameHe: formNameHe.trim(),
          nameEn: formNameEn.trim() || undefined,
          websiteUrl: formWebsiteUrl.trim(),
          displayType: formDisplayType,
          sortOrder: formSortOrder ? parseInt(formSortOrder, 10) : undefined,
          isVisible: formIsVisible,
          isFeatured: formIsFeatured,
          // Phase 1: Advertising fields
          placements: formPlacements.length > 0 ? formPlacements : ['HOME_TOP_STRIP'],
          slug: formSlug.trim() || undefined,
          headlineHe: formHeadlineHe.trim() || undefined,
          descriptionHe: formDescriptionHe.trim() || undefined,
          seoKeywordsHe: seoKeywordsArray,
          outboundPolicy: formOutboundPolicy,
          activeFrom: activeFromTimestamp,
          activeTo: activeToTimestamp,
          budgetMonthlyNis: formBudgetMonthlyNis.trim() ? parseFloat(formBudgetMonthlyNis) : undefined,
          isPaid: formIsPaid,
          clickTrackingEnabled: formClickTrackingEnabled,
        };

        await createRentalCompany(createData, formLogoFile || undefined);
      }

      // Reload companies
      const companiesList = await fetchAllRentalCompanies();
      setCompanies(companiesList);

      // Close modal
      handleCloseModal();
    } catch (err: any) {
      console.error('Error saving rental company:', err);
      const errorMessage = err?.code === 'permission-denied'
        ? 'אין הרשאה לשמור חברת השכרה. ודא שלמשתמש יש הרשאות מנהל.'
        : err?.message || 'אירעה שגיאה בשמירת החברה.';
      setFormError(errorMessage);
    } finally {
      setSaving(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle delete
  const handleDelete = async (company: RentalCompany) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את ${company.nameHe}?`)) {
      return;
    }

    try {
      setError(null);
      await deleteRentalCompany(company.id);
      
      // Reload companies
      const companiesList = await fetchAllRentalCompanies();
      setCompanies(companiesList);
    } catch (err: any) {
      console.error('Error deleting rental company:', err);
      const errorMessage = err?.message || 'אירעה שגיאה במחיקת החברה.';
      setError(errorMessage);
    }
  };

  // Toggle visibility
  const handleToggleVisibility = async (company: RentalCompany) => {
    try {
      await updateRentalCompany(company.id, {
        isVisible: !company.isVisible,
      });
      
      // Reload companies
      const companiesList = await fetchAllRentalCompanies();
      setCompanies(companiesList);
    } catch (err: any) {
      console.error('Error toggling visibility:', err);
      setError('אירעה שגיאה בעדכון הנראות.');
    }
  };

  if (authLoading) {
    return (
      <div className="admin-rental-companies-page">
        <div className="page-container">
          <div className="loading-state">
            <p>בודק הרשאות...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="admin-rental-companies-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">ניהול חברות השכרה</h1>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateClick}
          >
            הוסף חברה חדשה
          </button>
        </div>

        {error && (
          <div className="error-state">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <p>טוען חברות...</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="empty-state">
            <p>לא נמצאו חברות השכרה. צור חברה חדשה כדי להתחיל.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="rental-companies-table">
              <thead>
                <tr>
                  <th>לוגו</th>
                  <th>שם (עברית)</th>
                  <th>כתובת אתר</th>
                  <th>סוג תצוגה</th>
                  <th>נראה</th>
                  <th>מומלץ</th>
                  <th>מיקומים</th>
                  <th>חלון פעיל</th>
                  <th>סדר</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      {company.logoUrl ? (
                        <img
                          src={company.logoUrl + (typeof company.logoVersion === 'number' && isFinite(company.logoVersion) ? `?v=${company.logoVersion}` : '')}
                          alt={company.logoAlt || company.nameHe}
                          className="company-logo-preview"
                        />
                      ) : (
                        <span className="no-logo">—</span>
                      )}
                    </td>
                    <td>
                      <strong>{company.nameHe}</strong>
                      {company.nameEn && (
                        <div className="company-name-en">{company.nameEn}</div>
                      )}
                    </td>
                    <td>
                      <a
                        href={company.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="website-link"
                      >
                        {company.websiteUrl}
                      </a>
                    </td>
                    <td>
                      <span className={`display-type-badge display-type-${company.displayType.toLowerCase()}`}>
                        {company.displayType === 'FEATURED' ? 'מומלץ' : 
                         company.displayType === 'SPONSORED' ? 'ספונסר' : 'רגיל'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`toggle-btn ${company.isVisible ? 'active' : ''}`}
                        onClick={() => handleToggleVisibility(company)}
                        title={company.isVisible ? 'הסתר' : 'הצג'}
                      >
                        {company.isVisible ? '✓' : '✕'}
                      </button>
                      {!company.isVisible && (
                        <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                          מוסתר: לא יופיע ב-sitemap, noindex
                        </div>
                      )}
                    </td>
                    <td>
                      {company.isFeatured ? '✓' : '—'}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        {company.placements && company.placements.length > 0 ? (
                          company.placements.map(p => (
                            <span key={p} style={{ 
                              display: 'inline-block', 
                              marginLeft: '0.25rem',
                              padding: '0.125rem 0.375rem',
                              background: '#e3f2fd',
                              borderRadius: '3px',
                              fontSize: '0.75rem'
                            }}>
                              {p === 'HOME_TOP_STRIP' ? 'בית' : p === 'CARS_SEARCH_TOP_STRIP' ? 'חיפוש' : p}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#999' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {company.activeFrom || company.activeTo ? (
                        <div style={{ fontSize: '0.85rem' }}>
                          {company.activeFrom && (
                            <div>
                              מ: {company.activeFrom.toDate ? 
                                new Date(company.activeFrom.toDate()).toLocaleDateString('he-IL') :
                                '—'}
                            </div>
                          )}
                          {company.activeTo && (
                            <div>
                              עד: {company.activeTo.toDate ? 
                                new Date(company.activeTo.toDate()).toLocaleDateString('he-IL') :
                                '—'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#999' }}>תמיד</span>
                      )}
                    </td>
                    <td>{company.sortOrder}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => handleEditClick(company)}
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(company)}
                        >
                          מחיקה
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCompany ? 'עריכת חברת השכרה' : 'יצירת חברת השכרה חדשה'}</h2>
              <button
                type="button"
                className="close-btn"
                onClick={handleCloseModal}
                disabled={saving || uploading}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="modal-error-banner">
                {formError}
              </div>
            )}

            <div className="modal-body">
              <div className="form-group">
                <label>
                  שם החברה (עברית) <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={formNameHe}
                  onChange={(e) => setFormNameHe(e.target.value)}
                  className="form-control"
                  required
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>שם החברה (אנגלית)</label>
                <input
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  className="form-control"
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>
                  כתובת אתר <span className="required">*</span>
                </label>
                <input
                  type="url"
                  value={formWebsiteUrl}
                  onChange={(e) => setFormWebsiteUrl(e.target.value)}
                  className="form-control"
                  placeholder="https://example.com"
                  required
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>סוג תצוגה</label>
                <select
                  value={formDisplayType}
                  onChange={(e) => setFormDisplayType(e.target.value as DisplayType)}
                  className="form-control"
                  disabled={saving || uploading}
                >
                  <option value="NEUTRAL">רגיל</option>
                  <option value="FEATURED">מומלץ</option>
                  <option value="SPONSORED">ספונסר</option>
                </select>
              </div>

              <div className="form-group">
                <label>סדר תצוגה</label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(e.target.value)}
                  className="form-control"
                  placeholder="אוטומטי"
                  disabled={saving || uploading}
                />
                <small className="form-hint">מספר נמוך יותר = מופיע קודם</small>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formIsVisible}
                    onChange={(e) => setFormIsVisible(e.target.checked)}
                    disabled={saving || uploading}
                  />
                  {' '}נראה לציבור
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formIsFeatured}
                    onChange={(e) => setFormIsFeatured(e.target.checked)}
                    disabled={saving || uploading}
                  />
                  {' '}מומלץ
                </label>
              </div>

              {/* Phase 1: Advertising fields */}
              <div className="form-group">
                <label>מיקומי פרסום</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={formPlacements.includes('HOME_TOP_STRIP')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormPlacements([...formPlacements, 'HOME_TOP_STRIP']);
                        } else {
                          setFormPlacements(formPlacements.filter(p => p !== 'HOME_TOP_STRIP'));
                        }
                      }}
                      disabled={saving || uploading}
                    />
                    עמוד הבית (פס עליון)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={formPlacements.includes('CARS_SEARCH_TOP_STRIP')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormPlacements([...formPlacements, 'CARS_SEARCH_TOP_STRIP']);
                        } else {
                          setFormPlacements(formPlacements.filter(p => p !== 'CARS_SEARCH_TOP_STRIP'));
                        }
                      }}
                      disabled={saving || uploading}
                    />
                    עמוד חיפוש רכבים (פס עליון)
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>סלאג (URL) - לעמוד שותף</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  className="form-control"
                  placeholder={generateSlug(formNameHe) || 'לדוגמה: partner-name'}
                  disabled={saving || uploading}
                />
                <small className="form-hint">
                  רק אותיות קטנות באנגלית, ספרות ומקפים. אם ריק, לא יהיה עמוד שותף.
                  {formNameHe && (
                    <button
                      type="button"
                      onClick={() => setFormSlug(generateSlug(formNameHe))}
                      style={{ marginRight: '0.5rem', fontSize: '0.85rem' }}
                    >
                      הצע אוטומטי
                    </button>
                  )}
                </small>
                {formSlug.trim() && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    padding: '0.5rem', 
                    background: '#f5f5f5', 
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: '#666'
                  }}>
                    Landing page: <code style={{ color: '#2196f3' }}>/partner/{formSlug.trim()}</code>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>כותרת (עברית) - לעמוד שותף</label>
                <input
                  type="text"
                  value={formHeadlineHe}
                  onChange={(e) => setFormHeadlineHe(e.target.value)}
                  className="form-control"
                  placeholder={formNameHe || 'כותרת קצרה'}
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>תיאור (עברית) - תוכן SEO</label>
                <textarea
                  value={formDescriptionHe}
                  onChange={(e) => setFormDescriptionHe(e.target.value)}
                  className="form-control"
                  rows={4}
                  placeholder="תיאור מפורט של החברה (מומלץ לפחות 120 תווים)"
                  disabled={saving || uploading}
                />
                <small className="form-hint">
                  {formDescriptionHe.length > 0 && formDescriptionHe.length < 120 && (
                    <span style={{ color: '#ff9800' }}>
                      מומלץ לפחות 120 תווים ({formDescriptionHe.length} תווים)
                    </span>
                  )}
                  {formDescriptionHe.length >= 120 && (
                    <span style={{ color: '#4caf50' }}>
                      {formDescriptionHe.length} תווים
                    </span>
                  )}
                </small>
              </div>

              <div className="form-group">
                <label>מילות מפתח SEO (מופרדות בפסיקים)</label>
                <input
                  type="text"
                  value={formSeoKeywordsHe}
                  onChange={(e) => setFormSeoKeywordsHe(e.target.value)}
                  className="form-control"
                  placeholder="לדוגמה: השכרת רכב, רכב להשכרה"
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>מדיניות קישורים חיצוניים</label>
                <select
                  value={formOutboundPolicy}
                  onChange={(e) => setFormOutboundPolicy(e.target.value as OutboundPolicy)}
                  className="form-control"
                  disabled={saving || uploading}
                >
                  <option value="SPONSORED_NOFOLLOW">Sponsored + Nofollow (מומלץ לפרסומות)</option>
                  <option value="NOFOLLOW">Nofollow בלבד</option>
                  <option value="FOLLOW">Follow (לא מומלץ לפרסומות)</option>
                </select>
              </div>

              <div className="form-group">
                <label>תאריך התחלה (אופציונלי)</label>
                <input
                  type="datetime-local"
                  value={formActiveFrom}
                  onChange={(e) => setFormActiveFrom(e.target.value)}
                  className="form-control"
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>תאריך סיום (אופציונלי)</label>
                <input
                  type="datetime-local"
                  value={formActiveTo}
                  onChange={(e) => setFormActiveTo(e.target.value)}
                  className="form-control"
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>תקציב חודשי (ש"ח) - למעקב פנימי</label>
                <input
                  type="number"
                  value={formBudgetMonthlyNis}
                  onChange={(e) => setFormBudgetMonthlyNis(e.target.value)}
                  className="form-control"
                  placeholder="אופציונלי"
                  min="0"
                  disabled={saving || uploading}
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formIsPaid}
                    onChange={(e) => setFormIsPaid(e.target.checked)}
                    disabled={saving || uploading}
                  />
                  {' '}פרסומת בתשלום (למעקב פנימי)
                </label>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formClickTrackingEnabled}
                    onChange={(e) => setFormClickTrackingEnabled(e.target.checked)}
                    disabled={saving || uploading}
                  />
                  {' '}מעקב קליקים
                </label>
                <small className="form-hint">
                  מעקב קליקים מופעל אוטומטית לפרסומות מסוג SPONSORED
                </small>
              </div>

              <div className="form-group">
                <label>
                  לוגו {!editingCompany && <span className="required">*</span>}
                </label>
                <LogoDropzone
                  currentLogoUrl={editingCompany?.logoUrl}
                  onFileSelect={(file) => {
                    setFormLogoFile(file);
                    setFormError(null);
                  }}
                  disabled={saving || uploading}
                  error={formError && !formLogoFile && !editingCompany ? 'יש להעלות לוגו' : null}
                />
              </div>

              {uploading && (
                <div className="upload-progress">
                  <div className="upload-progress-bar">
                    <div 
                      className="upload-progress-fill" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p>מעלה לוגו... {uploadProgress}%</p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseModal}
                disabled={saving || uploading}
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || uploading}
              >
                {saving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
