import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCompleteUrlImportPatch,
  type UrlAutoApplyDebugBlock,
  type UrlGenerationCompletionSummary,
} from '../../../tenant/completeGeneratedTenantSiteConfig';
import BuilderThemeColorFieldRow from './BuilderThemeColorFieldRow';
import { parseHomeSectionsList, TENANT_HOME_SECTION_KEYS, TENANT_HOME_SECTION_LABELS_HE, type TenantHomeSectionKey } from '../../../tenant/tenantSiteConfig';
import {
  coerceImportedTenantSiteConfig,
  normalizeTenantSiteConfigImport,
  type ScreenshotDerivedSiteConfigImportInput,
  type TenantSiteConfigImportIssue,
} from '../../../tenant/tenantSiteConfigImport';
import {
  runScreenshotAnalysisFromUrlPreferringCloud,
  runScreenshotAnalysisPreferringCloud,
  type ScreenshotAnalysisResult,
} from '../../../tenant/screenshotImport';
import { runTenantSiteUrlResearchPreferringCloud, type TenantSiteUrlResearchAnalysisResult } from '../../../tenant/urlSiteResearchImport';
import type { TenantSiteConfig } from '../../../api/tenantSiteConfigsApi';
import {
  TenantSiteUrlResearchCallableError,
  buildUrlAnalyzerAiSummary,
  extractRawCallableErrorShapeForDebug,
  extractUrlAnalyzerAiFromCallableDetails,
  type AnalyzeTenantSiteUrlRequest,
  type UrlResearchDebugErrorPayload,
  type UrlResearchRawCallableErrorShape,
} from '../../../api/tenantSiteUrlResearchApi';
import type { AiImportCoercionSummary, AiSiteImportPanelDebugSnapshot, UrlImportPanelDebugBlock } from './aiImportPanelDebug';
import './TenantMediaField.css';

type Props = {
  disabled?: boolean;
  tenantId: string | null;
  baseSyntheticConfig: TenantSiteConfig;
  onPreviewNormalizedReady: (normalized: ReturnType<typeof normalizeTenantSiteConfigImport>['normalized'] | null) => void;
  onApply: (patch: ScreenshotDerivedSiteConfigImportInput) => Promise<void>;
  /** When set, URL import merges into the builder draft (no Firestore) via this handler. */
  onUrlImportMergeToDraft?: (patch: ScreenshotDerivedSiteConfigImportInput) => Promise<UrlAutoApplyDebugBlock>;
  /** Builder draft has unsaved edits — URL auto-apply may prompt to overwrite. */
  urlDraftIsDirty?: boolean;
  /** Same guard as save: loaded Firestore doc tenant id. */
  urlMergeConfigLoadedTenantId?: string | null;
  /** Display name for deterministic completion copy. */
  urlCompletionDisplayName: string;
  /** Pushes compact AI-import diagnostics to the parent for page-level DEBUG. */
  onDebugStateChange?: (snapshot: AiSiteImportPanelDebugSnapshot) => void;
  /** Incremented by parent when yard/tenant context changes and import state must reset. */
  tenantResetToken?: number;
};

type DraftState = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  homeSections: TenantHomeSectionKey[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function hostFromUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  try {
    return new URL(s).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function draftFromPatch(patch: ScreenshotDerivedSiteConfigImportInput): DraftState {
  const branding = asRecord(patch.branding);
  const content = asRecord(patch.content);
  const layout = asRecord(patch.layout);
  return {
    primaryColor: String(branding.primaryColor ?? ''),
    secondaryColor: String(branding.secondaryColor ?? ''),
    accentColor: String(branding.accentColor ?? ''),
    heroTitle: String(content.heroTitle ?? ''),
    heroSubtitle: String(content.heroSubtitle ?? ''),
    aboutText: String(content.aboutText ?? ''),
    homeSections: parseHomeSectionsList(layout.homeSections),
  };
}

function patchFromDraft(draft: DraftState): ScreenshotDerivedSiteConfigImportInput {
  const out: ScreenshotDerivedSiteConfigImportInput = {};
  const branding: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  const layout: Record<string, unknown> = {};

  if (draft.primaryColor.trim()) branding.primaryColor = draft.primaryColor.trim();
  if (draft.secondaryColor.trim()) branding.secondaryColor = draft.secondaryColor.trim();
  if (draft.accentColor.trim()) branding.accentColor = draft.accentColor.trim();
  if (Object.keys(branding).length > 0) out.branding = branding;

  if (draft.heroTitle.trim()) content.heroTitle = draft.heroTitle.trim();
  if (draft.heroSubtitle.trim()) content.heroSubtitle = draft.heroSubtitle.trim();
  if (draft.aboutText.trim()) content.aboutText = draft.aboutText.trim();
  if (Object.keys(content).length > 0) out.content = content;

  const ordered = parseHomeSectionsList(draft.homeSections);
  if (ordered.length > 0) layout.homeSections = ordered;
  if (Object.keys(layout).length > 0) out.layout = layout;

  return out;
}

function hasImportableKeys(patch: ScreenshotDerivedSiteConfigImportInput): boolean {
  return Object.keys(patch).length > 0;
}

function coercionSummaryFromIssues(patch: Record<string, unknown>, issues: TenantSiteConfigImportIssue[]): AiImportCoercionSummary {
  const issueCounts = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});
  return {
    patchTopLevelKeys: Object.keys(patch),
    issueCounts,
    forbiddenPresent: issues.some((i) => i.severity === 'forbidden'),
    emptyPatch: Object.keys(patch).length === 0,
    issuesSample: issues.slice(0, 40).map((i) => ({ severity: i.severity, path: i.path })),
  };
}

type ImportSource = 'screenshot' | 'url';

export default function ScreenshotImportPanel(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const screenshotDropRef = useRef<HTMLDivElement>(null);
  const onPreviewNormalizedReadyRef = useRef(p.onPreviewNormalizedReady);
  /** Guards against out-of-order analyze responses (stale failure must not overwrite a newer success). */
  const urlAnalyzeRequestIdRef = useRef(0);
  const screenshotAnalyzeRequestIdRef = useRef(0);
  const lastUrlPaletteFingerprintRef = useRef<{
    host: string | null;
    primary: string | null;
    secondary: string | null;
    accent: string | null;
  } | null>(null);
  const latestTenantIdRef = useRef<string | null>(p.tenantId);
  useEffect(() => {
    latestTenantIdRef.current = p.tenantId;
  }, [p.tenantId]);
  useEffect(() => {
    onPreviewNormalizedReadyRef.current = p.onPreviewNormalizedReady;
  }, [p.onPreviewNormalizedReady]);
  const [importSource, setImportSource] = useState<ImportSource>('screenshot');
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysisResult | null>(null);
  const [issues, setIssues] = useState<TenantSiteConfigImportIssue[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeColorFieldId, setActiveColorFieldId] = useState<string | null>(null);

  const [urlInput, setUrlInput] = useState('');
  const [urlIncludeSubpages, setUrlIncludeSubpages] = useState(true);
  const [urlMaxPages, setUrlMaxPages] = useState(8);
  const [urlPreferHebrew, setUrlPreferHebrew] = useState(true);
  const [urlIndustryHint, setUrlIndustryHint] = useState('');
  const [urlMode, setUrlMode] = useState<'homepage' | 'site'>('site');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlAnalysisRaw, setUrlAnalysisRaw] = useState<unknown>(null);
  const [urlDiagModel, setUrlDiagModel] = useState<string | null>(null);
  const [urlDiagPages, setUrlDiagPages] = useState<number | null>(null);
  const [urlDiagAnalyzedUrl, setUrlDiagAnalyzedUrl] = useState<string | null>(null);
  const [urlWarnings, setUrlWarnings] = useState<string[]>([]);
  /** Completed + coerced URL import patch (deterministic fallbacks applied). */
  const [urlCompletedImportPatch, setUrlCompletedImportPatch] = useState<ScreenshotDerivedSiteConfigImportInput | null>(null);
  const [urlCompletionSummary, setUrlCompletionSummary] = useState<UrlGenerationCompletionSummary | null>(null);
  const [urlAutoApplyDebug, setUrlAutoApplyDebug] = useState<UrlAutoApplyDebugBlock | null>(null);

  const [lastUrlRequestParams, setLastUrlRequestParams] = useState<AnalyzeTenantSiteUrlRequest | null>(null);
  const [lastUrlSuccessResult, setLastUrlSuccessResult] = useState<TenantSiteUrlResearchAnalysisResult | null>(null);
  const [lastUrlFailureDebug, setLastUrlFailureDebug] = useState<{
    timestamp: string;
    code: string;
    message: string;
    debugError?: UrlResearchDebugErrorPayload;
    callableDetails?: unknown;
    rawCallableErrorShape?: UrlResearchRawCallableErrorShape;
  } | null>(null);
  const [lastScreenshotAnalysisError, setLastScreenshotAnalysisError] = useState<string | null>(null);
  const [screenshotDragOver, setScreenshotDragOver] = useState(false);
  const [urlDragOver, setUrlDragOver] = useState(false);
  const [screenshotImageUrl, setScreenshotImageUrl] = useState('');

  const resetAiImportStateForTenantChange = useCallback(() => {
    urlAnalyzeRequestIdRef.current += 1;
    screenshotAnalyzeRequestIdRef.current += 1;
    setBusy(false);
    setUrlBusy(false);
    setApplyBusy(false);
    setError(null);
    setAnalysis(null);
    setIssues([]);
    setDraft(null);
    setActiveColorFieldId(null);
    setLastScreenshotAnalysisError(null);
    setScreenshotDragOver(false);
    setUrlDragOver(false);
    setUrlInput('');
    setUrlAnalysisRaw(null);
    setUrlDiagModel(null);
    setUrlDiagPages(null);
    setUrlDiagAnalyzedUrl(null);
    setUrlWarnings([]);
    setUrlCompletedImportPatch(null);
    setUrlCompletionSummary(null);
    setUrlAutoApplyDebug(null);
    setLastUrlRequestParams(null);
    setLastUrlSuccessResult(null);
    setLastUrlFailureDebug(null);
    setScreenshotImageUrl('');
    onPreviewNormalizedReadyRef.current(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  useEffect(() => {
    resetAiImportStateForTenantChange();
  }, [p.tenantId, p.tenantResetToken, resetAiImportStateForTenantChange]);

  const computedPatch = useMemo(() => (draft ? patchFromDraft(draft) : null), [draft]);
  const urlCoerced = useMemo(() => {
    if (urlCompletedImportPatch != null) return coerceImportedTenantSiteConfig(urlCompletedImportPatch as unknown);
    if (urlAnalysisRaw !== null) return coerceImportedTenantSiteConfig(urlAnalysisRaw);
    return null;
  }, [urlAnalysisRaw, urlCompletedImportPatch]);
  const hasImportablePatch = useMemo(() => {
    if (importSource === 'url') {
      return Boolean(urlCoerced && Object.keys(urlCoerced.patch).length > 0);
    }
    return computedPatch ? hasImportableKeys(computedPatch) : false;
  }, [importSource, computedPatch, urlCoerced]);

  const screenshotDiagnosticsSummary = useMemo((): Record<string, unknown> | null => {
    if (!analysis) return null;
    const d = analysis.diagnostics;
    return {
      extractionSource: d.extractionSource,
      extractorModel: d.extractorModel ?? null,
      paletteConfidence: d.paletteConfidence,
      sectionConfidence: d.sectionConfidence,
      textConfidence: d.textConfidence,
      warningsCount: d.warnings?.length ?? 0,
    };
  }, [analysis]);

  const screenshotCoercion = useMemo((): AiImportCoercionSummary | null => {
    if (importSource !== 'screenshot' || !draft) return null;
    const safe = coerceImportedTenantSiteConfig(patchFromDraft(draft));
    return coercionSummaryFromIssues(safe.patch as Record<string, unknown>, safe.issues);
  }, [importSource, draft]);

  const urlImportPanelBlock = useMemo((): UrlImportPanelDebugBlock => {
    const err = lastUrlFailureDebug;
    const successAi = lastUrlSuccessResult?.debug?.ai;
    const callableAi = err ? extractUrlAnalyzerAiFromCallableDetails(err.callableDetails) : undefined;
    const aiSourceForSummary = err ? (callableAi ?? successAi) : (successAi ?? callableAi);
    const aiSummary = buildUrlAnalyzerAiSummary(aiSourceForSummary);
    const errorAiSummary = err ? buildUrlAnalyzerAiSummary(callableAi ?? undefined) : null;
    const coercion =
      urlCoerced != null ? coercionSummaryFromIssues(urlCoerced.patch as Record<string, unknown>, urlCoerced.issues) : null;
    return {
      aiSummary,
      request: lastUrlRequestParams,
      formFields: {
        urlInput,
        includeSubpages: urlIncludeSubpages,
        maxPages: urlMaxPages,
        preferHebrew: urlPreferHebrew,
        industryHint: urlIndustryHint,
        mode: urlMode,
      },
      busy: urlBusy,
      result: {
        hasRawPayload: urlAnalysisRaw !== null,
        diagnostics: {
          model: urlDiagModel,
          analyzedUrl: urlDiagAnalyzedUrl,
          pagesInspected: urlDiagPages,
        },
        pageFindings: lastUrlSuccessResult?.pageFindings,
        warnings: urlWarnings,
        backendDebug: lastUrlSuccessResult?.debug,
        lastSuccessBundlePresent: lastUrlSuccessResult != null,
      },
      coercion,
      error: {
        exists: Boolean(err),
        code: err?.code,
        message: err?.message,
        debugError: err?.debugError,
        phase: err?.debugError?.phase,
        parseSnippet: err?.debugError?.parseSnippet,
        timestamp: err?.timestamp,
        callableDetails: err?.callableDetails,
        callableAi,
        aiSummary: errorAiSummary,
        rawCallableErrorShape: err?.rawCallableErrorShape,
      },
    };
  }, [
    lastUrlRequestParams,
    urlInput,
    urlIncludeSubpages,
    urlMaxPages,
    urlPreferHebrew,
    urlIndustryHint,
    urlMode,
    urlBusy,
    urlAnalysisRaw,
    urlDiagModel,
    urlDiagAnalyzedUrl,
    urlDiagPages,
    urlWarnings,
    urlCoerced,
    lastUrlFailureDebug,
    lastUrlSuccessResult,
  ]);

  const panelDebugSnapshot = useMemo(
    (): AiSiteImportPanelDebugSnapshot => ({
      version: 1,
      importSource,
      panelError: error,
      applyBusy,
      screenshot: {
        busy,
        hasAnalysis: analysis !== null,
        lastAnalysisError: lastScreenshotAnalysisError,
        diagnosticsSummary: screenshotDiagnosticsSummary,
        coercion: screenshotCoercion,
      },
      url: urlImportPanelBlock,
      urlGeneration: {
        completionSummary: urlCompletionSummary,
        autoApply: urlAutoApplyDebug,
      },
    }),
    [
      importSource,
      error,
      applyBusy,
      busy,
      analysis,
      lastScreenshotAnalysisError,
      screenshotDiagnosticsSummary,
      screenshotCoercion,
      urlImportPanelBlock,
      urlCompletionSummary,
      urlAutoApplyDebug,
    ],
  );

  useEffect(() => {
    p.onDebugStateChange?.(panelDebugSnapshot);
  }, [panelDebugSnapshot, p.onDebugStateChange]);

  const syncPreviewToActiveSource = useCallback(
    (source: ImportSource) => {
      if (source === 'screenshot') {
        if (!draft) {
          p.onPreviewNormalizedReady(null);
          setIssues([]);
          return;
        }
        const raw = patchFromDraft(draft);
        const safe = coerceImportedTenantSiteConfig(raw);
        setIssues(safe.issues);
        const preview = normalizeTenantSiteConfigImport(safe.patch, p.tenantId, p.baseSyntheticConfig);
        p.onPreviewNormalizedReady(preview.normalized);
        return;
      }
      if (urlCoerced === null) {
        p.onPreviewNormalizedReady(null);
        setIssues([]);
        return;
      }
      setIssues(urlCoerced.issues);
      const preview = normalizeTenantSiteConfigImport(urlCoerced.patch, p.tenantId, p.baseSyntheticConfig);
      p.onPreviewNormalizedReady(preview.normalized);
    },
    [draft, urlCoerced, p.onPreviewNormalizedReady, p.tenantId, p.baseSyntheticConfig],
  );

  const runPreviewFromDraft = useCallback(
    (nextDraft: DraftState) => {
      if (importSource !== 'screenshot') return;
      const raw = patchFromDraft(nextDraft);
      const safe = coerceImportedTenantSiteConfig(raw);
      setIssues(safe.issues);
      const preview = normalizeTenantSiteConfigImport(safe.patch, p.tenantId, p.baseSyntheticConfig);
      p.onPreviewNormalizedReady(preview.normalized);
    },
    [importSource, p.onPreviewNormalizedReady, p.tenantId, p.baseSyntheticConfig],
  );

  const handleAnalyze = async (file: File | null, mode: 'file' | 'paste' | 'drop' = 'file') => {
    if (!file) return;
    const reqId = ++screenshotAnalyzeRequestIdRef.current;
    setBusy(true);
    setError(null);
    setLastScreenshotAnalysisError(null);
    try {
      setUrlAnalysisRaw(null);
      setUrlDiagModel(null);
      setUrlDiagPages(null);
      setUrlDiagAnalyzedUrl(null);
      setUrlWarnings([]);
      const rawExtract = await runScreenshotAnalysisPreferringCloud(file, mode);
      if (reqId !== screenshotAnalyzeRequestIdRef.current) return;
      const safeImport = coerceImportedTenantSiteConfig(rawExtract.payload);
      const normalizedPreview = normalizeTenantSiteConfigImport(safeImport.patch, p.tenantId, p.baseSyntheticConfig);
      setAnalysis(rawExtract);
      setIssues(safeImport.issues);
      const nextDraft = draftFromPatch(safeImport.patch);
      setDraft(nextDraft);
      p.onPreviewNormalizedReady(normalizedPreview.normalized);
      setLastScreenshotAnalysisError(null);
      setError(null);
    } catch (e) {
      if (reqId !== screenshotAnalyzeRequestIdRef.current) return;
      setAnalysis(null);
      setDraft({
        primaryColor: '',
        secondaryColor: '',
        accentColor: '',
        heroTitle: '',
        heroSubtitle: '',
        aboutText: '',
        homeSections: parseHomeSectionsList([]),
      });
      setIssues([]);
      p.onPreviewNormalizedReady(null);
      const msg = e instanceof Error ? e.message : 'Screenshot analysis failed';
      setError(msg);
      setLastScreenshotAnalysisError(msg);
    } finally {
      if (reqId === screenshotAnalyzeRequestIdRef.current) {
        setBusy(false);
      }
    }
  };

  const handleAnalyzeImageUrl = async () => {
    const imageUrl = screenshotImageUrl.trim();
    if (!imageUrl) {
      setError('נא להזין כתובת תמונה.');
      return;
    }
    const reqId = ++screenshotAnalyzeRequestIdRef.current;
    setBusy(true);
    setError(null);
    setLastScreenshotAnalysisError(null);
    try {
      setUrlAnalysisRaw(null);
      setUrlDiagModel(null);
      setUrlDiagPages(null);
      setUrlDiagAnalyzedUrl(null);
      setUrlWarnings([]);
      const rawExtract = await runScreenshotAnalysisFromUrlPreferringCloud(imageUrl);
      if (reqId !== screenshotAnalyzeRequestIdRef.current) return;
      const safeImport = coerceImportedTenantSiteConfig(rawExtract.payload);
      const normalizedPreview = normalizeTenantSiteConfigImport(safeImport.patch, p.tenantId, p.baseSyntheticConfig);
      setAnalysis(rawExtract);
      setIssues(safeImport.issues);
      const nextDraft = draftFromPatch(safeImport.patch);
      setDraft(nextDraft);
      p.onPreviewNormalizedReady(normalizedPreview.normalized);
      setError(null);
      setLastScreenshotAnalysisError(null);
    } catch (e) {
      if (reqId !== screenshotAnalyzeRequestIdRef.current) return;
      setAnalysis(null);
      setDraft(null);
      setIssues([]);
      p.onPreviewNormalizedReady(null);
      const msg = e instanceof Error ? e.message : 'Image URL analysis failed';
      setError(msg);
      setLastScreenshotAnalysisError(msg);
    } finally {
      if (reqId === screenshotAnalyzeRequestIdRef.current) setBusy(false);
    }
  };

  const acceptedImageTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
  const pickFirstAcceptedImageFile = (files: FileList | null): File | null => {
    if (!files || files.length === 0) return null;
    for (const f of Array.from(files)) {
      const t = (f.type || '').toLowerCase();
      if (acceptedImageTypes.has(t)) return f;
    }
    return null;
  };
  const extractFirstUrlFromText = (text: string): string | null => {
    const m = text.match(/\bhttps?:\/\/[^\s<>"']+/i);
    return m?.[0]?.trim() || null;
  };

  const handleAnalyzeUrl = async () => {
    const u = urlInput.trim();
    if (!u) {
      setError('Enter a URL to analyze.');
      return;
    }
    const tenantAtStart = latestTenantIdRef.current;
    const req: AnalyzeTenantSiteUrlRequest = {
      url: u,
      includeSubpages: urlIncludeSubpages,
      maxPages: urlMaxPages,
      preferHebrew: urlPreferHebrew,
      industryHint: urlIndustryHint.trim() || undefined,
      mode: urlMode,
    };
    const reqId = ++urlAnalyzeRequestIdRef.current;
    setLastUrlRequestParams(req);
    setLastUrlFailureDebug(null);
    setUrlBusy(true);
    setError(null);
    setUrlCompletedImportPatch(null);
    setUrlCompletionSummary(null);
    setUrlAutoApplyDebug(null);
    try {
      setAnalysis(null);
      setDraft(null);
      setIssues([]);
      setActiveColorFieldId(null);
      if (inputRef.current) inputRef.current.value = '';

      const extracted = await runTenantSiteUrlResearchPreferringCloud(req);
      if (reqId !== urlAnalyzeRequestIdRef.current) return;

      setLastUrlSuccessResult(extracted);
      setUrlAnalysisRaw(extracted.payload);
      setUrlDiagModel(extracted.diagnostics.model);
      setUrlDiagPages(extracted.diagnostics.pagesInspected);
      setUrlDiagAnalyzedUrl(extracted.diagnostics.analyzedUrl);
      setUrlWarnings([...(extracted.warnings ?? []), ...(extracted.diagnostics.notes ?? [])].filter(Boolean));

      const safeImport = coerceImportedTenantSiteConfig(extracted.payload);
      const tid = (p.tenantId ?? '').trim() || 'preview';
      const { patch: completedPatch, completionSummary } = buildCompleteUrlImportPatch({
        tenantContext: {
          tenantId: tid,
          displayName: p.urlCompletionDisplayName.trim() || tid,
          industryHint: urlIndustryHint.trim() || undefined,
          analyzedSiteUrl: extracted.diagnostics.analyzedUrl,
        },
        baseSyntheticConfig: p.baseSyntheticConfig,
        coercedPatch: safeImport.patch as ScreenshotDerivedSiteConfigImportInput,
      });
      const safeFinal = coerceImportedTenantSiteConfig(completedPatch as unknown);
      const bFinal = asRecord(safeFinal.patch.branding);
      const extractedPrimaryColor =
        typeof bFinal.primaryColor === 'string' && bFinal.primaryColor.trim() ? bFinal.primaryColor.trim() : null;
      const extractedSecondaryColor =
        typeof bFinal.secondaryColor === 'string' && bFinal.secondaryColor.trim() ? bFinal.secondaryColor.trim() : null;
      const extractedAccentColor =
        typeof bFinal.accentColor === 'string' && bFinal.accentColor.trim() ? bFinal.accentColor.trim() : null;
      const currentHost = hostFromUrl(extracted.diagnostics.analyzedUrl);
      const prevFingerprint = lastUrlPaletteFingerprintRef.current;
      const possibleStaleThemeReuse = Boolean(
        currentHost &&
          prevFingerprint?.host &&
          currentHost !== prevFingerprint.host &&
          extractedPrimaryColor &&
          extractedSecondaryColor &&
          extractedAccentColor &&
          prevFingerprint.primary &&
          prevFingerprint.secondary &&
          prevFingerprint.accent &&
          extractedPrimaryColor.toLowerCase() === prevFingerprint.primary.toLowerCase() &&
          extractedSecondaryColor.toLowerCase() === prevFingerprint.secondary.toLowerCase() &&
          extractedAccentColor.toLowerCase() === prevFingerprint.accent.toLowerCase(),
      );
      if (possibleStaleThemeReuse) {
        setUrlWarnings((prev) => [...prev, 'possible_stale_theme_reuse']);
      }
      lastUrlPaletteFingerprintRef.current = {
        host: currentHost,
        primary: extractedPrimaryColor,
        secondary: extractedSecondaryColor,
        accent: extractedAccentColor,
      };
      setIssues(safeFinal.issues);
      if (safeFinal.issues.some((i) => i.severity === 'forbidden')) {
        setUrlCompletedImportPatch(null);
        setUrlCompletionSummary(completionSummary);
        setUrlAutoApplyDebug({
          attempted: true,
          applied: false,
          blockedByDirty: false,
          blockedByTenantMismatch: false,
          blockedByStaleRequest: false,
          blockedByForbidden: true,
          changedTopLevelKeys: [],
          changedLayoutFieldKeys: [],
          extractedPrimaryColor,
          extractedSecondaryColor,
          extractedAccentColor,
          possibleStaleThemeReuse,
          timestamp: new Date().toISOString(),
        });
        setError('URL import blocked: forbidden fields after completion.');
        const normalizedPreview = normalizeTenantSiteConfigImport(safeFinal.patch, p.tenantId, p.baseSyntheticConfig);
        p.onPreviewNormalizedReady(normalizedPreview.normalized);
        setLastUrlFailureDebug(null);
        return;
      }

      setUrlCompletionSummary(completionSummary);
      setUrlCompletedImportPatch(safeFinal.patch as ScreenshotDerivedSiteConfigImportInput);
      const normalizedPreview = normalizeTenantSiteConfigImport(safeFinal.patch, p.tenantId, p.baseSyntheticConfig);
      p.onPreviewNormalizedReady(normalizedPreview.normalized);

      let autoDbg: UrlAutoApplyDebugBlock = {
        attempted: true,
        applied: false,
        blockedByDirty: false,
        blockedByTenantMismatch: false,
        blockedByStaleRequest: false,
        blockedByForbidden: false,
        changedTopLevelKeys: Object.keys(safeFinal.patch),
        changedLayoutFieldKeys: safeFinal.patch.layout ? Object.keys(safeFinal.patch.layout as object) : [],
        extractedPrimaryColor,
        extractedSecondaryColor,
        extractedAccentColor,
        possibleStaleThemeReuse,
        timestamp: new Date().toISOString(),
      };
      if (!p.tenantId?.trim()) {
        autoDbg.blockedByTenantMismatch = true;
      } else if (p.urlMergeConfigLoadedTenantId != null && p.tenantId.trim() !== p.urlMergeConfigLoadedTenantId.trim()) {
        autoDbg.blockedByTenantMismatch = true;
      } else if (latestTenantIdRef.current !== tenantAtStart) {
        autoDbg.blockedByStaleRequest = true;
      } else if (p.urlDraftIsDirty) {
        const ok = window.confirm(
          'יש שינויים שלא נשמרו בטיוטת האתר. להחליף בתוצאת ניתוח ה-URL? (השינויים הנוכחיים יאבדו עד שתשחזרו מהבסיס)',
        );
        if (!ok) autoDbg.blockedByDirty = true;
      }
      if (
        !autoDbg.blockedByDirty &&
        !autoDbg.blockedByTenantMismatch &&
        !autoDbg.blockedByStaleRequest &&
        p.onUrlImportMergeToDraft
      ) {
        try {
          autoDbg = await p.onUrlImportMergeToDraft(safeFinal.patch as ScreenshotDerivedSiteConfigImportInput);
        } catch (mergeErr) {
          autoDbg.applied = false;
          setError(mergeErr instanceof Error ? mergeErr.message : 'החלת טיוטה מ-URL נכשלה');
        }
      }
      setUrlAutoApplyDebug(autoDbg);
      if (autoDbg.applied) {
        setUrlCompletedImportPatch(null);
        p.onPreviewNormalizedReady(null);
      }
      setError(null);
      setLastUrlFailureDebug(null);
    } catch (e) {
      if (reqId !== urlAnalyzeRequestIdRef.current) return;
      setLastUrlSuccessResult(null);
      setUrlAnalysisRaw(null);
      setUrlDiagModel(null);
      setUrlDiagPages(null);
      setUrlDiagAnalyzedUrl(null);
      setUrlWarnings([]);
      setIssues([]);
      setUrlCompletedImportPatch(null);
      setUrlCompletionSummary(null);
      setUrlAutoApplyDebug(null);
      p.onPreviewNormalizedReady(null);
      const message = e instanceof Error ? e.message : 'URL analysis failed';
      setError(message);
      if (e instanceof TenantSiteUrlResearchCallableError) {
        setLastUrlFailureDebug({
          timestamp: e.timestamp,
          code: e.callableCode,
          message: e.message,
          debugError: e.debugError,
          callableDetails: e.callableDetails,
          rawCallableErrorShape: e.rawCallableErrorShape,
        });
      } else {
        const o = e as {
          callableCode?: string;
          debugError?: UrlResearchDebugErrorPayload;
          callableDetails?: unknown;
        };
        setLastUrlFailureDebug({
          timestamp: new Date().toISOString(),
          code: typeof o.callableCode === 'string' ? o.callableCode : 'unknown',
          message,
          debugError: o.debugError,
          callableDetails: o.callableDetails,
          rawCallableErrorShape: extractRawCallableErrorShapeForDebug(e),
        });
      }
    } finally {
      if (reqId === urlAnalyzeRequestIdRef.current) {
        setUrlBusy(false);
      }
    }
  };

  const handleClear = () => {
    setAnalysis(null);
    setDraft(null);
    setIssues([]);
    setError(null);
    setActiveColorFieldId(null);
    setUrlCompletedImportPatch(null);
    setUrlCompletionSummary(null);
    setUrlAutoApplyDebug(null);
    setUrlAnalysisRaw(null);
    setUrlDiagModel(null);
    setUrlDiagPages(null);
    setUrlDiagAnalyzedUrl(null);
    setUrlWarnings([]);
    p.onPreviewNormalizedReady(null);
    if (inputRef.current) inputRef.current.value = '';
    setLastScreenshotAnalysisError(null);
    /* Keep lastUrlRequestParams, lastUrlFailureDebug, lastUrlSuccessResult for DEBUG triage. */
  };

  const toggleSection = (key: TenantHomeSectionKey, checked: boolean) => {
    if (!draft) return;
    const next = checked ? [...draft.homeSections, key] : draft.homeSections.filter((k) => k !== key);
    const updated: DraftState = { ...draft, homeSections: parseHomeSectionsList(next) };
    setDraft(updated);
    runPreviewFromDraft(updated);
  };

  const updateDraft = (patch: Partial<DraftState>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    runPreviewFromDraft(next);
  };

  const handleApply = async () => {
    setApplyBusy(true);
    setError(null);
    try {
      if (importSource === 'url') {
        const safe =
          urlCoerced ?? (urlAnalysisRaw !== null ? coerceImportedTenantSiteConfig(urlAnalysisRaw) : null);
        if (safe === null) return;
        setIssues(safe.issues);
        if (Object.keys(safe.patch).length === 0) {
          setError('No importable fields after validation — try another URL or loosen filters.');
          return;
        }
        if (safe.issues.some((i) => i.severity === 'forbidden')) {
          setError('URL import blocked: forbidden fields detected.');
          return;
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console -- DEV-only apply click trace
          console.debug('[ScreenshotImportPanel] apply clicked (URL)', { patchKeys: Object.keys(safe.patch) });
        }
        if (p.onUrlImportMergeToDraft) {
          if (p.urlDraftIsDirty) {
            const ok = window.confirm(
              'יש שינויים שלא נשמרו בטיוטת האתר. להחליף בתוצאת ניתוח ה-URL? (השינויים הנוכחיים יאבדו עד שתשחזרו מהבסיס)',
            );
            if (!ok) return;
          }
          await p.onUrlImportMergeToDraft(safe.patch as ScreenshotDerivedSiteConfigImportInput);
          setUrlCompletedImportPatch(null);
          p.onPreviewNormalizedReady(null);
          return;
        }
        await p.onApply(safe.patch as ScreenshotDerivedSiteConfigImportInput);
        handleClear();
        return;
      }

      if (!computedPatch) return;
      const safe = coerceImportedTenantSiteConfig(computedPatch);
      setIssues(safe.issues);
      if (Object.keys(safe.patch).length === 0) {
        setError('אין שדות לייבוא לאחר האימות — הוסיפו צבע/טקסט או סמנו סקשנים, או נסו צילום מסך אחר.');
        return;
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- DEV-only apply click trace
        console.debug('[ScreenshotImportPanel] apply clicked (screenshot)', { patchKeys: Object.keys(safe.patch) });
      }
      await p.onApply(safe.patch as ScreenshotDerivedSiteConfigImportInput);
      handleClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <section className="screenshot-import-panel" aria-label="AI site import">
      <h4 className="screenshot-import-panel__title">AI Site Import</h4>
      <p className="screenshot-import-panel__hint">
        Screenshot vision → תצוגה חיה → Apply שומר ל-Firestore. ניתוח URL → השלמה אוטומטית והחלה לטיוטת הבילדר; שמירה ידנית ל-Firestore. כפתור Apply ל-URL משמש לחזרה ידנית או ל-Firestore כשאין מיזוג טיוטה.
      </p>
      <div className="screenshot-import-panel__row screenshot-import-panel__row--segmented" role="tablist" aria-label="Import source">
        <button
          type="button"
          className={`secondary-btn${importSource === 'screenshot' ? ' secondary-btn--active' : ''}`}
          onClick={() => {
            setImportSource('screenshot');
            setError(null);
            syncPreviewToActiveSource('screenshot');
          }}
          disabled={p.disabled || busy || applyBusy || urlBusy}
        >
          Screenshot
        </button>
        <button
          type="button"
          className={`secondary-btn${importSource === 'url' ? ' secondary-btn--active' : ''}`}
          onClick={() => {
            setImportSource('url');
            setError(null);
            syncPreviewToActiveSource('url');
          }}
          disabled={p.disabled || busy || applyBusy || urlBusy}
        >
          URL
        </button>
      </div>

      {importSource === 'screenshot' ? (
      <div
        ref={screenshotDropRef}
        className={`screenshot-import-panel__row screenshot-import-panel__dropzone${screenshotDragOver ? ' screenshot-import-panel__dropzone--dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && !applyBusy) setScreenshotDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setScreenshotDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setScreenshotDragOver(false);
          if (busy || applyBusy) return;
          const f = pickFirstAcceptedImageFile(e.dataTransfer?.files ?? null);
          if (f) void handleAnalyze(f, 'drop');
        }}
        onPaste={(e) => {
          if (busy || applyBusy) return;
          const items = Array.from(e.clipboardData?.items ?? []);
          const imageItem = items.find((item) => item.type.toLowerCase().startsWith('image/'));
          if (!imageItem) {
            return;
          }
          const f = imageItem.getAsFile();
          e.preventDefault();
          if (f) {
            void handleAnalyze(f, 'paste');
          } else {
            setError('לא נמצאה תמונה תקינה בלוח ההעתקה.');
          }
        }}
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          className="tenant-media-field__visually-hidden"
          disabled={busy || applyBusy}
          onChange={(e) => void handleAnalyze(e.target.files?.[0] ?? null, 'file')}
        />
        <button
          type="button"
          className={`tenant-media-field__btn tenant-media-field__btn--primary${busy ? ' tenant-media-field__btn--loading' : ''}`}
          onClick={() => {
            inputRef.current?.click();
          }}
          disabled={busy || applyBusy}
        >
          {busy ? 'Uploading...' : 'Upload Screenshot'}
        </button>
        <button type="button" className="secondary-btn" onClick={handleClear} disabled={p.disabled || busy || applyBusy}>
          Clear
        </button>
        <span className="screenshot-import-panel__dropzone-hint">אפשר לגרור/להדביק כאן PNG/JPG/WEBP</span>
        <label className="field-label" style={{ width: '100%', marginTop: '0.5rem' }}>
          כתובת תמונה
          <input
            value={screenshotImageUrl}
            onChange={(e) => setScreenshotImageUrl(e.target.value)}
            placeholder="https://srk-car.com/design/images/logo.png"
            dir="ltr"
            disabled={busy || applyBusy}
          />
        </label>
        <button
          type="button"
          className={`tenant-media-field__btn tenant-media-field__btn--primary${busy ? ' tenant-media-field__btn--loading' : ''}`}
          onClick={() => void handleAnalyzeImageUrl()}
          disabled={busy || applyBusy}
        >
          {busy ? 'מנתח תמונה…' : 'נתח תמונה מכתובת'}
        </button>
      </div>
      ) : (
        <div
          className={`screenshot-import-panel__url${urlDragOver ? ' screenshot-import-panel__url--dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!p.disabled && !urlBusy && !applyBusy) setUrlDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setUrlDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setUrlDragOver(false);
            if (p.disabled || urlBusy || applyBusy) return;
            const txt = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
            const url = extractFirstUrlFromText(txt);
            if (url) setUrlInput(url);
          }}
        >
          <label className="field-label">
            Website URL
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com"
              dir="ltr"
              disabled={p.disabled || urlBusy || applyBusy}
            />
          </label>
          <p className="screenshot-import-panel__dropzone-hint">אפשר לגרור לכאן טקסט/URL — נמלא את השדה אוטומטית</p>
          <div className="screenshot-import-panel__row" style={{ marginTop: '0.5rem' }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={urlIncludeSubpages}
                onChange={(e) => setUrlIncludeSubpages(e.target.checked)}
                disabled={p.disabled || urlBusy || applyBusy}
              />
              Include bounded same-origin subpages
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={urlPreferHebrew}
                onChange={(e) => setUrlPreferHebrew(e.target.checked)}
                disabled={p.disabled || urlBusy || applyBusy}
              />
              Prefer Hebrew copy hints
            </label>
          </div>
          <div className="form-grid" style={{ marginTop: '0.5rem' }}>
            <label>
              Max pages (including homepage)
              <input
                type="number"
                min={1}
                max={12}
                value={urlMaxPages}
                onChange={(e) => setUrlMaxPages(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                disabled={p.disabled || urlBusy || applyBusy}
              />
            </label>
            <label>
              Mode
              <select value={urlMode} onChange={(e) => setUrlMode(e.target.value === 'homepage' ? 'homepage' : 'site')} disabled={p.disabled || urlBusy || applyBusy}>
                <option value="site">Site (homepage + high-value pages)</option>
                <option value="homepage">Homepage only</option>
              </select>
            </label>
            <label className="full-width">
              Industry hint (optional)
              <input value={urlIndustryHint} onChange={(e) => setUrlIndustryHint(e.target.value)} disabled={p.disabled || urlBusy || applyBusy} />
            </label>
          </div>
          <div className="screenshot-import-panel__row" style={{ marginTop: '0.65rem' }}>
            <button
              type="button"
              className={`tenant-media-field__btn tenant-media-field__btn--primary${urlBusy ? ' tenant-media-field__btn--loading' : ''}`}
              onClick={() => void handleAnalyzeUrl()}
              disabled={p.disabled || urlBusy || applyBusy}
            >
              {urlBusy ? 'Analyzing URL…' : 'Analyze URL'}
            </button>
            <button type="button" className="secondary-btn" onClick={handleClear} disabled={p.disabled || busy || applyBusy || urlBusy}>
              Clear
            </button>
          </div>
        </div>
      )}

      {busy ? <p className="screenshot-import-panel__hint">Analyzing screenshot…</p> : null}
      {urlBusy ? <p className="screenshot-import-panel__hint">Researching website (bounded fetch + model mapping)…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {importSource === 'url' && urlDiagModel ? (
        <div className="screenshot-import-panel__diag" aria-live="polite">
          <span>Model: {urlDiagModel}</span>
          {urlDiagAnalyzedUrl ? (
            <span>
              URL: <span dir="ltr">{urlDiagAnalyzedUrl}</span>
            </span>
          ) : null}
          {typeof urlDiagPages === 'number' ? <span>Pages inspected: {urlDiagPages}</span> : null}
          {urlWarnings.length > 0 ? <span>Notes/Warnings: {urlWarnings.length}</span> : null}
        </div>
      ) : null}

      {importSource === 'screenshot' && analysis ? (
        <div className="screenshot-import-panel__diag" aria-live="polite">
          {analysis.diagnostics.extractionSource === 'cloud' ? (
            <span>Extractor: Claude ({analysis.diagnostics.extractorModel ?? 'vision'})</span>
          ) : (
            <span>Extractor: local heuristics</span>
          )}
          <span>Palette confidence: {analysis.diagnostics.paletteConfidence}</span>
          <span>Sections confidence: {analysis.diagnostics.sectionConfidence}</span>
          <span>Text confidence: {analysis.diagnostics.textConfidence}</span>
          {analysis.diagnostics.warnings && analysis.diagnostics.warnings.length > 0 ? (
            <span>Warnings: {analysis.diagnostics.warnings.length}</span>
          ) : null}
        </div>
      ) : null}

      {importSource === 'screenshot' && draft ? (
        <>
          <div className="screenshot-import-panel__colors">
            <BuilderThemeColorFieldRow
              fieldId="screenshot-primary"
              label="Primary"
              value={draft.primaryColor}
              onChange={(v) => updateDraft({ primaryColor: v })}
              disabled={p.disabled || busy || applyBusy}
              placeholder="#334155"
              activeFieldId={activeColorFieldId}
              onActiveFieldChange={setActiveColorFieldId}
            />
            <BuilderThemeColorFieldRow
              fieldId="screenshot-secondary"
              label="Secondary"
              value={draft.secondaryColor}
              onChange={(v) => updateDraft({ secondaryColor: v })}
              disabled={p.disabled || busy || applyBusy}
              placeholder="#1e293b"
              activeFieldId={activeColorFieldId}
              onActiveFieldChange={setActiveColorFieldId}
            />
            <BuilderThemeColorFieldRow
              fieldId="screenshot-accent"
              label="Accent"
              value={draft.accentColor}
              onChange={(v) => updateDraft({ accentColor: v })}
              disabled={p.disabled || busy || applyBusy}
              placeholder="#38bdf8"
              activeFieldId={activeColorFieldId}
              onActiveFieldChange={setActiveColorFieldId}
            />
          </div>

          <div className="form-grid" style={{ marginTop: '0.65rem' }}>
            <label>
              Hero title
              <input value={draft.heroTitle} onChange={(e) => updateDraft({ heroTitle: e.target.value })} disabled={p.disabled || busy || applyBusy} />
            </label>
            <label>
              Hero subtitle
              <input
                value={draft.heroSubtitle}
                onChange={(e) => updateDraft({ heroSubtitle: e.target.value })}
                disabled={p.disabled || busy || applyBusy}
              />
            </label>
            <label className="full-width">
              About text
              <textarea value={draft.aboutText} onChange={(e) => updateDraft({ aboutText: e.target.value })} rows={3} disabled={p.disabled || busy || applyBusy} />
            </label>
          </div>

          <div className="screenshot-import-panel__sections">
            {TENANT_HOME_SECTION_KEYS.filter((k) => k !== 'finance' && k !== 'testimonials' && k !== 'map').map((key) => (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.homeSections.includes(key)}
                  onChange={(e) => toggleSection(key, e.target.checked)}
                  disabled={p.disabled || busy || applyBusy}
                />
                {TENANT_HOME_SECTION_LABELS_HE[key]} ({key})
              </label>
            ))}
          </div>

          {issues.length > 0 ? (
            <ul className="screenshot-import-panel__issues">
              {issues.map((issue, idx) => (
                <li key={`${issue.path}-${idx}`}>{issue.severity}: {issue.path}</li>
              ))}
            </ul>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              className={`tenant-media-field__btn tenant-media-field__btn--primary${applyBusy ? ' tenant-media-field__btn--loading' : ''}`}
              onClick={() => {
                void handleApply();
              }}
              disabled={p.disabled || busy || applyBusy || !hasImportablePatch}
            >
              {applyBusy ? 'Applying…' : 'Apply Screenshot Import'}
            </button>
          </div>
        </>
      ) : null}

      {importSource === 'url' && (urlAnalysisRaw !== null || urlCompletedImportPatch !== null) ? (
        <>
          {issues.length > 0 ? (
            <ul className="screenshot-import-panel__issues">
              {issues.map((issue, idx) => (
                <li key={`${issue.path}-${idx}`}>
                  {issue.severity}: {issue.path}
                </li>
              ))}
            </ul>
          ) : null}
          {urlWarnings.length > 0 ? (
            <ul className="screenshot-import-panel__issues">
              {urlWarnings.map((w, idx) => (
                <li key={`url-w-${idx}`}>{w}</li>
              ))}
            </ul>
          ) : null}
          <p className="screenshot-import-panel__hint">
            לאחר ניתוח מוצלח הטיוטה מתעדכנת אוטומטית (אם אין התנגשות). כפתור Apply מטה — יישום חוזר / גיבוי ידני לטיוטה בלבד (לא Firestore).
          </p>
          <div className="form-actions">
            <button
              type="button"
              className={`tenant-media-field__btn tenant-media-field__btn--primary${applyBusy ? ' tenant-media-field__btn--loading' : ''}`}
              onClick={() => void handleApply()}
              disabled={p.disabled || urlBusy || applyBusy || !hasImportablePatch}
            >
              {applyBusy ? 'מחיל…' : 'החל שוב לטיוטה (URL)'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
