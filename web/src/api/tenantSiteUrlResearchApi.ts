import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';

export type AnalyzeTenantSiteUrlPageFinding = {
  url: string;
  title?: string;
  fetchedOk: boolean;
  status?: number;
};

/** Mirrors server `UrlAnalyzerAiFailureStage` (safe for DEBUG JSON). */
export type UrlAnalyzerAiFailureStage = 'client-init' | 'request' | 'response' | 'parse' | 'sanitize';

/** Mirrors server `UrlAnalyzerAiDebugInfo` (no secrets). */
export type UrlAnalyzerAiDebugInfo = {
  provider: 'anthropic';
  clientReady: boolean;
  apiKeyPresent: boolean;
  apiKeySource: 'env' | 'functionsConfig' | 'missing';
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

/** Compact row for page DEBUG `urlImport.aiSummary`. */
export type UrlAnalyzerAiSummary = {
  provider?: 'anthropic';
  clientReady?: boolean;
  apiKeyPresent?: boolean;
  apiKeySource?: 'env' | 'functionsConfig' | 'missing';
  modelRequested?: string;
  modelReturned?: string;
  requestStarted?: boolean;
  requestFinished?: boolean;
  stopReason?: string;
  usageInputTokens?: number;
  usageOutputTokens?: number;
  failureStage?: UrlAnalyzerAiFailureStage;
  providerErrorType?: string;
  providerErrorStatus?: number;
};

export function buildUrlAnalyzerAiSummary(ai: UrlAnalyzerAiDebugInfo | undefined | null): UrlAnalyzerAiSummary | null {
  if (!ai) return null;
  return {
    provider: ai.provider,
    clientReady: ai.clientReady,
    apiKeyPresent: ai.apiKeyPresent,
    apiKeySource: ai.apiKeySource,
    modelRequested: ai.modelRequested,
    modelReturned: ai.modelReturned,
    requestStarted: ai.requestStarted,
    requestFinished: ai.requestFinished,
    stopReason: ai.stopReason,
    usageInputTokens: ai.usageInputTokens,
    usageOutputTokens: ai.usageOutputTokens,
    failureStage: ai.failureStage,
    providerErrorType: ai.providerErrorType,
    providerErrorStatus: ai.providerErrorStatus,
  };
}

export function extractUrlAnalyzerAiFromCallableDetails(details: unknown): UrlAnalyzerAiDebugInfo | undefined {
  const r = asPlainRecord(details);
  if (!r) return undefined;
  const ai = r.ai;
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return undefined;
  const o = ai as Record<string, unknown>;
  if (o.provider !== 'anthropic' || typeof o.modelRequested !== 'string') return undefined;
  return ai as UrlAnalyzerAiDebugInfo;
}

export type AnalyzeTenantSiteUrlDiagnostics = {
  model: string;
  analyzedUrl: string;
  pagesInspected: number;
  notes?: string[];
};

/** Compact hero diagnostics from URL research (mirrors server). */
export type TenantSiteUrlHeroImportDebug = {
  heroImageCount: number;
  heroSliderActive: boolean;
  heroImagesDetectedFromResearchCount: number;
  heroImagesAppliedCount: number;
  heroSliderReason: 'single-image' | 'multi-image' | 'fallback';
};

/** Mirrors server `UrlAnalyzerLayoutImportDebug` (compact). */
export type TenantSiteUrlLayoutImportDebug = {
  heroImagesDetectedCount: number;
  heroSliderDetected: boolean;
  carsCarouselDetected: boolean;
  primaryCtaColorDetected?: string;
  layoutPatternsDetected: string[];
  websiteLogoCandidateCount: number;
  websiteLogoRejectedReason?: string;
  logoSourceApplied?: 'website';
};

/** Mirrors server `UrlAnalyzerBusinessNameImportDebug` (compact). */
export type TenantSiteUrlBusinessNameImportDebug = {
  resolvedBusinessName?: string;
  /** Same as `resolvedBusinessName` when chosen; mirrors server `businessNameChosenDebug`. */
  chosenBusinessName?: string;
  businessNameSource?:
    | 'header'
    | 'logoAlt'
    | 'ogSiteName'
    | 'ogTitle'
    | 'jsonLdOrganization'
    | 'title'
    | 'metaTitle'
    | 'footer'
    | 'existingConfig'
    | 'domainFallback';
  businessNameCandidatesCount: number;
  domainFallbackUsed: boolean;
  /** Raw heuristic score for the chosen label. */
  score?: number;
  /** 0–100 confidence. */
  confidence?: number;
  appliedToPayload?: boolean;
  refinementTriggered?: boolean;
  refinementApplied?: boolean;
  refinementReason?: 'generic_strip' | 'initials_fix' | 'shorter_match';
  originalBusinessName?: string;
  refinedBusinessName?: string;
};

/** Mirrors server `AnalyzeTenantSiteUrlDebugInfo` (safe subset for typing). */
export type AnalyzeTenantSiteUrlDebugInfo = {
  normalizedUrl: string;
  requestedParams: {
    url: string;
    includeSubpages?: boolean;
    maxPages?: number;
    preferHebrew?: boolean;
    industryHintLength: number;
    mode?: 'homepage' | 'site';
  };
  pagesRequested: number;
  pagesAttempted: number;
  pagesFetchedOk: number;
  pagesFailed: number;
  pageFindingsSummary: AnalyzeTenantSiteUrlPageFinding[];
  warnings?: string[];
  notes?: string[];
  model: string;
  researchMode: 'homepage' | 'site';
  timings?: { fetchResearchMs: number; claudeMs: number; parseMs: number };
  partial?: boolean;
  ai?: UrlAnalyzerAiDebugInfo;
  heroImport?: TenantSiteUrlHeroImportDebug;
  layoutImport?: TenantSiteUrlLayoutImportDebug;
  businessNameImport?: TenantSiteUrlBusinessNameImportDebug;
};

/** Mirrors server `UrlResearchFailurePhase` (safe subset for the admin builder). */
export type UrlResearchFailurePhase =
  | 'validation'
  | 'auth'
  | 'normalize'
  | 'fetch'
  | 'research'
  | 'claude'
  | 'parse'
  | 'sanitize'
  | 'unknown';

export type UrlResearchDebugErrorPayload = {
  phase: UrlResearchFailurePhase;
  message: string;
  code?: string;
  safeDetails?: string;
  parseSnippet?: string;
  url?: string;
  normalizedUrl?: string;
  pagesAttempted?: number;
  pagesFetchedOk?: number;
  timestamp: string;
};

/** Trimmed snapshot of the raw SDK error for DEBUG (no secrets, no large blobs). */
export type UrlResearchRawCallableErrorShape = {
  name?: string;
  code?: string;
  message?: string;
  hasDetails: boolean;
  hasCustomData: boolean;
  customDataKeys?: string[];
  detailsKeys?: string[];
};

/** Callable failure with Firebase `details` preserved for DEBUG surfaces. */
export class TenantSiteUrlResearchCallableError extends Error {
  readonly callableCode: string;

  readonly callableMessage: string;

  readonly callableDetails?: unknown;

  readonly debugError: UrlResearchDebugErrorPayload;

  readonly timestamp: string;

  /** Temporary observability: where Firebase placed `details` / `customData`. */
  readonly rawCallableErrorShape?: UrlResearchRawCallableErrorShape;

  constructor(args: {
    message: string;
    callableCode: string;
    callableMessage?: string;
    callableDetails?: unknown;
    debugError?: UrlResearchDebugErrorPayload;
    timestamp?: string;
    rawCallableErrorShape?: UrlResearchRawCallableErrorShape;
  }) {
    super(args.message);
    this.name = 'TenantSiteUrlResearchCallableError';
    this.callableCode = args.callableCode;
    this.callableMessage = args.callableMessage ?? args.message;
    this.timestamp = args.timestamp ?? new Date().toISOString();
    this.rawCallableErrorShape = args.rawCallableErrorShape;
    this.debugError =
      args.debugError ??
      buildFallbackDebugError(
        args.callableCode,
        args.callableMessage ?? args.message,
        asPlainRecord(args.callableDetails),
      );
    this.callableDetails = mergeCallableDetailsForDebug(args.callableDetails, this.debugError);
  }
}

export type AnalyzeTenantSiteUrlResponse = {
  ok: true;
  payload: unknown;
  diagnostics: AnalyzeTenantSiteUrlDiagnostics;
  pageFindings?: AnalyzeTenantSiteUrlPageFinding[];
  warnings?: string[];
  debug?: AnalyzeTenantSiteUrlDebugInfo;
};

export type AnalyzeTenantSiteUrlRequest = {
  url: string;
  includeSubpages?: boolean;
  maxPages?: number;
  preferHebrew?: boolean;
  industryHint?: string;
  mode?: 'homepage' | 'site';
};

function asPlainRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

const MAX_CALLABLE_DETAIL_STRING = 800;

/** Shallow-safe copy for DEBUG (no giant blobs). */
function trimCallableDetailsForClient(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  const rec = asPlainRecord(raw);
  if (!rec) return String(raw).slice(0, MAX_CALLABLE_DETAIL_STRING);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k.length > 80) continue;
    if (v === null || v === undefined) {
      out[k] = v;
    } else if (typeof v === 'string') {
      out[k] = v.length > MAX_CALLABLE_DETAIL_STRING ? `${v.slice(0, MAX_CALLABLE_DETAIL_STRING)}…` : v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (asPlainRecord(v)) {
      out[k] = trimCallableDetailsForClient(v);
    } else {
      try {
        const s = JSON.stringify(v);
        out[k] = s.length > MAX_CALLABLE_DETAIL_STRING ? `${s.slice(0, MAX_CALLABLE_DETAIL_STRING)}…` : JSON.parse(s);
      } catch {
        out[k] = '[unserializable]';
      }
    }
  }
  return out;
}

/**
 * Small trimmed snapshot of the caught Firebase error for DEBUG (URL import only).
 */
export function extractRawCallableErrorShapeForDebug(e: unknown): UrlResearchRawCallableErrorShape {
  if (!e || typeof e !== 'object') {
    return {
      name: undefined,
      code: undefined,
      message: typeof e === 'string' ? e.slice(0, 200) : undefined,
      hasDetails: false,
      hasCustomData: false,
    };
  }
  const o = e as Record<string, unknown>;
  const details = o.details;
  const customData = o.customData;
  const cd = asPlainRecord(customData);
  return {
    name: typeof o.name === 'string' ? o.name.slice(0, 120) : undefined,
    code: typeof o.code === 'string' ? o.code.slice(0, 120) : undefined,
    message: typeof o.message === 'string' ? o.message.slice(0, 300) : undefined,
    hasDetails: details !== undefined && details !== null,
    hasCustomData: customData !== undefined && customData !== null,
    customDataKeys: cd ? Object.keys(cd).slice(0, 24) : undefined,
    detailsKeys: asPlainRecord(details)
      ? Object.keys(details as object).slice(0, 24)
      : Array.isArray(details)
        ? [`[array:${details.length}]`]
        : undefined,
  };
}

/** BFS for an object that carries `debugError` (Firebase may nest details under customData / error / etc.). */
function findFirstBagWithDebugError(root: unknown, maxDepth = 6, maxVisits = 48): Record<string, unknown> | null {
  const queue: { v: unknown; d: number }[] = [{ v: root, d: 0 }];
  const seen = new WeakSet<object>();
  let visits = 0;
  while (queue.length > 0 && visits < maxVisits) {
    const { v, d } = queue.shift()!;
    if (d > maxDepth || v === null || v === undefined) continue;
    if (typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const item of v) queue.push({ v: item, d: d + 1 });
      continue;
    }
    const o = v as Record<string, unknown>;
    if (seen.has(o)) continue;
    seen.add(o);
    visits += 1;
    const de = o.debugError;
    if (de !== undefined && de !== null && typeof de === 'object' && !Array.isArray(de)) {
      return o;
    }
    for (const k of Object.keys(o)) {
      if (k === 'stack' || k.length > 80) continue;
      const child = o[k];
      if (child && typeof child === 'object') queue.push({ v: child, d: d + 1 });
    }
  }
  return null;
}

/**
 * Resolves Firebase callable error `details` from every safe shape the JS SDK may emit.
 * Prefer top-level `details`, then `customData.details`, then nested `_rawServerResponse`,
 * then a bounded BFS for any nested `{ debugError: ... }`.
 */
export function extractCallableErrorDetails(e: unknown): {
  code: string;
  message: string;
  detailsBag: Record<string, unknown> | null;
  callableDetailsTrimmed?: unknown;
} {
  const fallbackMessage = e instanceof Error ? e.message : 'Request failed';
  if (!e || typeof e !== 'object') {
    return { code: 'unknown', message: fallbackMessage, detailsBag: null };
  }
  const o = e as Record<string, unknown>;
  const code = typeof o.code === 'string' ? o.code : 'functions/unknown';
  const message = typeof o.message === 'string' ? o.message : fallbackMessage;

  const candidates: unknown[] = [];
  candidates.push(o.details);

  const customData = o.customData;
  const cd = asPlainRecord(customData);
  if (cd) {
    candidates.push(cd.details);
    candidates.push(cd);
    const raw = cd._rawServerResponse ?? cd.rawServerResponse;
    const rawRec = asPlainRecord(raw);
    if (rawRec) {
      candidates.push(rawRec.details);
      const err = asPlainRecord(rawRec.error);
      if (err) {
        candidates.push(err.details);
        candidates.push(err);
      }
    }
    const nestedErr = asPlainRecord(cd.error);
    if (nestedErr) {
      candidates.push(nestedErr.details);
      candidates.push(nestedErr);
    }
  }

  const dataRec = asPlainRecord(o.data);
  if (dataRec) {
    candidates.push(dataRec.details);
  }

  let detailsBag: Record<string, unknown> | null = null;
  for (const c of candidates) {
    const r = asPlainRecord(c);
    if (r && r.debugError != null) {
      detailsBag = r;
      break;
    }
  }
  if (!detailsBag) {
    for (const c of candidates) {
      const r = asPlainRecord(c);
      if (r && Object.keys(r).length > 0) {
        detailsBag = r;
        break;
      }
    }
  }

  if (!detailsBag || detailsBag.debugError == null) {
    const fromBfs = findFirstBagWithDebugError(e);
    if (fromBfs) detailsBag = fromBfs;
  }

  const callableDetailsTrimmed = trimCallableDetailsForClient(detailsBag ?? cd ?? undefined);
  return { code, message, detailsBag, callableDetailsTrimmed };
}

const URL_RESEARCH_PHASES: UrlResearchFailurePhase[] = [
  'validation',
  'auth',
  'normalize',
  'fetch',
  'research',
  'claude',
  'parse',
  'sanitize',
  'unknown',
];

function extractDebugError(details: unknown): UrlResearchDebugErrorPayload | undefined {
  const d = asPlainRecord(details);
  if (!d) return undefined;
  let de: unknown = d.debugError;
  if (typeof de === 'string' && de.trim().startsWith('{')) {
    try {
      de = JSON.parse(de) as unknown;
    } catch {
      /* keep string */
    }
  }
  if (!de || typeof de !== 'object' || Array.isArray(de)) return undefined;
  const raw = de as Record<string, unknown>;
  const phaseRaw = typeof raw.phase === 'string' ? raw.phase : 'unknown';
  const phase = (URL_RESEARCH_PHASES as string[]).includes(phaseRaw)
    ? (phaseRaw as UrlResearchFailurePhase)
    : ('unknown' as UrlResearchFailurePhase);
  return {
    ...(raw as unknown as UrlResearchDebugErrorPayload),
    phase,
    message: typeof raw.message === 'string' ? raw.message : 'Request failed',
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
  };
}

function buildFallbackDebugError(
  shortCode: string,
  message: string,
  detailsBag: Record<string, unknown> | null,
): UrlResearchDebugErrorPayload {
  const hint =
    detailsBag && Object.keys(detailsBag).length > 0
      ? `Callable details keys: ${Object.keys(detailsBag).slice(0, 12).join(', ')}`
      : 'No structured details on client error object';
  return {
    phase: 'unknown',
    message: message.slice(0, 500) || 'Request failed',
    code: shortCode,
    safeDetails: hint.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
}

function mergeCallableDetailsForDebug(
  trimmed: unknown,
  debugError: UrlResearchDebugErrorPayload,
): Record<string, unknown> {
  const base = asPlainRecord(trimmed);
  if (base) return { ...base, debugError };
  if (typeof trimmed === 'string' && trimmed.trim()) {
    return { summary: trimmed.slice(0, MAX_CALLABLE_DETAIL_STRING), debugError };
  }
  return { debugError };
}

/**
 * Wraps callable failures with `callableCode`, `debugError`, and `callableDetails` for admin DEBUG surfaces.
 */
export async function callAnalyzeTenantSiteUrl(body: AnalyzeTenantSiteUrlRequest): Promise<AnalyzeTenantSiteUrlResponse> {
  const fn = httpsCallable<AnalyzeTenantSiteUrlRequest, AnalyzeTenantSiteUrlResponse>(functions, 'analyzeTenantSiteUrl');
  try {
    const res = await fn(body);
    return res.data;
  } catch (e) {
    if (e instanceof TenantSiteUrlResearchCallableError) {
      throw e;
    }
    const rawCallableErrorShape = extractRawCallableErrorShapeForDebug(e);
    const { code, message, detailsBag, callableDetailsTrimmed } = extractCallableErrorDetails(e);
    const shortCode = code.replace(/^functions\//, '');
    const parsedDebug = extractDebugError(detailsBag);
    const debugError = parsedDebug ?? buildFallbackDebugError(shortCode, message, detailsBag);
    throw new TenantSiteUrlResearchCallableError({
      message,
      callableCode: shortCode,
      callableMessage: message,
      callableDetails: callableDetailsTrimmed,
      debugError,
      rawCallableErrorShape,
    });
  }
}
