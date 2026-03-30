import { PRESET_LIST } from '../../../tenant/sectionColorPresets';
import { normalizeAccentBaseColor } from '../../../tenant/sectionHivePalette';
import {
  THEME_ACCENT_STRATEGY_NONE,
  getEffectiveThemeAccentStrategy,
  type NormalizedThemeAccentStrategy,
} from '../../../tenant/themeAccentStrategy';
import { THEME_BRAND_PRESETS, getThemeBrandPresetByKey, type ThemeBrandPreset } from '../../../tenant/themeBrandPresets';
import { isAppliedSnapshotActiveForPack, type NormalizedAppliedThemeSnapshot } from '../../../tenant/tenantSiteConfig';
import './BuilderSiteThemePanel.css';

export type BuilderSiteThemePanelProps = {
  formBusy: boolean;
  /** Current saved/draft global primary (hex or CSS) for live preview next to pack chips */
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  siteThemePackKey: string;
  /** Frozen pack row: keeps tenant visuals stable if the preset registry changes later. */
  appliedThemeSnapshot: NormalizedAppliedThemeSnapshot | null;
  /**
   * `null` — follow the branding pack’s optional accent hint (or none).
   * Non-null — explicit site-level accent strategy (includes `mode: 'none'` to turn off).
   */
  themeAccentStrategy: NormalizedThemeAccentStrategy | null;
  onThemeAccentStrategyChange: (next: NormalizedThemeAccentStrategy | null) => void;
  onSelectPack: (pack: ThemeBrandPreset) => void;
  /** Apply colors + pack key only; does not change section inheritance */
  onApplyThemeBranding: (pack: ThemeBrandPreset) => void;
  /** Clears pack key (colors untouched) */
  onClearPack: () => void;
  /** Sets all non-hero sections to inherit site theme defaults */
  onForceApplyThemeToSections: () => void;
  onForceApplyThemeStyleToSections: () => void;
  onForceApplyThemeAccentToSections: () => void;
  /** Clears section inheritance flags (sections use stored styles only) */
  onClearSectionInheritance: () => void;
  /** Rebuild snapshot from live pack (after intentional registry upgrade). */
  onUpgradeAppliedThemeFromLivePack?: () => void;
};

function PackCard({
  pack,
  selected,
  disabled,
  onPick,
  onApplyBranding,
}: {
  pack: ThemeBrandPreset;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
  onApplyBranding: () => void;
}) {
  return (
    <div className={`builder-site-theme__card${selected ? ' builder-site-theme__card--selected' : ''}`}>
      <button
        type="button"
        className="builder-site-theme__card-main"
        disabled={disabled}
        onClick={onPick}
        aria-pressed={selected}
      >
        <span className="builder-site-theme__swatch-row" aria-hidden>
          <span className="builder-site-theme__swatch" style={{ background: pack.primaryColor }} />
          <span className="builder-site-theme__swatch" style={{ background: pack.secondaryColor }} />
          <span className="builder-site-theme__swatch builder-site-theme__swatch--accent" style={{ background: pack.accentColor }} />
        </span>
        <span className="builder-site-theme__card-label">{pack.labelHe}</span>
        <span className="builder-site-theme__card-mood">{pack.moodHe}</span>
      </button>
      {selected ? (
        <button type="button" className="builder-site-theme__card-apply-colors" disabled={disabled} onClick={onApplyBranding}>
          החל צבעי הערכה על האתר
        </button>
      ) : null}
    </div>
  );
}

type AccentTopMode = 'follow-pack' | 'off' | 'preset' | 'derived';

function topModeFromStrategy(s: NormalizedThemeAccentStrategy | null): AccentTopMode {
  if (s == null) return 'follow-pack';
  if (s.mode === 'none') return 'off';
  if (s.mode === 'preset') return 'preset';
  return 'derived';
}

export default function BuilderSiteThemePanel(p: BuilderSiteThemePanelProps) {
  const activePack = p.siteThemePackKey.trim() ? getThemeBrandPresetByKey(p.siteThemePackKey.trim()) : null;
  const topMode = topModeFromStrategy(p.themeAccentStrategy);
  const packKeyNorm = p.siteThemePackKey.trim() || null;
  const primaryNorm = normalizeAccentBaseColor(p.primaryColor.trim()) ?? null;
  const snapMatchesPack =
    p.appliedThemeSnapshot != null && isAppliedSnapshotActiveForPack(p.appliedThemeSnapshot, packKeyNorm);
  const canUpgradeSnapshot =
    snapMatchesPack &&
    activePack != null &&
    p.appliedThemeSnapshot != null &&
    activePack.packVersion > p.appliedThemeSnapshot.packVersion;
  const snapshotMissingButPackSelected = Boolean(packKeyNorm && activePack && !snapMatchesPack);
  const effectiveAccent = getEffectiveThemeAccentStrategy({
    siteThemePackKey: packKeyNorm,
    themeAccentStrategy: p.themeAccentStrategy,
    primaryColor: primaryNorm,
    appliedThemeSnapshot: snapMatchesPack ? p.appliedThemeSnapshot : null,
  });

  const patchStrategy = (patch: Partial<NormalizedThemeAccentStrategy>) => {
    const base: NormalizedThemeAccentStrategy = p.themeAccentStrategy ?? {
      mode: 'preset',
      presetKey: 'ocean',
      baseColor: primaryNorm,
      targetSections: 'all',
      intensity: 'balanced',
    };
    p.onThemeAccentStrategyChange({ ...base, ...patch });
  };

  const onTopMode = (mode: AccentTopMode) => {
    if (mode === 'follow-pack') {
      p.onThemeAccentStrategyChange(null);
      return;
    }
    if (mode === 'off') {
      p.onThemeAccentStrategyChange({ ...THEME_ACCENT_STRATEGY_NONE });
      return;
    }
    if (mode === 'preset') {
      const pk = p.themeAccentStrategy?.presetKey?.trim() || 'ocean';
      p.onThemeAccentStrategyChange({
        mode: 'preset',
        presetKey: pk,
        baseColor: null,
        targetSections: p.themeAccentStrategy?.targetSections ?? 'all',
        intensity: p.themeAccentStrategy?.intensity ?? 'balanced',
      });
      return;
    }
    p.onThemeAccentStrategyChange({
      mode: 'derived',
      presetKey: null,
      baseColor: p.themeAccentStrategy?.baseColor ?? primaryNorm,
      targetSections: p.themeAccentStrategy?.targetSections ?? 'all',
      intensity: p.themeAccentStrategy?.intensity ?? 'balanced',
    });
  };

  return (
    <section className="builder-site-theme" aria-label="ערכת עיצוב גלובלית">
      <h4 className="builder-site-theme__title">כיוון עיצוב ומיתוג</h4>
      <p className="builder-site-theme__intro">
        בחירה מהירה של צבעים וטון כללי. סקשנים בודדים עדיין ניתנים להתאמה — או לקישור חזרה לברירות הערכה.
      </p>

      <div className="builder-site-theme__current-colors" aria-label="צבעי מיתוג נוכחיים">
        <span className="builder-site-theme__current-label">צבע ראשי</span>
        <span className="builder-site-theme__mini-swatch" style={{ background: p.primaryColor.trim() || '#e2e8f0' }} title={p.primaryColor} />
        <span className="builder-site-theme__current-label">משני</span>
        <span className="builder-site-theme__mini-swatch" style={{ background: p.secondaryColor.trim() || '#e2e8f0' }} title={p.secondaryColor} />
        <span className="builder-site-theme__current-label">הדגשה</span>
        <span className="builder-site-theme__mini-swatch" style={{ background: p.accentColor.trim() || '#e2e8f0' }} title={p.accentColor} />
      </div>

      {activePack ? (
        <p className="builder-site-theme__active-pack">
          ערכה פעילה: <strong>{activePack.labelHe}</strong>
          {snapMatchesPack ? (
            <span className="builder-site-theme__freeze-pill" title="המראה נשמר לפי גרסת החבילה שבה החלתם צבעים">
              {' '}
              נעול לגרסה {p.appliedThemeSnapshot?.packVersion ?? '—'}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="builder-site-theme__active-pack builder-site-theme__active-pack--muted">לא נבחרה ערכת מותג שמורה — מצב ידני או היסטורי.</p>
      )}
      {snapshotMissingButPackSelected ? (
        <p className="builder-site-theme__freeze-hint">
          טיפ: לחצו «החל צבעי הערכה על האתר» כדי לנעול את ערכת הצבעים והברירות — כך שינויים עתידיים ברישום הגלובלי לא ישנו את האתר בלי אישור.
        </p>
      ) : null}
      {canUpgradeSnapshot && p.onUpgradeAppliedThemeFromLivePack ? (
        <div className="builder-site-theme__upgrade-row">
          <p className="builder-site-theme__upgrade-text">קיימת גרסת ערכה חדישה יותר ברישום. לעדכן את הנעילה בכוונה בלבד.</p>
          <button
            type="button"
            className="builder-site-theme__btn builder-site-theme__btn--secondary"
            disabled={p.formBusy}
            onClick={p.onUpgradeAppliedThemeFromLivePack}
          >
            עדכן נעילה לגרסה העדכנית
          </button>
        </div>
      ) : null}

      <div className="builder-site-theme__grid" role="list">
        {THEME_BRAND_PRESETS.map((pack) => (
          <div key={pack.key} role="listitem">
            <PackCard
              pack={pack}
              selected={p.siteThemePackKey.trim() === pack.key}
              disabled={p.formBusy}
              onPick={() => p.onSelectPack(pack)}
              onApplyBranding={() => p.onApplyThemeBranding(pack)}
            />
          </div>
        ))}
      </div>

      <div className="builder-site-theme__accent" aria-label="הנחיית גוון לסקשנים">
        <h5 className="builder-site-theme__accent-title">גוון מוביל לסקשנים (דרך ערכת האתר)</h5>
        <p className="builder-site-theme__accent-intro">
          מגדירים את שפת הצבע של גוון ה-Hive לסקשנים שמקושרים לערכה — בלי לבחור צבע ידני בכל סקשן. סקשן עם גוון מקומי תמיד מנצח.
        </p>
        {topMode === 'follow-pack' ? (
          <p className="builder-site-theme__accent-hint">
            {effectiveAccent.mode === 'none'
              ? 'תצוגה כרגע: ללא הנחיית גוון גלובלית (כמו ברירת המחדל ההיסטורית).'
              : `תצוגה כרגע לפי ברירת המחדל של החבילה${activePack ? ` (${activePack.labelHe})` : ''}.`}
          </p>
        ) : null}

        <div className="builder-site-theme__chip-row" role="group" aria-label="מצב הנחיית גוון">
          {(
            [
              { id: 'follow-pack' as const, label: 'לפי החבילה' },
              { id: 'off' as const, label: 'ללא' },
              { id: 'preset' as const, label: 'מתוך ערכת צבע' },
              { id: 'derived' as const, label: 'גוון מותג נגזר' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`builder-site-theme__chip${topMode === opt.id ? ' builder-site-theme__chip--selected' : ''}`}
              disabled={p.formBusy}
              onClick={() => onTopMode(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {topMode === 'preset' ? (
          <>
            <div className="builder-site-theme__field-label">ערכת צבע מובנית</div>
            <div className="builder-site-theme__chip-row builder-site-theme__chip-row--wrap" role="radiogroup" aria-label="ערכת צבע להנחיה">
              {PRESET_LIST.map((pr) => {
                const selected = p.themeAccentStrategy?.presetKey === pr.key;
                return (
                  <button
                    key={pr.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`builder-site-theme__chip builder-site-theme__chip--preset${selected ? ' builder-site-theme__chip--selected' : ''}`}
                    disabled={p.formBusy}
                    onClick={() => patchStrategy({ mode: 'preset', presetKey: pr.key, baseColor: null })}
                  >
                    <span
                      className="builder-site-theme__preset-dot"
                      style={{ background: pr.baseColor }}
                      aria-hidden
                    />
                    {pr.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {topMode === 'derived' ? (
          <label className="builder-site-theme__derived">
            <span className="builder-site-theme__field-label">צבע בסיס לגזירה</span>
            <span className="builder-site-theme__derived-row">
              <input
                type="color"
                value={normalizeAccentBaseColor(p.themeAccentStrategy?.baseColor ?? p.primaryColor) ?? '#0ea5e9'}
                disabled={p.formBusy}
                onChange={(e) => patchStrategy({ mode: 'derived', baseColor: e.target.value, presetKey: null })}
                aria-label="בחירת צבע בסיס"
              />
              <span
                className="builder-site-theme__mini-swatch builder-site-theme__mini-swatch--lg"
                style={{
                  background:
                    normalizeAccentBaseColor(p.themeAccentStrategy?.baseColor ?? p.primaryColor) ?? '#e2e8f0',
                }}
              />
            </span>
            <span className="builder-site-theme__derived-hint">ריק משמעותית: נופל לצבע הראשי של האתר אם קיים.</span>
          </label>
        ) : null}

        {topMode === 'preset' || topMode === 'derived' ? (
          <>
            <div className="builder-site-theme__field-label">עוצמה</div>
            <div className="builder-site-theme__chip-row" role="radiogroup" aria-label="עוצמת גוון">
              {(
                [
                  { id: 'soft' as const, label: 'עדין' },
                  { id: 'balanced' as const, label: 'מאוזן' },
                  { id: 'strong' as const, label: 'מודגש' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={(p.themeAccentStrategy?.intensity ?? 'balanced') === opt.id}
                  className={`builder-site-theme__chip${(p.themeAccentStrategy?.intensity ?? 'balanced') === opt.id ? ' builder-site-theme__chip--selected' : ''}`}
                  disabled={p.formBusy}
                  onClick={() => patchStrategy({ intensity: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="builder-site-theme__field-label">היקף סקשנים</div>
            <div className="builder-site-theme__chip-row builder-site-theme__chip-row--wrap" role="radiogroup" aria-label="היקף סקשנים">
              {(
                [
                  { id: 'all' as const, label: 'כל הסקשנים' },
                  { id: 'contentOnly' as const, label: 'סקשני תוכן' },
                  { id: 'cardsOnly' as const, label: 'סקשני כרטיסים' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={(p.themeAccentStrategy?.targetSections ?? 'all') === opt.id}
                  className={`builder-site-theme__chip${(p.themeAccentStrategy?.targetSections ?? 'all') === opt.id ? ' builder-site-theme__chip--selected' : ''}`}
                  disabled={p.formBusy}
                  onClick={() => patchStrategy({ targetSections: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="builder-site-theme__actions">
        <button type="button" className="builder-site-theme__btn builder-site-theme__btn--secondary" disabled={p.formBusy} onClick={p.onClearPack}>
          נקה בחירת ערכה (הצבעים נשארים)
        </button>
        <button
          type="button"
          className="builder-site-theme__btn builder-site-theme__btn--primary"
          disabled={p.formBusy || !p.siteThemePackKey.trim()}
          onClick={p.onForceApplyThemeToSections}
        >
          קשר סגנון + גוון לכל הסקשנים
        </button>
        <button
          type="button"
          className="builder-site-theme__btn builder-site-theme__btn--secondary"
          disabled={p.formBusy || !p.siteThemePackKey.trim()}
          onClick={p.onForceApplyThemeStyleToSections}
        >
          קשר סגנון בלבד
        </button>
        <button
          type="button"
          className="builder-site-theme__btn builder-site-theme__btn--secondary"
          disabled={p.formBusy || !p.siteThemePackKey.trim()}
          onClick={p.onForceApplyThemeAccentToSections}
        >
          קשר גוון בלבד
        </button>
        <button
          type="button"
          className="builder-site-theme__btn builder-site-theme__btn--ghost"
          disabled={p.formBusy}
          onClick={p.onClearSectionInheritance}
        >
          נקה קישור סקשנים לערכה
        </button>
      </div>
      <p className="builder-site-theme__fineprint">
        «החל צבעי הערכה» שומר צבעים, מפתח ערכה ונועל את גרסת החבילה. ניתן לקשר סגנון (רקע, ריווח, כרטיסים) וגוון Hive בנפרד לכל סקשן — Hero לא נכלל.
      </p>
    </section>
  );
}
