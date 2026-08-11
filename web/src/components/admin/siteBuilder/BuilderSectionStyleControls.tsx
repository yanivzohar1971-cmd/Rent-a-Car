import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  TENANT_HOME_SECTION_LABELS_HE,
  validateColorInput,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
  type TenantSectionStyleCapability,
  type TenantSectionBackgroundMode,
  type TenantSectionTextTone,
  type TenantSectionAlign,
  type TenantSectionLayoutVariant,
  type TenantSectionPaddingDensity,
  type TenantSectionCardStyle,
} from '../../../tenant/tenantSiteConfig';
import { PRESET_LIST, getPresetByKey } from '../../../tenant/sectionColorPresets';
import { SECTION_THEME_PRESET_LIST, getSectionThemePresetById } from '../../../tenant/sectionThemePresets';
import type { ResolvedSectionHiveAccentResolution } from '../../../tenant/effectiveSectionAccent';
import {
  deriveSectionHivePalette,
  getContrastRatio,
  isColorDark,
  normalizeAccentBaseColor,
  resolveSectionHiveColorContext,
  resolveSectionHiveExplicitAccent,
  type ResolvedSectionHiveColorContext,
} from '../../../tenant/sectionHivePalette';
import './BuilderSectionStyleControls.css';

const DEFAULT_SECTION_BODY_TEXT_HEX = '#0f172a';
const WHITE_TEXT_HEX = '#ffffff';
const MIN_CONTRAST_AA = 4.5;

type BuilderSectionStyleControlsProps = {
  sectionKey: TenantHomeSectionKey;
  /** Effective style (theme merge) — used for non-Hive fields so UI matches preview while inheriting. */
  value: TenantSectionStyle;
  /** Normalized draft actually persisted for this section — source of truth for Hive preset/custom. */
  storedSectionStyle: TenantSectionStyle;
  capabilities: TenantSectionStyleCapability;
  disabled?: boolean;
  /** When picking a section accent, seed the native color input if none saved yet */
  accentFallbackHex?: string;
  onChange: (next: TenantSectionStyle, inheritBreak?: 'style' | 'accent' | 'both') => void;
  onReset: () => void;
  /** Apply current style to all non-hero sections (respecting each section’s capability map). */
  onApplyStyleToAllSections?: () => void;
  inheritsSiteThemeStyle?: boolean;
  inheritsSiteThemeAccent?: boolean;
  onBreakStyleFromSiteTheme?: () => void;
  onBreakAccentFromSiteTheme?: () => void;
  onBreakAllFromSiteTheme?: () => void;
  onLinkStyleToSiteTheme?: () => void;
  onLinkAccentToSiteTheme?: () => void;
  onLinkAllToSiteTheme?: () => void;
  /** Same resolver chain as התצוגה החיה / התצוגה המקדימה (מקור הגוון + הקשר Hive). */
  hiveAccentResolution?: ResolvedSectionHiveAccentResolution | null;
  /** Clear local hive preset/custom so the global theme accent can apply again (inherits site theme). */
  onRevertAccentToTheme?: () => void;
  /** Reset non-Hive section fields to theme defaults while keeping local Hive as stored. */
  onRevertStyleToTheme?: () => void;
  /** Normalized page default preset id (for hint). */
  defaultSectionThemePresetId?: string | null;
  /** Quick built-in section theme; `null` = inherit page default. */
  onSectionThemePresetChange?: (id: string | null) => void;
};

const PRIMARY_FALLBACK = '#0ea5e9';

const BACKGROUND_OPTIONS: Array<{
  value: TenantSectionBackgroundMode;
  label: string;
}> = [
  { value: 'default', label: 'לבן' },
  { value: 'surface', label: 'אפור עדין' },
  { value: 'soft', label: 'רך' },
  { value: 'accent', label: 'מותג' },
  { value: 'image', label: 'תמונה' },
];

const TEXT_TONE_OPTIONS: Array<{ value: TenantSectionTextTone; label: string }> = [
  { value: 'default', label: 'רגיל' },
  { value: 'muted', label: 'עדין' },
  { value: 'inverse', label: 'הפוך' },
];

const ALIGN_OPTIONS: Array<{ value: TenantSectionAlign; label: string }> = [
  { value: 'right', label: 'ימין' },
  { value: 'center', label: 'מרכז' },
  { value: 'left', label: 'שמאל' },
];

const LAYOUT_OPTIONS: Array<{ value: TenantSectionLayoutVariant; label: string }> = [
  { value: 'default', label: 'סטנדרטית' },
  { value: 'compact', label: 'צרה' },
  { value: 'split', label: 'מפוצלת' },
  { value: 'highlight', label: 'מודגשת' },
];

const DENSITY_OPTIONS: Array<{ value: TenantSectionPaddingDensity; label: string }> = [
  { value: 'sm', label: 'צפוף' },
  { value: 'md', label: 'רגיל' },
  { value: 'lg', label: 'מרווח' },
];

const CARD_OPTIONS: Array<{ value: TenantSectionCardStyle; label: string }> = [
  { value: 'default', label: 'שטוח' },
  { value: 'soft', label: 'רך' },
  { value: 'outline', label: 'מסגרת' },
  { value: 'elevated', label: 'מורם' },
];

/** Matches TenantHomeBlocks.css: with hive use derived tones; without hive use flat primary mix for soft/accent. */
function BackgroundPreviewChip({
  mode,
  hiveBaseHex,
  tenantPrimaryHex,
}: {
  mode: TenantSectionBackgroundMode;
  hiveBaseHex: string | null;
  tenantPrimaryHex: string | null;
}) {
  const tp = tenantPrimaryHex ?? PRIMARY_FALLBACK;
  const norm = hiveBaseHex ? normalizeAccentBaseColor(hiveBaseHex) : null;
  const pal = norm ? deriveSectionHivePalette(norm) : null;
  const style: Record<TenantSectionBackgroundMode, CSSProperties> = {
    default: { background: '#fff' },
    surface: { background: pal ? pal.surface : '#f8fafc' },
    soft: { background: pal ? pal.soft : `color-mix(in srgb, ${tp} 8%, #fff)` },
    accent: { background: pal ? pal.surface : `color-mix(in srgb, ${tp} 14%, #fff)` },
    image: {
      backgroundColor: '#f8fafc',
      backgroundImage: 'linear-gradient(135deg, rgba(15, 23, 42, 0.12), rgba(15, 23, 42, 0.03))',
    },
  };
  return <span className="builder-ssc__swatch" style={style[mode]} aria-hidden />;
}

const HIVE_TONE_LABELS = ['חזק', 'בינוני', 'רך', 'משטח'] as const;

function sectionColorSourceBadgeHe(ctx: ResolvedSectionHiveColorContext): string {
  if (ctx.kind === 'custom') return 'מצב גוון: צבע מותאם לסקשן (גוון מוביל פעיל)';
  if (ctx.kind === 'preset') {
    const def = ctx.presetKey ? getPresetByKey(ctx.presetKey) : undefined;
    return def?.label ? `מצב גוון: ערכת צבעים — ${def.label}` : 'מצב גוון: ערכת צבעים';
  }
  return 'מצב גוון: ללא גוון מוביל לסקשן — ״רך״/״מותג״ לפי צבע ראשי של האתר בלבד (כמו באתר החי)';
}

function hiveSourceBadgeHe(
  ctx: ResolvedSectionHiveColorContext,
  resolution: ResolvedSectionHiveAccentResolution | null | undefined,
): string {
  if (!resolution) return sectionColorSourceBadgeHe(ctx);
  switch (resolution.source) {
    case 'theme-preset':
      return 'מצב גוון: ערכת צבעים לפי ההנחיה של ערכת האתר (סקשן מקושר לערכה).';
    case 'theme-derived':
      return 'מצב גוון: גוון נגזר לפי ההנחיה של ערכת האתר (סקשן מקושר לערכה).';
    case 'section-custom':
      return 'מצב גוון: צבע מקומי לסקשן — עוקף את הגוון מהערכה.';
    case 'section-preset': {
      const def = ctx.presetKey ? getPresetByKey(ctx.presetKey) : undefined;
      return def?.label
        ? `מצב גוון: ערכת צבעים מקומית — ${def.label}`
        : 'מצב גוון: ערכת צבעים מקומית';
    }
    default:
      return sectionColorSourceBadgeHe(ctx);
  }
}

function SectionHiveAccentField({
  colorCtx,
  disabled,
  onAccentChange,
}: {
  colorCtx: ResolvedSectionHiveColorContext;
  disabled: boolean;
  onAccentChange: (hex: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const committed = colorCtx.customHex;
  const fallback = colorCtx.tenantPrimaryHex ?? PRIMARY_FALLBACK;
  const pickerValue = committed ?? fallback;
  const presetMode = colorCtx.kind === 'preset';
  const swatchBase = committed ?? (presetMode ? colorCtx.hiveBaseHex : null) ?? fallback;
  const paletteCommitted = colorCtx.hiveBaseHex ? deriveSectionHivePalette(colorCtx.hiveBaseHex) : null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="builder-ssc__field builder-ssc__hive" ref={rootRef}>
      <div className="builder-ssc__field-label">גוון מוביל בסקשן</div>
      <p className="builder-ssc__hive-hint">צבע בסיס יחיד — ממנו נגזרים גוונים לרקע, מסגרות וכפתורים בסקשן (ללא בחירת צבע חופשית לכל רכיב).</p>
      <div className="builder-ssc__hive-row">
        <span
          className={`builder-ssc__hive-current${committed || presetMode ? '' : ' builder-ssc__hive-current--fallback'}`}
          style={{ background: swatchBase }}
          title={
            colorCtx.kind === 'custom'
              ? 'צבע מותאם אישית לסקשן (גוון מוביל פעיל)'
              : colorCtx.kind === 'preset'
                ? 'ערכת צבעים מובנית (גוון מוביל פעיל)'
                : 'ללא גוון מוביל לסקשן — התצוגה משתמשת בצבע הראשי של האתר לרקע ״רך״/״מותג״ בלבד'
          }
        />
        <button
          type="button"
          className={`builder-ssc__hive-pick${committed ? ' builder-ssc__hive-pick--active' : ''}`}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
        >
          בחירת צבע…
        </button>
        {committed ? (
          <button type="button" className="builder-ssc__hive-clear" disabled={disabled} onClick={() => onAccentChange(null)}>
            הסר גוון
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="builder-ssc__hive-popover" role="dialog" aria-label="בחירת גוון מוביל לסקשן">
          <label className="builder-ssc__hive-color-label">
            <span className="builder-ssc__visually-hidden">בחירת צבע</span>
            <input
              type="color"
              className={`builder-ssc__hive-native-color${committed ? ' builder-ssc__hive-native-color--active' : ''}`}
              value={pickerValue}
              onChange={(e) => {
                const n = normalizeAccentBaseColor(e.target.value);
                if (n) onAccentChange(n);
              }}
            />
          </label>
          <p className="builder-ssc__hive-pop-hint">בחירה מעדכנת מיד; לחצו מחוץ לחלון או Esc לסגירה.</p>
        </div>
      ) : null}
      {paletteCommitted ? (
        <div className="builder-ssc__hive-tones" aria-label="גוונים שנגזרו מהבחירה — לחיצה קובעת את הגוון כבסיס לסקשן">
          {([paletteCommitted.strong, paletteCommitted.medium, paletteCommitted.soft, paletteCommitted.surface] as const).map(
            (hex, i) => {
              const norm = normalizeAccentBaseColor(hex);
              const baseNorm = colorCtx.hiveBaseHex ? normalizeAccentBaseColor(colorCtx.hiveBaseHex) : null;
              const isSelected = norm != null && baseNorm != null && norm === baseNorm;
              return (
                <button
                  key={`${HIVE_TONE_LABELS[i]}-${hex}`}
                  type="button"
                  className={`builder-ssc__hive-tone-btn${isSelected ? ' builder-ssc__hive-tone-btn--selected' : ''}`}
                  disabled={disabled || !norm}
                  aria-pressed={isSelected}
                  aria-label={`${HIVE_TONE_LABELS[i]}: ${hex}`}
                  title={`החלת ${HIVE_TONE_LABELS[i]} כבסיס הגוון לסקשן`}
                  onClick={() => {
                    if (!norm || disabled) return;
                    onAccentChange(norm);
                  }}
                >
                  <span className="builder-ssc__hive-tone-swatch" style={{ background: hex }} aria-hidden />
                  <span className="builder-ssc__hive-tone-label">{HIVE_TONE_LABELS[i]}</span>
                </button>
              );
            },
          )}
        </div>
      ) : (
        <p className="builder-ssc__hive-tones-placeholder">בחרו ערכת צבעים או צבע מותאם כדי לראות את הגוונים הנגזרים.</p>
      )}
    </div>
  );
}

function TextTonePreview({ tone }: { tone: TenantSectionTextTone }) {
  const bar =
    tone === 'inverse' ? (
      <span className="builder-ssc__tone-prev builder-ssc__tone-prev--inverse">
        <span className="builder-ssc__tone-line builder-ssc__tone-line--on-dark" />
        <span className="builder-ssc__tone-line builder-ssc__tone-line--on-dark short" />
      </span>
    ) : (
      <span
        className={`builder-ssc__tone-prev ${tone === 'muted' ? 'builder-ssc__tone-prev--muted' : ''}`}
      >
        <span className="builder-ssc__tone-line" />
        <span className="builder-ssc__tone-line short" />
      </span>
    );
  return bar;
}

function DensityPreview({ density }: { density: TenantSectionPaddingDensity }) {
  const pad = density === 'sm' ? 2 : density === 'md' ? 5 : 8;
  const gap = density === 'sm' ? 2 : density === 'md' ? 3 : 5;
  return (
    <span className="builder-ssc__density-prev" style={{ padding: pad, gap }} aria-hidden>
      <span className="builder-ssc__density-bar" />
      <span className="builder-ssc__density-bar" />
      <span className="builder-ssc__density-bar" />
    </span>
  );
}

function LayoutPreview({ variant }: { variant: TenantSectionLayoutVariant }) {
  if (variant === 'split') {
    return (
      <span className="builder-ssc__layout-prev builder-ssc__layout-prev--split" aria-hidden>
        <span />
        <span />
      </span>
    );
  }
  if (variant === 'compact') {
    return (
      <span className="builder-ssc__layout-prev builder-ssc__layout-prev--compact" aria-hidden>
        <span />
      </span>
    );
  }
  if (variant === 'highlight') {
    return (
      <span className="builder-ssc__layout-prev builder-ssc__layout-prev--highlight" aria-hidden>
        <span />
      </span>
    );
  }
  return (
    <span className="builder-ssc__layout-prev builder-ssc__layout-prev--default" aria-hidden>
      <span />
    </span>
  );
}

function CardStylePreview({ cardStyle }: { cardStyle: TenantSectionCardStyle }) {
  return (
    <span
      className={`builder-ssc__card-prev builder-ssc__card-prev--${cardStyle}`}
      aria-hidden
    />
  );
}

function AlignIcon({ align }: { align: TenantSectionAlign }) {
  const lines =
    align === 'left'
      ? ['long', 'med', 'short']
      : align === 'center'
        ? ['short', 'long', 'short']
        : ['short', 'med', 'long'];
  return (
    <svg className="builder-ssc__align-icon" viewBox="0 0 16 12" width="16" height="12" aria-hidden>
      {lines.map((kind, i) => {
        const y = 2 + i * 4;
        const w = kind === 'long' ? 14 : kind === 'med' ? 10 : 6;
        const x = align === 'left' ? 1 : align === 'center' ? (16 - w) / 2 : 16 - 1 - w;
        return <rect key={i} x={x} y={y} width={w} height={1.5} rx={0.5} fill="currentColor" />;
      })}
    </svg>
  );
}

export default function BuilderSectionStyleControls({
  sectionKey,
  value,
  storedSectionStyle,
  capabilities,
  disabled = false,
  accentFallbackHex = PRIMARY_FALLBACK,
  onChange,
  onReset,
  onApplyStyleToAllSections,
  inheritsSiteThemeStyle = false,
  inheritsSiteThemeAccent = false,
  onBreakStyleFromSiteTheme,
  onBreakAccentFromSiteTheme,
  onBreakAllFromSiteTheme,
  onLinkStyleToSiteTheme,
  onLinkAccentToSiteTheme,
  onLinkAllToSiteTheme,
  hiveAccentResolution = null,
  onRevertAccentToTheme,
  onRevertStyleToTheme,
  defaultSectionThemePresetId = null,
  onSectionThemePresetChange,
}: BuilderSectionStyleControlsProps) {
  const textToneLockedByUserRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const storedRef = useRef(storedSectionStyle);
  storedRef.current = storedSectionStyle;

  useEffect(() => {
    textToneLockedByUserRef.current = false;
  }, [sectionKey]);

  /** Strict: persisted custom hex → else valid preset → else no section hive (then theme path via hiveAccentResolution). */
  const storedHasExplicitHive = capabilities.accentColor && resolveSectionHiveExplicitAccent(storedSectionStyle) != null;
  const effectiveColorCtx =
    capabilities.accentColor && storedHasExplicitHive
      ? resolveSectionHiveColorContext(storedSectionStyle, accentFallbackHex)
      : capabilities.accentColor && hiveAccentResolution
        ? hiveAccentResolution.ctx
        : resolveSectionHiveColorContext(value, accentFallbackHex);

  const setField = <K extends keyof TenantSectionStyle>(field: K, nextValue: TenantSectionStyle[K]) => {
    onChange(
      {
        ...value,
        [field]: nextValue,
      },
      'style',
    );
  };

  const withSmartTextTone = (next: TenantSectionStyle): TenantSectionStyle => {
    if (!capabilities.textTone) return next;
    if (textToneLockedByUserRef.current) return next;
    const ctx = resolveSectionHiveColorContext(next, accentFallbackHex);
    const base = ctx.hiveBaseHex;
    if (!base) return next;
    const tone: TenantSectionTextTone = isColorDark(base) ? 'inverse' : 'default';
    if (next.textTone === tone) return next;
    return { ...next, textTone: tone };
  };

  useEffect(() => {
    if (!capabilities.textTone) return;
    if (textToneLockedByUserRef.current) return;
    const v = valueRef.current;
    const ctx = resolveSectionHiveColorContext(v, accentFallbackHex);
    const base = ctx.hiveBaseHex;
    if (!base) return;
    if (!isColorDark(base) || v.textTone !== 'default') return;
    const s = storedRef.current;
    if (s.textTone === 'inverse') return;
    onChange({ ...s, textTone: 'inverse' }, 'accent');
  }, [
    onChange,
    capabilities.textTone,
    sectionKey,
    value.accentBaseColor,
    value.colorPreset,
    value.textTone,
    storedSectionStyle.accentBaseColor,
    storedSectionStyle.colorPreset,
    storedSectionStyle.textTone,
    accentFallbackHex,
  ]);

  const sectionColorCtx = capabilities.accentColor ? effectiveColorCtx : null;
  const tenantPrimaryForChips = normalizeAccentBaseColor(accentFallbackHex) ?? null;
  const chipHiveBaseHex = sectionColorCtx?.hiveBaseHex ?? null;

  const accentCommittedForHive = sectionColorCtx?.customHex ?? null;
  const sectionColorPresetKey = sectionColorCtx?.presetKey ?? '';
  const colorPresetNoneSelected = capabilities.accentColor && sectionColorCtx?.kind === 'none';
  const hivePaletteForContrast =
    sectionColorCtx?.hiveBaseHex != null ? deriveSectionHivePalette(sectionColorCtx.hiveBaseHex) : null;
  const lowContrastWarning =
    hivePaletteForContrast != null &&
    ((getContrastRatio(hivePaletteForContrast.strong, WHITE_TEXT_HEX) ?? 99) < MIN_CONTRAST_AA ||
      (getContrastRatio(hivePaletteForContrast.surface, DEFAULT_SECTION_BODY_TEXT_HEX) ?? 99) < MIN_CONTRAST_AA);

  const handleResetClick = () => {
    textToneLockedByUserRef.current = false;
    onReset();
  };

  return (
    <div className="builder-section-style-controls">
      <div className="builder-section-style-controls__head">
        <h4>עיצוב סקשן</h4>
        <button type="button" className="builder-section-style-controls__reset" onClick={handleResetClick} disabled={disabled}>
          איפוס ברירת מחדל
        </button>
      </div>
      <p className="builder-section-style-controls__hint">
        מראה הסקשן «{TENANT_HOME_SECTION_LABELS_HE[sectionKey]}» — בחירות מוכנות מראש (ללא CSS חופשי).
      </p>

      {onSectionThemePresetChange && sectionKey !== 'hero' && Object.values(capabilities).some(Boolean) ? (
        <div className="builder-ssc__field builder-ssc__theme-quick">
          <div className="builder-ssc__field-label">ערכת מראה מהירה</div>
          <select
            className="builder-ssc__theme-quick-select"
            aria-label="ערכת מראה מוכנת מראש לסקשן"
            disabled={disabled}
            value={storedSectionStyle.sectionThemePresetId ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              onSectionThemePresetChange(v ? v : null);
            }}
          >
            <option value="">יורש מהעמוד</option>
            {SECTION_THEME_PRESET_LIST.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.label}
              </option>
            ))}
          </select>
          {defaultSectionThemePresetId && getSectionThemePresetById(defaultSectionThemePresetId) ? (
            <p className="builder-ssc__hint">
              ברירת מחדל לעמוד: {getSectionThemePresetById(defaultSectionThemePresetId)?.label ?? defaultSectionThemePresetId}
            </p>
          ) : (
            <p className="builder-ssc__hint">ללא ברירת מחדל לעמוד — בחרו ערכה בעמודה «מבנה העמוד» או פריסט ספציפי כאן.</p>
          )}
        </div>
      ) : null}

      {onBreakStyleFromSiteTheme || onLinkStyleToSiteTheme || onBreakAccentFromSiteTheme || onLinkAccentToSiteTheme ? (
        <div
          className={`builder-ssc__inherit-banner${inheritsSiteThemeStyle || inheritsSiteThemeAccent ? '' : ' builder-ssc__inherit-banner--local'}`}
          role="status"
        >
          <div className="builder-ssc__inherit-rows">
            <div className="builder-ssc__inherit-row">
              <span className="builder-ssc__inherit-label">סגנון (רקע, ריווח, כרטיסים)</span>
              <span className="builder-ssc__inherit-text">{inheritsSiteThemeStyle ? 'מקושר לערכת האתר' : 'מקומי'}</span>
              {inheritsSiteThemeStyle && onBreakStyleFromSiteTheme ? (
                <button type="button" className="builder-ssc__inherit-action" disabled={disabled} onClick={onBreakStyleFromSiteTheme}>
                  נתק
                </button>
              ) : null}
              {!inheritsSiteThemeStyle && onLinkStyleToSiteTheme ? (
                <button type="button" className="builder-ssc__inherit-action" disabled={disabled} onClick={onLinkStyleToSiteTheme}>
                  קשר לערכה
                </button>
              ) : null}
            </div>
            <div className="builder-ssc__inherit-row">
              <span className="builder-ssc__inherit-label">גוון מוביל (Hive)</span>
              <span className="builder-ssc__inherit-text">
                {inheritsSiteThemeAccent ? 'מקושר להנחיית הערכה' : 'מקומי / ללא לפי שדות'}
              </span>
              {inheritsSiteThemeAccent && onBreakAccentFromSiteTheme ? (
                <button type="button" className="builder-ssc__inherit-action" disabled={disabled} onClick={onBreakAccentFromSiteTheme}>
                  נתק
                </button>
              ) : null}
              {!inheritsSiteThemeAccent && onLinkAccentToSiteTheme ? (
                <button type="button" className="builder-ssc__inherit-action" disabled={disabled} onClick={onLinkAccentToSiteTheme}>
                  קשר לערכה
                </button>
              ) : null}
            </div>
          </div>
          {onLinkAllToSiteTheme && !inheritsSiteThemeStyle && !inheritsSiteThemeAccent ? (
            <button type="button" className="builder-ssc__inherit-action builder-ssc__inherit-action--block" disabled={disabled} onClick={onLinkAllToSiteTheme}>
              קשר סגנון וגוון יחד
            </button>
          ) : null}
          {inheritsSiteThemeStyle && inheritsSiteThemeAccent && onBreakAllFromSiteTheme ? (
            <button type="button" className="builder-ssc__inherit-action builder-ssc__inherit-action--block" disabled={disabled} onClick={onBreakAllFromSiteTheme}>
              נתק סגנון וגוון יחד
            </button>
          ) : null}
          {onRevertStyleToTheme && !inheritsSiteThemeStyle ? (
            <div className="builder-ssc__inherit-extra">
              <button type="button" className="builder-ssc__inherit-action" disabled={disabled} onClick={onRevertStyleToTheme}>
                חזור לברירות סגנון מהערכה (שומר גוון מקומי)
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {onApplyStyleToAllSections ? (
        <div className="builder-section-style-controls__apply-row">
          <button
            type="button"
            className="builder-section-style-controls__apply-all"
            disabled={disabled}
            onClick={() => onApplyStyleToAllSections()}
          >
            החל על כל הסקשנים
          </button>
        </div>
      ) : null}

      <div className="builder-ssc__fields">
        {capabilities.accentColor && sectionColorCtx ? (
          <>
            <p className="builder-ssc__source-badge" data-kind={sectionColorCtx.kind} data-accent-source={hiveAccentResolution?.source}>
              {hiveSourceBadgeHe(sectionColorCtx, hiveAccentResolution)}
            </p>
            {hiveAccentResolution?.inheritedFromTheme ? (
              <p className="builder-ssc__theme-accent-note" role="status">
                גוון זה מגיע מהגדרות ערכת האתר — לא נשמר כצבע מקומי לסקשן.
              </p>
            ) : null}
            {inheritsSiteThemeAccent &&
            onRevertAccentToTheme &&
            (hiveAccentResolution?.source === 'section-custom' || hiveAccentResolution?.source === 'section-preset') ? (
              <div className="builder-ssc__revert-theme-accent">
                <button type="button" className="builder-ssc__revert-theme-accent-btn" disabled={disabled} onClick={onRevertAccentToTheme}>
                  חזור לצבע הערכה
                </button>
              </div>
            ) : null}
            <div className="builder-ssc__field">
              <div className="builder-ssc__field-label">ערכת צבעים</div>
              <div className="builder-ssc__chip-row builder-ssc__chip-row--presets" role="radiogroup" aria-label="ערכת צבעים">
                <button
                  key="preset-none"
                  type="button"
                  role="radio"
                  aria-checked={!!colorPresetNoneSelected}
                  disabled={disabled}
                  className={`builder-ssc__choice builder-ssc__choice--chip builder-ssc__choice--preset${colorPresetNoneSelected ? ' is-selected' : ''}`}
                  onClick={() =>
                    onChange(withSmartTextTone({ ...storedSectionStyle, colorPreset: null, accentBaseColor: null }), 'accent')
                  }
                >
                  <span className="builder-ssc__preset-swatch builder-ssc__preset-swatch--none" aria-hidden />
                  <span className="builder-ssc__choice-label">ללא</span>
                </button>
                {PRESET_LIST.map((p) => {
                  const selected = !accentCommittedForHive && sectionColorPresetKey === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      className={`builder-ssc__choice builder-ssc__choice--chip builder-ssc__choice--preset${selected ? ' is-selected' : ''}`}
                      onClick={() =>
                        onChange(
                          withSmartTextTone({
                            ...storedSectionStyle,
                            colorPreset: p.key,
                            accentBaseColor: null,
                          }),
                          'accent',
                        )
                      }
                    >
                      <span
                        className="builder-ssc__preset-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${p.baseColor}, color-mix(in srgb, ${p.baseColor} 38%, #ffffff))`,
                        }}
                        aria-hidden
                      />
                      <span className="builder-ssc__choice-label">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <SectionHiveAccentField
              colorCtx={sectionColorCtx}
              disabled={disabled}
              onAccentChange={(hex) => {
                if (hex != null) {
                  onChange(withSmartTextTone({ ...storedSectionStyle, accentBaseColor: hex, colorPreset: null }), 'accent');
                } else {
                  onChange(withSmartTextTone({ ...storedSectionStyle, accentBaseColor: null }), 'accent');
                }
              }}
            />
            {lowContrastWarning ? (
              <div className="builder-ssc__contrast-warn" role="status">
                ניגודיות נמוכה – ייתכן שקשה לקרוא את הטקסט
              </div>
            ) : null}
          </>
        ) : null}

        {capabilities.background ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">רקע הסקשן</div>
            <div className="builder-ssc__chip-row" role="radiogroup" aria-label="רקע הסקשן">
              {BACKGROUND_OPTIONS.map((opt) => {
                const selected = value.backgroundMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    className={`builder-ssc__choice builder-ssc__choice--chip${selected ? ' is-selected' : ''}`}
                    onClick={() => setField('backgroundMode', opt.value)}
                  >
                    <BackgroundPreviewChip
                      mode={opt.value}
                      hiveBaseHex={chipHiveBaseHex}
                      tenantPrimaryHex={tenantPrimaryForChips}
                    />
                    <span className="builder-ssc__choice-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {capabilities.sectionBackgroundColor ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">צבע רקע מותאם לסקשן</div>
            <p className="builder-ssc__hint">אופציונלי — מכסה את מצב הרקע שנבחר למעלה כשמוגדר.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                dir="ltr"
                placeholder="#f8fafc או ריק"
                value={value.sectionBackgroundColor ?? ''}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    {
                      ...value,
                      sectionBackgroundColor: e.target.value.trim() || null,
                    },
                    'style',
                  )
                }
              />
              <button
                type="button"
                className="builder-ssc__reset"
                disabled={disabled || !value.sectionBackgroundColor}
                onClick={() => onChange({ ...value, sectionBackgroundColor: null }, 'style')}
              >
                נקה
              </button>
            </div>
            {value.sectionBackgroundColor?.trim() &&
            !validateColorInput(value.sectionBackgroundColor.trim()).ok ? (
              <p className="builder-ssc__contrast-warn" role="status">
                פורמט צבע לא מזוהה
              </p>
            ) : null}
          </div>
        ) : null}

        {capabilities.textTone ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">צבע טקסט</div>
            <div className="builder-ssc__chip-row" role="radiogroup" aria-label="צבע טקסט">
              {TEXT_TONE_OPTIONS.map((opt) => {
                const selected = value.textTone === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    className={`builder-ssc__choice builder-ssc__choice--tone${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      textToneLockedByUserRef.current = true;
                      setField('textTone', opt.value);
                    }}
                  >
                    <TextTonePreview tone={opt.value} />
                    <span className="builder-ssc__choice-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {capabilities.align ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">יישור</div>
            <div className="builder-ssc__icon-row" role="radiogroup" aria-label="יישור טקסט">
              {ALIGN_OPTIONS.map((opt) => {
                const selected = value.align === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={opt.label}
                    disabled={disabled}
                    className={`builder-ssc__choice builder-ssc__choice--icon${selected ? ' is-selected' : ''}`}
                    onClick={() => setField('align', opt.value)}
                  >
                    <AlignIcon align={opt.value} />
                    <span className="builder-ssc__choice-label builder-ssc__choice-label--tiny">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {capabilities.density ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">ריווח</div>
            <div className="builder-ssc__chip-row" role="radiogroup" aria-label="ריווח בסקשן">
              {DENSITY_OPTIONS.map((opt) => {
                const selected = value.paddingDensity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    className={`builder-ssc__choice builder-ssc__choice--chip${selected ? ' is-selected' : ''}`}
                    onClick={() => setField('paddingDensity', opt.value)}
                  >
                    <DensityPreview density={opt.value} />
                    <span className="builder-ssc__choice-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {capabilities.layoutVariant ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">פריסת תוכן</div>
            <div className="builder-ssc__chip-row builder-ssc__chip-row--wrap" role="radiogroup" aria-label="פריסת תוכן">
              {LAYOUT_OPTIONS.map((opt) => {
                const selected = value.layoutVariant === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    className={`builder-ssc__choice builder-ssc__choice--chip builder-ssc__choice--layout${selected ? ' is-selected' : ''}`}
                    onClick={() => setField('layoutVariant', opt.value)}
                  >
                    <LayoutPreview variant={opt.value} />
                    <span className="builder-ssc__choice-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {capabilities.cardStyle ? (
          <div className="builder-ssc__field">
            <div className="builder-ssc__field-label">עיצוב כרטיסים</div>
            <div className="builder-ssc__chip-row builder-ssc__chip-row--wrap" role="radiogroup" aria-label="עיצוב כרטיסים">
              {CARD_OPTIONS.map((opt) => {
                const selected = value.cardStyle === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    className={`builder-ssc__choice builder-ssc__choice--chip builder-ssc__choice--card${selected ? ' is-selected' : ''}`}
                    onClick={() => setField('cardStyle', opt.value)}
                  >
                    <CardStylePreview cardStyle={opt.value} />
                    <span className="builder-ssc__choice-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
