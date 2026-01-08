import { useState, useCallback, useMemo } from 'react';
import { 
  DEBUG_CONTROLS, 
  getControlsByGroup, 
  runControl, 
  runPublishBundle, 
  runYardBundle,
  getControlDisabledReason,
  type DebugContext, 
  type DebugResult 
} from '../../adminDebug/debugControls';
import AdminDebugYardPicker from './components/AdminDebugYardPicker';
import AdminDebugCarPicker from './components/AdminDebugCarPicker';
import './DebugConsolePage.css';

interface YardSearchResult {
  yardUid: string;
  yardName: string;
  city?: string;
}

interface CarSearchResult {
  carId: string;
  yardUid: string;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  title?: string;
}

export default function DebugConsolePage() {
  // Yard state
  const [yardSearchValue, setYardSearchValue] = useState('');
  const [selectedYard, setSelectedYard] = useState<YardSearchResult | null>(null);
  
  // Car state
  const [carSearchValue, setCarSearchValue] = useState('');
  const [selectedCar, setSelectedCar] = useState<CarSearchResult | null>(null);
  
  // Other state
  const [limit, setLimit] = useState(25);
  const [verbose, setVerbose] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, DebugResult>>({});
  const [history, setHistory] = useState<Array<{ controlId: string; result: DebugResult }>>([]);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    readable: true,
    raw: false,
  });

  // Extract IDs from selected items
  const yardUid = selectedYard?.yardUid || '';
  const carId = selectedCar?.carId || '';

  // Shared helpers for badge building (used by both ControlCard and Bundle buttons)
  type BadgeKey = 'yard' | 'car' | 'readOnly' | 'verbose' | 'disabledReason';
  type RequirementBadge = { key: BadgeKey; text: string; satisfied: boolean };

  // Helper: Normalize badge text for deduplication (removes RTL/zero-width control chars)
  function normalizeBadgeText(s: string): string {
    return String(s ?? "")
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "") // remove bidi/zero-width
      .replace(/\s+/g, " ")
      .trim();
  }

  // Helper: Try to add badge with text deduplication (final guardrail)
  function tryAddBadge(
    badgeMap: Map<BadgeKey, RequirementBadge>,
    seenText: Set<string>,
    badge: RequirementBadge
  ): boolean {
    const normalizedText = normalizeBadgeText(badge.text);
    if (!normalizedText) return false;
    if (seenText.has(normalizedText)) return false; // FINAL dedupe guard by text
    // Keep key-dedupe too:
    if (!badgeMap.has(badge.key)) {
      badgeMap.set(badge.key, badge);
      seenText.add(normalizedText);
      return true;
    }
    return false;
  }

  // Helper: Compute missing requirements
  function computeMissingRequirements(
    requires: { yard?: boolean; car?: boolean; readOnlyOff?: boolean; verboseRecommended?: boolean } | undefined,
    ctx: DebugContext
  ): Array<'yard' | 'car' | 'readOnly' | 'verbose'> {
    const missing: Array<'yard' | 'car' | 'readOnly' | 'verbose'> = [];
    if (requires?.yard && !ctx.yardUid) missing.push('yard');
    if (requires?.car && !ctx.carId) missing.push('car');
    if (requires?.readOnlyOff && ctx.readOnly) missing.push('readOnly');
    if (requires?.verboseRecommended && !ctx.verbose) missing.push('verbose');
    return missing;
  }

  // Helper: Build requirement badges (unified for ControlCard and Bundle buttons)
  function buildRequirementBadges(
    requires: { yard?: boolean; car?: boolean; readOnlyOff?: boolean; verboseRecommended?: boolean } | undefined,
    ctx: DebugContext,
    includeDisabledReason: boolean = false,
    disabledReason: string | null = null
  ): RequirementBadge[] {
    const badgeMap = new Map<BadgeKey, RequirementBadge>();
    const seenText = new Set<string>();
    const missingReq = computeMissingRequirements(requires, ctx);

    // Add requirement badges ONLY from requirement sources
    if (requires?.yard) {
      tryAddBadge(badgeMap, seenText, {
        key: 'yard',
        text: ctx.yardUid ? 'מגרש נבחר' : 'נדרש לבחור מגרש',
        satisfied: !!ctx.yardUid,
      });
    }

    if (requires?.car) {
      tryAddBadge(badgeMap, seenText, {
        key: 'car',
        text: ctx.carId ? 'רכב נבחר' : 'נדרש לבחור רכב',
        satisfied: !!ctx.carId,
      });
    }

    if (requires?.readOnlyOff) {
      tryAddBadge(badgeMap, seenText, {
        key: 'readOnly',
        text: !ctx.readOnly ? 'Read-only OFF' : 'כבה Read-only',
        satisfied: !ctx.readOnly,
      });
    }

    if (requires?.verboseRecommended) {
      tryAddBadge(badgeMap, seenText, {
        key: 'verbose',
        text: 'Verbose (אופציונלי)',
        satisfied: true, // Optional, always green
      });
    }

    // Add disabledReason badge ONLY if NO missing requirements (prevents duplicates)
    if (includeDisabledReason && missingReq.length === 0 && disabledReason) {
      tryAddBadge(badgeMap, seenText, {
        key: 'disabledReason',
        text: disabledReason,
        satisfied: false,
      });
    }

    return Array.from(badgeMap.values());
  }

  // Auto-fill yard when car is selected
  const handleCarSelected = useCallback((car: CarSearchResult | null) => {
    setSelectedCar(car);
    if (car && car.yardUid && !selectedYard) {
      // Try to set yard if not already set
      setSelectedYard({
        yardUid: car.yardUid,
        yardName: car.yardUid, // Fallback to UID if name not available
      });
    }
  }, [selectedYard]);

  const ctx: DebugContext = useMemo(() => ({
    yardUid: yardUid.trim() || undefined,
    carId: carId.trim() || undefined,
    limit,
    verbose,
    readOnly,
  }), [yardUid, carId, limit, verbose, readOnly]);

  // Check if admin is ready (simplified - in real app, check auth)
  const adminReady = true; // TODO: Check actual admin status

  const handleRunControl = useCallback(async (controlId: string) => {
    // Prevent running if disabled
    const control = DEBUG_CONTROLS.find(c => c.id === controlId);
    if (!control) return;
    
    const disabledReason = getControlDisabledReason(control, ctx);
    if (disabledReason || !adminReady) {
      return; // Don't run if disabled
    }

    setRunning(controlId);
    try {
      const result = await runControl(controlId, ctx);
      setResults(prev => ({ ...prev, [controlId]: result }));
      
      // Add to history (keep last 20)
      setHistory(prev => {
        const newHistory = [{ controlId, result }, ...prev].slice(0, 20);
        return newHistory;
      });
      setSelectedResult(controlId);
    } catch (error: any) {
      const errorResult: DebugResult = {
        ok: false,
        level: 'FAIL',
        title: 'Error',
        summary: error.message || 'Unknown error',
        details: { error: error.message, stack: verbose ? error.stack : undefined },
        ts: new Date().toISOString(),
      };
      setResults(prev => ({ ...prev, [controlId]: errorResult }));
      setHistory(prev => [{ controlId, result: errorResult }, ...prev].slice(0, 20));
      setSelectedResult(controlId);
    } finally {
      setRunning(null);
    }
  }, [ctx, verbose, adminReady]);

  const handleRunPublishBundle = useCallback(async () => {
    setRunning('publish-bundle');
    try {
      const { results: bundleResults } = await runPublishBundle(ctx);
      const newResults: Record<string, DebugResult> = {};
      bundleResults.forEach((result, idx) => {
        const controlId = `publish-bundle-${idx}`;
        newResults[controlId] = result;
      });
      setResults(prev => ({ ...prev, ...newResults }));
      
      // Add to history
      bundleResults.forEach((result, idx) => {
        const controlId = `publish-bundle-${idx}`;
        setHistory(prev => [{ controlId, result }, ...prev].slice(0, 20));
      });
      setSelectedResult('publish-bundle-0');
    } catch (error: any) {
      const errorResult: DebugResult = {
        ok: false,
        level: 'FAIL',
        title: 'Publish Bundle Error',
        summary: error.message || 'Unknown error',
        details: { error: error.message },
        ts: new Date().toISOString(),
      };
      setResults(prev => ({ ...prev, 'publish-bundle': errorResult }));
      setSelectedResult('publish-bundle');
    } finally {
      setRunning(null);
    }
  }, [ctx]);

  const handleRunYardBundle = useCallback(async () => {
    setRunning('yard-bundle');
    try {
      const { results: bundleResults } = await runYardBundle(ctx);
      const newResults: Record<string, DebugResult> = {};
      bundleResults.forEach((result, idx) => {
        const controlId = `yard-bundle-${idx}`;
        newResults[controlId] = result;
      });
      setResults(prev => ({ ...prev, ...newResults }));
      
      // Add to history
      bundleResults.forEach((result, idx) => {
        const controlId = `yard-bundle-${idx}`;
        setHistory(prev => [{ controlId, result }, ...prev].slice(0, 20));
      });
      setSelectedResult('yard-bundle-0');
    } catch (error: any) {
      const errorResult: DebugResult = {
        ok: false,
        level: 'FAIL',
        title: 'Yard Bundle Error',
        summary: error.message || 'Unknown error',
        details: { error: error.message },
        ts: new Date().toISOString(),
      };
      setResults(prev => ({ ...prev, 'yard-bundle': errorResult }));
      setSelectedResult('yard-bundle');
    } finally {
      setRunning(null);
    }
  }, [ctx]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast here
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }, []);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  const groupedControls = getControlsByGroup();
  const currentResult = selectedResult ? results[selectedResult] : null;

  // Helper to get status explanation (Hebrew)
  const getStatusExplanation = (level: 'OK' | 'WARN' | 'FAIL'): string => {
    switch (level) {
      case 'OK':
        return 'עבר בהצלחה, אין צורך בפעולה';
      case 'WARN':
        return 'עובד אבל צריך תשומת לב (למשל: fallback בשימוש / שדות אופציונליים חסרים / חלקי)';
      case 'FAIL':
        return 'לא ניתן לאמת או שהפעולה נכשלה (הרשאות, לא נמצא, שגיאת זמן ריצה)';
      default:
        return '';
    }
  };

  return (
    <div className="debug-console-page">
      <div className="debug-console-header">
        <h1>Admin Debug Console</h1>
        <p className="debug-warning">Admin only / Read-only by default</p>
      </div>

      <div className="debug-console-layout">
        {/* Left: Controls */}
        <div className="debug-controls-panel">
          <div className="debug-inputs">
            <AdminDebugYardPicker
              value={yardSearchValue}
              selectedYard={selectedYard}
              onValueChange={setYardSearchValue}
              onSelectedYardChange={setSelectedYard}
            />
            
            {selectedYard && (
              <div className="debug-tech-details">
                <div className="debug-tech-detail">
                  <span className="debug-tech-label">yardUid:</span>
                  <code className="debug-tech-value">{selectedYard.yardUid}</code>
                  <button
                    className="debug-tech-copy"
                    onClick={() => copyToClipboard(selectedYard.yardUid)}
                    title="העתק"
                  >
                    📋
                  </button>
                </div>
              </div>
            )}

            <AdminDebugCarPicker
              value={carSearchValue}
              selectedCar={selectedCar}
              onValueChange={setCarSearchValue}
              onSelectedCarChange={handleCarSelected}
              yardUid={yardUid}
              disabled={!yardUid} /* Disable until yard is selected */
            />
            {!yardUid && (
              <small className="debug-helper-text" style={{ marginTop: '0.25rem' }}>
                בחר מגרש כדי לחפש רכבים
              </small>
            )}
            
            {selectedCar && (
              <div className="debug-tech-details">
                <div className="debug-tech-detail">
                  <span className="debug-tech-label">carId:</span>
                  <code className="debug-tech-value">{selectedCar.carId}</code>
                  <button
                    className="debug-tech-copy"
                    onClick={() => copyToClipboard(selectedCar.carId)}
                    title="העתק"
                  >
                    📋
                  </button>
                </div>
                {selectedCar.yardUid && selectedCar.yardUid !== yardUid && (
                  <div className="debug-tech-detail">
                    <span className="debug-tech-label">yardUid:</span>
                    <code className="debug-tech-value">{selectedCar.yardUid}</code>
                    <button
                      className="debug-tech-copy"
                      onClick={() => copyToClipboard(selectedCar.yardUid)}
                      title="העתק"
                    >
                      📋
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="debug-input-group">
              <label>
                Limit (כמה תוצאות לבדיקה)
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 25)}
                  min={1}
                  max={1000}
                />
                <small className="debug-helper-text">
                  מגביל כמה מסמכים/רכבים נסרקים בכל בדיקה כדי לשמור על מהירות ולא להעמיס על Firestore/Functions. לדוגמה: 25 = בדיקה מהירה על 25 הרשומות האחרונות.
                </small>
              </label>
            </div>
            
            <div className="debug-input-group">
              <label className="debug-toggle">
                <input
                  type="checkbox"
                  checked={verbose}
                  onChange={(e) => setVerbose(e.target.checked)}
                />
                <span>Verbose (יותר שדות בדוח)</span>
              </label>
            </div>
            
            <div className="debug-input-group">
              <label className="debug-toggle">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(e) => setReadOnly(e.target.checked)}
                />
                <span>Read-only mode (ON = safe, OFF = allows reproject)</span>
              </label>
              <div className="debug-readonly-pill">
                Read-only: <span className={readOnly ? 'debug-pill-on' : 'debug-pill-off'}>
                  {readOnly ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>

          <div className="debug-bundle-section">
            {/* Run Publish Bundle - requires yardUid + carId */}
            {(() => {
              const publishBundleRequires = { yard: true, car: true };
              const publishBundleMissing = computeMissingRequirements(publishBundleRequires, ctx);
              const publishBundleRunnable = publishBundleMissing.length === 0 && adminReady && running === null;
              const publishBundleBadges = buildRequirementBadges(publishBundleRequires, ctx, false, null);

              return (
                <div className="debug-bundle-card">
                  <div className="debug-bundle-header">
                    <button
                      className="debug-btn debug-btn-primary"
                      onClick={handleRunPublishBundle}
                      disabled={!publishBundleRunnable || running !== null}
                    >
                      {running === 'publish-bundle' ? 'Running...' : 'Run Publish Bundle'}
                    </button>
                    <div className="debug-bundle-badges">
                      {publishBundleBadges.map((badge) => (
                        <span
                          key={badge.key}
                          data-badge-key={badge.key}
                          data-badge-text={badge.text}
                          className={`debug-requirement-badge ${badge.satisfied ? 'debug-requirement-satisfied' : 'debug-requirement-missing'}`}
                          title={badge.satisfied ? 'מתקיים' : 'חסר'}
                        >
                          {badge.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="debug-bundle-desc">
                    Runs: MASTER State, PUBLIC State, Diff, Public Query, Permission Probe
                  </p>
                </div>
              );
            })()}

            {/* Run Yard Bundle - requires yardUid only */}
            {(() => {
              const yardBundleRequires = { yard: true };
              const yardBundleMissing = computeMissingRequirements(yardBundleRequires, ctx);
              const yardBundleRunnable = yardBundleMissing.length === 0 && adminReady && running === null;
              const yardBundleBadges = buildRequirementBadges(yardBundleRequires, ctx, false, null);

              return (
                <div className="debug-bundle-card">
                  <div className="debug-bundle-header">
                    <button
                      className="debug-btn debug-btn-secondary"
                      onClick={handleRunYardBundle}
                      disabled={!yardBundleRunnable || running !== null}
                    >
                      {running === 'yard-bundle' ? 'Running...' : 'Run Yard Bundle'}
                    </button>
                    <div className="debug-bundle-badges">
                      {yardBundleBadges.map((badge) => (
                        <span
                          key={badge.key}
                          data-badge-key={badge.key}
                          data-badge-text={badge.text}
                          className={`debug-requirement-badge ${badge.satisfied ? 'debug-requirement-satisfied' : 'debug-requirement-missing'}`}
                          title={badge.satisfied ? 'מתקיים' : 'חסר'}
                        >
                          {badge.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="debug-bundle-desc">
                    Runs: Yard Published Counts, Detect Old Docs, Permission Probe, MASTER Health Scan
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="debug-controls-list">
            {Object.entries(groupedControls).map(([group, controls]) => (
              <div key={group} className="debug-control-group">
                <h3 className="debug-group-title">{group}</h3>
                {controls.map(control => {
                  const result = results[control.id];
                  const isRunning = running === control.id;
                  const disabledReason = getControlDisabledReason(control, ctx);
                  const runnable = !disabledReason && adminReady && !isRunning;

                  // Use shared helper to build requirement badges
                  const requirementBadges = buildRequirementBadges(
                    control.requires,
                    ctx,
                    true, // includeDisabledReason
                    disabledReason
                  );

                  return (
                    <div 
                      key={control.id} 
                      className={`debug-control-card ${!runnable ? 'disabled' : ''}`}
                    >
                      <div className="debug-control-header">
                        <h4 className="debug-control-title">{control.title}</h4>
                        <div className="debug-control-badges">
                          {result && (
                            <span className={`debug-status-badge debug-status-${result.level.toLowerCase()}`}>
                              {result.level}
                            </span>
                          )}
                          {/* Requirement badges - each appears only once (deduplicated by key AND text) */}
                          {requirementBadges.length > 0 && (
                            <>
                              {requirementBadges.map((badge) => (
                                <span 
                                  key={badge.key} 
                                  data-badge-key={badge.key}
                                  data-badge-text={badge.text}
                                  className={`debug-requirement-badge ${badge.satisfied ? 'debug-requirement-satisfied' : 'debug-requirement-missing'}`}
                                  title={badge.satisfied ? 'מתקיים' : 'חסר'}
                                >
                                  {badge.text}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                      <p className="debug-control-desc">{control.description}</p>
                      {/* Remove "Requires:" line to avoid duplication - badges already show requirements */}
                      <div className="debug-control-actions">
                        <button
                          className="debug-btn debug-btn-small"
                          onClick={() => handleRunControl(control.id)}
                          disabled={!runnable}
                        >
                          {isRunning ? 'Running...' : 'Run'}
                        </button>
                        {/* Add "Repair Selected Car" button for MASTER Car Publish State */}
                        {control.id === 'master-car-state' && yardUid && carId && (
                          <button
                            className="debug-btn debug-btn-small debug-btn-repair"
                            onClick={async () => {
                              const repairControlId = 'repair-selected-car';
                              setRunning(repairControlId);
                              try {
                                const repairResult = await runControl(repairControlId, ctx);
                                setResults(prev => ({ ...prev, [repairControlId]: repairResult }));
                                setHistory(prev => [{ controlId: repairControlId, result: repairResult }, ...prev].slice(0, 20));
                                
                                // Auto-refresh: Re-run MASTER Car Publish State after repair
                                // Refresh if repair succeeded (OK or WARN, but not FAIL)
                                if (repairResult.ok && (repairResult.level === 'OK' || repairResult.level === 'WARN')) {
                                  setTimeout(async () => {
                                    try {
                                      const refreshedResult = await runControl('master-car-state', ctx);
                                      setResults(prev => ({ ...prev, 'master-car-state': refreshedResult }));
                                      setHistory(prev => [{ controlId: 'master-car-state', result: refreshedResult }, ...prev].slice(0, 20));
                                      setSelectedResult('master-car-state');
                                    } catch (refreshError: any) {
                                      console.error('Failed to refresh MASTER state after repair:', refreshError);
                                    }
                                  }, 500); // Small delay to ensure Firestore write is visible
                                }
                                
                                setSelectedResult(repairControlId);
                              } catch (error: any) {
                                const errorResult: DebugResult = {
                                  ok: false,
                                  level: 'FAIL',
                                  title: 'Repair Selected Car Fields',
                                  summary: error.message || 'Unknown error',
                                  details: { error: error.message },
                                  ts: new Date().toISOString(),
                                };
                                setResults(prev => ({ ...prev, [repairControlId]: errorResult }));
                                setSelectedResult(repairControlId);
                              } finally {
                                setRunning(null);
                              }
                            }}
                            disabled={running !== null || !yardUid || !carId}
                            title="Repair missing updatedAt/publishedAt for this car"
                          >
                            {running === 'repair-selected-car' ? 'Repairing...' : '🔧 Repair Selected Car'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Results */}
        <div className="debug-results-panel">
          <div className="debug-results-header">
            <h2>Results</h2>
            {currentResult && (
              <button
                className="debug-btn debug-btn-small"
                onClick={() => copyToClipboard(JSON.stringify(currentResult, null, 2))}
              >
                Copy Result
              </button>
            )}
          </div>

          {currentResult ? (
            <div className="debug-result-view">
              {/* Summary Section (always visible) */}
              <div className="debug-result-section">
                <div className="debug-result-section-header">
                  <h3>{currentResult.title}</h3>
                  <div className="debug-result-section-badges">
                    <span className={`debug-status-badge debug-status-${currentResult.level.toLowerCase()}`}>
                      {currentResult.level}
                    </span>
                    {verbose && currentResult.detailsVerbose && (
                      <span className="debug-verbose-badge">VERBOSE</span>
                    )}
                    {currentResult.correlationId && (
                      <span className="debug-correlation-badge" title="Correlation ID for logs">
                        ID: {currentResult.correlationId.slice(-8)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="debug-result-summary">{currentResult.summary}</p>
                {currentResult.details?.nextAction && (
                  <div className="debug-next-action">
                    <strong>מה לעשות עכשיו:</strong> {currentResult.details.nextAction}
                  </div>
                )}
                <div className="debug-result-meta">
                  <small>Timestamp: {new Date(currentResult.ts).toLocaleString()}</small>
                  {(currentResult.correlationId || currentResult.details?.correlationId) && (
                    <small className="debug-correlation-display">
                      Correlation ID: <code onClick={() => copyToClipboard(currentResult.correlationId || currentResult.details?.correlationId || '')} style={{ cursor: 'pointer' }}>{currentResult.correlationId || currentResult.details?.correlationId}</code>
                    </small>
                  )}
                  {currentResult.details?.firebaseCode === 'internal' && (
                    <small className="debug-internal-error-hint">
                      פתח לוגים עם correlationId: {currentResult.correlationId || currentResult.details?.correlationId}
                    </small>
                  )}
                </div>
                <div className="debug-status-explanation">
                  <strong>מה זה אומר?</strong> {getStatusExplanation(currentResult.level)}
                </div>
              </div>

              {/* Readable Details Section */}
              <div className="debug-result-section">
                <button
                  className="debug-result-section-toggle"
                  onClick={() => toggleSection('readable')}
                >
                  {expandedSections.readable ? '▼' : '▶'} Details (Readable)
                </button>
                {expandedSections.readable && (
                  <div className="debug-result-readable">
                    {currentResult.details && (
                      <table className="debug-result-table">
                        <tbody>
                          {Object.entries(currentResult.details).map(([key, value]) => {
                            if (key === 'correlationId' || key === 'stack') return null;
                            if (typeof value === 'object' && value !== null) {
                              return (
                                <tr key={key}>
                                  <td className="debug-result-key">{key}:</td>
                                  <td className="debug-result-value">
                                    <pre>{JSON.stringify(value, null, 2)}</pre>
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={key}>
                                <td className="debug-result-key">{key}:</td>
                                <td className="debug-result-value">{String(value)}</td>
                              </tr>
                            );
                          })}
                          {currentResult.details.recommendedAction && (
                            <tr>
                              <td className="debug-result-key">Recommended Action:</td>
                              <td className="debug-result-value debug-action-value">
                                {currentResult.details.recommendedAction}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                    {currentResult.detailsVerbose && verbose && (
                      <div className="debug-result-verbose">
                        <h4>Verbose Details:</h4>
                        <pre>{JSON.stringify(currentResult.detailsVerbose, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Raw JSON Section (collapsed by default) */}
              <div className="debug-result-section">
                <button
                  className="debug-result-section-toggle"
                  onClick={() => toggleSection('raw')}
                >
                  {expandedSections.raw ? '▼' : '▶'} Raw JSON
                </button>
                {expandedSections.raw && (
                  <div className="debug-result-details">
                    <pre>{JSON.stringify(currentResult, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="debug-result-empty">
              <p>Select a control and click "Run" to see results</p>
            </div>
          )}

          {history.length > 0 && (
            <div className="debug-history">
              <h3>History (Last 20)</h3>
              <ul className="debug-history-list">
                {history.map((item, idx) => {
                  const control = DEBUG_CONTROLS.find(c => c.id === item.controlId);
                  return (
                    <li
                      key={idx}
                      className={`debug-history-item ${selectedResult === item.controlId ? 'selected' : ''}`}
                      onClick={() => {
                        setResults(prev => ({ ...prev, [item.controlId]: item.result }));
                        setSelectedResult(item.controlId);
                      }}
                      title={item.result.summary}
                    >
                      <span className={`debug-status-badge debug-status-${item.result.level.toLowerCase()}`}>
                        {item.result.level}
                      </span>
                      <span className="debug-history-title">
                        {control?.title || item.controlId}
                      </span>
                      <span className="debug-history-time">
                        {new Date(item.result.ts).toLocaleTimeString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
