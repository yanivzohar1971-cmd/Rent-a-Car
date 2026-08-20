import { loadDotEnv, loadRelayConfig } from '../src/relay/relayConfig.js';

loadDotEnv();
const config = loadRelayConfig();
const id = process.argv[2];
const search = new URLSearchParams({ key: process.env.YZ_BRIDGE_CHATGPT_KEY, id });
const res = await fetch(`${config.apiUrl}/chatgpt/task?${search.toString()}`);
const json = await res.json();
console.log(JSON.stringify({
  httpStatus: res.status,
  taskId: json.task?.id,
  status: json.task?.status,
  title: json.task?.title,
  hasInstructions: Object.prototype.hasOwnProperty.call(json.task || {}, 'instructions'),
}));
