import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { PROVIDER_EVENTS, normalizeProviderEvent } from './types.js';

const DEFAULT_MOCK_WORKER = fileURLToPath(new URL('../../workers/mockProviderWorker.js', import.meta.url));

/**
 * Manages a short-lived provider worker over stdin/stdout newline-delimited JSON.
 * A worker crash never throws into the Supervisor event loop uncaught.
 */
export class ProviderWorkerManager extends EventEmitter {
  constructor({
    workerScript = DEFAULT_MOCK_WORKER,
    spawnImpl = spawn,
    env = process.env,
    idleDisposeMs = 0,
  } = {}) {
    super();
    this.workerScript = workerScript;
    this.spawnImpl = spawnImpl;
    this.env = env;
    this.idleDisposeMs = idleDisposeMs;
    this.child = null;
    this.rl = null;
    this.pending = new Map();
    this.lastError = null;
    this.mutatedWorkspace = false;
    this.provider = null;
    this.taskId = null;
    this.executionId = null;
  }

  get alive() {
    return Boolean(this.child && !this.child.killed && this.child.exitCode == null);
  }

  get pid() {
    const pid = Number(this.child?.pid);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  start({ provider = 'mock', taskId = null, executionId = null, extraEnv = {} } = {}) {
    if (this.alive) {
      throw new Error('Provider worker already running');
    }
    this.provider = provider;
    this.taskId = taskId;
    this.executionId = executionId;
    this.mutatedWorkspace = false;
    this.lastError = null;
    this.child = this.spawnImpl(process.execPath, [this.workerScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...this.env,
        YZ_BRIDGE_TEST_MODE: this.env.YZ_BRIDGE_TEST_MODE || '1',
        YZ_BRIDGE_DISABLE_REAL_AGENT_LAUNCH: '1',
        ...extraEnv,
      },
      windowsHide: true,
    });

    this.rl = createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => this.#onLine(line));
    this.child.stderr.on('data', (chunk) => {
      // stderr is diagnostic only — never parse as protocol
      this.emit('stderr', String(chunk));
    });
    this.child.on('exit', (code, signal) => {
      const crash = {
        type: PROVIDER_EVENTS.WORKER_CRASH,
        code,
        signal,
        mutatedWorkspace: this.mutatedWorkspace,
        taskId: this.taskId,
        executionId: this.executionId,
        provider: this.provider,
        at: new Date().toISOString(),
      };
      for (const [, entry] of this.pending) {
        entry.reject(new Error(`Worker exited before response (code=${code})`));
      }
      this.pending.clear();
      this.emit('exit', crash);
      this.child = null;
      this.rl = null;
    });
    this.child.on('error', (error) => {
      this.lastError = error;
      this.emit('error', error);
    });
    return { pid: this.pid };
  }

  async request(command) {
    if (!this.alive) throw new Error('Provider worker is not running');
    const requestId = `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const message = {
      protocolVersion: 1,
      requestId,
      taskId: this.taskId,
      executionId: this.executionId,
      provider: this.provider,
      timestamp: new Date().toISOString(),
      ...command,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Worker request timeout: ${command.type}`));
      }, Number(command.timeoutMs) || 15_000);
      this.pending.set(requestId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      try {
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        this.pending.delete(requestId);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async dispose({ reason = 'dispose' } = {}) {
    if (!this.child) return { disposed: true, reason };
    try {
      await this.request({ type: 'DISPOSE', reason }).catch(() => null);
    } catch { /* ignore */ }
    try {
      this.child.stdin.end();
    } catch { /* ignore */ }
    const child = this.child;
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve();
      }, 1000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
    this.child = null;
    return { disposed: true, reason };
  }

  #onLine(line) {
    const text = String(line || '').trim();
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      this.lastError = new Error('Malformed worker JSON');
      this.emit('protocolError', { line: text.slice(0, 200) });
      // Quarantine worker on protocol failure
      try { this.child?.kill('SIGTERM'); } catch { /* ignore */ }
      return;
    }
    if (msg.mutatedWorkspace) this.mutatedWorkspace = true;
    const event = normalizeProviderEvent(msg, {
      provider: this.provider,
      taskId: this.taskId,
      executionId: this.executionId,
    });
    this.emit('event', event, msg);

    if (msg.requestId && this.pending.has(msg.requestId)) {
      const entry = this.pending.get(msg.requestId);
      this.pending.delete(msg.requestId);
      if (msg.error) entry.reject(new Error(msg.error));
      else entry.resolve(msg);
    }
  }
}
