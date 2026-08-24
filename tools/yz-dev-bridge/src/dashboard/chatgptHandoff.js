/**
 * Server-side ChatGPT handoff client for the local Supervisor.
 * Uses FirebaseRelayClient with the bearer token — never expose that to the browser.
 */
import { FirebaseRelayClient, RelayHttpError } from '../relay/firebaseRelayClient.js';
import { loadRelayConfig, redactConfig } from '../relay/relayConfig.js';

const DURATION_PRESETS = {
  '1h': 3600,
  '24h': 86400,
  '7d': 604800,
};

export function sessionDurationSecondsFromPreset(preset = '24h') {
  const key = String(preset || '24h').trim().toLowerCase();
  return DURATION_PRESETS[key] || DURATION_PRESETS['24h'];
}

export function userFacingHandoffError(error) {
  if (!error) return { message: 'Unable to create handoff', detail: null };
  const code = error.code || error.status;
  const raw = String(error.message || error);
  if (code === 'not_configured' || /not configured/i.test(raw)) {
    return { message: 'ChatGPT handoff service not configured', detail: raw };
  }
  if (error.status === 401 || code === 'unauthorized') {
    return { message: 'Firebase Bridge unavailable', detail: 'Authentication with Firebase Bridge failed' };
  }
  if (error.status === 410 || code === 'expired') {
    return { message: 'Handoff expired — create a new one', detail: raw };
  }
  if (error.status === 409 || code === 'already_used') {
    return { message: 'Handoff already used — create a new one', detail: raw };
  }
  if (error.status === 429 || code === 'rate_limited') {
    return { message: 'Too many handoff requests — try again shortly', detail: raw };
  }
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network/i.test(raw)) {
    return { message: 'Firebase Bridge unavailable', detail: raw };
  }
  return { message: 'Unable to create handoff', detail: raw };
}

export function createChatGptHandoffService({
  env = process.env,
  fetchImpl = fetch,
  client = null,
} = {}) {
  const config = loadRelayConfig(env);
  const configured = Boolean(config.apiUrl && config.token);
  const relay = client || (configured
    ? new FirebaseRelayClient({
      apiUrl: config.apiUrl,
      token: config.token,
      agentId: config.agentId,
      fetchImpl,
      retries: 2,
    })
    : null);

  return {
    isConfigured() {
      return Boolean(relay);
    },

    configSummary() {
      return {
        configured: Boolean(relay),
        ...redactConfig(config),
      };
    },

    async createHandoff({ durationPreset = '24h', label = null } = {}) {
      if (!relay) {
        const err = new Error('ChatGPT handoff service not configured');
        err.code = 'not_configured';
        throw err;
      }
      const sessionDurationSeconds = sessionDurationSecondsFromPreset(durationPreset);
      return relay.requestWithRetry('POST', '/admin/chatgpt/handoffs', {
        sessionDurationSeconds,
        label,
      });
    },

    async listSessions() {
      if (!relay) {
        const err = new Error('ChatGPT handoff service not configured');
        err.code = 'not_configured';
        throw err;
      }
      return relay.requestWithRetry('GET', '/admin/chatgpt/sessions');
    },

    async revokeSession(sessionId) {
      if (!relay) {
        const err = new Error('ChatGPT handoff service not configured');
        err.code = 'not_configured';
        throw err;
      }
      return relay.requestWithRetry(
        'POST',
        `/admin/chatgpt/sessions/${encodeURIComponent(sessionId)}/revoke`,
        {},
      );
    },

    async revokeAllSessions() {
      if (!relay) {
        const err = new Error('ChatGPT handoff service not configured');
        err.code = 'not_configured';
        throw err;
      }
      return relay.requestWithRetry('POST', '/admin/chatgpt/sessions/revoke-all', {});
    },
  };
}

export { RelayHttpError, DURATION_PRESETS };
