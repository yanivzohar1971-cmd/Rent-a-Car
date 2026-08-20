/**
 * Cosmetic BBS/ANSI cards for github-relay console (config + task lifecycle).
 * Presentation only — no relay/task behavior changes.
 */

import {
  ANSI,
  shouldUseAnsi,
  statusColor,
  stripAnsi,
} from './startupBanner.js';
import { redactGithubRelayConfig } from './githubRelayConfig.js';

const DEFAULT_INNER_WIDTH = 69;
const ELLIPSIS = '...';

/**
 * Opt-in raw/diagnostic console lines (JSON extras, legacy log text).
 * Normal mode prefers ANSI cards without duplicating every event.
 */
export function isRelayRawLogsEnabled(env = process.env) {
  const raw = env.YZ_BRIDGE_RELAY_RAW_LOGS ?? env.YZ_BRIDGE_RELAY_DEBUG;
  if (raw == null || String(raw) === '') return false;
  const normalized = String(raw).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

function paint(enabled, code, text) {
  if (!enabled) return String(text);
  return `${code}${text}${ANSI.reset}`;
}

function padLabel(label, width = 16) {
  const raw = String(label);
  if (raw.length >= width) return raw.slice(0, width);
  return `${raw}${' '.repeat(width - raw.length)}`;
}

/**
 * Truncate plain text to maxLen with an ellipsis when needed.
 */
export function truncateDisplay(value, maxLen) {
  const text = String(value ?? '');
  if (maxLen <= 0) return '';
  if (text.length <= maxLen) return text;
  if (maxLen <= ELLIPSIS.length) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - ELLIPSIS.length)}${ELLIPSIS}`;
}

function enabledFlag(value) {
  return value ? 'ENABLED' : 'DISABLED';
}

function yesNo(value) {
  return value ? 'YES' : 'NO';
}

function formatPollInterval(intervalMs) {
  const ms = Number(intervalMs);
  if (!Number.isFinite(ms) || ms <= 0) return String(intervalMs ?? '');
  if (ms % 1000 === 0) {
    const sec = ms / 1000;
    return sec === 1 ? '1 second' : `${sec} seconds`;
  }
  return `${ms}ms`;
}

/**
 * Accent color for card title/borders by semantic kind.
 */
function accentCode(kind) {
  const key = String(kind || '').toUpperCase();
  if (/\b(FAILED|ERROR|FAILURE)\b/.test(key)) return ANSI.red;
  if (/\b(COMPLETED|SUCCESS|CLOSED|ONLINE|READY|AUTO-CLOSED)\b/.test(key)) return ANSI.brightGreen;
  if (/\b(INCOMING|WAITING|LAUNCHING|WARNING|INIT|RESERVED|SCHEDULED)\b/.test(key)) return ANSI.yellow;
  return ANSI.brightCyan;
}

/**
 * Semantic emphasis for proven task-status event tokens.
 */
function taskEventEmphasis(event) {
  const key = String(event || '').toUpperCase();
  if (/\b(FAILED|ERROR)\b/.test(key)) return 'danger';
  if (/\b(ACK POSTED|INGESTED|SESSION REGISTERED|AUTO-CLOSED|SUCCESS|COMPLETED|ONLINE)\b/.test(key)) {
    return 'success';
  }
  if (/\b(LAUNCH RESERVED|AUTO-CLOSE SCHEDULED|LAUNCHING|WAITING|INIT)\b/.test(key)) return 'warn';
  return 'status';
}

/**
 * Build a framed BBS card. Values are truncated so borders never break.
 * @param {object} options
 * @param {string} options.title
 * @param {Array<[string, string]|{label?:string,value:string,emphasis?:boolean}>} [options.rows]
 * @param {string[]} [options.headerLines] full-width lines under the title (e.g. task id)
 * @param {Array<[string, string]>} [options.footerRows]
 * @param {string} [options.accent] RELAY|INCOMING|COMPLETED|FAILED|...
 * @param {boolean} [options.useColor]
 * @param {number} [options.innerWidth]
 */
export function formatBbsCard(options = {}) {
  const useColor = Boolean(options.useColor);
  const innerWidth = Math.max(40, Number(options.innerWidth) || DEFAULT_INNER_WIDTH);
  const title = String(options.title || '').trim() || 'STATUS';
  const accent = accentCode(options.accent || title);
  const frame = (text) => paint(useColor, accent, text);
  const labelPaint = (text) => paint(useColor, ANSI.cyan, text);
  const valuePaint = (text, emphasis) => {
    if (emphasis === 'status') return statusColor(useColor, text);
    if (emphasis === 'danger') return paint(useColor, ANSI.red, text);
    if (emphasis === 'success') return paint(useColor, ANSI.brightGreen, text);
    if (emphasis === 'warn') return paint(useColor, ANSI.yellow, text);
    return paint(useColor, ANSI.white, text);
  };

  const titlePlain = ` ${title} `;
  const side = Math.max(0, innerWidth - titlePlain.length);
  const left = Math.floor(side / 2);
  const right = side - left;
  const top = frame(`╔${'═'.repeat(left)}${titlePlain}${'═'.repeat(right)}╗`);
  const mid = frame(`╠${'═'.repeat(innerWidth)}╣`);
  const bot = frame(`╚${'═'.repeat(innerWidth)}╝`);

  const lines = [top];

  const pushFullLine = (plainText, paintFn = (t) => paint(useColor, ANSI.white, t)) => {
    const clipped = truncateDisplay(plainText, innerWidth);
    const pad = Math.max(0, innerWidth - clipped.length);
    lines.push(`${frame('║')}${paintFn(clipped)}${' '.repeat(pad)}${frame('║')}`);
  };

  for (const header of options.headerLines || []) {
    pushFullLine(String(header), (t) => paint(useColor, ANSI.bold + ANSI.white, t));
  }

  const pushRow = (label, value, emphasis) => {
    const labelPart = padLabel(label, 16);
    const prefix = ` ${labelPart} `;
    const maxValue = Math.max(8, innerWidth - prefix.length);
    const valuePlain = truncateDisplay(value, maxValue);
    const gap = Math.max(0, innerWidth - prefix.length - valuePlain.length);
    lines.push(
      `${frame('║')}${labelPaint(prefix)}${valuePaint(valuePlain, emphasis)}${' '.repeat(gap)}${frame('║')}`,
    );
  };

  for (const row of options.rows || []) {
    if (Array.isArray(row)) {
      pushRow(row[0], row[1], row[2]);
    } else if (row && typeof row === 'object') {
      pushRow(row.label ?? '', row.value ?? '', row.emphasis);
    }
  }

  const footerRows = options.footerRows || [];
  if (footerRows.length) {
    lines.push(mid);
    for (const row of footerRows) {
      if (Array.isArray(row)) {
        pushRow(row[0], row[1], row[2] || 'warn');
      } else if (row && typeof row === 'object') {
        pushRow(row.label ?? '', row.value ?? '', row.emphasis || 'warn');
      }
    }
  }

  lines.push(bot);
  lines.push('');
  return lines.join('\n');
}

/**
 * RELAY CONFIGURATION card from redacted-safe fields only (never tokens).
 */
export function formatRelayConfigCard(config = {}, options = {}) {
  const safe = options.redacted || redactGithubRelayConfig(config);
  const useColor = Boolean(options.useColor);
  const tokenState = safe.tokenConfigured ? 'CONFIGURED' : 'MISSING';

  return formatBbsCard({
    title: 'RELAY CONFIGURATION',
    accent: 'RELAY',
    useColor,
    innerWidth: options.innerWidth,
    rows: [
      ['Repository', safe.repo ?? ''],
      ['Project', safe.projectId ? `${safe.project} (${safe.projectId})` : (safe.project ?? '')],
      ['Allowed Author', safe.allowedAuthor ?? ''],
      ['Task Prefix', safe.titlePrefix ?? ''],
      ['Poll Interval', formatPollInterval(safe.intervalMs), 'status'],
      ['Auto Launch', enabledFlag(safe.autoLaunch), safe.autoLaunch ? 'success' : undefined],
      ['Auto Close', enabledFlag(safe.autoCloseCompleted), safe.autoCloseCompleted ? 'success' : undefined],
      ['Keep Window Open', yesNo(safe.keepWindowOpen)],
      ['Workspace', safe.workspacePath ?? ''],
      ['Token', tokenState, safe.tokenConfigured ? 'success' : 'warn'],
    ],
    footerRows: [
      ['SECURITY', 'Issue text is instructions only — never shell.'],
    ],
  });
}

/**
 * Compact INCOMING TASK card — safe metadata only (no issue body).
 */
export function formatIncomingTaskCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const taskId = String(input.taskId || input.id || '').trim() || 'UNKNOWN';
  const issueNumber = input.issueNumber != null ? `#${input.issueNumber}` : (input.githubIssueNumber != null ? `#${input.githubIssueNumber}` : '');
  const project = String(input.project || input.projectDisplayName || 'Rent_a_Car');
  const projectId = input.projectId ? String(input.projectId) : '';
  const title = String(input.title || input.githubIssueTitle || '').trim() || '(untitled)';
  const agent = String(input.agentStatus || (input.autoLaunch ? 'LAUNCHING...' : 'MANUAL'));
  const source = String(input.source || 'GitHub Relay');
  const projectLabel = projectId ? `${project} (${projectId})` : project;

  return formatBbsCard({
    title: 'INCOMING TASK',
    accent: 'INCOMING',
    useColor,
    innerWidth: options.innerWidth,
    headerLines: [taskId],
    rows: [
      ['GitHub Issue', issueNumber],
      ['Project', projectLabel],
      ['Title', title],
      ['Source', source],
      ['Agent', agent, /LAUNCH|FAIL/i.test(agent) ? (/FAIL/i.test(agent) ? 'danger' : 'warn') : 'status'],
    ],
  });
}

/**
 * Authoritative GitHub issue state for BBS cards.
 * Never invent OPEN from local task status alone.
 *
 * @returns {'open'|'closed'|'unknown'}
 */
export function resolveGithubIssueCardState(task, {
  openIssueNumbers = null,
  openIssuesKnown = false,
  closedByRelay = false,
} = {}) {
  if (closedByRelay) return 'closed';

  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const issueNumber = String(meta.githubIssueNumber || '').trim();

  // Authoritative current poll wins over any stale local metadata.
  if (openIssuesKnown) {
    if (!issueNumber) return 'unknown';
    const open = openIssueNumbers instanceof Set
      ? openIssueNumbers
      : new Set([...(openIssueNumbers || [])].map((value) => String(value)));
    return open.has(issueNumber) ? 'open' : 'closed';
  }

  const recorded = String(meta.githubSourceIssueState || '').toLowerCase();
  // Closed archival markers are trustworthy; never invent OPEN from stale local metadata
  // when the current GitHub poll is unavailable.
  if (recorded === 'closed') return 'closed';
  return 'unknown';
}

export function formatGithubIssueStateLabel(state) {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'closed') return { label: 'CLOSED', emphasis: 'success' };
  if (normalized === 'open') return { label: 'OPEN', emphasis: 'warn' };
  return { label: 'UNKNOWN', emphasis: 'warn' };
}

/**
 * Resolve card issue state without inventing OPEN from issueClosed:false.
 */
export function resolveIssueStateFromCardInput(input = {}) {
  const explicit = String(input.issueState || '').toLowerCase();
  if (explicit === 'open' || explicit === 'closed' || explicit === 'unknown') return explicit;
  if (input.issueClosed === true) return 'closed';
  return 'unknown';
}

/**
 * Lifecycle card for proven transitions (COMPLETED / FAILED / etc.).
 */
export function formatLifecycleCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const state = String(input.state || input.title || 'STATUS').toUpperCase();
  const taskId = String(input.taskId || input.id || '').trim() || 'UNKNOWN';
  const rows = Array.isArray(input.rows) ? input.rows : [];

  const builtRows = rows.map((row) => {
    if (Array.isArray(row)) return row;
    return [row.label, row.value, row.emphasis];
  });

  if (input.reason) {
    builtRows.push(['Reason', truncateDisplay(input.reason, 200), state === 'FAILED' ? 'danger' : undefined]);
  }

  return formatBbsCard({
    title: state,
    accent: state,
    useColor,
    innerWidth: options.innerWidth,
    headerLines: [taskId],
    rows: builtRows,
  });
}

export function formatCompletedTaskCard(input = {}, options = {}) {
  // Legacy default: COMPLETED cards historically implied closed unless state is provided.
  const resolved = (input.issueState != null || input.issueClosed != null)
    ? resolveIssueStateFromCardInput(input)
    : 'closed';
  const issue = formatGithubIssueStateLabel(resolved);
  return formatLifecycleCard({
    state: 'COMPLETED',
    taskId: input.taskId || input.id,
    rows: [
      ['Result', 'SUCCESS', 'success'],
      ['GitHub', 'RESULT POSTED', 'success'],
      ['Issue', issue.label, issue.emphasis],
      ...(input.agentAutoClosed ? [['Agent', 'AUTO-CLOSED', 'success']] : []),
    ],
  }, options);
}

export function formatFailedTaskCard(input = {}, options = {}) {
  const issue = formatGithubIssueStateLabel(resolveIssueStateFromCardInput(input));
  return formatLifecycleCard({
    state: 'FAILED',
    taskId: input.taskId || input.id,
    reason: input.reason || input.error || 'verification or implementation failed',
    rows: [
      ['Result', 'FAILED', 'danger'],
      ['GitHub', input.resultPosted === false ? 'PENDING' : 'RESULT POSTED', 'status'],
      ['Issue', issue.label, issue.emphasis],
    ],
  }, options);
}

export function formatCancelledResultCard(input = {}, options = {}) {
  const issue = formatGithubIssueStateLabel(resolveIssueStateFromCardInput(input));
  return formatLifecycleCard({
    state: 'CANCELLED',
    taskId: input.taskId || input.id,
    rows: [
      ['GitHub', input.resultPosted === false ? 'PENDING' : 'RESULT POSTED', 'status'],
      ['Issue', issue.label, issue.emphasis],
    ],
  }, options);
}

function resolveColor(options = {}) {
  const stream = options.stream || process.stderr;
  const env = options.env || process.env;
  if (options.useColor != null) return Boolean(options.useColor);
  return shouldUseAnsi(stream, env);
}

function writeCard(text, options = {}) {
  const stream = options.stream || process.stderr;
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
  return text;
}

export function printRelayConfigCard(config, options = {}) {
  const useColor = resolveColor(options);
  const text = formatRelayConfigCard(config, { ...options, useColor });
  return writeCard(text, options);
}

export function printIncomingTaskCard(input, options = {}) {
  const useColor = resolveColor(options);
  const text = formatIncomingTaskCard(input, { ...options, useColor });
  return writeCard(text, options);
}

export function printLifecycleCard(input, options = {}) {
  const useColor = resolveColor(options);
  const text = formatLifecycleCard(input, { ...options, useColor });
  return writeCard(text, options);
}

export function printCompletedTaskCard(input, options = {}) {
  const useColor = resolveColor(options);
  const text = formatCompletedTaskCard(input, { ...options, useColor });
  return writeCard(text, options);
}

export function printFailedTaskCard(input, options = {}) {
  const useColor = resolveColor(options);
  const text = formatFailedTaskCard(input, { ...options, useColor });
  return writeCard(text, options);
}

export function printCancelledResultCard(input, options = {}) {
  const useColor = resolveColor(options);
  const text = formatCancelledResultCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Safe short launcher label from known method codes (no paths/internals).
 */
export function formatLauncherMethodLabel(method) {
  const key = String(method || '').trim().toLowerCase();
  if (key === 'wt') return 'Windows Terminal';
  if (key === 'powershell-fallback') return 'PowerShell';
  if (key === 'cmd-start') return 'CMD Start';
  if (!key) return 'unknown';
  return truncateDisplay(key, 40);
}

function formatHostLaunchLabel(hostLaunchMode) {
  const key = String(hostLaunchMode || '').trim().toLowerCase();
  if (key === 'persistent') return 'PERSISTENT';
  if (key === 'non-persistent') return 'NON-PERSISTENT';
  if (!key) return 'UNKNOWN';
  return truncateDisplay(key.toUpperCase(), 40);
}

/**
 * Compact AGENT LAUNCHER card — safe fields only (no nonce/paths/arg lists).
 * phase: selected (LAUNCHING) | handoff (SUCCESS) | failed
 */
export function formatAgentLauncherCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const phase = String(input.phase || 'selected').toLowerCase();
  const taskId = String(input.taskId || input.id || '').trim() || 'UNKNOWN';
  const launcher = String(
    input.launcherLabel
    || formatLauncherMethodLabel(input.method),
  );
  const host = formatHostLaunchLabel(input.hostLaunchMode);
  const rows = [
    ['Task', taskId],
    ['Launcher', launcher],
    ['Host', host],
  ];

  let title = 'AGENT LAUNCHER';
  let accent = 'LAUNCHING';

  if (phase === 'failed') {
    title = 'AGENT LAUNCHER';
    accent = 'FAILED';
    rows.push(['Handoff', 'FAILED', 'danger']);
    if (input.pid != null && Number(input.pid) > 0) {
      rows.push(['PID', String(input.pid)]);
    }
    if (input.reason) {
      rows.push(['Reason', truncateDisplay(input.reason, 200), 'danger']);
    }
  } else if (phase === 'handoff') {
    accent = 'SUCCESS';
    rows.push(['Handoff', 'SUCCESS', 'success']);
    if (input.pid != null && Number(input.pid) > 0) {
      rows.push(['PID', String(input.pid)]);
    }
  } else {
    accent = 'LAUNCHING';
    rows.push(['Status', 'LAUNCHING', 'warn']);
  }

  return formatBbsCard({
    title,
    accent,
    useColor,
    innerWidth: options.innerWidth,
    rows,
  });
}

export function printAgentLauncherCard(input, options = {}) {
  const useColor = resolveColor(options);
  const text = formatAgentLauncherCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Compact single-line lifecycle status (append-only).
 * Kept for RAW/DEBUG and tests; normal mode prefers TASK STATUS cards.
 */
export function formatLifecycleStatusLine(label, status, { useColor = false } = {}) {
  const left = paint(useColor, ANSI.cyan, String(label));
  const right = statusColor(useColor, String(status));
  return `${left}: ${right}`;
}

export function printLifecycleStatusLine(label, status, options = {}) {
  const useColor = resolveColor(options);
  const line = formatLifecycleStatusLine(label, status, { useColor });
  const stream = options.stream || process.stderr;
  stream.write(`${line}\n`);
  return line;
}

/**
 * Compact RELAY STATUS card for proven ONLINE (after polling starts).
 * Does not repeat Repository / Poll Interval (already in RELAY CONFIGURATION).
 */
export function formatRelayStatusCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const status = String(input.status || 'ONLINE').toUpperCase();
  return formatBbsCard({
    title: 'RELAY STATUS',
    accent: status === 'ONLINE' || status === 'READY' ? 'ONLINE' : status,
    useColor,
    innerWidth: options.innerWidth,
    rows: [
      ['Status', status, status === 'ONLINE' || status === 'READY' ? 'success' : 'status'],
    ],
  });
}

export function printRelayStatusCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatRelayStatusCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Compact TASK STATUS / timeline mini-card for proven lifecycle events.
 * Append-only; does not fabricate events.
 */
export function formatTaskStatusCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const taskId = String(input.taskId || input.id || input.label || '').trim() || 'UNKNOWN';
  const event = String(input.event || input.status || 'STATUS').toUpperCase();
  const rows = [
    ['Status', event, input.emphasis || taskEventEmphasis(event)],
  ];
  if (Array.isArray(input.rows)) {
    for (const row of input.rows) {
      if (Array.isArray(row)) rows.push(row);
      else if (row && typeof row === 'object') {
        rows.push([row.label ?? '', row.value ?? '', row.emphasis]);
      }
    }
  }
  const title = String(input.title || 'TASK STATUS').toUpperCase();
  return formatBbsCard({
    title,
    accent: input.accent || event,
    useColor,
    innerWidth: options.innerWidth,
    headerLines: [taskId],
    rows,
  });
}

export function printTaskStatusCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatTaskStatusCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Compact AGENT HANDOFF follow-up — avoids a second full AGENT LAUNCHER card.
 */
export function formatAgentHandoffCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const ok = String(input.phase || 'success').toLowerCase() !== 'failed';
  const rows = [
    ['Handoff', ok ? 'SUCCESS' : 'FAILED', ok ? 'success' : 'danger'],
  ];
  if (input.pid != null && Number(input.pid) > 0) {
    rows.push(['PID', String(input.pid)]);
  }
  if (!ok && input.reason) {
    rows.push(['Reason', truncateDisplay(input.reason, 200), 'danger']);
  }
  return formatBbsCard({
    title: 'AGENT HANDOFF',
    accent: ok ? 'SUCCESS' : 'FAILED',
    useColor,
    innerWidth: options.innerWidth,
    rows,
  });
}

export function printAgentHandoffCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatAgentHandoffCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * RELAY ERROR card for Store/tick failures.
 * Normal mode must not include temp paths, UUIDs, or stack traces.
 */
export function formatRelayErrorCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const component = truncateDisplay(input.component || 'GitHub Relay', 40);
  const operation = truncateDisplay(input.operation || 'TICK', 40);
  const code = truncateDisplay(input.code || 'ERROR', 24);
  const status = String(input.status || 'FAILED').toUpperCase();
  const reason = truncateDisplay(
    input.safeReason || input.reason || '',
    80,
  );
  const rows = [
    ['Component', component, 'danger'],
    ['Operation', operation],
    ['Code', code, 'danger'],
    ['Status', status, 'danger'],
  ];
  if (reason) rows.push(['Reason', reason, 'danger']);
  return formatBbsCard({
    title: 'RELAY ERROR',
    accent: 'FAILED',
    useColor,
    innerWidth: options.innerWidth,
    rows,
  });
}

export function printRelayErrorCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatRelayErrorCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Optional recovered notice after a proven transient Store rename retry.
 */
export function formatRelayRecoveredCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  return formatBbsCard({
    title: 'RELAY RECOVERED',
    accent: 'SUCCESS',
    useColor,
    innerWidth: options.innerWidth,
    rows: [
      ['Component', truncateDisplay(input.component || 'Bridge Store', 40), 'success'],
      ['Operation', truncateDisplay(input.operation || 'STORE COMMIT', 40)],
      ['Status', 'RECOVERED', 'success'],
      ['Attempts', String(input.attempts || '')],
    ],
  });
}

export function printRelayRecoveredCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatRelayRecoveredCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Compact AGENT RECOVERY card for a real stale-lifecycle transition.
 * Normal mode must not include nonce, session paths, or PID noise.
 */
export function formatAgentRecoveryCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const taskId = String(input.taskId || input.id || '').trim() || 'UNKNOWN';
  const project = String(input.project || input.projectDisplayName || '').trim()
    || String(input.projectId || '').trim()
    || 'UNKNOWN';
  const previous = String(input.previousLabel || input.previous || 'STALE SESSION').trim();
  const status = String(input.statusLabel || input.action || 'RELEASED').trim().toUpperCase();
  const unlock = String(input.unlockLabel || 'PROJECT UNLOCKED').trim();

  return formatBbsCard({
    title: 'AGENT RECOVERY',
    accent: 'RECOVERY',
    useColor,
    innerWidth: options.innerWidth,
    rows: [
      ['Task', taskId],
      ['Project', project],
      ['Previous', previous, 'warn'],
      ['Status', status, status.includes('BLOCK') ? 'warn' : 'success'],
      ['Action', unlock, 'success'],
    ],
  });
}

export function printAgentRecoveryCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatAgentRecoveryCard(input, { ...options, useColor });
  return writeCard(text, options);
}

/**
 * Compact AGENT AUTO-CLOSED state (distinct from full COMPLETED result card).
 */
export function formatAgentAutoClosedCard(input = {}, options = {}) {
  const useColor = Boolean(options.useColor);
  const taskId = String(input.taskId || input.id || '').trim() || 'UNKNOWN';
  return formatBbsCard({
    title: 'AGENT AUTO-CLOSED',
    accent: 'AUTO-CLOSED',
    useColor,
    innerWidth: options.innerWidth,
    headerLines: [taskId],
    rows: [
      ['Agent', 'AUTO-CLOSED', 'success'],
    ],
  });
}

export function printAgentAutoClosedCard(input = {}, options = {}) {
  const useColor = resolveColor(options);
  const text = formatAgentAutoClosedCard(input, { ...options, useColor });
  return writeCard(text, options);
}

export { stripAnsi, shouldUseAnsi, ANSI };
