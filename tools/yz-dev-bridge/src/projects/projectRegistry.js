import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonBomSafe } from '../jsonBom.js';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_PROJECTS_FILE = resolve(BRIDGE_ROOT, 'config', 'projects.json');
export const DEFAULT_LEGACY_PROJECT_ID = 'rent-a-car';
export const PROJECT_MARKER_RE = /<!--\s*yz-bridge-project\s*:\s*([^>\s]+)\s*-->/gi;
const PROJECT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ProjectRegistryError extends Error {
  constructor(message, code = 'PROJECT_REGISTRY_ERROR') {
    super(message);
    this.name = 'ProjectRegistryError';
    this.code = code;
  }
}

export function looksLikeFilesystemPath(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (/^[a-zA-Z]:[\\/]/.test(text)) return true;
  if (text.includes('\\') || text.includes('/')) return true;
  if (text.includes('..')) return true;
  if (text.startsWith('~')) return true;
  return false;
}

export function normalizeProjectIdToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

export function assertSafeProjectIdToken(value, { allowAliasShape = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new ProjectRegistryError('projectId is required', 'PROJECT_ID_REQUIRED');
  }
  if (looksLikeFilesystemPath(raw)) {
    throw new ProjectRegistryError(
      'Arbitrary workspace paths are not accepted as projectId; use a registered logical id',
      'PROJECT_PATH_INJECTION',
    );
  }
  const normalized = normalizeProjectIdToken(raw);
  if (!allowAliasShape && !PROJECT_ID_RE.test(normalized)) {
    throw new ProjectRegistryError(`Invalid projectId: ${raw}`, 'PROJECT_ID_INVALID');
  }
  if (allowAliasShape && !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(raw)) {
    throw new ProjectRegistryError(`Invalid project token: ${raw}`, 'PROJECT_ID_INVALID');
  }
  return normalized;
}

/**
 * Canonicalize a trusted registry workspace path (never from untrusted issue text).
 */
export function canonicalizeWorkspacePath(rawPath, { mustExist = false, existsImpl = existsSync, realpathImpl = realpathSync } = {}) {
  const text = String(rawPath ?? '').trim();
  if (!text) {
    throw new ProjectRegistryError('workspaceRoot is required', 'WORKSPACE_REQUIRED');
  }
  if (!isAbsolute(text)) {
    throw new ProjectRegistryError(`workspaceRoot must be absolute: ${text}`, 'WORKSPACE_NOT_ABSOLUTE');
  }
  if (text.includes('\0')) {
    throw new ProjectRegistryError('workspaceRoot contains NUL', 'WORKSPACE_INVALID');
  }
  let resolved = resolve(text);
  // Reject residual relative segments after resolve (should not happen for absolute inputs).
  const parts = resolved.split(/[\\/]/).filter(Boolean);
  if (parts.includes('..')) {
    throw new ProjectRegistryError(`workspaceRoot escapes after resolve: ${text}`, 'WORKSPACE_ESCAPE');
  }
  if (mustExist && !existsImpl(resolved)) {
    throw new ProjectRegistryError(`Registered workspace does not exist: ${resolved}`, 'WORKSPACE_MISSING');
  }
  if (existsImpl(resolved)) {
    try {
      resolved = realpathImpl(resolved);
    } catch {
      // Keep resolved path when realpath is unavailable (tests / locked volumes).
    }
  }
  // Stable Windows-style comparison form without forcing case folds on the stored value.
  return resolved.endsWith(sep) && resolved.length > 3 ? resolved.slice(0, -1) : resolved;
}

export function workspacePathsEqual(a, b) {
  const left = canonicalizeWorkspacePath(a, { mustExist: false });
  const right = canonicalizeWorkspacePath(b, { mustExist: false });
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function normalizeGithubRepo(value) {
  const repo = String(value ?? '').trim();
  if (!repo) return null;
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new ProjectRegistryError(`Invalid githubRepo: ${repo}`, 'GITHUB_REPO_INVALID');
  }
  return repo;
}

function normalizeAliases(aliases, projectId) {
  const list = Array.isArray(aliases) ? aliases : [];
  const out = [];
  for (const alias of list) {
    const token = String(alias ?? '').trim();
    if (!token) continue;
    if (looksLikeFilesystemPath(token)) {
      throw new ProjectRegistryError(`Alias must not be a path: ${token}`, 'PROJECT_ALIAS_INVALID');
    }
    const normalized = normalizeProjectIdToken(token);
    if (normalized === projectId) continue;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

export function normalizeRegistryProject(raw, { mustExistWorkspace = false } = {}) {
  const id = assertSafeProjectIdToken(raw?.id);
  const displayName = String(raw?.displayName ?? id).trim() || id;
  const workspaceRoot = canonicalizeWorkspacePath(raw?.workspaceRoot, { mustExist: mustExistWorkspace });
  const githubRepo = normalizeGithubRepo(raw?.githubRepo);
  const enabled = raw?.enabled !== false;
  const aliases = normalizeAliases(raw?.aliases, id);
  return {
    id,
    displayName,
    workspaceRoot,
    githubRepo,
    enabled,
    aliases,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {},
  };
}

export function validateRegistryProjects(projects) {
  const list = Array.isArray(projects) ? projects : [];
  const byId = new Map();
  const byAlias = new Map();
  const byRepo = new Map();
  const byWorkspace = new Map();

  for (const project of list) {
    if (byId.has(project.id)) {
      throw new ProjectRegistryError(`Duplicate project id: ${project.id}`, 'DUPLICATE_PROJECT_ID');
    }
    byId.set(project.id, project);

    for (const alias of project.aliases) {
      if (byId.has(alias) || byAlias.has(alias)) {
        throw new ProjectRegistryError(`Duplicate project alias: ${alias}`, 'DUPLICATE_PROJECT_ALIAS');
      }
      byAlias.set(alias, project.id);
    }

    if (project.githubRepo) {
      const key = project.githubRepo.toLowerCase();
      if (byRepo.has(key)) {
        throw new ProjectRegistryError(`Duplicate githubRepo: ${project.githubRepo}`, 'DUPLICATE_GITHUB_REPO');
      }
      byRepo.set(key, project.id);
    }

    const wsKey = process.platform === 'win32'
      ? project.workspaceRoot.toLowerCase()
      : project.workspaceRoot;
    if (byWorkspace.has(wsKey)) {
      throw new ProjectRegistryError(`Duplicate workspaceRoot: ${project.workspaceRoot}`, 'DUPLICATE_WORKSPACE');
    }
    byWorkspace.set(wsKey, project.id);
  }

  return { byId, byAlias, byRepo, byWorkspace };
}

export function loadProjectRegistry({
  filePath = process.env.YZ_BRIDGE_PROJECTS_FILE || DEFAULT_PROJECTS_FILE,
  mustExistWorkspace = false,
  readImpl = readFileSync,
} = {}) {
  const absolute = isAbsolute(filePath) ? filePath : resolve(filePath);
  const raw = parseJsonBomSafe(String(readImpl(absolute, 'utf8')), { source: absolute });
  if (raw?.schemaVersion !== 1) {
    throw new ProjectRegistryError(`Unsupported projects schemaVersion: ${raw?.schemaVersion}`, 'SCHEMA_VERSION');
  }
  const projects = (Array.isArray(raw.projects) ? raw.projects : [])
    .map((item) => normalizeRegistryProject(item, { mustExistWorkspace }));
  const indexes = validateRegistryProjects(projects);
  return {
    filePath: absolute,
    schemaVersion: 1,
    projects,
    ...indexes,
  };
}

let cachedRegistry = null;
let cachedRegistryKey = null;

export function getProjectRegistry(options = {}) {
  const filePath = options.filePath || process.env.YZ_BRIDGE_PROJECTS_FILE || DEFAULT_PROJECTS_FILE;
  const key = `${filePath}::${options.mustExistWorkspace ? '1' : '0'}`;
  if (!options.forceReload && cachedRegistry && cachedRegistryKey === key) {
    return cachedRegistry;
  }
  cachedRegistry = loadProjectRegistry(options);
  cachedRegistryKey = key;
  return cachedRegistry;
}

export function resetProjectRegistryCache() {
  cachedRegistry = null;
  cachedRegistryKey = null;
}

export function findProjectByToken(token, registry = getProjectRegistry()) {
  if (looksLikeFilesystemPath(token)) {
    throw new ProjectRegistryError(
      'Arbitrary workspace paths are not accepted as projectId; use a registered logical id',
      'PROJECT_PATH_INJECTION',
    );
  }
  const normalized = normalizeProjectIdToken(token);
  if (!normalized) return null;
  if (registry.byId.has(normalized)) return registry.byId.get(normalized);
  const viaAlias = registry.byAlias.get(normalized);
  if (viaAlias) return registry.byId.get(viaAlias) || null;
  // Exact displayName match (case-insensitive) for legacy MCP callers using Rent_a_Car.
  const display = [...registry.byId.values()].find(
    (project) => normalizeProjectIdToken(project.displayName) === normalized
      || String(project.displayName).toLowerCase() === String(token).trim().toLowerCase(),
  );
  return display || null;
}

export function resolveProject(token, {
  registry = getProjectRegistry(),
  requireEnabled = true,
} = {}) {
  const project = findProjectByToken(token, registry);
  if (!project) {
    throw new ProjectRegistryError(`Unknown projectId: ${token}`, 'PROJECT_UNKNOWN');
  }
  if (requireEnabled && !project.enabled) {
    throw new ProjectRegistryError(`Project is disabled: ${project.id}`, 'PROJECT_DISABLED');
  }
  return project;
}

export function resolveProjectByGithubRepo(repo, {
  registry = getProjectRegistry(),
  requireEnabled = true,
} = {}) {
  const key = String(repo || '').trim().toLowerCase();
  if (!key) return null;
  const id = registry.byRepo.get(key);
  if (!id) return null;
  const project = registry.byId.get(id);
  if (!project) return null;
  if (requireEnabled && !project.enabled) {
    throw new ProjectRegistryError(`Project is disabled: ${project.id}`, 'PROJECT_DISABLED');
  }
  return project;
}

export function listEnabledGithubProjects(registry = getProjectRegistry()) {
  return registry.projects.filter((project) => project.enabled && project.githubRepo);
}

export function publicProjectView(project, { includeWorkspace = false } = {}) {
  if (!project) return null;
  const view = {
    id: project.id,
    projectId: project.id,
    displayName: project.displayName,
    enabled: Boolean(project.enabled),
    githubRepo: project.githubRepo || null,
    aliases: [...(project.aliases || [])],
  };
  if (includeWorkspace) view.workspaceRoot = project.workspaceRoot;
  return view;
}

/**
 * Parse explicit GitHub issue project markers.
 * Returns { projectId } on success, or throws on malformed/conflicting/unknown markers.
 * Returns null when no marker is present.
 */
export function parseProjectMarkerFromText(text, { registry = getProjectRegistry() } = {}) {
  const body = String(text ?? '');
  const matches = [...body.matchAll(PROJECT_MARKER_RE)].map((match) => String(match[1] || '').trim());
  if (matches.length === 0) return null;

  const normalized = matches.map((token) => {
    if (looksLikeFilesystemPath(token)) {
      throw new ProjectRegistryError(
        'Project marker must be a logical projectId, not a filesystem path',
        'PROJECT_MARKER_PATH',
      );
    }
    return normalizeProjectIdToken(token);
  });

  const unique = [...new Set(normalized)];
  if (unique.length > 1) {
    throw new ProjectRegistryError(
      `Conflicting yz-bridge-project markers: ${unique.join(', ')}`,
      'PROJECT_MARKER_CONFLICT',
    );
  }

  const token = matches[0];
  const project = resolveProject(token, { registry, requireEnabled: true });
  return { projectId: project.id, project, marker: token };
}

/**
 * Precedence:
 * 1) explicit <!-- yz-bridge-project:ID --> marker
 * 2) source GitHub repository -> registry mapping
 * 3) legacy default rent-a-car (only when no marker and no conflicting repo mapping)
 */
export function resolveTaskProjectIdentity({
  issueBody = '',
  githubRepo = null,
  explicitProjectId = null,
  registry = getProjectRegistry(),
  allowLegacyDefault = true,
} = {}) {
  if (explicitProjectId) {
    const project = resolveProject(explicitProjectId, { registry, requireEnabled: true });
    return {
      projectId: project.id,
      project,
      source: 'explicit',
    };
  }

  const marker = parseProjectMarkerFromText(issueBody, { registry });
  if (marker) {
    return {
      projectId: marker.projectId,
      project: marker.project,
      source: 'marker',
    };
  }

  if (githubRepo) {
    const fromRepo = resolveProjectByGithubRepo(githubRepo, { registry, requireEnabled: true });
    if (fromRepo) {
      return {
        projectId: fromRepo.id,
        project: fromRepo,
        source: 'github-repo',
      };
    }
  }

  if (allowLegacyDefault) {
    const legacy = resolveProject(DEFAULT_LEGACY_PROJECT_ID, { registry, requireEnabled: true });
    return {
      projectId: legacy.id,
      project: legacy,
      source: 'legacy-default',
    };
  }

  throw new ProjectRegistryError('Unable to resolve project identity', 'PROJECT_UNRESOLVED');
}

export function legacyProjectIdForTask(task, registry = getProjectRegistry()) {
  if (task?.projectId) {
    try {
      return resolveProject(task.projectId, { registry, requireEnabled: false }).id;
    } catch {
      return normalizeProjectIdToken(task.projectId);
    }
  }
  if (task?.project) {
    const found = findProjectByToken(task.project, registry);
    if (found) return found.id;
  }
  return DEFAULT_LEGACY_PROJECT_ID;
}

export function hydrateTaskProjectFields(task, registry = getProjectRegistry()) {
  if (!task || typeof task !== 'object') return task;
  const projectId = legacyProjectIdForTask(task, registry);
  let project = null;
  try {
    project = resolveProject(projectId, { registry, requireEnabled: false });
  } catch {
    project = null;
  }
  return {
    ...task,
    projectId,
    project: project?.displayName || task.project || projectId,
    projectDisplayName: project?.displayName || task.project || projectId,
  };
}
