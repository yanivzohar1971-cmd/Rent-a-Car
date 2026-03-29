import { useId, useState, type ReactNode } from 'react';
import './SiteBuilderSectionCard.css';

export type SiteBuilderSectionCardProps = {
  /** Card heading */
  title: string;
  /** Short explanation: what this block controls on the live site */
  mapsToSite: string;
  defaultOpen?: boolean;
  /** Compact visual hint (thumbnail strip, chips, etc.) */
  preview?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function SiteBuilderSectionCard({
  title,
  mapsToSite,
  defaultOpen = false,
  preview,
  children,
  className = '',
}: SiteBuilderSectionCardProps) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`site-builder-section-card ${className}`.trim()} aria-labelledby={`${panelId}-heading`}>
      <button
        type="button"
        id={`${panelId}-heading`}
        className="site-builder-section-card__toggle"
        aria-expanded={open}
        aria-controls={`${panelId}-panel`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="site-builder-section-card__chevron" aria-hidden>
          {open ? '▼' : '▶'}
        </span>
        <span className="site-builder-section-card__titles">
          <span className="site-builder-section-card__title">{title}</span>
          <span className="site-builder-section-card__maps">{mapsToSite}</span>
        </span>
      </button>
      {open ? (
        <div id={`${panelId}-panel`} className="site-builder-section-card__body" role="region">
          {preview ? <div className="site-builder-section-card__preview">{preview}</div> : null}
          <div className="site-builder-section-card__fields">{children}</div>
        </div>
      ) : null}
    </section>
  );
}
