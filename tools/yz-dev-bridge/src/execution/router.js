import {
  PROVIDER_IDS,
  createExecutionId,
  normalizeProviderEvent,
  resolveProjectExecutionConfig,
} from './types.js';

/**
 * Selects an execution provider. Production default is always legacy
 * unless a project explicitly opts into another mode.
 */
export class ExecutionRouter {
  constructor({
    providers = {},
    featureFlags = {},
  } = {}) {
    this.providers = providers;
    this.featureFlags = {
      v2RouterEnabled: featureFlags.v2RouterEnabled !== false,
      allowSdk: Boolean(featureFlags.allowSdk),
      allowAcp: Boolean(featureFlags.allowAcp),
      allowAuto: Boolean(featureFlags.allowAuto),
      ...featureFlags,
    };
  }

  getProvider(id) {
    const key = String(id || PROVIDER_IDS.LEGACY);
    const provider = this.providers[key];
    if (!provider) {
      throw new Error(`Execution provider not registered: ${key}`);
    }
    return provider;
  }

  /**
   * Resolve which provider to use for a project. Never silently upgrades
   * production projects to SDK just because the provider exists.
   */
  selectProviderId(project = {}) {
    if (!this.featureFlags.v2RouterEnabled) {
      return PROVIDER_IDS.LEGACY;
    }
    const cfg = resolveProjectExecutionConfig(project);
    let mode = cfg.mode;

    if (mode === 'auto') {
      if (!this.featureFlags.allowAuto) {
        mode = PROVIDER_IDS.LEGACY;
      } else if (this.featureFlags.allowSdk && cfg.allowedProviders.includes(PROVIDER_IDS.CURSOR_SDK)) {
        mode = PROVIDER_IDS.CURSOR_SDK;
      } else if (this.featureFlags.allowAcp && cfg.allowedProviders.includes(PROVIDER_IDS.CURSOR_ACP)) {
        mode = PROVIDER_IDS.CURSOR_ACP;
      } else {
        mode = PROVIDER_IDS.LEGACY;
      }
    }

    if (mode === PROVIDER_IDS.CURSOR_SDK && !this.featureFlags.allowSdk) {
      mode = PROVIDER_IDS.LEGACY;
    }
    if (mode === PROVIDER_IDS.CURSOR_ACP && !this.featureFlags.allowAcp) {
      mode = PROVIDER_IDS.LEGACY;
    }
    if (!cfg.allowedProviders.includes(mode)) {
      mode = PROVIDER_IDS.LEGACY;
    }
    if (!this.providers[mode]) {
      mode = PROVIDER_IDS.LEGACY;
    }
    return mode;
  }

  async probe(project = {}) {
    const results = {};
    for (const [id, provider] of Object.entries(this.providers)) {
      try {
        results[id] = await provider.probe(project);
      } catch (error) {
        results[id] = {
          available: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return results;
  }

  /**
   * Start execution via selected provider. Returns normalized handle metadata.
   */
  async start(task, project, executionContext = {}) {
    const providerId = executionContext.forceProvider || this.selectProviderId(project);
    const provider = this.getProvider(providerId);
    const executionId = executionContext.executionId || createExecutionId();
    const started = await provider.start(task, project, {
      ...executionContext,
      executionId,
      providerId,
    });
    return {
      executionId,
      providerId,
      ...started,
      event: normalizeProviderEvent(started?.event || { type: 'RUN_STARTED' }, {
        provider: providerId,
        taskId: task?.id,
        executionId,
      }),
    };
  }
}

/**
 * Pre-mutation fallback only. After mutation, caller must gate — never call this.
 */
export function canAutoFallback({ mutatedWorkspace = false, providerStarted = false } = {}) {
  if (mutatedWorkspace) return false;
  if (providerStarted && mutatedWorkspace) return false;
  return true;
}
