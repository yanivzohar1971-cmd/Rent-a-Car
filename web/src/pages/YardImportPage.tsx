import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchYardImportJobs, type YardImportJob } from '../api/yardImportApi';
import './YardImportPage.css';

export default function YardImportPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<YardImportJob[]>([]);

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
      if (!firebaseUser) return;

      setIsLoading(true);
      setError(null);
      try {
        const loadedJobs = await fetchYardImportJobs(20);
        setJobs(loadedJobs);
      } catch (err: any) {
        console.error('Error loading import jobs:', err);
        setError('שגיאה בטעינת פעולות יבוא');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

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
        <div className="page-header">
          <h1 className="page-title">יבוא צי מקובץ Excel</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="info-box">
          <p>
            <strong>הערה:</strong> העלאת קבצי Excel נעשית כרגע מהאפליקציה. 
            דף זה מאפשר לך לעקוב אחר סטטוס פעולות הייבוא שלך.
          </p>
        </div>

        {jobs.length === 0 ? (
          <div className="empty-state">
            <p>אין עדיין פעולות יבוא פעילות למגרש</p>
          </div>
        ) : (
          <div className="jobs-list">
            {jobs.map((job) => (
              <div key={job.id} className="job-card">
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

                {job.updatedAt && (
                  <div className="job-updated">
                    עודכן: {formatTimestamp(job.updatedAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
