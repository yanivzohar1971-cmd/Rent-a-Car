import { BridgeStore, isTaskEligibleForAgentLaunch, isAgentActiveForProjectTask } from '../src/store.js';
import { hydrateTaskProjectFields } from '../src/projects/projectRegistry.js';

const store = new BridgeStore(new URL('../data/bridge.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// Windows path fix for file URL
const file = process.argv[2] || 'C:/Users/Yaniv/source/repos/Rent_a_Car/tools/yz-dev-bridge/data/bridge.json';
const live = new BridgeStore(file);
const tasks = await live.listTasks({ limit: 200 });
const counts = {};
const rows = [];
for (const t of tasks) {
  counts[t.status] = (counts[t.status] || 0) + 1;
  const m = t.metadata || {};
  const h = hydrateTaskProjectFields(t);
  rows.push({
    id: t.id,
    status: t.status,
    projectId: h.projectId,
    source: m.source || null,
    repo: m.githubRepo || null,
    issue: m.githubIssueNumber || null,
    createdAt: t.createdAt,
    claimedBy: t.claimedBy,
    claimedAt: t.claimedAt,
    launchStarted: Boolean(m.agentLaunchStartedAt),
    launched: Boolean(m.agentLaunchedAt),
    hasSession: Boolean(m.agentSession?.pid),
    eligible: isTaskEligibleForAgentLaunch(t),
    active: isAgentActiveForProjectTask(t),
    cleanupReason: m.cleanupReason || null,
    terminal: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status),
  });
}
console.log(JSON.stringify({
  total: tasks.length,
  counts,
  eligible: rows.filter((r) => r.eligible),
  active: rows.filter((r) => r.active),
  nonTerminalGithub: rows.filter((r) => !r.terminal && r.issue),
  known: rows.filter((r) => ['TASK-00038', 'TASK-00039', 'TASK-00040', 'TASK-00042', 'TASK-00043'].includes(r.id)),
  dups: (() => {
    const byKey = new Map();
    for (const r of rows.filter((x) => x.issue)) {
      const key = `${String(r.repo || '').toLowerCase()}#${r.issue}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(`${r.id}:${r.status}`);
    }
    return [...byKey.entries()].filter(([, v]) => v.length > 1);
  })(),
}, null, 2));
