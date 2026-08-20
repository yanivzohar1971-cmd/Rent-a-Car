import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  ANSI,
  CLEAR_SCREEN,
  clearInteractiveTerminal,
  formatStartupBanner,
  formatStatusTransition,
  printStartupBanner,
  resolveCursorAgentBannerStatus,
  resolveFirebaseBannerStatus,
  resolveGithubRelayBannerStatuses,
  resolveMcpBannerStatus,
  shouldClearTerminal,
  shouldUseAnsi,
  statusColor,
  stripAnsi,
} from '../src/github/startupBanner.js';

const ANSI_RE = /\x1b\[[0-9;]*m/;
const CLEAR_RE = /\x1b\[2J|\x1b\[H/;

test('shouldUseAnsi is false when NO_COLOR is set', () => {
  assert.equal(shouldUseAnsi({ isTTY: true }, { NO_COLOR: '1' }), false);
});

test('shouldUseAnsi is false for non-TTY without FORCE_COLOR', () => {
  assert.equal(shouldUseAnsi({ isTTY: false }, {}), false);
});

test('shouldUseAnsi is true for TTY when color not disabled', () => {
  assert.equal(shouldUseAnsi({ isTTY: true }, {}), true);
});

test('shouldUseAnsi respects FORCE_COLOR even without TTY', () => {
  assert.equal(shouldUseAnsi({ isTTY: false }, { FORCE_COLOR: '1' }), true);
  assert.equal(shouldUseAnsi({ isTTY: true }, { FORCE_COLOR: '0' }), false);
});

test('shouldClearTerminal is true only for interactive TTY', () => {
  assert.equal(shouldClearTerminal({ isTTY: true }), true);
  assert.equal(shouldClearTerminal({ isTTY: false }), false);
  assert.equal(shouldClearTerminal(null), false);
});

test('clearInteractiveTerminal writes ANSI clear on TTY and nothing on non-TTY', () => {
  let ttyOut = '';
  const tty = new Writable({
    write(chunk, _enc, cb) {
      ttyOut += String(chunk);
      cb();
    },
  });
  tty.isTTY = true;
  assert.equal(clearInteractiveTerminal({ stream: tty }), true);
  assert.equal(ttyOut, CLEAR_SCREEN);
  assert.match(ttyOut, /\x1b\[2J/);
  assert.match(ttyOut, /\x1b\[H/);

  let plainOut = '';
  const plain = new Writable({
    write(chunk, _enc, cb) {
      plainOut += String(chunk);
      cb();
    },
  });
  plain.isTTY = false;
  assert.equal(clearInteractiveTerminal({ stream: plain }), false);
  assert.equal(plainOut, '');
  assert.equal(CLEAR_RE.test(plainOut), false);
});

test('printStartupBanner clears before banner on TTY even with NO_COLOR', () => {
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  stream.isTTY = true;

  printStartupBanner({
    stream,
    env: { NO_COLOR: '1' },
    project: 'Rent_a_Car',
    workspacePath: 'C:\\ws',
    autoLaunch: false,
  });

  assert.ok(written.startsWith(CLEAR_SCREEN), 'clear must precede banner');
  const afterClear = written.slice(CLEAR_SCREEN.length);
  assert.match(afterClear, /WAITING FOR INCOMING YZ-BRIDGE TASKS/);
  assert.equal(ANSI_RE.test(afterClear), false, 'NO_COLOR must suppress color codes');
});

test('printStartupBanner does not clear or emit clear sequences on non-TTY', () => {
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  stream.isTTY = false;

  printStartupBanner({
    stream,
    env: {},
    useColor: false,
    project: 'Rent_a_Car',
    workspacePath: 'C:\\ws',
    autoLaunch: true,
  });

  assert.equal(written.includes(CLEAR_SCREEN), false);
  assert.equal(CLEAR_RE.test(written), false);
  assert.match(written, /WAITING FOR INCOMING YZ-BRIDGE TASKS/);
});

test('ANSI banner includes logo text, waiting line, and resets', () => {
  const banner = formatStartupBanner({
    useColor: true,
    project: 'Rent_a_Car',
    workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
    autoLaunch: true,
    version: '1.0.0',
    timestamp: '2026-08-20T08:00:00.000Z',
  });

  assert.match(banner, /YZ|DEV|BRIDGE/i);
  assert.match(banner, /GitHub Relay/);
  assert.match(banner, /Cursor Agent/);
  assert.match(banner, /MCP yz-dev-bridge/);
  assert.match(banner, /Firebase/);
  assert.match(banner, /Rent_a_Car/);
  assert.match(banner, /WAITING FOR INCOMING YZ-BRIDGE TASKS/);
  assert.match(banner, /INIT/);
  assert.match(banner, ANSI_RE);
  assert.ok(banner.includes(ANSI.reset), 'ANSI reset must be present');
  assert.ok(banner.includes(ANSI.brightCyan) || banner.includes(ANSI.cyan));
  assert.ok(banner.includes(ANSI.yellow), 'waiting line should be yellow');
  // Must not claim healthy online state at early INIT
  assert.doesNotMatch(stripAnsi(banner), /\bONLINE\b|\bREADY\b|\bCONNECTED\b/);
});

test('non-ANSI / NO_COLOR fallback has no escape sequences', () => {
  const banner = formatStartupBanner({
    useColor: false,
    project: 'Rent_a_Car',
    workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
    autoLaunch: false,
    version: '1.0.0',
    timestamp: '2026-08-20T08:00:00.000Z',
  });

  assert.equal(ANSI_RE.test(banner), false);
  assert.match(banner, /WAITING FOR INCOMING YZ-BRIDGE TASKS/);
  assert.match(banner, /GitHub Relay/);
  assert.match(banner, /INIT/);
  assert.match(banner, /auto-launch off/);
});

test('printStartupBanner writes to stream and honors useColor override', () => {
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  stream.isTTY = false;

  printStartupBanner({
    stream,
    env: { NO_COLOR: '1' },
    useColor: false,
    project: 'Rent_a_Car',
    workspacePath: 'C:\\ws',
    autoLaunch: true,
  });

  assert.ok(written.length > 0);
  assert.equal(ANSI_RE.test(written), false);
  assert.equal(CLEAR_RE.test(written), false);
  assert.match(written, /WAITING FOR INCOMING YZ-BRIDGE TASKS/);
});

test('printStartupBanner can force ANSI even when stream is not a TTY', () => {
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  stream.isTTY = false;

  printStartupBanner({
    stream,
    useColor: true,
    project: 'Rent_a_Car',
    workspacePath: 'C:\\ws',
    autoLaunch: true,
  });

  assert.match(written, ANSI_RE);
  assert.ok(written.includes(ANSI.reset));
  assert.equal(CLEAR_RE.test(written), false, 'forced color must not imply clear');
});

test('statusColor uses bright green only for proven healthy tokens', () => {
  assert.ok(statusColor(true, 'ONLINE').includes(ANSI.brightGreen));
  assert.ok(statusColor(true, 'READY (auto-launch enabled)').includes(ANSI.brightGreen));
  assert.ok(statusColor(true, 'CONNECTED').includes(ANSI.brightGreen));
  assert.ok(statusColor(true, 'INIT').includes(ANSI.yellow));
  assert.ok(statusColor(true, 'WAITING').includes(ANSI.yellow));
  assert.ok(statusColor(true, 'FAILED').includes(ANSI.red));
  assert.ok(statusColor(true, 'UNKNOWN').includes(ANSI.cyan));
  assert.ok(statusColor(true, 'DISABLED (auto-launch off)').includes(ANSI.cyan));
  assert.equal(statusColor(false, 'ONLINE'), 'ONLINE');
});

test('unproven boot statuses never claim ONLINE/READY/CONNECTED', () => {
  const statuses = resolveGithubRelayBannerStatuses({
    githubRelayOnline: false,
    config: {
      autoLaunch: false,
      cursorAgentPath: '',
      workspacePath: 'C:\\missing-workspace-for-test',
    },
    env: {},
    existsImpl: () => false,
    readFileImpl: () => {
      throw new Error('should not read');
    },
  });

  assert.equal(statuses.githubRelayStatus, 'INIT');
  assert.equal(statuses.cursorAgentStatus, 'DISABLED');
  assert.equal(statuses.mcpStatus, 'UNKNOWN');
  assert.equal(statuses.firebaseStatus, 'UNKNOWN');
  assert.doesNotMatch(
    `${statuses.githubRelayStatus} ${statuses.cursorAgentStatus} ${statuses.mcpStatus} ${statuses.firebaseStatus}`,
    /\bONLINE\b|\bREADY\b|\bCONNECTED\b/,
  );
});

test('proven runtime state maps to semantic labels', () => {
  const agentPath = 'C:\\fake\\agent.cmd';
  const openScript = 'open-visible-agent.ps1';
  const mcpPath = 'C:\\ws\\.cursor\\mcp.json';
  const entry = 'C:\\bridge\\src\\stdio.js';

  const existsImpl = (p) => {
    const s = String(p);
    return s === agentPath || s.endsWith(openScript) || s === mcpPath || s === entry;
  };
  const readFileImpl = (p) => {
    assert.equal(String(p), mcpPath);
    return JSON.stringify({
      mcpServers: {
        'yz-dev-bridge': {
          command: 'node',
          args: [entry],
        },
      },
    });
  };

  const online = resolveGithubRelayBannerStatuses({
    githubRelayOnline: true,
    config: {
      autoLaunch: true,
      cursorAgentPath: agentPath,
      workspacePath: 'C:\\ws',
    },
    env: { YZ_BRIDGE_FIREBASE_API_URL: 'https://example.test' },
    existsImpl,
    readFileImpl,
  });

  assert.equal(online.githubRelayStatus, 'ONLINE');
  assert.equal(online.cursorAgentStatus, 'READY');
  assert.equal(online.mcpStatus, 'READY');
  assert.equal(online.firebaseStatus, 'CONFIGURED');
  assert.notEqual(online.firebaseStatus, 'CONNECTED');

  const banner = formatStartupBanner({
    useColor: true,
    project: 'Rent_a_Car',
    autoLaunch: true,
    githubRelayStatus: online.githubRelayStatus,
    cursorAgentStatus: online.cursorAgentStatus,
    cursorAgentDetail: online.cursorAgentDetail,
    mcpStatus: online.mcpStatus,
    firebaseStatus: online.firebaseStatus,
  });
  const plain = stripAnsi(banner);
  assert.match(plain, /ONLINE/);
  assert.match(plain, /READY \(auto-launch enabled\)/);
  assert.match(plain, /CONFIGURED/);
  assert.doesNotMatch(plain, /\bCONNECTED\b/);
  assert.ok(banner.includes(ANSI.brightGreen));
});

test('cursor agent READY requires auto-launch and local launcher evidence', () => {
  assert.equal(
    resolveCursorAgentBannerStatus({ autoLaunch: false, existsImpl: () => true }).status,
    'DISABLED',
  );
  assert.equal(
    resolveCursorAgentBannerStatus({
      autoLaunch: true,
      cursorAgentPath: 'C:\\agent.cmd',
      existsImpl: () => false,
    }).status,
    'UNAVAILABLE',
  );
});

test('mcp READY requires declared server and existing entrypoint', () => {
  const mcpPath = 'C:\\ws\\.cursor\\mcp.json';
  const entry = 'C:\\bridge\\stdio.js';
  const ready = resolveMcpBannerStatus({
    workspacePath: 'C:\\ws',
    existsImpl: (p) => String(p) === mcpPath || String(p) === entry,
    readFileImpl: () => JSON.stringify({
      mcpServers: { 'yz-dev-bridge': { command: 'node', args: [entry] } },
    }),
  });
  assert.equal(ready.status, 'READY');

  const unknown = resolveMcpBannerStatus({
    workspacePath: 'C:\\ws',
    existsImpl: () => false,
  });
  assert.equal(unknown.status, 'UNKNOWN');
});

test('firebase never reports CONNECTED from env alone', () => {
  assert.equal(
    resolveFirebaseBannerStatus({ env: { YZ_BRIDGE_FIREBASE_API_URL: 'https://x' } }).status,
    'CONFIGURED',
  );
  assert.equal(resolveFirebaseBannerStatus({ env: {} }).status, 'UNKNOWN');
});

test('formatStatusTransition is compact and color-safe', () => {
  const colored = formatStatusTransition('GitHub Relay', 'ONLINE', { useColor: true });
  assert.match(colored, /GitHub Relay/);
  assert.match(colored, /ONLINE/);
  assert.ok(colored.includes(ANSI.brightGreen));
  assert.ok(colored.includes(ANSI.reset));

  const plain = formatStatusTransition('GitHub Relay', 'ONLINE', { useColor: false });
  assert.equal(plain, 'GitHub Relay: ONLINE');
  assert.equal(ANSI_RE.test(plain), false);
});

const STATUS_LABELS = ['GitHub Relay', 'Cursor Agent', 'MCP yz-dev-bridge', 'Firebase', 'Workspace'];

function extractStatusRows(banner) {
  const lines = stripAnsi(banner).split('\n').filter(Boolean);
  const rows = {};
  for (const line of lines) {
    for (const label of STATUS_LABELS) {
      if (line.startsWith(`║  ${label}`)) {
        rows[label] = line;
      }
    }
  }
  return rows;
}

function valueStartIndex(line, label) {
  const i = line.indexOf(label);
  assert.ok(i >= 0, `missing label ${label}`);
  let j = i + label.length;
  while (j < line.length && line[j] === ' ') j += 1;
  return j;
}

function sampleBanner(overrides = {}) {
  return formatStartupBanner({
    project: 'Rent_a_Car',
    workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
    autoLaunch: true,
    githubRelayStatus: 'INIT',
    cursorAgentStatus: 'READY',
    cursorAgentDetail: 'READY (auto-launch enabled)',
    mcpStatus: 'READY',
    firebaseStatus: 'CONFIGURED',
    version: '1.0.0',
    timestamp: '2026-08-20T08:00:00.000Z',
    ...overrides,
  });
}

test('top status rows share a stable left-aligned value column', () => {
  const banner = sampleBanner({ useColor: false });
  const rows = extractStatusRows(banner);
  for (const label of STATUS_LABELS) {
    assert.ok(rows[label], `missing status row for ${label}`);
  }

  const starts = STATUS_LABELS.map((label) => valueStartIndex(rows[label], label));
  assert.ok(starts.every((start) => start === starts[0]), `value columns drifted: ${starts.join(',')}`);

  assert.match(rows['GitHub Relay'], /GitHub Relay\s+INIT/);
  assert.match(rows['Cursor Agent'], /Cursor Agent\s+READY \(auto-launch enabled\)/);
  assert.match(rows['MCP yz-dev-bridge'], /MCP yz-dev-bridge\s+READY/);
  assert.match(rows['Firebase'], /Firebase\s+CONFIGURED/);
  assert.match(rows['Workspace'], /Workspace\s+Rent_a_Car/);
});

test('status values are not padded to the far-right card edge', () => {
  const banner = sampleBanner({ useColor: false });
  const rows = extractStatusRows(banner);
  const github = rows['GitHub Relay'];
  assert.match(github, /INIT\s+║/);
  assert.doesNotMatch(github, /INIT║/);

  const start = valueStartIndex(github, 'GitHub Relay');
  const end = github.lastIndexOf('║');
  const valuePart = github.slice(start, end);
  assert.ok(valuePart.startsWith('INIT'));
  assert.ok(valuePart.trimEnd().length < valuePart.length, 'short values must leave trailing pad before the border');
});

test('ANSI coloring does not change visible status-row alignment', () => {
  const colored = sampleBanner({ useColor: true });
  const plain = sampleBanner({ useColor: false });
  assert.match(colored, ANSI_RE);
  assert.equal(ANSI_RE.test(plain), false);

  const coloredRows = extractStatusRows(colored);
  const plainRows = extractStatusRows(plain);
  const coloredStarts = STATUS_LABELS.map((label) => valueStartIndex(coloredRows[label], label));
  const plainStarts = STATUS_LABELS.map((label) => valueStartIndex(plainRows[label], label));
  assert.deepEqual(coloredStarts, plainStarts);
  assert.ok(coloredStarts.every((start) => start === coloredStarts[0]));

  const coloredLines = stripAnsi(colored).split('\n').filter(Boolean);
  const widths = coloredLines.map((line) => line.length);
  assert.ok(widths.every((width) => width === widths[0]), `ANSI visible widths drifted: ${widths.join(',')}`);
});

test('NO_COLOR / non-TTY startup status rows stay aligned and escape-free', () => {
  const banner = sampleBanner({ useColor: false });
  assert.equal(ANSI_RE.test(banner), false);

  const rows = extractStatusRows(banner);
  const starts = STATUS_LABELS.map((label) => valueStartIndex(rows[label], label));
  assert.ok(starts.every((start) => start === starts[0]));

  const lines = banner.split('\n').filter(Boolean);
  const widths = lines.map((line) => stripAnsi(line).length);
  assert.ok(widths.every((width) => width === widths[0]));
});

test('long status values truncate without breaking the banner border', () => {
  const longProject = `Rent_a_Car_${'X'.repeat(80)}`;
  const banner = sampleBanner({
    useColor: true,
    project: longProject,
    cursorAgentDetail: `READY (auto-launch enabled) ${'detail-'.repeat(20)}`,
  });
  const lines = stripAnsi(banner).split('\n').filter(Boolean);
  const widths = lines.map((line) => line.length);
  assert.ok(widths.every((width) => width === widths[0]), `border width mismatch: ${widths.join(',')}`);
  assert.match(banner, /\.\.\./);

  const rows = extractStatusRows(banner);
  const starts = STATUS_LABELS.map((label) => valueStartIndex(rows[label], label));
  assert.ok(starts.every((start) => start === starts[0]));
});
