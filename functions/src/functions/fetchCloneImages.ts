import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { createHash, randomUUID } from "crypto";

type FetchCloneImagesRequest = {
  tenantId?: string;
};

type ClonePage = {
  path: string;
  title?: string;
  html: string;
  fetchError?: string;
};

type AssetManifestItem = {
  originalUrl: string;
  storageUrl?: string;
  contentType?: string;
  bytes?: number;
  status: "ok" | "failed" | "skipped";
  error?: string;
};

type FetchCloneImagesResult = {
  ok: true;
  tenantId: string;
  pagesUpdated: number;
  assetsProcessed: number;
  assetsOk: number;
  assetsFailed: number;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(callerUid);
    if (user.customClaims?.admin === true) return true;
    const adminDoc = await admin.firestore().collection("config").doc("admins").get();
    const uids = ((adminDoc.data()?.uids as string[]) ?? []).filter(Boolean);
    return uids.includes(callerUid);
  } catch {
    return false;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/^['"]|['"]$/g, "");
}

function extractUrlsFromSrcset(srcset: string): string[] {
  return srcset
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.split(/\s+/)[0] ?? "")
    .map(normalizeUrl)
    .filter(Boolean);
}

function extractImageCandidates(html: string): string[] {
  const urls = new Set<string>();

  const imgSrcRe = /<img\b[^>]*?\bsrc\s*=\s*(['"])(.*?)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrcRe.exec(html)) !== null) {
    const url = normalizeUrl(m[2] ?? "");
    if (url) urls.add(url);
  }

  const sourceSrcsetRe = /<source\b[^>]*?\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  while ((m = sourceSrcsetRe.exec(html)) !== null) {
    const srcset = m[2] ?? "";
    for (const u of extractUrlsFromSrcset(srcset)) urls.add(u);
  }

  const bgUrlRe = /background-image\s*:\s*url\(([^)]+)\)/gi;
  while ((m = bgUrlRe.exec(html)) !== null) {
    const url = normalizeUrl(m[1] ?? "");
    if (url) urls.add(url);
  }

  return [...urls];
}

function resolveAbsoluteUrl(raw: string, sourceUrl: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const abort = new AbortController();
  const t = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: abort.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function extensionFrom(contentType: string | null, sourceUrl: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/gif")) return "gif";
  if (ct.includes("image/svg+xml")) return "svg";
  if (ct.includes("image/avif")) return "avif";
  try {
    const p = new URL(sourceUrl).pathname;
    const ext = (p.split(".").pop() ?? "").toLowerCase();
    if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch {
    // ignore
  }
  return "img";
}

function buildStorageDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

export async function fetchCloneImagesHandler(
  data: unknown,
  context: functions.https.CallableContext,
): Promise<FetchCloneImagesResult> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }
  const callerIsAdmin = await isAdmin(context.auth.uid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required");
  }

  const body = (typeof data === "object" && data !== null ? data : {}) as FetchCloneImagesRequest;
  const tenantId = (body.tenantId ?? "").trim();
  if (!tenantId) {
    throw new functions.https.HttpsError("invalid-argument", "tenantId is required");
  }

  const cloneRef = admin.firestore().collection("tenantSiteClones").doc(tenantId);
  const cloneSnap = await cloneRef.get();
  if (!cloneSnap.exists) {
    throw new functions.https.HttpsError("not-found", "tenant clone document not found");
  }

  const clone = cloneSnap.data() as Record<string, unknown>;
  const sourceUrl = typeof clone.sourceUrl === "string" ? clone.sourceUrl : "";
  const pagesRaw = Array.isArray(clone.pages) ? clone.pages : [];
  const pages: ClonePage[] = pagesRaw
    .map((p) => {
      const rec = p as Record<string, unknown>;
      const path = typeof rec.path === "string" ? rec.path : "";
      const html = typeof rec.html === "string" ? rec.html : "";
      if (!path || !html) return null;
      return {
        path,
        html,
        title: typeof rec.title === "string" ? rec.title : undefined,
        fetchError: typeof rec.fetchError === "string" ? rec.fetchError : undefined,
      };
    })
    .filter(Boolean) as ClonePage[];

  const bucket = admin.storage().bucket();
  const replacementMap = new Map<string, string>();
  const manifest: AssetManifestItem[] = [];

  const allCandidates = new Set<string>();
  for (const page of pages) {
    for (const c of extractImageCandidates(page.html)) {
      allCandidates.add(c);
    }
  }

  for (const originalRaw of allCandidates) {
    const absoluteUrl = resolveAbsoluteUrl(originalRaw, sourceUrl);
    if (!absoluteUrl) {
      manifest.push({ originalUrl: originalRaw, status: "skipped", error: "unsupported_url" });
      continue;
    }

    if (replacementMap.has(originalRaw)) continue;

    try {
      const res = await fetchWithTimeout(absoluteUrl);
      if (!res.ok) {
        manifest.push({ originalUrl: originalRaw, status: "failed", error: `http_${res.status}` });
        continue;
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        manifest.push({ originalUrl: originalRaw, status: "failed", error: "not_image", contentType });
        continue;
      }

      const contentLen = Number(res.headers.get("content-length") ?? "0");
      if (Number.isFinite(contentLen) && contentLen > MAX_IMAGE_BYTES) {
        manifest.push({ originalUrl: originalRaw, status: "failed", error: "too_large_header", bytes: contentLen, contentType });
        continue;
      }

      const arrayBuffer = await res.arrayBuffer();
      const bytes = Buffer.from(arrayBuffer);
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        manifest.push({ originalUrl: originalRaw, status: "failed", error: "too_large_body", bytes: bytes.byteLength, contentType });
        continue;
      }

      const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 20);
      const ext = extensionFrom(contentType, absoluteUrl);
      const objectPath = `tenantSiteClones/${tenantId}/assets/${hash}.${ext}`;
      const token = randomUUID();
      await bucket.file(objectPath).save(bytes, {
        resumable: false,
        contentType,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
            originalUrl: absoluteUrl,
          },
        },
      });
      const storageUrl = buildStorageDownloadUrl(bucket.name, objectPath, token);
      replacementMap.set(originalRaw, storageUrl);
      replacementMap.set(absoluteUrl, storageUrl);
      manifest.push({
        originalUrl: originalRaw,
        storageUrl,
        contentType,
        bytes: bytes.byteLength,
        status: "ok",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "download_failed";
      manifest.push({ originalUrl: originalRaw, status: "failed", error: msg.slice(0, 180) });
    }
  }

  const updatedPages = pages.map((page) => {
    let nextHtml = page.html;
    for (const [from, to] of replacementMap.entries()) {
      const re = new RegExp(escapeRegExp(from), "g");
      nextHtml = nextHtml.replace(re, to);
    }
    return { ...page, html: nextHtml };
  });

  const homeHtml = updatedPages.find((p) => p.path === "/")?.html ?? updatedPages[0]?.html ?? "";
  await cloneRef.set(
    {
      pages: updatedPages,
      html: homeHtml,
      assetManifest: manifest,
      assetsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const assetsOk = manifest.filter((m) => m.status === "ok").length;
  const assetsFailed = manifest.filter((m) => m.status === "failed").length;
  return {
    ok: true,
    tenantId,
    pagesUpdated: updatedPages.length,
    assetsProcessed: manifest.length,
    assetsOk,
    assetsFailed,
  };
}
