import { useMemo, useRef, useState } from 'react';
import BuilderThemeColorFieldRow from './BuilderThemeColorFieldRow';
import { parseHomeSectionsList, TENANT_HOME_SECTION_KEYS, TENANT_HOME_SECTION_LABELS_HE, type TenantHomeSectionKey } from '../../../tenant/tenantSiteConfig';
import {
  coerceImportedTenantSiteConfig,
  normalizeTenantSiteConfigImport,
  type ScreenshotDerivedSiteConfigImportInput,
  type TenantSiteConfigImportIssue,
} from '../../../tenant/tenantSiteConfigImport';
import { runScreenshotAnalysisPreferringCloud, type ScreenshotAnalysisResult } from '../../../tenant/screenshotImport';
import type { TenantSiteConfig } from '../../../api/tenantSiteConfigsApi';
import './TenantMediaField.css';

type Props = {
  disabled?: boolean;
  tenantId: string | null;
  baseSyntheticConfig: TenantSiteConfig;
  onPreviewNormalizedReady: (normalized: ReturnType<typeof normalizeTenantSiteConfigImport>['normalized'] | null) => void;
  onApply: (patch: ScreenshotDerivedSiteConfigImportInput) => Promise<void>;
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

export default function ScreenshotImportPanel(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysisResult | null>(null);
  const [issues, setIssues] = useState<TenantSiteConfigImportIssue[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeColorFieldId, setActiveColorFieldId] = useState<string | null>(null);

  const computedPatch = useMemo(() => (draft ? patchFromDraft(draft) : null), [draft]);

  const runPreviewFromDraft = (nextDraft: DraftState) => {
    const raw = patchFromDraft(nextDraft);
    const safe = coerceImportedTenantSiteConfig(raw);
    setIssues(safe.issues);
    const preview = normalizeTenantSiteConfigImport(safe.patch, p.tenantId, p.baseSyntheticConfig);
    p.onPreviewNormalizedReady(preview.normalized);
  };

  const handleAnalyze = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rawExtract = await runScreenshotAnalysisPreferringCloud(file);
      const safeImport = coerceImportedTenantSiteConfig(rawExtract.payload);
      const normalizedPreview = normalizeTenantSiteConfigImport(safeImport.patch, p.tenantId, p.baseSyntheticConfig);
      setAnalysis(rawExtract);
      setIssues(safeImport.issues);
      const nextDraft = draftFromPatch(safeImport.patch);
      setDraft(nextDraft);
      p.onPreviewNormalizedReady(normalizedPreview.normalized);
    } catch (e) {
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
      setError(e instanceof Error ? e.message : 'Screenshot analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setAnalysis(null);
    setDraft(null);
    setIssues([]);
    setError(null);
    setActiveColorFieldId(null);
    p.onPreviewNormalizedReady(null);
    if (inputRef.current) inputRef.current.value = '';
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
    if (!computedPatch) return;
    setApplyBusy(true);
    setError(null);
    try {
      const safe = coerceImportedTenantSiteConfig(computedPatch);
      setIssues(safe.issues);
      await p.onApply(safe.patch as ScreenshotDerivedSiteConfigImportInput);
      handleClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <section className="screenshot-import-panel" aria-label="Screenshot import">
      <h4 className="screenshot-import-panel__title">Screenshot Import</h4>
      <p className="screenshot-import-panel__hint">Upload homepage screenshot, review extracted payload, then apply via import/merge.</p>
      <div className="screenshot-import-panel__row">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="tenant-media-field__visually-hidden"
          disabled={busy || applyBusy}
          onChange={(e) => void handleAnalyze(e.target.files?.[0] ?? null)}
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
      </div>
      {busy ? <p className="screenshot-import-panel__hint">Analyzing screenshot…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {analysis ? (
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

      {draft ? (
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
              disabled={p.disabled || busy || applyBusy || !computedPatch}
            >
              {applyBusy ? 'Applying…' : 'Apply Screenshot Import'}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
