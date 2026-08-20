import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import {
  buildAgentSessionFilePath,
  CursorAgentUnavailableError,
  VisibleAgentLaunchError,
  buildStartProcessCommand,
  buildVisibleWindowStartSpec,
  confirmVisibleLaunchHandoff,
  ensureProjectAgentCliConfig,
  ensureProjectAgentBridgeConfigs,
  ensureProjectBridgeMcpConfig,
  isWindowsAppsWtShim,
  parseLaunchedPid,
  resolveCursorAgentPath,
} from './cursorAgentLauncher.js';
import { isJsonBomParseError, parseJsonBomSafe } from '../jsonBom.js';
import {
  isRelayRawLogsEnabled,
  printAgentHandoffCard,
  printAgentLauncherCard,
} from '../github/relayCards.js';

function writeRawLauncherLine(stream, line) {
  const target = stream || process.stderr;
  const text = line.endsWith('\n') ? line : `${line}\n`;
  if (typeof target.write === 'function') {
    target.write(text);
    return;
  }
  console.error(line);
}

function presentLauncherSelected(fields, diagnostic, options = {}) {
  printAgentLauncherCard({
    phase: 'selected',
    taskId: fields.taskId,
    method: fields.method,
    hostLaunchMode: fields.hostLaunchMode,
  }, options);
  if (isRelayRawLogsEnabled(options.env || process.env)) {
    writeRawLauncherLine(
      options.stream,
      `YZ visible Agent launcher selected ${JSON.stringify(diagnostic)}`,
    );
  }
}

function presentLauncherHandoff(fields, diagnostic, options = {}) {
  // Compact follow-up — do not repeat full Task/Launcher/Host AGENT LAUNCHER card.
  printAgentHandoffCard({
    phase: 'success',
    pid: fields.pid,
  }, options);
  if (isRelayRawLogsEnabled(options.env || process.env)) {
    writeRawLauncherLine(
      options.stream,
      `YZ visible Agent launcher handoff ${JSON.stringify(diagnostic)}`,
    );
  }
}

function presentLauncherFailed(fields, options = {}) {
  printAgentLauncherCard({
    phase: 'failed',
    taskId: fields.taskId,
    method: fields.method,
    hostLaunchMode: fields.hostLaunchMode,
    pid: fields.pid,
    reason: fields.reason,
  }, options);
}

function whichAll(command, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('where.exe', [command], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
  });
  return String(result.stdout || '');
}

export function resolveWindowsTerminalPath({
  spawnSyncImpl = spawnSync,
  existsImpl = existsSync,
} = {}) {
  const programFiles = `${process.env.ProgramFiles || ''}\\Windows Terminal\\wt.exe`;
  if (programFiles && existsImpl(programFiles)) return programFiles;

  const fromWhere = whichAll('wt', spawnSyncImpl)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /wt(\.exe)?$/i.test(line));
  const unpacked = fromWhere.find((line) => !/\\WindowsApps\\/i.test(line));
  if (unpacked) return unpacked;
  const aliasFromWhere = fromWhere.find((line) => /\\WindowsApps\\/i.test(line));
  if (aliasFromWhere) return aliasFromWhere;

  const alias = `${process.env.LOCALAPPDATA || ''}\\Microsoft\\WindowsApps\\wt.exe`;
  if (alias && existsImpl(alias)) return alias;
  if (fromWhere.length > 0) return fromWhere[0];
  return null;
}

function spawnAgent(agentPath, args, spawnSyncImpl) {
  const shell = /\.(cmd|bat|ps1)$/i.test(agentPath);
  return spawnSyncImpl(agentPath, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
    shell,
  });
}

export function verifyCursorAgent({
  agentPath,
  spawnSyncImpl = spawnSync,
}) {
  if (!agentPath) {
    throw new CursorAgentUnavailableError(
      'cursor-agent/agent CLI was not found. Install the official Cursor CLI and authenticate (`agent login` / `cursor-agent login`).',
    );
  }
  const version = spawnAgent(agentPath, ['--version'], spawnSyncImpl);
  if (version.status !== 0) {
    throw new CursorAgentUnavailableError(
      `cursor-agent --version failed. Install/authenticate the official Cursor CLI. ${String(version.stderr || version.stdout || '').trim()}`.trim(),
    );
  }
  const status = spawnAgent(agentPath, ['status'], spawnSyncImpl);
  const statusText = `${status.stdout || ''}\n${status.stderr || ''}`.toLowerCase();
  if (status.status !== 0 || statusText.includes('logged out') || statusText.includes('not logged')) {
    throw new CursorAgentUnavailableError(
      'cursor-agent is installed but not authenticated. Run `agent login` or `cursor-agent login` in a terminal, then retry.',
    );
  }
  return {
    path: agentPath,
    version: String(version.stdout || version.stderr || '').trim(),
    status: String(status.stdout || '').trim() || 'authenticated',
  };
}

export function resolveLaunchAgentPath({ configuredPath = '', existsImpl = existsSync, spawnSyncImpl = spawnSync } = {}) {
  const whichOutput = [
    whichAll('cursor-agent', spawnSyncImpl),
    whichAll('agent', spawnSyncImpl),
  ].join('\n');
  return resolveCursorAgentPath({
    configuredPath,
    whichOutput,
    existsImpl,
  });
}

function collectProcessOutput(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.setEncoding('utf8');
    if (child.stderr) child.stderr.setEncoding('utf8');
    if (child.stdout) child.stdout.on('data', (chunk) => { stdout += chunk; });
    if (child.stderr) child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export async function readRegisteredAgentSession(sessionFilePath) {
  let parsed;
  try {
    parsed = parseJsonBomSafe(await readFile(sessionFilePath, 'utf8'), {
      source: sessionFilePath,
    });
  } catch (error) {
    if (error?.code === 'ENOENT') throw error;
    const bomHint = isJsonBomParseError(error) ? ' (UTF-8 BOM or invalid session JSON)' : '';
    throw new VisibleAgentLaunchError(
      `Visible Agent session JSON could not be parsed${bomHint}: ${error instanceof Error ? error.message : String(error)}`,
      {
        method: 'registration',
        file: sessionFilePath,
        pid: null,
        stage: isJsonBomParseError(error) ? 'AGENT_SESSION_JSON_BOM' : 'AGENT_SESSION_JSON_PARSE',
      },
    );
  }
  const pid = Number(parsed?.pid);
  return {
    taskId: parsed?.taskId ? String(parsed.taskId) : null,
    nonce: parsed?.nonce ? String(parsed.nonce) : null,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    startedAt: parsed?.startedAt ? String(parsed.startedAt) : null,
    registeredAt: parsed?.registeredAt ? String(parsed.registeredAt) : null,
    workspace: parsed?.workspace ? String(parsed.workspace) : null,
    file: sessionFilePath,
  };
}

export async function waitForAgentSessionRegistration({
  taskId,
  sessionFilePath,
  sessionNonce,
  timeoutMs = 4_000,
  pollMs = 100,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const session = await readRegisteredAgentSession(sessionFilePath);
      if (
        session.taskId === taskId
        && session.nonce === sessionNonce
        && session.pid
        && session.startedAt
      ) {
        return session;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
    await sleepImpl(pollMs);
  }
  throw new VisibleAgentLaunchError(
    `Visible Agent session for ${taskId} did not register in time`,
    { method: 'registration', file: sessionFilePath, pid: null },
  );
}

export async function launchVisibleCursorAgent({
  taskId,
  workspacePath,
  agentPath,
  keepWindowOpen = false,
  spawnImpl = spawn,
  existsImpl = existsSync,
  spawnSyncImpl = spawnSync,
  wtPath,
  sleepImpl,
  aliveImpl,
  sessionDir,
  sessionNonce = randomUUID(),
  sessionRegistrationWaiter = waitForAgentSessionRegistration,
  presentationStream,
  presentationEnv,
  useColor,
}) {
  const presentOpts = {
    stream: presentationStream || process.stderr,
    env: presentationEnv || process.env,
    ...(useColor != null ? { useColor } : {}),
  };
  const terminal = wtPath === undefined
    ? resolveWindowsTerminalPath({ spawnSyncImpl, existsImpl })
    : wtPath;
  const cliConfig = ensureProjectAgentBridgeConfigs({ workspacePath, existsImpl });
  const sessionFilePath = buildAgentSessionFilePath(taskId, sessionNonce, sessionDir);
  await mkdir(dirname(sessionFilePath), { recursive: true });
  const spec = buildVisibleWindowStartSpec({
    taskId,
    workspacePath,
    agentPath,
    keepWindowOpen,
    wtPath: terminal,
    sessionFilePath,
    sessionNonce,
  });
  const command = buildStartProcessCommand(spec);
  const windowsAppsShim = spec.method === 'wt' && isWindowsAppsWtShim(spec.file);
  const safeLog = {
    method: spec.method,
    file: spec.file,
    title: spec.title,
    keepWindowOpen: spec.keepWindowOpen,
    hostNoExit: spec.hostNoExit,
    hostLaunchMode: spec.hostLaunchMode,
    workspacePath,
    taskId,
    windowsAppsShim,
    argumentListString: spec.argumentListString,
  };
  presentLauncherSelected(
    {
      taskId,
      method: spec.method,
      hostLaunchMode: spec.hostLaunchMode,
    },
    {
      ...safeLog,
      cliConfigPath: cliConfig.cli.path,
      cliConfigCreated: cliConfig.cli.created,
      mcpConfigPath: cliConfig.mcp.path,
      mcpConfigCreated: cliConfig.mcp.created,
    },
    presentOpts,
  );
  const starter = spawnImpl('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-Command',
    command,
  ], {
    cwd: workspacePath,
    windowsHide: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = await collectProcessOutput(starter);
  const pid = parseLaunchedPid(output.stdout);
  const diagnostic = {
    method: spec.method,
    file: spec.file,
    title: spec.title,
    starterExitCode: output.code,
    pid,
    windowsAppsShim,
  };
  if (output.code !== 0 || !pid) {
    const reason = `Failed to open a visible Agent window for ${taskId} (method=${spec.method}, starterExit=${output.code})`;
    presentLauncherFailed({
      taskId,
      method: spec.method,
      hostLaunchMode: spec.hostLaunchMode,
      pid,
      reason,
    }, presentOpts);
    throw new VisibleAgentLaunchError(reason, diagnostic);
  }
  const handoff = await confirmVisibleLaunchHandoff({
    pid,
    method: spec.method,
    file: spec.file,
    sleepImpl,
    aliveImpl,
  });
  if (!handoff.ok) {
    const reason = `Visible Agent window for ${taskId} exited immediately (pid=${pid}, method=${spec.method})`;
    presentLauncherFailed({
      taskId,
      method: spec.method,
      hostLaunchMode: spec.hostLaunchMode,
      pid,
      reason,
    }, presentOpts);
    throw new VisibleAgentLaunchError(
      reason,
      { ...diagnostic, reason: handoff.reason, windowsAppsShim: handoff.windowsAppsShim },
    );
  }
  presentLauncherHandoff(
    {
      taskId,
      method: spec.method,
      hostLaunchMode: spec.hostLaunchMode,
      pid,
    },
    {
      taskId,
      method: spec.method,
      file: spec.file,
      pid,
      windowsAppsShim: handoff.windowsAppsShim,
      handoff: handoff.handoff,
      keepWindowOpen: spec.keepWindowOpen,
      hostNoExit: spec.hostNoExit,
      hostLaunchMode: spec.hostLaunchMode,
    },
    presentOpts,
  );
  const session = await sessionRegistrationWaiter({
    taskId,
    sessionFilePath,
    sessionNonce,
    sleepImpl,
  });
  return {
    pid,
    file: spec.file,
    method: spec.method,
    title: spec.title,
    keepWindowOpen: spec.keepWindowOpen,
    hostNoExit: spec.hostNoExit,
    hostLaunchMode: spec.hostLaunchMode,
    windowsAppsShim: handoff.windowsAppsShim,
    handoff: handoff.handoff,
    session,
  };
}
