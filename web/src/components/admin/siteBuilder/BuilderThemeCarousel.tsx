import { useMemo } from 'react';
import {
  THEME_CAROUSEL_PRESETS,
  type ThemeCarouselPresetEntry,
} from '../../../tenant/themeCarouselApply';
import { getThemeBrandPresetByKey, type ThemeBrandPreset } from '../../../tenant/themeBrandPresets';
import './BuilderThemeCarousel.css';

export type BuilderThemeCarouselProps = {
  disabled: boolean;
  applyBusy: boolean;
  hoverPackKey: string | null;
  selectedPackKey: string | null;
  onHoverPackKey: (key: string | null) => void;
  onSelectPackKey: (key: string | null) => void;
  onApply: () => void;
  onUndo: () => void;
  canUndo: boolean;
};

type Row = { entry: ThemeCarouselPresetEntry; pack: ThemeBrandPreset };

export default function BuilderThemeCarousel(p: BuilderThemeCarouselProps) {
  const rows = useMemo((): Row[] => {
    const out: Row[] = [];
    for (const entry of THEME_CAROUSEL_PRESETS) {
      const pack = getThemeBrandPresetByKey(entry.packKey);
      if (pack) out.push({ entry, pack });
    }
    return out;
  }, []);

  const effectivePreviewKey = p.hoverPackKey ?? p.selectedPackKey;
  const applyPackKey = p.selectedPackKey?.trim() || '';

  return (
    <div className="builder-theme-carousel">
      <h4 className="builder-theme-carousel__title">ערכות נושא (קרוסלה)</h4>
      <p className="builder-theme-carousel__intro">
        מעבר על כרטיסיה מציג תצוגה זמנית. בחירה ו־&quot;החל נושא&quot; שומרת דרך ייבוא מאובטח (Firestore בלבד — בלי עדכון טיוטה
        ידני).
      </p>
      <div className="builder-theme-carousel__track" role="list">
        {rows.map(({ pack }) => {
          const isSelected = p.selectedPackKey === pack.key;
          const isPreview = effectivePreviewKey === pack.key;
          return (
            <div key={pack.key} className="builder-theme-carousel__cell" role="listitem">
              <button
                type="button"
                className={`builder-theme-carousel__card${isSelected ? ' builder-theme-carousel__card--selected' : ''}${
                  isPreview ? ' builder-theme-carousel__card--preview' : ''
                }`}
                disabled={p.disabled}
                onMouseEnter={() => p.onHoverPackKey(pack.key)}
                onMouseLeave={() => p.onHoverPackKey(null)}
                onFocus={() => p.onHoverPackKey(pack.key)}
                onBlur={() => p.onHoverPackKey(null)}
                onClick={() => p.onSelectPackKey(isSelected ? null : pack.key)}
                aria-pressed={isSelected}
              >
                <span className="builder-theme-carousel__swatches" aria-hidden>
                  <span className="builder-theme-carousel__swatch" style={{ background: pack.primaryColor }} />
                  <span className="builder-theme-carousel__swatch" style={{ background: pack.secondaryColor }} />
                  <span
                    className="builder-theme-carousel__swatch builder-theme-carousel__swatch--accent"
                    style={{ background: pack.accentColor }}
                  />
                </span>
                <span className="builder-theme-carousel__label">{pack.labelHe}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="builder-theme-carousel__actions">
        <button
          type="button"
          className="builder-theme-carousel__apply"
          disabled={p.disabled || p.applyBusy || !applyPackKey}
          onClick={() => p.onApply()}
        >
          {p.applyBusy ? 'שומר…' : 'החל נושא'}
        </button>
        <button
          type="button"
          className="builder-theme-carousel__undo"
          disabled={p.disabled || p.applyBusy || !p.canUndo}
          onClick={() => p.onUndo()}
        >
          בטל נושא אחרון
        </button>
      </div>
    </div>
  );
}
