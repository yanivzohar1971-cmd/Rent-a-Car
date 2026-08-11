/**
 * Gov sync progress UI: shows job progress, current plate, success/fail counts, recent results.
 * YARD Fleet only. Uses YardFleetPage.css gov-sync-* classes.
 */

import { useEffect, useState } from 'react';
import {
  subscribeGovSyncJob,
  subscribeGovSyncJobResults,
  type GovSyncJobDoc,
  type GovSyncResultDoc,
} from '../../api/govSyncApi';

interface GovSyncProgressProps {
  jobId: string;
  onDone?: () => void;
}

const RECENT_LIMIT = 10;

export default function GovSyncProgress({ jobId, onDone }: GovSyncProgressProps) {
  const [job, setJob] = useState<GovSyncJobDoc | null>(null);
  const [recentResults, setRecentResults] = useState<GovSyncResultDoc[]>([]);

  useEffect(() => {
    const unsubJob = subscribeGovSyncJob(jobId, (data) => {
      setJob(data);
    });
    const unsubResults = subscribeGovSyncJobResults(jobId, RECENT_LIMIT, setRecentResults);
    return () => {
      unsubJob();
      unsubResults();
    };
  }, [jobId, onDone]);

  if (!job) return null;

  const total = job.total ?? 0;
  const completed = job.completed ?? 0;
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  return (
    <div className="gov-sync-progress">
      <div className="gov-sync-progress-bar">
        <div
          className="gov-sync-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {job.currentPlate && (
        <div className="gov-sync-current-plate" aria-live="polite">
          מעדכן עכשיו: {job.currentPlate}
        </div>
      )}
      <div className="gov-sync-counters">
        הצליחו {job.successCount ?? 0} | נכשלו {job.failCount ?? 0} | הושלמו {completed}/{total}
      </div>
      {job.state === 'failed' && job.lastError && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#c62828' }}>
          שגיאה: {job.lastError}
        </div>
      )}
      {(job.state === 'done' || job.state === 'failed') && onDone && (
        <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            סגור
          </button>
        </div>
      )}
      {recentResults.length > 0 && (
        <div className="gov-sync-recent-list">
          {recentResults.map((r, i) => (
            <div key={`${r.plate}-${i}`} className="gov-sync-recent-item">
              <span aria-hidden="true">{r.ok ? '✅' : '⚠️'}</span>
              <span className="car-preview-ltr" style={{ direction: 'ltr' }}>{r.plate}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
