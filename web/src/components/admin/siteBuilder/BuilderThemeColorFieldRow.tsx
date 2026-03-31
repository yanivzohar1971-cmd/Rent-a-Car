import { useEffect, useId, useRef } from 'react';
import { validateColorInput } from '../../../tenant/tenantSiteConfig';
import './BuilderThemeColorFieldRow.css';

const PICKER_FALLBACK_HEX = '#94a3b8';
const SWATCH_EMPTY_BG = '#e8eaef';

/** `#rgb` / `#rrggbb` → lowercase `#rrggbb` for `input[type=color]`. Otherwise null. */
function toOpaquePickerHex(raw: string): string | null {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.slice(0, 7).toLowerCase();
  return null;
}

function pickerDisplayValue(textValue: string): string {
  return toOpaquePickerHex(textValue) ?? PICKER_FALLBACK_HEX;
}

function swatchBackground(textValue: string): string {
  const t = textValue.trim();
  if (!t) return SWATCH_EMPTY_BG;
  const validated = validateColorInput(t);
  if (validated.ok) return validated.value;
  const hex = toOpaquePickerHex(t);
  if (hex) return hex;
  return SWATCH_EMPTY_BG;
}

export type BuilderThemeColorFieldRowProps = {
  /** Stable id for focus/active tracking (e.g. `primary`, `accent`). */
  fieldId: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  activeFieldId: string | null;
  onActiveFieldChange: (id: string | null) => void;
};

export default function BuilderThemeColorFieldRow(p: BuilderThemeColorFieldRowProps) {
  const textId = useId();
  const errorId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const lastValidPickerHexRef = useRef<string>(pickerDisplayValue(p.value));
  const isActive = !p.disabled && p.activeFieldId === p.fieldId;
  const rowClass =
    'builder-theme-color-row' + (isActive ? ' builder-theme-color-row--active' : '');
  const swatchClass =
    'builder-theme-color-row__swatch' +
    (isActive ? ' builder-theme-color-row__swatch--active' : '');
  const trimmedValue = p.value.trim();
  const hasValue = trimmedValue.length > 0;
  const isValid = !hasValue || validateColorInput(trimmedValue).ok;
  const validPickerHex = toOpaquePickerHex(trimmedValue);

  useEffect(() => {
    if (validPickerHex) {
      lastValidPickerHexRef.current = validPickerHex;
    }
  }, [validPickerHex]);

  const pickerValue = validPickerHex ?? lastValidPickerHexRef.current;
  const swatchBg = isValid ? swatchBackground(p.value) : lastValidPickerHexRef.current;

  const openPicker = () => {
    if (p.disabled) return;
    p.onActiveFieldChange(p.fieldId);
    pickerRef.current?.click();
  };

  return (
    <div
      className={rowClass}
      onFocusCapture={() => {
        if (!p.disabled) p.onActiveFieldChange(p.fieldId);
      }}
      onBlurCapture={(e) => {
        const rt = e.relatedTarget;
        if (rt instanceof Node && (e.currentTarget as HTMLElement).contains(rt)) return;
        p.onActiveFieldChange(null);
      }}
    >
      <label className="builder-theme-color-row__label" htmlFor={textId}>
        {p.label}
      </label>
      <div className="builder-theme-color-row__controls">
        <input
          id={textId}
          className={`builder-theme-color-row__text${!isValid ? ' builder-theme-color-row__text--invalid' : ''}`}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          dir="ltr"
          placeholder={p.placeholder}
          disabled={p.disabled}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!isValid}
          aria-describedby={!isValid ? errorId : undefined}
        />
        <button
          type="button"
          className={swatchClass}
          style={{ background: swatchBg }}
          onClick={openPicker}
          disabled={p.disabled}
          title={`תצוגת צבע — ${p.label}`}
          aria-label={`פתיחת בוחר צבע עבור ${p.label}`}
        />
        <input
          ref={pickerRef}
          type="color"
          className="builder-theme-color-row__picker"
          value={pickerValue}
          disabled={p.disabled}
          onChange={(e) => p.onChange(e.target.value)}
          aria-label={`בחירת צבע — ${p.label}`}
        />
      </div>
      {!isValid ? (
        <p id={errorId} className="builder-theme-color-row__error" role="status">
          הזינו ערך hex תקין (למשל #0ea5e9)
        </p>
      ) : null}
    </div>
  );
}
