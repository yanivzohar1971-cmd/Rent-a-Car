import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toStructuredResult,
  formatGithubAckComment,
  formatGithubResultComment,
  ackMarker,
  resultMarker,
  commentHasMarker,
  isGithubTerminalTask,
} from '../src/result/structuredResult.js';

test('toStructuredResult remaps COMPLETED+failed metadata to FAILED', () => {
  const result = toStructuredResult({
    status: 'COMPLETED',
    summary: 'done',
    changedFiles: ['a.js'],
    tests: ['npm test'],
    metadata: { failed: true, structuredResult: { rootCause: 'boom' } },
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.rootCause, 'boom');
  assert.deepEqual(result.changedFiles, ['a.js']);
});

test('ack/result markers are stable and detectable', async () => {
  const task = { id: 'TASK-00001', status: 'COMPLETED', summary: 'ok', changedFiles: [], tests: [] };
  const ack = formatGithubAckComment(task);
  const result = await formatGithubResultComment(task, { debugSummary: null });
  assert.equal(commentHasMarker(ack, ackMarker('TASK-00001')), true);
  assert.equal(commentHasMarker(result, resultMarker('TASK-00001')), true);
  assert.equal(isGithubTerminalTask({ status: 'FAILED' }), true);
  assert.equal(isGithubTerminalTask({ status: 'IN_PROGRESS' }), false);
});
