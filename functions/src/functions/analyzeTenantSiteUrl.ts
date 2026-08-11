import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {
  ANALYZE_TENANT_SITE_URL_TIMEOUT_SECONDS,
  analyzeTenantSiteUrlWithClaude,
  buildUrlAnalyzerAiDebugBaseline,
  resolveClaudeSiteBuilderUrlResearchModel,
  type UrlAnalyzerAiDebugInfo,
  type UrlAnalyzerHeroImportDebug,
  type UrlAnalyzerImportPipelineDebug,
  type UrlAnalyzerLayoutImportDebug,
  type UrlAnalyzerBusinessNameImportDebug,
} from "../services/claudeTenantSiteUrlResearch";
import {
  buildDebugError,
  createUrlResearchDebugError,
  truncateSafeDetail,
  type UrlResearchDebugErrorPayload,
} from "../services/urlResearchCallableDebug";

const HTTPS_ERROR_CODES = new Set([
  "ok",
  "cancelled",
  "unknown",
  "invalid-argument",
  "deadline-exceeded",
  "not-found",
  "already-exists",
  "permission-denied",
  "resource-exhausted",
  "failed-precondition",
  "aborted",
  "out-of-range",
  "unimplemented",
  "internal",
  "unavailable",
  "data-loss",
  "unauthenticated",
]);

function normalizeHttpsErrorCode(code: string): string {
  const c = String(code || "")
    .replace(/^functions\//i, "")
    .toLowerCase()
    .trim();
  return HTTPS_ERROR_CODES.has(c) ? c : "internal";
}

function detailsAsRecord(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }
  return { ...(details as Record<string, unknown>) };
}

function coerceCallableDebugError(
  v: unknown,
  fallback: { url: string; message: string; code: string },
): UrlResearchDebugErrorPayload {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.phase === "string" && typeof o.message === "string") {
      return buildDebugError({
        phase: o.phase as UrlResearchDebugErrorPayload["phase"],
        message: String(o.message),
        code: typeof o.code === "string" ? o.code : fallback.code || undefined,
        safeDetails: typeof o.safeDetails === "string" ? o.safeDetails : undefined,
        parseSnippet: typeof o.parseSnippet === "string" ? o.parseSnippet : undefined,
        url: typeof o.url === "string" ? o.url : fallback.url,
        normalizedUrl: typeof o.normalizedUrl === "string" ? o.normalizedUrl : undefined,
        pagesAttempted: typeof o.pagesAttempted === "number" ? o.pagesAttempted : undefined,
        pagesFetchedOk: typeof o.pagesFetchedOk === "number" ? o.pagesFetchedOk : undefined,
      });
    }
  }
  return buildDebugError({
    phase: "unknown",
    message: fallback.message,
    code: fallback.code || undefined,
    url: fallback.url,
    safeDetails: truncateSafeDetail(fallback.message, 200),
  });
}

function extractStackTopLine(err: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (!(err instanceof Error) || !err.stack) return undefined;
  const top = err.stack.split("\n").map((x) => x.trim()).find((x) => x.length > 0);
  return top ? truncateSafeDetail(top, 200) : undefined;
}

function buildFallbackImportPipelineDebug(phase: string): UrlAnalyzerImportPipelineDebug {
  return {
    pagesFetchedCount: 0,
    researchPagesByHint: {},
    deterministicFieldsProduced: [],
    structureDetectedSections: [],
    detectedCoreColors: [],
    imageCandidatesCount: 0,
    ignoredImagesCount: 0,
    mappedSections: [],
    unmappedImportantContentReasons: [`failed:${phase}`],
    aiFieldPaths: [],
    mergedFieldPaths: [],
    mergedHomeSectionsCount: 0,
    mergedHomeSections: [],
    mergedLayoutBooleans: {},
    analyzeTimeoutSeconds: ANALYZE_TENANT_SITE_URL_TIMEOUT_SECONDS,
  };
}

export type AnalyzeTenantSiteUrlPageFinding = { url: string; title?: string; fetchedOk: boolean; status?: number };

export type AnalyzeTenantSiteUrlDebugInfo = {
  normalizedUrl: string;
  requestedParams: {
    url: string;
    includeSubpages?: boolean;
    maxPages?: number;
    preferHebrew?: boolean;
    industryHintLength: number;
    mode?: "homepage" | "site";
  };
  pagesRequested: number;
  pagesAttempted: number;
  pagesFetchedOk: number;
  pagesFailed: number;
  pageFindingsSummary: AnalyzeTenantSiteUrlPageFinding[];
  warnings?: string[];
  notes?: string[];
  model: string;
  researchMode: "homepage" | "site";
  timings?: { fetchResearchMs: number; claudeMs: number; parseMs: number };
  partial?: boolean;
  /** Safe Anthropic observability (mirrors pipeline `ai`). */
  ai?: UrlAnalyzerAiDebugInfo;
  /** Hero slider / research counts (compact; no raw URL arrays). */
  heroImport?: UrlAnalyzerHeroImportDebug;
  /** Homepage layout heuristics (carousel detection, CTA colors, logo candidates). */
  layoutImport?: UrlAnalyzerLayoutImportDebug;
  /** Homepage business-name heuristics (compact). */
  businessNameImport?: UrlAnalyzerBusinessNameImportDebug;
  /** Deterministic mapper + merge vs AI field paths (compact). */
  importPipelineDebug?: UrlAnalyzerImportPipelineDebug;
};

export type AnalyzeTenantSiteUrlResult = {
  ok: true;
  payload: unknown;
  diagnostics: {
    model: string;
    analyzedUrl: string;
    pagesInspected: number;
    notes?: string[];
  };
  pageFindings?: AnalyzeTenantSiteUrlPageFinding[];
  warnings?: string[];
  /** Safe, additive diagnostics for admin builder DEBUG panel. */
  debug?: AnalyzeTenantSiteUrlDebugInfo;
};

async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(callerUid);
    if (user.customClaims?.admin === true) {
      return true;
    }
    const adminDoc = await admin.firestore().collection("config").doc("admins").get();
    if (!adminDoc.exists) {
      return false;
    }
    const data = adminDoc.data();
    const uids = (data?.uids as string[]) || [];
    return uids.includes(callerUid);
  } catch (error) {
    console.error("analyzeTenantSiteUrl: isAdmin check failed", error);
    return false;
  }
}

export async function analyzeTenantSiteUrlHandler(
  data: unknown,
  context: functions.https.CallableContext,
): Promise<AnalyzeTenantSiteUrlResult> {
  let phase = "init";
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", {
      debugError: createUrlResearchDebugError("auth", "User must be authenticated", { safeDetails: "Missing auth context" }),
    });
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required", {
      debugError: createUrlResearchDebugError("auth", "Admin privileges required", { safeDetails: "Caller lacks admin" }),
    });
  }

  const body = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    throw new functions.https.HttpsError("invalid-argument", "url is required", {
      debugError: createUrlResearchDebugError("validation", "url is required"),
    });
  }

  const includeSubpages = body.includeSubpages === undefined ? undefined : Boolean(body.includeSubpages);
  const maxPages = typeof body.maxPages === "number" ? body.maxPages : undefined;
  const preferHebrew = body.preferHebrew === undefined ? undefined : Boolean(body.preferHebrew);
  const industryHint = typeof body.industryHint === "string" ? body.industryHint : undefined;
  const mode = body.mode === "homepage" || body.mode === "site" ? body.mode : undefined;
  const industryHintLength = typeof industryHint === "string" ? industryHint.trim().length : 0;

  try {
    phase = "pipeline_call";
    console.log("PHASE_START", phase);
    let pipelineResult: Awaited<ReturnType<typeof analyzeTenantSiteUrlWithClaude>>;
    try {
      pipelineResult = await analyzeTenantSiteUrlWithClaude({
        url,
        includeSubpages,
        maxPages,
        preferHebrew,
        industryHint,
        mode,
      });
    } catch (pipelineErr) {
      if (pipelineErr instanceof functions.https.HttpsError) {
        throw pipelineErr;
      }
      const msg = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
      const code =
        pipelineErr && typeof pipelineErr === "object" && "code" in pipelineErr
          ? String((pipelineErr as { code?: unknown }).code ?? "")
          : "";
      console.error("analyzeTenantSiteUrl: pipeline failure", truncateSafeDetail(msg, 300));
      throw new functions.https.HttpsError("internal", "URL site analysis failed", {
        debugError: buildDebugError({
          phase: "research",
          message: "Unexpected error during URL site analysis",
          code: code || undefined,
          url,
          safeDetails: truncateSafeDetail(msg, 200),
        }),
        debugContext: {
          phase,
          stackTopLine: extractStackTopLine(pipelineErr),
          analyzeTimeoutSeconds: ANALYZE_TENANT_SITE_URL_TIMEOUT_SECONDS,
        },
        ai: buildUrlAnalyzerAiDebugBaseline(resolveClaudeSiteBuilderUrlResearchModel()),
      });
    }

    const {
      payload,
      warnings,
      notes,
      model,
      pageFindings,
      normalizedUrl,
      pagesAttempted,
      pagesFetchedOk,
      researchMode,
      timings,
      ai,
      heroImport,
      layoutImport,
      businessNameImport,
      importPipelineDebug,
    } = pipelineResult;
    phase = "return_success";

    const pagesFailed = Math.max(0, pagesAttempted - pagesFetchedOk);
    const maxPagesUsed =
      typeof maxPages === "number" && Number.isFinite(maxPages) ? Math.max(1, Math.min(12, Math.floor(maxPages))) : 8;

    const debug: AnalyzeTenantSiteUrlDebugInfo = {
      normalizedUrl,
      requestedParams: {
        url,
        includeSubpages,
        maxPages,
        preferHebrew,
        industryHintLength,
        mode,
      },
      pagesRequested: maxPagesUsed,
      pagesAttempted,
      pagesFetchedOk,
      pagesFailed,
      pageFindingsSummary: pageFindings,
      warnings: warnings.length > 0 ? warnings : undefined,
      notes,
      model,
      researchMode,
      timings,
      partial: false,
      ai,
      heroImport,
      layoutImport,
      businessNameImport,
      importPipelineDebug,
    };

    return {
      ok: true,
      payload,
      diagnostics: {
        model,
        analyzedUrl: normalizedUrl,
        pagesInspected: pageFindings.length,
        notes: [...notes, ...(warnings.length ? [`Warnings: ${warnings.length}`] : [])],
      },
      pageFindings,
      warnings: warnings.length > 0 ? warnings : undefined,
      debug,
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      const code = normalizeHttpsErrorCode(String(error.code)) as functions.https.FunctionsErrorCode;
      if (code === "internal" || code === "unavailable" || code === "failed-precondition" || code === "unknown") {
        const base = detailsAsRecord(error.details);
        const debugError = coerceCallableDebugError(base.debugError, {
          url,
          message: error.message || "Request failed",
          code,
        });
        console.error("ANALYZE_FATAL", JSON.stringify({ phase: debugError.phase || phase, message: debugError.message }));
        const safePayload = { branding: {}, content: {}, contact: {}, seo: {}, layout: {} };
        const model = resolveClaudeSiteBuilderUrlResearchModel();
        return {
          ok: true,
          payload: safePayload,
          diagnostics: {
            model,
            analyzedUrl: url,
            pagesInspected: 0,
            notes: ["Partial fallback payload returned after analyzer failure"],
          },
          warnings: ["Analyzer failed; returned fallback empty payload"],
          debug: {
            normalizedUrl: url,
            requestedParams: { url, includeSubpages, maxPages, preferHebrew, industryHintLength, mode },
            pagesRequested: typeof maxPages === "number" && Number.isFinite(maxPages) ? Math.max(1, Math.min(12, Math.floor(maxPages))) : 8,
            pagesAttempted: 0,
            pagesFetchedOk: 0,
            pagesFailed: 0,
            pageFindingsSummary: [],
            model,
            researchMode: mode ?? "site",
            partial: true,
            notes: ["failed_fallback"],
            importPipelineDebug: buildFallbackImportPipelineDebug(debugError.phase || phase),
            ai: buildUrlAnalyzerAiDebugBaseline(model),
          },
        };
      }
      const base = detailsAsRecord(error.details);
      base.debugError = coerceCallableDebugError(base.debugError, {
        url,
        message: error.message || "Request failed",
        code,
      });
      console.error("analyzeTenantSiteUrl: HttpsError", JSON.stringify(base.debugError));
      throw new functions.https.HttpsError(code, error.message, base);
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error("ANALYZE_FATAL", JSON.stringify({ phase, message: truncateSafeDetail(msg, 300) }));
    const model = resolveClaudeSiteBuilderUrlResearchModel();
    return {
      ok: true,
      payload: { branding: {}, content: {}, contact: {}, seo: {}, layout: {} },
      diagnostics: {
        model,
        analyzedUrl: url,
        pagesInspected: 0,
        notes: ["Fallback payload returned from global catch"],
      },
      warnings: ["Unexpected analyzer error; returned fallback payload"],
      debug: {
        normalizedUrl: url,
        requestedParams: { url, includeSubpages, maxPages, preferHebrew, industryHintLength, mode },
        pagesRequested: typeof maxPages === "number" && Number.isFinite(maxPages) ? Math.max(1, Math.min(12, Math.floor(maxPages))) : 8,
        pagesAttempted: 0,
        pagesFetchedOk: 0,
        pagesFailed: 0,
        pageFindingsSummary: [],
        model,
        researchMode: mode ?? "site",
        partial: true,
        notes: [`phase=${phase}`],
        importPipelineDebug: buildFallbackImportPipelineDebug(phase),
        ai: buildUrlAnalyzerAiDebugBaseline(model),
      },
    };
  }
}
