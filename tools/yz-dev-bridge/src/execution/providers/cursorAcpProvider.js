import { spawn } from 'node:child_process';
import { PROVIDER_IDS, normalizeProviderEvent, PROVIDER_EVENTS } from '../types.js';

/**
 * Cursor ACP provider — separate optional adapter.
 * If `agent acp` is unavailable, probe reports that without blocking V2.
 */
export function createCursorAcpProvider({
  enabled = false,
  spawnImpl = spawn,
  detectCommand = detectAgentAcp,
} = {}) {
  return {
    id: PROVIDER_IDS.CURSOR_ACP,
    async probe() {
      const detection = await detectCommand({ spawnImpl });
      if (!enabled) {
        return {
          available: false,
          detected: detection.detected,
          reason: detection.detected ? 'ACP_DISABLED_BY_FLAG' : detection.reason,
          workerIsolated: true,
        };
      }
      return {
        available: detection.detected,
        detected: detection.detected,
        reason: detection.detected ? null : detection.reason,
        workerIsolated: true,
        transport: 'stdio-json-rpc',
      };
    },
    async start() {
      if (!enabled) throw new Error('cursor-acp provider is disabled (feature flag)');
      const probe = await this.probe();
      if (!probe.available) throw new Error(`cursor-acp unavailable: ${probe.reason}`);
      // Full ACP session wiring is behind flag; spike returns structured unavailable until canary.
      throw new Error('cursor-acp start not enabled for production; use isolated canary worker');
    },
    async resume() {
      throw new Error('cursor-acp resume not available');
    },
    async sendFollowUp() {
      throw new Error('cursor-acp sendFollowUp not available');
    },
    async cancel() {
      return { cancelled: false, reason: 'not-started' };
    },
    async dispose() {
      return { disposed: true };
    },
    normalizeEvent(native, ctx) {
      return normalizeProviderEvent(native, { provider: PROVIDER_IDS.CURSOR_ACP, ...ctx });
    },
  };
}

export async function detectAgentAcp({ spawnImpl = spawn, timeoutMs = 2500 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let child;
    try {
      child = spawnImpl('agent', ['acp', '--help'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (error) {
      finish({
        detected: false,
        reason: error?.code === 'ENOENT' ? 'ACP_CLI_NOT_FOUND' : 'ACP_SPAWN_FAILED',
      });
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      finish({ detected: false, reason: 'ACP_PROBE_TIMEOUT' });
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({
        detected: false,
        reason: error?.code === 'ENOENT' ? 'ACP_CLI_NOT_FOUND' : 'ACP_SPAWN_FAILED',
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      // Any clean spawn that finds the binary counts as detected for capability reporting.
      finish({
        detected: code === 0 || code === 1,
        reason: code === 0 || code === 1 ? null : `ACP_EXIT_${code}`,
      });
    });
  });
}

export async function probeCursorAcp() {
  return createCursorAcpProvider({ enabled: false }).probe();
}
