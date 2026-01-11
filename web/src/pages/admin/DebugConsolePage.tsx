import { useState, useCallback, useMemo, useRef, useEffect } from 'react'; 
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
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebaseClient';
import LicensePlateBadge from '../../components/common/LicensePlateBadge';
import AdminDebugYardPicker from './components/AdminDebugYardPicker';
import AdminDebugCarPicker from './components/AdminDebugCarPicker';
import './DebugConsolePage.css';

interface YardSearchResult {
  yardUid: string;
  yardName: string;
  city?: string;
}

type YardLite = { yardUid: string; name?: string | null; phones?: string[] | null };
type CarLite = { carId: string; plateNumber?: string | null; make?: string | null; model?: string | null; year?: number | null; title?: string | null };

interface CarSearchResult {
  carId: string;
  yardUid: string;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  title?: string;
}

// In-memory JSON store (module scope)
const DEBUG_DATA = {
  loadedYards: false,
  yards: [] as YardLite[],
  carsByYard: {} as Record<string, CarLite[]>,
  lastYardsLoadError: null as string | null,
  lastCarsLoadErrorByYard: {} as Record<string, string | null>,
};

export default function DebugConsolePage() {
  // UI refresh trigger
  const [, bump] = useState(0);
  const bumpUI = useCallback(() => { bump(x => x + 1); }, []);

  // Yard state
  const [yardInputValue, setYardInputValue] = useState('');
  const [selectedYard, setSelectedYard] = useState<YardSearchResult | null>(null);
  
  // Car state
  const [carInputValue, setCarInputValue] = useState('');
  const [selectedCar, setSelectedCar] = useState<CarSearchResult | null>(null);
  
  // Other state
  const [limit, setLimit] = useState(25);
  const [verbose, setVerbose] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, DebugResult>>({});
  const [history, setHistory] = useState<Array<{ controlId: string; result: DebugResult }>>([]);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  
  // Copy button feedback state (ChatGPT-style)
  const [copiedButtonId, setCopiedButtonId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    readable: true,
    raw: false,
  });

  // Extract IDs from selected items
  const yardUid = selectedYard?.yardUid || '';
  const carId = selectedCar?.carId || '';

  // Load yards to memory
  const loadYardsToMemory = useCallback(async (force: boolean): Promise<void> => {
    if (DEBUG_DATA.loadedYards && !force) {
      return;
    }

    try {
      const listFn = httpsCallable<{}, { ok: boolean; results: YardLite[] }>(
        functions,
        'adminDebugListYards'
      );
      const result = await listFn({});
      
      if (result.data.ok && result.data.results) {
        DEBUG_DATA.yards = result.data.results;
        DEBUG_DATA.loadedYards = true;
        DEBUG_DATA.lastYardsLoadError = null;
        bumpUI();
      } else {
        DEBUG_DATA.lastYardsLoadError = 'Failed to load yards list';
      }
    } catch (error: any) {
      console.error('[YardsList] Error:', error);
      DEBUG_DATA.lastYardsLoadError = error.message || 'Failed to load yards list';
      // DO NOT clear DEBUG_DATA.yards - keep last good data
    }
  }, [bumpUI]);

  // Load cars for yard to memory
  const loadCarsForYardToMemory = useCallback(async (yardUid: string, force: boolean): Promise<void> => {
    if (DEBUG_DATA.carsByYard[yardUid] && !force) {
      return;
    }

    try {
      const listFn = httpsCallable<{ yardUid: string }, { ok: boolean; results: CarLite[] }>(
        functions,
        'adminDebugListYardCars'
      );
      const result = await listFn({ yardUid });
      
      if (result.data.ok && result.data.results) {
        DEBUG_DATA.carsByYard[yardUid] = result.data.results;
        DEBUG_DATA.lastCarsLoadErrorByYard[yardUid] = null;
        bumpUI();
      } else {
        DEBUG_DATA.lastCarsLoadErrorByYard[yardUid] = 'Failed to load cars list';
      }
    } catch (error: any) {
      console.error('[CarsList] Error:', error);
      DEBUG_DATA.lastCarsLoadErrorByYard[yardUid] = error.message || 'Failed to load cars list';
      // DO NOT clear DEBUG_DATA.carsByYard[yardUid] - keep last good data
    }
  }, [bumpUI]);

  // Load yards on mount
  useEffect(() => {
    loadYardsToMemory(false);
  }, [loadYardsToMemory]);

  // Load cars when yard changes
  useEffect(() => {
    if (yardUid) {
      loadCarsForYardToMemory(yardUid, false);
    }
  }, [yardUid, loadCarsForYardToMemory]);

  // Handle yard selection
  const handleYardSelected = useCallback((yard: YardSearchResult | null) => {
    setSelectedYard(yard);
    if (yard) {
      setYardInputValue(yard.yardName);
      // Clear car selection if yard changed (unless car belongs to new yard)
      if (selectedCar && selectedCar.yardUid !== yard.yardUid) {
        setSelectedCar(null);
        setCarInputValue('');
      }
    }
  }, [selectedCar]);

  // Handle car selection
  const handleCarSelected = useCallback((car: CarSearchResult | null) => {
    setSelectedCar(car);
    if (car) {
      const text = `${car.make ?? ''} ${car.model ?? ''}`.trim() + (car.year ? ` (${car.year})` : '');
      setCarInputValue(text || car.carId);
      // Auto-select yard if car has yardUid and yard not already selected
      if (car.yardUid && !yardUid) {
        setSelectedYard({
          yardUid: car.yardUid,
          yardName: car.yardUid, // Fallback to UID
        });
      }
    }
  }, [yardUid]);

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
        text: ctx.yardUid ? 'Yard selected' : 'Yard required',
        satisfied: !!ctx.yardUid,
      });
    }

    if (requires?.car) {
      tryAddBadge(badgeMap, seenText, {
        key: 'car',
        text: ctx.carId ? 'Car selected' : 'Car required',
        satisfied: !!ctx.carId,
      });
    }

    if (requires?.readOnlyOff) {
      tryAddBadge(badgeMap, seenText, {
        key: 'readOnly',
        text: !ctx.readOnly ? 'Read-only OFF' : 'Turn OFF Read-only',
        satisfied: !ctx.readOnly,
      });
    }

    if (requires?.verboseRecommended) {
      tryAddBadge(badgeMap, seenText, {
        key: 'verbose',
        text: 'Verbose (optional)',
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

  // Note: Keyboard handling is done by AutoCompleteInput component

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

  // Spinner component for Run buttons
  const Spinner = () => (
    <svg
      className="debug-btn-spinner"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="31.416"
        strokeDashoffset="23.562"
        opacity="0.3"
      />
      <circle
        cx="7"
        cy="7"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="31.416"
        strokeDashoffset="15.708"
        opacity="0.8"
      />
    </svg>
  );

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Copy to clipboard with ChatGPT-style feedback
  const copyToClipboard = useCallback((text: string, buttonId: string) => {
    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    
    navigator.clipboard.writeText(text).then(() => {
      // Set copied state
      setCopiedButtonId(buttonId);
      
      // Reset after 1750ms (ChatGPT-style timing)
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedButtonId(null);
        copyTimeoutRef.current = null;
      }, 1750);
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

  // Helper to get status explanation (English)
  const getStatusExplanation = (level: 'OK' | 'WARN' | 'FAIL'): string => {
    switch (level) {
      case 'OK':
        return 'Passed successfully, no action needed';
      case 'WARN':
        return 'Working but needs attention (e.g., fallback in use / optional fields missing / partial)';
      case 'FAIL':
        return 'Cannot verify or operation failed (permissions, not found, runtime error)';
      default:
        return '';
    }
  };

  // Scenario Runner state - per-scenario loading state
  const [runningScenarioId, setRunningScenarioId] = useState<'S0' | 'S1' | 'S2' | 'S3' | 'S4' | null>(null);
  const [scenarioResults, setScenarioResults] = useState<Record<string, Record<string, DebugResult>>>({});
  
  // Fixed scenario order for stable table columns
  const SCENARIO_ORDER: Array<'S0' | 'S1' | 'S2' | 'S3' | 'S4'> = ['S0', 'S1', 'S2', 'S3', 'S4'];

  // SAFE allowlist for Scenario Runner (read-only controls only)
  // These controls are safe because they are read-only and don't mutate production data
  const SAFE_CONTROL_IDS = [
    'public-listing-query', // Read-only query
    'yard-published-counts', // Read-only counts
    'master-car-state', // Read-only state check (only when carId exists)
    'public-car-state', // Read-only state check (only when carId exists)
    'master-public-diff', // Read-only diff (only when carId exists)
    'write-permission-probe', // Safe: writes only to debug path
    'functions-latency', // Read-only ping
    'detect-old-docs', // Read-only scan
    'master-undefined-scan', // Read-only scan (requires yard)
    'publish-signal-scan', // Read-only scan (requires yard)
  ];

  // Check if control is safe for Scenario Runner
  const isControlSafe = (controlId: string, ctx: DebugContext): boolean => {
    if (!SAFE_CONTROL_IDS.includes(controlId)) return false;
    
    const control = DEBUG_CONTROLS.find(c => c.id === controlId);
    if (!control) return false;
    
    // Check requirements
    const requires = control.requires;
    if (requires?.yard && !ctx.yardUid) return false;
    if (requires?.car && !ctx.carId) return false;
    
    return true;
  };

  // Run Scenario Runner
  const handleRunScenario = useCallback(async (scenario: 'S0' | 'S1' | 'S2' | 'S3' | 'S4') => {
    setRunningScenarioId(scenario);
    const scenarioResults: Record<string, DebugResult> = {};
    
    try {
      // Build scenario context
      let scenarioCtx: DebugContext = {
        limit: limit,
        verbose: scenario === 'S3' ? true : verbose,
        readOnly: scenario === 'S4' ? false : true, // S4 tests with readOnly OFF, others ON
      };
      
      if (scenario === 'S0') {
        // NO selections
        scenarioCtx.yardUid = undefined;
        scenarioCtx.carId = undefined;
      } else if (scenario === 'S1') {
        // Yard only
        scenarioCtx.yardUid = yardUid || undefined;
        scenarioCtx.carId = undefined;
      } else if (scenario === 'S2') {
        // Yard + Car
        scenarioCtx.yardUid = yardUid || undefined;
        scenarioCtx.carId = carId || undefined;
      } else if (scenario === 'S3') {
        // S2 + Verbose ON
        scenarioCtx.yardUid = yardUid || undefined;
        scenarioCtx.carId = carId || undefined;
        scenarioCtx.verbose = true;
      } else if (scenario === 'S4') {
        // S2 + Read-Only OFF
        scenarioCtx.yardUid = yardUid || undefined;
        scenarioCtx.carId = carId || undefined;
        scenarioCtx.readOnly = false;
      }
      
      // Get safe controls
      const safeControls = DEBUG_CONTROLS.filter(control => isControlSafe(control.id, scenarioCtx));
      
      // Run each control sequentially
      for (const control of safeControls) {
        try {
          const result = await runControl(control.id, scenarioCtx);
          scenarioResults[control.id] = result;
        } catch (error: any) {
          scenarioResults[control.id] = {
            ok: false,
            level: 'FAIL',
            title: control.title,
            summary: error.message || 'Unknown error',
            details: { error: error.message },
            ts: new Date().toISOString(),
          };
        }
        // Small delay between runs to avoid bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setScenarioResults(prev => ({ ...prev, [scenario]: scenarioResults }));
    } finally {
      // Always clear the running state, even on error
      setRunningScenarioId(null);
    }
  }, [yardUid, carId, limit, verbose]);

  return (
    <div className="debug-console-page admin-debug-root" dir="ltr" lang="en">
      <div className="debug-console-header">
        <h1>Admin Debug Console</h1>
        <p className="debug-warning">Admin only / Read-only by default</p>
      </div>

      {/* Two-Grid Layout */}
      <div className="debug-two-grid-layout">
        {/* Grid A: Selection & Query Controls */}
        <div className="debug-grid-a">
          <h2 className="debug-grid-title">Selection & Query Controls</h2>
          <div className="debug-inputs">
            {/* Yard picker */}
            <div className="debug-input-group">
              <AdminDebugYardPicker
                value={yardInputValue}
                selectedYard={selectedYard}
                onValueChange={setYardInputValue}
                onSelectedYardChange={handleYardSelected}
                yards={DEBUG_DATA.yards}
                yardsLoaded={DEBUG_DATA.loadedYards}
                yardsError={DEBUG_DATA.lastYardsLoadError}
                onLoadYards={(force) => { loadYardsToMemory(force).then(bumpUI); }}
                disabled={false}
              />
              {selectedYard && (
                <div className="debug-tech-details" style={{ marginTop: '0.5rem' }}>
                  <div className="debug-tech-detail">
                    <span className="debug-tech-label">yardUid:</span>
                    <code className="debug-tech-value">{selectedYard.yardUid}</code>
                    <button
                      className="debug-tech-copy"
                      onClick={() => copyToClipboard(selectedYard.yardUid, `yard-uid-${selectedYard.yardUid}`)}
                      disabled={copiedButtonId === `yard-uid-${selectedYard.yardUid}`}
                      title={copiedButtonId === `yard-uid-${selectedYard.yardUid}` ? "Copied" : "Copy"}
                    >
                      {copiedButtonId === `yard-uid-${selectedYard.yardUid}` ? '✓' : '📋'}
                    </button>
                  </div>
                  {selectedYard.city && (
                    <div className="debug-tech-detail">
                      <span className="debug-tech-label">city:</span>
                      <code className="debug-tech-value">{selectedYard.city}</code>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Car picker */}
            <div className="debug-input-group">
              <AdminDebugCarPicker
                value={carInputValue}
                selectedCar={selectedCar}
                onValueChange={setCarInputValue}
                onSelectedCarChange={handleCarSelected}
                yardUid={yardUid || null}
                cars={yardUid ? (DEBUG_DATA.carsByYard[yardUid] || []) : []}
                carsLoaded={!!(yardUid && DEBUG_DATA.carsByYard[yardUid])}
                carsError={yardUid ? (DEBUG_DATA.lastCarsLoadErrorByYard[yardUid] || null) : null}
                onLoadCars={(force) => { if (yardUid) loadCarsForYardToMemory(yardUid, force).then(bumpUI); }}
                disabled={false}
              />
              {selectedCar && (
                <div className="debug-tech-details" style={{ marginTop: '0.5rem' }}>
                  <div className="debug-tech-detail">
                    <span className="debug-tech-label">carId:</span>
                    <code className="debug-tech-value">{selectedCar.carId}</code>
                    <button
                      className="debug-tech-copy"
                      onClick={() => copyToClipboard(selectedCar.carId, `car-id-${selectedCar.carId}`)}
                      disabled={copiedButtonId === `car-id-${selectedCar.carId}`}
                      title={copiedButtonId === `car-id-${selectedCar.carId}` ? "Copied" : "Copy"}
                    >
                      {copiedButtonId === `car-id-${selectedCar.carId}` ? '✓' : '📋'}
                    </button>
                  </div>
                  {selectedCar.yardUid && selectedCar.yardUid !== yardUid && (
                    <div className="debug-tech-detail">
                      <span className="debug-tech-label">yardUid:</span>
                      <code className="debug-tech-value">{selectedCar.yardUid}</code>
                      <button
                        className="debug-tech-copy"
                        onClick={() => copyToClipboard(selectedCar.yardUid, `car-yard-uid-${selectedCar.yardUid}`)}
                        disabled={copiedButtonId === `car-yard-uid-${selectedCar.yardUid}`}
                        title={copiedButtonId === `car-yard-uid-${selectedCar.yardUid}` ? "Copied" : "Copy"}
                      >
                        {copiedButtonId === `car-yard-uid-${selectedCar.yardUid}` ? '✓' : '📋'}
                      </button>
                    </div>
                  )}
                  {selectedCar.plateNumber && (
                    <div className="debug-tech-detail">
                      <span className="debug-tech-label">plate:</span>
                      <div className="debug-tech-value-plate">
                        <LicensePlateBadge plate={selectedCar.plateNumber} size="sm" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="debug-input-group">
              <label>
                Limit (max results)
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 25)}
                  min={1}
                  max={1000}
                />
                <small className="debug-helper-text">
                  Limits how many documents/cars are scanned per check to maintain speed and avoid overloading Firestore/Functions. Example: 25 = quick check on last 25 records.
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
                <span>Verbose (more fields in report)</span>
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

          {/* Results Panel - Moved into Selection column */}
          <div className="debug-results-panel debug-results-ltr" dir="ltr" lang="en">
            <div className="debug-results-header">
              <h2>Results</h2>
              {currentResult && (
                <button
                  className="debug-btn debug-btn-small"
                  onClick={() => copyToClipboard(JSON.stringify(currentResult, null, 2), 'copy-result')}
                  disabled={copiedButtonId === 'copy-result'}
                  style={{ minWidth: '110px' }}
                >
                  {copiedButtonId === 'copy-result' ? 'Copied' : 'Copy Result'}
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
                      <strong>Next action:</strong> {currentResult.details.nextAction}
                    </div>
                  )}
                  <div className="debug-result-meta">
                    <small>Timestamp: {new Date(currentResult.ts).toLocaleString()}</small>
                        {(currentResult.correlationId || currentResult.details?.correlationId) && (
                      <small className="debug-correlation-display">
                        Correlation ID: <code dir="ltr" onClick={() => copyToClipboard(currentResult.correlationId || currentResult.details?.correlationId || '', 'copy-correlation-id')} style={{ cursor: 'pointer' }}>{currentResult.correlationId || currentResult.details?.correlationId}</code>
                      </small>
                    )}
                    {currentResult.details?.firebaseCode === 'internal' && (
                      <small className="debug-internal-error-hint">
                        Open logs with correlationId: {currentResult.correlationId || currentResult.details?.correlationId}
                      </small>
                    )}
                  </div>
                  <div className="debug-status-explanation">
                    <strong>What this means:</strong> {getStatusExplanation(currentResult.level)}
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
                                      <pre dir="ltr">{JSON.stringify(value, null, 2)}</pre>
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
                          <pre dir="ltr">{JSON.stringify(currentResult.detailsVerbose, null, 2)}</pre>
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
                      <pre dir="ltr">{JSON.stringify(currentResult, null, 2)}</pre>
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

        {/* Grid B: Action Controls */}
        <div className="debug-grid-b">
          <h2 className="debug-grid-title">Action Controls</h2>
          
          {/* Scenario Runner Section */}
          <div className="debug-scenario-runner-section">
            <h3 className="debug-section-title">Scenario Runner (Safe Read-Only Only)</h3>
            <p className="debug-section-desc">
              Runs safe read-only controls across different selection scenarios. Never runs destructive actions.
            </p>
            <div className="debug-scenario-buttons">
              <button
                className="debug-btn debug-btn-primary"
                onClick={() => handleRunScenario('S0')}
                disabled={runningScenarioId !== null}
              >
                {runningScenarioId === 'S0' && (
                  <>
                    <Spinner />{' '}
                  </>
                )}
                {runningScenarioId === 'S0' ? 'Running...' : 'Run S0: NO Selections'}
              </button>
              {yardUid && (
                <button
                  className="debug-btn debug-btn-primary"
                  onClick={() => handleRunScenario('S1')}
                  disabled={runningScenarioId !== null}
                >
                  {runningScenarioId === 'S1' && (
                    <>
                      <Spinner />{' '}
                    </>
                  )}
                  {runningScenarioId === 'S1' ? 'Running...' : 'Run S1: Yard Only'}
                </button>
              )}
              {yardUid && carId && (
                <>
                  <button
                    className="debug-btn debug-btn-primary"
                    onClick={() => handleRunScenario('S2')}
                    disabled={runningScenarioId !== null}
                  >
                    {runningScenarioId === 'S2' && (
                      <>
                        <Spinner />{' '}
                      </>
                    )}
                    {runningScenarioId === 'S2' ? 'Running...' : 'Run S2: Yard + Car'}
                  </button>
                  <button
                    className="debug-btn debug-btn-secondary"
                    onClick={() => handleRunScenario('S3')}
                    disabled={runningScenarioId !== null}
                  >
                    {runningScenarioId === 'S3' && (
                      <>
                        <Spinner />{' '}
                      </>
                    )}
                    {runningScenarioId === 'S3' ? 'Running...' : 'Run S3: S2 + Verbose'}
                  </button>
                  <button
                    className="debug-btn debug-btn-secondary"
                    onClick={() => handleRunScenario('S4')}
                    disabled={runningScenarioId !== null}
                  >
                    {runningScenarioId === 'S4' && (
                      <>
                        <Spinner />{' '}
                      </>
                    )}
                    {runningScenarioId === 'S4' ? 'Running...' : 'Run S4: S2 + Read-Only OFF'}
                  </button>
                </>
              )}
            </div>
            
            {/* Scenario Results Table - Always show, with default empty state */}
            <div className="debug-scenario-results">
              <h4>Scenario Results</h4>
              <div className="debug-scenario-table-wrapper">
                <table className="debug-scenario-table">
                  <thead>
                    <tr>
                      <th>Control</th>
                      {SCENARIO_ORDER.map(scenario => (
                        <th key={scenario}>{scenario}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SAFE_CONTROL_IDS.map(controlId => {
                      const control = DEBUG_CONTROLS.find(c => c.id === controlId);
                      if (!control) return null;
                      
                      return (
                        <tr key={controlId}>
                          <td className="debug-scenario-control-name">{control.title}</td>
                          {SCENARIO_ORDER.map(scenario => {
                            const result = scenarioResults[scenario]?.[controlId];
                            
                            // If no result, check if scenario was run or should show empty
                            if (!result) {
                              // If scenario was never run, show EMPTY
                              if (!scenarioResults[scenario]) {
                                return (
                                  <td key={scenario} className="debug-scenario-cell debug-scenario-skip">
                                    —
                                  </td>
                                );
                              }
                              
                              // Scenario was run but this control didn't run - check if it should have
                              const scenarioCtx: DebugContext = scenario === 'S0' 
                                ? { yardUid: undefined, carId: undefined, limit, verbose, readOnly: true }
                                : scenario === 'S1'
                                ? { yardUid: yardUid || undefined, carId: undefined, limit, verbose, readOnly: true }
                                : scenario === 'S3'
                                ? { yardUid: yardUid || undefined, carId: carId || undefined, limit, verbose: true, readOnly: true }
                                : scenario === 'S4'
                                ? { yardUid: yardUid || undefined, carId: carId || undefined, limit, verbose, readOnly: false }
                                : { yardUid: yardUid || undefined, carId: carId || undefined, limit, verbose, readOnly: true };
                              
                              const shouldRun = isControlSafe(controlId, scenarioCtx);
                              return (
                                <td key={scenario} className="debug-scenario-cell debug-scenario-skip">
                                  {shouldRun ? 'N/A' : 'SKIP'}
                                </td>
                              );
                            }
                            
                            // Result exists - show it
                            const cellClass = result.ok 
                              ? (result.level === 'WARN' ? 'debug-scenario-warn' : 'debug-scenario-pass')
                              : 'debug-scenario-fail';
                            
                            return (
                              <td key={scenario} className={`debug-scenario-cell ${cellClass}`}>
                                <details>
                                  <summary>
                                    {result.level} {result.ok ? '✓' : '✗'}
                                  </summary>
                                  <div className="debug-scenario-cell-details">
                                    <p><strong>Summary:</strong> {result.summary}</p>
                                    {result.correlationId && (
                                      <p><strong>Correlation ID:</strong> <code className="dbg-ltr" dir="ltr">{result.correlationId}</code></p>
                                    )}
                                    <button
                                      className="debug-btn debug-btn-small"
                                      onClick={() => copyToClipboard(JSON.stringify(result, null, 2), `copy-json-${scenario}-${controlId}`)}
                                      disabled={copiedButtonId === `copy-json-${scenario}-${controlId}`}
                                      style={{ minWidth: '100px' }}
                                    >
                                      {copiedButtonId === `copy-json-${scenario}-${controlId}` ? 'Copied' : 'Copy JSON'}
                                    </button>
                                    <pre className="dbg-ltr" dir="ltr" style={{ fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
                                      {JSON.stringify(result, null, 2)}
                                    </pre>
                                  </div>
                                </details>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                      {running === 'publish-bundle' && (
                        <>
                          <Spinner />{' '}
                        </>
                      )}
                      {running === 'publish-bundle' ? 'Running...' : 'Run Publish Bundle'}
                    </button>
                    <div className="debug-bundle-badges">
                      {publishBundleBadges.map((badge) => (
                        <span
                          key={badge.key}
                          data-badge-key={badge.key}
                          data-badge-text={badge.text}
                          className={`debug-requirement-badge ${badge.satisfied ? 'debug-requirement-satisfied' : 'debug-requirement-missing'}`}
                          title={badge.satisfied ? 'Satisfied' : 'Missing'}
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
                      {running === 'yard-bundle' && (
                        <>
                          <Spinner />{' '}
                        </>
                      )}
                      {running === 'yard-bundle' ? 'Running...' : 'Run Yard Bundle'}
                    </button>
                    <div className="debug-bundle-badges">
                      {yardBundleBadges.map((badge) => (
                        <span
                          key={badge.key}
                          data-badge-key={badge.key}
                          data-badge-text={badge.text}
                          className={`debug-requirement-badge ${badge.satisfied ? 'debug-requirement-satisfied' : 'debug-requirement-missing'}`}
                          title={badge.satisfied ? 'Satisfied' : 'Missing'}
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

          {/* Grouped Controls */}
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
                                  title={badge.satisfied ? 'Satisfied' : 'Missing'}
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
                          {isRunning && (
                            <>
                              <Spinner />{' '}
                            </>
                          )}
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
                            {running === 'repair-selected-car' && (
                              <>
                                <Spinner />{' '}
                              </>
                            )}
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
      </div>
    </div>
  );
}
