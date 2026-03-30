import { Link } from 'react-router-dom';
import { Fragment, useMemo, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { PublicCar } from '../../types/cars';
import type { TenantBrandingModel } from '../../tenant/tenantBranding';
import {
  TENANT_HOME_SECTION_KEYS,
  TENANT_HOME_SECTION_LABELS_HE,
  TENANT_SECTION_STYLE_CAPABILITIES,
  normalizeTenantSectionStylesRecord,
  type NormalizedTenantSiteConfig,
  type TenantHomeBrandingResolutionLayout,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from '../../tenant/tenantSiteConfig';
import { sectionHiveShellCssProperties } from '../../tenant/sectionHivePalette';
import { resolveEffectiveSectionStylesRecord } from '../../tenant/effectiveSectionStyle';
import { resolveSectionHiveAccentResolution } from '../../tenant/effectiveSectionAccent';
import { buildTenantPhoneHref, buildTenantWhatsappHref } from '../../tenant/tenantContact';
import './TenantHomeBlocks.css';

function formatPrice(price: number | null): string {
  return typeof price === 'number' ? `${price.toLocaleString('he-IL')} ₪` : 'מחיר זמין בפרטים';
}

function resolveCtaHref(link: string | null): { external: boolean; href: string } | null {
  if (!link) return null;
  const t = link.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return { external: true, href: t };
  const path = t.startsWith('/') ? t : `/${t}`;
  return { external: false, href: path };
}

function previewThemeStyle(branding: TenantBrandingModel): CSSProperties {
  const vars: Record<string, string> = {};
  if (branding.theme.primaryColor) vars['--tenant-primary-color'] = branding.theme.primaryColor;
  if (branding.theme.secondaryColor) vars['--tenant-secondary-color'] = branding.theme.secondaryColor;
  if (branding.theme.accentColor) vars['--tenant-accent-color'] = branding.theme.accentColor;
  if (branding.textColor) vars['--tenant-text-color'] = branding.textColor;
  if (branding.backgroundColor) vars['--tenant-background-color'] = branding.backgroundColor;
  return vars as CSSProperties;
}

/** Builder-only: shared with structure panel for HTML5 section drag state. */
export type TenantCanvasSectionReorder = {
  sectionOrder: TenantHomeSectionKey[];
  dragSectionIndex: number | null;
  setDragSectionIndex: (i: number | null) => void;
  sectionDropTargetIndex: number | null;
  setSectionDropTargetIndex: Dispatch<SetStateAction<number | null>>;
  onDropAtOrderIndex: (targetIndex: number) => void;
  formBusy: boolean;
};

export type TenantHomeBuilderEditMode = {
  selectedSection: TenantHomeSectionKey | null;
  onSelectSection: (key: TenantHomeSectionKey) => void;
  /** Hide/show section in layout (not shown for hero). */
  onToggleSectionVisibility?: (key: TenantHomeSectionKey) => void;
  /** When set (admin builder), canvas chrome + gaps reorder `sectionOrder` / homeSections. */
  canvasSectionReorder?: TenantCanvasSectionReorder | null;
};

export interface TenantHomeSectionsViewProps {
  normalized: NormalizedTenantSiteConfig;
  branding: TenantBrandingModel;
  isPreview?: boolean;
  cars?: PublicCar[];
  scopeMissing?: boolean;
  /** SaaS: hide featured inventory messaging on live tenant site */
  publicSiteSuspended?: boolean;
  rootClassName?: string;
  /** Visual builder: wrap sections for hover/selection; show shells for toggled-but-empty sections */
  builderEditMode?: TenantHomeBuilderEditMode | null;
  /** Builder-only hero focal point (CSS background-position), e.g. "42% 35%" */
  previewHeroBackgroundPosition?: string | null;
  /**
   * Website Builder live preview: use draft section styles from page state so the canvas
   * stays in lockstep with the inspector (same object chain as handleChangeSectionStyle).
   */
  draftSectionStyles?: Record<TenantHomeSectionKey, TenantSectionStyle> | null;
  /** Builder: draft inherit flags merged on layout (legacy: when alone, applies to both style + accent). */
  draftSectionInheritsSiteTheme?: Partial<Record<TenantHomeSectionKey, boolean>> | null;
  draftSectionInheritsSiteThemeStyle?: Partial<Record<TenantHomeSectionKey, boolean>> | null;
  draftSectionInheritsSiteThemeAccent?: Partial<Record<TenantHomeSectionKey, boolean>> | null;
}

export default function TenantHomeSectionsView({
  normalized,
  branding,
  isPreview = false,
  cars = [],
  scopeMissing = false,
  publicSiteSuspended = false,
  rootClassName = '',
  builderEditMode = null,
  previewHeroBackgroundPosition = null,
  draftSectionStyles = null,
  draftSectionInheritsSiteTheme = null,
  draftSectionInheritsSiteThemeStyle = null,
  draftSectionInheritsSiteThemeAccent = null,
}: TenantHomeSectionsViewProps) {
  const { content, contact, layout } = normalized;
  const sectionStylesStored =
    draftSectionStyles != null ? normalizeTenantSectionStylesRecord(draftSectionStyles) : layout.sectionStyles;
  const legacyDraftOnly =
    draftSectionInheritsSiteTheme != null &&
    draftSectionInheritsSiteThemeStyle == null &&
    draftSectionInheritsSiteThemeAccent == null;
  const styleInheritMerged = useMemo(() => {
    const o: Partial<Record<TenantHomeSectionKey, boolean>> = { ...layout.sectionInheritsSiteThemeStyle };
    if (draftSectionInheritsSiteThemeStyle) {
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        if (draftSectionInheritsSiteThemeStyle[k] === true) o[k] = true;
        if (draftSectionInheritsSiteThemeStyle[k] === false) delete o[k];
      }
    }
    if (legacyDraftOnly && draftSectionInheritsSiteTheme) {
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        if (draftSectionInheritsSiteTheme[k] === true) o[k] = true;
        if (draftSectionInheritsSiteTheme[k] === false) delete o[k];
      }
    }
    return o;
  }, [layout.sectionInheritsSiteThemeStyle, draftSectionInheritsSiteThemeStyle, legacyDraftOnly, draftSectionInheritsSiteTheme]);
  const accentInheritMerged = useMemo(() => {
    const o: Partial<Record<TenantHomeSectionKey, boolean>> = { ...layout.sectionInheritsSiteThemeAccent };
    if (draftSectionInheritsSiteThemeAccent) {
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        if (draftSectionInheritsSiteThemeAccent[k] === true) o[k] = true;
        if (draftSectionInheritsSiteThemeAccent[k] === false) delete o[k];
      }
    }
    if (legacyDraftOnly && draftSectionInheritsSiteTheme) {
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        if (draftSectionInheritsSiteTheme[k] === true) o[k] = true;
        if (draftSectionInheritsSiteTheme[k] === false) delete o[k];
      }
    }
    return o;
  }, [layout.sectionInheritsSiteThemeAccent, draftSectionInheritsSiteThemeAccent, legacyDraftOnly, draftSectionInheritsSiteTheme]);
  const layoutForEffective = useMemo(
    (): TenantHomeBrandingResolutionLayout => ({
      sectionStyles: sectionStylesStored,
      sectionInheritsSiteThemeStyle: styleInheritMerged,
      sectionInheritsSiteThemeAccent: accentInheritMerged,
      homeSections: layout.homeSections,
    }),
    [sectionStylesStored, styleInheritMerged, accentInheritMerged, layout.homeSections],
  );
  const effectiveSectionStyles = useMemo(
    () => resolveEffectiveSectionStylesRecord(layoutForEffective, normalized.branding),
    [layoutForEffective, normalized.branding],
  );
  const tenantName = branding.displayName || branding.businessName || 'האתר';

  const phoneHref = buildTenantPhoneHref(contact.phone ?? branding.contact.phone);
  const whatsappHref = buildTenantWhatsappHref(contact.whatsapp ?? branding.contact.whatsapp, contact.phone ?? branding.contact.phone);

  const mergedContact = {
    phone: contact.phone ?? branding.contact.phone,
    whatsapp: contact.whatsapp ?? branding.contact.whatsapp,
    email: contact.email ?? branding.contact.email,
    address: contact.address ?? branding.contact.address,
    city: contact.city ?? branding.contact.city,
    facebookUrl: contact.facebookUrl ?? branding.contact.facebookUrl,
    instagramUrl: contact.instagramUrl ?? branding.contact.instagramUrl,
    websiteUrl: contact.websiteUrl ?? branding.contact.websiteUrl,
  };

  const heroTitle = content.heroTitle || tenantName;
  const heroSubtitle = content.heroSubtitle || `ברוכים הבאים לאתר הרכבים של ${tenantName}`;
  const cta = resolveCtaHref(content.heroCtaLink);
  const ctaLabel = content.heroCtaText || `לרכבים של ${tenantName}`;

  const hasQuickContact = !!(mergedContact.phone || mergedContact.whatsapp);

  const sectionAllowed = (key: TenantHomeSectionKey): boolean => {
    switch (key) {
      case 'featuredCars':
        return layout.showFeaturedCars;
      case 'about':
        return layout.showAbout;
      case 'benefits':
        return layout.showBenefits;
      case 'finance':
        return layout.showFinance;
      case 'testimonials':
        return layout.showTestimonials;
      case 'contact':
        return layout.showContact;
      case 'map':
        return layout.showMap;
      default:
        return true;
    }
  };

  const shouldRenderSectionLive = (key: TenantHomeSectionKey): boolean => {
    if (!sectionAllowed(key)) return false;
    switch (key) {
      case 'hero':
        return true;
      case 'featuredCars':
        return layout.showFeaturedCars;
      case 'about':
        return !!(content.aboutText || content.aboutTitle);
      case 'benefits':
        return !!(content.benefitsItems.length > 0 || content.benefitsTitle);
      case 'finance':
        return !!(content.financeText || content.financeTitle);
      case 'testimonials':
        return !!(content.testimonialsText || content.testimonialsTitle);
      case 'contact':
        return layout.showContact && (hasQuickContact || !!content.contactTitle || !!content.contactSubtitle || !!mergedContact.email);
      case 'map':
        return !!(mergedContact.address || mergedContact.city);
      default:
        return false;
    }
  };

  /** In visual builder preview, keep toggled sections visible as shells so the user can select them */
  const shouldRenderSectionBuilder = (key: TenantHomeSectionKey): boolean => {
    if (!sectionAllowed(key)) return false;
    switch (key) {
      case 'hero':
        return true;
      case 'featuredCars':
        return layout.showFeaturedCars;
      case 'about':
        return layout.showAbout;
      case 'benefits':
        return layout.showBenefits;
      case 'finance':
        return layout.showFinance;
      case 'testimonials':
        return layout.showTestimonials;
      case 'contact':
        return layout.showContact;
      case 'map':
        return layout.showMap;
      default:
        return false;
    }
  };

  const shouldRenderSection = (key: TenantHomeSectionKey): boolean => {
    if (builderEditMode && isPreview) return shouldRenderSectionBuilder(key);
    return shouldRenderSectionLive(key);
  };

  const orderedSections = layout.homeSections.filter((k) => shouldRenderSection(k));
  const sectionsToRender: TenantHomeSectionKey[] =
    orderedSections.length > 0 ? orderedSections : (['hero'] as TenantHomeSectionKey[]);

  const variantClass = `tenant-variant-${branding.themeVariant}`;
  const sectionStyleClassName = (key: TenantHomeSectionKey): string => {
    const style = effectiveSectionStyles[key];
    if (!style) return '';
    return [
      `tenant-section-bg-${style.backgroundMode}`,
      `tenant-section-tone-${style.textTone}`,
      `tenant-section-align-${style.align}`,
      `tenant-section-density-${style.paddingDensity}`,
      `tenant-section-layout-${style.layoutVariant}`,
      `tenant-section-card-${style.cardStyle}`,
    ].join(' ');
  };

  /** Section style classes + optional hive vars (same on preview and live; unified resolver). */
  const sectionShellProps = (key: TenantHomeSectionKey): { extraClassName: string; style?: CSSProperties } => {
    const rec = effectiveSectionStyles[key];
    const base = sectionStyleClassName(key);
    const caps = TENANT_SECTION_STYLE_CAPABILITIES[key];
    const hiveCtx =
      rec && caps.accentColor
        ? resolveSectionHiveAccentResolution(key, layoutForEffective, normalized.branding).ctx
        : null;
    const hiveStyle = hiveCtx ? sectionHiveShellCssProperties(hiveCtx) : undefined;
    if (!hiveStyle || !hiveCtx?.hiveBaseHex) {
      return { extraClassName: base };
    }
    return { extraClassName: `${base} tenant-section-hive`.trim(), style: hiveStyle };
  };

  const heroStyle: CSSProperties | undefined = branding.heroImageUrl
    ? {
        backgroundImage: `linear-gradient(120deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url(${branding.heroImageUrl})`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        ...(previewHeroBackgroundPosition?.trim()
          ? { backgroundPosition: previewHeroBackgroundPosition.trim() }
          : { backgroundPosition: 'center center' }),
      }
    : undefined;

  const renderCta = () => {
    if (isPreview) {
      return <span className="tenant-home-primary-btn tenant-home-preview-fake-btn">{ctaLabel}</span>;
    }
    if (cta) {
      if (cta.external) {
        return (
          <a href={cta.href} className="tenant-home-primary-btn" target="_blank" rel="noreferrer">
            {ctaLabel}
          </a>
        );
      }
      return (
        <Link to={cta.href} className="tenant-home-primary-btn">
          {ctaLabel}
        </Link>
      );
    }
    return (
      <Link to="/cars" className="tenant-home-primary-btn">
        {ctaLabel}
      </Link>
    );
  };

  const builderEmptyHint = (label: string) =>
    builderEditMode && isPreview ? <p className="tenant-home-muted tenant-builder-empty-hint">{label}</p> : null;

  const renderSectionContent = (key: TenantHomeSectionKey): ReactNode => {
    switch (key) {
      case 'hero':
        return (
          <div className="tenant-home-hero" style={heroStyle}>
            <h2>{heroTitle}</h2>
            <p>{heroSubtitle}</p>
            <div className="tenant-home-hero-cta-row">{renderCta()}</div>
          </div>
        );
      case 'featuredCars': {
        const sh = sectionShellProps('featuredCars');
        return (
          <div className={`tenant-home-featured-cars ${sh.extraClassName}`.trim()} style={sh.style}>
            <h3>רכבים בדף הבית</h3>
            {isPreview ? (
              <>
                {cars.length > 0 ? (
                  <>
                    <p className="tenant-home-muted">תצוגה מקדימה (טיוטה) — לאחר שמירה יוצגו בדומיין החי.</p>
                    <div className="tenant-home-cars-grid">
                      {cars.map((car) => (
                        <div key={car.carId} className="tenant-home-car-card tenant-home-preview-car-card">
                          {car.mainImageUrl ? (
                            <img src={car.mainImageUrl} alt={`${car.brand || ''} ${car.model || ''}`} loading="lazy" />
                          ) : (
                            <div className="tenant-home-preview-thumb" />
                          )}
                          <div className="tenant-home-car-meta">
                            <strong>
                              {car.year || ''} {car.brand || ''} {car.model || ''}
                            </strong>
                            <span>{formatPrice(car.price)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {builderEditMode
                      ? builderEmptyHint('בחלונית הכלים: הגדירו yardUid, ואז סמנו רכבים לדף הבית מעמוד ניהול המלאי.')
                      : null}
                    <p className="tenant-home-muted">
                      אין רכבים לתצוגה מקדימה. הגדירו yardUid ב־data scope, פרסמו רכבים, וסמנו &quot;בדף הבית&quot; בעמוד המלאי (או השאירו
                      רשימת featured ישנה ללא סימון חדש).
                    </p>
                  </>
                )}
              </>
            ) : publicSiteSuspended ? (
              <p className="tenant-home-muted">האתר אינו מציג מלאי כרגע (מנוי / סטטוס).</p>
            ) : scopeMissing ? (
              <p className="tenant-home-muted">היקף מלאי לא הוגדר לדומיין זה. יש להגדיר yardUid ב־tenantSiteConfigs.</p>
            ) : cars.length > 0 ? (
              <div className="tenant-home-cars-grid">
                {cars.map((car) => (
                  <Link key={car.carId} to={`/cars/${car.carId}`} className="tenant-home-car-card">
                    {car.mainImageUrl ? <img src={car.mainImageUrl} alt={`${car.brand || ''} ${car.model || ''}`} loading="lazy" /> : null}
                    <div className="tenant-home-car-meta">
                      <strong>
                        {car.year || ''} {car.brand || ''} {car.model || ''}
                      </strong>
                      <span>{formatPrice(car.price)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="tenant-home-muted">אין רכבים זמינים להצגה כרגע.</p>
            )}
          </div>
        );
      }
      case 'about': {
        const sh = sectionShellProps('about');
        return (
          <div className={`tenant-home-about ${sh.extraClassName}`.trim()} style={sh.style}>
            <h3>{content.aboutTitle || 'קצת עלינו'}</h3>
            {content.aboutText ? <p>{content.aboutText}</p> : builderEmptyHint('ערכו כותרת ותוכן בסקשן ״אודות״ בחלונית הכלים.')}
          </div>
        );
      }
      case 'benefits': {
        const sh = sectionShellProps('benefits');
        return (
          <div className={`tenant-home-benefits ${sh.extraClassName}`.trim()} style={sh.style}>
            <h3>{content.benefitsTitle || 'למה לבחור בנו'}</h3>
            {content.benefitsItems.length > 0 ? (
              <ul>
                {content.benefitsItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            ) : (
              builderEmptyHint('הוסיפו פריטים לרשימת היתרונות בחלונית הכלים.')
            )}
          </div>
        );
      }
      case 'finance': {
        const sh = sectionShellProps('finance');
        return (
          <div className={`tenant-home-finance ${sh.extraClassName}`.trim()} style={sh.style}>
            <h3>{content.financeTitle || 'מימון'}</h3>
            {content.financeText ? <p>{content.financeText}</p> : builderEmptyHint('הוסיפו טקסט מימון בחלונית הכלים.')}
          </div>
        );
      }
      case 'testimonials': {
        const sh = sectionShellProps('testimonials');
        return (
          <div className={`tenant-home-testimonials ${sh.extraClassName}`.trim()} style={sh.style}>
            <h3>{content.testimonialsTitle || 'מה לקוחות אומרים'}</h3>
            {content.testimonialsText ? <p>{content.testimonialsText}</p> : builderEmptyHint('הוסיפו המלצות בחלונית הכלים.')}
          </div>
        );
      }
      case 'contact': {
        const sh = sectionShellProps('contact');
        return (
          <div className={`tenant-home-contact-cta ${sh.extraClassName}`.trim()} style={sh.style}>
            <h3>{content.contactTitle || 'יצירת קשר'}</h3>
            {content.contactSubtitle ? <p className="tenant-home-contact-sub">{content.contactSubtitle}</p> : null}
            {!phoneHref && !whatsappHref && !mergedContact.email && builderEditMode ? (
              builderEmptyHint('מלאו טלפון, וואטסאפ או אימייל — או השתמשו בברירות מחדל מפרופיל החצר.')
            ) : null}
            <div className="tenant-home-contact-actions">
              {phoneHref ? (
                <a href={phoneHref} className="tenant-home-action-link">
                  טלפון: {mergedContact.phone}
                </a>
              ) : null}
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer" className="tenant-home-action-link tenant-home-whatsapp-link">
                  WhatsApp
                </a>
              ) : null}
              {mergedContact.email ? (
                <a href={`mailto:${mergedContact.email}`} className="tenant-home-action-link">
                  {mergedContact.email}
                </a>
              ) : null}
              {isPreview ? (
                <span className="tenant-home-action-link tenant-home-preview-fake-link">{ctaLabel}</span>
              ) : (
                <Link to="/cars" className="tenant-home-action-link">
                  {ctaLabel}
                </Link>
              )}
            </div>
          </div>
        );
      }
      case 'map': {
        const query = [mergedContact.address, mergedContact.city].filter(Boolean).join(', ');
        const mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
        const mh = sectionShellProps('map');
        if (mapsUrl) {
          return (
            <div className={`tenant-home-map ${mh.extraClassName}`.trim()} style={mh.style}>
              <h3>מיקום</h3>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="tenant-home-action-link">
                פתיחה במפות Google
              </a>
            </div>
          );
        }
        return (
          <div className={`tenant-home-map ${mh.extraClassName}`.trim()} style={mh.style}>
            <h3>מיקום</h3>
            {builderEditMode && isPreview ? builderEmptyHint('הוסיפו כתובת או עיר בחלונית הכלים כדי להפעיל קישור למפה.') : null}
          </div>
        );
      }
      default:
        return null;
    }
  };

  const isBuilderCanvasEmptySection = (key: TenantHomeSectionKey): boolean => {
    if (!builderEditMode || !isPreview) return false;
    switch (key) {
      case 'hero':
        return false;
      case 'featuredCars':
        return cars.length === 0;
      case 'about':
        return !content.aboutTitle?.trim() && !content.aboutText?.trim();
      case 'benefits':
        return !content.benefitsTitle?.trim() && content.benefitsItems.length === 0;
      case 'finance':
        return !content.financeTitle?.trim() && !content.financeText?.trim();
      case 'testimonials':
        return !content.testimonialsTitle?.trim() && !content.testimonialsText?.trim();
      case 'contact':
        return (
          !content.contactTitle?.trim() &&
          !content.contactSubtitle?.trim() &&
          !phoneHref &&
          !whatsappHref &&
          !mergedContact.email
        );
      case 'map':
        return !(mergedContact.address?.trim() || mergedContact.city?.trim());
      default:
        return false;
    }
  };

  const crCanvas = isPreview ? builderEditMode?.canvasSectionReorder ?? null : null;

  const renderCanvasDropGap = (targetIndex: number): ReactNode => {
    if (!crCanvas) return null;
    const active =
      crCanvas.dragSectionIndex !== null && crCanvas.sectionDropTargetIndex === targetIndex;
    return (
      <div
        className={`tenant-builder-canvas-gap${active ? ' tenant-builder-canvas-gap--active' : ''}`}
        onDragOver={(e) => {
          if (crCanvas.formBusy) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (crCanvas.dragSectionIndex !== null) crCanvas.setSectionDropTargetIndex(targetIndex);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            crCanvas.setSectionDropTargetIndex((t) => (t === targetIndex ? null : t));
          }
        }}
        onDrop={(e) => {
          if (crCanvas.formBusy) return;
          e.preventDefault();
          crCanvas.onDropAtOrderIndex(targetIndex);
        }}
        aria-hidden
      />
    );
  };

  const wrapBuilderFrame = (key: TenantHomeSectionKey, inner: ReactNode): ReactNode => {
    if (!builderEditMode || !inner) return inner;
    const selected = builderEditMode.selectedSection === key;
    const empty = isBuilderCanvasEmptySection(key);
    const labelHe = TENANT_HOME_SECTION_LABELS_HE[key];
    const canToggleVisibility = Boolean(builderEditMode.onToggleSectionVisibility) && key !== 'hero';
    const visible = sectionAllowed(key);
    const cr = crCanvas;

    return (
      <div
        className={`tenant-builder-section-frame${selected ? ' tenant-builder-section-frame--selected' : ''}${
          empty ? ' tenant-builder-section-frame--empty' : ''
        }${cr && cr.dragSectionIndex !== null && cr.sectionOrder[cr.dragSectionIndex] === key ? ' tenant-builder-section-frame--dragging' : ''}`}
        data-tenant-section={key}
        role="group"
        aria-label={labelHe}
      >
        <div
          className="tenant-builder-section-frame__chrome"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="tenant-builder-section-frame__badge">{labelHe}</span>
          {cr ? (
            <button
              type="button"
              className="tenant-builder-section-frame__drag"
              draggable={!cr.formBusy}
              title="גרירה לשינוי סדר בדף"
              aria-label={`גרירה לשינוי סדר — ${labelHe}`}
              onDragStart={(e) => {
                e.stopPropagation();
                if (cr.formBusy) return;
                const idx = cr.sectionOrder.indexOf(key);
                if (idx < 0) return;
                cr.setDragSectionIndex(idx);
                try {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', key);
                } catch {
                  /* Safari may restrict setData in some cases */
                }
              }}
              onDragEnd={() => {
                cr.setDragSectionIndex(null);
                cr.setSectionDropTargetIndex(null);
              }}
            >
              ⣿
            </button>
          ) : (
            <span className="tenant-builder-section-frame__handle" title="סידור מהמבנה (פאנל שמאלי)" aria-hidden>
              ⋮⋮
            </span>
          )}
          <div className="tenant-builder-section-frame__actions">
            <button
              type="button"
              className="tenant-builder-section-frame__btn tenant-builder-section-frame__btn--primary"
              aria-label={`עריכת ${labelHe}`}
              onClick={() => builderEditMode.onSelectSection(key)}
            >
              עריכה
            </button>
            {canToggleVisibility ? (
              <button
                type="button"
                className="tenant-builder-section-frame__btn"
                aria-label={visible ? `הסתר ${labelHe} מדף הבית` : `הצג ${labelHe}`}
                onClick={() => builderEditMode.onToggleSectionVisibility?.(key)}
              >
                {visible ? 'הסתר' : 'הצג'}
              </button>
            ) : null}
          </div>
        </div>
        <div
          className="tenant-builder-section-frame__body"
          role="button"
          tabIndex={0}
          aria-label={`בחירת ${labelHe}`}
          aria-pressed={selected}
          onClick={() => builderEditMode.onSelectSection(key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              builderEditMode.onSelectSection(key);
            }
          }}
        >
          {empty ? (
            <div className="tenant-builder-canvas-placeholder" role="status">
              הסקשן ריק — לחצו לעריכה בחלונית הכלים
            </div>
          ) : null}
          <div className="tenant-builder-section-frame__inner">{inner}</div>
        </div>
      </div>
    );
  };

  const rootStyle = isPreview ? previewThemeStyle(branding) : undefined;

  return (
    <section className={`tenant-home-blocks ${variantClass} ${isPreview ? 'tenant-home-blocks-preview' : ''} ${rootClassName}`.trim()} style={rootStyle}>
      {sectionsToRender.map((key) => {
        const inner = renderSectionContent(key);
        if (!inner) return null;
        const wrapped = builderEditMode ? wrapBuilderFrame(key, inner) : inner;
        const beforeIdx = crCanvas ? crCanvas.sectionOrder.indexOf(key) : -1;
        return (
          <Fragment key={key}>
            {crCanvas && beforeIdx >= 0 ? renderCanvasDropGap(beforeIdx) : null}
            <div className={builderEditMode ? 'tenant-builder-section-root' : undefined}>{wrapped}</div>
          </Fragment>
        );
      })}
      {crCanvas && sectionsToRender.length > 0 ? renderCanvasDropGap(crCanvas.sectionOrder.length) : null}
    </section>
  );
}
