/**
 * Debug Topic Audit Card Component
 * 
 * Displays the audit card for a selected topic, including:
 * - Topic metadata (title, description, prerequisites)
 * - Primary Run button
 * - Requirement badges showing current context satisfaction
 */

import type { TopicDefinition, TopicContext } from '../../../adminDebug/debugTopics';
import type { DebugContext } from '../../../adminDebug/debugControls';
import { DEBUG_CONTROLS, getControlDisabledReason } from '../../../adminDebug/debugControls';
import RunProgressHeader from './RunProgressHeader';

interface RunProgressState {
  running: boolean;
  currentIndex: number;
  total: number;
  currentLabel: string;
  error: string | null;
  startedAtMs: number;
  finishedAtMs: number;
}

interface DebugTopicAuditCardProps {
  topic: TopicDefinition;
  topicContext: TopicContext;
  debugContext: DebugContext;
  onRun: () => void | Promise<void>;
  isRunning: boolean;
  runProgress?: RunProgressState;
}

export default function DebugTopicAuditCard({
  topic,
  topicContext,
  debugContext,
  onRun,
  isRunning: externalIsRunning,
  runProgress,
}: DebugTopicAuditCardProps) {
  // Check if topic is runnable (at least one control is runnable)
  const runnableControls = topic.controlIds.filter(controlId => {
    const control = DEBUG_CONTROLS.find(c => c.id === controlId);
    if (!control) return false;
    const disabledReason = getControlDisabledReason(control, debugContext);
    return !disabledReason;
  });

  const isRunnable = runnableControls.length > 0 || topic.key === 'scenario-runner';
  const isRunning = externalIsRunning || (runProgress?.running ?? false);

  // Build context badges
  const contextBadges = [];
  if (topicContext.hasYard) {
    contextBadges.push({ text: `Yard: ${topicContext.yardUid}`, satisfied: true });
  }
  if (topicContext.hasCar) {
    contextBadges.push({ text: `Car: ${topicContext.carId?.slice(0, 8)}...`, satisfied: true });
  }
  if (topicContext.superAdmin) {
    contextBadges.push({ text: 'Super Admin', satisfied: true });
  }

  return (
    <div className="debug-topic-audit-card">
      <div className="debug-topic-card-header">
        <div className="debug-topic-card-title-row">
          <span className="debug-topic-card-icon">{topic.icon}</span>
          <h2 className="debug-topic-card-title">{topic.label}</h2>
        </div>
        <button
          className={`debug-btn ${isRunnable ? 'debug-btn-primary' : 'debug-btn-disabled'}`}
          onClick={onRun}
          disabled={!isRunnable || isRunning}
        >
          {isRunning ? (
            <>
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
              </svg>{' '}
              Running...
            </>
          ) : (
            'Run Checks'
          )}
        </button>
      </div>

      <p className="debug-topic-card-description">{topic.description}</p>

      {runProgress && (
        <RunProgressHeader
          isRunning={runProgress.running}
          statusText={runProgress.running ? undefined : (runProgress.error ? 'Failed' : runProgress.finishedAtMs > 0 ? 'Completed' : undefined)}
          currentLabel={runProgress.running ? `Check: ${runProgress.currentLabel}` : undefined}
          currentIndex={runProgress.currentIndex}
          total={runProgress.total}
          errorText={runProgress.error}
          startedAtMs={runProgress.startedAtMs}
          finishedAtMs={runProgress.finishedAtMs}
        />
      )}

      {topic.prerequisites.length > 0 && (
        <div className="debug-topic-card-prerequisites">
          <strong>Prerequisites:</strong> {topic.prerequisites.join(', ')}
        </div>
      )}

      {contextBadges.length > 0 && (
        <div className="debug-topic-card-context-badges">
          {contextBadges.map((badge, idx) => (
            <span
              key={idx}
              className={`debug-requirement-badge ${badge.satisfied ? 'debug-requirement-satisfied' : 'debug-requirement-missing'}`}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}

      {topic.controlIds.length > 0 && (
        <div className="debug-topic-card-controls">
          <strong>Checks ({runnableControls.length}/{topic.controlIds.length} runnable):</strong>
          <ul>
            {topic.controlIds.map(controlId => {
              const control = DEBUG_CONTROLS.find(c => c.id === controlId);
              if (!control) return null;
              const disabledReason = getControlDisabledReason(control, debugContext);
              const canRun = !disabledReason;

              return (
                <li key={controlId} className={canRun ? 'control-runnable' : 'control-disabled'}>
                  {canRun ? '✓' : '○'} {control.title}
                  {!canRun && <span className="control-disabled-reason"> ({disabledReason})</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
