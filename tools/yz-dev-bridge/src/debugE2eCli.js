import { E2eDebugStore, formatDebugSummaryText } from './e2eDebug.js';

async function main() {
  const taskId = String(process.argv[2] || '').trim();
  if (!taskId) {
    console.error('Usage: npm run debug:e2e -- TASK-00018');
    process.exit(1);
  }

  const store = new E2eDebugStore();
  const debug = await store.read(taskId);
  if (!debug) {
    console.error(`No E2E debug file found for ${taskId}`);
    process.exit(1);
  }

  console.log(formatDebugSummaryText(debug));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
