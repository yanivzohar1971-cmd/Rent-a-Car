import {
  PROVIDER_IDS,
  PROVIDER_EVENTS,
  createExecutionId,
  normalizeProviderEvent,
} from '../types.js';

/**
 * Wraps the existing visible Cursor Agent launcher as a V2 provider.
 * Behavior matches V1; no SDK/ACP involvement.
 */
export function createLegacyExecutionProvider({
  launcher = null,
  id = PROVIDER_IDS.LEGACY,
} = {}) {
  return {
    id,
    async probe() {
      return {
        available: true,
        provider: id,
        kind: 'legacy-visible-agent',
        workerIsolated: false,
      };
    },
    async start(task, project, executionContext = {}) {
      const executionId = executionContext.executionId || createExecutionId();
      const workspaceRoot = executionContext.workspaceRoot
        || project?.workspaceRoot
        || null;
      if (!workspaceRoot) {
        throw new Error('legacy provider requires registered workspaceRoot');
      }
      if (!launcher?.launch) {
        // Dry/fixture path: report started without spawning.
        if (executionContext.dryRun) {
          return {
            executionId,
            provider: id,
            dryRun: true,
            mutatedWorkspace: false,
            event: { type: PROVIDER_EVENTS.RUN_STARTED },
          };
        }
        throw new Error('legacy provider launcher.launch is required');
      }

      const launched = await launcher.launch({
        taskId: task.id,
        workspacePath: workspaceRoot,
        agentPath: executionContext.agentPath,
        keepWindowOpen: executionContext.keepWindowOpen,
        ...executionContext.launchOptions,
      });

      return {
        executionId,
        provider: id,
        providerAgentId: launched?.sessionNonce || launched?.pid || null,
        providerRunId: launched?.sessionFile || null,
        mutatedWorkspace: false, // launch itself is not a workspace mutation
        launch: {
          method: launched?.method || null,
          file: launched?.file || null,
          pid: launched?.pid || null,
        },
        event: { type: PROVIDER_EVENTS.RUN_STARTED },
      };
    },
    async resume() {
      throw new Error('legacy provider does not support resume; relaunch via start');
    },
    async sendFollowUp() {
      throw new Error('legacy provider does not support sendFollowUp');
    },
    async cancel() {
      return { cancelled: false, reason: 'legacy-visible-agent-cancel-not-supported' };
    },
    async dispose() {
      return { disposed: true };
    },
    normalizeEvent(nativeEvent, ctx) {
      return normalizeProviderEvent(nativeEvent, { provider: id, ...ctx });
    },
  };
}
