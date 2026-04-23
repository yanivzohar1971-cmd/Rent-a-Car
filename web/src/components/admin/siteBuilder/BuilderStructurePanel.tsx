import type { Dispatch, SetStateAction } from 'react';
import {
  TENANT_HOME_SECTION_LABELS_HE,
  TENANT_SECTION_STYLE_CAPABILITIES,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from '../../../tenant/tenantSiteConfig';
import { SECTION_THEME_PRESET_LIST } from '../../../tenant/sectionThemePresets';
import './BuilderStructurePanel.css';

/** `null` = global site / branding inspector */
export type BuilderSelectedSection = TenantHomeSectionKey | null;

export type BuilderSelectSectionOptions = {
  scrollCanvas?: boolean;
};

function sectionSupportsThemePicker(key: TenantHomeSectionKey): boolean {
  if (key === 'hero') return false;
  return Object.values(TENANT_SECTION_STYLE_CAPABILITIES[key]).some(Boolean);
}

export type BuilderStructurePanelProps = {
  sectionOrder: TenantHomeSectionKey[];
  selectedSection: BuilderSelectedSection;
  onSelectSection: (key: BuilderSelectedSection, options?: BuilderSelectSectionOptions) => void;
  getSummary: (key: TenantHomeSectionKey) => string;
  isSectionVisible: (key: TenantHomeSectionKey) => boolean;
  /** When a section is hidden (feature flag off), restores visibility and preview. */
  onRestoreSectionVisibility?: (key: TenantHomeSectionKey) => void;
  formBusy: boolean;
  dragSectionIndex: number | null;
  setDragSectionIndex: (i: number | null) => void;
  sectionDropTargetIndex: number | null;
  setSectionDropTargetIndex: Dispatch<SetStateAction<number | null>>;
  onSectionDropAt: (targetIndex: number) => void;
  onResetSectionOrder?: () => void;
  /** Page-wide default section theme preset (empty string = none). */
  defaultSectionThemePresetId: string;
  onDefaultSectionThemePresetChange: (id: string) => void;
  sectionStyles: Record<TenantHomeSectionKey, TenantSectionStyle>;
  onSectionThemePresetChange: (key: TenantHomeSectionKey, id: string | null) => void;
  onApplySectionThemePresetToAll: () => void;
};

export default function BuilderStructurePanel({
  sectionOrder,
  selectedSection,
  onSelectSection,
  getSummary,
  isSectionVisible,
  onRestoreSectionVisibility,
  formBusy,
  dragSectionIndex,
  setDragSectionIndex,
  sectionDropTargetIndex,
  setSectionDropTargetIndex,
  onSectionDropAt,
  onResetSectionOrder,
  defaultSectionThemePresetId,
  onDefaultSectionThemePresetChange,
  sectionStyles,
  onSectionThemePresetChange,
  onApplySectionThemePresetToAll,
}: BuilderStructurePanelProps) {
  const pagePresetTrim = defaultSectionThemePresetId.trim();
  const canApplyAll = !!pagePresetTrim;

  return (
    <aside className="builder-structure-panel" aria-label="מבנה דף הבית">
      <h3 className="builder-structure-panel__title">מבנה העמוד ({sectionOrder.length} סקשנים)</h3>
      <div className="builder-structure-panel__theme-toolbar">
        <span className="builder-structure-panel__theme-toolbar-label">ערכת מראה ברירת מחדל לסקשנים</span>
        <select
          value={pagePresetTrim}
          disabled={formBusy}
          aria-label="ערכת מראה ברירת מחדל לעמוד"
          onChange={(e) => onDefaultSectionThemePresetChange(e.target.value)}
        >
          <option value="">ללא (עריכה מתקדמת בלבד)</option>
          {SECTION_THEME_PRESET_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="builder-structure-panel__theme-apply-all"
          disabled={formBusy || !canApplyAll}
          onClick={() => onApplySectionThemePresetToAll()}
        >
          החל ערכה זו על כל הסקשנים
        </button>
      </div>
      <button
        type="button"
        className={`builder-structure-panel__global-btn${selectedSection === null ? ' builder-structure-panel__global-btn--active' : ''}`}
        onClick={() => onSelectSection(null)}
        aria-current={selectedSection === null ? 'true' : undefined}
      >
        הגדרות אתר ומיתוג
      </button>
      <ul className="builder-structure-panel__list">
        {sectionOrder.map((key, index) => {
          const visible = isSectionVisible(key);
          const selected = selectedSection === key;
          const showDrop = dragSectionIndex !== null && sectionDropTargetIndex === index;
          const setTargetFromEvent = (e: React.DragEvent) => {
            if (formBusy || dragSectionIndex === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setSectionDropTargetIndex(index);
          };
          const showSectionTheme = sectionSupportsThemePicker(key);
          const st = sectionStyles[key];
          const inheritVal = st?.sectionThemePresetId ?? '';

          return (
            <li
              key={key}
              className={`builder-structure-card${selected ? ' builder-structure-card--selected' : ''}${
                dragSectionIndex === index ? ' builder-structure-card--dragging' : ''
              }${showDrop ? ' builder-structure-card--drop-target' : ''}`}
              onDragEnter={setTargetFromEvent}
              onDragOver={setTargetFromEvent}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setSectionDropTargetIndex((t) => (t === index ? null : t));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setSectionDropTargetIndex(null);
                onSectionDropAt(index);
              }}
            >
              <div className="builder-structure-card__main">
                <button
                  type="button"
                  className="builder-structure-card__drag"
                  draggable={!formBusy}
                  aria-label={`גרירה לשינוי סדר — ${TENANT_HOME_SECTION_LABELS_HE[key]}`}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    if (!formBusy) setDragSectionIndex(index);
                  }}
                  onDragEnd={() => {
                    setDragSectionIndex(null);
                    setSectionDropTargetIndex(null);
                  }}
                >
                  ⣿
                </button>
                <div
                  role="button"
                  tabIndex={0}
                  className="builder-structure-card__body"
                  aria-pressed={selected}
                  onClick={() => onSelectSection(key, { scrollCanvas: true })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSection(key, { scrollCanvas: true });
                    }
                  }}
                >
                  <div className="builder-structure-card__label-row">
                    <span className="builder-structure-card__label">{TENANT_HOME_SECTION_LABELS_HE[key]}</span>
                    <span className={`builder-structure-card__pill${visible ? ' builder-structure-card__pill--on' : ' builder-structure-card__pill--off'}`}>
                      {visible ? 'מוצג' : 'מוסתר'}
                    </span>
                  </div>
                  <p className="builder-structure-card__summary">{getSummary(key)}</p>
                  <p className="builder-structure-card__key">{key}</p>
                  {showSectionTheme ? (
                    <div
                      className="builder-structure-panel__section-theme"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <span className="builder-structure-panel__section-theme-label">ערכת מראה</span>
                      <select
                        value={inheritVal}
                        disabled={formBusy}
                        aria-label={`ערכת מראה — ${TENANT_HOME_SECTION_LABELS_HE[key]}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          onSectionThemePresetChange(key, v.trim() ? v.trim() : null);
                        }}
                      >
                        <option value="">יורש מהעמוד</option>
                        {SECTION_THEME_PRESET_LIST.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {!visible && onRestoreSectionVisibility && key !== 'hero' ? (
                    <button
                      type="button"
                      className="builder-structure-card__unhide"
                      disabled={formBusy}
                      title="בטל הסתרה — הסקשן יופיע שוב בתצוגה ובאתר"
                      aria-label={`הצג שוב — ${TENANT_HOME_SECTION_LABELS_HE[key]}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestoreSectionVisibility(key);
                      }}
                    >
                      הצג שוב
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {onResetSectionOrder ? (
        <button
          type="button"
          className="builder-structure-panel__global-btn"
          disabled={formBusy}
          onClick={onResetSectionOrder}
          aria-label="איפוס סדר כל הסקשנים לברירת המחדל של המערכת"
        >
          איפוס סדר סקשנים לברירת מחדל
        </button>
      ) : null}
    </aside>
  );
}
