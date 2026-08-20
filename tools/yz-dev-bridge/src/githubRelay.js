import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { BridgeStore } from './store.js';
import { GithubClient, resolveGithubToken } from './github/githubClient.js';
import {
  assertGithubRelayConfig,
  buildGithubRelayRepoTargets,
  loadGithubRelayConfig,
  redactGithubRelayConfig,
} from './github/githubRelayConfig.js';
import { GithubInboxWorker } from './github/githubInboxWorker.js';
import {
  printStartupBanner,
  resolveGithubRelayBannerStatuses,
} from './github/startupBanner.js';
import {
  isRelayRawLogsEnabled,
  printRelayConfigCard,
  printRelayStatusCard,
} from './github/relayCards.js';

const require = createRequire(import.meta.url);
const { version: bridgeVersion } = require('../package.json');

const config = loadGithubRelayConfig();
assertGithubRelayConfig(config);

const bootStatuses = resolveGithubRelayBannerStatuses({
  config,
  githubRelayOnline: false,
});

printStartupBanner({
  project: config.project,
  workspacePath: config.workspacePath,
  autoLaunch: config.autoLaunch,
  version: bridgeVersion,
  githubRelayStatus: bootStatuses.githubRelayStatus,
  cursorAgentStatus: bootStatuses.cursorAgentStatus,
  cursorAgentDetail: bootStatuses.cursorAgentDetail,
  mcpStatus: bootStatuses.mcpStatus,
  firebaseStatus: bootStatuses.firebaseStatus,
});

printRelayConfigCard(config);
if (isRelayRawLogsEnabled()) {
  console.error('YZ Dev Bridge GitHub relay configuration:', JSON.stringify(redactGithubRelayConfig(config)));
  console.error('GitHub issue text is never executed as a shell command.');
  console.error('Visible local Cursor Agent auto-launch:', config.autoLaunch);
}

const token = await resolveGithubToken(config);
const store = new BridgeStore();
const targets = buildGithubRelayRepoTargets(config);
const workers = [];

for (const target of targets) {
  if (!existsSync(target.workspaceRoot)) {
    console.error(`YZ Dev Bridge: skipping GitHub poll for ${target.githubRepo}; workspace missing: ${target.workspaceRoot}`);
    continue;
  }
  const client = new GithubClient({ repo: target.githubRepo, token });
  const workerConfig = {
    ...config,
    repo: target.githubRepo,
    project: target.displayName,
    projectId: target.projectId,
    workspacePath: target.workspaceRoot,
    ownsLegacyGithubTasks: target.projectId === 'rent-a-car',
  };
  const worker = new GithubInboxWorker({
    client,
    store,
    config: workerConfig,
    logger: console,
  });
  workers.push({ worker, target });
}

if (workers.length === 0) {
  throw new Error('No GitHub relay repository targets are available to poll');
}

function shutdown(signal) {
  console.error(`YZ Dev Bridge GitHub relay received ${signal}; shutting down.`);
  for (const entry of workers) entry.worker.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const entry of workers) {
  await entry.worker.start();
}
// ONLINE only after polling actually starts successfully.
printRelayStatusCard({ status: 'ONLINE' });
if (isRelayRawLogsEnabled()) {
  console.error(
    `YZ Dev Bridge GitHub relay polling ${workers.map((entry) => entry.target.githubRepo).join(', ')} every ${config.intervalMs}ms.`,
  );
}
