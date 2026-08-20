import { GithubClient, resolveGithubToken } from '../src/github/githubClient.js';
import { loadGithubRelayConfig } from '../src/github/githubRelayConfig.js';

const config = loadGithubRelayConfig();
const token = await resolveGithubToken(config);
const client = new GithubClient({ repo: config.repo, token });
const created = await client.createIssue({
  title: '[YZ-BRIDGE] Visible local Agent connectivity test',
  body: [
    'Do not modify Rent_a_Car source code. This is a YZ Dev Bridge visible-agent connectivity test only. Claim the task, confirm the repository and MCP connection, run a harmless verification, and complete the Bridge task with a structured summary.',
    '',
    'Return metadata.structuredResult with behaviorChanged=[], behaviorPreserved=["GitHub inbox","Firebase INLINE","Firebase CHUNKS"], tests noting the verification, and nextRecommendedStep="None".',
  ].join('\n'),
});
console.log(JSON.stringify({
  number: created.number,
  html_url: created.html_url,
  title: created.title,
}));
