import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { analyzeTenantSiteUrlWithClaude } from "../services/claudeTenantSiteUrlResearch";

export type AnalyzeTenantSiteUrlResult = {
  ok: true;
  payload: unknown;
  diagnostics: {
    model: string;
    analyzedUrl: string;
    pagesInspected: number;
    notes?: string[];
  };
  pageFindings?: { url: string; title?: string; fetchedOk: boolean; status?: number }[];
  warnings?: string[];
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
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required");
  }

  const body = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    throw new functions.https.HttpsError("invalid-argument", "url is required");
  }

  const includeSubpages = body.includeSubpages === undefined ? undefined : Boolean(body.includeSubpages);
  const maxPages = typeof body.maxPages === "number" ? body.maxPages : undefined;
  const preferHebrew = body.preferHebrew === undefined ? undefined : Boolean(body.preferHebrew);
  const industryHint = typeof body.industryHint === "string" ? body.industryHint : undefined;
  const mode = body.mode === "homepage" || body.mode === "site" ? body.mode : undefined;

  try {
    const { payload, warnings, notes, model, pageFindings } = await analyzeTenantSiteUrlWithClaude({
      url,
      includeSubpages,
      maxPages,
      preferHebrew,
      industryHint,
      mode,
    });

    return {
      ok: true,
      payload,
      diagnostics: {
        model,
        analyzedUrl: url,
        pagesInspected: pageFindings.length,
        notes: [...notes, ...(warnings.length ? [`Warnings: ${warnings.length}`] : [])],
      },
      pageFindings,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error("analyzeTenantSiteUrl: failed", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "URL site analysis failed");
  }
}
