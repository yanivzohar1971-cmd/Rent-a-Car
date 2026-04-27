import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import CloneRenderer from "./CloneRenderer";
import { useCloneTemplate } from "./useCloneTemplate";
import { functions, httpsCallable } from "../firebase/firebaseClient";

type FetchCloneImagesRequest = { tenantId: string };
type FetchCloneImagesResponse = {
  ok: true;
  tenantId: string;
  pagesUpdated: number;
  assetsProcessed: number;
  assetsOk: number;
  assetsFailed: number;
};

export default function CloneEditorPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [urlInput, setUrlInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchImagesRunning, setFetchImagesRunning] = useState(false);
  const [fetchImagesError, setFetchImagesError] = useState<string | null>(null);
  const [fetchImagesSummary, setFetchImagesSummary] = useState<string | null>(null);
  const { cloneData, loading, error, createSite, load } = useCloneTemplate(tenantId);

  const canSubmit = useMemo(() => Boolean(tenantId && urlInput.trim()), [tenantId, urlInput]);

  const onCreateSite = async () => {
    if (!tenantId || !urlInput.trim()) return;
    setSubmitError(null);
    try {
      await createSite(urlInput.trim());
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to clone website");
    }
  };

  const onFetchImages = async () => {
    if (!tenantId) return;
    setFetchImagesError(null);
    setFetchImagesSummary(null);
    setFetchImagesRunning(true);
    try {
      const callable = httpsCallable<FetchCloneImagesRequest, FetchCloneImagesResponse>(functions, "fetchCloneImages");
      const res = await callable({ tenantId });
      await load();
      const processed = res.data.assetsProcessed ?? 0;
      const okCount = res.data.assetsOk ?? 0;
      const failedCount = res.data.assetsFailed ?? 0;
      const skippedCount = Math.max(0, processed - okCount - failedCount);
      setFetchImagesSummary(`Images import complete: ok ${okCount} / failed ${failedCount} / skipped ${skippedCount}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch images";
      setFetchImagesError(msg);
    } finally {
      setFetchImagesRunning(false);
    }
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Clone Editor</h1>
      <div style={{ color: "#4b5563" }}>Tenant: {tenantId ?? "-"}</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="url"
          placeholder="https://example.com"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          style={{ flex: "1 1 420px", minWidth: 280, padding: "10px 12px" }}
        />
        <button type="button" onClick={onCreateSite} disabled={!canSubmit || loading}>
          {loading ? "Creating..." : "Create Site"}
        </button>
        <button type="button" onClick={() => void load()} disabled={loading || !tenantId}>
          Reload
        </button>
        <button
          type="button"
          onClick={() => void onFetchImages()}
          disabled={loading || fetchImagesRunning || !tenantId || !cloneData?.html}
        >
          {fetchImagesRunning ? "Fetching Images..." : "Fetch Images"}
        </button>
      </div>

      {(error || submitError || fetchImagesError) && (
        <div style={{ color: "#b91c1c", background: "#fef2f2", padding: "8px 10px", borderRadius: 6 }}>
          {fetchImagesError ?? submitError ?? error}
        </div>
      )}

      {fetchImagesSummary && (
        <div style={{ color: "#166534", background: "#f0fdf4", padding: "8px 10px", borderRadius: 6 }}>
          {fetchImagesSummary}
        </div>
      )}

      {cloneData?.sourceUrl && <div style={{ color: "#4b5563" }}>Source: {cloneData.sourceUrl}</div>}

      {cloneData?.html ? (
        <CloneRenderer html={cloneData.html} />
      ) : (
        <div style={{ padding: 12, color: "#6b7280", border: "1px dashed #d1d5db", borderRadius: 8 }}>
          No cloned HTML yet. Enter a URL and click Create Site.
        </div>
      )}
    </div>
  );
}
