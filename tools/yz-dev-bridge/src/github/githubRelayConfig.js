import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '../relay/relayConfig.js';
import {
  DEFAULT_LEGACY_PROJECT_ID,
  getProjectRegistry,
  listEnabledGithubProjects,
  resolveProject,
} from '../projects/projectRegistry.js';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function getBridgeRoot() {
  return BRIDGE_ROOT;
}

export function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function loadGithubRelayConfig(env = process.env) {
  if (env === process.env) loadDotEnv();
  const intervalRaw = Number(env.YZ_BRIDGE_GITHUB_POLL_INTERVAL_MS);
  const registry = getProjectRegistry({
    filePath: env.YZ_BRIDGE_PROJECTS_FILE || undefined,
  });
  const defaultProject = resolveProject(
    env.YZ_BRIDGE_PROJECT_ID || env.YZ_BRIDGE_PROJECT || DEFAULT_LEGACY_PROJECT_ID,
    { registry, requireEnabled: true },
  );
  const workspaceOverride = String(env.YZ_BRIDGE_WORKSPACE || '').trim();
  const workspacePath = workspaceOverride || defaultProject.workspaceRoot;
  const repoOverride = String(env.YZ_BRIDGE_GITHUB_REPO || '').trim();

  return {
    repo: repoOverride || defaultProject.githubRepo || 'yanivzohar1971-cmd/Rent-a-Car',
    project: defaultProject.displayName,
    projectId: defaultProject.id,
    allowedAuthor: String(env.YZ_BRIDGE_GITHUB_ALLOWED_AUTHOR || 'yanivzohar1971-cmd').trim() || 'yanivzohar1971-cmd',
    titlePrefix: String(env.YZ_BRIDGE_GITHUB_TITLE_PREFIX || '[YZ-BRIDGE]').trim() || '[YZ-BRIDGE]',
    intervalMs: Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.max(5000, intervalRaw) : 15_000,
    token: String(env.YZ_BRIDGE_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN || '').trim(),
    autoLaunch: parseBoolean(env.YZ_BRIDGE_AGENT_AUTO_LAUNCH, true),
    autoCloseCompleted: parseBoolean(env.YZ_BRIDGE_AGENT_AUTO_CLOSE_COMPLETED, true),
    // Default false: dedicated WT/PowerShell host must exit after wrapper exit 0 so the tab can close.
    // Set YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN=true only for persistent diagnosis of every session.
    keepWindowOpen: parseBoolean(env.YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN, false),
    workspacePath,
    cursorAgentPath: String(env.YZ_BRIDGE_CURSOR_AGENT_PATH || '').trim(),
    taskLabel: String(env.YZ_BRIDGE_GITHUB_TASK_LABEL || 'yz-bridge-task').trim() || 'yz-bridge-task',
    applyLabel: parseBoolean(env.YZ_BRIDGE_GITHUB_APPLY_LABEL, true),
    multiRepoPoll: parseBoolean(env.YZ_BRIDGE_GITHUB_MULTI_REPO, true),
    projectsFile: registry.filePath,
    registryProjects: registry.projects,
  };
}

export function assertGithubRelayConfig(config) {
  if (!config.repo || !config.repo.includes('/')) {
    throw new Error('YZ_BRIDGE_GITHUB_REPO must be owner/name');
  }
  if (!config.projectId) {
    throw new Error('GitHub relay projectId is required');
  }
  // Default project must resolve through the trusted registry.
  resolveProject(config.projectId, { requireEnabled: true });
  if (!existsSync(config.workspacePath)) {
    throw new Error(`Workspace path does not exist: ${config.workspacePath}`);
  }
}

export function buildGithubRelayRepoTargets(config, registry = getProjectRegistry()) {
  if (config.multiRepoPoll === false) {
    return [{
      projectId: config.projectId,
      displayName: config.project,
      githubRepo: config.repo,
      workspaceRoot: config.workspacePath,
    }];
  }
  const enabled = listEnabledGithubProjects(registry);
  if (enabled.length === 0) {
    return [{
      projectId: config.projectId,
      displayName: config.project,
      githubRepo: config.repo,
      workspaceRoot: config.workspacePath,
    }];
  }
  return enabled.map((project) => ({
    projectId: project.id,
    displayName: project.displayName,
    githubRepo: project.githubRepo,
    workspaceRoot: project.workspaceRoot,
  }));
}

export function redactGithubRelayConfig(config) {
  return {
    repo: config.repo,
    project: config.project,
    projectId: config.projectId,
    allowedAuthor: config.allowedAuthor,
    titlePrefix: config.titlePrefix,
    intervalMs: config.intervalMs,
    autoLaunch: config.autoLaunch,
    autoCloseCompleted: config.autoCloseCompleted,
    keepWindowOpen: config.keepWindowOpen,
    workspacePath: config.workspacePath,
    multiRepoPoll: config.multiRepoPoll !== false,
    repos: buildGithubRelayRepoTargets(config).map((item) => item.githubRepo),
    tokenConfigured: Boolean(config.token),
  };
}
