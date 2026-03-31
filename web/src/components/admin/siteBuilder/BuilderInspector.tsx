import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import type { TenantSiteMediaKind } from '../../../api/tenantSiteMediaApi';
import {
  TENANT_HOME_SECTION_LABELS_HE,
  TENANT_SECTION_STYLE_CAPABILITIES,
  isAppliedSnapshotActiveForPack,
  normalizeTenantSectionStylesRecord,
  type NormalizedAppliedThemeSnapshot,
  type NormalizedTenantBranding,
  type TenantHomeBrandingResolutionLayout,
  type TenantHomeSectionKey,
  type TenantSectionStyle,
} from '../../../tenant/tenantSiteConfig';
import { resolveSectionHiveAccentResolution } from '../../../tenant/effectiveSectionAccent';
import type { ThemeBrandPreset } from '../../../tenant/themeBrandPresets';
import type { NormalizedThemeAccentStrategy } from '../../../tenant/themeAccentStrategy';
import BuilderSiteThemePanel from './BuilderSiteThemePanel';
import type { PublicCar } from '../../../types/cars';
import type { TenantHomepageSelectionMeta } from '../../../tenant/tenantHomepageCars';
import type { BuilderSelectedSection } from './BuilderStructurePanel';
import BuilderSectionStyleControls from './BuilderSectionStyleControls';
import FeaturedCarsSelector from './FeaturedCarsSelector';
import TenantMediaField from './TenantMediaField';
import BuilderThemeColorFieldRow from './BuilderThemeColorFieldRow';
import BuilderThemeCarousel, { type BuilderThemeCarouselProps } from './BuilderThemeCarousel';
import './BuilderInspector.css';

export const SITE_BUILDER_THEME_PRESETS = [
  {
    id: 'ocean',
    label: 'אוקיינוס',
    primary: '#0369a1',
    secondary: '#0c4a6e',
    accent: '#38bdf8',
    text: '#0f172a',
    background: '#f8fafc',
  },
  {
    id: 'slate',
    label: 'אפור עמוק',
    primary: '#334155',
    secondary: '#1e293b',
    accent: '#94a3b8',
    text: '#0f172a',
    background: '#f1f5f9',
  },
  {
    id: 'forest',
    label: 'ירוק מכירות',
    primary: '#166534',
    secondary: '#14532d',
    accent: '#4ade80',
    text: '#14532d',
    background: '#f0fdf4',
  },
  {
    id: 'sunset',
    label: 'שקיעה',
    primary: '#c2410c',
    secondary: '#9a3412',
    accent: '#fb923c',
    text: '#431407',
    background: '#fff7ed',
  },
  {
    id: 'lux',
    label: 'שחור־זהב',
    primary: '#1c1917',
    secondary: '#292524',
    accent: '#d4af37',
    text: '#1c1917',
    background: '#fafaf9',
  },
] as const;

export type BuilderInspectorProps = {
  selected: BuilderSelectedSection;
  formBusy: boolean;
  uploadingKind: TenantSiteMediaKind | null;
  uploadProgressPercent?: number | null;
  yardLogoUrl: string | null;
  tenantNameFallback: string | null;
  previewDisplayName: string;
  previewSeoTitle: string;
  onLogoFiles: (files: FileList | null) => void;
  onHeroFiles: (files: FileList | null) => void;
  onOgFiles: (files: FileList | null) => void;
  logoUploadError?: string | null;
  heroUploadError?: string | null;
  ogUploadError?: string | null;
  onApplyYardLogo: () => void;
  siteName: string;
  setSiteName: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  heroImageUrl: string;
  setHeroImageUrl: (v: string) => void;
  primaryColor: string;
  setPrimaryColor: (v: string) => void;
  secondaryColor: string;
  setSecondaryColor: (v: string) => void;
  accentColor: string;
  setAccentColor: (v: string) => void;
  textColor: string;
  setTextColor: (v: string) => void;
  backgroundColor: string;
  setBackgroundColor: (v: string) => void;
  themeVariant: string;
  setThemeVariant: (v: string) => void;
  heroTitle: string;
  setHeroTitle: (v: string) => void;
  heroSubtitle: string;
  setHeroSubtitle: (v: string) => void;
  heroCtaText: string;
  setHeroCtaText: (v: string) => void;
  heroCtaLink: string;
  setHeroCtaLink: (v: string) => void;
  heroFocalX: number;
  setHeroFocalX: (v: number) => void;
  heroFocalY: number;
  setHeroFocalY: (v: number) => void;
  aboutTitle: string;
  setAboutTitle: (v: string) => void;
  aboutText: string;
  setAboutText: (v: string) => void;
  showAbout: boolean;
  setShowAbout: (v: boolean) => void;
  benefitsTitle: string;
  setBenefitsTitle: (v: string) => void;
  benefitsItemsText: string;
  setBenefitsItemsText: (v: string) => void;
  showBenefits: boolean;
  setShowBenefits: (v: boolean) => void;
  financeTitle: string;
  setFinanceTitle: (v: string) => void;
  financeText: string;
  setFinanceText: (v: string) => void;
  showFinance: boolean;
  setShowFinance: (v: boolean) => void;
  testimonialsTitle: string;
  setTestimonialsTitle: (v: string) => void;
  testimonialsText: string;
  setTestimonialsText: (v: string) => void;
  showTestimonials: boolean;
  setShowTestimonials: (v: boolean) => void;
  contactTitle: string;
  setContactTitle: (v: string) => void;
  contactSubtitle: string;
  setContactSubtitle: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  whatsapp: string;
  setWhatsapp: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  facebookUrl: string;
  setFacebookUrl: (v: string) => void;
  instagramUrl: string;
  setInstagramUrl: (v: string) => void;
  websiteUrl: string;
  setWebsiteUrl: (v: string) => void;
  showContact: boolean;
  setShowContact: (v: boolean) => void;
  showMap: boolean;
  setShowMap: (v: boolean) => void;
  seoTitle: string;
  setSeoTitle: (v: string) => void;
  seoDescription: string;
  setSeoDescription: (v: string) => void;
  ogImageUrl: string;
  setOgImageUrl: (v: string) => void;
  yardUid: string;
  setYardUid: (v: string) => void;
  sellerUid: string;
  setSellerUid: (v: string) => void;
  showFeaturedCars: boolean;
  setShowFeaturedCars: (v: boolean) => void;
  featuredCarIds: string[];
  homepageSelectionMeta: TenantHomepageSelectionMeta;
  builderInventoryCars: PublicCar[];
  builderInventoryLoading: boolean;
  builderInventoryError: string | null;
  yardPhone?: string | null;
  yardWhatsapp?: string | null;
  yardEmail?: string | null;
  yardAddress?: string | null;
  yardCity?: string | null;
  yardWebsite?: string | null;
  sectionStyles: Record<TenantHomeSectionKey, TenantSectionStyle>;
  onChangeSectionStyle: (
    key: TenantHomeSectionKey,
    next: TenantSectionStyle,
    inheritBreak?: 'style' | 'accent' | 'both',
  ) => void;
  onResetSectionStyle: (key: TenantHomeSectionKey) => void;
  /** Copy current section style to all non-hero sections (capability-safe). */
  onApplySectionStyleToAll?: (template: TenantSectionStyle) => void;
  siteThemePackKey: string;
  onSelectSiteThemePack: (pack: ThemeBrandPreset) => void;
  onApplySiteThemePackBranding: (pack: ThemeBrandPreset) => void;
  onClearSiteThemePack: () => void;
  onForceSiteThemeToSections: () => void;
  onClearSectionThemeInheritance: () => void;
  sectionInheritsSiteThemeStyle: Partial<Record<TenantHomeSectionKey, boolean>>;
  sectionInheritsSiteThemeAccent: Partial<Record<TenantHomeSectionKey, boolean>>;
  brandingResolutionLayout: TenantHomeBrandingResolutionLayout;
  normalizedBrandingForTheme: NormalizedTenantBranding;
  appliedThemeSnapshot: NormalizedAppliedThemeSnapshot | null;
  onBreakSectionFromSiteTheme: (key: TenantHomeSectionKey) => void;
  onBreakSectionStyleFromSiteTheme: (key: TenantHomeSectionKey) => void;
  onBreakSectionAccentFromSiteTheme: (key: TenantHomeSectionKey) => void;
  onLinkSectionToSiteTheme: (key: TenantHomeSectionKey) => void;
  onLinkSectionStyleToTheme: (key: TenantHomeSectionKey) => void;
  onLinkSectionAccentToTheme: (key: TenantHomeSectionKey) => void;
  onRevertSectionStyleToTheme?: (key: TenantHomeSectionKey) => void;
  themeAccentStrategy: NormalizedThemeAccentStrategy | null;
  onThemeAccentStrategyChange: (next: NormalizedThemeAccentStrategy | null) => void;
  onRevertSectionAccentToTheme?: (key: TenantHomeSectionKey) => void;
  onUpgradeAppliedThemeFromLivePack?: () => void;
  onForceApplyThemeStyleToSections: () => void;
  onForceApplyThemeAccentToSections: () => void;
  themeCarousel?: BuilderThemeCarouselProps | null;
};

function sectionHeading(selected: BuilderSelectedSection): string {
  if (selected === null) return 'הגדרות אתר ומיתוג';
  return TENANT_HOME_SECTION_LABELS_HE[selected];
}

export default function BuilderInspector(p: BuilderInspectorProps) {
  const ph = (field: string, val: string | null | undefined) => (val?.trim() ? val.trim() : field);
  const uploadProgressForKind = (kind: TenantSiteMediaKind) =>
    p.uploadingKind === kind ? p.uploadProgressPercent ?? null : null;

  const normalizedSectionStyles = useMemo(
    () => normalizeTenantSectionStylesRecord(p.sectionStyles),
    [p.sectionStyles],
  );

  const layoutForResolution = useMemo(
    (): TenantHomeBrandingResolutionLayout => ({
      ...p.brandingResolutionLayout,
      sectionStyles: normalizedSectionStyles,
    }),
    [p.brandingResolutionLayout, normalizedSectionStyles],
  );

  const hiveAccentResolution = useMemo(() => {
    if (p.selected === null || p.selected === 'hero') return null;
    return resolveSectionHiveAccentResolution(p.selected, layoutForResolution, p.normalizedBrandingForTheme);
  }, [p.selected, layoutForResolution, p.normalizedBrandingForTheme]);

  const selectedKey = p.selected !== null && p.selected !== 'hero' ? (p.selected as TenantHomeSectionKey) : null;
  const inheritsStyle = selectedKey != null && p.sectionInheritsSiteThemeStyle[selectedKey] === true;
  const inheritsAccent = selectedKey != null && p.sectionInheritsSiteThemeAccent[selectedKey] === true;
  const snapActive = isAppliedSnapshotActiveForPack(
    p.appliedThemeSnapshot,
    p.normalizedBrandingForTheme.siteThemePackKey,
  );

  const [activeThemeColorFieldId, setActiveThemeColorFieldId] = useState<string | null>(null);

  const globalBlock = (
    <>
      <div className="builder-inspector__section">
        <h4 className="builder-inspector__section-title">זהות</h4>
        <div className="form-grid">
          <label>
            שם פנימי (siteName)
            <input
              value={p.siteName}
              onChange={(e) => p.setSiteName(e.target.value)}
              dir="ltr"
              placeholder={ph('שם מהחשבון SaaS', p.tenantNameFallback)}
            />
          </label>
          <label>
            שם מוצג
            <input
              value={p.displayName}
              onChange={(e) => p.setDisplayName(e.target.value)}
              placeholder={ph('שם מפרופיל החצר', p.previewDisplayName)}
            />
          </label>
        </div>
      </div>

      <div className="builder-inspector__section">
        <h4 className="builder-inspector__section-title">לוגו</h4>
        <TenantMediaField
          label="לוגו האתר"
          description="העלאה ל-Storage או כתובת URL (מתקדם). ללא לוגו מותאם — יוצג לוגו מפרופיל החצר אוטומטית בתצוגה ובאתר החי."
          currentUrl={p.logoUrl}
          previewUrl={p.logoUrl.trim() || p.yardLogoUrl?.trim() || undefined}
          sourceMode={p.logoUrl.trim() ? 'custom' : p.yardLogoUrl?.trim() ? 'fallback' : 'empty'}
          onUrlChange={p.setLogoUrl}
          onPickFiles={p.onLogoFiles}
          uploading={p.uploadingKind === 'logo'}
          uploadProgressPercent={uploadProgressForKind('logo')}
          disabled={p.formBusy}
          errorMessage={p.logoUploadError ?? null}
          extraActions={
            p.yardLogoUrl ? (
              <button type="button" className="tenant-media-field__btn" disabled={p.formBusy} onClick={p.onApplyYardLogo}>
                השתמש בלוגו החצר
              </button>
            ) : null
          }
        />
      </div>

      <BuilderSiteThemePanel
        formBusy={p.formBusy}
        primaryColor={p.primaryColor}
        secondaryColor={p.secondaryColor}
        accentColor={p.accentColor}
        siteThemePackKey={p.siteThemePackKey}
        appliedThemeSnapshot={p.appliedThemeSnapshot}
        themeAccentStrategy={p.themeAccentStrategy}
        onThemeAccentStrategyChange={p.onThemeAccentStrategyChange}
        onSelectPack={p.onSelectSiteThemePack}
        onApplyThemeBranding={p.onApplySiteThemePackBranding}
        onClearPack={p.onClearSiteThemePack}
        onForceApplyThemeToSections={p.onForceSiteThemeToSections}
        onForceApplyThemeStyleToSections={p.onForceApplyThemeStyleToSections}
        onForceApplyThemeAccentToSections={p.onForceApplyThemeAccentToSections}
        onClearSectionInheritance={p.onClearSectionThemeInheritance}
        onUpgradeAppliedThemeFromLivePack={p.onUpgradeAppliedThemeFromLivePack}
      />

      {p.themeCarousel ? <BuilderThemeCarousel {...p.themeCarousel} /> : null}

      <div className="builder-inspector__section">
        <h4 className="builder-inspector__section-title">צבעים וערכת נושא</h4>
        <div className="builder-inspector__swatches">
          <span className="builder-inspector__swatch-label">תצוגה מהירה</span>
          {[p.primaryColor, p.secondaryColor, p.accentColor, p.textColor, p.backgroundColor].map((c, i) =>
            c.trim() ? <span key={i} className="builder-inspector__swatch" style={{ background: c.trim() }} title={c.trim()} /> : null,
          )}
        </div>
        <p className="builder-inspector__subtitle" style={{ marginBottom: '0.5rem' }}>
          ערכות מוכנות (ניתן לכוון ידנית אחרי החלה)
        </p>
        <div className="builder-inspector__presets">
          {SITE_BUILDER_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="builder-inspector__preset-btn"
              disabled={p.formBusy}
              onClick={() => {
                setActiveThemeColorFieldId(null);
                p.setPrimaryColor(preset.primary);
                p.setSecondaryColor(preset.secondary);
                p.setAccentColor(preset.accent);
                p.setTextColor(preset.text);
                p.setBackgroundColor(preset.background);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="builder-inspector__theme-colors" style={{ marginTop: '0.65rem' }}>
          <BuilderThemeColorFieldRow
            fieldId="theme-primary"
            label="צבע ראשי"
            value={p.primaryColor}
            onChange={p.setPrimaryColor}
            disabled={p.formBusy}
            placeholder="#0055aa"
            activeFieldId={activeThemeColorFieldId}
            onActiveFieldChange={setActiveThemeColorFieldId}
          />
          <BuilderThemeColorFieldRow
            fieldId="theme-secondary"
            label="צבע משני"
            value={p.secondaryColor}
            onChange={p.setSecondaryColor}
            disabled={p.formBusy}
            placeholder="#0c4a6e"
            activeFieldId={activeThemeColorFieldId}
            onActiveFieldChange={setActiveThemeColorFieldId}
          />
          <BuilderThemeColorFieldRow
            fieldId="theme-accent"
            label="הדגשה"
            value={p.accentColor}
            onChange={p.setAccentColor}
            disabled={p.formBusy}
            placeholder="#38bdf8"
            activeFieldId={activeThemeColorFieldId}
            onActiveFieldChange={setActiveThemeColorFieldId}
          />
          <BuilderThemeColorFieldRow
            fieldId="theme-text"
            label="טקסט"
            value={p.textColor}
            onChange={p.setTextColor}
            disabled={p.formBusy}
            placeholder="#0f172a"
            activeFieldId={activeThemeColorFieldId}
            onActiveFieldChange={setActiveThemeColorFieldId}
          />
          <BuilderThemeColorFieldRow
            fieldId="theme-background"
            label="רקע"
            value={p.backgroundColor}
            onChange={p.setBackgroundColor}
            disabled={p.formBusy}
            placeholder="#f8fafc"
            activeFieldId={activeThemeColorFieldId}
            onActiveFieldChange={setActiveThemeColorFieldId}
          />
        </div>
        <div className="form-grid" style={{ marginTop: '0.65rem' }}>
          <label>
            סגנון
            <select value={p.themeVariant} onChange={(e) => p.setThemeVariant(e.target.value)}>
              <option value="classic">קלאסי</option>
              <option value="modern">מודרני</option>
              <option value="luxury">יוקרתי</option>
              <option value="minimal">מינימליסטי</option>
            </select>
          </label>
        </div>
      </div>

      <div className="builder-inspector__section">
        <h4 className="builder-inspector__section-title">SEO ושיתוף</h4>
        <div className="form-grid">
          <label>
            כותרת (meta title)
            <input value={p.seoTitle} onChange={(e) => p.setSeoTitle(e.target.value)} placeholder={p.previewSeoTitle} />
          </label>
          <label>
            תיאור (meta description)
            <textarea value={p.seoDescription} onChange={(e) => p.setSeoDescription(e.target.value)} rows={3} />
          </label>
        </div>
        <TenantMediaField
          label="תמונת Open Graph"
          description="מומלץ לשיתוף בוואטסאפ ורשתות חברתיות."
          currentUrl={p.ogImageUrl}
          onUrlChange={p.setOgImageUrl}
          onPickFiles={p.onOgFiles}
          uploading={p.uploadingKind === 'og'}
          uploadProgressPercent={uploadProgressForKind('og')}
          disabled={p.formBusy}
          errorMessage={p.ogUploadError ?? null}
        />
        <div className="builder-inspector__section-title" style={{ marginTop: '0.75rem' }}>
          תצוגה מקדימה לשיתוף
        </div>
        <div className="builder-inspector__og-preview">
          {p.ogImageUrl.trim() ? (
            <img src={p.ogImageUrl.trim()} alt="" className="builder-inspector__og-preview-img" />
          ) : (
            <div className="builder-inspector__og-preview-img" />
          )}
          <div className="builder-inspector__og-preview-body">
            <p className="builder-inspector__og-preview-title">{p.seoTitle.trim() || p.previewSeoTitle}</p>
            <p className="builder-inspector__og-preview-desc">
              {p.seoDescription.trim() || 'תיאור יופיע כאן כשתמלאו את שדה ה-SEO.'}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  const heroBlock = (
    <>
      <TenantMediaField
        label="תמונת Hero"
        description="רקע הכותרת הראשית בדף הבית."
        currentUrl={p.heroImageUrl}
        onUrlChange={p.setHeroImageUrl}
        onPickFiles={p.onHeroFiles}
        uploading={p.uploadingKind === 'hero'}
        uploadProgressPercent={uploadProgressForKind('hero')}
        disabled={p.formBusy}
        errorMessage={p.heroUploadError ?? null}
        belowActions={
          <>
            <p className="tenant-media-field__focal-placeholder">
              נקודת מיקוד (שלב ב׳): המדרגים למטה מעדכנים את אזור החיתוך בתצוגה החיה.
            </p>
          </>
        }
      />
      <div className="builder-inspector__section" style={{ marginTop: '0.75rem' }}>
        <h4 className="builder-inspector__section-title">מיקוד תמונה (שלב ב׳ — יישום מלא בהמשך)</h4>
        <p className="builder-inspector__subtitle">מיקום נקודת המיקוד משפיע על אזור התמונה שמוצג מאחורי הטקסט.</p>
        <div className="builder-inspector__focal-grid">
          <label>
            אופקי ({p.heroFocalX}%)
            <input
              type="range"
              min={0}
              max={100}
              value={p.heroFocalX}
              onChange={(e) => p.setHeroFocalX(Number(e.target.value))}
              disabled={p.formBusy}
            />
          </label>
          <label>
            אנכי ({p.heroFocalY}%)
            <input
              type="range"
              min={0}
              max={100}
              value={p.heroFocalY}
              onChange={(e) => p.setHeroFocalY(Number(e.target.value))}
              disabled={p.formBusy}
            />
          </label>
        </div>
      </div>
      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <label>
          כותרת
          <input value={p.heroTitle} onChange={(e) => p.setHeroTitle(e.target.value)} placeholder="ברירת מחדל: שם מוצג" />
        </label>
        <label>
          תת-כותרת
          <input value={p.heroSubtitle} onChange={(e) => p.setHeroSubtitle(e.target.value)} />
        </label>
        <label>
          טקסט כפתור (CTA)
          <input value={p.heroCtaText} onChange={(e) => p.setHeroCtaText(e.target.value)} />
        </label>
        <label>
          קישור הכפתור
          <input value={p.heroCtaLink} onChange={(e) => p.setHeroCtaLink(e.target.value)} dir="ltr" placeholder="/cars או https://…" />
        </label>
      </div>
    </>
  );

  let body: ReactNode = null;
  if (p.selected === null) {
    body = globalBlock;
  } else {
    switch (p.selected as TenantHomeSectionKey) {
      case 'hero':
        body = heroBlock;
        break;
      case 'featuredCars':
        body = (
          <FeaturedCarsSelector
            yardUid={p.yardUid}
            sellerUid={p.sellerUid}
            onYardUid={p.setYardUid}
            onSellerUid={p.setSellerUid}
            showFeaturedCars={p.showFeaturedCars}
            onShowFeaturedCars={p.setShowFeaturedCars}
            inventoryLoading={p.builderInventoryLoading}
            inventoryError={p.builderInventoryError}
            featuredCarIds={p.featuredCarIds}
            homepageSelectionMeta={p.homepageSelectionMeta}
            formBusy={p.formBusy}
          />
        );
        break;
      case 'about':
        body = (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showAbout} onChange={(e) => p.setShowAbout(e.target.checked)} disabled={p.formBusy} />
              הצג סקשן אודות
            </label>
            <div className="form-grid" style={{ marginTop: '0.65rem' }}>
              <label>
                כותרת
                <input value={p.aboutTitle} onChange={(e) => p.setAboutTitle(e.target.value)} />
              </label>
              <label>
                תוכן
                <textarea value={p.aboutText} onChange={(e) => p.setAboutText(e.target.value)} rows={5} />
              </label>
            </div>
          </>
        );
        break;
      case 'benefits':
        body = (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showBenefits} onChange={(e) => p.setShowBenefits(e.target.checked)} disabled={p.formBusy} />
              הצג סקשן יתרונות
            </label>
            <div className="form-grid" style={{ marginTop: '0.65rem' }}>
              <label>
                כותרת
                <input value={p.benefitsTitle} onChange={(e) => p.setBenefitsTitle(e.target.value)} />
              </label>
              <label>
                פריטים (שורה לכל פריט)
                <textarea value={p.benefitsItemsText} onChange={(e) => p.setBenefitsItemsText(e.target.value)} rows={5} />
              </label>
            </div>
          </>
        );
        break;
      case 'finance':
        body = (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showFinance} onChange={(e) => p.setShowFinance(e.target.checked)} disabled={p.formBusy} />
              הצג סקשן מימון
            </label>
            <div className="form-grid" style={{ marginTop: '0.65rem' }}>
              <label>
                כותרת
                <input value={p.financeTitle} onChange={(e) => p.setFinanceTitle(e.target.value)} />
              </label>
              <label>
                תוכן
                <textarea value={p.financeText} onChange={(e) => p.setFinanceText(e.target.value)} rows={4} />
              </label>
            </div>
          </>
        );
        break;
      case 'testimonials':
        body = (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showTestimonials} onChange={(e) => p.setShowTestimonials(e.target.checked)} disabled={p.formBusy} />
              הצג סקשן המלצות
            </label>
            <div className="form-grid" style={{ marginTop: '0.65rem' }}>
              <label>
                כותרת
                <input value={p.testimonialsTitle} onChange={(e) => p.setTestimonialsTitle(e.target.value)} />
              </label>
              <label>
                תוכן
                <textarea value={p.testimonialsText} onChange={(e) => p.setTestimonialsText(e.target.value)} rows={4} />
              </label>
            </div>
          </>
        );
        break;
      case 'contact':
        body = (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showContact} onChange={(e) => p.setShowContact(e.target.checked)} disabled={p.formBusy} />
              הצג סקשן יצירת קשר
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showMap} onChange={(e) => p.setShowMap(e.target.checked)} disabled={p.formBusy} />
              הצג קישור למפה (כשיש כתובת)
            </label>
            <p className="builder-inspector__subtitle">שדות ריקים יושלמו מפרופיל החצר בתצוגה ובאתר, עד שתשמרו ערך מפורש.</p>
            <div className="form-grid" style={{ marginTop: '0.65rem' }}>
              <label>
                כותרת הסקשן
                <input value={p.contactTitle} onChange={(e) => p.setContactTitle(e.target.value)} />
              </label>
              <label>
                תת-כותרת
                <input value={p.contactSubtitle} onChange={(e) => p.setContactSubtitle(e.target.value)} />
              </label>
              <label>
                טלפון
                <input value={p.phone} onChange={(e) => p.setPhone(e.target.value)} dir="ltr" placeholder={ph('מחצר', p.yardPhone)} />
              </label>
              <label>
                וואטסאפ
                <input value={p.whatsapp} onChange={(e) => p.setWhatsapp(e.target.value)} dir="ltr" placeholder={ph('מחצר', p.yardWhatsapp)} />
              </label>
              <label>
                אימייל
                <input value={p.email} onChange={(e) => p.setEmail(e.target.value)} dir="ltr" placeholder={ph('מחצר', p.yardEmail)} />
              </label>
              <label>
                כתובת
                <input value={p.address} onChange={(e) => p.setAddress(e.target.value)} placeholder={ph('מחצר', p.yardAddress)} />
              </label>
              <label>
                עיר
                <input value={p.city} onChange={(e) => p.setCity(e.target.value)} placeholder={ph('מחצר', p.yardCity)} />
              </label>
              <label>
                פייסבוק
                <input value={p.facebookUrl} onChange={(e) => p.setFacebookUrl(e.target.value)} dir="ltr" placeholder="https://…" />
              </label>
              <label>
                אינסטגרם
                <input value={p.instagramUrl} onChange={(e) => p.setInstagramUrl(e.target.value)} dir="ltr" placeholder="https://…" />
              </label>
              <label>
                אתר חיצוני
                <input value={p.websiteUrl} onChange={(e) => p.setWebsiteUrl(e.target.value)} dir="ltr" placeholder={ph('מחצר', p.yardWebsite)} />
              </label>
            </div>
          </>
        );
        break;
      case 'map':
        body = (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={p.showMap} onChange={(e) => p.setShowMap(e.target.checked)} disabled={p.formBusy} />
              הצג סקשן מפה בדף הבית
            </label>
            <p className="builder-inspector__subtitle">
              הסקשן משתמש בכתובת ובעיר מסקשן &quot;יצירת קשר&quot;. ודאו שמילאתם אותם שם או שפרטי החצר זמינים כברירת מחדל.
            </p>
            <p className="builder-inspector__subtitle">
              כתובת נוכחית בתצוגה: {[p.address, p.city].filter(Boolean).join(', ') || '—'}
            </p>
          </>
        );
        break;
      default:
        body = <p className="builder-inspector__subtitle">אין שדות נוספים לסקשן זה.</p>;
    }
  }

  let sectionStyleEditor: ReactNode = null;
  if (p.selected !== null && p.selected !== 'hero') {
    const onRevertSectionStyleToThemeStable = p.onRevertSectionStyleToTheme;
    const caps = TENANT_SECTION_STYLE_CAPABILITIES[p.selected];
    if (caps && Object.values(caps).some(Boolean)) {
      sectionStyleEditor = (
        <BuilderSectionStyleControls
          sectionKey={p.selected}
          value={normalizedSectionStyles[p.selected]}
          storedSectionStyle={normalizedSectionStyles[p.selected]}
          capabilities={caps}
          disabled={p.formBusy}
          accentFallbackHex={p.primaryColor.trim() || '#0ea5e9'}
          onChange={(next, inheritBreak) =>
            p.onChangeSectionStyle(p.selected as TenantHomeSectionKey, next, inheritBreak ?? 'both')
          }
          onReset={() => p.onResetSectionStyle(p.selected as TenantHomeSectionKey)}
          onApplyStyleToAllSections={
            p.onApplySectionStyleToAll
              ? () => {
                  const k = p.selected as TenantHomeSectionKey;
                  p.onApplySectionStyleToAll?.(normalizedSectionStyles[k]);
                }
              : undefined
          }
          inheritsSiteThemeStyle={inheritsStyle}
          inheritsSiteThemeAccent={inheritsAccent}
          onBreakStyleFromSiteTheme={() => p.onBreakSectionStyleFromSiteTheme(p.selected as TenantHomeSectionKey)}
          onBreakAccentFromSiteTheme={() => p.onBreakSectionAccentFromSiteTheme(p.selected as TenantHomeSectionKey)}
          onBreakAllFromSiteTheme={() => p.onBreakSectionFromSiteTheme(p.selected as TenantHomeSectionKey)}
          onLinkStyleToSiteTheme={() => p.onLinkSectionStyleToTheme(p.selected as TenantHomeSectionKey)}
          onLinkAccentToSiteTheme={() => p.onLinkSectionAccentToTheme(p.selected as TenantHomeSectionKey)}
          onLinkAllToSiteTheme={() => p.onLinkSectionToSiteTheme(p.selected as TenantHomeSectionKey)}
          hiveAccentResolution={hiveAccentResolution}
          onRevertAccentToTheme={
            p.onRevertSectionAccentToTheme
              ? () => p.onRevertSectionAccentToTheme?.(p.selected as TenantHomeSectionKey)
              : undefined
          }
          onRevertStyleToTheme={
            onRevertSectionStyleToThemeStable
              ? () => onRevertSectionStyleToThemeStable(p.selected as TenantHomeSectionKey)
              : undefined
          }
        />
      );
    }
  }

  return (
    <aside className="builder-inspector" aria-label="חלונית עריכה">
      <div>
        <h3 className="builder-inspector__title">{sectionHeading(p.selected)}</h3>
        <p className="builder-inspector__subtitle">
          {p.selected === null
            ? 'מיתוג, צבעים, לוגו, SEO ותצוגת שיתוף.'
            : `עריכת הסקשן «${TENANT_HOME_SECTION_LABELS_HE[p.selected]}» בלבד.`}
        </p>
      </div>
      {sectionStyleEditor}
      {body}
      {import.meta.env.DEV && selectedKey != null ? (
        <div className="builder-inspector__debug-branding" aria-label="מידע תצורת מיתוג (פיתוח בלבד)">
          <div className="builder-inspector__debug-branding-title">מיתוג — מצב יעיל (Dev)</div>
          <ul className="builder-inspector__debug-branding-list">
            <li>ערכה: {p.normalizedBrandingForTheme.siteThemePackKey ?? '—'}</li>
            <li>
              צילום ערכה: {snapActive ? `כן (גרסת חבילה ${p.appliedThemeSnapshot?.packVersion ?? '—'})` : 'לא — נטען מרישום העדכני'}
            </li>
            <li>מקור הנחיית גוון: {hiveAccentResolution?.strategyOrigin ?? '—'}</li>
            <li>מקור ברירות ערכה מהחבילה: {hiveAccentResolution?.themePackDefaultsSource ?? '—'}</li>
            <li>סגנון סקשן מערכה: {inheritsStyle ? 'מקושר' : 'מקומי'}</li>
            <li>גוון סקשן מערכה: {inheritsAccent ? 'מקושר' : 'מקומי'}</li>
            <li>מקור גוון Hive: {hiveAccentResolution?.source ?? '—'}</li>
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
