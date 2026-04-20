import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { analyzeTenantSiteUrlWithClaude } from "../services/claudeTenantSiteUrlResearch";
import { createUrlResearchDebugError, truncateSafeDetail } from "../services/urlResearchCallableDebug";

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
    const { payload, warnings, notes, model, pageFindings, normalizedUrl, pagesAttempted, pagesFetchedOk, researchMode, timings } =
      await analyzeTenantSiteUrlWithClaude({
        url,
        includeSubpages,
        maxPages,
        preferHebrew,
        industryHint,
        mode,
      });

    const pagesFailed = Math.max(0, pagesAttempted - pagesFetchedOk);
    const maxPagesUsed =
      typeof maxPages === "number" && Number.isFinite(maxPages) ? Math.max(1, Math.min(12, Math.floor(maxPages))) : 5;

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
      const existing = error.details;
      const base =
        existing && typeof existing === "object" && !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>) }
          : {};
      if (!base.debugError) {
        base.debugError = createUrlResearchDebugError("unknown", error.message, {
          code: String(error.code),
          url,
          safeDetails: truncateSafeDetail(error.message, 240),
        });
      }
      console.error("analyzeTenantSiteUrl: HttpsError", JSON.stringify(base.debugError));
      throw new functions.https.HttpsError(error.code, error.message, base);
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error("analyzeTenantSiteUrl: unexpected failure", truncateSafeDetail(msg, 300));
    throw new functions.https.HttpsError("internal", "URL site analysis failed", {
      debugError: createUrlResearchDebugError("unknown", "Unexpected server error", {
        url,
        safeDetails: truncateSafeDetail(msg),
      }),
    });
  }
}
