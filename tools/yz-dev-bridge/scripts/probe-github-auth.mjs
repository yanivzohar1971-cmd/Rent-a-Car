import { resolveGithubToken } from '../src/github/githubClient.js';
import { loadGithubRelayConfig } from '../src/github/githubRelayConfig.js';

const config = loadGithubRelayConfig();
try {
  const token = await resolveGithubToken(config);
  console.log(JSON.stringify({
    ok: true,
    tokenLength: token.length,
    tokenConfiguredInEnv: Boolean(config.token),
  }));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
}
