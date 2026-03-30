import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import './TenantMediaField.css';

export type TenantMediaSourceMode = 'custom' | 'fallback' | 'empty';

export type TenantMediaFieldProps = {
  label: string;
  description?: string;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  onPickFiles: (files: FileList | null) => void | Promise<void>;
  uploading: boolean;
  disabled?: boolean;
  inputId?: string;
  /** Extra row actions: e.g. "השתמש בלוגו החצר" */
  extraActions?: ReactNode;
  accept?: string;
  /** Resolved image for preview when falling back (e.g. yard logo). */
  previewUrl?: string;
  /** Visual distinction: custom upload vs fallback vs nothing. */
  sourceMode?: TenantMediaSourceMode;
  /** Optional slot under actions (e.g. focal point placeholder). */
  belowActions?: ReactNode;
};

const SOURCE_LABELS: Record<TenantMediaSourceMode, string> = {
  custom: 'תמונה מותאמת אישית',
  fallback: 'משתמש בלוגו החצר (ברירת מחדל)',
  empty: 'אין תמונה מותאמת — גררו, לחצו להעלאה או הזינו URL',
};

export default function TenantMediaField({
  label,
  description,
  currentUrl,
  onUrlChange,
  onPickFiles,
  uploading,
  disabled = false,
  inputId: inputIdProp,
  extraActions,
  accept = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml',
  previewUrl: previewUrlProp,
  sourceMode: sourceModeProp,
  belowActions,
}: TenantMediaFieldProps) {
  const autoId = useId();
  const inputId = inputIdProp ?? `tmf-${autoId}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const busy = disabled || uploading;
  const trimmedCustom = currentUrl.trim();
  const displaySrc = (previewUrlProp ?? currentUrl).trim();
  const sourceMode: TenantMediaSourceMode =
    sourceModeProp ?? (trimmedCustom ? 'custom' : displaySrc ? 'fallback' : 'empty');

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (busy) return;
      const f = e.dataTransfer.files;
      if (f?.length) void onPickFiles(f);
    },
    [busy, onPickFiles],
  );

  const openFilePicker = () => {
    if (!busy) fileRef.current?.click();
  };

  const handleDropzoneClick = (e: React.MouseEvent) => {
    if (busy) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, summary, input[type="url"], .tenant-media-field__advanced')) return;
    openFilePicker();
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent) => {
    if (busy) return;
    if (e.key === 'Enter' || e.key === ' ') {
      const t = e.target as HTMLElement;
      if (t.closest('button, summary, input')) return;
      e.preventDefault();
      openFilePicker();
    }
  };

  return (
    <div className="tenant-media-field">
      <div className="tenant-media-field__label" id={`${inputId}-legend`}>
        {label}
      </div>
      {description ? <p className="hint" style={{ margin: 0 }}>{description}</p> : null}

      <div
        className={`tenant-media-field__dropzone tenant-media-field__dropzone--mode-${sourceMode}${
          dragOver ? ' tenant-media-field__dropzone--active' : ''
        }${busy ? ' tenant-media-field__dropzone--disabled' : ''}`}
        tabIndex={busy ? -1 : 0}
        role="region"
        aria-label={label}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={handleDropzoneClick}
        onKeyDown={handleDropzoneKeyDown}
      >
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept={accept}
          className="tenant-media-field__visually-hidden"
          aria-labelledby={`${inputId}-legend`}
          disabled={busy}
          onChange={(e) => {
            void onPickFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className={`tenant-media-field__source-chip tenant-media-field__source-chip--${sourceMode}`} role="status">
          {SOURCE_LABELS[sourceMode]}
        </div>

        {displaySrc ? (
          <div className="tenant-media-field__preview-wrap">
            <img src={displaySrc} alt="" />
          </div>
        ) : (
          <p className="tenant-media-field__drop-hint">גררו תמונה לכאן, או לחצו לבחירת קובץ</p>
        )}

        {uploading ? (
          <p className="tenant-media-field__progress" role="status">
            מעלה…
          </p>
        ) : null}

        <div className="tenant-media-field__actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="tenant-media-field__btn tenant-media-field__btn--primary"
            disabled={busy}
            onClick={openFilePicker}
          >
            {displaySrc && trimmedCustom ? 'החלפת תמונה' : displaySrc && !trimmedCustom ? 'העלאה חדשה' : 'העלאה'}
          </button>
          {trimmedCustom ? (
            <button type="button" className="tenant-media-field__btn" disabled={busy} onClick={() => onUrlChange('')} aria-label="הסר תמונה">
              הסר (חזרה לברירת מחדל)
            </button>
          ) : null}
        </div>
        {extraActions ? (
          <div className="tenant-media-field__actions" onClick={(e) => e.stopPropagation()}>
            {extraActions}
          </div>
        ) : null}
        {belowActions ? <div className="tenant-media-field__below">{belowActions}</div> : null}
      </div>

      <details className="tenant-media-field__advanced">
        <summary>מתקדם: עריכת כתובת URL</summary>
        <div className="tenant-media-field__advanced-body">
          <input
            type="url"
            dir="ltr"
            placeholder="https://…"
            value={currentUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            disabled={busy}
            aria-label={`${label} — URL`}
          />
        </div>
      </details>
    </div>
  );
}
