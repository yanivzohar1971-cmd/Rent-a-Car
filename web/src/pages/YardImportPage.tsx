import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchYardImportJobs,
  loadImportJob,
  observeImportJob,
  loadImportPreviewRows,
  commitImportJob,
  createImportJob,
  type YardImportJob,
  type YardImportPreviewRow,
} from '../api/yardImportApi';
import YardPageHeader from '../components/yard/YardPageHeader';
import './YardImportPage.css';

export default function YardImportPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<YardImportJob[]>([]);
  const [activeJob, setActiveJob] = useState<YardImportJob | null>(null);
  const [previewRows, setPreviewRows] = useState<YardImportPreviewRow[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [missingCarsMode, setMissingCarsMode] = useState<'IMPORT_REMOVED' | 'SOLD_DELETE'>('IMPORT_REMOVED');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load jobs on mount
  useEffect(() => {
    async function load() {
      if (!firebaseUser) {
        console.warn('[YardImportPage] No firebaseUser, skipping job load');
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        console.log('[YardImportPage] Loading import jobs for user:', firebaseUser.uid);
        const loadedJobs = await fetchYardImportJobs(20);
        console.log('[YardImportPage] Loaded jobs:', loadedJobs.length);
        setJobs(loadedJobs);
        
        // Find active/incomplete job
        const incomplete = loadedJobs.find(
          (job) => 
            job.status !== 'COMMITTED' && 
            job.status !== 'FAILED'
        );
        if (incomplete) {
          console.log('[YardImportPage] Found incomplete job:', incomplete.id);
          setActiveJob(incomplete);
          setSelectedJobId(incomplete.id);
          await loadJobDetails(incomplete.id);
        }
      } catch (err: any) {
        console.error('[YardImportPage] Error loading import jobs:', {
          error: err,
          code: err?.code,
          message: err?.message,
        });
        // Don't show error for empty history - that's normal
        if (err?.code !== 'permission-denied' && err?.code !== 'not-found') {
          setError('שגיאה בטעינת פעולות יבוא');
        }
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

  // Observe active job for real-time updates
  useEffect(() => {
    if (!firebaseUser || !activeJob?.jobId) {
      console.log('[YardImportPage] Skipping job observation:', { firebaseUser: !!firebaseUser, activeJob: !!activeJob, jobId: activeJob?.jobId });
      return;
    }

    console.log('[YardImportPage] Starting to observe job:', activeJob.jobId);
    const unsubscribe = observeImportJob(firebaseUser.uid, activeJob.jobId, (updatedJob) => {
      console.log('[YardImportPage] Job status updated:', {
        jobId: updatedJob.id,
        status: updatedJob.status,
        rowsTotal: updatedJob.summary?.rowsTotal,
      });
      
      setActiveJob(updatedJob);
      
      // Update in jobs list
      setJobs((prev) =>
        prev.map((job) => (job.id === updatedJob.id ? updatedJob : job))
      );

      // Load preview when status becomes PREVIEW_READY
      if (updatedJob.status === 'PREVIEW_READY' && previewRows.length === 0) {
        console.log('[YardImportPage] Status is PREVIEW_READY, loading preview rows');
        loadJobDetails(updatedJob.id);
      }
    });

    return () => {
      console.log('[YardImportPage] Unsubscribing from job observation:', activeJob.jobId);
      unsubscribe();
    };
  }, [firebaseUser, activeJob?.jobId]);

  // Show success/failure messages when job status changes
  const lastStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeJob) return;

    // Only show alert once per status transition
    if (activeJob.status === 'COMMITTED' && lastStatusRef.current !== 'COMMITTED') {
      lastStatusRef.current = 'COMMITTED';
      // Simple KISS feedback
      window.alert('ייבוא הושלם בהצלחה');
    } else if (activeJob.status === 'FAILED' && lastStatusRef.current !== 'FAILED') {
      lastStatusRef.current = 'FAILED';
      const errorMsg = activeJob.error?.message || 'ייבוא נכשל. אנא בדוק את השגיאות ונסה שוב.';
      window.alert(errorMsg);
    } else if (activeJob.status !== lastStatusRef.current) {
      // Update ref when status changes (but don't show alert for intermediate statuses)
      lastStatusRef.current = activeJob.status;
    }
  }, [activeJob?.status]);

  const loadJobDetails = async (jobId: string) => {
    if (!firebaseUser) return;

    setIsLoadingPreview(true);
    try {
      const job = await loadImportJob(firebaseUser.uid, jobId);
      if (job) {
        setActiveJob(job);
        
        if (job.status === 'PREVIEW_READY') {
          const rows = await loadImportPreviewRows(firebaseUser.uid, job.jobId);
          setPreviewRows(rows);
        }
      }
    } catch (err: any) {
      console.error('Error loading job details:', err);
      setError('שגיאה בטעינת פרטי העבודה');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) {
      console.warn('[YardImportPage] No file selected or user not authenticated');
      return;
    }

    // Validate file type
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));
    
    if (!isValid) {
      const errorMsg = 'קובץ לא תקין. יש לבחור קובץ Excel (.xlsx, .xls) או CSV';
      console.error('[YardImportPage] Invalid file type:', fileName);
      setError(errorMsg);
      return;
    }

    console.log('[YardImportPage] Starting file upload (KISS, no progress bar):', {
      fileName: file.name,
      fileSize: file.size,
      yardUid: firebaseUser.uid,
    });

    setIsUploading(true);
    setError(null);

    try {
      const { jobId } = await createImportJob(file); // no progress callback
      console.log('[YardImportPage] Upload completed, loading job:', jobId);

      // Load the new job
      const newJob = await loadImportJob(firebaseUser.uid, jobId);
      if (newJob) {
        console.log('[YardImportPage] Job loaded successfully:', {
          id: newJob.id,
          jobId: newJob.jobId,
          status: newJob.status,
          storagePath: newJob.source?.storagePath,
        });
        setActiveJob(newJob);
        setSelectedJobId(newJob.id);
        setJobs((prev) => [newJob, ...prev]);

        // Storage trigger will process the file automatically, and observeImportJob will update the status.
        // The useEffect hook will start observing this job automatically when activeJob changes.
      } else {
        console.warn('[YardImportPage] Job not found after upload:', jobId);
        setError('העבודה נוצרה אך לא נמצאה במערכת. אנא רענן את הדף.');
      }
    } catch (err: any) {
      console.error('[YardImportPage] Error creating import job:', {
        error: err,
        code: err?.code,
        message: err?.message,
        details: err?.details,
      });

      let errorMessage = 'שגיאה ביצירת עבודת יבוא';
      if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      // The upload itself is done at this point.
      // The server processing (PREVIEW_READY / COMMITTED) is handled separately via job status.
      setIsUploading(false);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCommit = async () => {
    if (!firebaseUser || !activeJob) {
      console.warn('[YardImportPage] Cannot commit: missing firebaseUser or activeJob');
      return;
    }

    if (!window.confirm('האם אתה בטוח שברצונך לבצע יבוא מלא? פעולה זו תיצור/תעדכן רכבים במערכת.')) {
      return;
    }

    console.log('[YardImportPage] Starting commit for job:', {
      jobId: activeJob.jobId,
      status: activeJob.status,
      yardUid: firebaseUser.uid,
    });

    setIsCommitting(true);
    setError(null);

    try {
      await commitImportJob(firebaseUser.uid, activeJob.jobId, missingCarsMode);
      console.log('[YardImportPage] Commit completed successfully');
      
      // Job status will update via observer (status changes to COMMITTING, then COMMITTED)
      // Summary fields (rowsTotal, rowsValid, carsProcessed) will be updated by the backend
    } catch (err: any) {
      console.error('[YardImportPage] Error committing import:', {
        error: err,
        code: err?.code,
        message: err?.message,
        jobId: activeJob.jobId,
      });
      setError(err?.message || 'שגיאה באישור הייבוא');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    loadJobDetails(jobId);
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '-';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return '-';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'UPLOADED':
        return 'הועלה';
      case 'PROCESSING':
        return 'מעבד';
      case 'PREVIEW_READY':
        return 'מוכן לתצוגה מקדימה';
      case 'COMMITTING':
        return 'מתבצע';
      case 'COMMITTED':
        return 'הושלם';
      case 'FAILED':
        return 'נכשל';
      default:
        return status;
    }
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'COMMITTED':
        return 'status-success';
      case 'FAILED':
        return 'status-error';
      case 'PROCESSING':
      case 'COMMITTING':
        return 'status-processing';
      case 'PREVIEW_READY':
        return 'status-ready';
      default:
        return 'status-default';
    }
  };

  if (isLoading) {
    return (
      <div className="yard-import-page">
        <div className="loading-container">
          <p>טוען פעולות יבוא...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-import-page">
      <div className="page-container">
        <YardPageHeader
          title="יבוא צי מקובץ Excel"
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

        {/* Upload Section */}
        <div className="upload-section">
          <h2 className="section-title">העלאת קובץ Excel</h2>
          <div className="upload-controls">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              disabled={isUploading || isCommitting}
              style={{ display: 'none' }}
              id="excel-upload-input"
            />
            <label htmlFor="excel-upload-input" className="btn btn-primary">
              {isUploading || isCommitting
                ? 'מעלה ומעבד את קובץ האקסל...'
                : 'בחר קובץ Excel'}
            </label>
          </div>
        </div>

        {/* Active Job View */}
        {activeJob && (
          <div className="active-job-section">
            <h2 className="section-title">עבודה פעילה</h2>
            <div className="job-card">
              <div className="job-header">
                <div className="job-title">
                  <h3>{activeJob.source?.fileName || 'קובץ Excel'}</h3>
                  <span className={`status-badge ${getStatusClass(activeJob.status)}`}>
                    {getStatusLabel(activeJob.status)}
                  </span>
                </div>
                <div className="job-date">
                  נוצר: {formatTimestamp(activeJob.createdAt)}
                </div>
              </div>

              {activeJob.summary && (
                <div className="job-summary">
                  <div className="summary-row">
                    <span>סה״כ שורות:</span>
                    <strong>{activeJob.summary.rowsTotal || 0}</strong>
                  </div>
                  <div className="summary-row">
                    <span>שורות תקינות:</span>
                    <strong className="text-success">{activeJob.summary.rowsValid || 0}</strong>
                  </div>
                  {activeJob.summary.rowsWithWarnings && activeJob.summary.rowsWithWarnings > 0 && (
                    <div className="summary-row">
                      <span>שורות עם אזהרות:</span>
                      <strong className="text-warning">{activeJob.summary.rowsWithWarnings}</strong>
                    </div>
                  )}
                  {activeJob.summary.rowsWithErrors && activeJob.summary.rowsWithErrors > 0 && (
                    <div className="summary-row">
                      <span>שורות עם שגיאות:</span>
                      <strong className="text-error">{activeJob.summary.rowsWithErrors}</strong>
                    </div>
                  )}
                  {(activeJob.status === 'COMMITTING' || activeJob.status === 'COMMITTED') && (
                    <div className="summary-row">
                      <span>רכבים מעובדים:</span>
                      <strong>
                        {activeJob.summary.carsProcessed || 0} / {activeJob.summary.rowsTotal || 0}
                      </strong>
                    </div>
                  )}
                  {activeJob.summary.carsToCreate !== undefined && activeJob.summary.carsToCreate > 0 && (
                    <div className="summary-row">
                      <span>רכבים חדשים:</span>
                      <strong className="text-success">{activeJob.summary.carsToCreate}</strong>
                    </div>
                  )}
                  {activeJob.summary.carsToUpdate !== undefined && activeJob.summary.carsToUpdate > 0 && (
                    <div className="summary-row">
                      <span>רכבים מעודכנים:</span>
                      <strong>{activeJob.summary.carsToUpdate}</strong>
                    </div>
                  )}
                </div>
              )}

              {activeJob.status === 'COMMITTING' && activeJob.summary && (
                <div className="commit-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${
                          activeJob.summary.rowsTotal && activeJob.summary.rowsTotal > 0
                            ? (activeJob.summary.carsProcessed || 0) / activeJob.summary.rowsTotal * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="progress-text">
                    מעבד רכבים... {activeJob.summary.carsProcessed || 0} / {activeJob.summary.rowsTotal || 0}
                  </p>
                </div>
              )}

              {activeJob.error && (
                <div className="job-error">
                  <strong>שגיאה:</strong> {activeJob.error.message || 'שגיאה לא ידועה'}
                </div>
              )}

              {/* Preview Table */}
              {activeJob.status === 'PREVIEW_READY' && (
                <div className="preview-section">
                  <h3 className="preview-title">תצוגה מקדימה</h3>
                  {isLoadingPreview ? (
                    <div className="loading-container">
                      <p>טוען תצוגה מקדימה...</p>
                    </div>
                  ) : previewRows.length > 0 ? (
                    <>
                      <div className="preview-table-container">
                        <table className="preview-table">
                          <thead>
                            <tr>
                              <th>שורה</th>
                              <th>יצרן</th>
                              <th>דגם</th>
                              <th>שנה</th>
                              <th>קילומטראז'</th>
                              <th>מחיר</th>
                              <th>סטטוס</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row) => {
                              const hasErrors = row.issues.some((issue) => issue.level === 'ERROR');
                              return (
                                <tr
                                  key={row.rowIndex}
                                  className={hasErrors ? 'row-with-error' : ''}
                                >
                                  <td>{row.rowIndex}</td>
                                  <td>{row.normalized.manufacturer || '-'}</td>
                                  <td>{row.normalized.model || '-'}</td>
                                  <td>{row.normalized.year || '-'}</td>
                                  <td>{row.normalized.mileage ? `${row.normalized.mileage.toLocaleString()} ק"מ` : '-'}</td>
                                  <td>{row.normalized.askPrice ? `₪${row.normalized.askPrice.toLocaleString()}` : '-'}</td>
                                  <td>
                                    {hasErrors ? (
                                      <span className="row-status-error">שגיאה</span>
                                    ) : row.issues.length > 0 ? (
                                      <span className="row-status-warning">אזהרה</span>
                                    ) : (
                                      <span className="row-status-ok">תקין</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="preview-actions">
                        {/* Missing cars handling toggle */}
                        <div className="missing-cars-toggle" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            לטפל ברכבים שחסרים בקובץ החדש
                          </label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="missingCarsMode"
                                value="IMPORT_REMOVED"
                                checked={missingCarsMode === 'IMPORT_REMOVED'}
                                onChange={(e) => setMissingCarsMode(e.target.value as 'IMPORT_REMOVED' | 'SOLD_DELETE')}
                                style={{ marginLeft: '0.5rem' }}
                              />
                              <span>העבר חסרים ל'הוסר מיבוא' (מוסתר, בלי למחוק תמונות)</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#d32f2f' }}>
                              <input
                                type="radio"
                                name="missingCarsMode"
                                value="SOLD_DELETE"
                                checked={missingCarsMode === 'SOLD_DELETE'}
                                onChange={(e) => setMissingCarsMode(e.target.value as 'IMPORT_REMOVED' | 'SOLD_DELETE')}
                                style={{ marginLeft: '0.5rem' }}
                              />
                              <span>סמן חסרים כנמכר + מחק תמונות לצמיתות</span>
                            </label>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleCommit}
                          disabled={isCommitting || activeJob.summary?.rowsValid === 0}
                        >
                          {isCommitting ? 'מתבצע...' : 'בצע יבוא מלא (Commit)'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p>אין שורות בתצוגה מקדימה</p>
                  )}
                </div>
              )}

              {/* Show commit button for UPLOADED status if file was uploaded but parsing hasn't completed */}
              {activeJob.status === 'UPLOADED' && activeJob.source?.storagePath && (
                <div className="preview-section">
                  <div className="preview-actions">
                    <p className="preview-note">
                      הקובץ הועלה בהצלחה. ממתין לעיבוד הקובץ...
                      {activeJob.summary?.rowsTotal === 0 && (
                        <span className="warning-text">
                          {' '}(אם העיבוד לא מתחיל תוך כמה דקות, תוכל לנסות לבצע יבוא ישירות)
                        </span>
                      )}
                    </p>
                    {activeJob.summary?.rowsTotal === 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleCommit}
                        disabled={isCommitting}
                        title="נסה לבצע יבוא גם אם התצוגה המקדימה לא מוכנה"
                      >
                        {isCommitting ? 'מתבצע...' : 'נסה יבוא ישיר (אם העיבוד תקוע)'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeJob.updatedAt && (
                <div className="job-updated">
                  עודכן: {formatTimestamp(activeJob.updatedAt)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* History List */}
        <div className="jobs-history-section">
          <h2 className="section-title">היסטוריית יבוא</h2>
          {jobs.length === 0 ? (
            <div className="empty-state">
              <p>אין עדיין פעולות יבוא פעילות למגרש</p>
            </div>
          ) : (
            <div className="jobs-list">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`job-card ${selectedJobId === job.id ? 'job-card-selected' : ''}`}
                  onClick={() => handleJobSelect(job.id)}
                >
                  <div className="job-header">
                    <div className="job-title">
                      <h3>{job.source?.fileName || 'קובץ Excel'}</h3>
                      <span className={`status-badge ${getStatusClass(job.status)}`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </div>
                    <div className="job-date">
                      נוצר: {formatTimestamp(job.createdAt)}
                    </div>
                  </div>

                  {job.summary && (
                    <div className="job-summary">
                      <div className="summary-row">
                        <span>סה״כ שורות:</span>
                        <strong>{job.summary.rowsTotal || 0}</strong>
                      </div>
                      <div className="summary-row">
                        <span>שורות תקינות:</span>
                        <strong className="text-success">{job.summary.rowsValid || 0}</strong>
                      </div>
                      {job.summary.rowsWithWarnings && job.summary.rowsWithWarnings > 0 && (
                        <div className="summary-row">
                          <span>שורות עם אזהרות:</span>
                          <strong className="text-warning">{job.summary.rowsWithWarnings}</strong>
                        </div>
                      )}
                      {job.summary.rowsWithErrors && job.summary.rowsWithErrors > 0 && (
                        <div className="summary-row">
                          <span>שורות עם שגיאות:</span>
                          <strong className="text-error">{job.summary.rowsWithErrors}</strong>
                        </div>
                      )}
                      {job.summary.carsProcessed !== undefined && (
                        <div className="summary-row">
                          <span>רכבים מעובדים:</span>
                          <strong>{job.summary.carsProcessed}</strong>
                        </div>
                      )}
                      {job.summary.carsToCreate !== undefined && job.summary.carsToCreate > 0 && (
                        <div className="summary-row">
                          <span>רכבים חדשים:</span>
                          <strong className="text-success">{job.summary.carsToCreate}</strong>
                        </div>
                      )}
                      {job.summary.carsToUpdate !== undefined && job.summary.carsToUpdate > 0 && (
                        <div className="summary-row">
                          <span>רכבים מעודכנים:</span>
                          <strong>{job.summary.carsToUpdate}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {job.error && (
                    <div className="job-error">
                      <strong>שגיאה:</strong> {job.error.message || 'שגיאה לא ידועה'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
