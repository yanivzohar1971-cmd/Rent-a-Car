/**
 * Compact, client-safe diagnostics for tenant URL site research callables.
 * No secrets, no raw HTML, no full model output.
 */

export type UrlResearchFailurePhase =
  | "validation"
  | "auth"
  | "normalize"
  | "fetch"
  | "research"
  | "claude"
  | "parse"
  | "sanitize"
  | "unknown";

export type UrlResearchDebugErrorPayload = {
  phase: UrlResearchFailurePhase;
  message: string;
  code?: string;
  safeDetails?: string;
  parseSnippet?: string;
  url?: string;
  normalizedUrl?: string;
  pagesAttempted?: number;
  pagesFetchedOk?: number;
  timestamp: string;
};

export function createUrlResearchDebugError(
  phase: UrlResearchFailurePhase,
  message: string,
  extra: Partial<Omit<UrlResearchDebugErrorPayload, "phase" | "message" | "timestamp">> = {},
): UrlResearchDebugErrorPayload {
  return {
    phase,
    message,
    ...extra,
    timestamp: new Date().toISOString(),
  };
}

const MAX_SAFE = 200;

export function truncateSafeDetail(s: string, max = MAX_SAFE): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
