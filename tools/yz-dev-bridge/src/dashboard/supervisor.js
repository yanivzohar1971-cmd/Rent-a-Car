import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAgentActiveForProjectTask, isPidAlive } from '../store.js';
import { relayRuntimePathForStore } from '../github/relayRuntimeStatus.js';
import { sanitizeErrorMessage, sanitizeText } from './sanitize.js';

function defaultRelayScript() {
  return fileURLToPath(new URL('../githubRelay.js', import.meta.url));
}

export class RelaySupervisorError extends Error {
  constructor(message, code = 'RELAY_SUPERVISOR') {
    super(message);
    this.name = 'RelaySupervisorError';
    this.code = code;
  }
}

export class DashboardSupervisor {
  constructor({
    store,
    relayScript = defaultRelayScript(),
    env = process.env,
    spawnImpl = spawn,
    pidAliveImpl = isPidAlive,
    logLimit = 80,
  } = {}) {
    if (!store) throw new RelaySupervisorError('store is required', 'STORE_REQUIRED');
    this.store = store;
    this.relayScript = relayScript;
    this.env = env;
    this.spawnImpl = spawnImpl;
    this.pidAliveImpl = pidAliveImpl;
    this.logLimit = logLimit;
    this.child = null;
    this.pendingRestartAfterTask = false;
    this.lastRelayError = null;
    this.relayLogs = [];
    this.startedAt = new Date().toISOString();
    this.onInfrastructureEvent = null;
  }

  get relayPid() {
    const pid = Number(this.child?.pid);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  isOwnedRelayLive() {
    const pid = this.relayPid;
    if (!pid) return false;
    return this.pidAliveImpl(pid);
  }

  captureLog(stream, chunk) {
    const text = sanitizeText(String(chunk || '').replace(/\x1b\[[0-9;]*m/g, ''), { debug: false });
    if (!text.trim()) return;
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      this.relayLogs.push({ at: new Date().toISOString(), stream, line: line.slice(0, 240) });
      const classified = classifyInfrastructureLine(line);
      if (classified) {
        this.lastRelayError = classified.message;
        if (typeof this.onInfrastructureEvent === 'function') {
          this.onInfrastructureEvent(classified);
        }
      }
    }
    if (this.relayLogs.length > this.logLimit) {
      this.relayLogs.splice(0, this.relayLogs.length - this.logLimit);
    }
  }

  async hasActiveAgentTask() {
    const snapshot = await this.store.readSnapshot();
    const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
    return tasks.some((task) => (
      task.status === 'IN_PROGRESS' || isAgentActiveForProjectTask(task)
    ));
  }

  observedRelayPid() {
    try {
      const file = relayRuntimePathForStore(this.store.filePath);
      if (!existsSync(file)) return null;
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      const pid = Number(parsed?.pid);
      if (!Number.isInteger(pid) || pid <= 0) return null;
      if (!this.pidAliveImpl(pid)) return null;
      return pid;
    } catch {
      return null;
    }
  }

  startRelay({ force = false } = {}) {
    if (this.isOwnedRelayLive()) {
      throw new RelaySupervisorError('Relay already running (owned child)', 'RELAY_ALREADY_RUNNING');
    }
    const observed = this.observedRelayPid();
    if (observed && observed !== this.relayPid) {
      throw new RelaySupervisorError(
        `Relay already running (pid ${observed}, not owned by this Supervisor)`,
        'RELAY_ALREADY_RUNNING',
      );
    }
    this.child = null;
    if (!existsSync(this.relayScript) && !force) {
      throw new RelaySupervisorError('Relay script is missing', 'RELAY_SCRIPT_MISSING');
    }
    const childEnv = {
      ...this.env,
      YZ_BRIDGE_RELAY_RUNTIME_FILE: this.env.YZ_BRIDGE_RELAY_RUNTIME_FILE || undefined,
    };
    const child = this.spawnImpl(process.execPath, [this.relayScript], {
      cwd: this.env.YZ_BRIDGE_CWD || undefined,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    child.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
      this.captureLog('stdout', chunk);
    });
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      this.captureLog('stderr', chunk);
    });
    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      if (code && code !== 0) {
        this.lastRelayError = sanitizeErrorMessage(`Relay exited ${code}${signal ? `/${signal}` : ''}`);
        if (typeof this.onInfrastructureEvent === 'function') {
          this.onInfrastructureEvent({
            type: 'RELAY_ERROR',
            message: this.lastRelayError,
          });
        }
      }
    });
    child.on('error', (error) => {
      this.lastRelayError = sanitizeErrorMessage(error?.message || error);
      if (this.child === child) this.child = null;
      if (typeof this.onInfrastructureEvent === 'function') {
        this.onInfrastructureEvent({ type: 'RELAY_ERROR', message: this.lastRelayError });
      }
    });
    this.pendingRestartAfterTask = false;
    return { ok: true, pid: this.relayPid, state: 'ONLINE' };
  }

  async stopRelay() {
    const child = this.child;
    const pid = this.relayPid;
    this.pendingRestartAfterTask = false;
    if (!child || !pid) {
      return { ok: true, pid: null, state: 'OFFLINE', stopped: false };
    }
    await terminateOwnedChild(child, this.pidAliveImpl);
    if (this.child === child) this.child = null;
    return { ok: true, pid, state: 'OFFLINE', stopped: true };
  }

  async restartRelay({ afterCurrentTask = false } = {}) {
    if (afterCurrentTask || await this.hasActiveAgentTask()) {
      if (await this.hasActiveAgentTask()) {
        this.pendingRestartAfterTask = true;
        return {
          ok: true,
          scheduled: true,
          state: this.isOwnedRelayLive() ? 'ONLINE' : 'OFFLINE',
          pid: this.relayPid,
          message: 'Restart scheduled after current task',
        };
      }
    }
    await this.stopRelay();
    const started = this.startRelay();
    return { ok: true, scheduled: false, ...started };
  }

  async maybeRunPendingRestart() {
    if (!this.pendingRestartAfterTask) return null;
    if (await this.hasActiveAgentTask()) return { waiting: true };
    this.pendingRestartAfterTask = false;
    return this.restartRelay({ afterCurrentTask: false });
  }

  status() {
    const live = this.isOwnedRelayLive();
    return {
      state: live ? 'ONLINE' : 'OFFLINE',
      pid: live ? this.relayPid : null,
      owned: live,
      pendingRestartAfterTask: this.pendingRestartAfterTask,
      lastError: this.lastRelayError,
    };
  }
}

export function classifyInfrastructureLine(line) {
  const text = String(line || '');
  if (!text.trim()) return null;
  if (/Timed out waiting for bridge lock|STORE LOCK|lock wait/i.test(text)) {
    return { type: 'STORE_RETRY', message: sanitizeErrorMessage(text) };
  }
  if (/\bEPERM\b|\bEBUSY\b/i.test(text)) {
    return { type: 'STORE_RETRY', message: sanitizeErrorMessage(text) };
  }
  if (/GitHub authentication|GitHub API|HTTP 4\d\d|HTTP 5\d\d/i.test(text)) {
    return { type: 'RELAY_ERROR', message: sanitizeErrorMessage(text) };
  }
  if (/agent launch|VisibleAgentLaunch|Cursor Agent unavailable/i.test(text)) {
    return { type: 'RELAY_ERROR', message: sanitizeErrorMessage(text) };
  }
  if (/project route|Unknown projectId|PROJECT_/i.test(text)) {
    return { type: 'RELAY_ERROR', message: sanitizeErrorMessage(text) };
  }
  if (/result publication|could not post result|addComment/i.test(text)) {
    return { type: 'RELAY_ERROR', message: sanitizeErrorMessage(text) };
  }
  if (/RELAY ERROR|tick failed/i.test(text)) {
    return { type: 'RELAY_ERROR', message: sanitizeErrorMessage(text) };
  }
  return null;
}

async function terminateOwnedChild(child, pidAliveImpl, {
  sleepImpl = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
} = {}) {
  const pid = Number(child.pid);
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const graceMs = process.platform === 'win32' ? 250 : 4000;
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!pidAliveImpl(pid)) return;
    await sleepImpl(50);
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // Windows may have already reaped the process.
  }
}

export { defaultRelayScript };
