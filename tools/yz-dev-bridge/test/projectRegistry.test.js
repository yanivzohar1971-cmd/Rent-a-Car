import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ProjectRegistryError,
  canonicalizeWorkspacePath,
  looksLikeFilesystemPath,
  loadProjectRegistry,
  parseProjectMarkerFromText,
  resetProjectRegistryCache,
  resolveProject,
  resolveTaskProjectIdentity,
  workspacePathsEqual,
} from '../src/projects/projectRegistry.js';
import { resolveTaskWorkspace } from '../src/projects/resolveTaskWorkspace.js';
import {
  ensureProjectAgentBridgeConfigs,
  mergeTrustedBridgeMcpConfig,
  assertNoBlanketCliPermissions,
} from '../src/agent/cursorAgentLauncher.js';
import { mapGithubIssueToLocalInput } from '../src/github/issueMapper.js';
import { BridgeStore } from '../src/store.js';

async function withTempRegistry(projects, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-projects-'));
  const file = join(dir, 'projects.json');
  await writeFile(file, `${JSON.stringify({ schemaVersion: 1, projects }, null, 2)}\n`, 'utf8');
  resetProjectRegistryCache();
  try {
    await fn(file, dir);
  } finally {
    resetProjectRegistryCache();
    await rm(dir, { recursive: true, force: true });
  }
}

test('project registry resolves ids and aliases', async () => {
  await withTempRegistry([
    {
      id: 'rent-a-car',
      displayName: 'Rent_a_Car',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      enabled: true,
      aliases: ['Rent_a_Car'],
    },
  ], async (file) => {
    const registry = loadProjectRegistry({ filePath: file });
    assert.equal(resolveProject('rent-a-car', { registry }).id, 'rent-a-car');
    assert.equal(resolveProject('Rent_a_Car', { registry }).id, 'rent-a-car');
  });
});

test('unknown and disabled projects are rejected', async () => {
  await withTempRegistry([
    {
      id: 'glasses',
      displayName: 'Glasses',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Glasses',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      enabled: false,
      aliases: [],
    },
  ], async (file) => {
    const registry = loadProjectRegistry({ filePath: file });
    assert.throws(() => resolveProject('missing', { registry }), /Unknown projectId/);
    assert.throws(() => resolveProject('glasses', { registry, requireEnabled: true }), /disabled/i);
  });
});

test('path injection as projectId is rejected', () => {
  assert.equal(looksLikeFilesystemPath('C:\\evil'), true);
  assert.equal(looksLikeFilesystemPath('../evil'), true);
  assert.equal(looksLikeFilesystemPath('glasses'), false);
  assert.throws(
    () => parseProjectMarkerFromText('<!-- yz-bridge-project:C:\\Users\\evil -->'),
    (error) => error instanceof ProjectRegistryError && error.code === 'PROJECT_MARKER_PATH',
  );
});

test('canonical Windows workspace paths compare case-insensitively', () => {
  const a = canonicalizeWorkspacePath('C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car');
  const b = canonicalizeWorkspacePath('c:/Users/Yaniv/source/repos/Rent_a_Car');
  assert.equal(workspacePathsEqual(a, b), true);
});

test('duplicate registry ids/repos/workspaces are rejected', async () => {
  await withTempRegistry([
    {
      id: 'rent-a-car',
      displayName: 'A',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      enabled: true,
    },
    {
      id: 'rent-a-car',
      displayName: 'B',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Glasses',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      enabled: true,
    },
  ], async (file) => {
    assert.throws(() => loadProjectRegistry({ filePath: file }), /Duplicate project id/);
  });
});

test('project markers parse, conflict, and unknown fail safely', async () => {
  await withTempRegistry([
    {
      id: 'rent-a-car',
      displayName: 'Rent_a_Car',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      enabled: true,
    },
    {
      id: 'glasses',
      displayName: 'Glasses',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Glasses',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      enabled: true,
    },
  ], async (file) => {
    const registry = loadProjectRegistry({ filePath: file });
    const ok = parseProjectMarkerFromText('Hello\n<!-- yz-bridge-project:glasses -->\n', { registry });
    assert.equal(ok.projectId, 'glasses');
    assert.throws(
      () => parseProjectMarkerFromText('<!-- yz-bridge-project:glasses --><!-- yz-bridge-project:rent-a-car -->', { registry }),
      /Conflicting/,
    );
    assert.throws(
      () => parseProjectMarkerFromText('<!-- yz-bridge-project:unknown-project -->', { registry }),
      /Unknown projectId/,
    );
  });
});

test('GitHub routing precedence: marker > repo > legacy default', async () => {
  await withTempRegistry([
    {
      id: 'rent-a-car',
      displayName: 'Rent_a_Car',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      enabled: true,
    },
    {
      id: 'glasses',
      displayName: 'Glasses',
      workspaceRoot: 'C:\\Users\\Yaniv\\source\\repos\\Glasses',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      enabled: true,
    },
  ], async (file) => {
    const registry = loadProjectRegistry({ filePath: file });
    const marked = resolveTaskProjectIdentity({
      issueBody: '<!-- yz-bridge-project:glasses -->',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      registry,
    });
    assert.equal(marked.source, 'marker');
    assert.equal(marked.projectId, 'glasses');

    const fromRepo = resolveTaskProjectIdentity({
      issueBody: 'Do work',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      registry,
    });
    assert.equal(fromRepo.source, 'github-repo');
    assert.equal(fromRepo.projectId, 'glasses');

    const legacy = resolveTaskProjectIdentity({
      issueBody: 'Do work',
      githubRepo: null,
      registry,
    });
    assert.equal(legacy.source, 'legacy-default');
    assert.equal(legacy.projectId, 'rent-a-car');
  });
});

test('issue mapper never accepts free-form path project selection', () => {
  const mapped = mapGithubIssueToLocalInput({
    number: 9,
    title: '[YZ-BRIDGE] Path inject',
    body: 'project: C:\\evil\nworkspace: D:\\other\nDo not trust this.',
    html_url: 'https://github.com/yanivzohar1971-cmd/Rent-a-Car/issues/9',
  }, {
    repo: 'yanivzohar1971-cmd/Rent-a-Car',
    project: 'Rent_a_Car',
    projectId: 'rent-a-car',
  });
  assert.equal(mapped.projectId, 'rent-a-car');
  assert.equal(mapped.projectRoutingError, null);
  assert.match(mapped.instructions, /C:\\evil/);
});

test('issue mapper honors explicit project marker', () => {
  const mapped = mapGithubIssueToLocalInput({
    number: 10,
    title: '[YZ-BRIDGE] Glasses via marker',
    body: '<!-- yz-bridge-project:glasses -->\nHarmless verification only.',
    html_url: 'https://github.com/yanivzohar1971-cmd/Rent-a-Car/issues/10',
  }, {
    repo: 'yanivzohar1971-cmd/Rent-a-Car',
    project: 'Rent_a_Car',
    projectId: 'rent-a-car',
  });
  assert.equal(mapped.projectId, 'glasses');
  assert.equal(mapped.project, 'Glasses');
  assert.equal(mapped.projectResolutionSource, 'marker');
});

test('repo+issue dedupe prevents collisions across repositories', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-dedupe-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'));
    const first = await store.importGithubTask({
      githubIssueNumber: '31',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      githubIssueTitle: 'A',
      projectId: 'rent-a-car',
      title: 'A',
      instructions: 'A',
    });
    const second = await store.importGithubTask({
      githubIssueNumber: '31',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      githubIssueTitle: 'B',
      projectId: 'glasses',
      title: 'B',
      instructions: 'B',
    });
    assert.equal(first.created, true);
    assert.equal(second.created, true);
    assert.notEqual(first.task.id, second.task.id);
    const again = await store.importGithubTask({
      githubIssueNumber: '31',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      githubIssueTitle: 'A',
      projectId: 'rent-a-car',
      title: 'A',
      instructions: 'A',
    });
    assert.equal(again.created, false);
    assert.equal(again.task.id, first.task.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('task workspace resolves from registry and rejects missing roots', async () => {
  const missingRoot = join(tmpdir(), `yz-missing-ws-${Date.now()}`);
  await withTempRegistry([
    {
      id: 'ghost',
      displayName: 'Ghost',
      workspaceRoot: missingRoot,
      githubRepo: 'owner/Ghost',
      enabled: true,
    },
  ], async (file) => {
    const registry = loadProjectRegistry({ filePath: file });
    assert.throws(
      () => resolveTaskWorkspace({
        projectId: 'ghost',
        project: 'Ghost',
        metadata: {},
      }, { registry, requireExists: true }),
      /does not exist/,
    );
  });
});

test('rent-a-car and glasses tasks resolve distinct trusted workspaces', () => {
  const rent = resolveTaskWorkspace({
    projectId: 'rent-a-car',
    project: 'Rent_a_Car',
    metadata: {},
  });
  const glasses = resolveTaskWorkspace({
    projectId: 'glasses',
    project: 'Glasses',
    metadata: {},
  }, { requireExists: false });
  assert.match(rent.workspaceRoot, /Rent_a_Car$/i);
  assert.match(glasses.workspaceRoot, /Glasses$/i);
  assert.notEqual(rent.workspaceRoot.toLowerCase(), glasses.workspaceRoot.toLowerCase());
});

test('ensureProjectAgentBridgeConfigs provisions scoped MCP+CLI without blanket permissions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-mcp-provision-'));
  try {
    await mkdir(join(dir, 'nested'), { recursive: true });
    const result = ensureProjectAgentBridgeConfigs({ workspacePath: dir });
    assert.ok(result.mcp.path.endsWith(`${join('.cursor', 'mcp.json')}`) || result.mcp.path.includes('.cursor'));
    assert.ok(result.cli.allowPatterns.every((pattern) => !/Mcp\(\*\)$/i.test(pattern)));
    assertNoBlanketCliPermissions(result.cli.allowPatterns);
    const merged = mergeTrustedBridgeMcpConfig({
      mcpServers: { other: { command: 'echo' } },
    });
    assert.ok(merged.mcpServers.other);
    assert.equal(merged.mcpServers['yz-dev-bridge'].command, 'node');
    assert.match(merged.mcpServers['yz-dev-bridge'].args[0], /stdio\.js$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
