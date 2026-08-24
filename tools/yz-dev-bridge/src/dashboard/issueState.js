import { resolveGithubIssueCardState } from '../github/relayCards.js';

function numbersForTask(task, openIssueNumbersByRepo) {
  const repo = String(task?.metadata?.githubRepo || '').trim().toLowerCase();
  if (!openIssueNumbersByRepo || typeof openIssueNumbersByRepo !== 'object') return null;
  if (repo && Array.isArray(openIssueNumbersByRepo[repo])) {
    return new Set(openIssueNumbersByRepo[repo].map((value) => String(value)));
  }
  // Case-preserving keys from runtime file.
  for (const [key, numbers] of Object.entries(openIssueNumbersByRepo)) {
    if (String(key).trim().toLowerCase() === repo && Array.isArray(numbers)) {
      return new Set(numbers.map((value) => String(value)));
    }
  }
  return null;
}

/**
 * Authoritative GitHub issue visual state.
 * Never invents OPEN from stale local metadata.
 * @returns {'OPEN'|'CLOSED'|'UNKNOWN'}
 */
export function resolveDashboardIssueState(task, {
  openIssueNumbersByRepo = null,
  openIssuesKnown = false,
  closedByRelay = false,
} = {}) {
  const repoSet = numbersForTask(task, openIssueNumbersByRepo);
  const known = Boolean(openIssuesKnown) || repoSet != null;
  const raw = resolveGithubIssueCardState(task, {
    openIssueNumbers: repoSet,
    openIssuesKnown: known && repoSet != null,
    closedByRelay,
  });
  if (raw === 'open') return 'OPEN';
  if (raw === 'closed') return 'CLOSED';
  return 'UNKNOWN';
}

export function issueStateFromExplicit(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'OPEN' || normalized === 'CLOSED' || normalized === 'UNKNOWN') return normalized;
  return 'UNKNOWN';
}
