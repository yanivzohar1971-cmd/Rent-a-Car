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
import { normalizeBuilderSectionVisibility } from '../../tenant/builderSectionVisibility';
import { sectionHiveShellCssProperties } from '../../tenant/sectionHivePalette';
import { resolveEffectiveSectionStylesRecord } from '../../tenant/effectiveSectionStyle';
import { resolveSectionHiveAccentResolution } from '../../tenant/effectiveSectionAccent';
import { buildTenantPhoneHref, buildTenantWhatsappHref } from '../../tenant/tenantContact';
import { resolveTenantHomeRootSurfaceStyle } from '../../tenant/tenantSurfaceStyle';
import { resolveHeroCardSurfaceStyle, resolveSectionReadableTextColorIfNeeded, resolveTenantSectionSurfaceLayerVisual } from '../../tenant/tenantVisualResolver';
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

/** Derive title + body from a single benefits string (no schema change). */
function benefitCardFromLine(line: string): { title: string; description: string } {
  const raw = line.trim();
  if (!raw) return { title: '', description: '' };
  const nl = raw.indexOf('\n');
  if (nl > 0) {
    const title = raw.slice(0, nl).trim();
    const description = raw.slice(nl + 1).trim();
    return { title, description: description && description !== title ? description : '' };
  }
  const em = raw.indexOf(' — ');
  if (em >= 8) return { title: raw.slice(0, em).trim(), description: raw.slice(em + 3).trim() };
  const colon = raw.indexOf(':');
  if (colon >= 4 && colon <= 72) return { title: raw.slice(0, colon).trim(), description: raw.slice(colon + 1).trim() };
  if (raw.length <= 72) return { title: raw, description: '' };
  const head = raw.slice(0, 70);
  const cut = head.lastIndexOf(' ');
  const titleBase = cut > 28 ? head.slice(0, cut) : head;
  return { title: `${titleBase.trim()}…`, description: raw };
}

const BENEFIT_ICON_IDS = ['shield', 'star', 'check', 'heart'] as const;

function TenantBenefitSvgIcon({ id }: { id: (typeof BENEFIT_ICON_IDS)[number] }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (id) {
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <polygon points="12,2 15,9 22,9 17,14 19,22 12,18 5,22 7,14 2,9 9,9" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'heart':
    default:
      return (
        <svg {...common}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      );
  }
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
  /** When set (admin builder), canvas chrome + gaps reorder canonical builder `sectionOrder`. */
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
  /**
   * Live tenant storefront: rewrite global `/cars` links to `/tenant/:id/cars` in preview,
   * and build featured-car card targets. Omitted in builder canvas preview.
   */
  tenantStorefrontInAppPaths?: {
    carsListPath: string;
    remapListingHref: (href: string) => string;
    carDetailPath: (carId: string) => string;
  } | null;
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
  tenantStorefrontInAppPaths = null,
}: TenantHomeSectionsViewProps) {
  const { content, contact, layout } = normalized;
  const normalizedSectionVisibility = useMemo(
    () =>
      normalizeBuilderSectionVisibility({
        homeSections: layout.homeSections,
        showFeaturedCars: layout.showFeaturedCars,
        showAbout: layout.showAbout,
        showBenefits: layout.showBenefits,
        showFinance: layout.showFinance,
        showTestimonials: layout.showTestimonials,
        showContact: layout.showContact,
        showMap: layout.showMap,
      }),
    [
      layout.homeSections,
      layout.showFeaturedCars,
      layout.showAbout,
      layout.showBenefits,
      layout.showFinance,
      layout.showTestimonials,
      layout.showContact,
      layout.showMap,
    ],
  );
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
      defaultSectionThemePresetId: layout.defaultSectionThemePresetId,
      // In builder preview, always resolve styles against canonical draft order so drag/drop
      // stays stable even when screenshot preview injects an alternate layout tree.
      homeSections:
        isPreview && builderEditMode?.canvasSectionReorder
          ? builderEditMode.canvasSectionReorder.sectionOrder
          : layout.homeSections,
    }),
    [
      sectionStylesStored,
      styleInheritMerged,
      accentInheritMerged,
      isPreview,
      builderEditMode,
      layout.homeSections,
      layout.defaultSectionThemePresetId,
    ],
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

  const shouldRenderSectionLive = (key: TenantHomeSectionKey): boolean => {
    if (!normalizedSectionVisibility.isVisible(key)) return false;
    switch (key) {
      case 'hero':
        return true;
      case 'featuredCars':
        return true;
      case 'about':
        return !!(content.aboutText || content.aboutTitle);
      case 'benefits':
        return !!(content.benefitsItems.length > 0 || content.benefitsTitle);
      case 'finance':
        return !!(content.financeText || content.financeTitle);
      case 'testimonials':
        return !!(content.testimonialsText || content.testimonialsTitle);
      case 'contact':
        return hasQuickContact || !!content.contactTitle || !!content.contactSubtitle || !!mergedContact.email;
      case 'map':
        return !!(mergedContact.address || mergedContact.city);
      default:
        return false;
    }
  };

  const shouldRenderSection = (key: TenantHomeSectionKey): boolean => {
    if (builderEditMode && isPreview) return normalizedSectionVisibility.isVisible(key);
    return shouldRenderSectionLive(key);
  };

  const orderedSections = (
    isPreview && builderEditMode?.canvasSectionReorder
      ? builderEditMode.canvasSectionReorder.sectionOrder
      : normalizedSectionVisibility.sectionOrder
  ).filter((k) => shouldRenderSection(k));
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
    const surfaceStyle = rec ? resolveTenantSectionSurfaceLayerVisual(key, rec).layerStyle : undefined;
    const textReadable = rec ? resolveSectionReadableTextColorIfNeeded(key, rec, hiveCtx, branding) : undefined;
    const mergedStyle =
      hiveStyle || surfaceStyle || textReadable
        ? {
            ...(hiveStyle || {}),
            ...(surfaceStyle || {}),
            ...(textReadable || {}),
          }
        : undefined;
    const hiveClass = hiveStyle && hiveCtx?.hiveBaseHex ? 'tenant-section-hive' : '';
    if (!mergedStyle) {
      return { extraClassName: base };
    }
    return { extraClassName: `${base} ${hiveClass}`.trim(), style: mergedStyle };
  };

  const heroStyle: CSSProperties | undefined = resolveHeroCardSurfaceStyle(branding, previewHeroBackgroundPosition);
  const heroHasBrandingImage = !!branding.heroImageUrl?.trim();
  const heroFullBleed = !isPreview && !builderEditMode;

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
      const internalTo = tenantStorefrontInAppPaths ? tenantStorefrontInAppPaths.remapListingHref(cta.href) : cta.href;
      return (
        <Link to={internalTo} className="tenant-home-primary-btn">
          {ctaLabel}
        </Link>
      );
    }
    if (tenantStorefrontInAppPaths) {
      return (
        <Link to={tenantStorefrontInAppPaths.carsListPath} className="tenant-home-primary-btn">
          {ctaLabel}
        </Link>
      );
    }
    return null;
  };

  const builderEmptyHint = (label: string) =>
    builderEditMode && isPreview ? <p className="tenant-home-muted tenant-builder-empty-hint">{label}</p> : null;

  const renderSectionContent = (key: TenantHomeSectionKey): ReactNode => {
    switch (key) {
      case 'hero':
        return (
          <div
            className={`tenant-home-hero${heroFullBleed ? ' tenant-home-hero--fullbleed' : ''}${heroHasBrandingImage ? ' tenant-home-hero--has-brand-image' : ' tenant-home-hero--fallback-bg'}`}
          >
            <div className="tenant-home-hero__media" style={heroHasBrandingImage ? heroStyle : undefined} aria-hidden={!heroHasBrandingImage} />
            <div className="tenant-home-hero__scrim" aria-hidden />
            <div className="tenant-home-hero__inner">
              <h2 className="tenant-home-hero__title">{heroTitle}</h2>
              <p className="tenant-home-hero__subtitle">{heroSubtitle}</p>
              <div className="tenant-home-hero-cta-row">{renderCta()}</div>
            </div>
          </div>
        );
      case 'featuredCars': {
        const sh = sectionShellProps('featuredCars');
        return (
          <div className={`tenant-home-featured-cars ${sh.extraClassName}`.trim()} style={sh.style}>
            <h2 className="tenant-home-section-heading tenant-home-section-heading--featured">רכבים בדף הבית</h2>
            {isPreview ? (
              <>
                {cars.length > 0 ? (
                  <>
                    <p className="tenant-home-muted">תצוגה מקדימה (טיוטה) — לאחר שמירה יוצגו בדומיין החי.</p>
                    <div className="tenant-home-cars-grid">
                      {cars.map((car) => (
                        <div key={car.carId} className="tenant-home-car-card tenant-home-car-card--elevated tenant-home-preview-car-card">
                          <div className="tenant-home-car-card__media">
                            {car.mainImageUrl ? (
                              <img src={car.mainImageUrl} alt={`${car.brand || ''} ${car.model || ''}`} loading="lazy" />
                            ) : (
                              <div className="tenant-home-preview-thumb" />
                            )}
                          </div>
                          <div className="tenant-home-car-meta">
                            <span className="tenant-home-car-meta__title">
                              {car.year || ''} {car.brand || ''} {car.model || ''}
                            </span>
                            <span className="tenant-home-car-meta__price">{formatPrice(car.price)}</span>
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
                  <Link
                    key={car.carId}
                    to={tenantStorefrontInAppPaths ? tenantStorefrontInAppPaths.carDetailPath(car.carId) : `/cars/${car.carId}`}
                    className="tenant-home-car-card tenant-home-car-card--elevated tenant-home-car-card--interactive"
                  >
                    <div className="tenant-home-car-card__media">
                      {car.mainImageUrl ? (
                        <img src={car.mainImageUrl} alt={`${car.brand || ''} ${car.model || ''}`} loading="lazy" />
                      ) : (
                        <div className="tenant-home-car-card__placeholder" aria-hidden />
                      )}
                    </div>
                    <div className="tenant-home-car-meta">
                      <span className="tenant-home-car-meta__title">
                        {car.year || ''} {car.brand || ''} {car.model || ''}
                      </span>
                      <span className="tenant-home-car-meta__price">{formatPrice(car.price)}</span>
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
            <div className="tenant-home-about__shell">
              <h2 className="tenant-home-section-heading">{content.aboutTitle || 'קצת עלינו'}</h2>
              {content.aboutText ? (
                <div className="tenant-home-about__body">
                  {content.aboutText.split(/\n+/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              ) : (
                builderEmptyHint('ערכו כותרת ותוכן בסקשן ״אודות״ בחלונית הכלים.')
              )}
            </div>
          </div>
        );
      }
      case 'benefits': {
        const sh = sectionShellProps('benefits');
        return (
          <div className={`tenant-home-benefits ${sh.extraClassName}`.trim()} style={sh.style}>
            <h2 className="tenant-home-section-heading tenant-home-section-heading--benefits">
              {content.benefitsTitle || 'למה לבחור בנו'}
            </h2>
            {content.benefitsItems.length > 0 ? (
              <div className="tenant-home-benefits-grid">
                {content.benefitsItems.map((item, i) => {
                  const { title, description } = benefitCardFromLine(item);
                  const iconId = BENEFIT_ICON_IDS[i % BENEFIT_ICON_IDS.length];
                  return (
                    <article key={i} className="tenant-home-benefit-card">
                      <div className="tenant-home-benefit-card__icon" aria-hidden>
                        <TenantBenefitSvgIcon id={iconId} />
                      </div>
                      <h3 className="tenant-home-benefit-card__title">{title}</h3>
                      {description ? <p className="tenant-home-benefit-card__desc">{description}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              builderEmptyHint('הוסיפו פריטים לרשימת היתרונות בחלונית הכלים.')
            )}
          </div>
        );
      }
      case 'finance': {
        const sh = sectionShellProps('finance');
        return (
          <div className={`tenant-home-finance tenant-home-prose-section ${sh.extraClassName}`.trim()} style={sh.style}>
            <h2 className="tenant-home-section-heading">{content.financeTitle || 'מימון'}</h2>
            {content.financeText ? <p className="tenant-home-prose-section__text">{content.financeText}</p> : builderEmptyHint('הוסיפו טקסט מימון בחלונית הכלים.')}
          </div>
        );
      }
      case 'testimonials': {
        const sh = sectionShellProps('testimonials');
        return (
          <div className={`tenant-home-testimonials tenant-home-prose-section ${sh.extraClassName}`.trim()} style={sh.style}>
            <h2 className="tenant-home-section-heading">{content.testimonialsTitle || 'מה לקוחות אומרים'}</h2>
            {content.testimonialsText ? (
              <blockquote className="tenant-home-testimonials__quote">{content.testimonialsText}</blockquote>
            ) : (
              builderEmptyHint('הוסיפו המלצות בחלונית הכלים.')
            )}
          </div>
        );
      }
      case 'contact': {
        const sh = sectionShellProps('contact');
        return (
          <div className={`tenant-home-contact-cta tenant-home-contact-panel ${sh.extraClassName}`.trim()} style={sh.style}>
            <div className="tenant-home-contact-panel__head">
              <h2 className="tenant-home-contact-panel__title">{content.contactTitle || 'יצירת קשר'}</h2>
              {content.contactSubtitle ? <p className="tenant-home-contact-panel__lead">{content.contactSubtitle}</p> : null}
            </div>
            {!phoneHref && !whatsappHref && !mergedContact.email && builderEditMode ? (
              builderEmptyHint('מלאו טלפון, וואטסאפ או אימייל — או השתמשו בברירות מחדל מפרופיל החצר.')
            ) : null}
            <div className="tenant-home-contact-panel__actions">
              {phoneHref ? (
                <a href={phoneHref} className="tenant-home-cta-btn tenant-home-cta-btn--call">
                  <span className="tenant-home-cta-btn__label">התקשרו</span>
                  <span className="tenant-home-cta-btn__sub" dir="ltr">
                    {mergedContact.phone}
                  </span>
                </a>
              ) : null}
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer" className="tenant-home-cta-btn tenant-home-cta-btn--whatsapp">
                  <span className="tenant-home-cta-btn__label">WhatsApp</span>
                  <span className="tenant-home-cta-btn__sub">שליחת הודעה</span>
                </a>
              ) : null}
              {mergedContact.email ? (
                <a href={`mailto:${mergedContact.email}`} className="tenant-home-contact-panel__email">
                  {mergedContact.email}
                </a>
              ) : null}
              {isPreview ? (
                <span className="tenant-home-cta-btn tenant-home-cta-btn--ghost tenant-home-preview-fake-link">{ctaLabel}</span>
              ) : tenantStorefrontInAppPaths ? (
                <Link to={tenantStorefrontInAppPaths.carsListPath} className="tenant-home-cta-btn tenant-home-cta-btn--ghost">
                  {ctaLabel}
                </Link>
              ) : null}
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
            <div className={`tenant-home-map tenant-home-prose-section ${mh.extraClassName}`.trim()} style={mh.style}>
              <h2 className="tenant-home-section-heading">מיקום</h2>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="tenant-home-cta-btn tenant-home-cta-btn--ghost">
                פתיחה במפות Google
              </a>
            </div>
          );
        }
        return (
          <div className={`tenant-home-map tenant-home-prose-section ${mh.extraClassName}`.trim()} style={mh.style}>
            <h2 className="tenant-home-section-heading">מיקום</h2>
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
    const dragSession = !crCanvas.formBusy && crCanvas.dragSectionIndex !== null;
    const active = dragSession && crCanvas.sectionDropTargetIndex === targetIndex;
    const setTargetFromEvent = (e: React.DragEvent) => {
      if (crCanvas.formBusy || crCanvas.dragSectionIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      crCanvas.setSectionDropTargetIndex(targetIndex);
    };
    return (
      <div
        className={`tenant-builder-canvas-gap${dragSession ? ' tenant-builder-canvas-gap--session' : ''}${
          active ? ' tenant-builder-canvas-gap--active' : ''
        }`}
        onDragEnter={setTargetFromEvent}
        onDragOver={setTargetFromEvent}
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
      >
        {dragSession ? (
          <span className="tenant-builder-canvas-gap__label" aria-hidden>
            שחרר כאן
          </span>
        ) : null}
      </div>
    );
  };

  const wrapBuilderFrame = (key: TenantHomeSectionKey, inner: ReactNode): ReactNode => {
    if (!builderEditMode || !inner) return inner;
    const selected = builderEditMode.selectedSection === key;
    const empty = isBuilderCanvasEmptySection(key);
    const labelHe = TENANT_HOME_SECTION_LABELS_HE[key];
    const canToggleVisibility = Boolean(builderEditMode.onToggleSectionVisibility) && key !== 'hero';
    const visible = normalizedSectionVisibility.isVisible(key);
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

  const rootStyle = resolveTenantHomeRootSurfaceStyle(branding, { isPreview });

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
            <div className={builderEditMode ? 'tenant-builder-section-root' : 'tenant-home-section-wrap'}>{wrapped}</div>
          </Fragment>
        );
      })}
      {crCanvas && sectionsToRender.length > 0 ? renderCanvasDropGap(crCanvas.sectionOrder.length) : null}
    </section>
  );
}
