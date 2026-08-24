import { createRequire } from 'node:module';
import { PROVIDER_IDS, normalizeProviderEvent, PROVIDER_EVENTS } from '../types.js';

const require = createRequire(import.meta.url);

/**
 * Cursor SDK provider — opt-in only. Isolated behind worker in production use.
 * This module probes capability and refuses to run when feature flag is off.
 */
export function createCursorSdkProvider({
  enabled = false,
  workerManagerFactory = null,
} = {}) {
  return {
    id: PROVIDER_IDS.CURSOR_SDK,
    async probe() {
      let version = null;
      let available = false;
      let reason = null;
      try {
        // Optional dependency — may be absent until Phase 5 install.
        const pkg = require('@cursor/sdk/package.json');
        version = pkg.version || null;
        available = true;
      } catch {
        reason = 'SDK_PACKAGE_NOT_INSTALLED';
      }
      if (!enabled) {
        return {
          available: false,
          installed: Boolean(version),
          version,
          reason: reason || 'SDK_DISABLED_BY_FLAG',
          workerIsolated: true,
        };
      }
      return {
        available,
        installed: Boolean(version),
        version,
        reason: available ? null : reason,
        workerIsolated: true,
        runtime: 'local',
        note: 'Long-lived idle SDK hosts are unreliable on Windows; workers are short-lived.',
      };
    },
    async start(task, project, executionContext = {}) {
      if (!enabled) {
        throw new Error('cursor-sdk provider is disabled (feature flag)');
      }
      if (!workerManagerFactory) {
        throw new Error('cursor-sdk requires workerManagerFactory (never embed SDK in Supervisor)');
      }
      const probe = await this.probe();
      if (!probe.available) {
        throw new Error(`cursor-sdk unavailable: ${probe.reason}`);
      }
      // Real Agent.create happens inside the worker process only.
      const manager = workerManagerFactory();
      manager.start({
        provider: PROVIDER_IDS.CURSOR_SDK,
        taskId: task.id,
        executionId: executionContext.executionId,
      });
      const response = await manager.request({
        type: 'START',
        prompt: executionContext.prompt || task.instructions,
        workspaceRoot: project.workspaceRoot,
      });
      return {
        executionId: executionContext.executionId,
        provider: PROVIDER_IDS.CURSOR_SDK,
        worker: manager,
        providerAgentId: response.providerAgentId || null,
        providerRunId: response.providerRunId || null,
        mutatedWorkspace: false,
        event: { type: PROVIDER_EVENTS.RUN_STARTED },
      };
    },
    async resume() {
      throw new Error('cursor-sdk resume requires a fresh worker + providerAgentId');
    },
    async sendFollowUp() {
      throw new Error('cursor-sdk sendFollowUp requires an active worker');
    },
    async cancel(session) {
      if (session?.worker) await session.worker.dispose({ reason: 'cancel' });
      return { cancelled: true };
    },
    async dispose(session) {
      if (session?.worker) await session.worker.dispose({ reason: 'dispose' });
      return { disposed: true };
    },
    normalizeEvent(native, ctx) {
      return normalizeProviderEvent(native, { provider: PROVIDER_IDS.CURSOR_SDK, ...ctx });
    },
  };
}

/**
 * Capability probe usable from CLI without enabling the provider.
 */
export async function probeCursorSdk() {
  return createCursorSdkProvider({ enabled: false }).probe();
}
