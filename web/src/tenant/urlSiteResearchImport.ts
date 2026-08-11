import {
  callAnalyzeTenantSiteUrl,
  TenantSiteUrlResearchCallableError,
  type AnalyzeTenantSiteUrlDebugInfo,
  type AnalyzeTenantSiteUrlRequest,
  type AnalyzeTenantSiteUrlResponse,
} from '../api/tenantSiteUrlResearchApi';
import type { ScreenshotDerivedSiteConfigImportInput } from './tenantSiteConfigImport';

export type TenantSiteUrlResearchAnalysisResult = {
  payload: ScreenshotDerivedSiteConfigImportInput;
  diagnostics: AnalyzeTenantSiteUrlResponse['diagnostics'];
  pageFindings?: AnalyzeTenantSiteUrlResponse['pageFindings'];
  warnings?: string[];
  debug?: AnalyzeTenantSiteUrlDebugInfo;
};

function isEmptyPayload(payload: unknown): boolean {
  if (payload === undefined || payload === null) return true;
  if (typeof payload !== 'object') return true;
  return Object.keys(payload as object).length === 0;
}

export async function runTenantSiteUrlResearchPreferringCloud(
  params: AnalyzeTenantSiteUrlRequest,
): Promise<TenantSiteUrlResearchAnalysisResult> {
  const res = await callAnalyzeTenantSiteUrl(params);
  if (!res?.ok || res.payload === undefined || res.payload === null) {
    throw new TenantSiteUrlResearchCallableError({
      message: 'Invalid URL analyzer response',
      callableCode: 'invalid-response',
      callableDetails: res,
      debugError: {
        phase: 'unknown',
        message: 'Callable returned ok:false or missing payload',
        timestamp: new Date().toISOString(),
      },
    });
  }
  if (isEmptyPayload(res.payload)) {
    throw new TenantSiteUrlResearchCallableError({
      message: 'URL analysis returned an empty import payload.',
      callableCode: 'empty-payload',
      debugError: {
        phase: 'sanitize',
        message: 'Sanitized payload is empty',
        timestamp: new Date().toISOString(),
        safeDetails: 'Server returned success but payload object has no keys.',
      },
      callableDetails: { payloadKeys: 0 },
    });
  }
  return {
    payload: res.payload as ScreenshotDerivedSiteConfigImportInput,
    diagnostics: res.diagnostics,
    pageFindings: res.pageFindings,
    warnings: res.warnings,
    debug: res.debug,
  };
}
