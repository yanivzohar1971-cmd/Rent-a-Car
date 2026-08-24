#!/usr/bin/env node
/**
 * Mock provider worker — newline-delimited JSON over stdio.
 * Used for Phase 3 isolation tests. Never launches real Agents.
 */
import { createInterface } from 'node:readline';

const state = {
  started: false,
  mutatedWorkspace: false,
  taskId: null,
  executionId: null,
};

function send(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function handle(msg) {
  const type = String(msg.type || '').toUpperCase();
  const base = {
    protocolVersion: 1,
    requestId: msg.requestId || null,
    taskId: msg.taskId || state.taskId,
    executionId: msg.executionId || state.executionId,
    provider: msg.provider || 'mock',
    timestamp: new Date().toISOString(),
  };

  if (type === 'START') {
    state.started = true;
    state.taskId = msg.taskId;
    state.executionId = msg.executionId;
    send({ ...base, type: 'RUN_STARTED', ok: true });
    send({ ...base, type: 'HEARTBEAT', ok: true });
    return;
  }
  if (type === 'PROGRESS') {
    send({ ...base, type: 'AGENT_MESSAGE', message: msg.message || 'progress', ok: true });
    return;
  }
  if (type === 'MUTATE') {
    state.mutatedWorkspace = true;
    send({
      ...base,
      type: 'FILE_CHANGED',
      mutatedWorkspace: true,
      ok: true,
    });
    return;
  }
  if (type === 'FAIL') {
    send({ ...base, type: 'RUN_FAILED', error: msg.error || 'mock-fail', ok: false });
    return;
  }
  if (type === 'CRASH') {
    process.exit(2);
  }
  if (type === 'COMPLETE') {
    send({ ...base, type: 'RUN_COMPLETED', ok: true, mutatedWorkspace: state.mutatedWorkspace });
    return;
  }
  if (type === 'CANCEL') {
    send({ ...base, type: 'RUN_CANCELLED', ok: true });
    return;
  }
  if (type === 'DISPOSE') {
    send({ ...base, type: 'DISPOSE_ACK', ok: true });
    process.exit(0);
  }
  if (type === 'MALFORMED_NEXT') {
    process.stdout.write('not-json\n');
    return;
  }
  send({ ...base, type: 'PROVIDER_ERROR', error: `unknown command: ${type}`, ok: false });
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  try {
    handle(JSON.parse(line));
  } catch {
    send({
      protocolVersion: 1,
      type: 'PROVIDER_ERROR',
      error: 'invalid inbound JSON',
      ok: false,
    });
  }
});
