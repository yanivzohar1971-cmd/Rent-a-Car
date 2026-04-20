import { callAnalyzeTenantSiteUrl, type AnalyzeTenantSiteUrlResponse } from '../api/tenantSiteUrlResearchApi';
import type { ScreenshotDerivedSiteConfigImportInput } from './tenantSiteConfigImport';

export type TenantSiteUrlResearchAnalysisResult = {
  payload: ScreenshotDerivedSiteConfigImportInput;
  diagnostics: AnalyzeTenantSiteUrlResponse['diagnostics'];
  pageFindings?: AnalyzeTenantSiteUrlResponse['pageFindings'];
  warnings?: string[];
};

export async function runTenantSiteUrlResearchPreferringCloud(
  params: import('../api/tenantSiteUrlResearchApi').AnalyzeTenantSiteUrlRequest,
): Promise<TenantSiteUrlResearchAnalysisResult> {
  const res = await callAnalyzeTenantSiteUrl(params);
  if (!res?.ok || res.payload === undefined || res.payload === null) {
    throw new Error('Invalid URL analyzer response');
  }
  return {
    payload: res.payload as ScreenshotDerivedSiteConfigImportInput,
    diagnostics: res.diagnostics,
    pageFindings: res.pageFindings,
    warnings: res.warnings,
  };
}
