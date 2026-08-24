/**
 * V2 normalized execution provider events and IDs.
 * Additive only — does not replace V1 task statuses.
 */
export const PROVIDER_IDS = Object.freeze({
  LEGACY: 'legacy',
  CURSOR_SDK: 'cursor-sdk',
  CURSOR_ACP: 'cursor-acp',
});

export const PROVIDER_EVENTS = Object.freeze({
  RUN_STARTED: 'RUN_STARTED',
  AGENT_MESSAGE: 'AGENT_MESSAGE',
  TOOL_STARTED: 'TOOL_STARTED',
  TOOL_FINISHED: 'TOOL_FINISHED',
  FILE_CHANGED: 'FILE_CHANGED',
  COMMAND_STARTED: 'COMMAND_STARTED',
  COMMAND_FINISHED: 'COMMAND_FINISHED',
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  QUESTION_REQUIRED: 'QUESTION_REQUIRED',
  PLAN_APPROVAL_REQUIRED: 'PLAN_APPROVAL_REQUIRED',
  HEARTBEAT: 'HEARTBEAT',
  RUN_COMPLETED: 'RUN_COMPLETED',
  RUN_FAILED: 'RUN_FAILED',
  RUN_CANCELLED: 'RUN_CANCELLED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  WORKER_CRASH: 'WORKER_CRASH',
  UNKNOWN: 'UNKNOWN',
});

export const EXECUTION_STATES = Object.freeze({
  QUEUED_FOR_PROJECT: 'QUEUED_FOR_PROJECT',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  WAITING_FOR_OPERATOR: 'WAITING_FOR_OPERATOR',
  RECOVERING: 'RECOVERING',
  VERIFYING: 'VERIFYING',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  DONE: 'DONE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

export function createExecutionId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `EXEC-${stamp}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createGateId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `GATE-${stamp}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Normalize a native/provider event into a bridge event.
 * Unknown types become UNKNOWN and never throw.
 */
export function normalizeProviderEvent(native = {}, { provider = PROVIDER_IDS.LEGACY, taskId = null, executionId = null } = {}) {
  try {
    const rawType = String(native.type || native.event || 'UNKNOWN').toUpperCase();
    const type = Object.values(PROVIDER_EVENTS).includes(rawType) ? rawType : PROVIDER_EVENTS.UNKNOWN;
    return {
      protocolVersion: 1,
      type,
      provider,
      taskId: taskId || native.taskId || null,
      executionId: executionId || native.executionId || null,
      providerAgentId: native.providerAgentId || native.agentId || null,
      providerRunId: native.providerRunId || native.runId || null,
      message: native.message ? String(native.message).slice(0, 500) : null,
      at: native.at || new Date().toISOString(),
      nativeType: native.type || native.event || null,
      mutatedWorkspace: Boolean(native.mutatedWorkspace),
    };
  } catch {
    return {
      protocolVersion: 1,
      type: PROVIDER_EVENTS.UNKNOWN,
      provider,
      taskId,
      executionId,
      at: new Date().toISOString(),
      nativeType: null,
      mutatedWorkspace: false,
    };
  }
}

/**
 * Read project execution config with safe defaults (legacy).
 */
export function resolveProjectExecutionConfig(project = {}) {
  const exec = project.execution && typeof project.execution === 'object' ? project.execution : {};
  const mode = String(exec.mode || PROVIDER_IDS.LEGACY).toLowerCase();
  const allowed = Array.isArray(exec.allowedProviders) && exec.allowedProviders.length
    ? exec.allowedProviders.map((p) => String(p).toLowerCase())
    : [PROVIDER_IDS.LEGACY, PROVIDER_IDS.CURSOR_SDK, PROVIDER_IDS.CURSOR_ACP];
  const preferred = String(exec.preferredProvider || mode).toLowerCase();
  const fallbackOrder = Array.isArray(exec.fallbackOrder) && exec.fallbackOrder.length
    ? exec.fallbackOrder.map((p) => String(p).toLowerCase())
    : [PROVIDER_IDS.CURSOR_SDK, PROVIDER_IDS.CURSOR_ACP, PROVIDER_IDS.LEGACY];
  return {
    mode: Object.values(PROVIDER_IDS).includes(mode) || mode === 'auto' ? mode : PROVIDER_IDS.LEGACY,
    allowedProviders: allowed,
    preferredProvider: preferred,
    fallbackOrder,
    maxConcurrentTasks: Math.max(1, Number(exec.maxConcurrentTasks) || 1),
  };
}
