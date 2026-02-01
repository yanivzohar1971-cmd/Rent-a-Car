/**
 * DEBUG ADMIN CONSOLE PAGE - Topic-Based UI
 * 
 * This page provides admin-only debug tools for the Rent-a-Car platform.
 * Organized into topics with context-aware availability.
 * 
 * ARCHITECTURE:
 * - LEFT: Topic navigation + Context selection (Yard/Car pickers, options)
 * - RIGHT: Audit card (top) + Results (bottom)
 * 
 * TOPICS:
 * - Defined in debugTopics.ts
 * - Each topic has availability predicate based on context (hasYard, hasCar, etc.)
 * - Topics map to debug controls from debugControls.ts
 * 
 * SPECIAL CASES:
 * - Scenario Runner: Custom UI (not part of standard topic flow)
 * 
 * PERSISTENCE:
 * - Last selected topic saved to localStorage
 * - Last 5 runs per topic saved to localStorage
 * 
 * DEV NOTES:
 * - All state and logic preserved from previous version
 * - Topic system is additive (no functionality removed)
 * - Car/Yard pickers unchanged
 * - Scenario runner logic intact
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  DEBUG_CONTROLS, 
  runControl, 
  getControlDisabledReason,
  generateCorrelationId,
  type DebugContext, 
  type DebugResult,
} from '../../adminDebug/debugControls';
import {
  getAvailableTopics,
  getTopicByKey,
  buildTopicContext,
  saveLastSelectedTopic,
  loadLastSelectedTopic,
  saveTopicResults,
  loadTopicResults,
  type TopicContext,
} from '../../adminDebug/debugTopics';
import LicensePlateBadge from '../../components/common/LicensePlateBadge';
import AdminDebugYardPicker from './components/AdminDebugYardPicker';
import AdminDebugCarPicker from './components/AdminDebugCarPicker';
import DebugTopicAuditCard from './components/DebugTopicAuditCard';
import DebugTopicResults from './components/DebugTopicResults';
import BulkSnapshotRepairPanel from './components/BulkSnapshotRepairPanel';
import RunProgressHeader from './components/RunProgressHeader';
import { ActionStatusBar } from '../../components/debug/ActionStatusBar';
import { SmartCopyButton, SmartCopyIconButton } from '../../components/common/SmartCopyButton';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { functions, db } from '../../firebase/firebaseClient';
import './DebugConsolePage.css';

interface YardSearchResult {
  yardUid: string;
  yardName: string;
  city?: string;
}

type YardLite = { yardUid: string; name?: string | null; phones?: string[] | null };
type CarLite = {
  carId: string;
  plateNumber?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  title?: string | null;
  source?: 'MASTER' | 'PUBLIC' | 'BOTH';
  isPublished?: boolean;
};

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
  // ========================================
  // YARD STATE
  // ========================================
  const [yardInputValue, setYardInputValue] = useState('');
  const [selectedYard, setSelectedYard] = useState<YardSearchResult | null>(null);
  const [yards, setYards] = useState<YardLite[]>([]);
  const [yardsLoading, setYardsLoading] = useState(true);
  const [yardsError, setYardsError] = useState<string | null>(null);
  
  // ========================================
  // CAR STATE
  // ========================================
  const [carInputValue, setCarInputValue] = useState('');
  const [selectedCar, setSelectedCar] = useState<CarSearchResult | null>(null);
  const [carsByYard, setCarsByYard] = useState<Record<string, CarLite[]>>({});
  const [publicCarsByYard, setPublicCarsByYard] = useState<Record<string, CarLite[]>>({});
  const [carsLoadingByYard, setCarsLoadingByYard] = useState<Record<string, boolean>>({});
  const [publicCarsLoadingByYard, setPublicCarsLoadingByYard] = useState<Record<string, boolean>>({});
  const [carsErrorByYard, setCarsErrorByYard] = useState<Record<string, string | null>>({});
  const [publicCarsErrorByYard, setPublicCarsErrorByYard] = useState<Record<string, string | null>>({});
  const [carSource, setCarSource] = useState<'MASTER' | 'PUBLIC' | 'ALL'>('MASTER');
  const [forceRefresh, setForceRefresh] = useState(0);
  
  // ========================================
  // DEBUG OPTIONS STATE
  // ========================================
  const [limit, setLimit] = useState(25);
  const [verbose, setVerbose] = useState(false);
  const [readOnly, setReadOnly] = useState(true);

  // ========================================
  // TOPIC NAVIGATION STATE
  // ========================================
  const [selectedTopicKey, setSelectedTopicKey] = useState<string | null>(null);
  const [topicRunning, setTopicRunning] = useState(false);
  const [topicResults, setTopicResults] = useState<DebugResult[]>([]);
  const [topicHistory, setTopicHistory] = useState<Array<{ timestamp: string; results: DebugResult[] }>>([]);
  const [topicRunProgress, setTopicRunProgress] = useState<{
    running: boolean;
    currentIndex: number;
    total: number;
    currentLabel: string;
    error: string | null;
    startedAtMs: number;
    finishedAtMs: number;
  }>({
    running: false,
    currentIndex: 0,
    total: 0,
    currentLabel: '',
    error: null,
    startedAtMs: 0,
    finishedAtMs: 0,
  });

  // ========================================
  // SCENARIO RUNNER STATE (LEGACY)
  // ========================================
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [scenarioResults, setScenarioResults] = useState<Array<{ scenario: string; results: DebugResult[] }>>([]);
  const [scenarioRun, setScenarioRun] = useState<{
    running: boolean;
    currentScenarioIndex: number;
    totalScenarios: number;
    runningScenarioName: string;
    error: string | null;
    startedAtMs: number;
    finishedAtMs: number;
  }>({
    running: false,
    currentScenarioIndex: 0,
    totalScenarios: 0,
    runningScenarioName: '',
    error: null,
    startedAtMs: 0,
    finishedAtMs: 0,
  });

  // ========================================
  // REBUILD YARD PROGRESS STATE
  // ========================================
  const [rebuildYardRunning, setRebuildYardRunning] = useState(false);
  const [rebuildYardProgress, setRebuildYardProgress] = useState<{
    total?: number;
    processed?: number;
    upserted?: number;
    unpublished?: number;
    errors?: number;
    done?: boolean;
    yardUid?: string;
  }>({});
  const [rebuildYardError, setRebuildYardError] = useState<string | null>(null);

  // ========================================
  // QUICK FILL STATE (Direct ID Override)
  // ========================================
  const [quickFillYardUid, setQuickFillYardUid] = useState('');
  const [quickFillCarId, setQuickFillCarId] = useState('');
  const [quickFillMode, setQuickFillMode] = useState(false);

  // Extract IDs from selected items OR quick fill override
  // Quick fill takes precedence when enabled
  const yardUid = quickFillMode && quickFillYardUid ? quickFillYardUid : (selectedYard?.yardUid || '');
  const carId = quickFillMode && quickFillCarId ? quickFillCarId : (selectedCar?.carId || '');

  // ========================================
  // BUILD DEBUG CONTEXT
  // ========================================
  const debugContext: DebugContext = useMemo(
    () => ({
      yardUid,
      carId,
      limit,
      verbose,
      readOnly,
    }),
    [yardUid, carId, limit, verbose, readOnly]
  );

  // Build topic context
  const topicContext: TopicContext = useMemo(
    () => buildTopicContext(debugContext, false), // TODO: detect superAdmin from auth
    [debugContext]
  );

  // Get available topics based on current context
  const availableTopics = useMemo(() => getAvailableTopics(topicContext), [topicContext]);

  // ========================================
  // LOAD YARDS ON MOUNT
  // ========================================
  useEffect(() => {
    async function loadYards() {
      setYardsLoading(true);
      setYardsError(null);
      try {
        const listFn = httpsCallable<{}, { ok: boolean; results: YardLite[] }>(functions, 'adminDebugListYards');
        const result = await listFn({});
        if (result.data.ok && result.data.results) {
          // Dedupe by UID only (never by name); sort by name then uid
          const byUid = new Map<string, YardLite>();
          for (const y of result.data.results) if (y?.yardUid) byUid.set(y.yardUid, y);
          const yardsFinal = Array.from(byUid.values()).sort((a, b) => {
            const nameA = a.name ?? '';
            const nameB = b.name ?? '';
            const nc = nameA.localeCompare(nameB, 'he');
            return nc !== 0 ? nc : (a.yardUid || '').localeCompare(b.yardUid || '');
          });
          setYards(yardsFinal);
        } else {
          setYardsError('Failed to load yards list');
        }
      } catch (error: any) {
        console.error('[YardsList] Error:', error);
        setYardsError(error.message || 'Failed to load yards list');
      } finally {
        setYardsLoading(false);
      }
    }
    loadYards();
  }, []);

  // ========================================
  // LOAD CARS WHEN YARD IS SELECTED
  // ========================================
  useEffect(() => {
    if (!yardUid) {
      return;
    }

    async function loadMasterCars() {
      setCarsLoadingByYard((prev) => ({ ...prev, [yardUid]: true }));
      setCarsErrorByYard((prev) => ({ ...prev, [yardUid]: null }));
      try {
        const listFn = httpsCallable<{ yardUid: string }, { ok: boolean; results: CarLite[] }>(
          functions,
          'adminDebugListYardCars'
        );
        const result = await listFn({ yardUid });
        if (result.data.ok && result.data.results) {
          setCarsByYard((prev) => ({ ...prev, [yardUid]: result.data.results }));
        } else {
          setCarsErrorByYard((prev) => ({ ...prev, [yardUid]: 'Failed to load MASTER cars' }));
        }
      } catch (error: any) {
        console.error('[CarsList MASTER] Error:', error);
        setCarsErrorByYard((prev) => ({ ...prev, [yardUid]: error.message || 'Failed to load MASTER cars' }));
      } finally {
        setCarsLoadingByYard((prev) => ({ ...prev, [yardUid]: false }));
      }
    }

    async function loadPublicCars() {
      setPublicCarsLoadingByYard((prev) => ({ ...prev, [yardUid]: true }));
      setPublicCarsErrorByYard((prev) => ({ ...prev, [yardUid]: null }));
      try {
        const listFn = httpsCallable<{ yardUid: string }, { ok: boolean; results: CarLite[] }>(
          functions,
          'adminDebugListPublicCars'
        );
        const result = await listFn({ yardUid });
        if (result.data.ok && result.data.results) {
          setPublicCarsByYard((prev) => ({ ...prev, [yardUid]: result.data.results }));
        } else {
          setPublicCarsErrorByYard((prev) => ({ ...prev, [yardUid]: 'Failed to load PUBLIC cars' }));
        }
      } catch (error: any) {
        console.error('[CarsList PUBLIC] Error:', error);
        setPublicCarsErrorByYard((prev) => ({ ...prev, [yardUid]: error.message || 'Failed to load PUBLIC cars' }));
      } finally {
        setPublicCarsLoadingByYard((prev) => ({ ...prev, [yardUid]: false }));
      }
    }

    if (carSource === 'MASTER') {
      loadMasterCars();
    } else if (carSource === 'PUBLIC') {
      loadPublicCars();
    } else {
      // Load both
      loadMasterCars();
      loadPublicCars();
    }
  }, [yardUid, carSource, forceRefresh]);

  // ========================================
  // RESTORE LAST SELECTED TOPIC ON MOUNT
  // ========================================
  useEffect(() => {
    const lastTopic = loadLastSelectedTopic();
    if (lastTopic) {
      // Check if topic is still available in current context
      const topicDef = getTopicByKey(lastTopic);
      if (topicDef && topicDef.isAvailable(topicContext)) {
        setSelectedTopicKey(lastTopic);
        // Load history for this topic
        const history = loadTopicResults(lastTopic);
        setTopicHistory(history);
      }
    }
  }, []); // Only on mount

  // ========================================
  // HANDLE TOPIC SELECTION
  // ========================================
  const handleTopicSelect = useCallback(
    (topicKey: string) => {
      setSelectedTopicKey(topicKey);
      saveLastSelectedTopic(topicKey);

      // Load history for selected topic
      const history = loadTopicResults(topicKey);
      setTopicHistory(history);

      // Show latest results if available
      if (history.length > 0) {
        setTopicResults(history[0].results);
      } else {
        setTopicResults([]);
      }
    },
    []
  );

  // ========================================
  // HANDLE TOPIC RUN
  // ========================================
  const handleTopicRun = useCallback(async () => {
    if (!selectedTopicKey || topicRunning) return;

    const topicDef = getTopicByKey(selectedTopicKey);
    if (!topicDef) return;

    // Special case: Scenario Runner uses custom logic
    if (topicDef.key === 'scenario-runner') {
      await handleRunScenarios();
      return;
    }

    // Build list of runnable checks
    const checks = topicDef.controlIds
      .map(controlId => {
        const control = DEBUG_CONTROLS.find((c) => c.id === controlId);
        if (!control) return null;
        const disabledReason = getControlDisabledReason(control, debugContext);
        if (disabledReason) return null;
        return control;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    setTopicRunning(true);
    setTopicRunProgress({
      running: true,
      currentIndex: 0,
      total: checks.length,
      currentLabel: checks.length > 0 ? checks[0].title : '',
      error: null,
      startedAtMs: Date.now(),
      finishedAtMs: 0,
    });

    const results: DebugResult[] = [];

    try {
      // Run all controls in topic sequentially
      for (let i = 0; i < checks.length; i++) {
        const control = checks[i];

        // Update progress before executing check
        setTopicRunProgress(prev => ({
          ...prev,
          currentIndex: i,
          currentLabel: control.title,
        }));

        // Allow UI to paint
        await new Promise(resolve => setTimeout(resolve, 0));

        // Run control
        try {
          const result = await runControl(control.id, debugContext);
          results.push(result);
        } catch (error) {
          console.error(`[TopicRun] Error running control ${control.id}:`, error);
          results.push({
            ok: false,
            level: 'FAIL',
            title: control.title,
            summary: `Failed to run: ${error}`,
            ts: new Date().toISOString(),
            details: { error: String(error) },
          });
        }
      }

      // Save results to state and localStorage
      setTopicResults(results);
      saveTopicResults(selectedTopicKey, results);

      // Reload history
      const history = loadTopicResults(selectedTopicKey);
      setTopicHistory(history);

      setTopicRunProgress(prev => ({
        ...prev,
        running: false,
        finishedAtMs: Date.now(),
        error: null,
      }));
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      setTopicRunProgress(prev => ({
        ...prev,
        running: false,
        finishedAtMs: Date.now(),
        error: errorMsg,
      }));
    } finally {
      setTopicRunning(false);
    }
  }, [selectedTopicKey, topicRunning, debugContext]);

  // ========================================
  // HANDLE HISTORY RUN SELECTION
  // ========================================
  const handleSelectHistoryRun = useCallback(
    (historyIndex: number) => {
      if (topicHistory[historyIndex]) {
        setTopicResults(topicHistory[historyIndex].results);
      }
    },
    [topicHistory]
  );

  // ========================================
  // SCENARIO RUNNER LOGIC (SPECIAL CASE)
  // ========================================
  const handleRunScenarios = useCallback(async () => {
    // Define test scenarios (read-only controls only)
    // IMPORTANT: Use REAL IDs from context, never placeholders
    // If yardUid/carId are missing, skip that scenario (don't use test data)
    const scenarios = [
      { label: 'No Selection', yardUid: '', carId: '' },
      ...(yardUid ? [{ label: 'Yard Only', yardUid: yardUid, carId: '' }] : []),
      ...(carId ? [{ label: 'Car Only', yardUid: '', carId: carId }] : []),
      ...(yardUid && carId ? [{ label: 'Yard + Car', yardUid: yardUid, carId: carId }] : []),
    ];

    // Initialize progress state
    setScenarioRunning(true);
    setScenarioResults([]);
    setScenarioRun({
      running: true,
      currentScenarioIndex: 0,
      totalScenarios: scenarios.length,
      runningScenarioName: scenarios[0].label,
      error: null,
      startedAtMs: Date.now(),
      finishedAtMs: 0,
    });

    // Safe controls allowlist (read-only only)
    const safeControlIds = [
      'master-car-state',
      'public-car-state',
      'master-public-diff',
      'yard-published-counts',
      'public-listing-query',
      'detect-old-docs',
      'functions-latency',
    ];

    const allResults: Array<{ scenario: string; results: DebugResult[] }> = [];

    try {
      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];

        // Update progress before executing scenario
        setScenarioRun(prev => ({
          ...prev,
          currentScenarioIndex: i,
          runningScenarioName: scenario.label,
        }));

        // Allow UI to paint
        await new Promise(resolve => setTimeout(resolve, 0));

        const scenarioContext: DebugContext = {
          yardUid: scenario.yardUid,
          carId: scenario.carId,
          limit,
          verbose,
          readOnly: true, // Force read-only
        };

        const scenarioResults: DebugResult[] = [];

        for (const controlId of safeControlIds) {
          const control = DEBUG_CONTROLS.find((c) => c.id === controlId);
          if (!control) continue;

          const disabledReason = getControlDisabledReason(control, scenarioContext);
          if (disabledReason) {
            continue;
          }

          try {
            const result = await runControl(control.id, scenarioContext);
            scenarioResults.push(result);
          } catch (error) {
            console.error(`[ScenarioRunner] Error in ${scenario.label}/${controlId}:`, error);
            scenarioResults.push({
              ok: false,
              level: 'FAIL',
              title: control.title,
              summary: `Failed: ${error}`,
              ts: new Date().toISOString(),
              details: { error: String(error) },
            });
          }
        }

        allResults.push({
          scenario: scenario.label,
          results: scenarioResults,
        });
      }

      setScenarioResults(allResults);
      setScenarioRun(prev => ({
        ...prev,
        running: false,
        finishedAtMs: Date.now(),
      }));
      setScenarioRunning(false);
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      setScenarioRun(prev => ({
        ...prev,
        running: false,
        finishedAtMs: Date.now(),
        error: errorMsg,
      }));
      setScenarioRunning(false);
    }
  }, [yardUid, carId, limit, verbose]);

  // ========================================
  // HANDLE YARD SELECTION
  // ========================================
  const handleYardSelected = useCallback(
    (yard: YardSearchResult | null) => {
      setSelectedYard(yard);
      if (yard) {
        setYardInputValue(yard.yardName);
        // Clear car selection if yard changed
        if (selectedCar && selectedCar.yardUid !== yard.yardUid) {
          setSelectedCar(null);
          setCarInputValue('');
        }
      }
    },
    [selectedCar]
  );

  // ========================================
  // HANDLE CAR SELECTION
  // ========================================
  const handleCarSelected = useCallback((car: CarSearchResult | null) => {
    setSelectedCar(car);
    if (car) {
      const text = `${car.make ?? ''} ${car.model ?? ''}`.trim() + (car.year ? ` (${car.year})` : '');
      setCarInputValue(text || car.carId);
    }
  }, []);

  // ========================================
  // CAR SOURCE TOGGLE
  // ========================================
  const handleCarSourceChange = useCallback((source: 'MASTER' | 'PUBLIC' | 'ALL') => {
    setCarSource(source);
    setSelectedCar(null);
    setCarInputValue('');
  }, []);

  // ========================================
  // RENDER: SELECTED TOPIC CONTENT
  // ========================================
  const selectedTopic = selectedTopicKey ? getTopicByKey(selectedTopicKey) : null;

  // ========================================
  // RENDER
  // ========================================
  return (
    <div className="debug-console-page">
      <div className="admin-debug-root">
        <h1 className="debug-console-title">Admin Debug Console (Topic-Based UI)</h1>

        <div className="debug-topic-layout">
          {/* LEFT PANEL: Topics Nav + Context */}
          <div className="debug-topics-nav">
            <h2 className="debug-topics-nav-title">Topics</h2>
            <ul className="debug-topics-list">
              {availableTopics.map((topic) => (
                <li
                  key={topic.key}
                  className={`debug-topic-item ${selectedTopicKey === topic.key ? 'selected' : ''}`}
                  onClick={() => handleTopicSelect(topic.key)}
                >
                  <span className="debug-topic-item-icon">{topic.icon}</span>
                  <span className="debug-topic-item-label">{topic.label}</span>
                </li>
              ))}
            </ul>

            <div className="debug-topics-context">
              <h3 className="debug-topics-context-title">Context Selection</h3>

              {/* Yard Picker - Hidden by default, shown under Advanced (optional) */}
              <details className="debug-advanced-context" open={Boolean(selectedYard)}>
                <summary className="debug-advanced-context-summary">Advanced (optional)</summary>

                <div className="debug-input-group">
                  <label className="debug-label">Yard</label>
                  <AdminDebugYardPicker
                    value={yardInputValue}
                    onValueChange={setYardInputValue}
                    selectedYard={selectedYard}
                    onSelectedYardChange={handleYardSelected}
                    yards={yards}
                    yardsLoaded={!yardsLoading}
                    yardsError={yardsError}
                  />
                  {selectedYard && (
                    <div className="debug-selected-yard-info">
                      <span>
                        Selected: {selectedYard.yardName} ({selectedYard.yardUid}){' '}
                        <SmartCopyIconButton text={selectedYard.yardUid} />
                      </span>
                    </div>
                  )}
                </div>

                <p className="debug-hint">
                  Selecting a yard enables car autocomplete. Not required for global admin carId/plate search.
                </p>
              </details>

              {/* Car Source Toggle */}
              <div className="debug-input-group">
                <label className="debug-label">Car Source</label>
                <div className="debug-source-toggle">
                    <button
                    className={`debug-source-btn ${carSource === 'MASTER' ? 'active' : ''}`}
                    onClick={() => handleCarSourceChange('MASTER')}
                  >
                    MASTER
                  </button>
                  <button
                    className={`debug-source-btn ${carSource === 'PUBLIC' ? 'active' : ''}`}
                    onClick={() => handleCarSourceChange('PUBLIC')}
                  >
                    PUBLIC
                  </button>
                  <button
                    className={`debug-source-btn ${carSource === 'ALL' ? 'active' : ''}`}
                    onClick={() => handleCarSourceChange('ALL')}
                  >
                    ALL
                    </button>
                  </div>
            </div>

              {/* Car Picker */}
            <div className="debug-input-group">
                <label className="debug-label">Car</label>
                {yardUid ? (
                  // Yard selected: Use autocomplete picker
                  <>
              <AdminDebugCarPicker
                value={carInputValue}
                onValueChange={setCarInputValue}
                      selectedCar={selectedCar}
                onSelectedCarChange={handleCarSelected}
                      yardUid={yardUid}
                      carsForSelectedYard={
                        carSource === 'MASTER'
                          ? carsByYard[yardUid] || []
                          : carSource === 'PUBLIC'
                          ? publicCarsByYard[yardUid] || []
                          : [...(carsByYard[yardUid] || []), ...(publicCarsByYard[yardUid] || [])]
                      }
                      carsLoaded={!carsLoadingByYard[yardUid] && !publicCarsLoadingByYard[yardUid]}
                      carsError={carsErrorByYard[yardUid] || publicCarsErrorByYard[yardUid]}
              />
              {selectedCar && (
                      <div className="debug-selected-car-info">
                        <span>
                          {selectedCar.plateNumber && <LicensePlateBadge plate={selectedCar.plateNumber} />}{' '}
                          {selectedCar.make} {selectedCar.model} ({selectedCar.carId.slice(0, 8)}...){' '}
                          <SmartCopyIconButton text={selectedCar.carId} />
                        </span>
                        {selectedCar.yardUid && (
                          <span>
                            Yard: {selectedCar.yardUid} <SmartCopyIconButton text={selectedCar.yardUid} />
                          </span>
                        )}
                    </div>
                  )}
                  </>
                ) : (
                  // No yard: Direct search mode
                  <div className="debug-direct-search">
                    <input
                      type="text"
                      className="debug-input"
                      placeholder="Enter carId or plate to search globally..."
                      value={carInputValue}
                      onChange={(e) => setCarInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && carInputValue.trim()) {
                          // Trigger direct search (admin can search without yard)
                          // For now, just set a pseudo car with the entered ID
                          // In production, this would call adminDebugSearchCars(undefined, carInputValue)
                          const searchTerm = carInputValue.trim();
                          setSelectedCar({
                            carId: searchTerm,
                            yardUid: '', // Unknown until car is found
                            plateNumber: '',
                            make: '',
                            model: '',
                            year: undefined,
                            title: `Direct search: ${searchTerm}`,
                          });
                        }
                      }}
                    />
                    <p className="debug-hint">
                      Admin mode: Enter car ID or plate number and press Enter to search globally (no yard required)
                    </p>
                    {selectedCar && (
                      <div className="debug-selected-car-info">
                        <span>
                          Direct search: {selectedCar.carId} <SmartCopyIconButton text={selectedCar.carId} />
                        </span>
                    </div>
                  )}
                </div>
              )}
            </div>

              {/* Debug Options */}
            <div className="debug-input-group">
                <label className="debug-label">Options</label>
                <div className="debug-options-row">
                  <label className="debug-checkbox-label">
                    <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} min={1} max={100} />
                    <span>Limit</span>
              </label>
                  <label className="debug-checkbox-label">
                    <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
                    <span>Verbose</span>
              </label>
                  <label className="debug-checkbox-label">
                    <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
                    <span>Read-Only</span>
              </label>
            </div>
          </div>

              {/* Refresh Button */}
              <div className="debug-input-group">
                <button className="debug-btn debug-btn-small" onClick={() => setForceRefresh((prev) => prev + 1)}>
                  🔄 Refresh Cars List
                  </button>
              </div>
                  </div>
                </div>

          {/* RIGHT PANEL: Audit Card + Results */}
          <div className="debug-topic-content">
            {selectedTopic ? (
              <>
                {/* Audit Card */}
                {selectedTopic.key === 'scenario-runner' ? (
                  // Special case: Scenario Runner has custom UI
                  <div className="debug-topic-audit-card">
                    <div className="debug-topic-card-header">
                      <div className="debug-topic-card-title-row">
                        <span className="debug-topic-card-icon">{selectedTopic.icon}</span>
                        <h2 className="debug-topic-card-title">{selectedTopic.label}</h2>
                        </div>
                  <button
                        className="debug-btn debug-btn-primary"
                        onClick={handleRunScenarios}
                        disabled={scenarioRunning}
                  >
                        {scenarioRunning ? 'Running...' : 'Run Scenarios'}
                  </button>
                    </div>
                    <p className="debug-topic-card-description">{selectedTopic.description}</p>
                    <div className="debug-topic-card-prerequisites">
                      <strong>Note:</strong> This runner tests safe read-only controls using REAL yard/car IDs from your current selection. 
                      Scenarios are only included if the required IDs are available (no placeholder data).
                    </div>
                    {(!yardUid && !carId) && (
                      <div className="debug-topic-card-prerequisites" style={{ color: '#f57c00', marginTop: '8px' }}>
                        <strong>⚠️ No selection:</strong> Select a yard or car to run meaningful scenarios.
                      </div>
                    )}
                    
                    {/* Quick Fill Helper - Direct ID Input */}
                    <details 
                      className="debug-quick-fill-section"
                      style={{ 
                        marginTop: '16px', 
                        padding: '12px', 
                        backgroundColor: '#f0f7ff', 
                        borderRadius: '6px',
                        border: '1px solid #cce0ff'
                      }}
                      open={quickFillMode}
                    >
                      <summary 
                        style={{ 
                          cursor: 'pointer', 
                          fontWeight: 600, 
                          color: '#1976d2',
                          marginBottom: quickFillMode ? '12px' : '0'
                        }}
                        onClick={(e) => {
                          // Toggle quick fill mode when details is toggled
                          const details = e.currentTarget.parentElement as HTMLDetailsElement;
                          // Delay to let native toggle happen
                          setTimeout(() => setQuickFillMode(details.open), 0);
                        }}
                      >
                        🎯 Quick Fill — Test Specific IDs
                      </summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ minWidth: '70px', fontWeight: 500, fontSize: '13px' }}>yardUid:</label>
                          <input
                            type="text"
                            className="debug-input"
                            placeholder="e.g., 72HNYgtEdWV0zn19I6H51TSzPEj1"
                            value={quickFillYardUid}
                            onChange={(e) => setQuickFillYardUid(e.target.value.trim())}
                            style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ minWidth: '70px', fontWeight: 500, fontSize: '13px' }}>carId:</label>
                          <input
                            type="text"
                            className="debug-input"
                            placeholder="e.g., 72HNYgtEdWV0zn19I6H51TSzPEj1_3228154_2014"
                            value={quickFillCarId}
                            onChange={(e) => setQuickFillCarId(e.target.value.trim())}
                            style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button
                            className="debug-btn debug-btn-small"
                            onClick={() => {
                              // Use current selection
                              if (selectedYard?.yardUid) setQuickFillYardUid(selectedYard.yardUid);
                              if (selectedCar?.carId) setQuickFillCarId(selectedCar.carId);
                            }}
                            style={{ fontSize: '12px' }}
                            title="Copy IDs from current picker selection"
                          >
                            📋 Use Current Selection
                          </button>
                          <button
                            className="debug-btn debug-btn-small"
                            onClick={() => {
                              setQuickFillYardUid('');
                              setQuickFillCarId('');
                            }}
                            style={{ fontSize: '12px' }}
                          >
                            🗑️ Clear
                          </button>
                        </div>
                        {quickFillMode && (quickFillYardUid || quickFillCarId) && (
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#1976d2', 
                            backgroundColor: '#e3f2fd', 
                            padding: '8px', 
                            borderRadius: '4px',
                            marginTop: '4px'
                          }}>
                            <strong>Active:</strong> Scenarios will use these IDs instead of picker selection.
                            {quickFillYardUid && <div>• yardUid: <code>{quickFillYardUid}</code></div>}
                            {quickFillCarId && <div>• carId: <code>{quickFillCarId}</code></div>}
                          </div>
                        )}
                      </div>
                    </details>
                    
                    <RunProgressHeader
                      isRunning={scenarioRun.running}
                      statusText={scenarioRun.running ? undefined : (scenarioRun.error ? 'Failed' : scenarioRun.finishedAtMs > 0 ? 'Completed' : undefined)}
                      currentLabel={scenarioRun.running ? `Scenario: ${scenarioRun.runningScenarioName}` : undefined}
                      currentIndex={scenarioRun.currentScenarioIndex}
                      total={scenarioRun.totalScenarios}
                      errorText={scenarioRun.error}
                      startedAtMs={scenarioRun.startedAtMs}
                      finishedAtMs={scenarioRun.finishedAtMs}
                    />
              </div>
                ) : selectedTopic.key === 'functions-bulk' ? (
                  // Special case: Bulk Snapshot Repair has custom UI
                  <div className="debug-topic-audit-card">
                    <div className="debug-topic-card-header">
                      <div className="debug-topic-card-title-row">
                        <span className="debug-topic-card-icon">{selectedTopic.icon}</span>
                        <h2 className="debug-topic-card-title">{selectedTopic.label}</h2>
                      </div>
                    </div>
                    <p className="debug-topic-card-description">{selectedTopic.description}</p>
                  </div>
                ) : selectedTopic.key === 'functions-projection' ? (
                  // Special case: Functions/Projection with big BACKFILL button
                  <div className="debug-topic-audit-card">
                    <div className="debug-topic-card-header">
                      <div className="debug-topic-card-title-row">
                        <span className="debug-topic-card-icon">{selectedTopic.icon}</span>
                        <h2 className="debug-topic-card-title">{selectedTopic.label}</h2>
                      </div>
                    </div>
                    {/* Progress bar for Functions/Projection (like Scenario Runner) */}
                    {topicRunning && (
                      <ActionStatusBar
                        isRunning={topicRunning}
                        statusText="Running…"
                        currentLabel={topicRunProgress?.currentLabel || 'Processing…'}
                        currentIndex={topicRunProgress?.currentIndex}
                        total={topicRunProgress?.total}
                        startedAtMs={topicRunProgress?.startedAtMs}
                      />
                    )}
                    <p className="debug-topic-card-description">{selectedTopic.description}</p>
                    <div className="debug-topic-card-actions">
                      <button
                        className="debug-btn debug-btn-primary debug-btn-large"
                        onClick={async () => {
                          if (!debugContext.carId) {
                            alert('Please select or type a carId first');
                            return;
                          }
                          if (debugContext.readOnly) {
                            alert('Read-Only is ON. Turn it OFF to run BACKFILL.');
                            return;
                          }
                          setTopicRunning(true);
                          try {
                            const result = await runControl('rebuild-publiccar-snapshot', debugContext);
                            setTopicResults([result]);
                            // Save to history
                            saveTopicResults(selectedTopic.key, [result]);
                            const history = loadTopicResults(selectedTopic.key);
                            setTopicHistory(history);
                          } catch (error: any) {
                            console.error('Error running BACKFILL:', error);
                            alert(`Error: ${error.message || String(error)}`);
                          } finally {
                            setTopicRunning(false);
                          }
                        }}
                        disabled={!debugContext.carId || debugContext.readOnly || topicRunning}
                        style={{ 
                          fontSize: '1.1rem', 
                          padding: '0.75rem 1.5rem',
                          marginTop: '1rem',
                          width: '100%',
                          maxWidth: '400px'
                        }}
                      >
                        {topicRunning ? '⏳ Running...' : '🔧 BACKFILL Snapshot (Selected Car)'}
                      </button>
                      {!debugContext.carId && (
                        <p className="debug-hint" style={{ marginTop: '0.5rem', color: '#666' }}>
                          Select or type a carId to enable BACKFILL
                        </p>
                      )}
                      {debugContext.readOnly && debugContext.carId && (
                        <p className="debug-hint" style={{ marginTop: '0.5rem', color: '#dc3545' }}>
                          Read-Only is ON — turn it OFF to run BACKFILL
                        </p>
                      )}
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <button
                        className="debug-btn debug-btn-secondary"
                        onClick={handleTopicRun}
                        disabled={topicRunning}
                      >
                        {topicRunning ? 'Running...' : 'Run All Checks'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <DebugTopicAuditCard
                    topic={selectedTopic}
                    topicContext={topicContext}
                    debugContext={debugContext}
                    onRun={handleTopicRun}
                    isRunning={topicRunning}
                    runProgress={topicRunProgress}
                  />
                )}

                {/* Actions Strip for Scenario Runner, Functions/Bulk, Functions/Projection, and Pipeline */}
                {(selectedTopic.key === 'scenario-runner' || selectedTopic.key === 'functions-bulk' || selectedTopic.key === 'functions-projection' || selectedTopic.key === 'pipeline') && (
                  <div className="debug-actions-strip" style={{ marginTop: '1rem', padding: '1rem', borderTop: '1px solid #ddd' }}>
                    {/* Progress Bar for Rebuild Yard PublicCars */}
                    {(rebuildYardRunning || rebuildYardProgress?.total !== undefined) && (
                      <ActionStatusBar
                        isRunning={rebuildYardRunning}
                        statusText={rebuildYardProgress?.done ? 'Completed' : rebuildYardError ? 'Failed' : rebuildYardRunning ? 'Running…' : undefined}
                        currentLabel={
                          rebuildYardProgress?.total !== undefined
                            ? `Rebuild: ${rebuildYardProgress.processed ?? 0}/${rebuildYardProgress.total} | upserted: ${rebuildYardProgress.upserted ?? 0} | unpublished: ${rebuildYardProgress.unpublished ?? 0} | errors: ${rebuildYardProgress.errors ?? 0}`
                            : undefined
                        }
                        currentIndex={(rebuildYardProgress?.processed ?? 0) - 1}
                        total={rebuildYardProgress?.total ?? 0}
                        errorText={rebuildYardError ?? undefined}
                      />
                    )}
                    <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Actions</h4>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button
                        className="debug-btn debug-btn-small debug-btn-primary"
                        onClick={async () => {
                          if (!debugContext.carId) {
                            alert('Please select or type a carId first');
                            return;
                          }
                          if (debugContext.readOnly) {
                            alert('Read-Only is ON. Turn it OFF to run REBUILD.');
                            return;
                          }
                          setTopicRunning(true);
                          try {
                            const result = await runControl('rebuild-publiccar-snapshot', debugContext);
                            // Append to results if in scenario runner, or set as single result
                            if (selectedTopic.key === 'scenario-runner') {
                              // For scenario runner, we could add to a separate action results section
                              // For now, just show alert
                              alert(`Rebuild completed: ${result.summary}`);
                            } else {
                              setTopicResults([result]);
                              saveTopicResults(selectedTopic.key, [result]);
                              const history = loadTopicResults(selectedTopic.key);
                              setTopicHistory(history);
                            }
                          } catch (error: any) {
                            console.error('Error running REBUILD:', error);
                            alert(`Error: ${error.message || String(error)}`);
                          } finally {
                            setTopicRunning(false);
                          }
                        }}
                        disabled={!debugContext.carId || debugContext.readOnly || topicRunning}
                      >
                        🔧 Rebuild Selected Car Snapshot
                      </button>
                      <button
                        className="debug-btn debug-btn-small debug-btn-primary"
                        onClick={async () => {
                          if (!debugContext.carId) {
                            alert('Please select or type a carId first');
                            return;
                          }
                          if (debugContext.readOnly) {
                            alert('Read-Only is ON. Turn it OFF to run REPAIR.');
                            return;
                          }
                          setTopicRunning(true);
                          try {
                            const repairFn = httpsCallable(functions, 'repairPublicCarSnapshotsById');
                            const correlationId = generateCorrelationId();
                            const result = await repairFn({ 
                              carId: debugContext.carId,
                              correlationId,
                            });
                            const debugResult: DebugResult = {
                              ok: (result.data as any)?.ok === true,
                              level: (result.data as any)?.ok === true ? 'OK' : 'FAIL',
                              title: 'Repair Missing Snapshots',
                              summary: (result.data as any)?.ok === true 
                                ? `Repaired snapshot for car ${debugContext.carId}: ${(result.data as any)?.updatedFields?.length || 0} fields updated`
                                : `Failed: ${(result.data as any)?.reason || 'Unknown error'}`,
                              details: result.data,
                              ts: new Date().toISOString(),
                              correlationId: (result.data as any)?.correlationId || correlationId,
                            };
                            if (selectedTopic.key === 'scenario-runner') {
                              alert(`Repair completed: ${debugResult.summary}`);
                            } else {
                              setTopicResults([debugResult]);
                              saveTopicResults(selectedTopic.key, [debugResult]);
                              const history = loadTopicResults(selectedTopic.key);
                              setTopicHistory(history);
                            }
                          } catch (error: any) {
                            console.error('Error running REPAIR:', error);
                            alert(`Error: ${error.message || String(error)}`);
                          } finally {
                            setTopicRunning(false);
                          }
                        }}
                        disabled={!debugContext.carId || debugContext.readOnly || topicRunning}
                      >
                        {topicRunning ? '⏳ ' : ''}🔨 Repair Missing Snapshots (Selected Car)
                      </button>
                      <button
                        className="debug-btn debug-btn-small debug-btn-primary"
                        onClick={async () => {
                          if (!debugContext.yardUid) {
                            alert('Please select a yard first');
                            return;
                          }
                          if (debugContext.readOnly) {
                            alert('Read-Only is ON. Turn it OFF to run REBUILD.');
                            return;
                          }
                          if (rebuildYardRunning) return;
                          setRebuildYardRunning(true);
                          setRebuildYardError(null);
                          setRebuildYardProgress({});
                          const correlationId = generateCorrelationId();

                          const progressRef = doc(db, 'adminDebugProgress', correlationId);
                          const unsub = onSnapshot(progressRef, (snap) => {
                            const data = snap.data();
                            if (data) {
                              setRebuildYardProgress({
                                total: data.total,
                                processed: data.processed,
                                upserted: data.upserted,
                                unpublished: data.unpublished,
                                errors: data.errors,
                                done: data.done,
                                yardUid: data.yardUid,
                              });
                            }
                          });

                          try {
                            const rebuildFn = httpsCallable(functions, 'rebuildPublicCarsForYard');
                            const result = await rebuildFn({
                              yardUid: debugContext.yardUid,
                              correlationId,
                            });
                            const resultData = result.data as any;
                            if (resultData?.progress) {
                              setRebuildYardProgress(prev => ({
                                ...prev,
                                ...resultData.progress,
                                done: true,
                              }));
                            }
                            const debugResult: DebugResult = {
                              ok: true,
                              level: 'OK',
                              title: 'Rebuild Yard PublicCars',
                              summary: `Rebuilt publicCars for yard ${debugContext.yardUid}`,
                              details: resultData,
                              ts: new Date().toISOString(),
                              correlationId: resultData?.correlationId || correlationId,
                            };
                            if (selectedTopic.key === 'scenario-runner') {
                              alert(`Rebuild completed: ${debugResult.summary}`);
                            } else {
                              setTopicResults([debugResult]);
                              saveTopicResults(selectedTopic.key, [debugResult]);
                              const history = loadTopicResults(selectedTopic.key);
                              setTopicHistory(history);
                            }
                          } catch (error: any) {
                            const errMsg = error?.message || String(error);
                            setRebuildYardError(errMsg);
                            console.error('Error running Yard REBUILD:', error);
                            alert(`Error: ${errMsg}`);
                          } finally {
                            unsub();
                            setRebuildYardRunning(false);
                          }
                        }}
                        disabled={!debugContext.yardUid || debugContext.readOnly || rebuildYardRunning}
                      >
                        {rebuildYardRunning ? '⏳ ' : ''}🔄 Rebuild Yard PublicCars ({debugContext.yardUid ? debugContext.yardUid.slice(0, 8) + '...' : 'Yard UID'})
                      </button>
                    </div>
                    <p className="debug-hint" style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                      Writes changes — requires Read-only OFF.
                    </p>
                  </div>
                )}

                {/* Results */}
                {selectedTopic.key === 'scenario-runner' ? (
                  // Scenario Runner Results
                  <div className="debug-topic-results">
                    {scenarioResults.length === 0 ? (
                      <p className="debug-topic-results-empty">No scenario results yet. Click "Run Scenarios" to start.</p>
                    ) : (
                      <div className="debug-scenario-results">
                        <div className="debug-results-header" style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between', 
                          gap: '12px',
                          direction: 'ltr', // Force LTR for header layout
                        }}>
                          <h3 className="debug-results-title" style={{ 
                            margin: 0, 
                            flex: '1 1 auto', 
                            minWidth: 0 
                          }}>Scenario Results</h3>
                          <div style={{ flex: '0 0 auto' }}>
                            <SmartCopyButton
                              value={{ timestamp: Date.now(), scenarios: scenarioResults }}
                              label="🗐 COPY JSON"
                              variant="admin"
                              size="sm"
                              className="debug-btn debug-btn-small"
                              style={{
                                direction: 'ltr',
                                unicodeBidi: 'embed',
                              }}
                            />
                          </div>
                        </div>
                        {scenarioResults.map((scenarioResult, idx) => (
                          <div key={idx} className="debug-scenario-result">
                            <h4 className="debug-scenario-title">{scenarioResult.scenario}</h4>
                            <div className="debug-results-list">
                              {scenarioResult.results.map((result, ridx) => (
                                <div key={ridx} className="debug-result-view">
                                  <div className="debug-result-section">
                                    <div className="debug-result-section-header">
                                      <h4>{result.title}</h4>
                                      <span className={`debug-status-badge debug-status-${result.level.toLowerCase()}`}>
                                        {result.level}
                        </span>
              </div>
                                    <p className="debug-result-summary">{result.summary}</p>
          </div>
        </div>
                              ))}
                                  </div>
              </div>
                      ))}
                    </div>
                    )}
                    </div>
                ) : selectedTopic.key === 'functions-bulk' ? (
                  // Bulk Snapshot Repair Panel
                  <div className="debug-topic-results">
                    <BulkSnapshotRepairPanel />
                  </div>
                ) : (
                  <DebugTopicResults
                    topicKey={selectedTopic.key}
                    results={topicResults}
                    history={topicHistory}
                    onSelectHistoryRun={handleSelectHistoryRun}
                  />
                )}
              </>
            ) : (
              <div className="debug-topic-empty-state">
                <h2>Select a Topic</h2>
                <p>Choose a topic from the left sidebar to begin debugging.</p>
                <p>Topics are filtered based on your current context (Yard/Car selection).</p>
                        </div>
                        )}
                      </div>
                    </div>
      </div>
    </div>
  );
}
