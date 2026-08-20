import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function getBridgeRoot() {
  return BRIDGE_ROOT;
}

export function loadDotEnv(filePath = resolve(BRIDGE_ROOT, '.env')) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function loadRelayConfig(env = process.env) {
  const intervalRaw = Number(env.YZ_BRIDGE_RELAY_INTERVAL_MS);
  return {
    apiUrl: String(env.YZ_BRIDGE_FIREBASE_API_URL || '').trim().replace(/\/$/, ''),
    token: String(env.YZ_BRIDGE_API_TOKEN || '').trim(),
    agentId: String(env.YZ_BRIDGE_AGENT_ID || 'local-yz-dev-bridge').trim() || 'local-yz-dev-bridge',
    project: String(env.YZ_BRIDGE_PROJECT || 'Rent_a_Car').trim() || 'Rent_a_Car',
    intervalMs: Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.max(5000, intervalRaw) : 15_000,
  };
}

export function assertRelayConfig(config) {
  if (!config.apiUrl) {
    throw new Error('YZ_BRIDGE_FIREBASE_API_URL is required for relay mode');
  }
  if (!config.token) {
    throw new Error('YZ_BRIDGE_API_TOKEN is required for relay mode');
  }
}

export function redactConfig(config) {
  return {
    apiUrl: config.apiUrl,
    agentId: config.agentId,
    project: config.project,
    intervalMs: config.intervalMs,
    tokenConfigured: Boolean(config.token),
  };
}
