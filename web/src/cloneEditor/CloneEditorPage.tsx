import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import CloneRenderer from "./CloneRenderer";
import { useCloneTemplate } from "./useCloneTemplate";
import { functions, httpsCallable } from "../firebase/firebaseClient";
import { useAuth } from "../context/AuthContext";
import { DebugActionButton } from "../components/debug/DebugActionButton";
import { CopyJsonButton } from "../components/debug/CopyJsonButton";

type FetchCloneImagesRequest = { tenantId: string };
type FetchCloneImagesResponse = {
  ok: true;
  tenantId: string;
  pagesUpdated: number;
  assetsProcessed: number;
  assetsOk: number;
  assetsFailed: number;
};

type CallableLikeError = {
  message?: string;
  code?: string;
  details?: unknown;
};

export default function CloneEditorPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const [urlInput, setUrlInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchImagesRunning, setFetchImagesRunning] = useState(false);
  const [fetchImagesError, setFetchImagesError] = useState<string | null>(null);
  const [fetchImagesSummary, setFetchImagesSummary] = useState<string | null>(null);
  const [fetchImagesErrorDetails, setFetchImagesErrorDetails] = useState<string | null>(null);
  const [pageDebugExpanded, setPageDebugExpanded] = useState(false);
  const { cloneData, loading, error, createSite, load } = useCloneTemplate(tenantId);

  useEffect(() => {
    const qpUrl = searchParams.get("url")?.trim() ?? "";
    if (!qpUrl) return;
    setUrlInput(qpUrl);
  }, [searchParams]);

  const canSubmit = useMemo(() => Boolean(tenantId && urlInput.trim()), [tenantId, urlInput]);
  const currentErrorMessage = fetchImagesError ?? submitError ?? error ?? null;
  const resolvedSourceUrl = cloneData?.sourceUrl?.trim() || urlInput.trim() || searchParams.get("url")?.trim() || "";
  const pageDebugSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          page: "CloneEditorPage",
          tenantId: tenantId ?? null,
          sourceUrl: resolvedSourceUrl || null,
          auth: {
            authLoading,
            firebaseUid: firebaseUser?.uid ?? null,
            isAdmin: userProfile?.isAdmin === true,
          },
          currentErrorMessage,
          hasClonedHtml: Boolean(cloneData?.html),
          fetchImagesErrorDetails: fetchImagesErrorDetails ? JSON.parse(fetchImagesErrorDetails) : null,
        },
        null,
        2,
      ),
    [
      tenantId,
      resolvedSourceUrl,
      authLoading,
      firebaseUser?.uid,
      userProfile?.isAdmin,
      currentErrorMessage,
      cloneData?.html,
      fetchImagesErrorDetails,
    ],
  );

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
    setFetchImagesErrorDetails(null);
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
      const err = (e ?? null) as CallableLikeError | null;
      const msg = typeof err?.message === "string" && err.message.trim() ? err.message.trim() : "Failed to fetch images";
      const details = err?.details;
      const detailsText =
        details === undefined
          ? null
          : (() => {
              try {
                return typeof details === "string" ? details : JSON.stringify(details, null, 2);
              } catch {
                return String(details);
              }
            })();
      if (detailsText) {
        setFetchImagesError(`${msg} (details available)`);
        setFetchImagesErrorDetails(detailsText);
      } else {
        setFetchImagesError(msg);
      }
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
        <DebugActionButton
          title="DEBUG: Clone Editor page snapshot"
          onClick={() => setPageDebugExpanded((v) => !v)}
        />
        <CopyJsonButton
          className="secondary-btn"
          style={{ fontSize: "0.8125rem" }}
          label="DEBUG COPY JSON"
          getValue={() => pageDebugSnapshot}
          onError={() => setSubmitError("Copy debug JSON failed.")}
        />
      </div>

      {(error || submitError || fetchImagesError) && (
        <div style={{ color: "#b91c1c", background: "#fef2f2", padding: "8px 10px", borderRadius: 6 }}>
          <div>{fetchImagesError ?? submitError ?? error}</div>
          {fetchImagesErrorDetails ? (
            <pre
              style={{
                margin: "8px 0 0",
                maxHeight: 220,
                overflow: "auto",
                background: "#fff",
                border: "1px solid #fecaca",
                padding: 8,
                borderRadius: 6,
                color: "#7f1d1d",
                fontSize: 12,
                direction: "ltr",
                textAlign: "left",
              }}
            >
              {fetchImagesErrorDetails}
            </pre>
          ) : null}
        </div>
      )}

      {fetchImagesSummary && (
        <div style={{ color: "#166534", background: "#f0fdf4", padding: "8px 10px", borderRadius: 6 }}>
          {fetchImagesSummary}
        </div>
      )}

      {cloneData?.sourceUrl && <div style={{ color: "#4b5563" }}>Source: {cloneData.sourceUrl}</div>}

      {pageDebugExpanded ? (
        <div style={{ marginTop: "0.5rem" }} aria-label="Clone Editor debug JSON">
          <pre
            style={{
              maxHeight: "min(50vh, 420px)",
              overflow: "auto",
              fontSize: "0.72rem",
              padding: "0.65rem",
              background: "#0f172a",
              color: "#e2e8f0",
              borderRadius: "8px",
              direction: "ltr",
              textAlign: "left",
              margin: 0,
            }}
          >
            {pageDebugSnapshot}
          </pre>
        </div>
      ) : null}

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
