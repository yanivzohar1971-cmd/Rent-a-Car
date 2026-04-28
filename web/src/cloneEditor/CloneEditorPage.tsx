import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import CloneRenderer from "./CloneRenderer";
import { useCloneTemplate } from "./useCloneTemplate";
import { functions, httpsCallable } from "../firebase/firebaseClient";
import { useAuth } from "../context/AuthContext";
import { DebugActionButton } from "../components/debug/DebugActionButton";
import { CopyJsonButton } from "../components/debug/CopyJsonButton";
import { TenantSiteYardPickerFields, useTenantSiteYardPicker } from "../components/admin/TenantSiteSelector";
import ConfirmDialog from "../components/common/ConfirmDialog";
import "../pages/AdminTenantSiteBuilderPage.css";

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

function sanitizeSourceUrlInput(raw: string): string {
  return raw.trim().replace(/^(source|מקור)\s*:\s*/i, "").trim();
}

function resolveAutofillUrlCandidate(cloneData: ReturnType<typeof useCloneTemplate>["cloneData"]): {
  value: string;
  from: string;
} | null {
  if (!cloneData) return null;
  const normalized = sanitizeSourceUrlInput(cloneData.normalizedUrl ?? "");
  if (normalized) return { value: normalized, from: "normalizedUrl" };

  const source = sanitizeSourceUrlInput(cloneData.sourceUrl ?? "");
  if (source) return { value: source, from: "sourceUrl" };

  const firstPage = Array.isArray(cloneData.pages) ? cloneData.pages[0] : null;
  if (firstPage && typeof firstPage === "object" && firstPage !== null) {
    const rec = firstPage as Record<string, unknown>;
    const pageUrl =
      (typeof rec.url === "string" ? rec.url : "") ||
      (typeof rec.sourceUrl === "string" ? rec.sourceUrl : "");
    const clean = sanitizeSourceUrlInput(pageUrl);
    if (clean) return { value: clean, from: "pages[0].url/sourceUrl" };
  }

  return null;
}

export default function CloneEditorPage() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const [urlInput, setUrlInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchImagesRunning, setFetchImagesRunning] = useState(false);
  const [fetchImagesError, setFetchImagesError] = useState<string | null>(null);
  const [fetchImagesSummary, setFetchImagesSummary] = useState<string | null>(null);
  const [fetchImagesErrorDetails, setFetchImagesErrorDetails] = useState<string | null>(null);
  const [cloneWebsiteErrorDetails, setCloneWebsiteErrorDetails] = useState<string | null>(null);
  const [lastCreateAttemptAt, setLastCreateAttemptAt] = useState<string | null>(null);
  const [lastCreateFailedAt, setLastCreateFailedAt] = useState<string | null>(null);
  const [urlInputAutofilledFrom, setUrlInputAutofilledFrom] = useState<string | null>(null);
  const [cloneExistsBeforeCreate, setCloneExistsBeforeCreate] = useState(false);
  const [showConfirmRecreate, setShowConfirmRecreate] = useState(false);
  const [pendingCreateAction, setPendingCreateAction] = useState<(() => Promise<void>) | null>(null);
  const didAutofillForTenantRef = useRef<string | null>(null);
  const [pageDebugExpanded, setPageDebugExpanded] = useState(false);
  const [hasInjectedCloneStyleTag, setHasInjectedCloneStyleTag] = useState(false);
  const [inlineEditSaveStatus, setInlineEditSaveStatus] = useState<"idle" | "saving" | "saved" | "disabled">("disabled");
  const {
    cloneData,
    loading,
    error,
    createSite,
    load,
    lastLoadedAt,
  } = useCloneTemplate(tenantId);
  const yardPicker = useTenantSiteYardPicker({
    enabled: !authLoading && userProfile?.isAdmin === true,
  });

  useEffect(() => {
    if (!tenantId) return;
    if (yardPicker.selectedYardId !== tenantId) {
      yardPicker.setSelectedYardId(tenantId);
    }
  }, [tenantId, yardPicker]);

  useEffect(() => {
    if (!tenantId) return;
    if (didAutofillForTenantRef.current !== tenantId) {
      didAutofillForTenantRef.current = null;
      setUrlInputAutofilledFrom(null);
    }
  }, [tenantId]);

  const onSelectTenant = useCallback(
    (newTenantId: string) => {
      const next = newTenantId.trim();
      if (!next) return;
      if (next === (tenantId ?? "").trim()) return;
      const currentUrl = urlInput.trim();
      const qs = currentUrl ? `?${new URLSearchParams({ url: currentUrl }).toString()}` : "";
      navigate(`/admin/tenant/${encodeURIComponent(next)}/clone-editor${qs}`);
    },
    [navigate, tenantId, urlInput],
  );

  useEffect(() => {
    const qpUrl = sanitizeSourceUrlInput(searchParams.get("url")?.trim() ?? "");
    if (!qpUrl) return;
    setUrlInput(qpUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId || didAutofillForTenantRef.current === tenantId) return;
    const candidate = resolveAutofillUrlCandidate(cloneData);
    if (!candidate) return;
    setUrlInput(candidate.value);
    setUrlInputAutofilledFrom(candidate.from);
    didAutofillForTenantRef.current = tenantId;
  }, [tenantId, cloneData]);

  const rawSourceUrl = urlInput;
  const sanitizedSourceUrl = sanitizeSourceUrlInput(rawSourceUrl);
  const normalizedUrl = cloneData?.sourceUrl?.trim() ?? "";
  const canSubmit = useMemo(() => Boolean(tenantId && sanitizedSourceUrl), [tenantId, sanitizedSourceUrl]);
  const selectedTenantId = tenantId ?? "";
  const canRunActions = selectedTenantId.trim().length > 0;

  useEffect(() => {
    if (!canRunActions || !cloneData?.html) {
      setInlineEditSaveStatus("disabled");
    }
  }, [canRunActions, cloneData?.html]);

  useEffect(() => {
    if (!showConfirmRecreate) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowConfirmRecreate(false);
        setPendingCreateAction(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showConfirmRecreate]);

  const formatMaybeTimestamp = (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
      const ts = value as { seconds?: unknown; nanoseconds?: unknown };
      if (typeof ts.seconds === "number") {
        const ms = ts.seconds * 1000 + (typeof ts.nanoseconds === "number" ? Math.floor(ts.nanoseconds / 1_000_000) : 0);
        return new Date(ms).toISOString();
      }
    }
    return null;
  };
  const currentErrorMessage = fetchImagesError ?? submitError ?? error ?? null;
  const resolvedSourceUrl = cloneData?.sourceUrl?.trim() || urlInput.trim() || searchParams.get("url")?.trim() || "";
  const firstImageSrcSamples = useMemo(() => {
    const html = cloneData?.documentHtml ?? "";
    if (!html) return [];
    const out: string[] = [];
    const re = /\bimg\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && out.length < 8) {
      out.push(String(m[2] ?? ""));
    }
    return out;
  }, [cloneData?.documentHtml]);
  const malformedUrlSamples = useMemo(
    () =>
      firstImageSrcSamples.filter((src) =>
        /\/https?:\/\//i.test(src) || /https?:\/\/[^"'\s]+\/https?:\/\//i.test(src),
      ),
    [firstImageSrcSamples],
  );
  const pageDebugSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          page: "CloneEditorPage",
          tenantId: tenantId ?? null,
          sourceUrl: resolvedSourceUrl || null,
          rawSourceUrl: rawSourceUrl || null,
          sanitizedSourceUrl: sanitizedSourceUrl || null,
          normalizedUrl: normalizedUrl || null,
          urlInputAutofilledFrom,
          auth: {
            authLoading,
            firebaseUid: firebaseUser?.uid ?? null,
            isAdmin: userProfile?.isAdmin === true,
          },
          cloneDocExists: cloneData?.cloneDocExists === true,
          currentErrorMessage,
          hasClonedHtml: Boolean(cloneData?.html),
          hasDocumentHtml: Boolean(cloneData?.documentHtml && cloneData.documentHtml.trim().length > 0),
          selfContainedDocumentHtmlLength: cloneData?.selfContainedDocumentHtml?.length ?? 0,
          htmlLength: cloneData?.html?.length ?? 0,
          documentHtmlLength: cloneData?.documentHtml?.length ?? 0,
          cssTextLength: cloneData?.cssText?.length ?? 0,
          stylesCount: Array.isArray(cloneData?.styles) ? cloneData.styles.length : 0,
          cssWarnings: Array.isArray(cloneData?.cssWarnings) ? cloneData.cssWarnings : [],
          firstCssWarningSamples: Array.isArray(cloneData?.cssWarnings) ? cloneData.cssWarnings.slice(0, 5) : [],
          hasCssText: Boolean(cloneData?.cssText && cloneData.cssText.trim().length > 0),
          hasInjectedCloneStyleTag,
          iframeMode: true,
          iframeHasStyleTag: hasInjectedCloneStyleTag,
          firstImageSrcSamples,
          malformedUrlSamples,
          importedAssetCount: cloneData?.importedAssetCount ?? 0,
          importedCssCount: cloneData?.importedCssCount ?? 0,
          importedFontCount: cloneData?.importedFontCount ?? 0,
          assetRewriteWarnings: Array.isArray(cloneData?.assetRewriteWarnings) ? cloneData.assetRewriteWarnings : [],
          brokenUrlSamples: Array.isArray(cloneData?.brokenUrlSamples) ? cloneData.brokenUrlSamples : [],
          lastSavedAt: formatMaybeTimestamp(cloneData?.updatedAt),
          lastLoadedAt,
          inlineEditSaveStatus,
          cloneWebsiteErrorDetails: cloneWebsiteErrorDetails ? JSON.parse(cloneWebsiteErrorDetails) : null,
          cloneExistsBeforeCreate,
          lastCreateAttemptAt,
          lastCreateFailedAt,
          fetchImagesErrorDetails: fetchImagesErrorDetails ? JSON.parse(fetchImagesErrorDetails) : null,
        },
        null,
        2,
      ),
    [
      tenantId,
      resolvedSourceUrl,
      rawSourceUrl,
      sanitizedSourceUrl,
      normalizedUrl,
      urlInputAutofilledFrom,
      authLoading,
      firebaseUser?.uid,
      userProfile?.isAdmin,
      currentErrorMessage,
      cloneData?.html,
      cloneData?.documentHtml,
      cloneData?.selfContainedDocumentHtml,
      cloneData?.cssText,
      cloneData?.styles,
      cloneData?.cssWarnings,
      hasInjectedCloneStyleTag,
      firstImageSrcSamples,
      malformedUrlSamples,
      cloneData?.importedAssetCount,
      cloneData?.importedCssCount,
      cloneData?.importedFontCount,
      cloneData?.assetRewriteWarnings,
      cloneData?.brokenUrlSamples,
      cloneData?.cloneDocExists,
      cloneData?.updatedAt,
      lastLoadedAt,
      inlineEditSaveStatus,
      cloneWebsiteErrorDetails,
      cloneExistsBeforeCreate,
      lastCreateAttemptAt,
      lastCreateFailedAt,
      fetchImagesErrorDetails,
    ],
  );

  const onCreateSite = async () => {
    if (!canRunActions || !sanitizedSourceUrl) return;

    const runCreateSite = async () => {
      const nowIso = new Date().toISOString();
      setLastCreateAttemptAt(nowIso);
      setSubmitError(null);
      setCloneWebsiteErrorDetails(null);
      try {
        await createSite(sanitizedSourceUrl);
      } catch (e) {
        const err = (e ?? null) as CallableLikeError | null;
        const msg =
          typeof err?.message === "string" && err.message.trim()
            ? err.message.trim()
            : e instanceof Error
              ? e.message
              : "Failed to clone website";
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
        if (detailsText) setCloneWebsiteErrorDetails(detailsText);
        setLastCreateFailedAt(new Date().toISOString());
        setSubmitError(msg);
      }
    };

    const cloneExists = cloneData?.cloneDocExists === true || Boolean(cloneData?.html);
    setCloneExistsBeforeCreate(cloneExists);
    if (cloneExists) {
      setPendingCreateAction(() => runCreateSite);
      setShowConfirmRecreate(true);
      return;
    }
    await runCreateSite();
  };

  const onFetchImages = async () => {
    if (!canRunActions) return;
    setFetchImagesError(null);
    setFetchImagesSummary(null);
    setFetchImagesErrorDetails(null);
    setFetchImagesRunning(true);
    try {
      const callable = httpsCallable<FetchCloneImagesRequest, FetchCloneImagesResponse>(functions, "fetchCloneImages");
      const res = await callable({ tenantId: selectedTenantId });
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
      <TenantSiteYardPickerFields
        picker={yardPicker}
        onSelectYard={onSelectTenant}
        emptyYardHint="בחר מגרש כדי להפעיל Create/Reload/Fetch ולערוך clone קיים"
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="url"
          placeholder="https://example.com"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          style={{ flex: "1 1 420px", minWidth: 280, padding: "10px 12px" }}
        />
        <button type="button" onClick={onCreateSite} disabled={!canSubmit || loading || showConfirmRecreate}>
          {loading ? "Creating..." : "Create Site"}
        </button>
        <button type="button" onClick={() => void load()} disabled={loading || !canRunActions}>
          Reload
        </button>
        <button
          type="button"
          onClick={() => void onFetchImages()}
          disabled={loading || fetchImagesRunning || !canRunActions || !cloneData?.html}
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

      {cloneData?.sourceUrl && <div style={{ color: "#4b5563" }}>Source: {sanitizeSourceUrlInput(cloneData.sourceUrl)}</div>}

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

      {canRunActions && cloneData?.html ? (
        <CloneRenderer
          html={cloneData.html}
          documentHtml={cloneData.documentHtml}
          selfContainedDocumentHtml={cloneData.selfContainedDocumentHtml}
          cssText={cloneData.cssText}
          styles={cloneData.styles}
          onInjectedCloneStyleTagChange={setHasInjectedCloneStyleTag}
          onInlineEditSaveStatusChange={setInlineEditSaveStatus}
        />
      ) : (
        <div style={{ padding: 12, color: "#6b7280", border: "1px dashed #d1d5db", borderRadius: 8 }}>
          {!canRunActions
            ? "בחר מגרש כדי להתחיל Clone ולערוך אתר."
            : "No cloned HTML yet. Enter a URL and click Create Site."}
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirmRecreate}
        title="Replace existing clone?"
        message="A cloned site already exists for this tenant. Creating again will overwrite it."
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onCancel={() => {
          setShowConfirmRecreate(false);
          setPendingCreateAction(null);
        }}
        onConfirm={() => {
          const action = pendingCreateAction;
          setShowConfirmRecreate(false);
          setPendingCreateAction(null);
          if (action) void action();
        }}
        isProcessing={loading}
      />
    </div>
  );
}
