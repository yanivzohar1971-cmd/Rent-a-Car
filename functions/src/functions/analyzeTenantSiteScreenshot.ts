import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {
  extractTenantSiteFromScreenshot,
  CLAUDE_SITE_BUILDER_VISION_MODEL,
} from "../services/claudeSiteBuilderExtractor";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type AnalyzeTenantSiteScreenshotResult = {
  ok: true;
  payload: unknown;
  diagnostics?: {
    model: string;
    notes?: string[];
    warnings?: string[];
  };
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
    console.error("analyzeTenantSiteScreenshot: isAdmin check failed", error);
    return false;
  }
}

export async function analyzeTenantSiteScreenshotHandler(
  data: unknown,
  context: functions.https.CallableContext
): Promise<AnalyzeTenantSiteScreenshotResult> {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Admin privileges required"
    );
  }

  const body = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.replace(/\s/g, "") : "";
  let mimeType =
    typeof body.mimeType === "string" && body.mimeType.trim()
      ? body.mimeType.trim().toLowerCase()
      : "image/jpeg";

  if (!imageBase64) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "imageBase64 is required"
    );
  }

  if (!ALLOWED_MEDIA.has(mimeType)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "mimeType must be image/jpeg, image/png, image/webp, or image/gif"
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(imageBase64, "base64");
  } catch (e) {
    console.error("analyzeTenantSiteScreenshot: invalid base64", e);
    throw new functions.https.HttpsError(
      "invalid-argument",
      "imageBase64 is not valid base64"
    );
  }

  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Image must be between 1 byte and ${MAX_IMAGE_BYTES} bytes`
    );
  }

  try {
    const { payload, warnings, notes } = await extractTenantSiteFromScreenshot({
      imageBase64: buffer.toString("base64"),
      mediaType: mimeType,
    });

    return {
      ok: true,
      payload,
      diagnostics: {
        model: CLAUDE_SITE_BUILDER_VISION_MODEL,
        notes,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  } catch (error) {
    console.error("analyzeTenantSiteScreenshot: extraction failed", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Screenshot analysis failed"
    );
  }
}
