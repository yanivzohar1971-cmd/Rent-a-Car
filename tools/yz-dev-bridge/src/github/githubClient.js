import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const API_VERSION = '2022-11-28';

export class GithubHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GithubHttpError';
    this.status = status;
    this.retryable = status >= 500 || status === 429;
  }
}

function candidateGhPaths() {
  return [
    process.env.YZ_BRIDGE_GH_PATH,
    'gh',
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
    `${process.env.LOCALAPPDATA || ''}\\GitHub CLI\\gh.exe`,
  ].filter(Boolean);
}

export function resolveGhPath({ existsImpl = existsSync } = {}) {
  for (const candidate of candidateGhPaths()) {
    if (candidate === 'gh') return candidate;
    if (existsImpl(candidate)) return candidate;
  }
  return null;
}

export function readTokenFromGh({ spawnSyncImpl = spawnSync, ghPath = resolveGhPath() } = {}) {
  if (!ghPath) return '';
  const result = spawnSyncImpl(ghPath, ['auth', 'token'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

export function readTokenFromGitCredential({ spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
  if (result.status !== 0) return '';
  const match = String(result.stdout || '').match(/^password=(.+)$/m);
  return match ? match[1].trim() : '';
}

export async function resolveGithubToken(config = {}, deps = {}) {
  if (config.token) return config.token;
  const fromGh = (deps.readTokenFromGh || readTokenFromGh)();
  if (fromGh) return fromGh;
  const fromGit = (deps.readTokenFromGitCredential || readTokenFromGitCredential)();
  if (fromGit) return fromGit;
  throw new Error('GitHub authentication is unavailable. Install GitHub CLI (`gh auth login`) or set YZ_BRIDGE_GITHUB_TOKEN.');
}

export class GithubClient {
  constructor({
    repo,
    token,
    fetchImpl = fetch,
    apiBase = 'https://api.github.com',
  }) {
    this.repo = repo;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(method, path, body) {
    const res = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'user-agent': 'yz-dev-bridge',
        'x-github-api-version': API_VERSION,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.message || `GitHub HTTP ${res.status}`;
      throw new GithubHttpError(res.status, message);
    }
    return json;
  }

  async listOpenIssues() {
    return this.request('GET', `/repos/${this.repo}/issues?state=open&per_page=50`);
  }

  async listComments(issueNumber) {
    return this.request('GET', `/repos/${this.repo}/issues/${issueNumber}/comments?per_page=100`);
  }

  async addComment(issueNumber, body) {
    return this.request('POST', `/repos/${this.repo}/issues/${issueNumber}/comments`, { body });
  }

  async closeIssue(issueNumber) {
    return this.request('PATCH', `/repos/${this.repo}/issues/${issueNumber}`, { state: 'closed' });
  }

  async addLabel(issueNumber, label) {
    return this.request('POST', `/repos/${this.repo}/issues/${issueNumber}/labels`, { labels: [label] });
  }

  async createIssue({ title, body }) {
    return this.request('POST', `/repos/${this.repo}/issues`, { title, body });
  }
}
