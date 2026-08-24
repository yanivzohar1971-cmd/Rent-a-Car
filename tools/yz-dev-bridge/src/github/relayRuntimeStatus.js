/**
 * Compact GitHub-relay runtime status sidecar.
 * Fail-soft instrumentation for the dashboard — never affects tick success.
 * Does not store tokens, nonces, or issue bodies.
 */

import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseJsonBomSafe } from '../jsonBom.js';
import { renameWithRetry, sanitizeStoreErrorReason } from '../store.js';

export const RELAY_RUNTIME_FILENAME = 'relay-runtime.json';

export function relayRuntimePathForStore(storeFilePath) {
  return resolve(dirname(storeFilePath), RELAY_RUNTIME_FILENAME);
}

export function buildRelayRuntimeStatus({
  pid = process.pid,
  repo = null,
  repos = [],
  lastPollAt = null,
  nextPollAt = null,
  intervalMs = null,
  eligibleIssueCount = null,
  openIssueNumbersByRepo = {},
  lastError = null,
  errorCount = 0,
  online = true,
} = {}) {
  const repoList = Array.isArray(repos) && repos.length
    ? repos.map((item) => String(item)).filter(Boolean)
    : (repo ? [String(repo)] : []);
  const openMap = {};
  if (openIssueNumbersByRepo && typeof openIssueNumbersByRepo === 'object') {
    for (const [key, numbers] of Object.entries(openIssueNumbersByRepo)) {
      const list = Array.isArray(numbers) ? numbers.map((value) => String(value)) : [];
      openMap[String(key)] = list.slice(0, 200);
    }
  }
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    online: Boolean(online),
    repos: repoList,
    lastPollAt: lastPollAt ? String(lastPollAt) : null,
    nextPollAt: nextPollAt ? String(nextPollAt) : null,
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : null,
    eligibleIssueCount: Number.isFinite(eligibleIssueCount) ? eligibleIssueCount : null,
    openIssueNumbersByRepo: openMap,
    lastError: lastError ? sanitizeStoreErrorReason(lastError) : null,
    errorCount: Number.isFinite(errorCount) ? errorCount : 0,
  };
}

export async function writeRelayRuntimeStatus(filePath, status) {
  if (!filePath) return { written: false };
  const absolute = resolve(filePath);
  const payload = `${JSON.stringify(status, null, 2)}\n`;
  await mkdir(dirname(absolute), { recursive: true });
  const tmp = `${absolute}.${process.pid}.tmp`;
  let handle;
  try {
    handle = await open(tmp, 'w');
    await handle.writeFile(payload, 'utf8');
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
  try {
    await renameWithRetry(tmp, absolute);
    return { written: true, filePath: absolute };
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

export async function readRelayRuntimeStatus(filePath) {
  if (!filePath) return null;
  try {
    const raw = await readFile(resolve(filePath), 'utf8');
    const parsed = parseJsonBomSafe(raw, { source: filePath });
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return null;
  }
}

export async function publishRelayRuntimeStatus(filePath, status) {
  try {
    const existing = await readRelayRuntimeStatus(filePath);
    const mergedRepos = [...new Set([
      ...(Array.isArray(existing?.repos) ? existing.repos : []),
      ...(Array.isArray(status.repos) ? status.repos : []),
    ])];
    const mergedOpen = {
      ...(existing?.openIssueNumbersByRepo || {}),
      ...(status.openIssueNumbersByRepo || {}),
    };
    const merged = {
      ...status,
      repos: mergedRepos,
      openIssueNumbersByRepo: mergedOpen,
      errorCount: Math.max(Number(existing?.errorCount) || 0, Number(status.errorCount) || 0),
      lastError: status.lastError || existing?.lastError || null,
    };
    return await writeRelayRuntimeStatus(filePath, merged);
  } catch {
    return { written: false };
  }
}
