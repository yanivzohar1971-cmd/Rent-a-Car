import {
  callAnalyzeTenantSiteUrl,
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
    const err = new Error('Invalid URL analyzer response');
    Object.assign(err, {
      callableCode: 'invalid-response',
      debugError: {
        phase: 'unknown',
        message: 'Callable returned ok:false or missing payload',
        timestamp: new Date().toISOString(),
      },
    });
    throw err;
  }
  if (isEmptyPayload(res.payload)) {
    const err = new Error('URL analysis returned an empty import payload.');
    Object.assign(err, {
      callableCode: 'empty-payload',
      debugError: {
        phase: 'sanitize',
        message: 'Sanitized payload is empty',
        timestamp: new Date().toISOString(),
        safeDetails: 'Server returned success but payload object has no keys.',
      },
    });
    throw err;
  }
  return {
    payload: res.payload as ScreenshotDerivedSiteConfigImportInput,
    diagnostics: res.diagnostics,
    pageFindings: res.pageFindings,
    warnings: res.warnings,
    debug: res.debug,
  };
}
