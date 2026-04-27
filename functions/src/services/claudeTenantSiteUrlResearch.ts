import * as functions from "firebase-functions";
import {
  ANTHROPIC_SITE_BUILDER_DEFAULT_MODEL,
  anthropicClient,
  getAnthropicClientDebugStatus,
} from "./anthropicClient";
import {
  extractJsonObjectFromModelText,
  sanitizeAiTenantSiteImportPayload,
} from "./claudeSiteBuilderExtractor";
import {
  collectHeroBannerResearchUrls,
  normalizePublicHttpUrl,
  pickHomeResearchLayoutSignals,
  researchTenantWebsite,
  type SiteResearchBundle,
  type SiteResearchOptions,
} from "./siteResearchExtractor";
import { buildDebugError, truncateSafeDetail } from "./urlResearchCallableDebug";
import {
  buildTenantSiteImportFromResearchBundle,
  mergeDeterministicResearchUnderSanitizedClaude,
  type TenantSiteDeterministicImportDebug,
} from "./tenantSiteResearchDeterministicImport";

/**
 * Dedicated model for URL/HTML site research → builder import JSON.
 * Override via `CLAUDE_SITE_BUILDER_URL_MODEL` env or `firebase functions:config:set anthropic.url_model="..."`.
 */
export const CLAUDE_SITE_BUILDER_URL_RESEARCH_DEFAULT_MODEL = ANTHROPIC_SITE_BUILDER_DEFAULT_MODEL;

export function resolveClaudeSiteBuilderUrlResearchModel(): string {
  const env = process.env.CLAUDE_SITE_BUILDER_URL_MODEL?.trim();
  if (env) return env;
  try {
    const cfg = functions.config?.() as { anthropic?: { url_model?: string } } | undefined;
    const fromCfg = cfg?.anthropic?.url_model?.trim();
    if (fromCfg) return fromCfg;
  } catch {
    // ignore missing runtime config
  }
  return CLAUDE_SITE_BUILDER_URL_RESEARCH_DEFAULT_MODEL;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function isSafeHttpUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > 2048) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeHeroCtaLink(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > 2048) return false;
  if (s.startsWith("/") && !s.startsWith("//")) return true;
  return isSafeHttpUrl(s);
}

/**
 * Drops obviously unsafe URLs while keeping builder-legal http(s) links and in-app paths.
 */
export function sanitizeImportHttpUrlsInResearchPayload(
  payload: Record<string, unknown>,
  warnings: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  const branding = asRecord(out.branding);
  if (branding.logoUrl && typeof branding.logoUrl === "string" && !isSafeHttpUrl(branding.logoUrl)) {
    warnings.push("Removed invalid branding.logoUrl");
    delete branding.logoUrl;
  }
  if (branding.heroImageUrl && typeof branding.heroImageUrl === "string" && !isSafeHttpUrl(branding.heroImageUrl)) {
    warnings.push("Removed invalid branding.heroImageUrl");
    delete branding.heroImageUrl;
  }
  if (branding.logoWebsiteCandidate && typeof branding.logoWebsiteCandidate === "string" && !isSafeHttpUrl(branding.logoWebsiteCandidate)) {
    warnings.push("Removed invalid branding.logoWebsiteCandidate");
    delete branding.logoWebsiteCandidate;
  }
  if (branding.logoYardCandidate && typeof branding.logoYardCandidate === "string" && !isSafeHttpUrl(branding.logoYardCandidate)) {
    warnings.push("Removed invalid branding.logoYardCandidate");
    delete branding.logoYardCandidate;
  }
  const heroUrlsRaw = branding.heroImageUrls;
  if (Array.isArray(heroUrlsRaw)) {
    const cleaned: string[] = [];
    for (const item of heroUrlsRaw) {
      if (typeof item !== "string") continue;
      const t = item.trim();
      if (!t || !isSafeHttpUrl(t)) continue;
      if (!cleaned.includes(t)) cleaned.push(t);
      if (cleaned.length >= 8) break;
    }
    if (cleaned.length > 0) {
      branding.heroImageUrls = cleaned;
    } else {
      delete branding.heroImageUrls;
      warnings.push("Removed invalid branding.heroImageUrls entries");
    }
  } else if (heroUrlsRaw !== undefined) {
    delete branding.heroImageUrls;
    warnings.push("Removed branding.heroImageUrls (not an array)");
  }
  if (
    branding.pageBackgroundImageUrl &&
    typeof branding.pageBackgroundImageUrl === "string" &&
    !isSafeHttpUrl(branding.pageBackgroundImageUrl)
  ) {
    warnings.push("Removed invalid branding.pageBackgroundImageUrl");
    delete branding.pageBackgroundImageUrl;
  }
  if (Object.keys(branding).length > 0) out.branding = branding;
  else delete out.branding;

  const contact = asRecord(out.contact);
  for (const k of ["facebookUrl", "instagramUrl", "websiteUrl"] as const) {
    const v = contact[k];
    if (typeof v === "string" && v.trim() && !isSafeHttpUrl(v)) {
      warnings.push(`Removed invalid contact.${k}`);
      delete contact[k];
    }
  }
  if (Object.keys(contact).length > 0) out.contact = contact;
  else delete out.contact;

  const seo = asRecord(out.seo);
  if (seo.ogImageUrl && typeof seo.ogImageUrl === "string" && !isSafeHttpUrl(seo.ogImageUrl)) {
    warnings.push("Removed invalid seo.ogImageUrl");
    delete seo.ogImageUrl;
  }
  if (Object.keys(seo).length > 0) out.seo = seo;
  else delete out.seo;

  const content = asRecord(out.content);
  if (content.heroCtaLink && typeof content.heroCtaLink === "string" && !isSafeHeroCtaLink(content.heroCtaLink)) {
    warnings.push("Removed invalid content.heroCtaLink");
    delete content.heroCtaLink;
  }
  if (Object.keys(content).length > 0) out.content = content;
  else delete out.content;

  return out;
}

/**
 * Keep only hero URLs that appeared in deterministic homepage extraction (same-origin candidates).
 * When no candidates were extracted, skips filtering so single-image `heroImageUrl` from the model is not wiped.
 */
export function filterBrandingHeroImagesToResearchWhitelist(
  payload: Record<string, unknown>,
  allowed: Set<string>,
  warnings: string[],
): void {
  if (allowed.size === 0) return;
  const branding = asRecord(payload.branding);
  if (Object.keys(branding).length === 0) return;

  const arr = Array.isArray(branding.heroImageUrls)
    ? (branding.heroImageUrls as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  if (arr.length > 0) {
    const filtered = arr.map((x) => x.trim()).filter((t) => Boolean(t) && allowed.has(t));
    const dropped = arr.length - filtered.length;
    if (dropped > 0) {
      warnings.push(`Removed ${dropped} hero image URL(s) not found in homepage research candidates`);
    }
    if (filtered.length >= 2) {
      branding.heroImageUrls = filtered;
      branding.heroImageUrl = filtered[0];
      return;
    }
    if (filtered.length === 1) {
      delete branding.heroImageUrls;
      branding.heroImageUrl = filtered[0];
      return;
    }
    delete branding.heroImageUrls;
  }

  const heroSingle = typeof branding.heroImageUrl === "string" ? branding.heroImageUrl.trim() : "";
  if (heroSingle && !allowed.has(heroSingle)) {
    warnings.push("Removed branding.heroImageUrl not found in homepage research candidates");
    delete branding.heroImageUrl;
  }
}

export type UrlAnalyzerHeroImportDebug = {
  heroImageCount: number;
  heroSliderActive: boolean;
  heroImagesDetectedFromResearchCount: number;
  heroImagesAppliedCount: number;
  heroSliderReason: "single-image" | "multi-image" | "fallback";
  heroCandidateUrlsCountBeforeFilter?: number;
  heroCandidateUrlsCountAfterFilter?: number;
};

/** Homepage HTML heuristics merged into import payload (compact DEBUG). */
export type UrlAnalyzerLayoutImportDebug = {
  heroImagesDetectedCount: number;
  heroSliderDetected: boolean;
  carsCarouselDetected: boolean;
  primaryCtaColorDetected?: string;
  layoutPatternsDetected: string[];
  websiteLogoCandidateCount: number;
  websiteLogoRejectedReason?: string;
  /** Set only when this pipeline wrote `branding.logoSource`. */
  logoSourceApplied?: "website";
};

/** Deterministic business/brand name resolution (compact DEBUG). */
export type UrlAnalyzerBusinessNameImportDebug = {
  resolvedBusinessName?: string;
  chosenBusinessName?: string;
  businessNameSource?:
    | "header"
    | "logoAlt"
    | "ogSiteName"
    | "ogTitle"
    | "jsonLdOrganization"
    | "title"
    | "footer"
    | "existingConfig"
    | "domainFallback";
  businessNameCandidatesCount: number;
  domainFallbackUsed: boolean;
  /** Raw heuristic score of the chosen candidate. */
  score?: number;
  /** 0–100 confidence for the chosen label. */
  confidence?: number;
  /** True when branding.displayName/siteName/businessName were overwritten by heuristics. */
  appliedToPayload?: boolean;
  refinementTriggered?: boolean;
  refinementApplied?: boolean;
  refinementReason?: "generic_strip" | "initials_fix" | "shorter_match";
  originalBusinessName?: string;
  refinedBusinessName?: string;
  businessNameCandidateSourcesSample?: string[];
  repeatedTitleCount?: number;
  titleRepeatedAcrossPages?: boolean;
  titlePipeSegmentMatchCount?: number;
  headerVsTitleConflictResolved?: "title" | "header";
  headerVsTitleConflictReason?: string;
};

function isSafeCssHexColor(raw: string): boolean {
  const s = raw.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

function normalizeCssHex3to6(raw: string): string {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/i.test(s)) {
    const r = s[1] + s[1];
    const g = s[2] + s[2];
    const b = s[3] + s[3];
    return `#${r}${g}${b}`.toLowerCase();
  }
  return s.toLowerCase();
}

/**
 * Merges deterministic homepage HTML signals into the import payload (additive).
 * Runs after URL sanitization, before hero image whitelist filtering.
 */
export function applyUrlResearchDeterministicSignals(
  payload: Record<string, unknown>,
  research: SiteResearchBundle,
  warnings: string[],
): UrlAnalyzerLayoutImportDebug {
  const sig = pickHomeResearchLayoutSignals(research);
  const out: UrlAnalyzerLayoutImportDebug = {
    heroImagesDetectedCount: sig?.heroImagesDetectedCount ?? 0,
    heroSliderDetected: Boolean(sig?.heroSliderDetected),
    carsCarouselDetected: Boolean(sig?.carsCarouselDetected),
    layoutPatternsDetected: sig?.layoutPatternsDetected ? [...sig.layoutPatternsDetected] : [],
    websiteLogoCandidateCount: sig?.logoCandidates?.length ?? 0,
    websiteLogoRejectedReason: sig?.websiteLogoRejectedReason,
  };
  if (!sig) return out;

  if (sig.primaryCtaBackgroundColor && isSafeCssHexColor(sig.primaryCtaBackgroundColor)) {
    const bg = normalizeCssHex3to6(sig.primaryCtaBackgroundColor);
    const fg =
      sig.primaryCtaTextColor && isSafeCssHexColor(sig.primaryCtaTextColor)
        ? normalizeCssHex3to6(sig.primaryCtaTextColor)
        : undefined;
    out.primaryCtaColorDetected = fg ? `bg=${bg};fg=${fg}` : `bg=${bg}`;
    const branding = asRecord(payload.branding);
    const nextBrand: Record<string, unknown> = { ...branding, primaryCtaBackgroundColor: bg };
    if (fg) nextBrand.primaryCtaTextColor = fg;
    payload.branding = nextBrand;
    warnings.push("Applied branding.primaryCta* colors from homepage CSS/theme heuristics");
  }

  if (sig.carsCarouselDetected) {
    const layout = asRecord(payload.layout);
    const show = layout.showFeaturedCars;
    if (show !== false) {
      payload.layout = { ...layout, featuredCarsPresentation: "carsCarousel" };
      warnings.push("Set layout.featuredCarsPresentation=carsCarousel from homepage inventory-carousel heuristics");
    }
  }

  if (sig.logoCandidates.length > 0) {
    const top = sig.logoCandidates[0];
    const branding = asRecord(payload.branding);
    const nextBrand: Record<string, unknown> = { ...branding, logoWebsiteCandidate: top.url };
    const modelLogo = typeof branding.logoUrl === "string" ? branding.logoUrl.trim() : "";
    const STRONG_LOGO = 38;
    if (top.score >= STRONG_LOGO && !modelLogo) {
      nextBrand.logoUrl = top.url;
      nextBrand.logoSource = "website";
      out.logoSourceApplied = "website";
      warnings.push("Applied branding.logoUrl from high-confidence homepage logo candidate");
    }
    payload.branding = nextBrand;
  }

  return out;
}

function firstTrimmedBrandingName(branding: Record<string, unknown>): string {
  for (const k of ["displayName", "siteName", "businessName"] as const) {
    const v = branding[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** True when the label matches the analyzed hostname slug (common model failure mode). */
export function isLikelyUrlDerivedDisplayName(name: string, startUrl: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || !startUrl.trim()) return false;
  try {
    const u = new URL(startUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const seg = host.split(".")[0];
    if (!seg) return false;
    const slugSp = seg.replace(/-/g, " ");
    if (n === seg) return true;
    if (n === slugSp) return true;
    const compact = (s: string) => s.replace(/[^a-z0-9]/gi, "");
    const cn = compact(n);
    const cs = compact(seg);
    if (cn.length >= 3 && cs.length >= 3 && cn === cs) return true;
    const titled = slugSp
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    if (name.trim() === titled) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Prefer deterministic homepage business-name signals over empty or hostname-shaped model output.
 * Does not replace a plausible on-brand model string when heuristics only have domainFallback.
 */
export function applyUrlResearchBusinessNameSignals(
  payload: Record<string, unknown>,
  research: SiteResearchBundle,
  warnings: string[],
): UrlAnalyzerBusinessNameImportDebug {
  const home = research.pages.find((p) => p.fetchedOk && p.researchHints.includes("home"));
  const sig = home?.businessNameSignals;
  const dbg = sig?.businessNameChosenDebug;
  const base: UrlAnalyzerBusinessNameImportDebug = {
    businessNameCandidatesCount: sig?.businessNameCandidatesCount ?? 0,
    domainFallbackUsed: Boolean(sig?.domainFallbackUsed),
    resolvedBusinessName: sig?.resolvedBusinessName,
    businessNameSource: sig?.businessNameSource,
    chosenBusinessName: dbg?.chosenBusinessName ?? sig?.resolvedBusinessName,
    score: dbg?.score ?? sig?.businessNameResolutionScore,
    confidence: dbg?.confidence ?? sig?.businessNameConfidence,
    refinementTriggered: sig?.refinementTriggered,
    refinementApplied: sig?.refinementApplied,
    refinementReason: sig?.refinementReason,
    originalBusinessName: sig?.originalBusinessName,
    refinedBusinessName: sig?.refinedBusinessName,
    businessNameCandidateSourcesSample: sig?.businessNameCandidateSourcesSample,
    repeatedTitleCount: sig?.repeatedTitleCount,
    titleRepeatedAcrossPages: sig?.titleRepeatedAcrossPages,
    titlePipeSegmentMatchCount: sig?.titlePipeSegmentMatchCount,
    headerVsTitleConflictResolved: sig?.headerVsTitleConflictResolved,
    headerVsTitleConflictReason: sig?.headerVsTitleConflictReason,
  };
  if (!sig) return base;
  const resolved = sig.resolvedBusinessName?.trim();
  if (!resolved) return base;

  const branding = asRecord(payload.branding);
  const model = firstTrimmedBrandingName(branding);
  const strongHeuristic = !sig.domainFallbackUsed;
  const modelWeak = !model || isLikelyUrlDerivedDisplayName(model, research.startUrl);

  let shouldApply = false;
  if (strongHeuristic && modelWeak) shouldApply = true;
  if (sig.domainFallbackUsed && !model) shouldApply = true;

  if (!shouldApply) return base;

  payload.branding = {
    ...branding,
    displayName: resolved,
    siteName: resolved,
    businessName: resolved,
  };
  warnings.push(
    strongHeuristic
      ? "Applied branding display/site/business name from homepage business-name heuristics"
      : "Applied branding display/site/business name from domain fallback (no strong on-page name)",
  );
  return { ...base, appliedToPayload: true };
}

export function buildHeroImportDebug(
  payload: Record<string, unknown>,
  detectedCount: number,
  heroFilterCounts?: { before?: number; after?: number },
): UrlAnalyzerHeroImportDebug {
  const b = asRecord(payload.branding);
  const arr = Array.isArray(b.heroImageUrls) ? (b.heroImageUrls as string[]).map((x) => String(x).trim()).filter(Boolean) : [];
  const heroUrl = typeof b.heroImageUrl === "string" ? b.heroImageUrl.trim() : "";
  const applied = arr.length >= 2 ? arr : heroUrl ? [heroUrl] : [];
  const n = applied.length;
  const slider = n >= 2;
  let reason: UrlAnalyzerHeroImportDebug["heroSliderReason"];
  if (n >= 2) reason = "multi-image";
  else if (n === 1) reason = "single-image";
  else reason = "fallback";
  return {
    heroImageCount: n,
    heroSliderActive: slider,
    heroImagesDetectedFromResearchCount: detectedCount,
    heroImagesAppliedCount: n,
    heroSliderReason: reason,
    heroCandidateUrlsCountBeforeFilter: heroFilterCounts?.before,
    heroCandidateUrlsCountAfterFilter: heroFilterCounts?.after,
  };
}

export type AnalyzeTenantSiteUrlParams = {
  url: string;
  includeSubpages?: boolean;
  maxPages?: number;
  preferHebrew?: boolean;
  industryHint?: string;
  mode?: SiteResearchOptions["mode"];
};

const URL_ANALYZER_MAX_TOKENS = 6000;

export type UrlAnalyzerAiFailureStage = "client-init" | "request" | "response" | "parse" | "sanitize";

/** Safe, compact Anthropic observability for URL analyzer DEBUG (no secrets, no full model output). */
export type UrlAnalyzerAiDebugInfo = {
  provider: "anthropic";
  clientReady: boolean;
  apiKeyPresent: boolean;
  apiKeySource: "env" | "functionsConfig" | "missing";
  requestStarted: boolean;
  requestFinished: boolean;
  modelRequested: string;
  modelReturned?: string;
  maxTokensRequested: number;
  claudeDurationMs?: number;
  responseTextLength?: number;
  responseBlockCount?: number;
  stopReason?: string;
  usageInputTokens?: number;
  usageOutputTokens?: number;
  requestId?: string;
  failureStage?: UrlAnalyzerAiFailureStage;
  providerErrorType?: string;
  providerErrorStatus?: number;
  providerErrorMessage?: string;
};

function anthropicErrorShape(err: unknown): { type?: string; status?: number; message: string } {
  if (!err || typeof err !== "object") {
    return { message: truncateSafeDetail(String(err), 200) };
  }
  const o = err as Record<string, unknown>;
  const status = typeof o.status === "number" ? o.status : undefined;
  const type =
    typeof o.name === "string"
      ? o.name
      : typeof o.type === "string"
        ? String(o.type)
        : undefined;
  const msg =
    err instanceof Error
      ? truncateSafeDetail(err.message, 300)
      : truncateSafeDetail(String(o.message ?? "provider error"), 300);
  return { type, status, message: msg };
}

/** Baseline AI DEBUG before any Anthropic request (safe: no secrets). */
export function buildUrlAnalyzerAiDebugBaseline(model: string): UrlAnalyzerAiDebugInfo {
  const st = getAnthropicClientDebugStatus();
  return {
    provider: "anthropic",
    clientReady: st.clientReady,
    apiKeyPresent: st.apiKeyPresent,
    apiKeySource: st.apiKeySource,
    requestStarted: false,
    requestFinished: false,
    modelRequested: model,
    maxTokensRequested: URL_ANALYZER_MAX_TOKENS,
  };
}

/** Safe merge observability for admin DEBUG (no secrets, no raw HTML). */
export type UrlAnalyzerImportPipelineDebug = TenantSiteDeterministicImportDebug & {
  aiFieldPaths: string[];
  mergedFieldPaths: string[];
  mergedHomeSectionsCount: number;
  mergedHomeSections: string[];
  mergedLayoutBooleans: Record<string, boolean>;
};

function listImportLeafPaths(payload: Record<string, unknown>, max = 140): string[] {
  const out: string[] = [];
  for (const top of ["branding", "content", "contact", "seo", "layout"] as const) {
    const r = asRecord(payload[top]);
    for (const k of Object.keys(r)) {
      out.push(`${top}.${k}`);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function mergedLayoutBooleansSnapshot(layout: Record<string, unknown>): Record<string, boolean> {
  const keys = [
    "showFeaturedCars",
    "showAbout",
    "showBenefits",
    "showFinance",
    "showTestimonials",
    "showContact",
    "showMap",
  ] as const;
  const o: Record<string, boolean> = {};
  for (const k of keys) {
    if (typeof layout[k] === "boolean") o[k] = layout[k] as boolean;
  }
  return o;
}

export type AnalyzeTenantSiteUrlModelResult = {
  payload: Record<string, unknown>;
  warnings: string[];
  notes: string[];
  model: string;
  pageFindings: { url: string; title?: string; fetchedOk: boolean; status?: number }[];
  normalizedUrl: string;
  pagesAttempted: number;
  pagesFetchedOk: number;
  researchMode: NonNullable<SiteResearchOptions["mode"]>;
  timings: { fetchResearchMs: number; claudeMs: number; parseMs: number };
  /** Anthropic request/response observability for admin DEBUG. */
  ai?: UrlAnalyzerAiDebugInfo;
  /** Compact hero slider diagnostics for admin DEBUG (no raw URL arrays). */
  heroImport: UrlAnalyzerHeroImportDebug;
  /** Homepage HTML layout heuristics (hero counts, carousel detection, CTA colors, logo candidates). */
  layoutImport: UrlAnalyzerLayoutImportDebug;
  /** Homepage business-name heuristics vs domain fallback (compact). */
  businessNameImport: UrlAnalyzerBusinessNameImportDebug;
  /** Deterministic research mapper + merge field inventory for DEBUG. */
  importPipelineDebug: UrlAnalyzerImportPipelineDebug;
};

export async function analyzeTenantSiteUrlWithClaude(
  params: AnalyzeTenantSiteUrlParams,
): Promise<AnalyzeTenantSiteUrlModelResult> {
  const warnings: string[] = [];
  const notes: string[] = [
    "Research is bounded HTML/text only (no Firestore writes).",
    "Output is restricted to import buckets: branding, content, contact, seo, layout.",
  ];

  const model = resolveClaudeSiteBuilderUrlResearchModel();
  const rawUrl = params.url?.trim() ?? "";
  const tFetch0 = Date.now();
  let research: Awaited<ReturnType<typeof researchTenantWebsite>>;
  try {
    research = await researchTenantWebsite(params.url, {
      includeSubpages: params.includeSubpages,
      maxPages: params.maxPages,
      mode: params.mode,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const invalid = /URL is empty|Only http|https URLs are supported|Invalid URL/i.test(msg);
    const phase = invalid ? "normalize" : "fetch";
    let normalizedHint: string | undefined;
    if (!invalid) {
      try {
        normalizedHint = normalizePublicHttpUrl(rawUrl).toString();
      } catch {
        normalizedHint = undefined;
      }
    }
    console.error(
      "[urlResearch] phase failed",
      JSON.stringify({ phase, url: rawUrl, message: truncateSafeDetail(msg, 120) }),
    );
    throw new functions.https.HttpsError(
      invalid ? "invalid-argument" : "failed-precondition",
      invalid ? "URL normalization failed" : "Website fetch/research failed",
      {
        debugError: buildDebugError({
          phase,
          message: msg || (invalid ? "URL normalization failed" : "Website fetch/research failed"),
          url: rawUrl,
          normalizedUrl: normalizedHint,
          pagesAttempted: 0,
          pagesFetchedOk: 0,
          safeDetails: truncateSafeDetail(msg, 200),
        }),
        ai: buildUrlAnalyzerAiDebugBaseline(model),
      },
    );
  }
  const fetchResearchMs = Date.now() - tFetch0;
  for (const w of research.warnings) warnings.push(w);

  const pageFindings = research.pages.map((p) => ({
    url: p.url,
    title: p.title,
    fetchedOk: p.fetchedOk,
    status: p.status,
  }));

  const pagesAttempted = research.pages.length;
  const pagesFetchedOk = research.pages.filter((p) => p.fetchedOk).length;
  const normalizedUrl = research.startUrl;
  const researchMode = params.mode ?? "site";

  if (pagesFetchedOk === 0) {
    console.error(
      "[urlResearch] no successful page fetches",
      JSON.stringify({ url: rawUrl, normalizedUrl, pagesAttempted, pagesFetchedOk }),
    );
    throw new functions.https.HttpsError("failed-precondition", "Website fetch/research failed", {
      debugError: buildDebugError({
        phase: "fetch",
        message: "No pages fetched successfully",
        url: rawUrl,
        normalizedUrl,
        pagesAttempted,
        pagesFetchedOk: 0,
        safeDetails: `Attempted ${pagesAttempted} page(s); none returned usable HTML.`,
      }),
      ai: buildUrlAnalyzerAiDebugBaseline(model),
    });
  }

  const researchJson = JSON.stringify(
    {
      startUrl: research.startUrl,
      origin: research.origin,
      pages: research.pages.map((p) => ({
        url: p.url,
        researchHints: p.researchHints,
        fetchedOk: p.fetchedOk,
        status: p.status,
        error: p.error,
        title: p.title,
        metaDescription: p.metaDescription,
        ogTitle: p.ogTitle,
        ogDescription: p.ogDescription,
        themeColor: p.themeColor,
        navLabels: p.navLabels,
        headingLines: p.headingLines,
        footerText: p.footerText,
        mainTextSample: p.mainTextSample,
        heroBannerImageCandidates: p.heroBannerImageCandidates,
        layoutSignals: p.layoutSignals,
        businessNameSignals: p.businessNameSignals,
      })),
    },
    null,
    0,
  );

  const langHint = params.preferHebrew ? "Prefer Hebrew copy when the source site is Hebrew or bilingual." : "";
  const industry = params.industryHint?.trim()
    ? `Industry hint from admin: ${params.industryHint.trim().slice(0, 240)}`
    : "";

  const instruction = `You are a careful website analyst AND a mapper into a fixed tenant homepage builder schema.

INPUT: JSON bundle of fetched public HTML pages (homepage + same-origin internal pages when present). Each page includes researchHints (e.g. home, about, contact, finance, testimonials, inventory) — use hints + URL/title/nav to choose where to pull copy from. Homepage entries may include businessNameSignals: prefer resolvedBusinessName for branding.displayName/siteName/businessName when it matches visible branding (do not replace a clearly better on-page string; never invent a different company name than the site shows).

SECTION IDS (layout.homeSections only): hero, featuredCars, about, benefits, finance, testimonials, contact, map.

MULTI-PAGE MAPPING (prefer the page whose hints/title match; otherwise use the richest on-page text):
- Pages hinted "about" or with About-style headings → content.aboutTitle, content.aboutText (company story; 2–5 short paragraphs max).
- Selling points / bullets / "why us" on home or marketing pages → content.benefitsItems (array of 4–6 full-sentence benefit lines, not one-word labels).
- Pages hinted "finance" or financing vocabulary → content.financeTitle, content.financeText.
- Pages hinted "testimonials" or reviews/quotes → content.testimonialsTitle, content.testimonialsText. testimonialsText is ONE string: join 2–4 real quotes with blank lines; if none exist, write 2 believable short quotes consistent with the business tone (no "lorem"/placeholder labels).
- Pages hinted "contact" or footer → contact.phone, contact.whatsapp, contact.email, contact.address, contact.city (formats must be plausible).
- Physical address for map: prefer street+city from contact or visible text. If only a city or region is known, put it in contact.city so the map section can geocode.

ALWAYS POPULATE (unless physically impossible): branding.displayName or siteName, content hero fields, about, benefits list, finance block, testimonials block, contact headline fields (content.contactTitle, content.contactSubtitle), contact channels when any exist on the site, seo.title + seo.description.

LAYOUT:
- layout.homeSections: sensible order, typically hero → featuredCars → about → benefits → finance → testimonials → contact → map.
- Optional layout.featuredCarsPresentation: when research JSON layoutSignals.carsCarouselDetected is true, set to "carsCarousel"; otherwise omit (defaults to grid).
- Set ALL of layout.showFeaturedCars, showAbout, showBenefits, showFinance, showTestimonials, showContact, showMap to true when you output any matching content OR when you synthesized copy for that section (downstream expects a full homepage).
- map: set showMap true when contact.address or contact.city has a real location string (city+country is enough). If the business is online-only with no address, infer service city/region from copy or hints when reasonable.

COPY STYLE:
- Prefer real on-page strings for titles/body/CTAs/contact/SEO.
- If a field is missing, invent SHORT professional Hebrew or English copy consistent with the business (match site language); never output empty strings for required narrative fields you are filling.

THEME:
- Infer primaryColor/secondaryColor/accentColor as #rrggbb when reasonably confident from CSS/theme-color/nav/hero styling cues; otherwise omit colors rather than guessing wildly.
- Optional branding.primaryCtaBackgroundColor and branding.primaryCtaTextColor as #rrggbb ONLY when the same values appear in research layoutSignals (deterministic CSS extraction). Otherwise omit.
- Optional branding.pageBackgroundImageUrl: ONLY when the research JSON includes a stable https URL clearly used as a wide site backdrop or body background (not a product photo, not a tiny icon, not a screenshot). Otherwise omit. Optional branding.pageBackgroundOverlayOpacity: number 0–0.85 when you set a page background image.
- NEVER set branding.logoUrl unless the research JSON clearly shows a stable absolute image URL used as a brand logo (not generic stock icons). If unsure, omit.
- When research lists layoutSignals.logoCandidates, you may set branding.logoWebsiteCandidate to ONE of those URLs only (never invent). Prefer the highest score entry. Do not use hero/banner photos as logos.
- HERO IMAGES (homepage): Each page may include heroBannerImageCandidates (same-origin URLs extracted from HTML) and optional layoutSignals (e.g. heroSliderDetected, heroImagesDetectedCount). When the homepage lists 2+ distinct candidates that clearly belong to one hero/slider/banner area (rotating promos, not thumbnails/icons), set branding.heroImageUrls to those URLs in visual order (max 8) and set branding.heroImageUrl to the first. When only one suitable hero image exists, set only branding.heroImageUrl (omit heroImageUrls). NEVER invent URLs not present in heroBannerImageCandidates for multi-image; NEVER use unrelated page images. If unsure between one vs many, prefer a single heroImageUrl.
- NEVER set seo.ogImageUrl unless clearly from og:image on the researched pages and safe https.

Optional layout.sectionStyles: only for non-hero sections; allowed keys per section: backgroundMode, textTone, align, layoutVariant, paddingDensity, cardStyle, sectionBackgroundColor (#rgb/#rrggbb only when confident). Do NOT set sectionBackgroundImageUrl unless you have a stable same-origin hero-style asset URL (usually omit).

RETURN:
ONE JSON object ONLY (no markdown, no prose outside JSON). Top-level keys ONLY among: branding, content, contact, seo, layout. Omit empty objects.

FORBIDDEN keys anywhere: tenantId, yardUid, sellerUid, dataScope, featuredCarIds, diagnostics, hive, runtime, rawSnapshot, effective, preview.

${langHint}
${industry}

RESEARCH_JSON:
${researchJson}`;

  const aiPreFlight = buildUrlAnalyzerAiDebugBaseline(model);
  if (!aiPreFlight.clientReady) {
    const msg = aiPreFlight.apiKeyPresent ? "Anthropic client did not initialize" : "Anthropic API key is not configured";
    aiPreFlight.failureStage = "client-init";
    aiPreFlight.providerErrorMessage = truncateSafeDetail(msg, 200);
    throw new functions.https.HttpsError("failed-precondition", msg, {
      debugError: buildDebugError({
        phase: "claude",
        message: msg,
        url: rawUrl,
        normalizedUrl,
        pagesAttempted,
        pagesFetchedOk,
        safeDetails: aiPreFlight.apiKeyPresent
          ? "API key is present but SDK client failed to initialize."
          : "Configure ANTHROPIC_API_KEY or functions config anthropic.key.",
      }),
      ai: aiPreFlight,
    });
  }

  type ClaudeMsgResponseLite = {
    id?: string;
    model?: string;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    content?: unknown[];
  };

  const tClaude0 = Date.now();
  let lastResponse: ClaudeMsgResponseLite | null = null;
  let text: string;
  try {
    const response = (await anthropicClient.messages.create({
      model,
      max_tokens: URL_ANALYZER_MAX_TOKENS,
      messages: [{ role: "user", content: [{ type: "text", text: instruction }] }],
    })) as ClaudeMsgResponseLite;
    lastResponse = response;
    text = response.content
      ?.filter((block) => (block as { type?: string }).type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim() ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pe = anthropicErrorShape(e);
    console.error("[urlResearch] claude API failed", JSON.stringify({ url: rawUrl, normalizedUrl, detail: truncateSafeDetail(msg, 160) }));
    throw new functions.https.HttpsError("unavailable", "Model request failed", {
      debugError: buildDebugError({
        phase: "claude",
        message: "Model request failed",
        url: rawUrl,
        normalizedUrl,
        pagesAttempted,
        pagesFetchedOk,
        safeDetails: truncateSafeDetail(msg, 200),
      }),
      ai: {
        ...buildUrlAnalyzerAiDebugBaseline(model),
        requestStarted: true,
        requestFinished: false,
        failureStage: "request",
        providerErrorType: pe.type,
        providerErrorStatus: pe.status,
        providerErrorMessage: pe.message,
        claudeDurationMs: Date.now() - tClaude0,
      },
    });
  }
  const claudeMs = Date.now() - tClaude0;

  const blockCount = Array.isArray(lastResponse?.content) ? lastResponse.content.length : 0;
  const inTok = lastResponse?.usage?.input_tokens;
  const outTok = lastResponse?.usage?.output_tokens;
  const aiAfterClaude: Pick<
    UrlAnalyzerAiDebugInfo,
    | "requestStarted"
    | "requestFinished"
    | "modelReturned"
    | "stopReason"
    | "usageInputTokens"
    | "usageOutputTokens"
    | "requestId"
    | "claudeDurationMs"
    | "responseTextLength"
    | "responseBlockCount"
  > = {
    requestStarted: true,
    requestFinished: true,
    modelReturned: typeof lastResponse?.model === "string" ? lastResponse.model : undefined,
    stopReason: typeof lastResponse?.stop_reason === "string" ? lastResponse.stop_reason : undefined,
    usageInputTokens: typeof inTok === "number" && Number.isFinite(inTok) ? Math.max(0, Math.floor(inTok)) : undefined,
    usageOutputTokens: typeof outTok === "number" && Number.isFinite(outTok) ? Math.max(0, Math.floor(outTok)) : undefined,
    requestId: typeof lastResponse?.id === "string" ? lastResponse.id : undefined,
    claudeDurationMs: claudeMs,
    responseTextLength: text.length,
    responseBlockCount: blockCount,
  };

  if (!text) {
    throw new functions.https.HttpsError("internal", "Model returned no text content", {
      debugError: buildDebugError({
        phase: "claude",
        message: "Model returned no text content",
        url: rawUrl,
        normalizedUrl,
        pagesAttempted,
        pagesFetchedOk,
        safeDetails: "Anthropic responded but joined text blocks were empty.",
      }),
      ai: {
        ...buildUrlAnalyzerAiDebugBaseline(model),
        ...aiAfterClaude,
        failureStage: "response",
      },
    });
  }

  const tParse0 = Date.now();
  let parsed: unknown;
  try {
    parsed = extractJsonObjectFromModelText(text);
  } catch (e) {
    const snippet = truncateSafeDetail(text, 200);
    const msg = e instanceof Error ? e.message : String(e);
    const safeDetails = truncateSafeDetail(msg, 200);
    console.error("claudeTenantSiteUrlResearch: JSON parse failed", truncateSafeDetail(msg, 120), text.slice(0, 400));
    throw new functions.https.HttpsError("internal", "Model response could not be parsed", {
      debugError: buildDebugError({
        phase: "parse",
        message: "Model response could not be parsed",
        url: rawUrl,
        normalizedUrl,
        pagesAttempted,
        pagesFetchedOk,
        parseSnippet: snippet,
        safeDetails,
      }),
      ai: {
        ...buildUrlAnalyzerAiDebugBaseline(model),
        ...aiAfterClaude,
        failureStage: "parse",
      },
    });
  }
  const parseMs = Date.now() - tParse0;

  const sanitized = sanitizeAiTenantSiteImportPayload(parsed, warnings, { allowLayoutSectionStyles: true });
  const { patch: deterministicResearchPatch, debug: deterministicBundleDebug } = buildTenantSiteImportFromResearchBundle(research);
  const mergedPreUrl = mergeDeterministicResearchUnderSanitizedClaude(deterministicResearchPatch, sanitized);
  const reSanitized = sanitizeAiTenantSiteImportPayload(mergedPreUrl, warnings, { allowLayoutSectionStyles: true });
  const urlSafe = sanitizeImportHttpUrlsInResearchPayload(reSanitized, warnings);

  const layoutRec = asRecord(urlSafe.layout);
  const mergedHomeSections = Array.isArray(layoutRec.homeSections)
    ? (layoutRec.homeSections as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const importPipelineDebug: UrlAnalyzerImportPipelineDebug = {
    ...deterministicBundleDebug,
    aiFieldPaths: listImportLeafPaths(sanitized),
    mergedFieldPaths: listImportLeafPaths(urlSafe),
    mergedHomeSectionsCount: mergedHomeSections.length,
    mergedHomeSections,
    mergedLayoutBooleans: mergedLayoutBooleansSnapshot(layoutRec),
  };

  const layoutImport = applyUrlResearchDeterministicSignals(urlSafe, research, warnings);
  const businessNameImport = applyUrlResearchBusinessNameSignals(urlSafe, research, warnings);

  const heroResearchFlat = collectHeroBannerResearchUrls(research);
  const heroCandidateSet = new Set(heroResearchFlat);
  filterBrandingHeroImagesToResearchWhitelist(urlSafe, heroCandidateSet, warnings);
  const layoutSigForHero = pickHomeResearchLayoutSignals(research);
  const heroImport = buildHeroImportDebug(urlSafe, heroResearchFlat.length, {
    before: layoutSigForHero?.heroCandidateUrlsCountBeforeFilter,
    after: layoutSigForHero?.heroCandidateUrlsCountAfterFilter,
  });

  if (Object.keys(urlSafe).length === 0) {
    console.error("[urlResearch] empty sanitized payload", JSON.stringify({ normalizedUrl, pagesFetchedOk }));
    throw new functions.https.HttpsError("failed-precondition", "Sanitized payload is empty", {
      debugError: buildDebugError({
        phase: "sanitize",
        message: "Sanitized payload is empty",
        url: rawUrl,
        normalizedUrl,
        pagesAttempted,
        pagesFetchedOk,
        safeDetails: "Model output produced no importable top-level buckets after sanitization.",
      }),
      ai: {
        ...buildUrlAnalyzerAiDebugBaseline(model),
        ...aiAfterClaude,
        failureStage: "sanitize",
      },
    });
  }

  const aiSuccess: UrlAnalyzerAiDebugInfo = {
    ...buildUrlAnalyzerAiDebugBaseline(model),
    ...aiAfterClaude,
  };

  return {
    payload: urlSafe,
    warnings,
    notes,
    model,
    pageFindings,
    normalizedUrl,
    pagesAttempted,
    pagesFetchedOk,
    researchMode,
    timings: { fetchResearchMs, claudeMs, parseMs },
    ai: aiSuccess,
    heroImport,
    layoutImport,
    businessNameImport,
    importPipelineDebug,
  };
}
