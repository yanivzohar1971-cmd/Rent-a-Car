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

/**
 * Structured, client-safe debug payload for URL research callables.
 * Truncates strings; never include HTML, full model output, or secrets.
 */
export function buildDebugError(
  partial: Partial<Omit<UrlResearchDebugErrorPayload, "timestamp">> & { message: string },
): UrlResearchDebugErrorPayload {
  const phase: UrlResearchFailurePhase = partial.phase ?? "unknown";
  const message = truncateSafeDetail(partial.message || "Unknown error", 500);
  const out: UrlResearchDebugErrorPayload = {
    phase,
    message,
    timestamp: new Date().toISOString(),
  };
  if (partial.code !== undefined && String(partial.code).trim()) {
    out.code = truncateSafeDetail(String(partial.code), 120);
  }
  if (partial.safeDetails !== undefined && String(partial.safeDetails).trim()) {
    out.safeDetails = truncateSafeDetail(String(partial.safeDetails), MAX_SAFE);
  }
  if (partial.parseSnippet !== undefined && String(partial.parseSnippet).trim()) {
    out.parseSnippet = truncateSafeDetail(String(partial.parseSnippet), MAX_SAFE);
  }
  if (partial.url !== undefined && String(partial.url).trim()) {
    out.url = truncateSafeDetail(String(partial.url).trim(), 500);
  }
  if (partial.normalizedUrl !== undefined && String(partial.normalizedUrl).trim()) {
    out.normalizedUrl = truncateSafeDetail(String(partial.normalizedUrl).trim(), 500);
  }
  if (typeof partial.pagesAttempted === "number" && Number.isFinite(partial.pagesAttempted)) {
    out.pagesAttempted = Math.max(0, Math.floor(partial.pagesAttempted));
  }
  if (typeof partial.pagesFetchedOk === "number" && Number.isFinite(partial.pagesFetchedOk)) {
    out.pagesFetchedOk = Math.max(0, Math.floor(partial.pagesFetchedOk));
  }
  return out;
}

export function createUrlResearchDebugError(
  phase: UrlResearchFailurePhase,
  message: string,
  extra: Partial<Omit<UrlResearchDebugErrorPayload, "phase" | "message" | "timestamp">> = {},
): UrlResearchDebugErrorPayload {
  return buildDebugError({ phase, message, ...extra });
}

const MAX_SAFE = 200;

export function truncateSafeDetail(s: string, max = MAX_SAFE): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
