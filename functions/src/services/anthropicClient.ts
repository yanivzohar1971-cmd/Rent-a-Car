import Anthropic from "@anthropic-ai/sdk";
import * as functions from "firebase-functions";

let anthropicSingleton: Anthropic | undefined;

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
