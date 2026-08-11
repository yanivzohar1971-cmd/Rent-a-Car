import { forwardRef, useState, type ReactNode } from 'react';
import './BuilderCanvas.css';

export type BuilderCanvasViewport = 'desktop' | 'tablet' | 'mobile';

export type BuilderCanvasProps = {
  children: ReactNode;
  viewportMode?: BuilderCanvasViewport;
  onViewportModeChange?: (next: BuilderCanvasViewport) => void;
};

const BuilderCanvas = forwardRef<HTMLDivElement, BuilderCanvasProps>(function BuilderCanvas(
  { children, viewportMode: controlledViewportMode, onViewportModeChange },
  ref,
) {
  const [uncontrolledViewportMode, setUncontrolledViewportMode] = useState<BuilderCanvasViewport>('desktop');
  const viewportMode = controlledViewportMode ?? uncontrolledViewportMode;
  const setViewportMode = (next: BuilderCanvasViewport) => {
    if (controlledViewportMode === undefined) {
      setUncontrolledViewportMode(next);
    }
    onViewportModeChange?.(next);
  };
  return (
    <section className="builder-canvas" aria-label="תצוגת בנייה חיה">
      <div className="builder-canvas__header">
        <div className="builder-canvas__header-row">
          <h3 className="builder-canvas__title">תצוגה חיה</h3>
          <div className="builder-canvas__viewport-toggle" role="group" aria-label="רוחב תצוגת קנבס">
            <span className="builder-canvas__viewport-label">רוחב:</span>
            {(
              [
                { id: 'desktop' as const, label: 'מחשב' },
                { id: 'tablet' as const, label: 'טאבלט' },
                { id: 'mobile' as const, label: 'נייד' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`builder-canvas__viewport-btn${viewportMode === id ? ' builder-canvas__viewport-btn--active' : ''}`}
                onClick={() => setViewportMode(id)}
                aria-pressed={viewportMode === id}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="builder-canvas__hint">
          ערכו ישירות מהקנבס: מעבר עכבר מדגיש בלוק, לחיצה בוחרת, כפתורי הכרום מסתירים סקשן או פותחים עריכה. גררו את ידית הגרירה (⣿) בשורת הכרום או בפאנל המבנה לסידור סקשנים; פס יעד בין בלוקים מראה היכן יושב הסקשן. השינויים בטיוטה — שמירה ל-Firestore נפרדת.
        </p>
      </div>
      <div className="builder-canvas__frame" ref={ref}>
        <div
          className={`builder-canvas__frame-inner builder-preview--${viewportMode}`}
        >
          {children}
        </div>
      </div>
    </section>
  );
});

export default BuilderCanvas;
