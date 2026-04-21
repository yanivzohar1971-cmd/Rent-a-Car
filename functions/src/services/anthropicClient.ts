import Anthropic from "@anthropic-ai/sdk";
import * as functions from "firebase-functions";

/** Default Claude model for site-builder URL research and vision extraction (Messages API). */
export const ANTHROPIC_SITE_BUILDER_DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

let anthropicSingleton: Anthropic | undefined;

export type AnthropicApiKeySource = "env" | "functionsConfig" | "missing";

/**
 * Where the API key would be loaded from (never exposes the key).
 */
export function resolveAnthropicApiKeyMeta(): { apiKeyPresent: boolean; apiKeySource: AnthropicApiKeySource } {
  const fromEnv = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (fromEnv) {
    return { apiKeyPresent: true, apiKeySource: "env" };
  }
  try {
    const cfg = functions.config?.()?.anthropic?.key;
    if (typeof cfg === "string" && cfg.trim()) {
      return { apiKeyPresent: true, apiKeySource: "functionsConfig" };
    }
  } catch {
    // runtime config unavailable
  }
  return { apiKeyPresent: false, apiKeySource: "missing" };
}

export type AnthropicClientDebugStatus = {
  provider: "anthropic";
  clientReady: boolean;
  apiKeyPresent: boolean;
  apiKeySource: AnthropicApiKeySource;
};

/**
 * Safe observability for DEBUG: key presence/source and whether the SDK client was constructed.
 * Never exposes the key or any prefix/suffix.
 */
export function getAnthropicClientDebugStatus(): AnthropicClientDebugStatus {
  const { apiKeyPresent, apiKeySource } = resolveAnthropicApiKeyMeta();
  if (!apiKeyPresent) {
    return { provider: "anthropic", clientReady: false, apiKeyPresent: false, apiKeySource: "missing" };
  }
  try {
    getInstance();
    return { provider: "anthropic", clientReady: true, apiKeyPresent: true, apiKeySource };
  } catch {
    return { provider: "anthropic", clientReady: false, apiKeyPresent: true, apiKeySource };
  }
}

function getInstance(): Anthropic {
  if (!anthropicSingleton) {
    const apiKey =
      process.env.ANTHROPIC_API_KEY ||
      (functions.config()?.anthropic?.key as string | undefined);
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    anthropicSingleton = new Anthropic({ apiKey });
  }
  return anthropicSingleton;
}

/**
 * Lazily initialized Anthropic SDK client (singleton). Use only from Cloud Functions code.
 */
export const anthropicClient = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop, receiver) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
