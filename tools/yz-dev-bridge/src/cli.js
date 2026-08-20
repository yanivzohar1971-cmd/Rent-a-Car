import { BridgeStore } from './store.js';

const store = new BridgeStore();
const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error(`Usage:\n  node src/cli.js status\n  node src/cli.js list [project] [status]\n  node src/cli.js get TASK-00001\n  node src/cli.js create <project> <title> <instructions> [priority]\n  node src/cli.js claim-next [project]\n  node src/cli.js complete <task-id> <summary>`);
}

async function main() {
  switch (command) {
    case 'status':
      return store.status();
    case 'list':
      return store.listTasks({ project: args[0] || undefined, status: args[1] || undefined });
    case 'get':
      if (!args[0]) throw new Error('task id is required');
      return store.getTask(args[0]);
    case 'create': {
      const [project, title, instructions, priority = 'normal'] = args;
      if (!project || !title || !instructions) throw new Error('project, title and instructions are required');
      return store.createTask({ project, title, instructions, priority, createdBy: 'cli' });
    }
    case 'claim-next':
      return store.claimNextTask({ project: args[0] || undefined, actor: 'cli' });
    case 'complete': {
      const [id, summary] = args;
      if (!id || !summary) throw new Error('task id and summary are required');
      return store.updateTask({ id, status: 'COMPLETED', actor: 'cli', summary });
    }
    default:
      usage();
      process.exitCode = 2;
      return null;
  }
}

try {
  const result = await main();
  if (result !== null) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
