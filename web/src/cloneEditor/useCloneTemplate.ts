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
  updatedAt: string;
};

export type CloneTemplateData = {
  tenantId: string;
  sourceUrl: string;
  html: string;
  updatedAt?: unknown;
};

export function useCloneTemplate(tenantId: string | undefined) {
  const [cloneData, setCloneData] = useState<CloneTemplateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const ref = doc(db, "tenantSiteClones", tenantId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setCloneData(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      setCloneData({
        tenantId,
        sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
        html: typeof data.html === "string" ? data.html : "",
        updatedAt: data.updatedAt,
      });
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
          html: res.data.html,
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
  };
}
