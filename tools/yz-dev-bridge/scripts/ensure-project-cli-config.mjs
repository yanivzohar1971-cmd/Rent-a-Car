import { ensureProjectAgentCliConfig } from '../src/agent/cursorAgentLauncher.js';

const workspacePath = process.argv[2] || process.cwd();
const result = ensureProjectAgentCliConfig({ workspacePath });
console.log(JSON.stringify({
  ok: true,
  path: result.path,
  created: result.created,
  allowCount: result.allowPatterns.length,
}));
