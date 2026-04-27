import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';

export type AnalyzeTenantSiteScreenshotDiagnostics = {
  model: string;
  notes?: string[];
  warnings?: string[];
  imageInputMode?: 'file' | 'paste' | 'drop' | 'url';
  imageUrlAnalyzed?: string;
  imageUrlFetchStatus?: number;
  imageUrlContentType?: string;
  imageUrlBytes?: number;
};

export type AnalyzeTenantSiteScreenshotResponse = {
  ok: true;
  payload: unknown;
  diagnostics?: AnalyzeTenantSiteScreenshotDiagnostics;
};

export async function callAnalyzeTenantSiteScreenshot(
  params: {
    imageBase64?: string;
    mimeType?: string;
    imageUrl?: string;
    imageInputMode?: 'file' | 'paste' | 'drop' | 'url';
  },
): Promise<AnalyzeTenantSiteScreenshotResponse> {
  const fn = httpsCallable<
    { imageBase64?: string; mimeType?: string; imageUrl?: string; imageInputMode?: 'file' | 'paste' | 'drop' | 'url' },
    AnalyzeTenantSiteScreenshotResponse
  >(functions, 'analyzeTenantSiteScreenshot');
  const res = await fn(params);
  return res.data;
}
