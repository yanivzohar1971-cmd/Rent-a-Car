/**
 * Debug Topic Results Component
 * 
 * Displays results for a topic, including:
 * - Latest run status and results
 * - Structured result sections
 * - Raw JSON viewer (collapsed by default)
 * - Copy JSON button
 * - History list (last 5 runs)
 */

import { useState } from 'react';
import type { DebugResult } from '../../../adminDebug/debugControls';
import { SmartCopyIconButton } from '../../../components/common/SmartCopyButton';
import { CopyJsonButton } from '../../../components/debug/CopyJsonButton';
import { safeStringify } from '../../../adminDebug/safeStringify';

interface DebugTopicResultsProps {
  topicKey: string;
  results: DebugResult[];
  history: Array<{ timestamp: string; results: DebugResult[] }>;
  onSelectHistoryRun: (historyIndex: number) => void;
}

export default function DebugTopicResults({
  results,
  history,
  onSelectHistoryRun,
}: DebugTopicResultsProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    readable: true,
    raw: false,
  });
  
  // Copy functionality now handled by SmartCopyButton component

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

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

  if (results.length === 0) {
    return (
      <div className="debug-topic-results-empty">
        <p>No results yet. Click "Run Checks" to execute this topic.</p>
      </div>
    );
  }

  return (
    <div className="debug-topic-results">
      <div className="debug-results-header">
        <h3 className="debug-results-title">Latest Results</h3>
        <CopyJsonButton 
          value={results} 
          variant="admin"
          size="sm"
          className="debug-btn debug-btn-small"
        />
      </div>

      {/* Results List */}
      <div className="debug-results-list">
        {results.map((result, idx) => (
          <div key={idx} className="debug-result-view">
            {/* Summary Section */}
            <div className="debug-result-section">
              <div className="debug-result-section-header">
                <h4>{result.title}</h4>
                <div className="debug-result-section-badges">
                  <span className={`debug-status-badge debug-status-${result.level.toLowerCase()}`}>
                    {result.level}
                  </span>
                  {result.correlationId && (
                    <span className="debug-correlation-badge" title="Correlation ID for logs">
                      ID: {result.correlationId.slice(-8)}
                    </span>
                  )}
                </div>
              </div>
              <p className="debug-result-summary">{result.summary}</p>
              {result.details?.nextAction && (
                <div className="debug-next-action">
                  <strong>Next action:</strong> {result.details.nextAction}
                </div>
              )}
              <div className="debug-result-meta">
                <small>Timestamp: {new Date(result.ts).toLocaleString()}</small>
                {(result.correlationId || result.details?.correlationId) && (
                  <small className="debug-correlation-display">
                    Correlation ID:{' '}
                    <code dir="ltr">
                      {result.correlationId || result.details?.correlationId}
                    </code>
                    {' '}
                    <SmartCopyIconButton text={result.correlationId || result.details?.correlationId || ''} />
                  </small>
                )}
              </div>
              <div className="debug-status-explanation">
                <strong>What this means:</strong> {getStatusExplanation(result.level)}
              </div>
            </div>

            {/* Readable Details Section */}
            <div className="debug-result-section">
              <button
                className="debug-result-section-toggle"
                onClick={() => toggleSection(`readable-${idx}`)}
              >
                {expandedSections[`readable-${idx}`] ? '▼' : '▶'} Details (Readable)
              </button>
              {expandedSections[`readable-${idx}`] && (
                <div className="debug-result-readable">
                  {result.details && (
                    <table className="debug-result-table">
                      <tbody>
                        {Object.entries(result.details).map(([key, value]) => {
                          if (key === 'correlationId' || key === 'stack') return null;
                          if (typeof value === 'object' && value !== null) {
                            return (
                              <tr key={key}>
                                <td className="debug-result-key">{key}:</td>
                                <td className="debug-result-value">
                                  <pre dir="ltr">{safeStringify(value, 2)}</pre>
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
                      </tbody>
                    </table>
                  )}
                  {result.detailsVerbose && (
                    <div className="debug-result-verbose">
                      <h5>Verbose Details:</h5>
                      <pre dir="ltr">{safeStringify(result.detailsVerbose, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Raw JSON Section */}
            <div className="debug-result-section">
              <button
                className="debug-result-section-toggle"
                onClick={() => toggleSection(`raw-${idx}`)}
              >
                {expandedSections[`raw-${idx}`] ? '▼' : '▶'} Raw JSON
              </button>
              {expandedSections[`raw-${idx}`] && (
                <div className="debug-result-details">
                  <pre dir="ltr">{safeStringify(result, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="debug-results-history">
          <h4>History (Last 5 Runs)</h4>
          <ul className="debug-history-list">
            {history.map((run, idx) => {
              const timestamp = new Date(run.timestamp);
              const summary = run.results.map(r => r.level).join(', ');
              
              return (
                <li
                  key={idx}
                  className="debug-history-item"
                  onClick={() => onSelectHistoryRun(idx)}
                  title={`Run at ${timestamp.toLocaleString()}`}
                >
                  <span className="debug-history-time">
                    {timestamp.toLocaleTimeString()}
                  </span>
                  <span className="debug-history-summary">
                    {run.results.length} checks: {summary}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
