/**
 * Cosmetic BBS-style ANSI/ASCII startup banner for github-relay.
 * No network I/O; statuses must reflect only known local startup state.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_OPEN_AGENT_SCRIPT,
  projectMcpConfigPath,
  resolveCursorAgentPath,
  TRUSTED_BRIDGE_MCP_SERVER,
} from '../agent/cursorAgentLauncher.js';
import { getBridgeRoot } from './githubRelayConfig.js';
import { parseJsonBomSafe } from '../jsonBom.js';

export const ANSI = Object.freeze({
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  blue: '\x1b[34m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[93m',
  red: '\x1b[91m',
  white: '\x1b[97m',
});

/** Clear visible screen + home cursor (Windows Terminal / PowerShell / VT-compatible). */
export const CLEAR_SCREEN = '\x1b[2J\x1b[H';

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

const PROVEN_OK = /^(ONLINE|READY|CONNECTED|COMPLETED|OK)(\b|$)/i;
const FAILURE = /^(FAILED|ERROR|OFFLINE)(\b|$)/i;
const WAITING_LIKE = /\b(WAITING|WARN|PENDING|INCOMING|INIT|CHECKING)\b/i;

/**
 * Decide whether to emit ANSI color codes.
 * Honors NO_COLOR and FORCE_COLOR; otherwise requires a TTY stream.
 */
export function shouldUseAnsi(stream = process.stderr, env = process.env) {
  if (env.NO_COLOR != null && String(env.NO_COLOR) !== '') return false;
  if (String(env.FORCE_COLOR ?? '') === '0') return false;
  if (env.FORCE_COLOR != null && String(env.FORCE_COLOR) !== '') return true;
  return Boolean(stream && stream.isTTY);
}

/**
 * Decide whether to clear the terminal before the BBS banner.
 * Based on interactive TTY only — independent of NO_COLOR / FORCE_COLOR.
 * Non-TTY, redirected, and CI pipes must never emit clear sequences.
 */
export function shouldClearTerminal(stream = process.stderr) {
  return Boolean(stream && stream.isTTY);
}

/**
 * Clear the visible terminal when the stream is an interactive TTY.
 * Uses ANSI erase+home (no shell `cls` subprocess). Returns true if cleared.
 */
export function clearInteractiveTerminal(options = {}) {
  const stream = options.stream || process.stderr;
  if (!shouldClearTerminal(stream)) return false;
  stream.write(CLEAR_SCREEN);
  return true;
}

function paint(enabled, code, text) {
  if (!enabled) return String(text);
  return `${code}${text}${ANSI.reset}`;
}

const ELLIPSIS = '...';
const STATUS_LABEL_WIDTH = 18;

function padStatus(label, width = STATUS_LABEL_WIDTH) {
  const raw = String(label);
  if (raw.length > width) return raw.slice(0, width);
  if (raw.length === width) return raw;
  return `${raw}${' '.repeat(width - raw.length)}`;
}

function truncateDisplay(value, maxLen) {
  const text = String(value ?? '');
  if (maxLen <= 0) return '';
  if (text.length <= maxLen) return text;
  if (maxLen <= ELLIPSIS.length) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - ELLIPSIS.length)}${ELLIPSIS}`;
}

/**
 * Map a status token to ANSI color. Green only for proven healthy tokens.
 */
export function statusColor(enabled, status) {
  const value = String(status || '');
  const head = value.trim().split(/\s+/)[0] || '';
  if (FAILURE.test(head)) return paint(enabled, ANSI.red, status);
  if (PROVEN_OK.test(head)) return paint(enabled, ANSI.brightGreen, status);
  if (WAITING_LIKE.test(value)) return paint(enabled, ANSI.yellow, status);
  // DISABLED / UNAVAILABLE / UNKNOWN / CONFIGURED — neutral cyan, never green
  return paint(enabled, ANSI.cyan, status);
}

/**
 * Local-only Cursor Agent readiness: auto-launch on + launcher binary/script present.
 * Uses existsSync only (no agent --version / network).
 */
export function resolveCursorAgentBannerStatus({
  autoLaunch = false,
  cursorAgentPath = '',
  workspacePath = '',
  existsImpl = existsSync,
} = {}) {
  const evidence = {
    autoLaunch: Boolean(autoLaunch),
    configuredPath: String(cursorAgentPath || '').trim() || null,
    resolvedAgentPath: null,
    openScriptPath: DEFAULT_OPEN_AGENT_SCRIPT,
    openScriptExists: false,
  };

  if (!evidence.autoLaunch) {
    return {
      status: 'DISABLED',
      detail: 'DISABLED (auto-launch off)',
      evidence: { ...evidence, reason: 'auto-launch disabled' },
    };
  }

  const resolvedAgentPath = resolveCursorAgentPath({
    configuredPath: evidence.configuredPath || '',
    whichOutput: '',
    existsImpl,
  });
  evidence.resolvedAgentPath = resolvedAgentPath || null;
  evidence.openScriptExists = Boolean(existsImpl(DEFAULT_OPEN_AGENT_SCRIPT));

  const agentReady = Boolean(resolvedAgentPath && existsImpl(resolvedAgentPath));
  const launcherReady = evidence.openScriptExists;

  if (agentReady && launcherReady) {
    return {
      status: 'READY',
      detail: 'READY (auto-launch enabled)',
      evidence: {
        ...evidence,
        reason: 'auto-launch on; agent path and open-visible-agent.ps1 exist',
      },
    };
  }

  return {
    status: 'UNAVAILABLE',
    detail: 'UNAVAILABLE (auto-launch enabled)',
    evidence: {
      ...evidence,
      reason: !agentReady
        ? 'cursor-agent path not found on disk'
        : 'open-visible-agent.ps1 missing',
    },
  };
}

/**
 * Local MCP availability evidence from workspace mcp.json + entrypoint file.
 * Does not probe a live MCP session or open sockets.
 */
export function resolveMcpBannerStatus({
  workspacePath = '',
  existsImpl = existsSync,
  readFileImpl = readFileSync,
} = {}) {
  const mcpPath = projectMcpConfigPath(workspacePath);
  const evidence = {
    mcpConfigPath: mcpPath,
    mcpConfigExists: false,
    serverKey: TRUSTED_BRIDGE_MCP_SERVER,
    entrypoint: null,
    entrypointExists: false,
  };

  if (!existsImpl(mcpPath)) {
    return {
      status: 'UNKNOWN',
      evidence: { ...evidence, reason: 'mcp.json missing' },
    };
  }
  evidence.mcpConfigExists = true;

  let parsed;
  try {
    parsed = parseJsonBomSafe(readFileImpl(mcpPath, 'utf8'), { source: mcpPath });
  } catch {
    return {
      status: 'UNKNOWN',
      evidence: { ...evidence, reason: 'mcp.json unreadable' },
    };
  }

  const server = parsed?.mcpServers?.[TRUSTED_BRIDGE_MCP_SERVER]
    || parsed?.mcpServers?.['yz-dev-bridge'];
  if (!server) {
    return {
      status: 'UNKNOWN',
      evidence: { ...evidence, reason: 'yz-dev-bridge server not declared' },
    };
  }

  const args = Array.isArray(server.args) ? server.args : [];
  const entryFromArgs = args.find((item) => /stdio\.js$/i.test(String(item))) || args[0] || null;
  const entrypoint = entryFromArgs
    ? resolve(String(entryFromArgs))
    : resolve(getBridgeRoot(), 'src', 'stdio.js');
  evidence.entrypoint = entrypoint;
  evidence.entrypointExists = Boolean(existsImpl(entrypoint));

  if (evidence.entrypointExists) {
    return {
      status: 'READY',
      evidence: {
        ...evidence,
        reason: 'mcp.json declares yz-dev-bridge with existing stdio entrypoint',
      },
    };
  }

  return {
    status: 'CONFIGURED',
    evidence: {
      ...evidence,
      reason: 'yz-dev-bridge declared but entrypoint file missing',
    },
  };
}

/**
 * Firebase row for github-relay: never CONNECTED without a live relay client.
 * Env URL present → CONFIGURED; else UNKNOWN.
 */
export function resolveFirebaseBannerStatus({ env = process.env } = {}) {
  const apiUrl = String(env.YZ_BRIDGE_FIREBASE_API_URL || '').trim();
  if (apiUrl) {
    return {
      status: 'CONFIGURED',
      evidence: {
        apiUrlConfigured: true,
        connected: false,
        reason: 'Firebase API URL present in env; github-relay has no live Firebase session',
      },
    };
  }
  return {
    status: 'UNKNOWN',
    evidence: {
      apiUrlConfigured: false,
      connected: false,
      reason: 'no YZ_BRIDGE_FIREBASE_API_URL; github-relay does not establish Firebase',
    },
  };
}

/**
 * Build truthful banner statuses from local config/runtime evidence only.
 * @param {object} options
 * @param {boolean} [options.githubRelayOnline] true only after polling loop started
 * @param {object} [options.config] github relay config
 * @param {object} [options.env]
 */
export function resolveGithubRelayBannerStatuses(options = {}) {
  const config = options.config || {};
  const env = options.env || process.env;
  const githubRelayOnline = Boolean(options.githubRelayOnline);

  const agent = resolveCursorAgentBannerStatus({
    autoLaunch: config.autoLaunch,
    cursorAgentPath: config.cursorAgentPath,
    workspacePath: config.workspacePath,
    existsImpl: options.existsImpl,
  });
  const mcp = resolveMcpBannerStatus({
    workspacePath: config.workspacePath,
    existsImpl: options.existsImpl,
    readFileImpl: options.readFileImpl,
  });
  const firebase = resolveFirebaseBannerStatus({ env });

  return {
    githubRelayStatus: githubRelayOnline ? 'ONLINE' : 'INIT',
    cursorAgentStatus: agent.status,
    cursorAgentDetail: agent.detail,
    mcpStatus: mcp.status,
    firebaseStatus: firebase.status,
    autoLaunch: Boolean(config.autoLaunch),
    evidence: {
      githubRelay: {
        online: githubRelayOnline,
        reason: githubRelayOnline
          ? 'GithubInboxWorker.start() completed; polling interval armed'
          : 'polling loop not started yet',
      },
      cursorAgent: agent.evidence,
      mcp: mcp.evidence,
      firebase: firebase.evidence,
    },
  };
}

/**
 * Compact one-line status transition (no clear / no cursor gymnastics).
 */
export function formatStatusTransition(label, status, { useColor = false } = {}) {
  const name = String(label);
  const value = String(status);
  const left = paint(useColor, ANSI.cyan, name);
  const right = statusColor(useColor, value);
  return `${left}: ${right}`;
}

export function printStatusTransition(label, status, options = {}) {
  const stream = options.stream || process.stderr;
  const env = options.env || process.env;
  const useColor = options.useColor != null
    ? Boolean(options.useColor)
    : shouldUseAnsi(stream, env);
  const line = formatStatusTransition(label, status, { useColor });
  stream.write(`${line}\n`);
  return line;
}

/**
 * Build banner lines. Does not fabricate subsystem health.
 * @param {object} options
 * @param {boolean} [options.useColor]
 * @param {string} [options.project]
 * @param {string} [options.workspacePath]
 * @param {boolean} [options.autoLaunch]
 * @param {string} [options.version]
 * @param {string|Date} [options.timestamp]
 * @param {string} [options.githubRelayStatus] default INIT
 * @param {string} [options.cursorAgentStatus] default INIT
 * @param {string} [options.cursorAgentDetail] optional full right-hand agent text
 * @param {string} [options.mcpStatus] default INIT
 * @param {string} [options.firebaseStatus] default INIT
 */
export function formatStartupBanner(options = {}) {
  const useColor = Boolean(options.useColor);
  const project = String(options.project || 'Rent_a_Car');
  const workspacePath = String(options.workspacePath || project);
  const autoLaunch = Boolean(options.autoLaunch);
  const version = options.version != null ? String(options.version) : '';
  const ts = options.timestamp
    ? new Date(options.timestamp)
    : new Date();
  const timestamp = Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString();

  const githubStatus = options.githubRelayStatus ?? 'INIT';
  const agentStatus = options.cursorAgentStatus ?? 'INIT';
  const mcpStatus = options.mcpStatus ?? 'INIT';
  const firebaseStatus = options.firebaseStatus ?? 'INIT';

  const frame = (text) => paint(useColor, ANSI.brightCyan, text);
  const heading = (text) => paint(useColor, ANSI.cyan, text);
  const dim = (text) => paint(useColor, ANSI.dim, text);
  const wait = (text) => paint(useColor, ANSI.yellow, text);

  const logo = [
    '  ██╗   ██╗███████╗',
    '  ╚██╗ ██╔╝╚══███╔╝',
    '   ╚████╔╝   ███╔╝ ',
    '    ╚██╔╝   ███╔╝  ',
    '     ██║   ███████╗',
    '     ╚═╝   ╚══════╝',
  ].map((line) => paint(useColor, ANSI.brightCyan + ANSI.bold, line));

  const agentDetail = options.cursorAgentDetail
    ?? (autoLaunch ? `${agentStatus} (auto-launch enabled)` : `${agentStatus} (auto-launch off)`);

  const rows = [
    ['GitHub Relay', githubStatus],
    ['Cursor Agent', agentDetail],
    ['MCP yz-dev-bridge', mcpStatus],
    ['Firebase', firebaseStatus],
    ['Workspace', project],
  ];

  const innerWidth = 54;
  const top = frame(`╔${'═'.repeat(innerWidth)}╗`);
  const mid = frame(`╠${'═'.repeat(innerWidth)}╣`);
  const bot = frame(`╚${'═'.repeat(innerWidth)}╝`);
  const empty = frame(`║${' '.repeat(innerWidth)}║`);

  // Same model as RELAY CONFIGURATION: padded label column, then left-aligned
  // value, then trailing pad to the border (never right-align values).
  const wrapRow = (left, rightStyled, rightPlainLen) => {
    const leftPlain = `  ${padStatus(left, STATUS_LABEL_WIDTH)}`;
    const gap = Math.max(0, innerWidth - leftPlain.length - rightPlainLen);
    const leftStyled = heading(leftPlain);
    const spaces = ' '.repeat(gap);
    return `${frame('║')}${leftStyled}${rightStyled}${spaces}${frame('║')}`;
  };

  const centerPlain = (text) => {
    const t = String(text);
    const pad = Math.max(0, innerWidth - t.length);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return `${' '.repeat(left)}${t}${' '.repeat(right)}`;
  };

  const lines = [
    top,
    empty,
    ...logo.map((line) => {
      const plain = line.replace(ANSI_ESCAPE_RE, '');
      const pad = Math.max(0, innerWidth - plain.length);
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return `${frame('║')}${' '.repeat(left)}${line}${' '.repeat(right)}${frame('║')}`;
    }),
    `${frame('║')}${heading(centerPlain('D E V   B R I D G E'))}${frame('║')}`,
    `${frame('║')}${dim(centerPlain('GitHub Relay'))}${frame('║')}`,
    empty,
    mid,
  ];

  for (const [label, value] of rows) {
    const leftPlain = `  ${padStatus(label, STATUS_LABEL_WIDTH)}`;
    const maxValue = Math.max(8, innerWidth - leftPlain.length);
    const plainValue = truncateDisplay(String(value), maxValue);
    const styledValue = label === 'Workspace'
      ? paint(useColor, ANSI.white, plainValue)
      : statusColor(useColor, plainValue);
    lines.push(wrapRow(label, styledValue, plainValue.length));
  }

  lines.push(mid);
  lines.push(`${frame('║')}${wait(centerPlain('WAITING FOR INCOMING YZ-BRIDGE TASKS'))}${frame('║')}`);

  const metaBits = [
    version ? `v${version}` : null,
    timestamp,
  ].filter(Boolean);
  if (metaBits.length) {
    lines.push(`${frame('║')}${dim(centerPlain(metaBits.join('  ·  ')))}${frame('║')}`);
  }

  lines.push(`${frame('║')}${dim(centerPlain(workspacePath))}${frame('║')}`);
  lines.push(bot);
  lines.push(''); // trailing newline for clean separation from later logs

  return lines.join('\n');
}

/**
 * Print the startup banner to a stream (default stderr).
 * On interactive TTY, clears the visible terminal first (CLS-equivalent).
 * Returns the rendered banner string for tests (clear sequence not included).
 */
export function printStartupBanner(options = {}) {
  const stream = options.stream || process.stderr;
  const env = options.env || process.env;
  const clear = options.clearTerminal != null
    ? Boolean(options.clearTerminal)
    : shouldClearTerminal(stream);
  if (clear) {
    clearInteractiveTerminal({ stream });
  }
  const useColor = options.useColor != null
    ? Boolean(options.useColor)
    : shouldUseAnsi(stream, env);
  const text = formatStartupBanner({ ...options, useColor });
  stream.write(`${text}\n`);
  return text;
}

export function stripAnsi(text) {
  return String(text).replace(ANSI_ESCAPE_RE, '');
}
