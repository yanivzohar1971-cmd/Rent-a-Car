import { E2eDebugStore, summarizeE2eDebug } from '../e2eDebug.js';

export function toStructuredResult(task) {
  const extra = task?.metadata?.structuredResult && typeof task.metadata.structuredResult === 'object'
    ? task.metadata.structuredResult
    : {};
  const asList = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (value == null || value === '') return [];
    return [String(value)];
  };
  const failed = Boolean(task?.metadata?.failed || task?.metadata?.verificationFailed);
  let status = task?.status || null;
  if (status === 'FAILED') {
    // already terminal failure
  } else if (status === 'BLOCKED' && failed) {
    status = 'FAILED';
  } else if (status === 'COMPLETED' && failed) {
    status = 'FAILED';
  }
  return {
    status,
    resultSummary: extra.resultSummary || task?.summary || null,
    rootCause: extra.rootCause || null,
    changedFiles: extra.changedFiles?.length ? asList(extra.changedFiles) : asList(task?.changedFiles),
    tests: extra.tests?.length ? asList(extra.tests) : asList(task?.tests),
    build: extra.build || extra.buildResult || null,
    behaviorChanged: asList(extra.behaviorChanged),
    behaviorPreserved: asList(extra.behaviorPreserved),
    warnings: asList(extra.warnings),
    remainingIssues: asList(extra.remainingIssues),
    nextRecommendedStep: extra.nextRecommendedStep || null,
  };
}

export async function formatDebugSummary(task, { debugStore = null, debug = null } = {}) {
  if (!task?.id) return null;
  const resolved = debug || (debugStore ? await debugStore.read(task.id) : await new E2eDebugStore().read(task.id));
  return resolved ? summarizeE2eDebug(resolved) : null;
}

function listBlock(title, items) {
  if (!items.length) return `- ${title}: none`;
  return [`- ${title}:`, ...items.map((item) => `  - ${item}`)].join('\n');
}

export function formatGithubAckComment(task) {
  return [
    `<!-- yz-bridge-ack:${task.id} -->`,
    `YZ Dev Bridge ingested this issue as local task **${task.id}**.`,
    '',
    'A visible local Cursor Agent window is launched when `YZ_BRIDGE_AGENT_AUTO_LAUNCH=true`.',
    'Issue text is treated as task instructions only and is never executed as a shell command.',
  ].join('\n');
}

export async function formatGithubResultComment(task, options = {}) {
  const result = toStructuredResult(task);
  const debugSummary = options.debugSummary || await formatDebugSummary(task, options);
  return [
    `<!-- yz-bridge-result:${task.id} -->`,
    `## YZ Dev Bridge result (${task.id})`,
    '',
    `- status: ${result.status || 'unknown'}`,
    `- resultSummary: ${result.resultSummary || 'n/a'}`,
    `- rootCause: ${result.rootCause || 'n/a'}`,
    listBlock('changedFiles', result.changedFiles),
    listBlock('tests', result.tests),
    `- build: ${result.build || 'n/a'}`,
    listBlock('behaviorChanged', result.behaviorChanged),
    listBlock('behaviorPreserved', result.behaviorPreserved),
    listBlock('warnings', result.warnings),
    listBlock('remainingIssues', result.remainingIssues),
    `- nextRecommendedStep: ${result.nextRecommendedStep || 'n/a'}`,
    '',
    '```json',
    JSON.stringify({ debugSummary }, null, 2),
    '```',
  ].join('\n');
}

export function isGithubTerminalTask(task) {
  if (!task) return false;
  if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') return true;
  return task.status === 'BLOCKED' && Boolean(task.metadata?.failed || task.metadata?.verificationFailed);
}

export function commentHasMarker(body, marker) {
  return String(body || '').includes(marker);
}

export function ackMarker(taskId) {
  return `<!-- yz-bridge-ack:${taskId} -->`;
}

export function resultMarker(taskId) {
  return `<!-- yz-bridge-result:${taskId} -->`;
}
