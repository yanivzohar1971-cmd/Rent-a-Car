import { GithubClient, resolveGithubToken } from '../src/github/githubClient.js';
import { loadGithubRelayConfig } from '../src/github/githubRelayConfig.js';

const config = loadGithubRelayConfig();
const token = await resolveGithubToken(config);
const client = new GithubClient({ repo: config.repo, token });
const issue = await client.request('GET', `/repos/${config.repo}/issues/4`);
const comments = await client.listComments(4);
console.log(JSON.stringify({
  number: issue.number,
  state: issue.state,
  commentCount: comments.length,
  hasAck: comments.some((c) => String(c.body).includes('yz-bridge-ack:TASK-00008')),
  hasResult: comments.some((c) => String(c.body).includes('yz-bridge-result:TASK-00008')),
}));
