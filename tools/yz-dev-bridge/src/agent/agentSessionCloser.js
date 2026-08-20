import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { isProcessAlive } from './cursorAgentLauncher.js';
import { parseJsonBomSafe } from '../jsonBom.js';

export const TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED = 'unsupported';

export function buildCloseRequestPath(sessionFilePath) {
  if (!sessionFilePath) return null;
  return `${String(sessionFilePath)}.close-request`;
}

export function buildSessionOutcomePath(sessionFilePath) {
  if (!sessionFilePath) return null;
  return `${String(sessionFilePath)}.outcome.json`;
}

export function normalizeExactAgentSession(session) {
  if (!session || typeof session !== 'object') return null;
  const pid = Number(session.pid);
  return {
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    startedAt: session.startedAt ? String(session.startedAt) : null,
    nonce: session.nonce ? String(session.nonce) : null,
    taskId: session.taskId ? String(session.taskId) : null,
    file: session.file ? String(session.file) : null,
    workspace: session.workspace ? String(session.workspace) : null,
  };
}

export function assertExactAgentSession(taskId, session) {
  const safe = normalizeExactAgentSession(session);
  if (!safe?.pid || !safe?.startedAt || !safe?.nonce) {
    throw new Error(`Task ${taskId} is missing an exact registered agent session identity`);
  }
  return safe;
}

export function evaluateAutoCloseResult(result = {}) {
  const processClosed = Boolean(result.processClosed);
  const intentionalClose = Boolean(result.intentionalClose);
  const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : null;
  const terminalCloseVisibility = result.terminalCloseVisibility || TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED;
  const windowClosed = result.windowClosed === true;
  const alreadyExited = Boolean(result.alreadyExited);
  const forced = Boolean(result.forced);
  const graceful = Boolean(result.graceful) || (intentionalClose && exitCode === 0 && !forced);

  // Full auto-close success requires an observed window/tab close. Process-only success is partial.
  const processCloseVerified = processClosed && (alreadyExited || graceful || exitCode === 0);
  const fullAutoCloseSuccess = processCloseVerified && windowClosed && terminalCloseVisibility !== TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED;
  const reportableCompleted = processCloseVerified && !forced && (exitCode === 0 || alreadyExited || intentionalClose);

  return {
    ok: reportableCompleted,
    fullAutoCloseSuccess,
    processCloseVerified,
    processClosed,
    intentionalClose,
    alreadyExited,
    forced,
    graceful,
    exitCode,
    windowClosed: windowClosed === true,
    terminalCloseVisibility,
    reason: result.reason || null,
  };
}

export async function writeCloseRequestFile({
  sessionFilePath,
  taskId,
  nonce,
  reason = 'completed-auto-close',
  writeImpl = writeFile,
} = {}) {
  const path = buildCloseRequestPath(sessionFilePath);
  if (!path) throw new Error('session file path is required for close request');
  const payload = {
    taskId: String(taskId),
    nonce: String(nonce),
    reason: String(reason),
    requestedAt: new Date().toISOString(),
  };
  await writeImpl(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { path, payload };
}

export async function readSessionOutcomeFile(sessionFilePath, { readImpl = readFile, existsImpl = existsSync } = {}) {
  const path = buildSessionOutcomePath(sessionFilePath);
  if (!path || !existsImpl(path)) return null;
  try {
    return parseJsonBomSafe(await readImpl(path, 'utf8'), { source: path });
  } catch {
    return null;
  }
}

function runPowerShell(command, spawnSyncImpl = spawnSync) {
  return spawnSyncImpl('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', command,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  });
}

function parseLastJsonLine(stdout, source) {
  const line = String(stdout || '')
    .trim()
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .pop();
  return parseJsonBomSafe(line || '{"ok":false}', { source });
}

/**
 * Task-scoped graceful closer:
 * 1) write close-request for the exact session nonce
 * 2) wait for the registered wrapper PID to exit
 * 3) read wrapper outcome (exit 0 / intentionalClose) when present
 * 4) never kill by process name; never target unrelated sessions
 */
export async function closeAgentSessionGracefully({
  taskId,
  session,
  waitMs = 12_000,
  pollMs = 250,
  spawnSyncImpl = spawnSync,
  aliveImpl = isProcessAlive,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  writeImpl = writeFile,
  readImpl = readFile,
  existsImpl = existsSync,
  allowForcedFallback = false,
} = {}) {
  const safe = assertExactAgentSession(taskId, session);
  if (!safe.file) {
    throw new Error(`Task ${taskId} agent session is missing the exact session file path`);
  }

  if (!aliveImpl(safe.pid)) {
    const outcome = await readSessionOutcomeFile(safe.file, { readImpl, existsImpl });
    const evaluated = evaluateAutoCloseResult({
      ok: true,
      alreadyExited: true,
      processClosed: true,
      intentionalClose: Boolean(outcome?.intentionalClose),
      exitCode: Number.isInteger(outcome?.exitCode) ? outcome.exitCode : null,
      windowClosed: false,
      terminalCloseVisibility: TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED,
      reason: 'already-exited',
      graceful: Boolean(outcome?.intentionalClose && outcome?.exitCode === 0),
    });
    return {
      ...evaluated,
      alreadyExited: true,
      method: 'already-exited',
      outcome,
      closeRequestPath: buildCloseRequestPath(safe.file),
    };
  }

  await writeCloseRequestFile({
    sessionFilePath: safe.file,
    taskId: safe.taskId || taskId,
    nonce: safe.nonce,
    reason: 'completed-auto-close',
    writeImpl,
  });

  const deadline = Date.now() + waitMs;
  while (Date.now() <= deadline) {
    if (!aliveImpl(safe.pid)) break;
    await sleepImpl(pollMs);
  }

  let forced = false;
  if (aliveImpl(safe.pid)) {
    if (!allowForcedFallback) {
      const evaluated = evaluateAutoCloseResult({
        processClosed: false,
        intentionalClose: true,
        exitCode: null,
        windowClosed: false,
        terminalCloseVisibility: TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED,
        reason: 'wrapper-did-not-exit-after-close-request',
        forced: false,
      });
      return {
        ...evaluated,
        ok: false,
        method: 'close-request-timeout',
        closeRequestPath: buildCloseRequestPath(safe.file),
        outcome: await readSessionOutcomeFile(safe.file, { readImpl, existsImpl }),
      };
    }

    // Exact-PID fallback only (no process-name targeting). Force-kill is diagnosed as non-graceful.
    const command = [
      '$ErrorActionPreference = \'Stop\'',
      `$pidValue = ${safe.pid}`,
      `$expectedStart = '${safe.startedAt.replace(/'/g, "''")}'`,
      '$proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue',
      'if (-not $proc) { Write-Output \'{"ok":true,"alreadyExited":true}\'; exit 0 }',
      '$actualStart = $proc.StartTime.ToUniversalTime().ToString(\'o\')',
      'if ($actualStart -ne $expectedStart) { throw "registered session start time mismatch" }',
      '$result = Start-Process -FilePath taskkill.exe -ArgumentList @(\'/PID\', "$pidValue", \'/T\', \'/F\') -PassThru -Wait -WindowStyle Hidden',
      'if ($result.ExitCode -ne 0 -and $result.ExitCode -ne 128) { throw "taskkill failed with exit code $($result.ExitCode)" }',
      'Write-Output \'{"ok":true,"forced":true}\'',
    ].join('; ');
    const killResult = runPowerShell(command, spawnSyncImpl);
    if (killResult.status !== 0) {
      throw new Error(String(killResult.stderr || killResult.stdout || 'agent auto-close forced fallback failed').trim());
    }
    forced = true;
    await sleepImpl(300);
  }

  const processClosed = !aliveImpl(safe.pid);
  if (!processClosed) {
    throw new Error(`Registered agent wrapper pid ${safe.pid} is still alive after close attempt`);
  }

  const outcome = await readSessionOutcomeFile(safe.file, { readImpl, existsImpl });
  const exitCode = Number.isInteger(outcome?.exitCode)
    ? outcome.exitCode
    : (forced ? 1 : null);
  const intentionalClose = Boolean(outcome?.intentionalClose) || (!forced && processClosed);
  const evaluated = evaluateAutoCloseResult({
    processClosed: true,
    intentionalClose,
    alreadyExited: false,
    forced,
    exitCode,
    graceful: !forced && exitCode === 0,
    windowClosed: false,
    terminalCloseVisibility: TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED,
    reason: forced ? 'forced-exact-pid-fallback' : 'close-request-wrapper-exit',
  });

  return {
    ...evaluated,
    method: forced ? 'forced-exact-pid' : 'close-request',
    outcome,
    closeRequestPath: buildCloseRequestPath(safe.file),
  };
}

/** @deprecated Prefer closeAgentSessionGracefully; retained for focused unit tests of identity checks. */
export function closeAgentSessionProcessTree({ taskId, session, spawnSyncImpl = spawnSync }) {
  const safe = assertExactAgentSession(taskId, session);
  const command = [
    '$ErrorActionPreference = \'Stop\'',
    `$pidValue = ${safe.pid}`,
    `$expectedStart = '${safe.startedAt.replace(/'/g, "''")}'`,
    '$proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue',
    'if (-not $proc) { Write-Output \'{"ok":true,"alreadyExited":true,"processClosed":true,"exitCode":null,"intentionalClose":false,"forced":false}\'; exit 0 }',
    '$actualStart = $proc.StartTime.ToUniversalTime().ToString(\'o\')',
    'if ($actualStart -ne $expectedStart) { throw "registered session start time mismatch" }',
    '$result = Start-Process -FilePath taskkill.exe -ArgumentList @(\'/PID\', $pidValue, \'/T\', \'/F\') -PassThru -Wait -WindowStyle Hidden',
    'if ($result.ExitCode -ne 0) { throw "taskkill failed with exit code $($result.ExitCode)" }',
    'Write-Output \'{"ok":true,"alreadyExited":false,"processClosed":true,"exitCode":1,"intentionalClose":false,"forced":true}\'',
  ].join('; ');
  const result = runPowerShell(command, spawnSyncImpl);
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'agent auto-close failed').trim());
  }
  const parsed = parseLastJsonLine(result.stdout, 'agent-auto-close-stdout');
  return evaluateAutoCloseResult({
    ...parsed,
    windowClosed: false,
    terminalCloseVisibility: TERMINAL_CLOSE_VISIBILITY_UNSUPPORTED,
    reason: parsed.alreadyExited ? 'already-exited' : 'forced-taskkill',
  });
}
