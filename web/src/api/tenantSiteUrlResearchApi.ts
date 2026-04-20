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

export type UrlResearchDebugErrorPayload = {
  phase: string;
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
    const details = o.details !== undefined ? o.details : (o as { customData?: unknown }).customData;
    return { code, message, details };
  }
  return { code: 'unknown', message: e instanceof Error ? e.message : 'Unknown error', details: undefined };
}

function extractDebugError(details: unknown): UrlResearchDebugErrorPayload | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const d = details as Record<string, unknown>;
  const de = d.debugError;
  if (!de || typeof de !== 'object') return undefined;
  return de as UrlResearchDebugErrorPayload;
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
    const { code, message, details } = parseCallableFailure(e);
    const debugError = extractDebugError(details);
    const shortCode = code.replace(/^functions\//, '');
    const err = new Error(message);
    Object.assign(err, {
      callableCode: shortCode,
      callableMessage: message,
      callableDetails: details,
      debugError,
    });
    throw err;
  }
}
