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
  type CreateRentalCompanyInput,
  type UpdateRentalCompanyInput,
} from '../api/rentalCompaniesApi';
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
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    if (saving || uploading) return;
    setIsModalOpen(false);
    setEditingCompany(null);
    setFormError(null);
  };

  // Validate form
  const validateForm = (): string | null => {
    if (!formNameHe.trim()) {
      return 'שם החברה בעברית הוא שדה חובה';
    }
    if (!formWebsiteUrl.trim()) {
      return 'כתובת האתר היא שדה חובה';
    }
    // Basic URL validation
    try {
      new URL(formWebsiteUrl);
    } catch {
      return 'כתובת האתר אינה תקינה';
    }
    if (!editingCompany && !formLogoFile) {
      return 'יש להעלות לוגו בעת יצירת חברה חדשה';
    }
    if (formSortOrder && isNaN(parseInt(formSortOrder))) {
      return 'סדר התצוגה חייב להיות מספר';
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
                    </td>
                    <td>
                      {company.isFeatured ? '✓' : '—'}
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
