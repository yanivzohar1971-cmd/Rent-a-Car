import {
  ProjectRegistryError,
  resolveTaskProjectIdentity,
} from '../projects/projectRegistry.js';

export function isEligibleGithubIssue(issue, config) {
  if (!issue || issue.pull_request) return false;
  if (String(issue.state || '').toLowerCase() !== 'open') return false;
  const title = String(issue.title || '');
  if (!title.startsWith(config.titlePrefix || '[YZ-BRIDGE]')) return false;
  const login = issue.user?.login || issue.author?.login || '';
  if (login !== config.allowedAuthor) return false;
  return true;
}

/**
 * Map a GitHub issue into local task input.
 * Precedence for project identity:
 * 1) explicit <!-- yz-bridge-project:ID --> marker in issue body
 * 2) source repository -> trusted Project Registry mapping
 * 3) legacy default rent-a-car
 *
 * Never accepts arbitrary filesystem paths from issue text.
 */
export function mapGithubIssueToLocalInput(issue, config, { registry } = {}) {
  const instructions = String(issue.body || '').trim() || String(issue.title || '').trim();
  const githubRepo = String(config.repo || '').trim() || null;
  let projectId = null;
  let project = null;
  let projectResolutionSource = null;
  let projectRoutingError = null;

  try {
    const resolved = resolveTaskProjectIdentity({
      issueBody: issue.body || '',
      githubRepo,
      registry,
      allowLegacyDefault: true,
    });
    projectId = resolved.projectId;
    project = resolved.project.displayName;
    projectResolutionSource = resolved.source;
  } catch (error) {
    projectRoutingError = error instanceof Error ? error.message : String(error);
    // Keep a stable storage identity for failed routing records.
    projectId = config.projectId || 'rent-a-car';
    project = config.project || 'Rent_a_Car';
    projectResolutionSource = 'routing-error';
  }

  return {
    githubIssueNumber: String(issue.number),
    githubIssueUrl: issue.html_url || null,
    githubIssueTitle: String(issue.title || ''),
    githubRepo,
    projectId,
    project,
    title: String(issue.title || '').trim(),
    instructions,
    priority: 'normal',
    createdBy: 'github-relay',
    source: 'github-inbox',
    projectResolutionSource,
    projectRoutingError,
  };
}

export { ProjectRegistryError };
