/**
 * SEO Redirect Resolver (Phase 1 – test endpoint only)
 *
 * Applies 301/410 redirects ONLY for onboarded domains when an explicit rule matches.
 * Otherwise pass-through (no redirect). Used behind /__seo_redirect_test__/** only.
 *
 * VERIFICATION (after deploy):
 *   # Direct function URL (replace PROJECT_ID and REGION):
 *   curl -I "https://REGION-PROJECT_ID.cloudfunctions.net/seoRedirectResolver" \
 *     -H "Host: customer-domain.tld" \
 *     --path-as-is -- "https://customer-domain.tld/__seo_redirect_test__/old-path"
 *
 *   # Via Hosting (if rewrite is live on main site):
 *   curl -I "https://YOUR-HOSTING-DOMAIN/__seo_redirect_test__/old-path" \
 *     -H "Host: customer-domain.tld"
 *
 * Expected:
 *   - Domain not in seoDomains or enabled=false -> 200, no redirect
 *   - Domain enabled + rule 301 -> 301 with Location: newUrl
 *   - Domain enabled + rule 410 -> 410
 *   - Excluded path (e.g. /assets/...) -> 200, no redirect
 *
 * Path normalization (all resolve to same rule key /old-path):
 *   .../__seo_redirect_test__/old-path/     (trailing slash removed)
 *   .../__seo_redirect_test__//old-path     (slashes collapsed)
 *   .../__seo_redirect_test__/old-path?x=1 (query ignored for match)
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

const TEST_PREFIX = "/__seo_redirect_test__";

/** Normalize host: lowercase, strip port. Keep www as-is. */
export function normalizeHost(hostHeader: string | undefined): string {
  if (!hostHeader || typeof hostHeader !== "string") return "";
  const s = hostHeader.trim().toLowerCase();
  const portIdx = s.indexOf(":");
  return portIdx === -1 ? s : s.slice(0, portIdx);
}

/**
 * Normalize path: leading "/", decode safe chars, collapse slashes, remove trailing "/" except root.
 * Query string is ignored for matching (per spec).
 */
export function normalizePath(path: string): string {
  if (!path || typeof path !== "string") return "/";
  let s = path.trim();
  if (!s.startsWith("/")) s = "/" + s;
  try {
    s = decodeURIComponent(s);
  } catch {
    // leave as-is if invalid
  }
  s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
}

/** Paths that must never be redirected; pass-through only. */
const EXCLUDED_EXACT = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-index.xml",
]);

const EXCLUDED_PREFIXES = [
  "/assets/",
  "/static/",
  "/_next/",
  "/favicon",
  "/manifest",
  "/icons/",
];

export function isExcludedPath(path: string): boolean {
  const p = path.toLowerCase();
  if (EXCLUDED_EXACT.has(p)) return true;
  return EXCLUDED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Strip test prefix from path so we look up the logical path in Firestore.
 * E.g. /__seo_redirect_test__/old-page -> /old-page
 */
function pathForLookup(requestPath: string): string {
  const normalized = normalizePath(requestPath);
  if (normalized.startsWith(TEST_PREFIX + "/") || normalized === TEST_PREFIX) {
    const after = normalized.slice(TEST_PREFIX.length) || "/";
    return normalizePath(after);
  }
  return normalized;
}

/**
 * Resolve newUrl to absolute: if relative, prepend https://host
 */
function resolveRedirectUrl(newUrl: string, host: string): string {
  const u = (newUrl || "").trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const path = u.startsWith("/") ? u : "/" + u;
  return `https://${host}${path}`;
}

export const seoRedirectResolver = functions.https.onRequest(async (req, res) => {
  const hostHeader = req.get("host");
  const host = normalizeHost(hostHeader);
  const rawPath = req.path || req.url?.split("?")[0] || "/";
  const pathForRules = pathForLookup(rawPath);

  const logCtx = {
    host,
    path: pathForRules,
    rawPath,
  };

  // Only handle requests that came via the test prefix (safety: no impact on other routes)
  if (!rawPath.startsWith(TEST_PREFIX)) {
    res.status(404).send("Not Found");
    return;
  }

  if (isExcludedPath(pathForRules)) {
    functions.logger.info("[seoRedirectResolver]", {
      ...logCtx,
      domainEnabled: "skip",
      match: "no",
      reason: "excluded_path",
    });
    res.status(200).send("OK");
    return;
  }

  let _domainEnabled = false;
  try {
    const domainDoc = await db.collection("seoDomains").doc(host).get();
    if (!domainDoc.exists) {
      functions.logger.info("[seoRedirectResolver]", {
        ...logCtx,
        domainEnabled: false,
        match: "no",
        status: "pass-through",
      });
      res.status(200).send("OK");
      return;
    }
    const domainData = domainDoc.data();
    if (!domainData?.enabled) {
      functions.logger.info("[seoRedirectResolver]", {
        ...logCtx,
        domainEnabled: false,
        match: "no",
        status: "pass-through",
      });
      res.status(200).send("OK");
      return;
    }
    _domainEnabled = true;
  } catch (err) {
    functions.logger.warn("[seoRedirectResolver] Firestore domain lookup failed", {
      ...logCtx,
      error: String(err),
    });
    res.status(200).send("OK");
    return;
  }

  try {
    const redirectsRef = db.collection("seoDomains").doc(host).collection("redirects");
    const snapshot = await redirectsRef
      .where("oldPath", "==", pathForRules)
      .where("enabled", "==", true)
      .orderBy("priority", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      functions.logger.info("[seoRedirectResolver]", {
        ...logCtx,
        domainEnabled: _domainEnabled,
        match: "no",
        status: "pass-through",
      });
      res.status(200).send("OK");
      return;
    }

    const rule = snapshot.docs[0].data();
    const status = rule.status;
    const newUrl = rule.newUrl;

    if (status === 301) {
      const location = newUrl && (String(newUrl).startsWith("http://") || String(newUrl).startsWith("https://"))
        ? String(newUrl).trim()
        : resolveRedirectUrl(String(newUrl || "/"), host);
      functions.logger.info("[seoRedirectResolver]", {
        ...logCtx,
        domainEnabled: _domainEnabled,
        match: "yes",
        status: 301,
        location,
      });
      res.setHeader("Location", location);
      res.status(301).send("Moved Permanently");
      return;
    }

    if (status === 410) {
      functions.logger.info("[seoRedirectResolver]", {
        ...logCtx,
        domainEnabled: _domainEnabled,
        match: "yes",
        status: 410,
      });
      res.status(410).send("Gone");
      return;
    }

    // Unknown status: pass-through
    functions.logger.info("[seoRedirectResolver]", {
      ...logCtx,
      domainEnabled: _domainEnabled,
      match: "yes",
      status: "unknown",
      ruleStatus: status,
    });
    res.status(200).send("OK");
  } catch (err) {
    functions.logger.warn("[seoRedirectResolver] Redirect lookup failed", {
      ...logCtx,
      domainEnabled: _domainEnabled,
      error: String(err),
    });
    res.status(200).send("OK");
  }
});
