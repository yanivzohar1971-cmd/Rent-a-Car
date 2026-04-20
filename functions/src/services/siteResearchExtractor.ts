/**
 * Bounded, same-origin HTML research for tenant site builder URL import.
 * No headless browser — HTML/text/metadata only.
 */

export type SiteResearchMode = "homepage" | "site";

export type SiteResearchOptions = {
  includeSubpages?: boolean;
  maxPages?: number;
  mode?: SiteResearchMode;
};

export type SiteResearchInternalLink = {
  href: string;
  text: string;
};

export type SiteResearchPage = {
  url: string;
  fetchedOk: boolean;
  status?: number;
  error?: string;
  title?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  themeColor?: string;
  canonical?: string;
  navLabels: string[];
  headingLines: string[];
  footerText?: string;
  /** Trimmed visible text sample (bounded). */
  mainTextSample: string;
  internalLinks: SiteResearchInternalLink[];
};

export type SiteResearchBundle = {
  startUrl: string;
  origin: string;
  pages: SiteResearchPage[];
  warnings: string[];
};

const FETCH_TIMEOUT_MS = 14_000;
const MAX_HTML_CHARS = 1_200_000;
const MAX_TEXT_SAMPLE = 12_000;
const MAX_NAV_LABELS = 40;
const MAX_HEADINGS = 30;
const MAX_INTERNAL_LINKS_STORED = 80;

const SKIP_PATH_RE =
  /login|sign-?in|sign-?up|register|logout|cart|checkout|account|admin|dashboard|wp-admin|password|oauth|authorize|2fa|mfa|billing|payment|thank-?you|404|500/i;

const HIGH_VALUE_HINTS: RegExp[] = [
  /\babout\b/i,
  /\bcontact\b/i,
  /\bfinance|financing|leasing\b/i,
  /\bservice|services\b/i,
  /\binventory|vehicles|cars|stock|catalog|showroom\b/i,
  /\btestimonial|review|rating\b/i,
  /\bgallery|photos\b/i,
  /\bfaq\b/i,
];

export function normalizePublicHttpUrl(raw: string): URL {
  const t = raw.trim();
  if (!t) throw new Error("URL is empty");
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const u = new URL(withScheme);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported");
  }
  u.hash = "";
  return u;
}

function stripBoilerplateHtml(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--([\s\S]*?)-->/g, " ");
  return s;
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : "";
    });
}

function stripTagsToText(html: string): string {
  const s = stripBoilerplateHtml(html).replace(/<[^>]+>/g, " ");
  const t = decodeBasicEntities(s).replace(/\s+/g, " ").trim();
  return t.length > MAX_TEXT_SAMPLE ? t.slice(0, MAX_TEXT_SAMPLE) : t;
}

function pickFirstMatch(html: string, re: RegExp): string | undefined {
  const m = re.exec(html);
  if (!m || typeof m[1] !== "string") return undefined;
  const v = decodeBasicEntities(m[1].replace(/\s+/g, " ").trim());
  return v || undefined;
}

function extractMetaContent(html: string, nameOrProp: { name?: string; property?: string }): string | undefined {
  const attr = nameOrProp.name ? "name" : "property";
  const val = nameOrProp.name ?? nameOrProp.property ?? "";
  const esc = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+${attr}\\s*=\\s*["']${esc}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
    "i",
  );
  const m = re.exec(html);
  if (m?.[1]) return decodeBasicEntities(m[1].replace(/\s+/g, " ").trim()) || undefined;
  const re2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*${attr}\\s*=\\s*["']${esc}["'][^>]*>`,
    "i",
  );
  const m2 = re2.exec(html);
  if (m2?.[1]) return decodeBasicEntities(m2[1].replace(/\s+/g, " ").trim()) || undefined;
  return undefined;
}

function extractTitle(html: string): string | undefined {
  return pickFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
}

function extractNavLabels(html: string): string[] {
  const navMatch = /<nav\b[^>]*>([\s\S]*?)<\/nav>/i.exec(html);
  const slice = navMatch ? navMatch[1] : html.slice(0, 120_000);
  const labels: string[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const inner = stripTagsToText(m[2] || "");
    const t = inner.trim();
    if (t && t.length <= 120 && !labels.includes(t)) labels.push(t);
    if (labels.length >= MAX_NAV_LABELS) break;
  }
  return labels;
}

function extractHeadings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTagsToText(m[1] || "").trim();
    if (t && t.length <= 240) out.push(t);
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

function extractFooterText(html: string): string | undefined {
  const matches = [...html.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)];
  if (matches.length === 0) return undefined;
  const last = matches[matches.length - 1];
  const t = stripTagsToText(last[1] || "").trim();
  if (!t) return undefined;
  return t.length > 4000 ? t.slice(0, 4000) : t;
}

function resolveHref(base: URL, href: string): URL | null {
  try {
    const u = new URL(href.trim(), base);
    u.hash = "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname !== base.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

function shouldSkipPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (!p || p === "/") return false;
  return SKIP_PATH_RE.test(p);
}

function scorePageCandidate(u: URL, linkText: string): number {
  const blob = `${u.pathname} ${u.search} ${linkText}`.toLowerCase();
  let score = 0;
  for (const rx of HIGH_VALUE_HINTS) {
    if (rx.test(blob)) score += 6;
  }
  const depth = u.pathname.split("/").filter(Boolean).length;
  if (depth <= 2) score += 1;
  if (depth > 5) score -= 4;
  if (/page=\d+|p=\d+|offset=\d+/i.test(u.search)) score -= 5;
  return score;
}

function extractInternalLinks(html: string, base: URL): SiteResearchInternalLink[] {
  const out: SiteResearchInternalLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const resolved = resolveHref(base, m[1] || "");
    if (!resolved) continue;
    if (shouldSkipPath(resolved.pathname)) continue;
    const text = stripTagsToText(m[2] || "").trim().slice(0, 200);
    const key = resolved.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href: resolved.toString(), text });
    if (out.length >= MAX_INTERNAL_LINKS_STORED) break;
  }
  return out;
}

function rankFollowUrls(home: URL, links: SiteResearchInternalLink[], limit: number): string[] {
  const scored = links
    .map((l) => {
      const u = resolveHref(home, l.href);
      if (!u) return { url: "", score: -999 };
      if (u.toString() === home.toString()) return { url: "", score: -999 };
      return { url: u.toString(), score: scorePageCandidate(u, l.text) };
    })
    .filter((x) => x.url && x.score > -100);
  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    out.push(row.url);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHtml(url: string, warnings: string[]): Promise<{ ok: boolean; status?: number; html: string; error?: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": "RentACarTenantSiteResearch/1.0 (admin URL import)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    const status = res.status;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      warnings.push(`Non-HTML content-type for ${url}: ${ct || "unknown"}`);
    }
    let text = await res.text();
    if (text.length > MAX_HTML_CHARS) {
      text = text.slice(0, MAX_HTML_CHARS);
      warnings.push(`HTML truncated to ${MAX_HTML_CHARS} chars for ${url}`);
    }
    if (!res.ok) {
      return { ok: false, status, html: text, error: `HTTP ${status}` };
    }
    return { ok: true, status, html: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    warnings.push(`Fetch error for ${url}: ${msg}`);
    return { ok: false, html: "", error: msg };
  } finally {
    clearTimeout(t);
  }
}

function buildPageRecord(url: string, fetched: { ok: boolean; status?: number; html: string; error?: string }): SiteResearchPage {
  const html = fetched.html || "";
  const base = new URL(url);
  const textSample = html ? stripTagsToText(html).slice(0, MAX_TEXT_SAMPLE) : "";
  const internalLinks = html ? extractInternalLinks(html, base) : [];
  if (!fetched.ok) {
    return {
      url,
      fetchedOk: false,
      status: fetched.status,
      error: fetched.error,
      navLabels: [],
      headingLines: [],
      mainTextSample: "",
      internalLinks,
    };
  }
  return {
    url,
    fetchedOk: true,
    status: fetched.status,
    title: extractTitle(html),
    metaDescription: extractMetaContent(html, { name: "description" }) ?? extractMetaContent(html, { name: "twitter:description" }),
    ogTitle: extractMetaContent(html, { property: "og:title" }),
    ogDescription: extractMetaContent(html, { property: "og:description" }),
    ogImage: extractMetaContent(html, { property: "og:image" }),
    themeColor: extractMetaContent(html, { name: "theme-color" }),
    canonical: extractMetaContent(html, { property: "og:url" }) || pickFirstMatch(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i),
    navLabels: extractNavLabels(html),
    headingLines: extractHeadings(html),
    footerText: extractFooterText(html),
    mainTextSample: textSample,
    internalLinks,
  };
}

/**
 * Fetches homepage and (optionally) a bounded set of same-origin internal pages.
 */
export async function researchTenantWebsite(startUrlInput: string, options?: SiteResearchOptions): Promise<SiteResearchBundle> {
  const warnings: string[] = [];
  const start = normalizePublicHttpUrl(startUrlInput);
  const mode = options?.mode ?? "site";
  const includeSubpages = options?.includeSubpages !== false;
  const maxPagesRaw = typeof options?.maxPages === "number" && Number.isFinite(options.maxPages) ? options.maxPages : 5;
  const maxPages = Math.max(1, Math.min(12, Math.floor(maxPagesRaw)));

  const origin = `${start.protocol}//${start.hostname}`;
  const pages: SiteResearchPage[] = [];

  const homeFetch = await fetchHtml(start.toString(), warnings);
  const homePage = buildPageRecord(start.toString(), homeFetch);
  pages.push(homePage);

  const wantExtra =
    includeSubpages &&
    mode !== "homepage" &&
    maxPages > 1 &&
    homeFetch.ok &&
    (homeFetch.html?.length ?? 0) > 0;

  if (!wantExtra) {
    return { startUrl: start.toString(), origin, pages, warnings };
  }

  const ranked = rankFollowUrls(start, homePage.internalLinks, (maxPages - 1) * 4);
  const slice = ranked.slice(0, maxPages - 1);
  for (const u of slice) {
    const f = await fetchHtml(u, warnings);
    pages.push(buildPageRecord(u, f));
  }

  return { startUrl: start.toString(), origin, pages, warnings };
}
