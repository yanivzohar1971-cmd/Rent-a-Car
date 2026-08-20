/**
 * One-time safe backlog cleanup against the live Bridge Store.
 * Cancels non-terminal GitHub-backed tasks whose source issues are not open.
 * Uses empty open sets for trusted repos (GitHub side already cleaned).
 */
import { BridgeStore, isTaskEligibleForAgentLaunch, isAgentActiveForProjectTask } from '../src/store.js';
import { getProjectRegistry } from '../src/projects/projectRegistry.js';

const file = process.argv[2] || new URL('../data/bridge.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const store = new BridgeStore(file);
const registry = getProjectRegistry();

const beforeTasks = await store.listTasks({ limit: 200 });
const beforeCounts = {};
for (const task of beforeTasks) {
  beforeCounts[task.status] = (beforeCounts[task.status] || 0) + 1;
}

const cancelledAll = [];
for (const project of registry.projects.filter((item) => item.enabled && item.githubRepo)) {
  const result = await store.cancelGithubTasksWithClosedSources({
    githubRepo: project.githubRepo,
    openIssueNumbers: [],
    projectId: project.id,
    ownsLegacyGithubTasks: project.id === 'rent-a-car',
  });
  cancelledAll.push({
    repo: project.githubRepo,
    projectId: project.id,
    count: result.count,
    taskIds: result.cancelled.map((item) => item.taskId),
  });
}

const afterTasks = await store.listTasks({ limit: 200 });
const afterCounts = {};
const remainingEligible = [];
const remainingActive = [];
const known = {};
for (const task of afterTasks) {
  afterCounts[task.status] = (afterCounts[task.status] || 0) + 1;
  if (isTaskEligibleForAgentLaunch(task)) remainingEligible.push(task.id);
  if (isAgentActiveForProjectTask(task)) remainingActive.push(task.id);
  if (['TASK-00038', 'TASK-00039', 'TASK-00040', 'TASK-00042', 'TASK-00043'].includes(task.id)) {
    known[task.id] = {
      status: task.status,
      eligible: isTaskEligibleForAgentLaunch(task),
      active: isAgentActiveForProjectTask(task),
      cleanupReason: task.metadata?.cleanupReason || null,
      issue: task.metadata?.githubIssueNumber || null,
      repo: task.metadata?.githubRepo || null,
    };
  }
}

console.log(JSON.stringify({
  file,
  beforeCounts,
  beforeTotal: beforeTasks.length,
  cancelledAll,
  cancelledTotal: cancelledAll.reduce((sum, item) => sum + item.count, 0),
  afterCounts,
  afterTotal: afterTasks.length,
  remainingEligible,
  remainingActive,
  known,
}, null, 2));
