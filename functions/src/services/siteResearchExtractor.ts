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

/** Deterministic homepage-only layout/visual hints (HTML heuristics). */
export type SiteResearchLayoutSignals = {
  heroImagesDetectedCount: number;
  heroSliderDetected: boolean;
  carsCarouselDetected: boolean;
  primaryCtaBackgroundColor?: string;
  primaryCtaTextColor?: string;
  layoutPatternsDetected: string[];
  /** Same-origin header/nav logo image URLs, ranked (max 5). */
  logoCandidates: { url: string; score: number }[];
  /** When no logo candidate clears confidence bar. */
  websiteLogoRejectedReason?: string;
};

/** Deterministic homepage brand/business name hints (compact; for model + merge + DEBUG). */
export type SiteResearchBusinessNameSource =
  | "header"
  | "logoAlt"
  | "ogSiteName"
  | "ogTitle"
  | "jsonLdOrganization"
  | "title"
  | "footer"
  | "existingConfig"
  | "domainFallback";

export type SiteResearchBusinessNameSignals = {
  /** Best single label to prefer over URL/domain-shaped defaults when confidence allows. */
  resolvedBusinessName?: string;
  businessNameSource?: SiteResearchBusinessNameSource;
  /** Distinct candidates considered before picking `resolvedBusinessName`. */
  businessNameCandidatesCount: number;
  domainFallbackUsed: boolean;
  /** 0–100 heuristic confidence for `resolvedBusinessName` (domain fallback is always low). */
  businessNameConfidence?: number;
  /** Raw heuristic score of the chosen candidate (before confidence mapping). */
  businessNameResolutionScore?: number;
  /** Compact trace for admin DEBUG (mirrors merge fields). */
  businessNameChosenDebug?: {
    chosenBusinessName: string;
    source: SiteResearchBusinessNameSource;
    score: number;
    confidence: number;
    domainFallbackUsed: boolean;
    candidatesCount: number;
  };
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
  /** Heuristic tags (e.g. about, contact) to steer URL→builder mapping. */
  researchHints: string[];
  /**
   * Homepage-only: same-origin hero/banner-sized image URLs inferred from HTML (slider/carousel area, large imgs).
   * Used to constrain URL-import hero arrays — not persisted to tenant config.
   */
  heroBannerImageCandidates?: string[];
  /** Homepage-only: bounded layout heuristics for URL import + DEBUG. */
  layoutSignals?: SiteResearchLayoutSignals;
  /** Homepage-only: brand/business name heuristics (header/meta/OG/footer vs domain fallback). */
  businessNameSignals?: SiteResearchBusinessNameSignals;
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
  /\blocation|directions|visit|hours\b/i,
  /אודות|צור קשר|יצירת קשר|מימון|המלצות|ביקורות|מלאי|רכבים|סניף|מיקום|דרכים|שעות פעילות/i,
];

/** Single bucket per URL for diversity pass (first match wins in declaration order). */
type ResearchPageBucket = "testimonials" | "contact" | "finance" | "about" | "inventory" | "other";

function classifyResearchPageBucket(url: string, linkText: string): ResearchPageBucket {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const blob = `${path} ${url} ${linkText}`.toLowerCase();

  if (
    /\b(testimonial|testimonials|reviews?|customers say|rating)\b|המלצות|ביקורות|חוות דעת|לקוחות מספרים/i.test(
      blob,
    )
  ) {
    return "testimonials";
  }
  if (/\b(contact|reach|locations?|visit-us|get-in-touch)\b|צור קשר|יצירת קשר|השארת פרטים|משרד|סניף/i.test(blob)) {
    return "contact";
  }
  if (/\b(finance|financing|leasing|credit|loan|payments?)\b|מימון|אשראי|תשלומים|ליסינג/i.test(blob)) {
    return "finance";
  }
  if (/\b(about|company|who-we|our-story|team)\b|אודות|מי אנחנו|על החברה|הסיפור שלנו/i.test(blob)) {
    return "about";
  }
  if (/\b(inventory|vehicles|cars|stock|catalog|showroom|used-cars)\b|מלאי|רכבים|קטלוג|מחסן/i.test(blob)) {
    return "inventory";
  }
  return "other";
}

function computeResearchHints(url: string, linkFromHomepage?: string): string[] {
  const hints = new Set<string>();
  const bucket = classifyResearchPageBucket(url, linkFromHomepage ?? "");
  if (bucket !== "other") hints.add(bucket);
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (path === "/" || path === "") hints.add("home");
  return [...hints];
}

function buildResolvedLinkTextMap(base: URL, links: SiteResearchInternalLink[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of links) {
    const resolved = resolveHref(base, l.href);
    if (!resolved) continue;
    const key = resolved.toString();
    const t = (l.text || "").trim();
    if (!t) continue;
    const prev = m.get(key);
    if (!prev || t.length > prev.length) m.set(key, t);
  }
  return m;
}

/**
 * Prefer one URL each for about / contact / finance / testimonials when discoverable,
 * then fill remaining slots from the ranked list.
 */
function pickDiverseSubpageUrls(
  home: URL,
  links: SiteResearchInternalLink[],
  rankedUrls: string[],
  limit: number,
): string[] {
  if (limit <= 0) return [];
  const linkTextByUrl = buildResolvedLinkTextMap(home, links);
  const bucketOrder: ResearchPageBucket[] = ["about", "contact", "finance", "testimonials", "inventory"];
  const bucketChosen = new Map<ResearchPageBucket, string>();

  for (const url of rankedUrls) {
    const lt = linkTextByUrl.get(url) || "";
    const b = classifyResearchPageBucket(url, lt);
    if (b === "other") continue;
    if (!bucketChosen.has(b)) bucketChosen.set(b, url);
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const b of bucketOrder) {
    const u = bucketChosen.get(b);
    if (u && !seen.has(u)) {
      out.push(u);
      seen.add(u);
      if (out.length >= limit) return out;
    }
  }
  for (const url of rankedUrls) {
    if (seen.has(url)) continue;
    out.push(url);
    seen.add(url);
    if (out.length >= limit) break;
  }
  return out;
}

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
  const semantic = [...html.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)];
  /** Many legacy ASP/PHP templates use `<div class="footer">` instead of `<footer>`. */
  const divBlocks = [...html.matchAll(/<div\b[^>]*\bclass=["'][^"']*\bfooter\b[^"']*["'][^>]*>([\s\S]{0,20000})/gi)];
  const chunks: string[] = [];
  if (semantic.length) chunks.push(semantic[semantic.length - 1][1] || "");
  if (divBlocks.length) chunks.push(divBlocks[divBlocks.length - 1][1] || "");
  if (chunks.length === 0) return undefined;
  const t = stripTagsToText(chunks.join("\n")).trim();
  if (!t) return undefined;
  return t.length > 4000 ? t.slice(0, 4000) : t;
}

const GENERIC_BRAND_DISCARD =
  /^(דף הבית|בית|home|welcome|יצירת קשר|contact|אודות|about|תפריט|menu|search|חיפוש)$/i;
const RENTAL_TITLE_SEGMENT_BOILERPLATE =
  /^(השכרת רכב|לב השכרת רכב|מכירת רכב|סוכנות\s+השכרת\s+רכבים|סוכנות\s+רכב|car\s*rental|rent\s*a\s*car|leasing)$/i;
const GENERIC_LOGO_ALT =
  /^(לוגו החברה|לוגו|company\s*logo|site\s*logo|logo|image|תמונה|אתר|website)$/i;

function looksLikeImageFilenameAlt(s: string): boolean {
  const t = s.trim();
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?[^/]*)?$/i.test(t) && t.length < 48;
}

function isGenericLogoAlt(s: string): boolean {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (GENERIC_LOGO_ALT.test(t)) return true;
  return false;
}

/** Strip trailing rental-agency boilerplate while keeping real brand tokens (e.g. "הגר השכרת רכב" → "הגר"). */
function stripTrailingRentalBrandNoise(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const patterns: RegExp[] = [
    /\s+השכרת\s+רכב\s*$/u,
    /\s+סוכנות\s+רכב\s*$/u,
    /\s+car\s+rental\s*$/iu,
    /\s+rent\s+a\s+car\s*$/iu,
  ];
  let prev = "";
  while (prev !== t) {
    prev = t;
    for (const re of patterns) t = t.replace(re, "").trim();
  }
  return t.replace(/\s+/g, " ").trim();
}

function extractJsonLdOrganizationNames(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || "").trim();
    if (!raw || raw.length > 120_000) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const x of node) visit(x);
        return;
      }
      const o = node as Record<string, unknown>;
      const type = o["@type"];
      const types = Array.isArray(type) ? type.map((x) => String(x).toLowerCase()) : [String(type || "").toLowerCase()];
      const looksOrg = types.some((t) =>
        ["organization", "localbusiness", "automotivebusiness", "cardealer", "store", "corporation"].some((k) => t.includes(k)),
      );
      if (looksOrg) {
        for (const k of ["name", "legalName", "alternateName"] as const) {
          const v = o[k];
          if (typeof v === "string") {
            const t0 = decodeBasicEntities(v.replace(/\s+/g, " ").trim());
            const nk = t0.toLowerCase();
            if (t0.length >= 2 && t0.length <= 100 && !GENERIC_BRAND_DISCARD.test(t0) && !seen.has(nk)) {
              seen.add(nk);
              out.push(t0);
            }
          }
        }
      }
      for (const v of Object.values(o)) visit(v);
    };
    visit(data);
  }
  return out.slice(0, 6);
}

/** Shallow `<div class="...logo...">...</div>` blocks (header/nav area). */
function extractLogoDivInnerSnippets(html: string): string[] {
  const slice = headerBrandHtmlSlice(html);
  const out: string[] = [];
  const re = /<div\b[^>]*\bclass\s*=\s*["']([^"']*)["'][^>]*>([\s\S]{0,1200}?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const cls = (m[1] || "").toLowerCase();
    if (!/\blogo\b/i.test(cls) && !/\b(site-branding|branding|brand-mark)\b/i.test(cls)) continue;
    out.push(m[2] || "");
    if (out.length >= 8) break;
  }
  return out;
}

function extractTextsFromLogoSnippet(snippet: string, sink: { text: string; source: "logoAlt" | "header" }[]): void {
  const inner = snippet || "";
  const ariaA = /<a\b[^>]*\baria-label=["']([^"']{2,200})["'][^>]*>/i.exec(inner);
  if (ariaA?.[1]) {
    const v = decodeBasicEntities(ariaA[1].replace(/\s+/g, " ").trim());
    if (v.length >= 2 && v.length <= 100 && !GENERIC_BRAND_DISCARD.test(v)) sink.push({ text: v, source: "header" });
  }
  const titleA = /<a\b[^>]*\btitle=["']([^"']{2,200})["'][^>]*>/i.exec(inner);
  if (titleA?.[1]) {
    const v = decodeBasicEntities(titleA[1].replace(/\s+/g, " ").trim());
    if (v.length >= 2 && v.length <= 100 && !GENERIC_BRAND_DISCARD.test(v)) sink.push({ text: v, source: "header" });
  }
  const imgRe = /<img\b([^>]*>)/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(inner)) !== null) {
    const tag = `<img${m[1]}`;
    const altM = /\balt=["']([^"']{1,200})["']/i.exec(tag);
    const titleM = /\btitle=["']([^"']{1,200})["']/i.exec(tag);
    const raw = (altM?.[1] ?? titleM?.[1] ?? "").trim();
    if (!raw || looksLikeImageFilenameAlt(raw) || isGenericLogoAlt(raw)) continue;
    const v = decodeBasicEntities(raw.replace(/\s+/g, " ").trim());
    if (v.length >= 2 && v.length <= 100) sink.push({ text: v, source: "logoAlt" });
  }
  const text = stripTagsToText(inner).trim();
  if (text.length >= 2 && text.length <= 100 && !GENERIC_BRAND_DISCARD.test(text)) {
    sink.push({ text, source: "header" });
  }
}

type HeaderBrandRow = { text: string; source: "header" | "logoAlt" };

/** Visible brand wrappers common on dealership sites (WordPress/Wix/custom). */
function collectStructuralHeaderBrandRows(slice: string): HeaderBrandRow[] {
  const sink: HeaderBrandRow[] = [];
  const branded =
    /<(?:h1|h2|span|div|p)\b[^>]*\bclass=["'][^"']*\b(?:site-title|site-name|sitename|brand-text|logo-text|navbar-brand-text|wp-block-site-title)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2|span|div|p)>/gi;
  let m: RegExpExecArray | null;
  while ((m = branded.exec(slice)) !== null) {
    extractTextsFromLogoSnippet(m[1] || "", sink);
  }
  const h1Early = /^[\s\S]{0,9000}<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(slice);
  if (h1Early?.[1]) extractTextsFromLogoSnippet(h1Early[1], sink);
  const svgRe = /<svg\b[^>]*>[\s\S]{0,9000}?<\/svg>/gi;
  while ((m = svgRe.exec(slice)) !== null) {
    const blob = m[0] || "";
    const titleInner = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(blob);
    if (titleInner?.[1]) {
      const v = decodeBasicEntities(titleInner[1].replace(/\s+/g, " ").trim());
      if (v.length >= 2 && v.length <= 100 && !GENERIC_BRAND_DISCARD.test(v)) sink.push({ text: v, source: "header" });
    }
    const tAttr = /\btitle\s*=\s*["']([^"']{2,120})["']/i.exec(blob);
    if (tAttr?.[1]) {
      const v = decodeBasicEntities(tAttr[1].replace(/\s+/g, " ").trim());
      if (v.length >= 2 && v.length <= 100 && !GENERIC_BRAND_DISCARD.test(v)) sink.push({ text: v, source: "header" });
    }
  }
  return sink;
}

function collectHeaderLogoBrandRows(html: string): HeaderBrandRow[] {
  const slice = headerBrandHtmlSlice(html);
  const sink: HeaderBrandRow[] = [];
  for (const r of collectStructuralHeaderBrandRows(slice)) sink.push(r);
  let m: RegExpExecArray | null;
  const logoIdDiv = /<div\b[^>]*\bid=["'][^"']*logo[^"']*["'][^>]*>([\s\S]{0,1200}?)<\/div>/gi;
  while ((m = logoIdDiv.exec(slice)) !== null) extractTextsFromLogoSnippet(m[1] || "", sink);
  for (const snip of extractLogoDivInnerSnippets(html)) extractTextsFromLogoSnippet(snip, sink);
  const re =
    /<a\b[^>]*class=["'][^"']*\b(?:navbar-brand|custom-logo-link|site-title|site-header-title|header-logo-link|site-logo|brand-logo|header-logo|logo-link)\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = re.exec(slice)) !== null) {
    extractTextsFromLogoSnippet(m[1] || "", sink);
  }
  const homeA =
    /<a\b[^>]*href=["'](?:\/|#|(?:https?:)?\/\/[^"']+)["'][^>]*class=["'][^"']*\b(?:logo|brand)\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = homeA.exec(slice)) !== null) {
    extractTextsFromLogoSnippet(m[1] || "", sink);
  }
  const homeLogoParent =
    /<div\b[^>]*\bclass=["'][^"']*\blogo\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["'](?:\/|#|(?:https?:)?\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = homeLogoParent.exec(slice)) !== null) {
    extractTextsFromLogoSnippet(m[1] || "", sink);
  }
  const imgRe = /<img\b([^>]*>)/gi;
  while ((m = imgRe.exec(slice)) !== null) {
    const idx = m.index ?? 0;
    const ctxBefore = slice.slice(Math.max(0, idx - 320), idx).toLowerCase();
    if (/\bid=["'][^"']*(?:popup|modal|dialog|lightbox)[^"']*["']/i.test(ctxBefore)) continue;
    if (/\b(?:car-popup|popup-bg|mfp-|fancybox|featherlight)\b/i.test(ctxBefore)) continue;
    const tag = `<img${m[1]}`;
    const tagLower = tag.toLowerCase();
    if (/\bid=["'][^"']*popup[^"']*["']/i.test(tagLower)) continue;
    if (!LOGO_HINT_RE.test(tagLower)) continue;
    const altM = /\balt=["']([^"']{2,120})["']/i.exec(tag);
    const titleM = /\btitle=["']([^"']{2,120})["']/i.exec(tag);
    const raw = (altM?.[1] ?? titleM?.[1] ?? "").trim();
    if (!raw || looksLikeImageFilenameAlt(raw) || isGenericLogoAlt(raw)) continue;
    const v = decodeBasicEntities(raw.replace(/\s+/g, " ").trim());
    if (v.length >= 2 && v.length <= 100) sink.push({ text: v, source: "logoAlt" });
  }
  const dedup = new Map<string, HeaderBrandRow>();
  for (const r of sink) {
    const k = candidateNormKey(r.text);
    if (!k) continue;
    const prev = dedup.get(k);
    if (!prev) dedup.set(k, r);
    else if (r.source === "logoAlt" && prev.source !== "logoAlt") dedup.set(k, r);
  }
  return [...dedup.values()];
}

function scoreTitleBrandSegment(part: string): number {
  const p = decodeBasicEntities(part.replace(/\s+/g, " ").trim());
  if (!p || p.length < 2) return -999;
  if (GENERIC_BRAND_DISCARD.test(p)) return -999;
  if (RENTAL_TITLE_SEGMENT_BOILERPLATE.test(p)) return -80;
  let s = 0;
  if (/[א-ת]/.test(p)) s += 18;
  if (/^השכרת\s+רכב\b/u.test(p) && p.length >= 10) s -= 40;
  if (/^השכרת\s+רכב\b/u.test(p)) s -= 28;
  if (/\bהשכרת\s+רכב\b/u.test(p) && /[א-ת]{2,}/u.test(p.replace(/\s*השכרת\s+רכב\s*/g, " "))) s += 24;
  if (p.length > 52) s -= 10;
  if (p.length <= 28) s += 6;
  return s;
}

function pickBestTitleSegmentForBrand(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = decodeBasicEntities(raw.replace(/\s+/g, " ").trim());
  if (!t) return undefined;
  const parts = t.split(/\s*\|\s*|\s*[–—-]\s*/).map((p) => p.trim()).filter(Boolean);
  const scored = parts
    .map((p) => ({ p, sc: scoreTitleBrandSegment(p) }))
    .filter((x) => x.sc > -500);
  if (scored.length === 0) return t.length <= 100 ? t : t.slice(0, 100);
  scored.sort((a, b) => b.sc - a.sc || a.p.length - b.p.length || a.p.localeCompare(b.p));
  const best = scored[0].p;
  const trimmed = stripTrailingRentalBrandNoise(best);
  const use = trimmed.length >= 2 ? trimmed : best;
  return use.length <= 100 ? use : use.slice(0, 100);
}

function pickOgTitleForBrand(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = decodeBasicEntities(raw.replace(/\s+/g, " ").trim());
  if (!t || t.length < 2 || t.length > 90) return undefined;
  if (GENERIC_BRAND_DISCARD.test(t)) return undefined;
  if (/^השכרת\s+רכב/u.test(t) && t.length > 24) return undefined;
  if (/\b(car\s*rental|rent\s*a\s*car)\b/i.test(t) && t.length > 28) return undefined;
  return t;
}

function extractFooterBrandCandidates(footerText: string | undefined): string[] {
  if (!footerText) return [];
  const chunks = footerText.split(/\||\n+|•|·/);
  const out: string[] = [];
  for (const raw of chunks) {
    let s = raw.replace(/^[\s©Ⓒ]+\s*/, "").replace(/\s*כל\s+הזכויות\s+שמורות.*$/i, "").trim();
    s = s.replace(/\s+/g, " ");
    if (s.length < 3 || s.length > 88) continue;
    if (/^[\d\s\-+().:]+$/.test(s)) continue;
    if (GENERIC_BRAND_DISCARD.test(s)) continue;
    out.push(s);
  }
  return out.slice(0, 6);
}

function domainFallbackBusinessLabel(pageUrl: string): string | undefined {
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const seg = host.split(".")[0];
    if (!seg || seg.length < 2) return undefined;
    if (/^[a-z0-9-]+$/i.test(seg)) {
      return seg
        .split(/-+/g)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
    return seg;
  } catch {
    return undefined;
  }
}

type BrandCand = { text: string; source: SiteResearchBusinessNameSource; score: number };

function navLabelSet(navLabels: string[]): Set<string> {
  const s = new Set<string>();
  for (const x of navLabels) {
    const t = x.trim().toLowerCase();
    if (t) s.add(t);
  }
  return s;
}

function candidateNormKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Lower wins on ties (logo/header preferred over meta). */
function sourcePriority(source: SiteResearchBusinessNameSource): number {
  switch (source) {
    case "logoAlt":
      return 0;
    case "header":
      return 1;
    case "ogSiteName":
      return 2;
    case "ogTitle":
      return 3;
    case "jsonLdOrganization":
      return 4;
    case "title":
      return 5;
    case "footer":
      return 6;
    case "domainFallback":
      return 8;
    case "existingConfig":
      return 9;
    default:
      return 7;
  }
}

function confidenceFromPick(source: SiteResearchBusinessNameSource, domainFallback: boolean): number {
  if (domainFallback) return 12;
  switch (source) {
    case "header":
    case "logoAlt":
      return 96;
    case "ogSiteName":
      return 82;
    case "ogTitle":
      return 78;
    case "jsonLdOrganization":
      return 74;
    case "title":
      return 60;
    case "footer":
      return 40;
    default:
      return 50;
  }
}

function scoreBrandCandidate(
  text: string,
  source: SiteResearchBusinessNameSource,
  opts: { nav: Set<string>; mainSample: string; footerLine?: string },
): number {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 100) return 0;
  if (GENERIC_BRAND_DISCARD.test(t)) return 0;
  if (opts.nav.has(t.toLowerCase())) return 0;
  let base = 0;
  switch (source) {
    case "header":
    case "logoAlt":
      base = 100;
      break;
    case "ogSiteName":
      base = 80;
      break;
    case "ogTitle":
      base = 78;
      break;
    case "jsonLdOrganization":
      base = 68;
      break;
    case "title":
      base = 60;
      break;
    case "footer":
      base = 40;
      break;
    case "domainFallback":
      base = 10;
      break;
    default:
      base = 0;
  }
  if (looksLikeImageFilenameAlt(t)) return 0;
  let bonus = Math.min(4, Math.floor(t.length / 28));
  if (source === "footer" && opts.footerLine && opts.mainSample) {
    const esc = opts.footerLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (esc.length >= 4) {
      const re = new RegExp(esc, "gi");
      const hits = opts.mainSample.match(re);
      if (hits && hits.length >= 2) bonus += 12;
    }
  }
  return base + bonus;
}

/**
 * When visible header/logo text exists with a decent score, it must win over <title>/OG
 * even if the meta string scored slightly higher (common logo-vs-title conflicts).
 */
function preferHeaderLogoOverWeakerMeta(merged: BrandCand[]): BrandCand | undefined {
  if (!merged.length) return undefined;
  const MIN_HEADER_SCORE = 34;
  const headish = merged.filter((c) => (c.source === "header" || c.source === "logoAlt") && c.score >= MIN_HEADER_SCORE);
  if (!headish.length) return merged[0];
  headish.sort(
    (a, b) =>
      b.score - a.score ||
      sourcePriority(a.source) - sourcePriority(b.source) ||
      a.text.replace(/\s+/g, " ").length - b.text.replace(/\s+/g, " ").length ||
      a.text.localeCompare(b.text),
  );
  const bestHead = headish[0];
  const globalTop = merged[0];
  if (globalTop.source === "header" || globalTop.source === "logoAlt") return globalTop;
  if (candidateNormKey(bestHead.text) !== candidateNormKey(globalTop.text)) return bestHead;
  return globalTop;
}

function buildBusinessNameResolution(
  top: BrandCand,
  mergedLen: number,
  domainFallback: boolean,
): Pick<
  SiteResearchBusinessNameSignals,
  | "resolvedBusinessName"
  | "businessNameSource"
  | "businessNameConfidence"
  | "businessNameResolutionScore"
  | "businessNameChosenDebug"
> {
  let resolved = top.text.replace(/\s+/g, " ").trim();
  if (top.source === "title" || top.source === "footer" || top.source === "ogTitle") {
    const stripped = stripTrailingRentalBrandNoise(resolved);
    if (stripped.length >= 2) resolved = stripped;
  }
  const confidence = confidenceFromPick(top.source, domainFallback);
  return {
    resolvedBusinessName: resolved,
    businessNameSource: top.source,
    businessNameConfidence: confidence,
    businessNameResolutionScore: top.score,
    businessNameChosenDebug: {
      chosenBusinessName: resolved,
      source: top.source,
      score: top.score,
      confidence,
      domainFallbackUsed: domainFallback,
      candidatesCount: mergedLen,
    },
  };
}

/**
 * Homepage-only: rank header/logo text, og:site_name, cleaned document title, then footer lines;
 * falls back to a humanized hostname label only when nothing clears the confidence bar.
 */
export function computeHomepageBusinessNameSignals(
  html: string,
  pageUrl: string,
  navLabels: string[],
  footerText: string | undefined,
  mainTextSample: string,
): SiteResearchBusinessNameSignals {
  const nav = navLabelSet(navLabels);
  const cands: BrandCand[] = [];
  const push = (text: string | undefined, source: SiteResearchBusinessNameSource) => {
    const t = text?.replace(/\s+/g, " ").trim();
    if (!t) return;
    const sc = scoreBrandCandidate(t, source, { nav, mainSample: mainTextSample, footerLine: t });
    if (sc <= 0) return;
    cands.push({ text: t, source, score: sc });
  };

  for (const row of collectHeaderLogoBrandRows(html)) {
    push(row.text, row.source);
  }

  for (const name of extractJsonLdOrganizationNames(html)) {
    push(name, "jsonLdOrganization");
  }

  const ogSite = extractMetaContent(html, { property: "og:site_name" });
  push(ogSite, "ogSiteName");

  const ogTitle = pickOgTitleForBrand(extractMetaContent(html, { property: "og:title" }));
  push(ogTitle, "ogTitle");

  const titleSeg = pickBestTitleSegmentForBrand(extractTitle(html));
  push(titleSeg, "title");

  for (const line of extractFooterBrandCandidates(footerText)) {
    const sc = scoreBrandCandidate(line, "footer", { nav, mainSample: mainTextSample, footerLine: line });
    if (sc > 0) cands.push({ text: line, source: "footer", score: sc });
  }

  const bestByKey = new Map<string, BrandCand>();
  for (const c of cands) {
    const k = candidateNormKey(c.text);
    if (!k) continue;
    const prev = bestByKey.get(k);
    if (!prev || c.score > prev.score || (c.score === prev.score && sourcePriority(c.source) < sourcePriority(prev.source))) {
      bestByKey.set(k, c);
    }
  }
  const merged = [...bestByKey.values()].sort((a, b) => {
    const ha = a.source === "header" || a.source === "logoAlt";
    const hb = b.source === "header" || b.source === "logoAlt";
    return (
      b.score - a.score ||
      sourcePriority(a.source) - sourcePriority(b.source) ||
      (ha && hb ? a.text.replace(/\s+/g, " ").length - b.text.replace(/\s+/g, " ").length : 0) ||
      a.text.localeCompare(b.text)
    );
  });
  const STRONG_MIN = 34;
  const top = preferHeaderLogoOverWeakerMeta(merged);
  if (top && top.score >= STRONG_MIN) {
    return {
      ...buildBusinessNameResolution(top, merged.length, false),
      businessNameCandidatesCount: merged.length,
      domainFallbackUsed: false,
    };
  }
  const fb = domainFallbackBusinessLabel(pageUrl);
  if (fb) {
    const fbCand: BrandCand = { text: fb, source: "domainFallback", score: scoreBrandCandidate(fb, "domainFallback", { nav, mainSample: mainTextSample }) };
    return {
      ...buildBusinessNameResolution(fbCand, merged.length, true),
      businessNameCandidatesCount: merged.length,
      domainFallbackUsed: true,
    };
  }
  return {
    businessNameCandidatesCount: merged.length,
    domainFallbackUsed: false,
  };
}

const HERO_IMG_SKIP_RE =
  /favicon|apple-touch|sprite|spacer|clear\.gif|pixel|tracking|beacon|1x1|loader|placeholder|thumb|thumbnail|icon|logo\.svg|wixstatic\/.*\/w_50\b|w_40\b|h_40\b/i;

const HERO_CAROUSEL_CTX_RE =
  /\b(swiper|slick|carousel|slider|splide|rev_slider|slideshow|banner|hero|jumbotron|cover|slide|masthead|header-image)\b/i;

const LOGO_HINT_RE = /\b(logo|brand|navbar-brand|site-logo|header-logo|custom-logo|wordmark)\b/i;

const CAROUSEL_STRONG_RE =
  /\b(swiper|slick-carousel|owl-carousel|keen-slider|splide|carousel|slider-pro|rev_slider|data-bs-slide)\b/i;
const CAROUSEL_OVERFLOW_RE = /overflow-x\s*:\s*(auto|scroll|overlay)/i;
const CAROUSEL_ARROW_RE =
  /\b(swiper-button|slick-arrow|carousel-control|splide__arrow|owl-prev|owl-next|keen-slider__arrow|prev-slide|next-slide|aria-label=["'][^"']*(previous|next|הבא|הקודם))\b/i;
const CAROUSEL_DOTS_RE = /\b(swiper-pagination|slick-dots|carousel-indicators|splide__pagination|owl-dots)\b/i;

/** Prefer early-page HTML where hero/slider markup usually lives. */
function heroHtmlFocusSlice(html: string): string {
  const lower = html.toLowerCase();
  const bi = lower.indexOf("<body");
  const start = bi >= 0 ? bi : 0;
  return html.slice(start, start + 160_000);
}

function looksLikeHeroishImgTag(tagLower: string): boolean {
  if (HERO_CAROUSEL_CTX_RE.test(tagLower)) return true;
  const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(tagLower);
  const h = /\bheight\s*=\s*["']?(\d+)/i.exec(tagLower);
  const wi = w ? parseInt(w[1], 10) : 0;
  const hi = h ? parseInt(h[1], 10) : 0;
  if (wi >= 280 || hi >= 160) return true;
  return false;
}

function heroImgTagScore(tag: string, indexInSlice: number): number {
  const tagLower = tag.toLowerCase();
  let score = 8;
  if (HERO_CAROUSEL_CTX_RE.test(tagLower)) score += 28;
  if (/\b(w-full|full-?width|100vw|max-w-none)\b/i.test(tagLower)) score += 18;
  if (/\b(min-h-\[|min-h-screen|vh-\d|h-screen)\b/i.test(tagLower)) score += 12;
  const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(tagLower);
  const h = /\bheight\s*=\s*["']?(\d+)/i.exec(tagLower);
  const wi = w ? parseInt(w[1], 10) : 0;
  const hi = h ? parseInt(h[1], 10) : 0;
  if (wi >= 600 || hi >= 340) score += 14;
  else if (wi >= 400 || hi >= 220) score += 8;
  if (LOGO_HINT_RE.test(tagLower)) score -= 55;
  if (/\b(banner|slider|slide|masthead)\b/i.test(tagLower)) score += 6;
  if (indexInSlice < 8000) score += 6;
  return score;
}

function extractImgCandidateFromTag(tag: string, base: URL): string | null {
  return extractImgUrlFromTag(tag, base, { requireHeroish: true });
}

function extractImgUrlFromTag(
  tag: string,
  base: URL,
  opts: { requireHeroish: boolean },
): string | null {
  const tagLower = tag.toLowerCase();
  const pick =
    /\bdata-src\s*=\s*["']([^"']+)["']/i.exec(tag) ||
    /\bdata-lazy-src\s*=\s*["']([^"']+)["']/i.exec(tag) ||
    /\bdata-bg\s*=\s*["']([^"']+)["']/i.exec(tag) ||
    /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
  const raw = pick?.[1]?.trim();
  if (!raw || raw.startsWith("data:")) return null;
  if (HERO_IMG_SKIP_RE.test(raw) || HERO_IMG_SKIP_RE.test(tagLower)) return null;
  if (opts.requireHeroish && !looksLikeHeroishImgTag(tagLower)) return null;
  try {
    const u = new URL(raw, base);
    u.hash = "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.hostname !== base.hostname) return null;
    const href = u.toString();
    if (HERO_IMG_SKIP_RE.test(href)) return null;
    return href;
  } catch {
    return null;
  }
}

function headerRegionStart(html: string): number {
  const cap = Math.min(html.length, 280_000);
  const head = html.slice(0, cap);
  const lower = head.toLowerCase();
  let best = Number.POSITIVE_INFINITY;
  const bump = (idx: number) => {
    if (idx >= 0 && idx < best) best = idx;
  };
  bump(lower.search(/\brole=["']banner["']/i));
  bump(lower.indexOf("<header"));
  bump(lower.search(/<div\b[^>]{0,220}\bclass=["'][^"']*\b(?:site-header|page-header|top-header|main-header|masthead)\b/i));
  bump(lower.search(/<div\b[^>]{0,220}\bclass=["'][^"']*\bheader_content\b/i));
  bump(lower.search(/<div\b[^>]{0,220}\bclass=["'][^"']*\bheader\b[^"']*["']/i));
  bump(lower.indexOf("<nav"));
  bump(lower.indexOf("<body"));
  return Number.isFinite(best) ? best : 0;
}

function headerBrandHtmlSlice(html: string): string {
  const start = headerRegionStart(html);
  return html.slice(start, start + 120_000);
}

/**
 * Same-origin likely brand logos from header/nav (bounded; ranked).
 */
export function extractLogoImageCandidates(html: string, pageUrl: string): { url: string; score: number }[] {
  if (!html) return [];
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const slice = headerBrandHtmlSlice(html);
  const scored: { url: string; score: number; ord: number }[] = [];
  let ord = 0;
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(slice)) !== null) {
    const tag = m[0];
    const tagLower = tag.toLowerCase();
    const abs = extractImgUrlFromTag(tag, base, { requireHeroish: false });
    if (!abs) continue;
    if (HERO_CAROUSEL_CTX_RE.test(tagLower) && !LOGO_HINT_RE.test(tagLower)) {
      const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(tagLower);
      const h = /\bheight\s*=\s*["']?(\d+)/i.exec(tagLower);
      const wi = w ? parseInt(w[1], 10) : 0;
      const hi = h ? parseInt(h[1], 10) : 0;
      if (wi >= 420 || hi >= 260) continue;
    }
    let score = 6;
    if (LOGO_HINT_RE.test(tagLower)) score += 44;
    if (/\bnavbar-brand\b|\bcustom-logo-link\b|\bsite-branding\b/i.test(tagLower)) score += 22;
    if (/\b(width|height)\s*=\s*["']?(\d+)/i.test(tagLower)) {
      const w = /\bwidth\s*=\s*["']?(\d+)/i.exec(tagLower);
      const h = /\bheight\s*=\s*["']?(\d+)/i.exec(tagLower);
      const wi = w ? parseInt(w[1], 10) : 0;
      const hi = h ? parseInt(h[1], 10) : 0;
      if (wi > 0 && hi > 0 && wi <= 360 && hi <= 200) score += 18;
      if (wi > 480 && hi > 300) score -= 40;
    }
    if (/\b(href|data-href)\s*=\s*["'][^"']*["']/i.test(tag) && /rel\s*=\s*["']home["']/i.test(tagLower)) score += 12;
    const ctx = slice.slice(Math.max(0, (m.index ?? 0) - 120), m.index ?? 0).toLowerCase();
    if (/<a[^>]+href\s*=\s*["'][^"']*["'][^>]*>\s*$/i.test(ctx) && /\/["']?\s*>?\s*$/i.test(ctx.split("<a").pop() ?? "")) score += 8;
    if ((m.index ?? 0) < 24_000) score += 10;
    scored.push({ url: abs, score, ord: ord++ });
  }
  scored.sort((a, b) => b.score - a.score || a.ord - b.ord);
  const best = new Map<string, (typeof scored)[0]>();
  for (const row of scored) {
    const prev = best.get(row.url);
    if (!prev || row.score > prev.score) best.set(row.url, row);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score >= 14)
    .slice(0, 5)
    .map(({ url, score }) => ({ url, score }));
}

function normalizeCssHex6(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(t)) return undefined;
  if (t.length === 4) {
    const r = t[1] + t[1];
    const g = t[2] + t[2];
    const b = t[3] + t[3];
    return `#${r}${g}${b}`.toLowerCase();
  }
  return t.toLowerCase();
}

function extractPrimaryCtaHexFromHtml(html: string, themeColor?: string): { bg?: string; fg?: string } {
  const slice = heroHtmlFocusSlice(html).slice(0, 220_000);
  const out: { bg?: string; fg?: string } = {};
  const theme = normalizeCssHex6(themeColor);
  if (theme) out.bg = theme;

  const styleChunks = [...slice.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1] || "");
  const cssBlob = styleChunks.join("\n").slice(0, 400_000);
  const selectorRe =
    /(?:^|[}])\s*([^{}]{0,180})\{([^{}]{0,900})\}/g;
  let m: RegExpExecArray | null;
  while ((m = selectorRe.exec(cssBlob)) !== null) {
    const sel = (m[1] || "").toLowerCase();
    const body = m[2] || "";
    if (!/\b(btn|button|cta|call|primary|action|hero.*btn)\b/.test(sel)) continue;
    const bgM = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})\b/i.exec(body);
    const fgM = /\bcolor\s*:\s*(#[0-9a-fA-F]{3,6})\b/i.exec(body);
    const bg = normalizeCssHex6(bgM?.[1]);
    const fg = normalizeCssHex6(fgM?.[1]);
    if (bg) {
      out.bg = bg;
      if (fg) out.fg = fg;
      return out;
    }
  }

  const inlineBtn = /<a\b[^>]*class=["'][^"']*\b(btn|button|cta|primary)\b[^"']*["'][^>]*style=["']([^"']+)["']/gi;
  while ((m = inlineBtn.exec(slice)) !== null) {
    const st = m[2] || "";
    const bgM = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})\b/i.exec(st);
    const fgM = /\bcolor\s*:\s*(#[0-9a-fA-F]{3,6})\b/i.exec(st);
    const bg = normalizeCssHex6(bgM?.[1]);
    const fg = normalizeCssHex6(fgM?.[1]);
    if (bg) {
      out.bg = bg;
      if (fg) out.fg = fg;
      return out;
    }
  }
  return out;
}

function detectCarsCarouselHeuristic(html: string): { detected: boolean; patterns: string[] } {
  const slice = heroHtmlFocusSlice(html).slice(0, 220_000);
  const patterns: string[] = [];
  const a = CAROUSEL_STRONG_RE.test(slice) || CAROUSEL_OVERFLOW_RE.test(slice);
  if (CAROUSEL_STRONG_RE.test(slice)) patterns.push("carousel_markup");
  if (CAROUSEL_OVERFLOW_RE.test(slice)) patterns.push("horizontal_overflow_css");
  const b = CAROUSEL_ARROW_RE.test(slice) || CAROUSEL_DOTS_RE.test(slice);
  if (CAROUSEL_ARROW_RE.test(slice)) patterns.push("carousel_arrows");
  if (CAROUSEL_DOTS_RE.test(slice)) patterns.push("carousel_dots");
  let invLinks = 0;
  const linkRe = /<a\b[^>]+href\s*=\s*["']([^"']+)["']/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(slice)) !== null) {
    const href = (lm[1] || "").toLowerCase();
    if (/\b(car|vehicle|inventory|listing|stock|מלאי|רכב)\b/i.test(href)) invLinks += 1;
    if (invLinks >= 8) break;
  }
  if (invLinks >= 8) patterns.push("repeated_inventory_links");
  const repeated = invLinks >= 8;
  return { detected: Boolean(a && (b || repeated)), patterns };
}

export function buildHomepageLayoutSignals(
  html: string,
  pageUrl: string,
  themeColor?: string,
): SiteResearchLayoutSignals {
  const heroRanked = extractHeroBannerImageCandidatesScored(html, pageUrl);
  const heroUrls = heroRanked.map((x) => x.url);
  const heroImagesDetectedCount = heroUrls.length;
  const heroSlice = heroHtmlFocusSlice(html).slice(0, 100_000);
  const heroSliderDetected =
    heroUrls.length >= 2 || (CAROUSEL_STRONG_RE.test(heroSlice) && heroUrls.length >= 1 && HERO_CAROUSEL_CTX_RE.test(heroSlice));
  const car = detectCarsCarouselHeuristic(html);
  const cta = extractPrimaryCtaHexFromHtml(html, themeColor);
  const logoCandidates = extractLogoImageCandidates(html, pageUrl);
  const layoutPatternsDetected = [...new Set([...car.patterns, ...(heroSliderDetected ? ["hero_slider_area"] : [])])];
  let websiteLogoRejectedReason: string | undefined;
  if (logoCandidates.length === 0) websiteLogoRejectedReason = "no_logo_candidates";
  else if (logoCandidates[0].score < 28) websiteLogoRejectedReason = "low_confidence";

  return {
    heroImagesDetectedCount,
    heroSliderDetected,
    carsCarouselDetected: car.detected,
    primaryCtaBackgroundColor: cta.bg,
    primaryCtaTextColor: cta.fg,
    layoutPatternsDetected,
    logoCandidates,
    websiteLogoRejectedReason,
  };
}

type ScoredUrl = { url: string; score: number; ord: number };

/**
 * Same-origin hero/banner image URLs from homepage HTML (bounded, conservative).
 * Does not crawl external CDNs off-domain (hostname must match page).
 * Order prefers above-the-fold carousel/banner context and large full-width assets over incidental images.
 */
export function extractHeroBannerImageCandidates(html: string, pageUrl: string): string[] {
  const ranked = extractHeroBannerImageCandidatesScored(html, pageUrl);
  return ranked.map((x) => x.url);
}

function extractHeroBannerImageCandidatesScored(html: string, pageUrl: string): ScoredUrl[] {
  if (!html) return [];
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const slice = heroHtmlFocusSlice(html);
  const scored: ScoredUrl[] = [];
  let ord = 0;

  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(slice)) !== null) {
    const tag = m[0];
    const abs = extractImgCandidateFromTag(tag, base);
    if (!abs) continue;
    const idx = m.index ?? 0;
    const ctx = tag.toLowerCase();
    let score = heroImgTagScore(tag, idx);
    if (HERO_CAROUSEL_CTX_RE.test(slice.slice(Math.max(0, idx - 500), idx + 40))) score += 10;
    if (LOGO_HINT_RE.test(ctx)) continue;
    scored.push({ url: abs, score, ord: ord++ });
  }

  const bgRe = /url\(\s*["']?([^"')]+\.(?:jpe?g|png|webp|gif|avif))["']?\s*\)/gi;
  while ((m = bgRe.exec(slice)) !== null) {
    const raw = (m[1] || "").trim();
    if (!raw || raw.startsWith("data:") || HERO_IMG_SKIP_RE.test(raw)) continue;
    try {
      const u = new URL(raw, base);
      u.hash = "";
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.hostname !== base.hostname) continue;
      const href = u.toString();
      const idx = m.index ?? 0;
      if (!HERO_CAROUSEL_CTX_RE.test(slice.slice(Math.max(0, idx - 400), idx + 20))) continue;
      scored.push({ url: href, score: 32 + (idx < 12000 ? 8 : 0), ord: ord++ });
    } catch {
      /* skip */
    }
  }

  scored.sort((a, b) => b.score - a.score || a.ord - b.ord);
  const bestByUrl = new Map<string, ScoredUrl>();
  for (const row of scored) {
    const prev = bestByUrl.get(row.url);
    if (!prev || row.score > prev.score) bestByUrl.set(row.url, row);
  }
  const merged = [...bestByUrl.values()].sort((a, b) => b.score - a.score || a.ord - b.ord);
  return merged.slice(0, 12);
}

/** Homepage `layoutSignals` when present (first matching page). */
export function pickHomeResearchLayoutSignals(bundle: SiteResearchBundle): SiteResearchLayoutSignals | undefined {
  for (const p of bundle.pages) {
    if (!p.fetchedOk || !p.researchHints.includes("home") || !p.layoutSignals) continue;
    return p.layoutSignals;
  }
  return undefined;
}

/** Flatten homepage hero candidates from a research bundle (deduped, stable order). */
export function collectHeroBannerResearchUrls(bundle: SiteResearchBundle): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of bundle.pages) {
    if (!p.fetchedOk || !p.heroBannerImageCandidates?.length) continue;
    const isHome = p.researchHints.includes("home");
    if (!isHome) continue;
    for (const u of p.heroBannerImageCandidates) {
      const t = u.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
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

function normalizeCharsetLabel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/^[\s"'"]+|[\s"'"]+$/g, "").trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  const map: Record<string, string> = {
    utf8: "utf-8",
    "utf-8": "utf-8",
    cp1255: "windows-1255",
    "windows-1255": "windows-1255",
    "iso-8859-8": "iso-8859-8",
    "iso-8859-8-i": "iso-8859-8-i",
    "iso8859-8": "iso-8859-8",
    hebrew: "windows-1255",
    cp1252: "windows-1252",
    "windows-1252": "windows-1252",
  };
  return map[lower] ?? s;
}

function sniffHtmlCharsetFromBytes(bytes: Uint8Array, contentTypeHeader: string): string {
  const cth = (contentTypeHeader || "").toLowerCase();
  const ctMatch = cth.match(/charset\s*=\s*([^;]+)/i);
  const fromHeader = normalizeCharsetLabel(ctMatch?.[1]);
  if (fromHeader) return fromHeader;

  const headLen = Math.min(24_000, bytes.length);
  const headLatin = new TextDecoder("latin1").decode(bytes.slice(0, headLen));

  const charsetMeta = headLatin.match(/<meta\b[^>]*charset\s*=\s*["']?([^"'>\s;]+)/i);
  const fromMeta = normalizeCharsetLabel(charsetMeta?.[1]);
  if (fromMeta) return fromMeta;

  const httpEquiv = headLatin.match(
    /<meta\b[^>]*http-equiv\s*=\s*["']?\s*content-type\s*["']?[^>]*content\s*=\s*["']([^"']+)["']/i,
  );
  if (httpEquiv?.[1]) {
    const inner = httpEquiv[1].match(/charset\s*=\s*([^;"'\s]+)/i);
    const fromEquiv = normalizeCharsetLabel(inner?.[1]);
    if (fromEquiv) return fromEquiv;
  }

  const contentMeta = headLatin.match(
    /<meta\b[^>]*content\s*=\s*["']([^"']*charset\s*=[^"']+)["'][^>]*http-equiv\s*=\s*["']?\s*content-type/i,
  );
  if (contentMeta?.[1]) {
    const inner = contentMeta[1].match(/charset\s*=\s*([^;"'\s]+)/i);
    const fromRev = normalizeCharsetLabel(inner?.[1]);
    if (fromRev) return fromRev;
  }

  return "utf-8";
}

function decodeHtmlBytes(bytes: ArrayBuffer, charset: string): string {
  const label = normalizeCharsetLabel(charset) ?? "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
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
    const ctHeader = res.headers.get("content-type") || "";
    const ctLower = ctHeader.toLowerCase();
    if (!ctLower.includes("text/html") && !ctLower.includes("application/xhtml")) {
      warnings.push(`Non-HTML content-type for ${url}: ${ctLower || "unknown"}`);
    }
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const charset = sniffHtmlCharsetFromBytes(u8, ctHeader);
    let text = decodeHtmlBytes(buf, charset);
    if (charset.toLowerCase() !== "utf-8") {
      warnings.push(`Decoded HTML using charset=${charset} for ${url}`);
    }
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

function buildPageRecord(
  url: string,
  fetched: { ok: boolean; status?: number; html: string; error?: string },
  opts?: { linkFromHomepage?: string },
): SiteResearchPage {
  const html = fetched.html || "";
  const base = new URL(url);
  const textSample = html ? stripTagsToText(html).slice(0, MAX_TEXT_SAMPLE) : "";
  const internalLinks = html ? extractInternalLinks(html, base) : [];
  const researchHints = computeResearchHints(url, opts?.linkFromHomepage);
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
      researchHints,
    };
  }
  const themeColor = extractMetaContent(html, { name: "theme-color" });
  const navLabels = extractNavLabels(html);
  const headingLines = extractHeadings(html);
  const footerText = extractFooterText(html);
  const businessNameSignals =
    researchHints.includes("home") && html
      ? computeHomepageBusinessNameSignals(html, url, navLabels, footerText, textSample)
      : undefined;
  const heroBannerImageCandidates =
    researchHints.includes("home") && html ? extractHeroBannerImageCandidates(html, url) : undefined;
  const layoutSignals =
    researchHints.includes("home") && html ? buildHomepageLayoutSignals(html, url, themeColor) : undefined;
  return {
    url,
    fetchedOk: true,
    status: fetched.status,
    title: extractTitle(html),
    metaDescription: extractMetaContent(html, { name: "description" }) ?? extractMetaContent(html, { name: "twitter:description" }),
    ogTitle: extractMetaContent(html, { property: "og:title" }),
    ogDescription: extractMetaContent(html, { property: "og:description" }),
    ogImage: extractMetaContent(html, { property: "og:image" }),
    themeColor,
    canonical: extractMetaContent(html, { property: "og:url" }) || pickFirstMatch(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i),
    navLabels,
    headingLines,
    footerText,
    mainTextSample: textSample,
    internalLinks,
    researchHints,
    ...(businessNameSignals ? { businessNameSignals } : {}),
    ...(heroBannerImageCandidates && heroBannerImageCandidates.length > 0 ? { heroBannerImageCandidates } : {}),
    ...(layoutSignals ? { layoutSignals } : {}),
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
  const maxPagesRaw = typeof options?.maxPages === "number" && Number.isFinite(options.maxPages) ? options.maxPages : 8;
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

  const rankedPool = rankFollowUrls(start, homePage.internalLinks, Math.max((maxPages - 1) * 6, 24));
  const slice = pickDiverseSubpageUrls(start, homePage.internalLinks, rankedPool, maxPages - 1);
  const linkTextByResolved = buildResolvedLinkTextMap(start, homePage.internalLinks);
  for (const u of slice) {
    const f = await fetchHtml(u, warnings);
    pages.push(buildPageRecord(u, f, { linkFromHomepage: linkTextByResolved.get(u) }));
  }

  return { startUrl: start.toString(), origin, pages, warnings };
}
