import type { AnalyzeTenantSiteUrlRequest, UrlResearchDebugErrorPayload } from '../../../api/tenantSiteUrlResearchApi';
import type { TenantSiteUrlResearchAnalysisResult } from '../../../tenant/urlSiteResearchImport';

/** Compact coercion summary for builder DEBUG (screenshot + URL). */
export type AiImportCoercionSummary = {
  patchTopLevelKeys: string[];
  issueCounts: Record<string, number>;
  forbiddenPresent: boolean;
  emptyPatch: boolean;
  issuesSample: { severity: string; path: string }[];
};

export type UrlImportErrorDebugBlock = {
  exists: boolean;
  code?: string;
  message?: string;
  debugError?: UrlResearchDebugErrorPayload;
  phase?: string;
  parseSnippet?: string;
  timestamp?: string;
  callableDetails?: unknown;
};

export type UrlImportPanelDebugBlock = {
  request: AnalyzeTenantSiteUrlRequest | null;
  formFields: {
    urlInput: string;
    includeSubpages: boolean;
    maxPages: number;
    preferHebrew: boolean;
    industryHint: string;
    mode: 'homepage' | 'site';
  };
  busy: boolean;
  result: {
    hasRawPayload: boolean;
    diagnostics: { model: string | null; analyzedUrl: string | null; pagesInspected: number | null };
    pageFindings: TenantSiteUrlResearchAnalysisResult['pageFindings'];
    warnings: string[];
    backendDebug: TenantSiteUrlResearchAnalysisResult['debug'];
    lastSuccessBundlePresent: boolean;
  };
  coercion: AiImportCoercionSummary | null;
  error: UrlImportErrorDebugBlock;
};

export type ScreenshotImportPanelDebugBlock = {
  busy: boolean;
  hasAnalysis: boolean;
  lastAnalysisError: string | null;
  diagnosticsSummary: Record<string, unknown> | null;
  coercion: AiImportCoercionSummary | null;
};

export type AiSiteImportPanelDebugSnapshot = {
  version: 1;
  importSource: 'screenshot' | 'url';
  panelError: string | null;
  applyBusy: boolean;
  screenshot: ScreenshotImportPanelDebugBlock;
  url: UrlImportPanelDebugBlock;
};
