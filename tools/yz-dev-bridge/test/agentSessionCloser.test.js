import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExactAgentSession,
  buildCloseRequestPath,
  buildSessionOutcomePath,
  closeAgentSessionGracefully,
  closeAgentSessionProcessTree,
  evaluateAutoCloseResult,
  writeCloseRequestFile,
} from '../src/agent/agentSessionCloser.js';

const SESSION = {
  taskId: 'TASK-00026',
  nonce: 'nonce-exact',
  pid: 424242,
  startedAt: '2026-08-20T07:00:00.000Z',
  file: null,
};

test('exact task identity is required before closing anything', () => {
  assert.throws(
    () => assertExactAgentSession('TASK-00026', { pid: 1 }),
    /exact registered agent session identity/,
  );
  assert.throws(
    () => assertExactAgentSession('TASK-00026', { pid: 1, startedAt: 'x' }),
    /exact registered agent session identity/,
  );
});

test('intentional COMPLETED shutdown is reported as graceful process close without claiming window close', () => {
  const evaluated = evaluateAutoCloseResult({
    processClosed: true,
    intentionalClose: true,
    exitCode: 0,
    windowClosed: false,
    terminalCloseVisibility: 'unsupported',
    graceful: true,
  });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.processCloseVerified, true);
  assert.equal(evaluated.fullAutoCloseSuccess, false);
  assert.equal(evaluated.windowClosed, false);
  assert.equal(evaluated.terminalCloseVisibility, 'unsupported');
});

test('nonzero/crash forced exit is not reported as successful window or process-verified close', () => {
  const evaluated = evaluateAutoCloseResult({
    processClosed: true,
    intentionalClose: false,
    exitCode: 1,
    forced: true,
    windowClosed: false,
    terminalCloseVisibility: 'unsupported',
  });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.processCloseVerified, false);
  assert.equal(evaluated.fullAutoCloseSuccess, false);
  assert.equal(evaluated.forced, true);
});

test('closeAgentSessionProcessTree never claims windowClosed after forced taskkill', () => {
  const result = closeAgentSessionProcessTree({
    taskId: 'TASK-00026',
    session: {
      ...SESSION,
      file: 'C:\\temp\\session.json',
    },
    spawnSyncImpl: () => ({
      status: 0,
      stdout: '{"ok":true,"alreadyExited":false,"processClosed":true,"exitCode":1,"intentionalClose":false,"forced":true}\n',
      stderr: '',
    }),
  });
  assert.equal(result.processClosed, true);
  assert.equal(result.forced, true);
  assert.equal(result.ok, false);
  assert.equal(result.windowClosed, false);
  assert.equal(result.terminalCloseVisibility, 'unsupported');
});

test('graceful closer writes nonce-scoped close request and accepts wrapper exit 0 outcome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-close-'));
  try {
    const sessionFile = join(dir, 'TASK-00026-nonce.json');
    await writeFile(sessionFile, JSON.stringify({ taskId: 'TASK-00026' }), 'utf8');
    const outcomePath = buildSessionOutcomePath(sessionFile);
    let alive = true;
    const result = await closeAgentSessionGracefully({
      taskId: 'TASK-00026',
      session: {
        ...SESSION,
        file: sessionFile,
      },
      waitMs: 500,
      pollMs: 20,
      allowForcedFallback: false,
      aliveImpl: () => alive,
      sleepImpl: async () => {
        await writeFile(outcomePath, JSON.stringify({
          taskId: 'TASK-00026',
          nonce: 'nonce-exact',
          exitCode: 0,
          intentionalClose: true,
          reason: 'intentional-completed-auto-close',
        }), 'utf8');
        alive = false;
      },
    });
    const closeReq = JSON.parse(await readFile(buildCloseRequestPath(sessionFile), 'utf8'));
    assert.equal(closeReq.taskId, 'TASK-00026');
    assert.equal(closeReq.nonce, 'nonce-exact');
    assert.equal(result.ok, true);
    assert.equal(result.processClosed, true);
    assert.equal(result.intentionalClose, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.windowClosed, false);
    assert.equal(result.method, 'close-request');
    assert.equal(result.fullAutoCloseSuccess, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('graceful closer times out without broad process kill when wrapper ignores close request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-close-timeout-'));
  try {
    const sessionFile = join(dir, 'TASK-00026-nonce.json');
    await writeFile(sessionFile, '{}', 'utf8');
    const result = await closeAgentSessionGracefully({
      taskId: 'TASK-00026',
      session: {
        ...SESSION,
        file: sessionFile,
      },
      waitMs: 40,
      pollMs: 10,
      allowForcedFallback: false,
      aliveImpl: () => true,
      sleepImpl: async () => undefined,
      spawnSyncImpl: () => {
        throw new Error('spawn should not run when forced fallback is disabled');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.processClosed, false);
    assert.equal(result.method, 'close-request-timeout');
    assert.equal(result.windowClosed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeCloseRequestFile is task and nonce scoped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-close-req-'));
  try {
    const sessionFile = join(dir, 'session.json');
    const written = await writeCloseRequestFile({
      sessionFilePath: sessionFile,
      taskId: 'TASK-00026',
      nonce: 'abc',
    });
    const parsed = JSON.parse(await readFile(written.path, 'utf8'));
    assert.equal(parsed.taskId, 'TASK-00026');
    assert.equal(parsed.nonce, 'abc');
    assert.equal(parsed.reason, 'completed-auto-close');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
