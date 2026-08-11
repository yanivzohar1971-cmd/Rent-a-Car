import { useEffect, useMemo, useRef, useState } from 'react';
import './AccessibilityMenu.css';

type FontScale = 'normal' | 'large' | 'larger';
type ContrastMode = 'normal' | 'high' | 'dark';
type LinksMode = 'normal' | 'highlight';
type AnimationsMode = 'normal' | 'paused';

type AccessibilitySettings = {
  fontScale: FontScale;
  contrast: ContrastMode;
  links: LinksMode;
  animations: AnimationsMode;
  readableFont: boolean;
};

const STORAGE_KEY = 'accessibilitySettings';

const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontScale: 'normal',
  contrast: 'normal',
  links: 'normal',
  animations: 'normal',
  readableFont: false,
};

function coerceSettings(raw: unknown): AccessibilitySettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  const rec = raw as Record<string, unknown>;
  const fontScale = rec.fontScale === 'large' || rec.fontScale === 'larger' ? rec.fontScale : 'normal';
  const contrast = rec.contrast === 'high' || rec.contrast === 'dark' ? rec.contrast : 'normal';
  const links = rec.links === 'highlight' ? 'highlight' : 'normal';
  const animations = rec.animations === 'paused' ? 'paused' : 'normal';
  const readableFont = rec.readableFont === true;
  return { fontScale, contrast, links, animations, readableFont };
}

function loadSettings(): AccessibilitySettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return coerceSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applySettingsToRoot(settings: AccessibilitySettings): void {
  const root = document.documentElement;
  root.setAttribute('data-font-scale', settings.fontScale);
  root.setAttribute('data-contrast', settings.contrast);
  root.setAttribute('data-links', settings.links);
  root.setAttribute('data-animations', settings.animations);
  root.setAttribute('data-readable-font', settings.readableFont ? 'on' : 'off');
}

function persistSettings(settings: AccessibilitySettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}

function nextFontScale(current: FontScale, direction: 'up' | 'down'): FontScale {
  const order: FontScale[] = ['normal', 'large', 'larger'];
  const idx = order.indexOf(current);
  if (direction === 'up') return order[Math.min(order.length - 1, idx + 1)];
  return order[Math.max(0, idx - 1)];
}

export default function AccessibilityMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(() => loadSettings());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    applySettingsToRoot(settings);
    persistSettings(settings);
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        toggleButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!isOpen) return;
      const panel = panelRef.current;
      const toggleButton = toggleButtonRef.current;
      const target = event.target as Node | null;
      if (!panel || !target) return;
      if (panel.contains(target)) return;
      if (toggleButton?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const fontScaleLabel = useMemo(() => {
    if (settings.fontScale === 'larger') return 'גדול מאוד';
    if (settings.fontScale === 'large') return 'גדול';
    return 'רגיל';
  }, [settings.fontScale]);

  return (
    <div
      className="global-accessibility-menu"
      dir="rtl"
      data-accessibility-readable-font={settings.readableFont ? 'on' : 'off'}
    >
      <button
        ref={toggleButtonRef}
        type="button"
        className="global-accessibility-toggle"
        aria-expanded={isOpen}
        aria-controls="global-accessibility-panel"
        aria-label="פתח תפריט נגישות"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        נגישות
      </button>

      {isOpen ? (
        <div
          id="global-accessibility-panel"
          ref={panelRef}
          className="global-accessibility-panel"
          role="dialog"
          aria-label="תפריט נגישות"
        >
          <h3 className="global-accessibility-title">הגדרות נגישות</h3>

          <div className="global-accessibility-grid">
            <button type="button" onClick={() => setSettings((s) => ({ ...s, fontScale: nextFontScale(s.fontScale, 'up') }))}>
              הגדלת טקסט
            </button>
            <button type="button" onClick={() => setSettings((s) => ({ ...s, fontScale: nextFontScale(s.fontScale, 'down') }))}>
              הקטנת טקסט
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, contrast: s.contrast === 'high' ? 'normal' : 'high' }))}
            >
              ניגודיות גבוהה
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, contrast: s.contrast === 'dark' ? 'normal' : 'dark' }))}
            >
              מצב כהה
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, links: s.links === 'highlight' ? 'normal' : 'highlight' }))}
            >
              הדגשת קישורים
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, readableFont: !s.readableFont }))}
            >
              פונט קריא
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => ({ ...s, animations: s.animations === 'paused' ? 'normal' : 'paused' }))}
            >
              עצירת אנימציות
            </button>
            <button type="button" className="reset" onClick={() => setSettings(DEFAULT_SETTINGS)}>
              איפוס
            </button>
          </div>

          <p className="global-accessibility-state">גודל טקסט: {fontScaleLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
