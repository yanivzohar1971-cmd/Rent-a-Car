import type { Dispatch, SetStateAction } from 'react';
import type { TenantHomeSectionKey } from '../../../tenant/tenantSiteConfig';
import { TENANT_HOME_SECTION_LABELS_HE } from '../../../tenant/tenantSiteConfig';
import './BuilderStructurePanel.css';

/** `null` = global site / branding inspector */
export type BuilderSelectedSection = TenantHomeSectionKey | null;

export type BuilderSelectSectionOptions = {
  scrollCanvas?: boolean;
};

export type BuilderStructurePanelProps = {
  sectionOrder: TenantHomeSectionKey[];
  selectedSection: BuilderSelectedSection;
  onSelectSection: (key: BuilderSelectedSection, options?: BuilderSelectSectionOptions) => void;
  getSummary: (key: TenantHomeSectionKey) => string;
  isSectionVisible: (key: TenantHomeSectionKey) => boolean;
  formBusy: boolean;
  dragSectionIndex: number | null;
  setDragSectionIndex: (i: number | null) => void;
  sectionDropTargetIndex: number | null;
  setSectionDropTargetIndex: Dispatch<SetStateAction<number | null>>;
  onSectionDropAt: (targetIndex: number) => void;
  onResetSectionOrder?: () => void;
};

export default function BuilderStructurePanel({
  sectionOrder,
  selectedSection,
  onSelectSection,
  getSummary,
  isSectionVisible,
  formBusy,
  dragSectionIndex,
  setDragSectionIndex,
  sectionDropTargetIndex,
  setSectionDropTargetIndex,
  onSectionDropAt,
  onResetSectionOrder,
}: BuilderStructurePanelProps) {
  return (
    <aside className="builder-structure-panel" aria-label="מבנה דף הבית">
      <h3 className="builder-structure-panel__title">מבנה העמוד ({sectionOrder.length} סקשנים)</h3>
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
          return (
            <li
              key={key}
              className={`builder-structure-card${selected ? ' builder-structure-card--selected' : ''}${
                dragSectionIndex === index ? ' builder-structure-card--dragging' : ''
              }${showDrop ? ' builder-structure-card--drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragSectionIndex !== null) setSectionDropTargetIndex(index);
              }}
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
