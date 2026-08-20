import { spawnSync } from 'node:child_process';
import { isProcessAlive } from './cursorAgentLauncher.js';
import { normalizeExactAgentSession } from './agentSessionCloser.js';

/**
 * Read-only identity check: registered session pid + StartTime must match.
 * Reuses the same Windows process StartTime comparison used by auto-close.
 * Does not kill or signal processes.
 */

function runPowerShell(command, spawnSyncImpl = spawnSync) {
  return spawnSyncImpl('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', command,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
}

function parseLastJsonLine(stdout) {
  const line = String(stdout || '')
    .trim()
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .pop();
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Verify the OS process at session.pid is the same process that registered
 * (StartTime matches session.startedAt). PID-only checks are insufficient
 * because Windows can reuse PIDs.
 *
 * @returns {{ live: boolean, reason: string }}
 */
export function verifyRegisteredSessionProcessIdentity(session, {
  spawnSyncImpl = spawnSync,
  aliveImpl = isProcessAlive,
} = {}) {
  const safe = normalizeExactAgentSession(session);
  if (!safe?.pid || !safe?.startedAt) {
    return { live: false, reason: 'incomplete-session' };
  }
  if (!aliveImpl(safe.pid)) {
    return { live: false, reason: 'pid-not-alive' };
  }

  const command = [
    '$ErrorActionPreference = \'Stop\'',
    `$pidValue = ${safe.pid}`,
    `$expectedStart = '${safe.startedAt.replace(/'/g, "''")}'`,
    '$proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue',
    'if (-not $proc) { Write-Output \'{"live":false,"reason":"pid-missing"}\'; exit 0 }',
    '$actualStart = $proc.StartTime.ToUniversalTime().ToString(\'o\')',
    'if ($actualStart -ne $expectedStart) { Write-Output \'{"live":false,"reason":"start-time-mismatch"}\'; exit 0 }',
    'Write-Output \'{"live":true,"reason":"identity-matched"}\'',
  ].join('; ');

  const result = runPowerShell(command, spawnSyncImpl);
  if (result.status !== 0) {
    // Fail closed: cannot prove identity match.
    return { live: false, reason: 'identity-check-failed' };
  }
  const parsed = parseLastJsonLine(result.stdout);
  if (!parsed || typeof parsed !== 'object') {
    return { live: false, reason: 'identity-check-unparsed' };
  }
  return {
    live: Boolean(parsed.live),
    reason: String(parsed.reason || (parsed.live ? 'identity-matched' : 'not-live')),
  };
}

/**
 * Strong liveness for a registered Agent wrapper session.
 * Prefer injecting `isSessionProcessLive` in tests.
 *
 * Does NOT treat launcher/wt shim PIDs as the Agent — only the registered session.
 */
export function isRegisteredAgentSessionLive(session, {
  isSessionProcessLive = null,
  spawnSyncImpl = spawnSync,
  aliveImpl = isProcessAlive,
} = {}) {
  const safe = normalizeExactAgentSession(session);
  if (!safe?.pid || !safe?.startedAt || !safe?.nonce) return false;

  if (typeof isSessionProcessLive === 'function') {
    return Boolean(isSessionProcessLive(safe));
  }

  return verifyRegisteredSessionProcessIdentity(safe, { spawnSyncImpl, aliveImpl }).live;
}

export function hasCompleteRegisteredAgentSession(session) {
  const safe = normalizeExactAgentSession(session);
  return Boolean(safe?.pid && safe?.startedAt && safe?.nonce);
}
