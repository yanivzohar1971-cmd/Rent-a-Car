import { timingSafeEqual } from "crypto";
import * as functions from "firebase-functions";
import { YzBridgeError } from "./types";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_MUTATING = 30;
const DEFAULT_MAX_READ = 120;

export interface RateLimiterOptions {
  windowMs?: number;
  maxMutating?: number;
  maxRead?: number;
  now?: () => number;
}

export class InMemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxMutating: number;
  private readonly maxRead: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxMutating = options.maxMutating ?? DEFAULT_MAX_MUTATING;
    this.maxRead = options.maxRead ?? DEFAULT_MAX_READ;
    this.now = options.now ?? Date.now;
  }

  check(key: string, mutating: boolean): void {
    const limit = mutating ? this.maxMutating : this.maxRead;
    const now = this.now();
    const cutoff = now - this.windowMs;
    const previous = this.hits.get(key) ?? [];
    const recent = previous.filter((ts) => ts > cutoff);
    if (recent.length >= limit) {
      throw new YzBridgeError(429, "rate_limited", "Too many requests");
    }
    recent.push(now);
    this.hits.set(key, recent);
  }
}

export function readExpectedApiToken(): string {
  const fromEnv = (process.env.YZ_BRIDGE_API_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = functions.config?.() as { yzbridge?: { api_token?: string } } | undefined;
    const fromConfig = cfg?.yzbridge?.api_token;
    if (typeof fromConfig === "string" && fromConfig.trim()) return fromConfig.trim();
  } catch {
    // functions.config() is unavailable outside the Functions runtime.
  }
  return "";
}

export function readExpectedChatGptKey(): string {
  const fromEnv = (process.env.YZ_BRIDGE_CHATGPT_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = functions.config?.() as { yzbridge?: { chatgpt_key?: string } } | undefined;
    const fromConfig = cfg?.yzbridge?.chatgpt_key;
    if (typeof fromConfig === "string" && fromConfig.trim()) return fromConfig.trim();
  } catch {
    // functions.config() is unavailable outside the Functions runtime.
  }
  return "";
}

export function readExpectedChatGptSessionKey(): string {
  return (process.env.YZ_BRIDGE_CHATGPT_SESSION_KEY || "").trim();
}

export function readChatGptSessionExpiresAt(): string {
  return (process.env.YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT || "").trim();
}

export function parseChatGptSessionExpiresAtMs(raw: string): number | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^\d{13,}$/.test(value)) {
    const ms = Number(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (/^\d{10}$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface ChatGptKeyValidationInput {
  providedKey: unknown;
  permanentKey: string;
  sessionKey?: string;
  sessionExpiresAt?: string;
  now?: () => number;
}

export function isValidChatGptKey(input: ChatGptKeyValidationInput): boolean {
  const provided = typeof input.providedKey === "string" ? input.providedKey : "";
  const permanent = String(input.permanentKey || "");
  const session = String(input.sessionKey || "");
  const expiresAtMs = parseChatGptSessionExpiresAtMs(String(input.sessionExpiresAt || ""));
  const now = input.now ? input.now() : Date.now();
  const sessionUnexpired = expiresAtMs != null && now < expiresAtMs;

  const permanentOk = Boolean(permanent) && Boolean(provided) && tokensMatch(provided, permanent);
  const sessionMatched = Boolean(session) && Boolean(provided) && tokensMatch(provided, session);
  return permanentOk || (sessionMatched && sessionUnexpired);
}

export function assertChatGptQueryKey(providedKey: unknown, expectedKey: string): void {
  assertChatGptAccess(providedKey, { permanentKey: expectedKey });
}

export function assertChatGptAccess(providedKey: unknown, input: Omit<ChatGptKeyValidationInput, "providedKey">): void {
  const permanent = String(input.permanentKey || "");
  const session = String(input.sessionKey || "");
  if (!permanent && !session) {
    throw new YzBridgeError(
      503,
      "not_configured",
      "YZ Bridge ChatGPT key is not configured on the server",
    );
  }
  if (!isValidChatGptKey({ ...input, providedKey, permanentKey: permanent, sessionKey: session })) {
    throw new YzBridgeError(401, "unauthorized", "unauthorized");
  }
}

export function extractBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== "string") return null;
  const prefix = "Bearer ";
  if (!headerValue.startsWith(prefix)) return null;
  const token = headerValue.slice(prefix.length).trim();
  return token || null;
}

export function tokensMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function assertAuthenticated(authorizationHeader: unknown, expectedToken: string): void {
  if (!expectedToken) {
    throw new YzBridgeError(
      503,
      "not_configured",
      "YZ Bridge API token is not configured on the server",
    );
  }
  const provided = extractBearerToken(authorizationHeader);
  if (!provided || !tokensMatch(provided, expectedToken)) {
    throw new YzBridgeError(401, "unauthorized", "Invalid or missing Authorization bearer token");
  }
}

export function clientKey(ip: string | undefined, agentId: string | undefined): string {
  return `${ip || "unknown"}:${agentId || "anon"}`;
}
