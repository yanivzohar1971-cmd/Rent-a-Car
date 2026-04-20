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

export type AnalyzeTenantSiteUrlResponse = {
  ok: true;
  payload: unknown;
  diagnostics: AnalyzeTenantSiteUrlDiagnostics;
  pageFindings?: AnalyzeTenantSiteUrlPageFinding[];
  warnings?: string[];
};

export type AnalyzeTenantSiteUrlRequest = {
  url: string;
  includeSubpages?: boolean;
  maxPages?: number;
  preferHebrew?: boolean;
  industryHint?: string;
  mode?: 'homepage' | 'site';
};

export async function callAnalyzeTenantSiteUrl(body: AnalyzeTenantSiteUrlRequest): Promise<AnalyzeTenantSiteUrlResponse> {
  const fn = httpsCallable<AnalyzeTenantSiteUrlRequest, AnalyzeTenantSiteUrlResponse>(functions, 'analyzeTenantSiteUrl');
  const res = await fn(body);
  return res.data;
}
