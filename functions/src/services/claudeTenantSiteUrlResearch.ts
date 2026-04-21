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
import { normalizePublicHttpUrl, researchTenantWebsite, type SiteResearchOptions } from "./siteResearchExtractor";
import { buildDebugError, truncateSafeDetail } from "./urlResearchCallableDebug";

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

INPUT: JSON bundle of fetched public HTML pages (homepage + optional same-origin internal pages). Text may be truncated.

TASK:
1) Infer the business and homepage story.
2) Choose the best matching sections for OUR builder (only these ids): hero, featuredCars, about, benefits, finance, testimonials, contact, map.
3) Prefer real on-page strings for titles/body/CTAs/contact/SEO. If a field is implied but missing, invent SHORT, professional placeholder copy consistent with the business (no long essays).
4) Theme: infer primaryColor/secondaryColor/accentColor as #rrggbb when reasonably confident from CSS/theme-color/nav/hero styling cues; otherwise omit colors rather than guessing wildly.
5) Optional branding.pageBackgroundImageUrl: ONLY when the research JSON includes a stable https URL clearly used as a wide site backdrop or body background (not a product photo, not a tiny icon, not a screenshot). Otherwise omit. Optional branding.pageBackgroundOverlayOpacity: number 0–0.85 when you set a page background image.
6) NEVER set branding.heroImageUrl or branding.logoUrl unless the research JSON clearly shows a stable absolute image URL used as a brand logo or a dedicated hero/banner image (not generic stock icons). If unsure, omit both.
7) NEVER set seo.ogImageUrl unless clearly from og:image on the researched pages and safe https.
8) layout.homeSections should reflect a sensible above-the-fold story order.
9) Toggle layout booleans (showFeaturedCars/showAbout/...) consistent with what you configure in content and the inferred site.
10) Optional layout.sectionStyles: only for non-hero sections; allowed keys per section: backgroundMode, textTone, align, layoutVariant, paddingDensity, cardStyle, sectionBackgroundColor (#rgb/#rrggbb only when confident). Do NOT set sectionBackgroundImageUrl unless you have a stable same-origin hero-style asset URL (usually omit).
11) contact fields only when discovered or strongly implied by visible text; phone/whatsapp/email should be plausible formats.
12) map: set layout.showMap true ONLY if a real postal address or city+street is discoverable in page text; otherwise omit or set false.

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
  const urlSafe = sanitizeImportHttpUrlsInResearchPayload(sanitized, warnings);

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
  };
}
