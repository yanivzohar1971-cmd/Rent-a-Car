import { useCallback, useEffect, useState } from "react";
import { db, doc, functions, getDoc, httpsCallable } from "../firebase/firebaseClient";

type CloneWebsiteRequest = {
  tenantId: string;
  url: string;
};

type CloneWebsiteResponse = {
  ok: true;
  tenantId: string;
  sourceUrl: string;
  html: string;
  documentHtml?: string;
  selfContainedDocumentHtml?: string;
  cssText?: string;
  styles?: string[];
  cssWarnings?: string[];
  importedAssetCount?: number;
  importedCssCount?: number;
  importedFontCount?: number;
  assetRewriteWarnings?: string[];
  brokenUrlSamples?: string[];
  updatedAt: string;
};

export type CloneTemplateData = {
  tenantId: string;
  sourceUrl: string;
  normalizedUrl?: string;
  html: string;
  documentHtml?: string;
  selfContainedDocumentHtml?: string;
  cssText?: string;
  styles?: string[];
  cssWarnings?: string[];
  pages?: Array<Record<string, unknown>>;
  importedAssetCount?: number;
  importedCssCount?: number;
  importedFontCount?: number;
  assetRewriteWarnings?: string[];
  brokenUrlSamples?: string[];
  updatedAt?: unknown;
  cloneDocExists: boolean;
};

export function useCloneTemplate(tenantId: string | undefined) {
  const [cloneData, setCloneData] = useState<CloneTemplateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const ref = doc(db, "tenantSiteClones", tenantId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setCloneData({
          tenantId,
          sourceUrl: "",
        normalizedUrl: "",
          html: "",
          documentHtml: "",
          selfContainedDocumentHtml: "",
          cssText: "",
          styles: [],
          cssWarnings: [],
        pages: [],
          cloneDocExists: false,
        });
        setLastLoadedAt(new Date().toISOString());
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      setCloneData({
        tenantId,
        sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
        normalizedUrl: typeof data.normalizedUrl === "string" ? data.normalizedUrl : "",
        html: typeof data.html === "string" ? data.html : "",
        documentHtml: typeof data.documentHtml === "string" ? data.documentHtml : "",
        selfContainedDocumentHtml: typeof data.selfContainedDocumentHtml === "string" ? data.selfContainedDocumentHtml : "",
        cssText: typeof data.cssText === "string" ? data.cssText : "",
        styles: Array.isArray(data.styles) ? data.styles.filter((v): v is string => typeof v === "string") : [],
        cssWarnings: Array.isArray(data.cssWarnings) ? data.cssWarnings.filter((v): v is string => typeof v === "string") : [],
        pages: Array.isArray(data.pages) ? (data.pages as Array<Record<string, unknown>>) : [],
        importedAssetCount: typeof data.importedAssetCount === "number" ? data.importedAssetCount : 0,
        importedCssCount: typeof data.importedCssCount === "number" ? data.importedCssCount : 0,
        importedFontCount: typeof data.importedFontCount === "number" ? data.importedFontCount : 0,
        assetRewriteWarnings: Array.isArray(data.assetRewriteWarnings)
          ? data.assetRewriteWarnings.filter((v): v is string => typeof v === "string")
          : [],
        brokenUrlSamples: Array.isArray(data.brokenUrlSamples)
          ? data.brokenUrlSamples.filter((v): v is string => typeof v === "string")
          : [],
        updatedAt: data.updatedAt,
        cloneDocExists: true,
      });
      setLastLoadedAt(new Date().toISOString());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load clone";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const createSite = useCallback(
    async (url: string) => {
      if (!tenantId) throw new Error("tenantId is required");
      setLoading(true);
      setError(null);
      try {
        const callable = httpsCallable<CloneWebsiteRequest, CloneWebsiteResponse>(functions, "cloneWebsite");
        const res = await callable({ tenantId, url });
        setCloneData({
          tenantId: res.data.tenantId,
          sourceUrl: res.data.sourceUrl,
          normalizedUrl: "",
          html: res.data.html,
          documentHtml: typeof res.data.documentHtml === "string" ? res.data.documentHtml : "",
          selfContainedDocumentHtml:
            typeof res.data.selfContainedDocumentHtml === "string" ? res.data.selfContainedDocumentHtml : "",
          cssText: typeof res.data.cssText === "string" ? res.data.cssText : "",
          styles: Array.isArray(res.data.styles) ? res.data.styles.filter((v): v is string => typeof v === "string") : [],
          cssWarnings: Array.isArray(res.data.cssWarnings)
            ? res.data.cssWarnings.filter((v): v is string => typeof v === "string")
            : [],
          pages: [],
          importedAssetCount: typeof res.data.importedAssetCount === "number" ? res.data.importedAssetCount : 0,
          importedCssCount: typeof res.data.importedCssCount === "number" ? res.data.importedCssCount : 0,
          importedFontCount: typeof res.data.importedFontCount === "number" ? res.data.importedFontCount : 0,
          assetRewriteWarnings: Array.isArray(res.data.assetRewriteWarnings)
            ? res.data.assetRewriteWarnings.filter((v): v is string => typeof v === "string")
            : [],
          brokenUrlSamples: Array.isArray(res.data.brokenUrlSamples)
            ? res.data.brokenUrlSamples.filter((v): v is string => typeof v === "string")
            : [],
          cloneDocExists: true,
        });
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to clone website";
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [tenantId, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    cloneData,
    loading,
    error,
    load,
    createSite,
    lastLoadedAt,
  };
}
