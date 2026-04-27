import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {
  extractTenantSiteFromScreenshot,
  CLAUDE_SITE_BUILDER_VISION_MODEL,
} from "../services/claudeSiteBuilderExtractor";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 9_000;

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
    imageInputMode?: "file" | "paste" | "drop" | "url";
    imageUrlAnalyzed?: string;
    imageUrlFetchStatus?: number;
    imageUrlContentType?: string;
    imageUrlBytes?: number;
  };
};

type UrlImageFetchDebug = {
  imageUrlAnalyzed?: string;
  imageUrlFetchStatus?: number;
  imageUrlContentType?: string;
  imageUrlBytes?: number;
};

async function fetchImageFromUrl(rawUrl: string): Promise<{ buffer: Buffer; mimeType: string; debug: UrlImageFetchDebug }> {
  const imageUrl = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new functions.https.HttpsError("invalid-argument", "imageUrl is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new functions.https.HttpsError("invalid-argument", "imageUrl must be https");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "RentACarScreenshotAnalyzer/1.0",
        accept: "image/*",
      },
    });
    const contentType = String(res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
    const contentLengthHeader = Number(res.headers.get("content-length") ?? "0");
    const debug: UrlImageFetchDebug = {
      imageUrlAnalyzed: parsed.toString(),
      imageUrlFetchStatus: res.status,
      imageUrlContentType: contentType || undefined,
    };
    if (!res.ok) {
      throw new functions.https.HttpsError("failed-precondition", `imageUrl fetch failed with status ${res.status}`);
    }
    if (!contentType.startsWith("image/")) {
      throw new functions.https.HttpsError("invalid-argument", "imageUrl must return image/* content-type");
    }
    if (Number.isFinite(contentLengthHeader) && contentLengthHeader > MAX_IMAGE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", `Image URL exceeds max size ${MAX_IMAGE_BYTES} bytes`);
    }
    if (!ALLOWED_MEDIA.has(contentType)) {
      throw new functions.https.HttpsError("invalid-argument", "imageUrl content-type must be jpeg/png/webp/gif");
    }
    const arr = await res.arrayBuffer();
    const buffer = Buffer.from(arr);
    debug.imageUrlBytes = buffer.length;
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", `Image URL bytes must be between 1 and ${MAX_IMAGE_BYTES}`);
    }
    return { buffer, mimeType: contentType, debug };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (/aborted|abort/i.test(message)) {
      throw new functions.https.HttpsError("deadline-exceeded", "imageUrl fetch timed out");
    }
    throw new functions.https.HttpsError("failed-precondition", "imageUrl fetch failed");
  } finally {
    clearTimeout(timeout);
  }
}

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
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const inputModeRaw = typeof body.imageInputMode === "string" ? body.imageInputMode.trim().toLowerCase() : "";
  const imageInputMode: "file" | "paste" | "drop" | "url" =
    inputModeRaw === "paste" || inputModeRaw === "drop" || inputModeRaw === "url" ? inputModeRaw : "file";
  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.replace(/\s/g, "") : "";
  let mimeType =
    typeof body.mimeType === "string" && body.mimeType.trim()
      ? body.mimeType.trim().toLowerCase()
      : "image/jpeg";

  if (!imageBase64 && !imageUrl) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "imageBase64 or imageUrl is required"
    );
  }
  let buffer: Buffer;
  let urlFetchDebug: UrlImageFetchDebug = {};
  if (imageUrl) {
    const fetched = await fetchImageFromUrl(imageUrl);
    buffer = fetched.buffer;
    mimeType = fetched.mimeType;
    urlFetchDebug = fetched.debug;
  } else {
    if (!ALLOWED_MEDIA.has(mimeType)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "mimeType must be image/jpeg, image/png, image/webp, or image/gif"
      );
    }

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
  }

  try {
    const { payload, warnings, notes } = await extractTenantSiteFromScreenshot({
      imageBase64: buffer.toString("base64"),
      mediaType: mimeType,
      imageInputMode,
      imageUrl: urlFetchDebug.imageUrlAnalyzed,
    });

    return {
      ok: true,
      payload,
      diagnostics: {
        model: CLAUDE_SITE_BUILDER_VISION_MODEL,
        notes,
        warnings: warnings.length > 0 ? warnings : undefined,
        imageInputMode,
        imageUrlAnalyzed: urlFetchDebug.imageUrlAnalyzed,
        imageUrlFetchStatus: urlFetchDebug.imageUrlFetchStatus,
        imageUrlContentType: urlFetchDebug.imageUrlContentType,
        imageUrlBytes: urlFetchDebug.imageUrlBytes,
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
