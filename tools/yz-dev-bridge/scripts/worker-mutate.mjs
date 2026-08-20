import { BridgeStore } from '../src/store.js';

const [file, prefix, countText] = process.argv.slice(2);
const count = Number(countText) || 1;
const store = new BridgeStore(file);
for (let index = 0; index < count; index += 1) {
  await store.createTask({
    project: 'rent-a-car',
    title: `${prefix}-${index}`,
    instructions: `Created from child process ${prefix}`,
  });
}
process.stdout.write(`ok:${prefix}:${count}\n`);
