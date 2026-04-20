import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';

export type AnalyzeTenantSiteScreenshotDiagnostics = {
  model: string;
  notes?: string[];
  warnings?: string[];
};

export type AnalyzeTenantSiteScreenshotResponse = {
  ok: true;
  payload: unknown;
  diagnostics?: AnalyzeTenantSiteScreenshotDiagnostics;
};

export async function callAnalyzeTenantSiteScreenshot(
  imageBase64: string,
  mimeType: string,
): Promise<AnalyzeTenantSiteScreenshotResponse> {
  const fn = httpsCallable<
    { imageBase64: string; mimeType?: string },
    AnalyzeTenantSiteScreenshotResponse
  >(functions, 'analyzeTenantSiteScreenshot');
  const res = await fn({ imageBase64, mimeType });
  return res.data;
}
