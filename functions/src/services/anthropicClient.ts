import Anthropic from "@anthropic-ai/sdk";

let singleton: Anthropic | undefined;

function getInstance(): Anthropic {
  if (!singleton) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    singleton = new Anthropic({ apiKey });
  }
  return singleton;
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
