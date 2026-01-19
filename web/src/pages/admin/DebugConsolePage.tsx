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
import { SmartCopyIconButton } from '../../components/common/SmartCopyButton';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebaseClient';
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

  // ========================================
  // SCENARIO RUNNER STATE (LEGACY)
  // ========================================
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [scenarioResults, setScenarioResults] = useState<Array<{ scenario: string; results: DebugResult[] }>>([]);

  // Extract IDs from selected items
  const yardUid = selectedYard?.yardUid || '';
  const carId = selectedCar?.carId || '';

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
          setYards(result.data.results);
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

    setTopicRunning(true);
    const results: DebugResult[] = [];

    try {
      // Run all controls in topic sequentially
      for (const controlId of topicDef.controlIds) {
        const control = DEBUG_CONTROLS.find((c) => c.id === controlId);
        if (!control) continue;

        // Check if control is runnable
        const disabledReason = getControlDisabledReason(control, debugContext);
        if (disabledReason) {
          // Skip disabled controls
          continue;
        }

        // Run control
        try {
          const result = await runControl(control.id, debugContext);
          results.push(result);
        } catch (error) {
          console.error(`[TopicRun] Error running control ${controlId}:`, error);
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
    setScenarioRunning(true);
    setScenarioResults([]);

    // Define test scenarios (read-only controls only)
    const scenarios = [
      { label: 'No Selection', yardUid: '', carId: '' },
      { label: 'Yard Only', yardUid: yardUid || 'test-yard', carId: '' },
      { label: 'Car Only', yardUid: '', carId: carId || 'test-car' },
      { label: 'Yard + Car', yardUid: yardUid || 'test-yard', carId: carId || 'test-car' },
    ];

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

    for (const scenario of scenarios) {
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
    setScenarioRunning(false);
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

              {/* Yard Picker */}
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
                <AdminDebugCarPicker
                  value={carInputValue}
                  onValueChange={setCarInputValue}
                  selectedCar={selectedCar}
                  onSelectedCarChange={handleCarSelected}
                  yardUid={yardUid || null}
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
                      Selected: {selectedCar.plateNumber && <LicensePlateBadge plate={selectedCar.plateNumber} />}{' '}
                      {selectedCar.make} {selectedCar.model} ({selectedCar.carId.slice(0, 8)}...){' '}
                      <SmartCopyIconButton text={selectedCar.carId} />
                    </span>
                    <span>
                      Yard: {selectedCar.yardUid} <SmartCopyIconButton text={selectedCar.yardUid} />
                    </span>
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
                      <strong>Note:</strong> This runner tests safe read-only controls across 4 different selection scenarios.
                    </div>
                  </div>
                ) : (
                  <DebugTopicAuditCard
                    topic={selectedTopic}
                    topicContext={topicContext}
                    debugContext={debugContext}
                    onRun={handleTopicRun}
                    isRunning={topicRunning}
                  />
                )}

                {/* Results */}
                {selectedTopic.key === 'scenario-runner' ? (
                  // Scenario Runner Results
                  <div className="debug-topic-results">
                    {scenarioResults.length === 0 ? (
                      <p className="debug-topic-results-empty">No scenario results yet. Click "Run Scenarios" to start.</p>
                    ) : (
                      <div className="debug-scenario-results">
                        <h3 className="debug-results-title">Scenario Results</h3>
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
