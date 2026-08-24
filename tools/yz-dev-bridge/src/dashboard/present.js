export const LIFECYCLE_PHASES = Object.freeze([
  'RECEIVED',
  'ACKNOWLEDGED',
  'READY',
  'AGENT_LAUNCH',
  'CLAIMED',
  'IN_PROGRESS',
  'RESULT',
  'COMPLETED',
]);

export const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
export const ACTIVE_TASK_STATUSES = new Set(['IN_PROGRESS']);

function meta(task) {
  return task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
}

export function taskSource(task) {
  const value = String(meta(task).source || task?.source || '').trim();
  if (value) return value;
  if (meta(task).githubIssueNumber) return 'github-inbox';
  if (meta(task).firebaseTaskId) return 'firebase-relay';
  return 'mcp';
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toUpperCase());
}

export function resolveLifecycle(task) {
  const metadata = meta(task);
  const source = taskSource(task);
  const github = Boolean(metadata.githubIssueNumber);
  const status = String(task?.status || '').toUpperCase();

  const proven = {
    RECEIVED: Boolean(task?.createdAt || task?.id),
    ACKNOWLEDGED: Boolean(metadata.githubAckPostedAt) || (!github && Boolean(task?.createdAt)),
    READY: ['READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status),
    AGENT_LAUNCH: Boolean(metadata.agentLaunchStartedAt || metadata.agentLaunchedAt || metadata.agentSession),
    CLAIMED: Boolean(task?.claimedAt || task?.claimedBy),
    IN_PROGRESS: status === 'IN_PROGRESS' || Boolean(task?.claimedAt),
    RESULT: Boolean(
      metadata.githubResultPostedAt
      || task?.summary
      || metadata.structuredResult
      || status === 'COMPLETED'
      || status === 'FAILED',
    ),
    COMPLETED: isTerminalStatus(status),
  };

  const phases = LIFECYCLE_PHASES.map((id) => {
    let label = id.replaceAll('_', ' ');
    if (id === 'COMPLETED' && status === 'FAILED') label = 'FAILED';
    if (id === 'COMPLETED' && status === 'CANCELLED') label = 'CANCELLED';
    return {
      id,
      label,
      proven: Boolean(proven[id]),
    };
  });

  let current = 'RECEIVED';
  for (const phase of phases) {
    if (phase.proven) current = phase.id;
  }
  if (status === 'READY' && !proven.AGENT_LAUNCH) current = 'READY';
  if (status === 'BLOCKED') current = proven.RESULT ? 'RESULT' : (proven.CLAIMED ? 'IN_PROGRESS' : 'READY');

  return {
    source,
    current,
    phases,
    github,
  };
}

export function applyTaskFilters(tasks, filters = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const project = String(filters.project || '').trim().toLowerCase();
  const status = String(filters.status || '').trim().toUpperCase();
  const source = String(filters.source || '').trim().toLowerCase();
  const taskId = String(filters.taskId || filters.q || '').trim().toLowerCase();
  const githubIssue = String(filters.githubIssue || '').trim();
  const since = filters.since ? Date.parse(filters.since) : NaN;
  const until = filters.until ? Date.parse(filters.until) : NaN;

  return list.filter((task) => {
    if (project && String(task.projectId || '').toLowerCase() !== project
      && String(task.project || '').toLowerCase() !== project) {
      return false;
    }
    if (status && String(task.status || '').toUpperCase() !== status) return false;
    if (source && String(task.source || '').toLowerCase() !== source) return false;
    if (taskId) {
      const hay = `${task.taskId || task.id || ''} ${task.title || ''}`.toLowerCase();
      if (!hay.includes(taskId)) return false;
    }
    if (githubIssue) {
      const issue = String(task.githubIssueNumber || task.github?.issueNumber || '');
      if (issue !== githubIssue && `#${issue}` !== githubIssue) return false;
    }
    if (Number.isFinite(since)) {
      const created = Date.parse(task.createdAt || '');
      if (!Number.isFinite(created) || created < since) return false;
    }
    if (Number.isFinite(until)) {
      const created = Date.parse(task.createdAt || '');
      if (!Number.isFinite(created) || created > until) return false;
    }
    return true;
  });
}

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function elapsedSince(iso, nowMs = Date.now()) {
  const at = Date.parse(iso || '');
  if (!Number.isFinite(at)) return null;
  return formatDurationMs(Math.max(0, nowMs - at));
}

export function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}
