import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { createHash, randomUUID } from "crypto";

type CloneWebsiteRequest = {
  tenantId?: string;
  url?: string;
};

type CloneWebsiteResult = {
  ok: true;
  tenantId: string;
  sourceUrl: string;
  pages: Array<{ path: string; title?: string; html: string; fetchError?: string }>;
  html: string;
  documentHtml?: string;
  selfContainedDocumentHtml?: string;
  cssText?: string;
  styles?: string[];
  cssWarnings?: string[];
  importedAssetCount?: number;
  importedCssCount?: number;
  importedFontCount?: number;
  assetRewriteWarnings?: string[];
  brokenUrlSamples?: string[];
  updatedAt: string;
};

type ClonePageRecord = {
  path: string;
  url: string;
  sourceUrl: string;
  title: string;
  html: string;
  fetchError: string;
  status: "ok" | "error";
};

function sanitizeSourceUrlInput(raw: string): string {
  return raw.trim().replace(/^(source|מקור)\s*:\s*/i, "").trim();
}

function normalizeCharsetLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const c = value.trim().toLowerCase().replace(/["']/g, "");
  if (!c) return null;
  if (c === "utf8") return "utf-8";
  if (c === "cp1255" || c === "windows1255") return "windows-1255";
  if (c === "iso8859-8" || c === "iso88598" || c === "iso-8859-8-i") return "iso-8859-8";
  return c;
}

function detectCharsetFromBytes(bytes: Uint8Array, contentTypeHeader: string | null): string {
  const fromHeader = normalizeCharsetLabel(contentTypeHeader?.match(/charset\s*=\s*([^;]+)/i)?.[1]);
  if (fromHeader) return fromHeader;

  const headLen = Math.min(bytes.length, 32 * 1024);
  const headLatin = new TextDecoder("latin1").decode(bytes.slice(0, headLen));

  const charsetMeta = headLatin.match(/<meta\b[^>]*charset\s*=\s*["']?([^"'>\s;]+)/i);
  const fromMetaCharset = normalizeCharsetLabel(charsetMeta?.[1]);
  if (fromMetaCharset) return fromMetaCharset;

  const httpEquivMeta = headLatin.match(
    /<meta\b[^>]*http-equiv\s*=\s*["']?\s*content-type["']?[^>]*content\s*=\s*["']([^"']+)["']/i,
  );
  const fromHttpEquiv = normalizeCharsetLabel(httpEquivMeta?.[1]?.match(/charset\s*=\s*([^;"'\s]+)/i)?.[1]);
  if (fromHttpEquiv) return fromHttpEquiv;

  const contentMeta = headLatin.match(
    /<meta\b[^>]*content\s*=\s*["']([^"']*charset\s*=[^"']+)["'][^>]*http-equiv\s*=\s*["']?\s*content-type/i,
  );
  const fromContentMeta = normalizeCharsetLabel(contentMeta?.[1]?.match(/charset\s*=\s*([^;"'\s]+)/i)?.[1]);
  if (fromContentMeta) return fromContentMeta;

  return "utf-8";
}

function decodeHtmlFromResponseBytes(bytes: ArrayBuffer, contentTypeHeader: string | null): string {
  const u8 = new Uint8Array(bytes);
  const charset = detectCharsetFromBytes(u8, contentTypeHeader);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(u8);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(u8);
  }
}

function normalizeUrl(raw: string): URL {
  const trimmed = sanitizeSourceUrlInput(raw);
  if (!trimmed) {
    throw new functions.https.HttpsError("invalid-argument", "url is required");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new functions.https.HttpsError("invalid-argument", "url is invalid");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new functions.https.HttpsError("invalid-argument", "Only http/https urls are supported");
  }
  parsed.hash = "";
  if (!parsed.pathname) parsed.pathname = "/";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed;
}

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

type SourceAssetType = "html";
type FetchSourceAssetOptions = {
  timeoutMs: number;
  assetType: SourceAssetType;
  referer?: string;
  acceptOverride?: string;
};

function buildSourceAssetHeaders(url: string, options: FetchSourceAssetOptions): Record<string, string> {
  const defaultAccept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const referer = options.referer?.trim() || `${new URL(url).origin}/`;
  return {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    accept: options.acceptOverride ?? defaultAccept,
    "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    referer,
    "cache-control": "no-cache",
    pragma: "no-cache",
  };
}

const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const ASSET_TIMEOUT_MS = 12_000;

function isAbsoluteOrSpecialUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("//") ||
    v.startsWith("data:") ||
    v.startsWith("blob:") ||
    v.startsWith("javascript:") ||
    v.startsWith("#")
  );
}

function sanitizeAttrUrl(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function resolveAgainstBase(raw: string, baseUrl: string): string | null {
  const cleaned = sanitizeAttrUrl(raw);
  if (!cleaned) return null;
  if (isAbsoluteOrSpecialUrl(cleaned)) {
    if (cleaned.startsWith("//")) {
      try {
        const base = new URL(baseUrl);
        return `${base.protocol}${cleaned}`;
      } catch {
        return null;
      }
    }
    return cleaned;
  }
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function extensionFromContentType(contentType: string | null, sourceUrl: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/css")) return "css";
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/gif")) return "gif";
  if (ct.includes("image/svg+xml")) return "svg";
  if (ct.includes("image/avif")) return "avif";
  if (ct.includes("font/woff2")) return "woff2";
  if (ct.includes("font/woff")) return "woff";
  if (ct.includes("font/ttf")) return "ttf";
  if (ct.includes("font/otf")) return "otf";
  if (ct.includes("application/vnd.ms-fontobject")) return "eot";
  try {
    const pathname = new URL(sourceUrl).pathname;
    const ext = (pathname.split(".").pop() ?? "").toLowerCase();
    if (/^[a-z0-9]{2,8}$/.test(ext)) return ext;
  } catch {
    // ignore
  }
  return "bin";
}

function buildStorageDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function fetchBinaryAsset(url: string, referer: string): Promise<Response> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), ASSET_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        accept: "*/*",
        "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        referer,
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      redirect: "follow",
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSourceAsset(url: string, options: FetchSourceAssetOptions): Promise<Response> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: buildSourceAssetHeaders(url, options),
      redirect: "follow",
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractBodyHtml(inputHtml: string): string {
  const bodyMatch = inputHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) return bodyMatch[1];
  return inputHtml;
}

function removeScripts(inputHtml: string): string {
  return inputHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function removeEventHandlerAttributes(inputHtml: string): string {
  return inputHtml
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}

function removeJavascriptUrls(inputHtml: string): string {
  return inputHtml.replace(
    /\b(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi,
    (_full, attr: string, quote: string) => `${attr}=${quote}#${quote}`,
  );
}

function sanitizeHtmlForStoredDocument(inputHtml: string): string {
  return removeJavascriptUrls(removeEventHandlerAttributes(removeScripts(inputHtml)));
}

function ensureUtf8Meta(headHtml: string): string {
  if (/<meta\b[^>]*charset\s*=|<meta\b[^>]*http-equiv\s*=\s*["']?\s*content-type/i.test(headHtml)) {
    return headHtml;
  }
  return `<meta charset="UTF-8">\n${headHtml}`;
}

function hasHebrewSignals(sourceUrl: URL, html: string): boolean {
  if (/\.co\.il$/i.test(sourceUrl.hostname)) return true;
  return /[\u0590-\u05FF]/.test(html);
}

function ensureRtlAttrs(htmlAttrsRaw: string, bodyAttrsRaw: string, sourceUrl: URL, rawHtml: string): { htmlAttrs: string; bodyAttrs: string } {
  let htmlAttrs = htmlAttrsRaw;
  let bodyAttrs = bodyAttrsRaw;
  const htmlHasDir = /\bdir\s*=/i.test(htmlAttrs);
  const bodyHasDir = /\bdir\s*=/i.test(bodyAttrs);
  const htmlHasLang = /\blang\s*=/i.test(htmlAttrs);
  if (!htmlHasDir && !bodyHasDir && hasHebrewSignals(sourceUrl, rawHtml)) {
    htmlAttrs += ' dir="rtl"';
  }
  if (!htmlHasLang && hasHebrewSignals(sourceUrl, rawHtml)) {
    htmlAttrs += ' lang="he"';
  }
  return { htmlAttrs, bodyAttrs };
}

function absolutizeAssetUrlsInHtml(inputHtml: string, baseUrl: string): string {
  const isAbsoluteOrSpecial = (value: string): boolean => {
    const v = value.trim().toLowerCase();
    return (
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("//") ||
      v.startsWith("data:") ||
      v.startsWith("blob:") ||
      v.startsWith("javascript:") ||
      v.startsWith("#")
    );
  };
  let out = inputHtml;
  const attrRe = /\b(src|href|poster)\s*=\s*(['"])(.*?)\2/gi;
  out = out.replace(attrRe, (full, attr, quote, raw) => {
    const v = String(raw ?? "").trim();
    if (!v || isAbsoluteOrSpecial(v)) return full;
    try {
      return `${attr}=${quote}${new URL(v, baseUrl).toString()}${quote}`;
    } catch {
      return full;
    }
  });
  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  out = out.replace(srcsetRe, (full, quote, raw) => {
    const rewritten = String(raw ?? "")
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return trimmed;
        const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
        try {
          const abs = new URL(urlPart, baseUrl).toString();
          return descriptor ? `${abs} ${descriptor}` : abs;
        } catch {
          return trimmed;
        }
      })
      .join(", ");
    return `srcset=${quote}${rewritten}${quote}`;
  });
  return out;
}

function applyAssetManifestReplacements(inputHtml: string, manifest: Array<Record<string, unknown>>): string {
  const normalizeForCompare = (value: string): string => value.trim().replace(/^['"]|['"]$/g, "");
  const isAbsoluteOrSpecial = (value: string): boolean => {
    const v = normalizeForCompare(value).toLowerCase();
    return (
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("//") ||
      v.startsWith("data:") ||
      v.startsWith("blob:") ||
      v.startsWith("javascript:") ||
      v.startsWith("#")
    );
  };

  const replacementMap = new Map<string, string>();
  for (const item of manifest) {
    const originalUrlRaw = typeof item.originalUrl === "string" ? item.originalUrl : "";
    const storageUrl = typeof item.storageUrl === "string" ? item.storageUrl : "";
    if (!originalUrlRaw || !storageUrl) continue;
    const originalUrl = normalizeForCompare(originalUrlRaw);
    replacementMap.set(originalUrl, storageUrl);
    if (!originalUrl.startsWith("/")) replacementMap.set(`/${originalUrl}`, storageUrl);
  }

  const replaceOne = (raw: string): string => {
    const candidate = normalizeForCompare(raw);
    const direct = replacementMap.get(candidate);
    if (direct) return direct;
    return raw;
  };

  let out = inputHtml;
  const attrRe = /\b(src|href|poster)\s*=\s*(['"])(.*?)\2/gi;
  out = out.replace(attrRe, (full, attr, quote, raw) => {
    const replaced = replaceOne(String(raw ?? ""));
    if (!replaced || replaced === raw) return full;
    if (isAbsoluteOrSpecial(replaced)) {
      return `${attr}=${quote}${replaced}${quote}`;
    }
    return `${attr}=${quote}${replaced}${quote}`;
  });

  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  out = out.replace(srcsetRe, (full, quote, raw) => {
    const rewritten = String(raw ?? "")
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return trimmed;
        const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
        const replaced = replaceOne(urlPart);
        const finalUrl = replaced || urlPart;
        return descriptor ? `${finalUrl} ${descriptor}` : finalUrl;
      })
      .join(", ");
    return `srcset=${quote}${rewritten}${quote}`;
  });

  // Safety-net: if malformed "/https://..." was produced by legacy data, normalize it.
  out = out.replace(/=(['"])\/(https?:\/\/[^'"]+)\1/gi, `="$2"`);
  return out;
}

function rewriteHtmlWithAssetMap(inputHtml: string, map: Map<string, string>): string {
  const replaceOne = (raw: string): string => {
    const cleaned = sanitizeAttrUrl(raw);
    return map.get(cleaned) ?? raw;
  };
  let out = inputHtml;
  const attrRe = /\b(src|href|poster)\s*=\s*(['"])(.*?)\2/gi;
  out = out.replace(attrRe, (full, attr, quote, raw) => {
    const next = replaceOne(String(raw ?? ""));
    if (next === raw) return full;
    return `${attr}=${quote}${next}${quote}`;
  });
  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  out = out.replace(srcsetRe, (full, quote, raw) => {
    const rewritten = String(raw ?? "")
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        if (!trimmed) return trimmed;
        const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
        const next = replaceOne(urlPart);
        return descriptor ? `${next} ${descriptor}` : next;
      })
      .join(", ");
    return `srcset=${quote}${rewritten}${quote}`;
  });
  return out;
}

function extractAssetUrlsFromHtml(inputHtml: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const attrRe = /\b(src|poster)\s*=\s*(['"])(.*?)\2/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(inputHtml)) !== null) {
    const resolved = resolveAgainstBase(m[3] ?? "", baseUrl);
    if (!resolved) continue;
    if (resolved.startsWith("data:") || resolved.startsWith("blob:")) continue;
    out.add(resolved);
  }
  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  while ((m = srcsetRe.exec(inputHtml)) !== null) {
    const parts = String(m[2] ?? "").split(",");
    for (const part of parts) {
      const [candidate] = part.trim().split(/\s+/, 1);
      const resolved = resolveAgainstBase(candidate ?? "", baseUrl);
      if (!resolved) continue;
      if (resolved.startsWith("data:") || resolved.startsWith("blob:")) continue;
      out.add(resolved);
    }
  }
  return [...out];
}

function extractCssUrlRefs(cssText: string): string[] {
  const out = new Set<string>();
  const re = /url\(([^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssText)) !== null) {
    const raw = sanitizeAttrUrl(String(m[1] ?? ""));
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("#")) continue;
    out.add(raw);
  }
  return [...out];
}

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

function buildDocumentHtml(
  sourceHtmlRaw: string,
  rewrittenBodyHtml: string,
  cssText: string,
  sourceUrl: URL,
): string {
  const sanitizedSource = sanitizeHtmlForStoredDocument(sourceHtmlRaw);
  const doctypeMatch = sanitizedSource.match(/^\s*(<!doctype[^>]*>)/i);
  const doctype = doctypeMatch?.[1] ?? "<!doctype html>";
  const htmlAttrsRaw = sanitizedSource.match(/<html\b([^>]*)>/i)?.[1] ?? "";
  const bodyAttrsRaw = sanitizedSource.match(/<body\b([^>]*)>/i)?.[1] ?? "";
  const { htmlAttrs, bodyAttrs } = ensureRtlAttrs(htmlAttrsRaw, bodyAttrsRaw, sourceUrl, sourceHtmlRaw);
  let headInner = sanitizedSource.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  headInner = removeScripts(headInner);
  headInner = headInner.replace(/<(iframe|object|embed)\b[\s\S]*?<\/\1>/gi, "");
  headInner = ensureUtf8Meta(headInner);

  const safeCss = (cssText ?? "").replace(/<\/style/gi, "<\\/style");
  if (safeCss.trim()) {
    headInner += `\n<style data-clone-styles="true">${safeCss}</style>`;
  }

  const safeBody = sanitizeHtmlForStoredDocument(rewrittenBodyHtml);
  return `${doctype}
<html${htmlAttrs}>
<head>
${headInner}
</head>
<body${bodyAttrs}>${safeBody}</body>
</html>`;
}

function toClonePathname(pathname: string): string {
  const clean = pathname.trim();
  if (!clean || clean === "/") return "/";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function rewriteInternalLinks(
  bodyHtml: string,
  tenantId: string,
  sourceUrl: URL,
): { html: string; discoveredPaths: string[] } {
  const sourceHost = sourceUrl.hostname.toLowerCase();
  const cloneBase = `/tenant/${encodeURIComponent(tenantId)}/clone`;
  const discoveredPaths = new Set<string>(["/"]);

  const rewritten = bodyHtml.replace(/<a\b([^>]*?)\bhref\s*=\s*(['"])(.*?)\2([^>]*)>/gi, (full, before, quote, hrefRaw, after) => {
    const href = String(hrefRaw ?? "").trim();
    if (!href) return full;

    const lowerHref = href.toLowerCase();
    if (
      lowerHref.startsWith("#") ||
      lowerHref.startsWith("javascript:") ||
      lowerHref.startsWith("mailto:") ||
      lowerHref.startsWith("tel:")
    ) {
      return full;
    }

    let isInternal = false;
    let resolvedPath = "";

    if (href.startsWith("/") || href.startsWith("./")) {
      try {
        const resolved = new URL(href, sourceUrl);
        resolvedPath = toClonePathname(resolved.pathname);
        isInternal = true;
      } catch {
        isInternal = false;
      }
    } else if (/^https?:\/\//i.test(href)) {
      try {
        const target = new URL(href);
        if (target.hostname.toLowerCase() === sourceHost) {
          resolvedPath = toClonePathname(target.pathname);
          isInternal = true;
        }
      } catch {
        isInternal = false;
      }
    }

    if (!isInternal) return full;
    discoveredPaths.add(resolvedPath || "/");

    const rewrittenHref = resolvedPath === "/" ? cloneBase : `${cloneBase}${resolvedPath}`;
    const attrs = `${before}href=${quote}${rewrittenHref}${quote}${after}`;
    const originalAttr = ` data-original-href=${quote}${href}${quote}`;
    const cloneAttr = ` data-clone-link=${quote}true${quote}`;
    return `<a${attrs}${originalAttr}${cloneAttr}>`;
  });
  return { html: rewritten, discoveredPaths: [...discoveredPaths] };
}

function extractTitle(inputHtml: string): string | undefined {
  const m = inputHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = (m?.[1] ?? "").replace(/\s+/g, " ").trim();
  return t || undefined;
}

function extractStylesFromHtml(inputHtml: string): { stylesheetHrefs: string[] } {
  const stylesheetHrefs = new Set<string>();

  const linkRe = /<link\b([^>]*?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(inputHtml)) !== null) {
    const attrs = m[1] ?? "";
    const rel = attrs.match(/\brel\s*=\s*(['"])(.*?)\1/i)?.[2]?.toLowerCase() ?? "";
    if (!rel.includes("stylesheet")) continue;
    const href = attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i)?.[2]?.trim() ?? "";
    if (href) stylesheetHrefs.add(href);
  }

  return { stylesheetHrefs: [...stylesheetHrefs] };
}

async function fetchHtmlWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return fetchSourceAsset(url, {
    timeoutMs,
    assetType: "html",
    referer: `${new URL(url).origin}/`,
  });
}

export async function cloneWebsiteHandler(data: unknown, context: functions.https.CallableContext): Promise<CloneWebsiteResult> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const callerIsAdmin = await isAdmin(context.auth.uid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required");
  }

  const body = (typeof data === "object" && data !== null ? data : {}) as CloneWebsiteRequest;
  const tenantId = (body.tenantId ?? "").trim();
  const urlRaw = (body.url ?? "").trim();
  if (!tenantId) {
    throw new functions.https.HttpsError("invalid-argument", "tenantId is required");
  }

  let stage = "normalize_url";
  let normalizedUrl = "";
  let currentUrl = "";
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  const assetRewriteWarnings: string[] = [];
  const brokenUrlSamples: string[] = [];
  try {
    const sourceUrl = normalizeUrl(urlRaw);
    normalizedUrl = sourceUrl.toString();
    currentUrl = normalizedUrl;
    stage = "load_existing_clone";
    const existingCloneSnap = await admin.firestore().collection("tenantSiteClones").doc(tenantId).get();
    const existingCloneData = (existingCloneSnap.data() ?? {}) as Record<string, unknown>;
    const existingAssetManifest = Array.isArray(existingCloneData.assetManifest)
      ? (existingCloneData.assetManifest as Array<Record<string, unknown>>)
      : [];
    stage = "fetch_root_html";
    const response = await fetchHtmlWithTimeout(sourceUrl.toString(), 10_000);
    httpStatus = response.status;
    contentType = response.headers.get("content-type");
    if (!response.ok) {
      throw new Error(`root_fetch_http_${response.status}`);
    }

    stage = "decode_root_html";
    const rootHtmlRaw = decodeHtmlFromResponseBytes(await response.arrayBuffer(), response.headers.get("content-type"));
  const rootBodyHtml = extractBodyHtml(rootHtmlRaw);
  const rootNoScriptsHtml = removeScripts(absolutizeAssetUrlsInHtml(rootBodyHtml, sourceUrl.toString()));
  const rootRewritten = rewriteInternalLinks(rootNoScriptsHtml, tenantId, sourceUrl);
  const rootTitle = extractTitle(rootHtmlRaw);
  const rootStyles = extractStylesFromHtml(rootHtmlRaw);

  const MAX_PAGES = 10;
  const PAGE_TIMEOUT_MS = 8_000;
  const queue: string[] = [...new Set(rootRewritten.discoveredPaths.map((p) => toClonePathname(p)))];
  if (!queue.includes("/")) queue.unshift("/");
  const visited = new Set<string>();
  const pages: ClonePageRecord[] = [];
  const collectedStylesheets = new Set<string>();
  const cssWarnings: string[] = [];

  for (const href of rootStyles.stylesheetHrefs) {
    try {
      collectedStylesheets.add(new URL(href, sourceUrl).toString());
    } catch {
      cssWarnings.push(`stylesheet_invalid:${href}`);
    }
  }

  stage = "crawl_pages";
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const path = toClonePathname(queue.shift() ?? "/");
    if (visited.has(path)) continue;
    visited.add(path);

    const pageUrl = new URL(path, sourceUrl).toString();
    currentUrl = pageUrl;
    try {
      const pageRes = await fetchHtmlWithTimeout(pageUrl, PAGE_TIMEOUT_MS);
      httpStatus = pageRes.status;
      contentType = pageRes.headers.get("content-type");
      if (!pageRes.ok) {
        pages.push({
          path,
          url: pageUrl,
          sourceUrl: pageUrl,
          title: path === "/" ? rootTitle ?? "" : "",
          html: rootRewritten.html,
          fetchError: `HTTP ${pageRes.status}`,
          status: "error",
        });
        continue;
      }
      const pageHtmlRaw = decodeHtmlFromResponseBytes(await pageRes.arrayBuffer(), pageRes.headers.get("content-type"));
      const pageBody = removeScripts(absolutizeAssetUrlsInHtml(extractBodyHtml(pageHtmlRaw), pageUrl));
      const pageRewritten = rewriteInternalLinks(pageBody, tenantId, sourceUrl);
      const pageStyles = extractStylesFromHtml(pageHtmlRaw);
      for (const href of pageStyles.stylesheetHrefs) {
        try {
          collectedStylesheets.add(new URL(href, pageUrl).toString());
        } catch {
          cssWarnings.push(`stylesheet_invalid:${href}`);
        }
      }
      pages.push({
        path,
        url: pageUrl,
        sourceUrl: pageUrl,
        title: extractTitle(pageHtmlRaw) ?? "",
        html: pageRewritten.html,
        fetchError: "",
        status: "ok",
      });
      for (const discovered of pageRewritten.discoveredPaths) {
        const normalized = toClonePathname(discovered);
        if (!visited.has(normalized) && !queue.includes(normalized) && pages.length + queue.length < MAX_PAGES * 2) {
          queue.push(normalized);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fetch failed";
      pages.push({
        path,
        url: pageUrl,
        sourceUrl: pageUrl,
        title: path === "/" ? rootTitle ?? "" : "",
        html: rootRewritten.html,
        fetchError: msg.slice(0, 180) || "fetch_failed",
        status: "error",
      });
    }
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  const homePage = pages.find((p) => p.path === "/");
  const fallbackHtml = homePage?.html ?? rootRewritten.html;
  const stylesheetUrls = [...collectedStylesheets].sort();
  const cssText = "";
  const htmlWithManifest = applyAssetManifestReplacements(fallbackHtml, existingAssetManifest);
  const pagesWithManifest: ClonePageRecord[] = pages.map((p) => ({
    path: p.path || "/",
    url: p.url || "",
    sourceUrl: p.sourceUrl || "",
    title: p.title || "",
    html: applyAssetManifestReplacements(p.html || "", existingAssetManifest),
    fetchError: p.fetchError || "",
    status: p.status ?? "ok",
  }));
  const documentHtml = buildDocumentHtml(rootHtmlRaw, htmlWithManifest, cssText, sourceUrl);

  stage = "self_contained_assets";
  const bucket = admin.storage().bucket();
  const assetMap = new Map<string, string>();
  const fetchedCssUrls: string[] = [];
  let importedCssCount = 0;
  let importedFontCount = 0;

  const storeRemoteAsset = async (absoluteUrl: string, kind: "generic" | "css" | "font"): Promise<string | null> => {
    const normalized = absoluteUrl.trim();
    if (!normalized) return null;
    if (assetMap.has(normalized)) return assetMap.get(normalized) ?? null;
    let response: Response;
    try {
      response = await fetchBinaryAsset(normalized, sourceUrl.toString());
    } catch (e) {
      assetRewriteWarnings.push(`asset_fetch_error:${normalized}:${e instanceof Error ? e.message : "unknown"}`);
      if (brokenUrlSamples.length < 8) brokenUrlSamples.push(normalized);
      return null;
    }
    if (!response.ok) {
      assetRewriteWarnings.push(`asset_http_${response.status}:${normalized}`);
      if (brokenUrlSamples.length < 8) brokenUrlSamples.push(normalized);
      return null;
    }
    const ct = response.headers.get("content-type");
    const contentLen = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLen) && contentLen > MAX_ASSET_BYTES) {
      assetRewriteWarnings.push(`asset_too_large_header:${normalized}`);
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_ASSET_BYTES) {
      assetRewriteWarnings.push(`asset_too_large_body:${normalized}`);
      return null;
    }
    const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 24);
    const ext = extensionFromContentType(ct, normalized);
    const objectPath = `tenantSiteClones/${tenantId}/assets/${hash}.${ext}`;
    const token = randomUUID();
    await bucket.file(objectPath).save(bytes, {
      resumable: false,
      contentType: ct ?? undefined,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          originalUrl: normalized,
        },
      },
    });
    const storageUrl = buildStorageDownloadUrl(bucket.name, objectPath, token);
    assetMap.set(normalized, storageUrl);
    if (kind === "css") importedCssCount += 1;
    if (kind === "font") importedFontCount += 1;
    return storageUrl;
  };

  for (const cssUrl of stylesheetUrls) {
    let cssBody = "";
    try {
      const cssRes = await fetchBinaryAsset(cssUrl, sourceUrl.toString());
      if (!cssRes.ok) {
        assetRewriteWarnings.push(`css_http_${cssRes.status}:${cssUrl}`);
        if (brokenUrlSamples.length < 8) brokenUrlSamples.push(cssUrl);
        continue;
      }
      cssBody = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(await cssRes.arrayBuffer()));
    } catch (e) {
      assetRewriteWarnings.push(`css_fetch_error:${cssUrl}:${e instanceof Error ? e.message : "unknown"}`);
      if (brokenUrlSamples.length < 8) brokenUrlSamples.push(cssUrl);
      continue;
    }
    if (!cssBody.trim()) continue;
    const refs = extractCssUrlRefs(cssBody);
    for (const refRaw of refs) {
      const resolved = resolveAgainstBase(refRaw, cssUrl);
      if (!resolved) continue;
      const isFont = /\.(woff2?|ttf|otf|eot|svg)(\?|#|$)/i.test(resolved);
      await storeRemoteAsset(resolved, isFont ? "font" : "generic");
    }
    const rewrittenCssBody = cssBody.replace(/url\(([^)]+)\)/gi, (full, rawRef) => {
      const cleaned = sanitizeAttrUrl(String(rawRef ?? ""));
      if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("blob:") || cleaned.startsWith("#")) return full;
      const resolved = resolveAgainstBase(cleaned, cssUrl);
      if (!resolved) return full;
      const replacement = assetMap.get(resolved);
      if (!replacement) return full;
      return `url("${replacement}")`;
    });
    const cssBytes = Buffer.from(rewrittenCssBody, "utf8");
    const cssHash = createHash("sha1").update(cssBytes).digest("hex").slice(0, 24);
    const cssObjectPath = `tenantSiteClones/${tenantId}/assets/${cssHash}.css`;
    const cssToken = randomUUID();
    await bucket.file(cssObjectPath).save(cssBytes, {
      resumable: false,
      contentType: "text/css; charset=utf-8",
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: cssToken,
          originalUrl: cssUrl,
        },
      },
    });
    const cssStorageUrl = buildStorageDownloadUrl(bucket.name, cssObjectPath, cssToken);
    fetchedCssUrls.push(cssStorageUrl);
    assetMap.set(cssUrl, cssStorageUrl);
    importedCssCount += 1;
  }

  for (const page of pagesWithManifest) {
    const pageAssets = extractAssetUrlsFromHtml(page.html, page.url || sourceUrl.toString());
    for (const assetUrl of pageAssets) {
      await storeRemoteAsset(assetUrl, "generic");
    }
  }

  const rewrittenPages = pagesWithManifest.map((p) => ({
    ...p,
    html: rewriteHtmlWithAssetMap(p.html, assetMap),
  }));
  const rewrittenHomeHtml =
    rewrittenPages.find((p) => p.path === "/")?.html ?? rewrittenPages[0]?.html ?? htmlWithManifest;

  let selfContainedDocumentHtml = rewriteHtmlWithAssetMap(documentHtml, assetMap);
  selfContainedDocumentHtml = selfContainedDocumentHtml.replace(/<link\b[^>]*rel\s*=\s*(['"])[^'"]*stylesheet[^'"]*\1[^>]*>/gi, "");
  // Ensure head links use storage CSS URLs when imported.
  if (fetchedCssUrls.length > 0) {
    const cssLinks = fetchedCssUrls
      .map((href) => `<link rel="stylesheet" href="${href}" data-clone-link-style="true">`)
      .join("\n");
    if (/<head\b[^>]*>/i.test(selfContainedDocumentHtml)) {
      selfContainedDocumentHtml = selfContainedDocumentHtml.replace(/<head\b[^>]*>/i, (m) => `${m}\n${cssLinks}\n`);
    }
  }

  stage = "persist_clone";
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = admin.firestore().collection("tenantSiteClones").doc(tenantId);
  const clonePayloadRaw = {
    tenantId,
    sourceUrl: sourceUrl.toString(),
    normalizedUrl: normalizedUrl,
    pages: rewrittenPages,
    html: rewrittenHomeHtml,
    documentHtml,
    selfContainedDocumentHtml,
    cssText,
    styles: fetchedCssUrls.length > 0 ? fetchedCssUrls : stylesheetUrls,
    cssWarnings: cssWarnings.filter((w) => !/^css_http_406/i.test(w)),
    importedAssetCount: assetMap.size,
    importedCssCount,
    importedFontCount,
    assetRewriteWarnings: assetRewriteWarnings.slice(0, 100),
    brokenUrlSamples: brokenUrlSamples.slice(0, 12),
    createdByUid: context.auth.uid,
    updatedAt: now,
  };
  const clonePayload = stripUndefinedDeep(clonePayloadRaw) as Record<string, unknown>;
  await docRef.set(
    clonePayload,
    { merge: true },
  );

  stage = "return_result";
  return {
    ok: true,
    tenantId,
    sourceUrl: normalizedUrl,
    pages: rewrittenPages,
    html: rewrittenHomeHtml,
    documentHtml,
    selfContainedDocumentHtml,
    cssText,
    styles: fetchedCssUrls.length > 0 ? fetchedCssUrls : stylesheetUrls,
    cssWarnings: cssWarnings.filter((w) => !/^css_http_406/i.test(w)),
    importedAssetCount: assetMap.size,
    importedCssCount,
    importedFontCount,
    assetRewriteWarnings: assetRewriteWarnings.slice(0, 100),
    brokenUrlSamples: brokenUrlSamples.slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  } catch (error) {
    const message = error instanceof Error ? error.message : "cloneWebsite failed";
    throw new functions.https.HttpsError("internal", "cloneWebsite failed", {
      stage,
      sourceUrl: urlRaw || null,
      normalizedUrl: normalizedUrl || null,
      currentUrl: currentUrl || null,
      httpStatus,
      contentType,
      message: message.slice(0, 500),
    });
  }
}
