/**
 * Bulk Snapshot Repair Panel
 * 
 * Admin-only panel for bulk repairing missing snapshots in publicCars.
 * Processes in batches with progress tracking and live log.
 */

import { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/firebaseClient';
import './BulkSnapshotRepairPanel.css';

interface BatchResult {
  scanned: number;
  fixed: number;
  skippedAlreadyOk: number;
  skippedNoYardUid: number;
  skippedNoSourceData: number;
  failed: number;
}

interface BulkRepairResponse {
  ok: boolean;
  correlationId: string;
  batch: BatchResult;
  cursorOut: string | null;
  done: boolean;
  itemsSample: Array<{
    carId: string;
    status: string;
    snapshotSource?: string;
    missingFields?: string[];
  }>;
}

const LS_KEY = 'adminDebug.bulkSnapshotRepair.state.v1';

interface PersistedState {
  running: boolean;
  completed: boolean;
  totalScanned: number;
  totalFixed: number;
  totalSkipped: number;
  totalFailed: number;
  correlationId: string | null;
  currentCursor: string | null;
  error: string | null;
  lastUpdateAt: number;
}

export default function BulkSnapshotRepairPanel() {
  const [yardUid, setYardUid] = useState<string>('');
  const [batchSize, setBatchSize] = useState<number>(75);
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Totals
  const [totalScanned, setTotalScanned] = useState<number>(0);
  const [totalFixed, setTotalFixed] = useState<number>(0);
  const [totalSkipped, setTotalSkipped] = useState<number>(0);
  const [totalFailed, setTotalFailed] = useState<number>(0);
  
  // Live log
  const [itemsLog, setItemsLog] = useState<Array<{
    carId: string;
    status: string;
    snapshotSource?: string;
    missingFields?: string[];
    timestamp: number;
  }>>([]);
  
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<number>(0);
  
  const abortRef = useRef<boolean>(false);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const state: PersistedState = JSON.parse(saved);
        setRunning(state.running || false); // Don't auto-resume running state
        setCompleted(state.completed || false);
        setTotalScanned(state.totalScanned || 0);
        setTotalFixed(state.totalFixed || 0);
        setTotalSkipped(state.totalSkipped || 0);
        setTotalFailed(state.totalFailed || 0);
        setCorrelationId(state.correlationId || null);
        setCurrentCursor(state.currentCursor || null);
        setError(state.error || null);
        setLastUpdateAt(state.lastUpdateAt || 0);
      }
    } catch (err) {
      console.error('[BulkSnapshotRepairPanel] Failed to load persisted state:', err);
    }
  }, []);

  // Persist state on every update
  useEffect(() => {
    if (totalScanned === 0 && !running && !completed && !error) {
      // Don't persist empty initial state
      return;
    }
    try {
      const state: PersistedState = {
        running,
        completed,
        totalScanned,
        totalFixed,
        totalSkipped,
        totalFailed,
        correlationId,
        currentCursor,
        error,
        lastUpdateAt: Date.now(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      setLastUpdateAt(Date.now());
    } catch (err) {
      console.error('[BulkSnapshotRepairPanel] Failed to persist state:', err);
    }
  }, [running, completed, totalScanned, totalFixed, totalSkipped, totalFailed, correlationId, currentCursor, error]);

  const bulkRepairCallable = httpsCallable<{
    yardUid?: string;
    batchSize?: number;
    cursor?: string | null;
    dryRun?: boolean;
  }, BulkRepairResponse>(functions, 'bulkRepairPublicCarSnapshots');

  const handleStart = async () => {
    if (running) {
      // Stop
      abortRef.current = true;
      setRunning(false);
      return;
    }

    // Clear persisted state and reset
    try {
      localStorage.removeItem(LS_KEY);
    } catch (err) {
      console.error('[BulkSnapshotRepairPanel] Failed to clear persisted state:', err);
    }

    // Reset state
    setRunning(true);
    setError(null);
    setCompleted(false);
    setTotalScanned(0);
    setTotalFixed(0);
    setTotalSkipped(0);
    setTotalFailed(0);
    setItemsLog([]);
    setCurrentCursor(null);
    setCorrelationId(null);
    setLastUpdateAt(0);
    abortRef.current = false;

    // Start loop
    let cursor: string | null = null;
    let done = false;
    let firstBatch = true;

    try {
      while (!abortRef.current && !done) {
        const response = await bulkRepairCallable({
          yardUid: yardUid.trim() || undefined,
          batchSize: batchSize,
          cursor: cursor,
          dryRun: dryRun,
        });

        const data: BulkRepairResponse = response.data;

        if (!data.ok) {
          throw new Error('Backend returned ok=false');
        }

        // Set correlationId on first batch
        if (firstBatch && data.correlationId) {
          setCorrelationId(data.correlationId);
          firstBatch = false;
        }

        // Accumulate totals
        setTotalScanned(prev => prev + data.batch.scanned);
        setTotalFixed(prev => prev + data.batch.fixed);
        setTotalSkipped(prev => 
          prev + data.batch.skippedAlreadyOk + 
          data.batch.skippedNoYardUid + 
          data.batch.skippedNoSourceData
        );
        setTotalFailed(prev => prev + data.batch.failed);

        // Add items to log (prepend, keep last 20)
        const newItems = data.itemsSample.map(item => ({
          ...item,
          timestamp: Date.now(),
        }));
        setItemsLog(prev => [...newItems, ...prev].slice(0, 20));

        // Update cursor
        cursor = data.cursorOut;
        setCurrentCursor(cursor);
        done = data.done || cursor === null;

        // Small delay between batches (150-300ms)
        if (!done && !abortRef.current) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      if (!abortRef.current) {
        setCompleted(true);
      }
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      setError(errorMsg);
      setRunning(false);
    } finally {
      if (!abortRef.current) {
        setRunning(false);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  return (
    <div className="bulk-snapshot-repair-panel">
      <h2 className="bulk-repair-title">🔧 Bulk Snapshot Repair</h2>
      <p className="bulk-repair-description">
        Repair missing yard/seller snapshots in existing publicCars documents.
        Only updates snapshot fields (name, phone, logo) - does not create new docs.
      </p>

      <div className="bulk-repair-controls">
        <div className="bulk-repair-input-group">
          <label htmlFor="yardUid">Yard UID (optional, empty = all yards):</label>
          <input
            id="yardUid"
            type="text"
            value={yardUid}
            onChange={(e) => setYardUid(e.target.value)}
            disabled={running}
            placeholder="Leave empty for all yards"
          />
        </div>

        <div className="bulk-repair-input-group">
          <label htmlFor="batchSize">Batch Size:</label>
          <input
            id="batchSize"
            type="number"
            min="1"
            max="150"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.min(Math.max(parseInt(e.target.value) || 75, 1), 150))}
            disabled={running}
          />
        </div>

        <div className="bulk-repair-input-group">
          <label>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={running}
            />
            Dry Run (don't write changes)
          </label>
        </div>

        <button
          className={`bulk-repair-button ${running ? 'running' : ''}`}
          onClick={handleStart}
          disabled={running && !abortRef.current}
        >
          {running ? '⏹ Stop' : '▶ Run Bulk Repair'}
        </button>
      </div>

      {error && (
        <div className="bulk-repair-error">
          <strong>Error:</strong> {error}
          {currentCursor && (
            <div className="bulk-repair-resume-hint">
              Last cursor: {currentCursor} (you can resume by setting cursor manually)
            </div>
          )}
        </div>
      )}

      {(running || totalScanned > 0) && (
        <div className="bulk-repair-progress">
          <div className="bulk-repair-progress-bar-container">
            <div 
              className={`bulk-repair-progress-bar ${completed ? 'completed' : 'indeterminate'}`}
              style={completed ? { width: '100%' } : undefined}
            />
          </div>

          <div className="bulk-repair-stats">
            <div className="bulk-repair-stat">
              <span className="stat-label">Scanned:</span>
              <span className="stat-value">{totalScanned}</span>
            </div>
            <div className="bulk-repair-stat">
              <span className="stat-label">Fixed:</span>
              <span className="stat-value success">{totalFixed}</span>
            </div>
            <div className="bulk-repair-stat">
              <span className="stat-label">Skipped:</span>
              <span className="stat-value">{totalSkipped}</span>
            </div>
            <div className="bulk-repair-stat">
              <span className="stat-label">Failed:</span>
              <span className="stat-value error">{totalFailed}</span>
            </div>
          </div>

          {correlationId && (
            <div className="bulk-repair-correlation">
              Correlation ID: <code>{correlationId}</code>
            </div>
          )}

          {currentCursor && !completed && (
            <div className="bulk-repair-cursor">
              Current cursor: <code>{currentCursor}</code>
            </div>
          )}

          {lastUpdateAt > 0 && (
            <div className="bulk-repair-last-update" style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
              Last update: {new Date(lastUpdateAt).toLocaleTimeString()}
            </div>
          )}

          {completed && (
            <div className="bulk-repair-completed">
              ✅ Completed! Processed {totalScanned} documents.
            </div>
          )}
        </div>
      )}

      {itemsLog.length > 0 && (
        <div className="bulk-repair-log">
          <h3>Recent Items (last 20):</h3>
          <div className="bulk-repair-log-items">
            {itemsLog.map((item, idx) => (
              <div key={`${item.carId}-${item.timestamp}-${idx}`} className="bulk-repair-log-item">
                <span className="log-item-carid">{item.carId}</span>
                <span className={`log-item-status status-${item.status.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                  {item.status}
                </span>
                {item.snapshotSource && (
                  <span className="log-item-source">Source: {item.snapshotSource}</span>
                )}
                {item.missingFields && item.missingFields.length > 0 && (
                  <span className="log-item-missing">
                    Missing: {item.missingFields.join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
