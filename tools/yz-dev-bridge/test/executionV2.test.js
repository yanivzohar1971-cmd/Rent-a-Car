import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PROVIDER_IDS,
  PROVIDER_EVENTS,
  normalizeProviderEvent,
  resolveProjectExecutionConfig,
} from '../src/execution/types.js';
import { ExecutionRouter, canAutoFallback } from '../src/execution/router.js';
import { createLegacyExecutionProvider } from '../src/execution/providers/legacyProvider.js';
import { ProjectLeaseManager } from '../src/execution/leases.js';
import { ProviderWorkerManager } from '../src/execution/workerManager.js';
import { createOperatorGate, applyGateDecision, buildCheckpointV1 } from '../src/execution/gates.js';
import { classifyVerification, runVerificationPipeline, VERIFICATION_STATES } from '../src/execution/verification.js';
import { ProviderCircuitBreaker, CIRCUIT } from '../src/execution/circuitBreaker.js';
import { createCursorSdkProvider } from '../src/execution/providers/cursorSdkProvider.js';
import { createCursorAcpProvider } from '../src/execution/providers/cursorAcpProvider.js';

test('unknown provider events normalize without throwing', () => {
  const event = normalizeProviderEvent({ type: 'weird-native-thing', message: 'x' }, {
    provider: PROVIDER_IDS.LEGACY,
    taskId: 'TASK-1',
    executionId: 'EXEC-1',
  });
  assert.equal(event.type, PROVIDER_EVENTS.UNKNOWN);
  assert.equal(event.taskId, 'TASK-1');
});

test('project execution config defaults to legacy', () => {
  const cfg = resolveProjectExecutionConfig({});
  assert.equal(cfg.mode, PROVIDER_IDS.LEGACY);
  assert.equal(cfg.maxConcurrentTasks, 1);
});

test('router never selects SDK when allowSdk is false', async () => {
  const router = new ExecutionRouter({
    providers: {
      legacy: createLegacyExecutionProvider({}),
      'cursor-sdk': createCursorSdkProvider({ enabled: false }),
    },
    featureFlags: { allowSdk: false, allowAuto: true, v2RouterEnabled: true },
  });
  assert.equal(
    router.selectProviderId({ execution: { mode: 'cursor-sdk', allowedProviders: ['legacy', 'cursor-sdk'] } }),
    PROVIDER_IDS.LEGACY,
  );
  assert.equal(
    router.selectProviderId({ execution: { mode: 'auto', allowedProviders: ['legacy', 'cursor-sdk'] } }),
    PROVIDER_IDS.LEGACY,
  );
});

test('legacy provider dry-run start works without launcher', async () => {
  const provider = createLegacyExecutionProvider({});
  const started = await provider.start(
    { id: 'TASK-1', instructions: 'x' },
    { workspaceRoot: 'C:\\tmp\\fixture' },
    { dryRun: true, executionId: 'EXEC-1' },
  );
  assert.equal(started.dryRun, true);
  assert.equal(started.mutatedWorkspace, false);
});

test('canAutoFallback forbids post-mutation fallback', () => {
  assert.equal(canAutoFallback({ mutatedWorkspace: false }), true);
  assert.equal(canAutoFallback({ mutatedWorkspace: true }), false);
});

test('project leases serialize same project and allow different projects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-lease-'));
  const file = join(dir, 'leases.json');
  const alive = new Set([111, 222]);
  const mgr = new ProjectLeaseManager({
    filePath: file,
    staleMs: 60_000,
    pidAliveImpl: (pid) => alive.has(pid),
  });
  const a = mgr.acquire({
    projectId: 'rent-a-car',
    taskId: 'TASK-A',
    executionId: 'EXEC-A',
    provider: 'legacy',
    ownerPid: 111,
  });
  assert.equal(a.acquired, true);
  const b = mgr.acquire({
    projectId: 'rent-a-car',
    taskId: 'TASK-B',
    executionId: 'EXEC-B',
    provider: 'legacy',
    ownerPid: 222,
  });
  assert.equal(b.acquired, false);
  assert.equal(b.reason, 'PROJECT_LEASE_HELD');
  const c = mgr.acquire({
    projectId: 'glasses',
    taskId: 'TASK-C',
    executionId: 'EXEC-C',
    provider: 'legacy',
    ownerPid: 222,
  });
  assert.equal(c.acquired, true);
  mgr.release('rent-a-car', { taskId: 'TASK-A', executionId: 'EXEC-A' });
  const d = mgr.acquire({
    projectId: 'rent-a-car',
    taskId: 'TASK-B',
    executionId: 'EXEC-B',
    provider: 'legacy',
    ownerPid: 222,
  });
  assert.equal(d.acquired, true);
  await rm(dir, { recursive: true, force: true });
});

test('stale lease reconciles when owner pid is dead', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-lease-stale-'));
  const file = join(dir, 'leases.json');
  const mgr = new ProjectLeaseManager({
    filePath: file,
    staleMs: 60_000,
    pidAliveImpl: () => false,
  });
  const now = Date.now();
  mgr.acquire({
    projectId: 'rent-a-car',
    taskId: 'TASK-A',
    executionId: 'EXEC-A',
    provider: 'legacy',
    ownerPid: 999001,
    now: now - 10_000,
  });
  const next = mgr.acquire({
    projectId: 'rent-a-car',
    taskId: 'TASK-B',
    executionId: 'EXEC-B',
    provider: 'legacy',
    ownerPid: 111,
    now,
  });
  assert.equal(next.acquired, true);
  await rm(dir, { recursive: true, force: true });
});

test('mock provider worker start/progress/complete and crash isolation', async () => {
  const mgr = new ProviderWorkerManager({});
  const exits = [];
  mgr.on('exit', (e) => exits.push(e));
  mgr.start({ provider: 'mock', taskId: 'TASK-1', executionId: 'EXEC-1' });
  await mgr.request({ type: 'START' });
  await mgr.request({ type: 'PROGRESS', message: 'hello' });
  await mgr.request({ type: 'COMPLETE' });
  await mgr.dispose();
  assert.ok(exits.length >= 1 || !mgr.alive);

  const crashMgr = new ProviderWorkerManager({});
  const crashed = new Promise((resolve) => crashMgr.on('exit', resolve));
  crashMgr.start({ provider: 'mock', taskId: 'TASK-2', executionId: 'EXEC-2' });
  await crashMgr.request({ type: 'START' });
  crashMgr.request({ type: 'CRASH' }).catch(() => null);
  const crash = await crashed;
  assert.equal(crash.type, PROVIDER_EVENTS.WORKER_CRASH);
  assert.equal(crash.mutatedWorkspace, false);
});

test('worker crash after mutation is classified', async () => {
  const mgr = new ProviderWorkerManager({});
  const crashed = new Promise((resolve) => mgr.on('exit', resolve));
  mgr.start({ provider: 'mock', taskId: 'TASK-3', executionId: 'EXEC-3' });
  await mgr.request({ type: 'START' });
  await mgr.request({ type: 'MUTATE' });
  assert.equal(mgr.mutatedWorkspace, true);
  mgr.request({ type: 'CRASH' }).catch(() => null);
  const crash = await crashed;
  assert.equal(crash.mutatedWorkspace, true);
});

test('malformed worker JSON quarantines worker without throwing to caller', async () => {
  const mgr = new ProviderWorkerManager({});
  const protocolErrors = [];
  mgr.on('protocolError', (e) => protocolErrors.push(e));
  const exited = new Promise((resolve) => mgr.on('exit', resolve));
  mgr.start({ provider: 'mock', taskId: 'TASK-4', executionId: 'EXEC-4' });
  await mgr.request({ type: 'START' });
  // Fire-and-forget: malformed stdout is not a request/response pair.
  mgr.child.stdin.write(`${JSON.stringify({
    protocolVersion: 1,
    type: 'MALFORMED_NEXT',
    taskId: 'TASK-4',
    executionId: 'EXEC-4',
  })}\n`);
  await exited;
  assert.ok(protocolErrors.length >= 1);
});

test('operator gate CONTINUE is idempotent; stale gate rejected', () => {
  const gate = createOperatorGate({
    taskId: 'TASK-1',
    executionId: 'EXEC-1',
    summary: 'checkpoint',
  });
  const first = applyGateDecision(gate, { gateId: gate.gateId, decision: 'CONTINUE', by: 'chatgpt' });
  assert.equal(first.ok, true);
  const second = applyGateDecision(first.gate, { gateId: gate.gateId, decision: 'CONTINUE', by: 'chatgpt' });
  assert.equal(second.ok, true);
  assert.equal(second.idempotent, true);
  const stale = applyGateDecision(first.gate, { gateId: 'GATE-OLD', decision: 'CONTINUE' });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'STALE_OR_MISMATCHED_GATE');
  const checkpoint = buildCheckpointV1({
    taskId: 'TASK-1',
    executionId: 'EXEC-1',
    projectId: 'rent-a-car',
    phase: 'test',
    gate,
  });
  assert.equal(checkpoint.schema, 'yz-bridge-checkpoint-v1');
});

test('verification treats flaky core checks as FLAKY not PASS', () => {
  const classified = classifyVerification([
    { id: 'unit', state: VERIFICATION_STATES.PASS },
    { id: 'dashboard', state: VERIFICATION_STATES.FLAKY },
  ]);
  assert.equal(classified.state, VERIFICATION_STATES.FLAKY);
});

test('verification pipeline aggregates runner results', async () => {
  const result = await runVerificationPipeline([
    { id: 'syntax', command: 'npm run syntax', async run() { return { state: VERIFICATION_STATES.PASS }; } },
    { id: 'unit', command: 'npm test', async run() { return { state: VERIFICATION_STATES.PASS }; } },
  ]);
  assert.equal(result.state, VERIFICATION_STATES.PASS);
  assert.equal(result.checks.length, 2);
});

test('circuit breaker opens after repeated failures', () => {
  const breaker = new ProviderCircuitBreaker({ failureThreshold: 2, openMs: 10_000, providerId: 'cursor-sdk' });
  assert.equal(breaker.canStart(), true);
  breaker.recordFailure('auth');
  assert.equal(breaker.state, CIRCUIT.DEGRADED);
  breaker.recordFailure('auth');
  assert.equal(breaker.state, CIRCUIT.OPEN);
  assert.equal(breaker.canStart({ now: Date.now() }), false);
});

test('SDK and ACP providers are disabled by default flags', async () => {
  const sdk = createCursorSdkProvider({ enabled: false });
  const acp = createCursorAcpProvider({
    enabled: false,
    detectCommand: async () => ({ detected: false, reason: 'ACP_CLI_NOT_FOUND' }),
  });
  const sdkProbe = await sdk.probe();
  const acpProbe = await acp.probe();
  assert.equal(sdkProbe.available, false);
  assert.equal(acpProbe.available, false);
  await assert.rejects(() => sdk.start({ id: 'T' }, {}), /disabled/);
  await assert.rejects(() => acp.start({ id: 'T' }, {}), /disabled/);
});
