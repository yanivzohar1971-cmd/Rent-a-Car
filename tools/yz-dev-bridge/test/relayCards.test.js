import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  ANSI,
  formatAgentAutoClosedCard,
  formatAgentHandoffCard,
  formatAgentLauncherCard,
  formatAgentRecoveryCard,
  formatCompletedTaskCard,
  formatFailedTaskCard,
  formatCancelledResultCard,
  formatIncomingTaskCard,
  formatLauncherMethodLabel,
  formatRelayConfigCard,
  formatRelayErrorCard,
  formatRelayRecoveredCard,
  formatRelayStatusCard,
  formatTaskStatusCard,
  isRelayRawLogsEnabled,
  printRelayConfigCard,
  resolveGithubIssueCardState,
  stripAnsi,
  truncateDisplay,
} from '../src/github/relayCards.js';
import { classifyStoreError } from '../src/store.js';
import { GithubInboxWorker } from '../src/github/githubInboxWorker.js';

const ANSI_RE = /\x1b\[[0-9;]*m/;

const SAMPLE_CONFIG = {
  repo: 'yanivzohar1971-cmd/Rent-a-Car',
  project: 'Rent_a_Car',
  allowedAuthor: 'yanivzohar1971-cmd',
  titlePrefix: '[YZ-BRIDGE]',
  intervalMs: 15_000,
  autoLaunch: true,
  autoCloseCompleted: true,
  keepWindowOpen: false,
  workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
  token: 'ghp_should_never_appear_in_output_SECRET',
  tokenConfigured: true,
};

test('configuration card includes structured fields without secrets', () => {
  const card = formatRelayConfigCard(SAMPLE_CONFIG, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /RELAY CONFIGURATION/);
  assert.match(plain, /Repository\s+yanivzohar1971-cmd\/Rent-a-Car/);
  assert.match(plain, /Project\s+Rent_a_Car/);
  assert.match(plain, /Allowed Author\s+yanivzohar1971-cmd/);
  assert.match(plain, /Task Prefix\s+\[YZ-BRIDGE\]/);
  assert.match(plain, /Poll Interval\s+15 seconds/);
  assert.match(plain, /Auto Launch\s+ENABLED/);
  assert.match(plain, /Auto Close\s+ENABLED/);
  assert.match(plain, /Keep Window Open\s+NO/);
  assert.match(plain, /Workspace\s+C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car/);
  assert.match(plain, /SECURITY/);
  assert.match(plain, /never shell/i);
  assert.doesNotMatch(plain, /ghp_/);
  assert.doesNotMatch(plain, /SECRET/);
  assert.doesNotMatch(plain, /token":/);
  assert.match(card, ANSI_RE);
  assert.ok(card.includes(ANSI.reset));
});

test('incoming task card uses safe metadata only', () => {
  const card = formatIncomingTaskCard({
    taskId: 'TASK-00032',
    issueNumber: 28,
    project: 'Rent_a_Car',
    title: '[YZ-BRIDGE] Render relay configuration and task lifecycle as ANSI/BBS cards',
    autoLaunch: true,
    body: 'DO_NOT_PRINT_THIS_SECRET_BODY',
  }, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /INCOMING TASK/);
  assert.match(plain, /TASK-00032/);
  assert.match(plain, /GitHub Issue\s+#28/);
  assert.match(plain, /LAUNCHING/);
  assert.doesNotMatch(plain, /DO_NOT_PRINT_THIS_SECRET_BODY/);
  assert.ok(card.includes(ANSI.reset));
  assert.ok(card.includes(ANSI.yellow) || card.includes(ANSI.brightCyan));
});

test('completed card shows success semantics', () => {
  const card = formatCompletedTaskCard({
    taskId: 'TASK-00032',
    issueClosed: true,
  }, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /COMPLETED/);
  assert.match(plain, /SUCCESS/);
  assert.match(plain, /RESULT POSTED/);
  assert.match(plain, /CLOSED/);
  assert.ok(card.includes(ANSI.brightGreen));
  assert.ok(card.includes(ANSI.reset));
});

test('issue state cards are truthful for CLOSED OPEN and UNKNOWN', () => {
  assert.match(stripAnsi(formatCompletedTaskCard({
    taskId: 'TASK-1',
    issueState: 'closed',
  }, { useColor: false })), /Issue\s+CLOSED/);
  assert.match(stripAnsi(formatCompletedTaskCard({
    taskId: 'TASK-1',
    issueState: 'open',
  }, { useColor: false })), /Issue\s+OPEN/);
  assert.match(stripAnsi(formatFailedTaskCard({
    taskId: 'TASK-1',
    issueState: 'unknown',
    resultPosted: true,
  }, { useColor: false })), /Issue\s+UNKNOWN/);
  assert.match(stripAnsi(formatCancelledResultCard({
    taskId: 'TASK-00039',
    issueState: 'closed',
    resultPosted: true,
  }, { useColor: false })), /Issue\s+CLOSED/);
  assert.doesNotMatch(stripAnsi(formatCancelledResultCard({
    taskId: 'TASK-00039',
    issueState: 'closed',
    resultPosted: true,
  }, { useColor: false })), /\bOPEN\b/);
});

test('resolveGithubIssueCardState never invents OPEN from CANCELLED status', () => {
  const cancelled = {
    status: 'CANCELLED',
    metadata: {
      githubIssueNumber: '9',
      githubSourceIssueState: 'closed',
    },
  };
  assert.equal(resolveGithubIssueCardState(cancelled, {
    openIssuesKnown: true,
    openIssueNumbers: new Set(),
  }), 'closed');
  assert.equal(resolveGithubIssueCardState({
    status: 'CANCELLED',
    metadata: { githubIssueNumber: '9' },
  }, {
    openIssuesKnown: true,
    openIssueNumbers: new Set(),
  }), 'closed');
  assert.equal(resolveGithubIssueCardState({
    status: 'FAILED',
    metadata: { githubIssueNumber: '9' },
  }, {
    openIssuesKnown: true,
    openIssueNumbers: new Set(['9']),
  }), 'open');
  assert.equal(resolveGithubIssueCardState({
    status: 'FAILED',
    metadata: { githubIssueNumber: '9' },
  }, {
    openIssuesKnown: false,
  }), 'unknown');
  // Stale local "open" metadata cannot override authoritative closed poll.
  assert.equal(resolveGithubIssueCardState({
    status: 'CANCELLED',
    metadata: {
      githubIssueNumber: '9',
      githubSourceIssueState: 'open',
    },
  }, {
    openIssuesKnown: true,
    openIssueNumbers: new Set(),
  }), 'closed');
  // Stale local "open" without a current poll must not invent OPEN.
  assert.equal(resolveGithubIssueCardState({
    status: 'CANCELLED',
    metadata: {
      githubIssueNumber: '9',
      githubSourceIssueState: 'open',
    },
  }, {
    openIssuesKnown: false,
  }), 'unknown');
});

test('issueClosed:false alone must not invent OPEN on cancelled/failed cards', () => {
  assert.match(stripAnsi(formatCancelledResultCard({
    taskId: 'TASK-00039',
    issueClosed: false,
    resultPosted: true,
  }, { useColor: false })), /Issue\s+UNKNOWN/);
  assert.doesNotMatch(stripAnsi(formatCancelledResultCard({
    taskId: 'TASK-00039',
    issueClosed: false,
    resultPosted: true,
  }, { useColor: false })), /\bOPEN\b/);
  assert.match(stripAnsi(formatFailedTaskCard({
    taskId: 'TASK-1',
    issueClosed: false,
    resultPosted: true,
  }, { useColor: false })), /Issue\s+UNKNOWN/);
});

test('NO_COLOR cancelled result card remains plain and truthful', () => {
  const card = formatCancelledResultCard({
    taskId: 'TASK-00039',
    issueState: 'closed',
    resultPosted: true,
  }, { useColor: false });
  assert.equal(card.includes('\u001b['), false);
  assert.match(card, /CANCELLED/);
  assert.match(card, /CLOSED/);
});

test('failed card is red-accented with short reason', () => {
  const card = formatFailedTaskCard({
    taskId: 'TASK-00032',
    reason: 'verification failed: tests red',
    resultPosted: true,
  }, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /FAILED/);
  assert.match(plain, /verification failed/);
  assert.ok(card.includes(ANSI.red));
  assert.ok(card.includes(ANSI.reset));
});

test('long path and title are truncated so borders stay aligned', () => {
  const longPath = `C:\\Users\\Yaniv\\source\\repos\\${'Rent_a_Car_'.repeat(20)}workspace`;
  const longTitle = `[YZ-BRIDGE] ${'very-long-title-segment-'.repeat(12)}end`;
  const configCard = formatRelayConfigCard({
    ...SAMPLE_CONFIG,
    workspacePath: longPath,
  }, { useColor: false, innerWidth: 50 });
  const taskCard = formatIncomingTaskCard({
    taskId: 'TASK-00099',
    issueNumber: 99,
    title: longTitle,
  }, { useColor: false, innerWidth: 50 });

  for (const card of [configCard, taskCard]) {
    const lines = card.split('\n').filter(Boolean);
    const widths = lines.map((line) => stripAnsi(line).length);
    const expected = widths[0];
    for (const width of widths) {
      assert.equal(width, expected, `border width mismatch: ${widths.join(',')}`);
    }
    assert.match(card, /\.\.\./);
  }
  assert.equal(truncateDisplay('abcdef', 4), 'a...');
});

test('NO_COLOR / non-ANSI cards have no escape sequences', () => {
  const card = formatRelayConfigCard(SAMPLE_CONFIG, { useColor: false });
  assert.equal(ANSI_RE.test(card), false);
  assert.match(card, /RELAY CONFIGURATION/);
});

test('printRelayConfigCard honors useColor override on non-TTY', () => {
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  stream.isTTY = false;

  printRelayConfigCard(SAMPLE_CONFIG, {
    stream,
    env: { NO_COLOR: '1' },
    useColor: false,
  });
  assert.ok(written.length > 0);
  assert.equal(ANSI_RE.test(written), false);

  written = '';
  printRelayConfigCard(SAMPLE_CONFIG, {
    stream,
    useColor: true,
  });
  assert.match(written, ANSI_RE);
  assert.ok(written.includes(ANSI.reset));
});

test('isRelayRawLogsEnabled is opt-in only', () => {
  assert.equal(isRelayRawLogsEnabled({}), false);
  assert.equal(isRelayRawLogsEnabled({ YZ_BRIDGE_RELAY_RAW_LOGS: '1' }), true);
  assert.equal(isRelayRawLogsEnabled({ YZ_BRIDGE_RELAY_DEBUG: 'true' }), true);
  assert.equal(isRelayRawLogsEnabled({ YZ_BRIDGE_RELAY_RAW_LOGS: '0' }), false);
});

test('agent launcher selected card uses safe launching fields only', () => {
  const card = formatAgentLauncherCard({
    phase: 'selected',
    taskId: 'TASK-00034',
    method: 'wt',
    hostLaunchMode: 'non-persistent',
    argumentListString: 'DO_NOT_PRINT_ARGS',
    sessionNonce: 'secret-nonce',
    sessionFilePath: 'C:\\secret\\session.json',
  }, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /AGENT LAUNCHER/);
  assert.match(plain, /Task\s+TASK-00034/);
  assert.match(plain, /Launcher\s+Windows Terminal/);
  assert.match(plain, /Host\s+NON-PERSISTENT/);
  assert.match(plain, /Status\s+LAUNCHING/);
  assert.doesNotMatch(plain, /DO_NOT_PRINT_ARGS/);
  assert.doesNotMatch(plain, /secret-nonce/);
  assert.doesNotMatch(plain, /session\.json/);
  assert.doesNotMatch(plain, /SUCCESS/);
  assert.ok(card.includes(ANSI.yellow) || card.includes(ANSI.brightCyan));
  assert.ok(card.includes(ANSI.reset));
});

test('agent launcher handoff card shows proven SUCCESS and PID', () => {
  const card = formatAgentLauncherCard({
    phase: 'handoff',
    taskId: 'TASK-00034',
    method: 'powershell-fallback',
    hostLaunchMode: 'persistent',
    pid: 12345,
  }, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /Launcher\s+PowerShell/);
  assert.match(plain, /Host\s+PERSISTENT/);
  assert.match(plain, /Handoff\s+SUCCESS/);
  assert.match(plain, /PID\s+12345/);
  assert.ok(card.includes(ANSI.brightGreen));
  assert.ok(card.includes(ANSI.reset));
});

test('agent launcher failed card is red with reason', () => {
  const card = formatAgentLauncherCard({
    phase: 'failed',
    taskId: 'TASK-00034',
    method: 'wt',
    hostLaunchMode: 'non-persistent',
    pid: 99,
    reason: 'exited immediately',
  }, { useColor: true });
  const plain = stripAnsi(card);

  assert.match(plain, /Handoff\s+FAILED/);
  assert.match(plain, /exited immediately/);
  assert.ok(card.includes(ANSI.red));
  assert.ok(card.includes(ANSI.reset));
});

test('formatLauncherMethodLabel maps known methods', () => {
  assert.equal(formatLauncherMethodLabel('wt'), 'Windows Terminal');
  assert.equal(formatLauncherMethodLabel('powershell-fallback'), 'PowerShell');
  assert.equal(formatLauncherMethodLabel('cmd-start'), 'CMD Start');
});

test('tokenConfigured may appear only as state, never raw token', () => {
  const card = formatRelayConfigCard({
    ...SAMPLE_CONFIG,
    token: 'super-secret-token-value',
  }, { useColor: false });
  assert.match(card, /Token\s+CONFIGURED/);
  assert.doesNotMatch(card, /super-secret-token-value/);
});

test('RELAY STATUS card shows ONLINE without Polling duplicate', () => {
  const card = formatRelayStatusCard({ status: 'ONLINE' }, { useColor: true });
  const plain = stripAnsi(card);
  assert.match(plain, /RELAY STATUS/);
  assert.match(plain, /Status\s+ONLINE/);
  assert.doesNotMatch(plain, /Polling:/);
  assert.doesNotMatch(plain, /GitHub Relay:\s*ONLINE/);
  assert.ok(card.includes(ANSI.brightGreen));
  assert.ok(card.includes(ANSI.reset));
});

test('TASK STATUS card replaces loose ACK/INGESTED/LAUNCH lines', () => {
  for (const event of ['ACK POSTED', 'INGESTED', 'LAUNCH RESERVED', 'AUTO-CLOSE SCHEDULED']) {
    const card = formatTaskStatusCard({
      taskId: 'TASK-00036',
      event,
    }, { useColor: false });
    assert.match(card, /TASK STATUS/);
    assert.match(card, /TASK-00036/);
    assert.match(card, new RegExp(`Status\\s+${event}`));
    assert.doesNotMatch(card, /^TASK-00036:\s/m);
    assert.doesNotMatch(card, new RegExp(`TASK-00036:\\s*${event}`));
  }
});

test('AGENT HANDOFF card is compact success follow-up without repeating launcher rows', () => {
  const card = formatAgentHandoffCard({ phase: 'success', pid: 4242 }, { useColor: true });
  const plain = stripAnsi(card);
  assert.match(plain, /AGENT HANDOFF/);
  assert.match(plain, /Handoff\s+SUCCESS/);
  assert.match(plain, /PID\s+4242/);
  assert.doesNotMatch(plain, /Launcher/);
  assert.doesNotMatch(plain, /Host/);
  assert.doesNotMatch(plain, /Task\s+/);
  assert.ok(card.includes(ANSI.brightGreen));
  assert.ok(card.includes(ANSI.reset));
});

test('AGENT AUTO-CLOSED card is distinct green state', () => {
  const card = formatAgentAutoClosedCard({ taskId: 'TASK-00036' }, { useColor: true });
  const plain = stripAnsi(card);
  assert.match(plain, /AGENT AUTO-CLOSED/);
  assert.match(plain, /TASK-00036/);
  assert.match(plain, /AUTO-CLOSED/);
  assert.ok(card.includes(ANSI.brightGreen));
  assert.ok(card.includes(ANSI.reset));
});

test('NO_COLOR relay/task status cards are escape-free', () => {
  const cards = [
    formatRelayStatusCard({ status: 'ONLINE' }, { useColor: false }),
    formatTaskStatusCard({ taskId: 'TASK-1', event: 'ACK POSTED' }, { useColor: false }),
    formatAgentHandoffCard({ phase: 'success', pid: 1 }, { useColor: false }),
    formatAgentAutoClosedCard({ taskId: 'TASK-1' }, { useColor: false }),
    formatRelayErrorCard({
      component: 'Bridge Store',
      operation: 'STORE COMMIT',
      code: 'EPERM',
      status: 'FAILED',
    }, { useColor: false }),
  ];
  for (const card of cards) {
    assert.equal(ANSI_RE.test(card), false);
  }
});

test('RELAY ERROR card is red and omits temp paths/UUIDs', () => {
  const card = formatRelayErrorCard({
    component: 'Bridge Store',
    operation: 'STORE COMMIT',
    code: 'EPERM',
    status: 'FAILED',
    safeReason: "EPERM: operation not permitted, rename '<path>' -> '<path>'",
  }, { useColor: true });
  const plain = stripAnsi(card);
  assert.match(plain, /RELAY ERROR/);
  assert.match(plain, /Component\s+Bridge Store/);
  assert.match(plain, /Operation\s+STORE COMMIT/);
  assert.match(plain, /Code\s+EPERM/);
  assert.match(plain, /Status\s+FAILED/);
  assert.match(plain, /Reason\s+EPERM/);
  assert.doesNotMatch(plain, /\.tmp/);
  assert.doesNotMatch(plain, /[0-9a-f]{8}-[0-9a-f]{4}/i);
  assert.doesNotMatch(plain, /bridge\.json\.\d+\./);
  assert.doesNotMatch(plain, /Rent_a_Car/);
  assert.ok(card.includes(ANSI.red));
});

test('worker reportTickError uses BBS card and suppresses raw orphan line unless RAW/DEBUG', () => {
  const logs = [];
  const worker = new GithubInboxWorker({
    client: { async listOpenIssues() { return []; } },
    store: { filePath: 'C:\\temp\\bridge.json' },
    config: { repo: 'yanivzohar1971-cmd/Rent-a-Car', env: {} },
    logger: { error(message) { logs.push(String(message)); }, info() {} },
    presentCards: true,
  });
  const error = new Error(
    "EPERM: operation not permitted, rename 'C:\\temp\\bridge.json.12.abcdef01-2345-6789-abcd-ef0123456789.tmp' -> 'C:\\temp\\bridge.json'",
  );
  error.code = 'EPERM';
  worker.reportTickError(error);
  assert.equal(logs.some((line) => line.includes('YZ GitHub relay tick failed:')), false);
  assert.equal(logs.some((line) => /RELAY ERROR/.test(line)), true);
  assert.equal(logs.some((line) => /\.tmp/.test(line)), false);
  assert.equal(logs.some((line) => /abcdef01-2345/.test(line)), false);
  assert.equal(logs.some((line) => /Reason/.test(line)), true);
  assert.equal(logs.some((line) => /Rent_a_Car|C:\\temp\\bridge\.json\.\d+/.test(line)), false);

  const rawLogs = [];
  const rawWorker = new GithubInboxWorker({
    client: { async listOpenIssues() { return []; } },
    store: { filePath: 'C:\\temp\\bridge.json' },
    config: { repo: 'yanivzohar1971-cmd/Rent-a-Car', env: { YZ_BRIDGE_RELAY_RAW_LOGS: '1' } },
    logger: { error(message) { rawLogs.push(String(message)); }, info() {} },
    presentCards: true,
  });
  rawWorker.reportTickError(error);
  assert.equal(rawLogs.some((line) => line.includes('YZ GitHub relay tick failed:')), true);
  assert.equal(classifyStoreError(error).code, 'EPERM');
});

test('RELAY RECOVERED card is available for proven rename recovery', () => {
  const card = formatRelayRecoveredCard({
    component: 'Bridge Store',
    operation: 'STORE COMMIT',
    attempts: 3,
  }, { useColor: false });
  assert.match(card, /RELAY RECOVERED/);
  assert.match(card, /RECOVERED/);
  assert.match(card, /Attempts\s+3/);
  assert.equal(ANSI_RE.test(card), false);
});
