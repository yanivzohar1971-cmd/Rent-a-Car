import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoBlanketCliPermissions,
  buildAgentPrompt,
  buildAgentSessionFilePath,
  buildCmdStartSpec,
  buildCursorAgentCliArgs,
  buildStartProcessCommand,
  buildTrustedBridgeCliConfig,
  buildTrustedBridgeMcpAllowPatterns,
  buildVisibleWindowStartSpec,
  cmdQuote,
  confirmVisibleLaunchHandoff,
  detectImmediateProcessExit,
  ensureProjectAgentCliConfig,
  flattenUnquotedArgumentList,
  isBlanketCliPermission,
  isWindowsAppsWtShim,
  joinWindowsArgumentList,
  mergeTrustedBridgeCliConfig,
  parseLaunchedPid,
  projectCliConfigPath,
  projectMcpConfigPath,
  psQuote,
  resolveCursorAgentPath,
  shouldRequireLaunchPidLifetime,
  summarizeLaunchPlan,
  TRUSTED_BRIDGE_MCP_TOOLS,
  TRUSTED_BRIDGE_SHELL_ALLOW,
  winQuote,
} from '../src/agent/cursorAgentLauncher.js';
import { launchVisibleCursorAgent, readRegisteredAgentSession } from '../src/agent/launchVisibleAgent.js';
import { loadGithubRelayConfig } from '../src/github/githubRelayConfig.js';
import { UTF8_BOM } from '../src/jsonBom.js';

const WORKSPACE = 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car';
const AGENT = 'C:\\Users\\Yaniv\\AppData\\Local\\cursor-agent\\agent.cmd';
const SCRIPT = 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car\\tools\\yz-dev-bridge\\scripts\\open-visible-agent.ps1';
const WT = 'C:\\Users\\Yaniv\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';

test('Windows Terminal launch plan quotes the project path as its own argument', () => {
  const spec = buildVisibleWindowStartSpec({
    taskId: 'TASK-00012',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: true,
    wtPath: WT,
    openScriptPath: SCRIPT,
  });
  assert.equal(spec.method, 'wt');
  assert.equal(spec.file, WT);
  assert.equal(spec.args[0], '-w');
  assert.equal(spec.args[1], 'new');
  assert.equal(spec.args[2], 'new-tab');
  const dashD = spec.args.indexOf('-d');
  assert.equal(spec.args[dashD + 1], WORKSPACE);
  assert.equal(spec.args.includes('-NoExit'), true);
  assert.equal(spec.args.includes('--'), false);
  assert.equal(spec.args[spec.args.indexOf('-File') + 1], SCRIPT);
  assert.equal(spec.args[spec.args.indexOf('-TaskId') + 1], 'TASK-00012');
  assert.equal(spec.args[spec.args.indexOf('-Workspace') + 1], WORKSPACE);
  assert.equal(spec.args[spec.args.indexOf('-AgentPath') + 1], AGENT);
  const command = buildStartProcessCommand(spec);
  assert.match(command, /Start-Process/);
  assert.match(command, /-ArgumentList '/);
  assert.doesNotMatch(command, /-ArgumentList @\(/);
  assert.doesNotMatch(command, /YZ_BRIDGE_/);
});

test('visible launch plan carries the exact agent session registration arguments', () => {
  const sessionFilePath = buildAgentSessionFilePath('TASK-00012', 'nonce-1');
  const spec = buildVisibleWindowStartSpec({
    taskId: 'TASK-00012',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: true,
    wtPath: WT,
    openScriptPath: SCRIPT,
    sessionFilePath,
    sessionNonce: 'nonce-1',
  });
  assert.equal(spec.args[spec.args.indexOf('-SessionFile') + 1], sessionFilePath);
  assert.equal(spec.args[spec.args.indexOf('-SessionNonce') + 1], 'nonce-1');
  assert.match(spec.argumentListString, /-SessionFile /);
  assert.match(spec.argumentListString, /-SessionNonce "nonce-1"/);
});

test('TASK-00013 title/workspace/script/agent remain one quoted argument each', () => {
  const spec = buildVisibleWindowStartSpec({
    taskId: 'TASK-00013',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: true,
    wtPath: WT,
    openScriptPath: SCRIPT,
  });
  const unquoted = flattenUnquotedArgumentList(spec.args);
  assert.match(unquoted, /--title YZ Bridge TASK-00013/);
  assert.equal(unquoted.includes('Bridge TASK-00013 -d'), true);

  const quoted = spec.argumentListString;
  assert.equal(quoted.includes('--title "YZ Bridge TASK-00013"'), true);
  assert.equal(quoted.includes(`-d "${WORKSPACE}"`), true);
  assert.equal(quoted.includes(`-File "${SCRIPT}"`), true);
  assert.equal(quoted.includes(`-AgentPath "${AGENT}"`), true);
  assert.equal(quoted.includes(`-Workspace "${WORKSPACE}"`), true);
  assert.match(quoted, /^-w new new-tab /);
  assert.equal(quoted.includes(' -- '), false);
  assert.equal(quoted.includes('-- powershell.exe'), false);
  const afterTitle = quoted.slice(quoted.indexOf('--title "YZ Bridge TASK-00013"') + '--title "YZ Bridge TASK-00013"'.length);
  assert.match(afterTitle, /^\s+-d /);
  assert.match(quoted, / "powershell\.exe" -NoExit /);
  assert.doesNotMatch(quoted, /when launching `Bridge /);
  assert.equal(winQuote('YZ Bridge TASK-00013'), '"YZ Bridge TASK-00013"');

  const start = buildStartProcessCommand(spec);
  assert.match(start, /--title "YZ Bridge TASK-00013"/);
  assert.doesNotMatch(start, /-ArgumentList @\(/);
});

test('fallback launcher uses powershell.exe -NoExit and Start-Process', () => {
  const spec = buildVisibleWindowStartSpec({
    taskId: 'TASK-00012',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: true,
    wtPath: null,
    openScriptPath: SCRIPT,
  });
  assert.equal(spec.method, 'powershell-fallback');
  assert.equal(spec.file, 'powershell.exe');
  assert.equal(spec.args[0], '-NoExit');
  assert.equal(spec.workingDirectory, WORKSPACE);
  assert.match(spec.argumentListString, /-File "/);
});

test('keep-open false omits -NoExit so the window can close', () => {
  const open = buildVisibleWindowStartSpec({
    taskId: 'TASK-00012',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: true,
    wtPath: null,
    openScriptPath: SCRIPT,
  });
  const closed = buildVisibleWindowStartSpec({
    taskId: 'TASK-00012',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: false,
    wtPath: null,
    openScriptPath: SCRIPT,
  });
  assert.equal(open.args.includes('-NoExit'), true);
  assert.equal(closed.args.includes('-NoExit'), false);
  assert.equal(open.keepWindowOpen, true);
  assert.equal(closed.keepWindowOpen, false);
  assert.equal(open.hostNoExit, true);
  assert.equal(closed.hostNoExit, false);
  assert.equal(open.hostLaunchMode, 'persistent');
  assert.equal(closed.hostLaunchMode, 'non-persistent');
});

test('GitHub auto-launch default omits -NoExit on dedicated WT and fallback hosts', () => {
  const config = loadGithubRelayConfig({
    YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN: '',
    YZ_BRIDGE_WORKSPACE: WORKSPACE,
  });
  assert.equal(config.keepWindowOpen, false);
  const wt = buildVisibleWindowStartSpec({
    taskId: 'TASK-00028',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: config.keepWindowOpen,
    wtPath: WT,
    openScriptPath: SCRIPT,
  });
  const fallback = buildVisibleWindowStartSpec({
    taskId: 'TASK-00028',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: config.keepWindowOpen,
    wtPath: null,
    openScriptPath: SCRIPT,
  });
  assert.equal(wt.args.includes('-NoExit'), false);
  assert.equal(fallback.args.includes('-NoExit'), false);
  assert.match(wt.argumentListString, / "powershell\.exe" -NoProfile /);
  assert.doesNotMatch(wt.argumentListString, / "powershell\.exe" -NoExit /);
  assert.equal(wt.hostNoExit, false);
  assert.equal(wt.hostLaunchMode, 'non-persistent');
  const summarized = summarizeLaunchPlan(wt);
  assert.equal(summarized.hostNoExit, false);
  assert.equal(summarized.hostLaunchMode, 'non-persistent');
});

test('wrapper script retains FAILED sessions and auto-closes COMPLETED without requiring -NoExit', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  assert.match(script, /intentional-completed-auto-close/);
  assert.match(script, /exiting 0 so Windows Terminal can close the tab/);
  assert.match(script, /failed-task-retention/);
  assert.match(script, /FAILED session retained/);
  assert.match(script, /restart-prevented-terminal-task/);
  assert.match(script, /close-request/);
  assert.doesNotMatch(script, /Get-Process.*(powershell|WindowsTerminal|Cursor).*Stop-Process/i);
});

test('PowerShell quoting escapes single quotes', () => {
  assert.equal(psQuote("O'Brien"), "'O''Brien'");
});

test('resolveCursorAgentPath prefers agent.cmd when present', () => {
  const resolved = resolveCursorAgentPath({
    configuredPath: '',
    whichOutput: '',
    existsImpl: (file) => file.endsWith('\\cursor-agent\\agent.cmd'),
  });
  assert.match(resolved, /cursor-agent\\agent\.cmd$/);
});

test('immediate child exit is detected', async () => {
  const result = await detectImmediateProcessExit({
    pid: 16560,
    delayMs: 5,
    sleepImpl: async () => undefined,
    aliveImpl: () => false,
  });
  assert.equal(result.alive, false);
  assert.equal(result.reason, 'exited-immediately');
});

test('running window pid is treated as alive', async () => {
  const result = await detectImmediateProcessExit({
    pid: 4242,
    delayMs: 5,
    sleepImpl: async () => undefined,
    aliveImpl: (pid) => pid === 4242,
  });
  assert.equal(result.alive, true);
});

test('parseLaunchedPid reads the last integer line', () => {
  assert.equal(parseLaunchedPid('Start-Process\n35504\n'), 35504);
});

test('launchVisibleCursorAgent treats WindowsApps wt shim PID exit as handoff success', async () => {
  const fakeChild = {
    stdout: { setEncoding() {}, on(event, cb) { if (event === 'data') cb('9804\n'); } },
    stderr: { setEncoding() {}, on() {} },
    on(event, cb) {
      if (event === 'close') cb(0);
    },
  };
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  const launched = await launchVisibleCursorAgent({
    taskId: 'TASK-00013',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: true,
    wtPath: WT,
    spawnImpl: () => fakeChild,
    aliveImpl: () => false,
    sleepImpl: async () => undefined,
    sessionNonce: 'nonce-2',
    presentationStream: stream,
    presentationEnv: {},
    useColor: false,
    sessionRegistrationWaiter: async ({ taskId, sessionFilePath, sessionNonce }) => ({
      taskId,
      file: sessionFilePath,
      nonce: sessionNonce,
      pid: 7711,
      startedAt: '2026-08-20T07:00:00.000Z',
      registeredAt: '2026-08-20T07:00:00.100Z',
      workspace: WORKSPACE,
    }),
  });
  assert.equal(launched.pid, 9804);
  assert.equal(launched.method, 'wt');
  assert.equal(launched.windowsAppsShim, true);
  assert.equal(launched.handoff, 'windows-apps-wt-shim');
  assert.equal(launched.file, WT);
  assert.equal(launched.session.pid, 7711);
  assert.equal(launched.session.nonce, 'nonce-2');
  assert.match(written, /AGENT LAUNCHER/);
  assert.match(written, /Windows Terminal/);
  assert.match(written, /Status\s+LAUNCHING/);
  assert.match(written, /AGENT HANDOFF/);
  assert.match(written, /Handoff\s+SUCCESS/);
  assert.match(written, /PID\s+9804/);
  assert.equal((written.match(/╔[^\n]*AGENT LAUNCHER[^\n]*╗/g) || []).length, 1);
  assert.doesNotMatch(written, /YZ visible Agent launcher selected \{/);
  assert.doesNotMatch(written, /YZ visible Agent launcher handoff \{/);
  assert.doesNotMatch(written, /argumentListString/);
  assert.doesNotMatch(written, /nonce-2/);
  assert.doesNotMatch(written, /cliConfigPath/);
});

test('launchVisibleCursorAgent RAW mode retains full launcher diagnostics', async () => {
  const fakeChild = {
    stdout: { setEncoding() {}, on(event, cb) { if (event === 'data') cb('5555\n'); } },
    stderr: { setEncoding() {}, on() {} },
    on(event, cb) {
      if (event === 'close') cb(0);
    },
  };
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  await launchVisibleCursorAgent({
    taskId: 'TASK-00034',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: false,
    wtPath: WT,
    spawnImpl: () => fakeChild,
    aliveImpl: () => true,
    sleepImpl: async () => undefined,
    sessionNonce: 'raw-nonce-34',
    presentationStream: stream,
    presentationEnv: { YZ_BRIDGE_RELAY_RAW_LOGS: '1' },
    useColor: false,
    sessionRegistrationWaiter: async ({ taskId, sessionFilePath, sessionNonce }) => ({
      taskId,
      file: sessionFilePath,
      nonce: sessionNonce,
      pid: 5555,
      startedAt: '2026-08-20T07:00:00.000Z',
      registeredAt: '2026-08-20T07:00:00.100Z',
      workspace: WORKSPACE,
    }),
  });
  assert.match(written, /AGENT LAUNCHER/);
  assert.match(written, /YZ visible Agent launcher selected \{/);
  assert.match(written, /YZ visible Agent launcher handoff \{/);
  assert.match(written, /argumentListString/);
  assert.match(written, /cliConfigPath/);
  assert.match(written, /windowsAppsShim/);
});

test('launchVisibleCursorAgent failure card is visible without SUCCESS handoff', async () => {
  const fakeChild = {
    stdout: { setEncoding() {}, on(event, cb) { if (event === 'data') cb('16560\n'); } },
    stderr: { setEncoding() {}, on() {} },
    on(event, cb) {
      if (event === 'close') cb(0);
    },
  };
  let written = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  await assert.rejects(
    () => launchVisibleCursorAgent({
      taskId: 'TASK-00012',
      workspacePath: WORKSPACE,
      agentPath: AGENT,
      keepWindowOpen: true,
      wtPath: null,
      spawnImpl: () => fakeChild,
      aliveImpl: () => false,
      sleepImpl: async () => undefined,
      presentationStream: stream,
      presentationEnv: {},
      useColor: false,
    }),
    /exited immediately/,
  );
  assert.match(written, /AGENT LAUNCHER/);
  assert.match(written, /Handoff\s+FAILED/);
  assert.doesNotMatch(written, /Handoff\s+SUCCESS/);
  assert.doesNotMatch(written, /YZ visible Agent launcher handoff \{/);
});

test('WindowsApps wt shim PID is not a required lifetime signal', async () => {
  assert.equal(isWindowsAppsWtShim(WT), true);
  assert.equal(isWindowsAppsWtShim('wt.exe'), true);
  assert.equal(isWindowsAppsWtShim('C:\\Program Files\\Windows Terminal\\wt.exe'), false);
  assert.equal(shouldRequireLaunchPidLifetime({ method: 'wt', file: WT }), false);
  assert.equal(shouldRequireLaunchPidLifetime({ method: 'powershell-fallback', file: 'powershell.exe' }), true);
  const handoff = await confirmVisibleLaunchHandoff({
    pid: 9804,
    method: 'wt',
    file: WT,
    delayMs: 5,
    sleepImpl: async () => undefined,
    aliveImpl: () => false,
  });
  assert.equal(handoff.ok, true);
  assert.equal(handoff.handoff, 'windows-apps-wt-shim');
  assert.equal(handoff.pidLifetimeRequired, false);
});

test('launchVisibleCursorAgent rejects an immediately exiting powershell child', async () => {
  const fakeChild = {
    stdout: { setEncoding() {}, on(event, cb) { if (event === 'data') cb('16560\n'); } },
    stderr: { setEncoding() {}, on() {} },
    on(event, cb) {
      if (event === 'close') cb(0);
    },
  };
  const sink = new Writable({ write(_c, _e, cb) { cb(); } });
  await assert.rejects(
    () => launchVisibleCursorAgent({
      taskId: 'TASK-00012',
      workspacePath: WORKSPACE,
      agentPath: AGENT,
      keepWindowOpen: true,
      wtPath: null,
      spawnImpl: () => fakeChild,
      aliveImpl: () => false,
      sleepImpl: async () => undefined,
      presentationStream: sink,
      presentationEnv: {},
      useColor: false,
    }),
    /exited immediately/,
  );
});

test('cmd.exe start fallback quotes the window title and spaced paths', () => {
  const spaced = 'C:\\Program Files\\Rent a Car';
  const spec = buildCmdStartSpec({
    taskId: 'TASK-00012',
    workspacePath: spaced,
    agentPath: AGENT,
    keepWindowOpen: true,
    openScriptPath: SCRIPT,
  });
  assert.equal(spec.method, 'cmd-start');
  assert.match(spec.args[1], /start "YZ Bridge TASK-00012"/);
  assert.match(spec.args[1], /\/D "C:\\Program Files\\Rent a Car"/);
  assert.match(spec.args[1], /-NoExit/);
  assert.equal(cmdQuote(spaced), `"${spaced}"`);
});

test('cmd keep-open false omits -NoExit', () => {
  const spec = buildCmdStartSpec({
    taskId: 'TASK-00012',
    workspacePath: WORKSPACE,
    agentPath: AGENT,
    keepWindowOpen: false,
    openScriptPath: SCRIPT,
  });
  assert.doesNotMatch(spec.args[1], /-NoExit/);
});

test('auto-launched Agent CLI binds workspace, approves MCP, and keeps the prompt intact', () => {
  const prompt = buildAgentPrompt('TASK-00014', WORKSPACE);
  const args = buildCursorAgentCliArgs({ workspacePath: WORKSPACE, prompt });
  assert.equal(args[0], '--trust');
  assert.equal(args[1], '--approve-mcps');
  assert.equal(args[2], '--workspace');
  assert.equal(args[3], WORKSPACE);
  assert.equal(args[4], '--');
  assert.equal(args[5], prompt);
  assert.match(prompt, /bridge_claim_task with id TASK-00014/);
  assert.match(prompt, /bridge_get_task/);
  assert.match(prompt, /bridge_update_task/);
  assert.match(prompt, /prefer bridge_status and bridge_get_task/);
  assert.match(prompt, /never COMPLETED with metadata.failed=true/);
  assert.doesNotMatch(prompt, /rm -rf/);

  const quoted = joinWindowsArgumentList(args);
  assert.equal(quoted.includes(`--workspace "${WORKSPACE}"`), true);
  assert.match(quoted, /--trust --approve-mcps --workspace /);
  assert.equal(quoted.includes('--approve-mcps'), true);

  const mcpPath = projectMcpConfigPath(WORKSPACE);
  assert.equal(mcpPath, `${WORKSPACE}\\.cursor\\mcp.json`);
  assert.equal(existsSync(mcpPath), true);
  const mcp = readFileSync(mcpPath, 'utf8');
  assert.match(mcp, /"yz-dev-bridge"/);
  assert.match(mcp, /stdio\.js/);

  const script = readFileSync(SCRIPT, 'utf8');
  assert.match(script, /--approve-mcps/);
  assert.match(script, /--workspace/);
  assert.match(script, /cursor-agent\.ps1/);
  assert.match(script, /Set-Location -LiteralPath \$Workspace/);
  assert.match(script, /ensure-project-cli-config\.mjs/);
  assert.match(script, /cli\.json pre-allowlists trusted yz-dev-bridge MCP tools/);
  assert.match(script, /UTF8Encoding \$false/);
  assert.match(script, /WriteAllText/);
  assert.match(script, /close-request/);
  assert.match(script, /outcome\.json/);
  assert.match(script, /restart-prevented-terminal-task/);
  assert.match(script, /intentional-completed-auto-close/);
  assert.match(script, /exiting 0 so Windows Terminal can close the tab/);
  assert.match(script, /failed-task-retention/);
  assert.doesNotMatch(script, /Set-Content -LiteralPath \$SessionFile -Encoding utf8/);
  assert.doesNotMatch(script, /BridgeStore/);
});

test('agent prompt names the MCP claim workflow and not a shell payload', () => {
  const prompt = buildAgentPrompt('TASK-00012', WORKSPACE);
  assert.match(prompt, /bridge_claim_task with id TASK-00012/);
  assert.match(prompt, /yz-dev-bridge MCP/);
  assert.match(prompt, /do not call bridge_get_context or bridge_put_context/);
  assert.doesNotMatch(prompt, /rm -rf/);
});

test('trusted Bridge CLI allow patterns include scoped MCP tools and narrow Shell families', () => {
  const patterns = buildTrustedBridgeMcpAllowPatterns();
  assert.equal(patterns.length, TRUSTED_BRIDGE_MCP_TOOLS.length);
  assert.deepEqual(patterns, [
    'Mcp(yz-dev-bridge:bridge_claim_task)',
    'Mcp(yz-dev-bridge:bridge_get_task)',
    'Mcp(yz-dev-bridge:bridge_update_task)',
    'Mcp(yz-dev-bridge:bridge_status)',
  ]);
  assert.equal(TRUSTED_BRIDGE_MCP_TOOLS.includes('bridge_get_context'), false);
  assert.equal(TRUSTED_BRIDGE_MCP_TOOLS.includes('bridge_put_context'), false);
  const config = buildTrustedBridgeCliConfig();
  assert.equal(config.permissions.deny.length, 0);
  assert.equal(config.permissions.allow.includes('Mcp(yz-dev-bridge:bridge_get_task)'), true);
  for (const pattern of TRUSTED_BRIDGE_SHELL_ALLOW) {
    assert.equal(config.permissions.allow.includes(pattern), true);
  }
  assert.equal(config.permissions.allow.some((item) => isBlanketCliPermission(item)), false);
  assert.equal(config.permissions.allow.includes('Shell(*)'), false);
  assert.equal(config.permissions.allow.includes('Mcp(*)'), false);
  assert.equal(config.permissions.allow.includes('Mcp(*:*)'), false);
  assert.throws(() => assertNoBlanketCliPermissions(['Shell(*)']), /Blanket CLI permissions/);
  assert.throws(() => mergeTrustedBridgeCliConfig({
    permissions: { allow: ['Shell(*)'], deny: [] },
  }), /Blanket CLI permissions/);
});

test('mergeTrustedBridgeCliConfig preserves unrelated project CLI settings', () => {
  const merged = mergeTrustedBridgeCliConfig({
    editor: { vimMode: true },
    permissions: {
      allow: ['Shell(npm test)'],
      deny: ['Shell(rm)'],
    },
  });
  assert.equal(merged.editor.vimMode, true);
  assert.equal(merged.permissions.deny.includes('Shell(rm)'), true);
  assert.equal(merged.permissions.allow.includes('Shell(npm test)'), true);
  assert.equal(merged.permissions.allow.includes('Mcp(yz-dev-bridge:bridge_claim_task)'), true);
});

test('ensureProjectAgentCliConfig writes workspace .cursor/cli.json with trusted MCP tools', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-cli-'));
  try {
    const result = ensureProjectAgentCliConfig({ workspacePath: dir });
    assert.equal(result.created, true);
    assert.equal(result.path, projectCliConfigPath(dir));
    const parsed = JSON.parse(readFileSync(result.path, 'utf8'));
    assert.equal(parsed.permissions.allow.includes('Mcp(yz-dev-bridge:bridge_get_task)'), true);
    assert.equal(parsed.permissions.allow.includes('Shell(git:status*)'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'approvalMode'), false);
    assert.equal(parsed.permissions.allow.some((item) => isBlanketCliPermission(item)), false);

    const second = ensureProjectAgentCliConfig({ workspacePath: dir });
    assert.equal(second.created, false);
    assert.equal(second.allowPatterns.length, parsed.permissions.allow.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Rent_a_Car workspace ships project CLI config for unattended Bridge MCP tools', () => {
  const cliPath = projectCliConfigPath(WORKSPACE);
  assert.equal(existsSync(cliPath), true);
  const parsed = JSON.parse(readFileSync(cliPath, 'utf8'));
  for (const tool of ['bridge_claim_task', 'bridge_get_task', 'bridge_update_task', 'bridge_status']) {
    assert.equal(parsed.permissions.allow.includes(`Mcp(yz-dev-bridge:${tool})`), true);
  }
  for (const pattern of TRUSTED_BRIDGE_SHELL_ALLOW) {
    assert.equal(parsed.permissions.allow.includes(pattern), true);
  }
  assert.equal(parsed.permissions.allow.includes('Mcp(yz-dev-bridge:bridge_get_context)'), false);
  assert.equal(parsed.permissions.allow.includes('Mcp(yz-dev-bridge:bridge_put_context)'), false);
  assert.equal(parsed.permissions.allow.some((item) => item.startsWith('Mcp(') && !item.startsWith('Mcp(yz-dev-bridge:')), false);
  assert.equal(parsed.permissions.allow.some((item) => isBlanketCliPermission(item)), false);
  assertNoBlanketCliPermissions(parsed.permissions.allow);
});

test('ensureProjectAgentCliConfig reads BOM-prefixed existing cli.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-cli-bom-'));
  try {
    const cursorDir = join(dir, '.cursor');
    await mkdir(cursorDir, { recursive: true });
    const cliPath = projectCliConfigPath(dir);
    await writeFile(cliPath, `${UTF8_BOM}{"permissions":{"allow":["Shell(git:status*)"],"deny":[]}}\n`, 'utf8');
    const result = ensureProjectAgentCliConfig({ workspacePath: dir });
    assert.equal(result.created, false);
    assert.equal(result.allowPatterns.includes('Shell(git:status*)'), true);
    assert.equal(result.allowPatterns.includes('Mcp(yz-dev-bridge:bridge_claim_task)'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readRegisteredAgentSession parses BOM-prefixed session JSON on the launcher path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-session-'));
  try {
    const sessionPath = join(dir, 'TASK-00023-nonce.json');
    const body = JSON.stringify({
      taskId: 'TASK-00023',
      nonce: 'nonce-bom',
      pid: 4321,
      startedAt: '2026-08-20T07:03:32.000Z',
      registeredAt: '2026-08-20T07:03:32.100Z',
      workspace: WORKSPACE,
    }, null, 4);
    await writeFile(sessionPath, `${UTF8_BOM}${body}`, 'utf8');
    const session = await readRegisteredAgentSession(sessionPath);
    assert.equal(session.taskId, 'TASK-00023');
    assert.equal(session.nonce, 'nonce-bom');
    assert.equal(session.pid, 4321);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readRegisteredAgentSession still fails honestly on malformed session JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-session-bad-'));
  try {
    const sessionPath = join(dir, 'bad.json');
    await writeFile(sessionPath, `${UTF8_BOM}{ not json`, 'utf8');
    await assert.rejects(
      () => readRegisteredAgentSession(sessionPath),
      /UTF-8 BOM or invalid session JSON|could not be parsed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('launchVisibleCursorAgent registers a BOM-prefixed session file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-launch-bom-'));
  try {
    const nonce = 'nonce-bom-launch';
    const sessionPath = buildAgentSessionFilePath('TASK-00024', nonce, dir);
    await mkdir(dirname(sessionPath), { recursive: true });
    const body = JSON.stringify({
      taskId: 'TASK-00024',
      nonce,
      pid: 8899,
      startedAt: '2026-08-20T07:06:40.000Z',
      registeredAt: '2026-08-20T07:06:40.100Z',
      workspace: WORKSPACE,
    }, null, 4);
    await writeFile(sessionPath, `${UTF8_BOM}${body}`, 'utf8');
    const fakeChild = {
      stdout: { setEncoding() {}, on(event, cb) { if (event === 'data') cb('9804\n'); } },
      stderr: { setEncoding() {}, on() {} },
      on(event, cb) {
        if (event === 'close') cb(0);
      },
    };
    const sink = new Writable({ write(_c, _e, cb) { cb(); } });
    const launched = await launchVisibleCursorAgent({
      taskId: 'TASK-00024',
      workspacePath: WORKSPACE,
      agentPath: AGENT,
      keepWindowOpen: true,
      wtPath: WT,
      spawnImpl: () => fakeChild,
      aliveImpl: () => false,
      sleepImpl: async () => undefined,
      presentationStream: sink,
      presentationEnv: {},
      useColor: false,
      sessionDir: dir,
      sessionNonce: nonce,
    });
    assert.equal(launched.session.pid, 8899);
    assert.equal(launched.session.nonce, nonce);
    assert.equal(launched.session.taskId, 'TASK-00024');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
