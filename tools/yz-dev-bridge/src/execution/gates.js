import { createGateId, EXECUTION_STATES } from './types.js';

export const GATE_DECISIONS = Object.freeze(['CONTINUE', 'CHANGE', 'ABORT']);

/**
 * Durable operator gate helpers (additive metadata.v2.gate).
 * Task status remains IN_PROGRESS while waiting.
 */
export function createOperatorGate({
  taskId,
  executionId,
  type = 'OPERATOR_CHECKPOINT',
  reasonCode = 'WAITING_FOR_OPERATOR',
  summary = '',
  recommended = 'CONTINUE',
  options = GATE_DECISIONS,
  taskRevision = 1,
} = {}) {
  return {
    gateId: createGateId(),
    taskId,
    executionId,
    type,
    status: 'WAITING',
    reasonCode,
    summary: String(summary || '').slice(0, 2000),
    options: [...options],
    recommended,
    createdAt: new Date().toISOString(),
    taskRevision,
    decision: null,
    decidedAt: null,
    decidedBy: null,
    instruction: null,
  };
}

export function applyGateDecision(gate, decisionInput = {}) {
  if (!gate) {
    return { ok: false, reason: 'NO_WAITING_GATE', gate };
  }
  if (decisionInput.gateId !== gate.gateId) {
    return { ok: false, reason: 'STALE_OR_MISMATCHED_GATE', gate };
  }
  const decision = String(decisionInput.decision || '').toUpperCase();
  if (!GATE_DECISIONS.includes(decision)) {
    return { ok: false, reason: 'INVALID_DECISION', gate };
  }
  // Idempotent CONTINUE after already applied
  if (gate.decision === 'CONTINUE' && decision === 'CONTINUE') {
    return { ok: true, reason: 'IDEMPOTENT_CONTINUE', gate, idempotent: true };
  }
  if (gate.status !== 'WAITING') {
    return { ok: false, reason: 'NO_WAITING_GATE', gate };
  }
  const next = {
    ...gate,
    status: decision === 'ABORT' ? 'ABORTED' : 'RESOLVED',
    decision,
    decidedAt: decisionInput.at || new Date().toISOString(),
    decidedBy: decisionInput.by || 'operator',
    instruction: decisionInput.instruction || null,
  };
  return { ok: true, reason: 'APPLIED', gate: next, idempotent: false };
}

export function deriveExecutionStateFromV2(metadataV2 = {}) {
  if (metadataV2?.gate?.status === 'WAITING') return EXECUTION_STATES.WAITING_FOR_OPERATOR;
  if (metadataV2?.verification?.state === 'FAIL') return EXECUTION_STATES.VERIFICATION_FAILED;
  if (metadataV2?.verification?.state === 'RUNNING') return EXECUTION_STATES.VERIFYING;
  const state = metadataV2?.execution?.state;
  if (state && Object.values(EXECUTION_STATES).includes(state)) return state;
  return null;
}

export function buildCheckpointV1({
  taskId,
  executionId,
  projectId,
  phase,
  gate,
  completed = [],
  currentEvidence = {},
  nextActionIfContinue = '',
  rollback = 'No production provider has been changed',
} = {}) {
  return {
    schema: 'yz-bridge-checkpoint-v1',
    taskId,
    executionId,
    projectId,
    phase,
    state: 'WAITING_FOR_OPERATOR',
    gateId: gate?.gateId || null,
    completed,
    currentEvidence,
    recommendedDecision: gate?.recommended || 'CONTINUE',
    allowedDecisions: [...GATE_DECISIONS],
    nextActionIfContinue,
    rollback,
  };
}
