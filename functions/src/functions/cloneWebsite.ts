import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

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
  updatedAt: string;
};

function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim();
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

function extractBodyHtml(inputHtml: string): string {
  const bodyMatch = inputHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) return bodyMatch[1];
  return inputHtml;
}

function removeScripts(inputHtml: string): string {
  return inputHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
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

async function fetchHtmlWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "RentACarCloneBot/1.0",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
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

  const sourceUrl = normalizeUrl(urlRaw);
  const response = await fetchHtmlWithTimeout(sourceUrl.toString(), 10_000);

  if (!response.ok) {
    throw new functions.https.HttpsError("failed-precondition", `Failed to fetch website: HTTP ${response.status}`);
  }

  const rootHtmlRaw = await response.text();
  const rootBodyHtml = extractBodyHtml(rootHtmlRaw);
  const rootNoScriptsHtml = removeScripts(rootBodyHtml);
  const rootRewritten = rewriteInternalLinks(rootNoScriptsHtml, tenantId, sourceUrl);
  const rootTitle = extractTitle(rootHtmlRaw);

  const MAX_PAGES = 10;
  const PAGE_TIMEOUT_MS = 8_000;
  const queue: string[] = [...new Set(rootRewritten.discoveredPaths.map((p) => toClonePathname(p)))];
  if (!queue.includes("/")) queue.unshift("/");
  const visited = new Set<string>();
  const pages: Array<{ path: string; title?: string; html: string; fetchError?: string }> = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const path = toClonePathname(queue.shift() ?? "/");
    if (visited.has(path)) continue;
    visited.add(path);

    const pageUrl = new URL(path, sourceUrl).toString();
    try {
      const pageRes = await fetchHtmlWithTimeout(pageUrl, PAGE_TIMEOUT_MS);
      if (!pageRes.ok) {
        pages.push({
          path,
          title: path === "/" ? rootTitle : undefined,
          html: rootRewritten.html,
          fetchError: `HTTP ${pageRes.status}`,
        });
        continue;
      }
      const pageHtmlRaw = await pageRes.text();
      const pageBody = removeScripts(extractBodyHtml(pageHtmlRaw));
      const pageRewritten = rewriteInternalLinks(pageBody, tenantId, sourceUrl);
      pages.push({
        path,
        title: extractTitle(pageHtmlRaw),
        html: pageRewritten.html,
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
        title: path === "/" ? rootTitle : undefined,
        html: rootRewritten.html,
        fetchError: msg.slice(0, 180),
      });
    }
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  const homePage = pages.find((p) => p.path === "/");
  const fallbackHtml = homePage?.html ?? rootRewritten.html;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = admin.firestore().collection("tenantSiteClones").doc(tenantId);
  await docRef.set(
    {
      tenantId,
      sourceUrl: sourceUrl.toString(),
      pages,
      html: fallbackHtml,
      createdByUid: context.auth.uid,
      updatedAt: now,
    },
    { merge: true },
  );

  return {
    ok: true,
    tenantId,
    sourceUrl: sourceUrl.toString(),
    pages,
    html: fallbackHtml,
    updatedAt: new Date().toISOString(),
  };
}
