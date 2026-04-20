import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';

export type AnalyzeTenantSiteUrlPageFinding = {
  url: string;
  title?: string;
  fetchedOk: boolean;
  status?: number;
};

export type AnalyzeTenantSiteUrlDiagnostics = {
  model: string;
  analyzedUrl: string;
  pagesInspected: number;
  notes?: string[];
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

/** Callable failure with Firebase `details` preserved for DEBUG surfaces. */
export class TenantSiteUrlResearchCallableError extends Error {
  readonly callableCode: string;

  readonly callableMessage: string;

  readonly callableDetails?: unknown;

  readonly debugError?: UrlResearchDebugErrorPayload;

  constructor(args: {
    message: string;
    callableCode: string;
    callableMessage?: string;
    callableDetails?: unknown;
    debugError?: UrlResearchDebugErrorPayload;
  }) {
    super(args.message);
    this.name = 'TenantSiteUrlResearchCallableError';
    this.callableCode = args.callableCode;
    this.callableMessage = args.callableMessage ?? args.message;
    this.callableDetails = args.callableDetails;
    this.debugError = args.debugError;
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

function parseCallableFailure(e: unknown): { code: string; message: string; details?: unknown } {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const code = typeof o.code === 'string' ? o.code : 'functions/unknown';
    const message = typeof o.message === 'string' ? o.message : 'Request failed';
    let details: unknown = o.details;
    if (details === undefined) {
      details = (o as { customData?: unknown }).customData;
    }
    return { code, message, details };
  }
  return { code: 'unknown', message: e instanceof Error ? e.message : 'Unknown error', details: undefined };
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
  if (!details || typeof details !== 'object') return undefined;
  const d = details as Record<string, unknown>;
  const de = d.debugError;
  if (!de || typeof de !== 'object') return undefined;
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
    const { code, message, details } = parseCallableFailure(e);
    const debugError = extractDebugError(details);
    const shortCode = code.replace(/^functions\//, '');
    throw new TenantSiteUrlResearchCallableError({
      message,
      callableCode: shortCode,
      callableMessage: message,
      callableDetails: details,
      debugError,
    });
  }
}
