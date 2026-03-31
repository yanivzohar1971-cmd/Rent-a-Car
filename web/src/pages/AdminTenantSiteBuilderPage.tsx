import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchPublicCars, type PublicCar } from '../api/publicCarsApi';
import { listTenantDomains } from '../api/tenantDomainsApi';
import { getTenantSiteConfigByTenantId, upsertTenantSiteConfig, type TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import { deleteField } from '../firebase/firebaseClient';
import {
  BASIC_PLAN_MAX_CARS,
  computeTenantPublicSiteSuspended,
  getTenantById,
  type Tenant,
} from '../api/tenantsApi';
import { fetchAllYardsForAdmin, type AdminYardSummary } from '../api/adminYardsApi';
import {
  assertSafeTenantIdForStoragePath,
  uploadTenantSiteMedia,
  validateTenantSiteImageFile,
  type TenantSiteMediaKind,
} from '../api/tenantSiteMediaApi';
import { loadYardPublicProfile, type YardProfileData } from '../api/yardProfileApi';
import BuilderCanvas from '../components/admin/siteBuilder/BuilderCanvas';
import type { BuilderCanvasViewport } from '../components/admin/siteBuilder/BuilderCanvas';
import {
  parseBuilderFormBaselineSnapshot,
  type BuilderFormBaselineSnapshot,
} from '../components/admin/siteBuilder/builderFormBaseline';
import BuilderInspector from '../components/admin/siteBuilder/BuilderInspector';
import ScreenshotImportPanel from '../components/admin/siteBuilder/ScreenshotImportPanel';
import BuilderStructurePanel, {
  type BuilderSelectedSection,
} from '../components/admin/siteBuilder/BuilderStructurePanel';
import TenantHomeSectionsView from '../components/tenant/TenantHomeSectionsView';
import {
  DEFAULT_TENANT_SECTION_STYLE,
  applySectionStyleRespectingCapabilities,
  buildAppliedThemeSnapshotFromPreset,
  getUnsupportedHomeSectionKeys,
  normalizeTenantSectionStylesRecord,
  normalizeHomeSectionOrderForBuilder,
  normalizeTenantSiteConfig,
  parseHomeSectionsList,
  serializeAppliedThemeSnapshotForFirestore,
  serializeSiteThemeSectionDefaultsForFirestore,
  TENANT_HOME_SECTION_KEYS,
  TENANT_HOME_SECTION_LABELS_HE,
  TENANT_SECTION_STYLE_CAPABILITIES,
  type NormalizedAppliedThemeSnapshot,
  type NormalizedTenantBranding,
  type TenantHomeBrandingResolutionLayout,
  type TenantSectionStyle,
  validateColorInput,
  validateOptionalUrl,
  validateOptionalUrlOrPath,
  type TenantHomeSectionKey,
} from '../tenant/tenantSiteConfig';
import { getThemeBrandPresetByKey, type ThemeBrandPreset } from '../tenant/themeBrandPresets';
import {
  coerceImportedTenantSiteConfig,
  devLogTenantSiteConfigImport,
  mergeTenantSiteConfigWritePayload,
  normalizeTenantSiteConfigImport,
  type ScreenshotDerivedSiteConfigImportInput,
} from '../tenant/tenantSiteConfigImport';
import { buildThemeCarouselApplyImportInputForPackKey } from '../tenant/themeCarouselApply';
import {
  serializeThemeAccentStrategyForFirestore,
  type NormalizedThemeAccentStrategy,
} from '../tenant/themeAccentStrategy';
import { resolveEffectiveSectionStyle } from '../tenant/effectiveSectionStyle';
import {
  getTenantHomepageSelectionMeta,
  tenantHomepageBuilderSummaryHe,
  type TenantHomepageSelectionMeta,
} from '../tenant/tenantHomepageCars';
import { isTenantHomeSectionFeatureEnabled } from '../tenant/builderSectionVisibility';
import { finalizeTenantRuntimeBranding, tenantBrandingFromNormalized } from '../tenant/tenantBranding';
import './AdminTenantSiteBuilderPage.css';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function firestoreErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === 'string' ? c : '';
  }
  return '';
}

/** DEV-only: permission traces for builder support (avoid noise in production). */
function debugLogBuilderFirestore(context: string, err: unknown, meta: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  if (firestoreErrorCode(err) !== 'permission-denied') return;
  console.debug(`[AdminTenantSiteBuilder] ${context}`, { ...meta, code: firestoreErrorCode(err) });
}

function str(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v;
}

type BuilderScope = {
  selectedYardId: string;
  yardUid: string;
  legacyTenantId: string;
  usingLegacyTenantFallback: boolean;
};

function resolveBuilderScopeFromSelectedYard(selectedYardIdInput: string, legacyTenantIdInput: string): BuilderScope | null {
  const selectedYardId = selectedYardIdInput.trim();
  if (selectedYardId) {
    return {
      selectedYardId,
      yardUid: selectedYardId,
      legacyTenantId: selectedYardId,
      usingLegacyTenantFallback: false,
    };
  }
  const legacyTenantId = legacyTenantIdInput.trim();
  if (!legacyTenantId) return null;
  return {
    selectedYardId: '',
    yardUid: '',
    legacyTenantId,
    usingLegacyTenantFallback: true,
  };
}

function buildSyntheticConfig(
  tenantId: string,
  s: {
    siteName: string;
    displayName: string;
    logoUrl: string;
    heroImageUrl: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    textColor: string;
    backgroundColor: string;
    themeVariant: string;
    heroTitle: string;
    heroSubtitle: string;
    heroCtaText: string;
    heroCtaLink: string;
    aboutTitle: string;
    aboutText: string;
    benefitsTitle: string;
    benefitsItemsText: string;
    financeTitle: string;
    financeText: string;
    contactTitle: string;
    contactSubtitle: string;
    testimonialsTitle: string;
    testimonialsText: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    city: string;
    facebookUrl: string;
    instagramUrl: string;
    websiteUrl: string;
    seoTitle: string;
    seoDescription: string;
    ogImageUrl: string;
    sectionOrder: TenantHomeSectionKey[];
    showFeaturedCars: boolean;
    showAbout: boolean;
    showBenefits: boolean;
    showFinance: boolean;
    showTestimonials: boolean;
    showContact: boolean;
    showMap: boolean;
    yardUid: string;
    sellerUid: string;
    featuredCarIds: string[];
    sectionStyles: Record<TenantHomeSectionKey, TenantSectionStyle>;
    siteThemePackKey: string;
    sectionInheritsSiteTheme: Partial<Record<TenantHomeSectionKey, boolean>>;
    sectionInheritsSiteThemeStyle: Partial<Record<TenantHomeSectionKey, boolean>>;
    sectionInheritsSiteThemeAccent: Partial<Record<TenantHomeSectionKey, boolean>>;
    themeAccentStrategy: NormalizedThemeAccentStrategy | null;
    appliedThemeSnapshot: NormalizedAppliedThemeSnapshot | null;
    siteThemeSectionDefaults: NormalizedTenantBranding['siteThemeSectionDefaults'];
  },
): TenantSiteConfig {
  const branding: Record<string, unknown> = {};
  if (s.siteName.trim()) branding.siteName = s.siteName.trim();
  if (s.displayName.trim()) branding.displayName = s.displayName.trim();
  if (s.logoUrl.trim()) branding.logoUrl = s.logoUrl.trim();
  if (s.heroImageUrl.trim()) branding.heroImageUrl = s.heroImageUrl.trim();
  if (s.primaryColor.trim()) branding.primaryColor = s.primaryColor.trim();
  if (s.secondaryColor.trim()) branding.secondaryColor = s.secondaryColor.trim();
  if (s.accentColor.trim()) branding.accentColor = s.accentColor.trim();
  if (s.textColor.trim()) branding.textColor = s.textColor.trim();
  if (s.backgroundColor.trim()) branding.backgroundColor = s.backgroundColor.trim();
  if (s.themeVariant.trim()) branding.themeVariant = s.themeVariant.trim();
  const themeNested: Record<string, unknown> = {
    siteThemePackKey: s.siteThemePackKey.trim() || null,
  };
  if (s.themeAccentStrategy != null) {
    const ser = serializeThemeAccentStrategyForFirestore(s.themeAccentStrategy);
    if (ser != null) themeNested.accentStrategy = ser;
  }
  if (s.appliedThemeSnapshot != null) {
    themeNested.appliedThemeSnapshot = serializeAppliedThemeSnapshotForFirestore(s.appliedThemeSnapshot);
  }
  const sectionDefaultsSer = serializeSiteThemeSectionDefaultsForFirestore(s.siteThemeSectionDefaults);
  if (sectionDefaultsSer) themeNested.sectionDefaults = sectionDefaultsSer;
  if (
    s.siteThemePackKey.trim() ||
    s.themeAccentStrategy != null ||
    s.appliedThemeSnapshot != null ||
    sectionDefaultsSer
  ) {
    branding.theme = themeNested;
  }

  const benefitsItems = s.benefitsItemsText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const content: Record<string, unknown> = {};
  if (s.heroTitle.trim()) content.heroTitle = s.heroTitle.trim();
  if (s.heroSubtitle.trim()) content.heroSubtitle = s.heroSubtitle.trim();
  if (s.heroCtaText.trim()) content.heroCtaText = s.heroCtaText.trim();
  if (s.heroCtaLink.trim()) content.heroCtaLink = s.heroCtaLink.trim();
  if (s.aboutTitle.trim()) content.aboutTitle = s.aboutTitle.trim();
  if (s.aboutText.trim()) content.aboutText = s.aboutText.trim();
  if (s.benefitsTitle.trim()) content.benefitsTitle = s.benefitsTitle.trim();
  if (benefitsItems.length) content.benefitsItems = benefitsItems;
  if (s.financeTitle.trim()) content.financeTitle = s.financeTitle.trim();
  if (s.financeText.trim()) content.financeText = s.financeText.trim();
  if (s.contactTitle.trim()) content.contactTitle = s.contactTitle.trim();
  if (s.contactSubtitle.trim()) content.contactSubtitle = s.contactSubtitle.trim();
  if (s.testimonialsTitle.trim()) content.testimonialsTitle = s.testimonialsTitle.trim();
  if (s.testimonialsText.trim()) content.testimonialsText = s.testimonialsText.trim();

  const contact: Record<string, unknown> = {};
  if (s.phone.trim()) contact.phone = s.phone.trim();
  if (s.whatsapp.trim()) contact.whatsapp = s.whatsapp.trim();
  if (s.email.trim()) contact.email = s.email.trim();
  if (s.address.trim()) contact.address = s.address.trim();
  if (s.city.trim()) contact.city = s.city.trim();
  if (s.facebookUrl.trim()) contact.facebookUrl = s.facebookUrl.trim();
  if (s.instagramUrl.trim()) contact.instagramUrl = s.instagramUrl.trim();
  if (s.websiteUrl.trim()) contact.websiteUrl = s.websiteUrl.trim();

  const seo: Record<string, unknown> = {};
  if (s.seoTitle.trim()) seo.title = s.seoTitle.trim();
  if (s.seoDescription.trim()) seo.description = s.seoDescription.trim();
  if (s.ogImageUrl.trim()) seo.ogImageUrl = s.ogImageUrl.trim();

  const inheritLegacySyn: Record<string, boolean> = {};
  const inheritStyleSyn: Record<string, boolean> = {};
  const inheritAccentSyn: Record<string, boolean> = {};
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k === 'hero') continue;
    if (s.sectionInheritsSiteThemeStyle[k] === true) inheritStyleSyn[k] = true;
    if (s.sectionInheritsSiteThemeAccent[k] === true) inheritAccentSyn[k] = true;
    if (s.sectionInheritsSiteTheme[k] === true) inheritLegacySyn[k] = true;
  }

  const layout: Record<string, unknown> = {
    homeSections: normalizeHomeSectionOrderForBuilder(s.sectionOrder),
    showFeaturedCars: s.showFeaturedCars,
    showAbout: s.showAbout,
    showBenefits: s.showBenefits,
    showFinance: s.showFinance,
    showTestimonials: s.showTestimonials,
    showContact: s.showContact,
    showMap: s.showMap,
    featuredCarIds: [...s.featuredCarIds],
    sectionStyles: s.sectionStyles,
    sectionInheritsSiteTheme: inheritLegacySyn,
    sectionInheritsSiteThemeStyle: inheritStyleSyn,
    sectionInheritsSiteThemeAccent: inheritAccentSyn,
  };

  const dataScope: Record<string, unknown> = {};
  if (s.yardUid.trim()) dataScope.yardUid = s.yardUid.trim();
  if (s.sellerUid.trim()) dataScope.sellerUid = s.sellerUid.trim();

  return {
    tenantId,
    branding,
    content,
    contact,
    seo,
    layout,
    dataScope,
  };
}

export default function AdminTenantSiteBuilderPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAdmin = userProfile?.isAdmin === true;

  const [legacyTenantIdInput, setLegacyTenantIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadedConfigMissing, setLoadedConfigMissing] = useState(false);
  const [rawLayoutHomeSections, setRawLayoutHomeSections] = useState<unknown>(null);
  const [uploadingKind, setUploadingKind] = useState<TenantSiteMediaKind | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [dragSectionIndex, setDragSectionIndex] = useState<number | null>(null);
  const [sectionDropTargetIndex, setSectionDropTargetIndex] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<BuilderSelectedSection>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const builderToolbarActionsRef = useRef<HTMLDivElement>(null);
  const builderToolbarSaveButtonRef = useRef<HTMLButtonElement>(null);
  const [heroFocalX, setHeroFocalX] = useState(50);
  const [heroFocalY, setHeroFocalY] = useState(50);
  const [builderYardProfile, setBuilderYardProfile] = useState<YardProfileData | null>(null);
  /** After a successful load, save/upload target this tenant until the next successful load. Prevents overwriting another tenant by mistake. */
  const [configLoadedForTenantId, setConfigLoadedForTenantId] = useState<string | null>(null);
  const [baselineVersion, setBaselineVersion] = useState(1);
  const [baselineSerialized, setBaselineSerialized] = useState('');
  const [saasTenant, setSaasTenant] = useState<Tenant | null>(null);
  const autoLoadedTenantFromUrl = useRef<string>('');
  /** Prevents overlapping save requests from rapid double-clicks before `saving` state commits. */
  const saveInFlightRef = useRef(false);

  const [siteName, setSiteName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [themeVariant, setThemeVariant] = useState('classic');

  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroCtaText, setHeroCtaText] = useState('');
  const [heroCtaLink, setHeroCtaLink] = useState('');
  const [aboutTitle, setAboutTitle] = useState('');
  const [aboutText, setAboutText] = useState('');
  const [benefitsTitle, setBenefitsTitle] = useState('');
  const [benefitsItemsText, setBenefitsItemsText] = useState('');
  const [financeTitle, setFinanceTitle] = useState('');
  const [financeText, setFinanceText] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactSubtitle, setContactSubtitle] = useState('');
  const [testimonialsTitle, setTestimonialsTitle] = useState('');
  const [testimonialsText, setTestimonialsText] = useState('');

  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');

  const [sectionOrder, setSectionOrder] = useState<TenantHomeSectionKey[]>([...TENANT_HOME_SECTION_KEYS]);
  const [showFeaturedCars, setShowFeaturedCars] = useState(true);
  const [showAbout, setShowAbout] = useState(true);
  const [showBenefits, setShowBenefits] = useState(true);
  const [showFinance, setShowFinance] = useState(true);
  const [showTestimonials, setShowTestimonials] = useState(false);
  const [showContact, setShowContact] = useState(true);
  const [showMap, setShowMap] = useState(false);

  const [yardUid, setYardUid] = useState('');
  const [sellerUid, setSellerUid] = useState('');
  const [featuredCarIds, setFeaturedCarIds] = useState<string[]>([]);
  const [builderInventoryCars, setBuilderInventoryCars] = useState<PublicCar[]>([]);
  const [builderInventoryLoading, setBuilderInventoryLoading] = useState(false);
  const [builderInventoryError, setBuilderInventoryError] = useState<string | null>(null);
  const [sectionStyles, setSectionStyles] = useState<Record<TenantHomeSectionKey, TenantSectionStyle>>(
    normalizeTenantSectionStylesRecord(null),
  );
  const [siteThemePackKey, setSiteThemePackKey] = useState('');
  const [themeAccentStrategy, setThemeAccentStrategy] = useState<NormalizedThemeAccentStrategy | null>(null);
  const [appliedThemeSnapshot, setAppliedThemeSnapshot] = useState<NormalizedAppliedThemeSnapshot | null>(null);
  const [siteThemeSectionDefaults, setSiteThemeSectionDefaults] =
    useState<NormalizedTenantBranding['siteThemeSectionDefaults']>(null);
  const [themeCarouselHoverKey, setThemeCarouselHoverKey] = useState<string | null>(null);
  const [themeCarouselSelectedKey, setThemeCarouselSelectedKey] = useState<string | null>(null);
  const [themeCarouselApplyBusy, setThemeCarouselApplyBusy] = useState(false);
  /** Full Firestore doc before last carousel apply — restores all buckets on undo. */
  const [themeCarouselUndoSnapshot, setThemeCarouselUndoSnapshot] = useState<TenantSiteConfig | null>(null);
  const [sectionInheritsSiteThemeStyle, setSectionInheritsSiteThemeStyle] = useState<
    Partial<Record<TenantHomeSectionKey, boolean>>
  >({});
  const [sectionInheritsSiteThemeAccent, setSectionInheritsSiteThemeAccent] = useState<
    Partial<Record<TenantHomeSectionKey, boolean>>
  >({});
  const sectionInheritsSiteThemeLegacy = useMemo(() => {
    const o: Partial<Record<TenantHomeSectionKey, boolean>> = {};
    for (const k of TENANT_HOME_SECTION_KEYS) {
      if (k === 'hero') continue;
      if (sectionInheritsSiteThemeStyle[k] === true && sectionInheritsSiteThemeAccent[k] === true) o[k] = true;
    }
    return o;
  }, [sectionInheritsSiteThemeStyle, sectionInheritsSiteThemeAccent]);
  const [yards, setYards] = useState<AdminYardSummary[]>([]);
  const [yardsLoading, setYardsLoading] = useState(false);
  const [yardsError, setYardsError] = useState<string | null>(null);
  const [yardSearch, setYardSearch] = useState('');
  const [selectedYardId, setSelectedYardId] = useState('');
  const [previewDevice, setPreviewDevice] = useState<BuilderCanvasViewport>('desktop');
  const [screenshotPreviewNormalized, setScreenshotPreviewNormalized] = useState<ReturnType<
    typeof normalizeTenantSiteConfigImport
  >['normalized'] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    const clear = () => setSectionDropTargetIndex(null);
    document.addEventListener('dragend', clear);
    return () => document.removeEventListener('dragend', clear);
  }, []);

  const urlTenantId = searchParams.get('tenantId')?.trim() ?? '';

  useEffect(() => {
    if (!urlTenantId) return;
    if (yards.some((y) => y.id === urlTenantId)) {
      setSelectedYardId(urlTenantId);
      return;
    }
    setLegacyTenantIdInput(urlTenantId);
  }, [urlTenantId, yards]);

  useEffect(() => {
    if (!configLoadedForTenantId) {
      setSaasTenant(null);
      return;
    }
    let cancelled = false;
    getTenantById(configLoadedForTenantId)
      .then((row) => {
        if (!cancelled) setSaasTenant(row);
      })
      .catch(() => {
        if (!cancelled) setSaasTenant(null);
      });
    return () => {
      cancelled = true;
    };
  }, [configLoadedForTenantId]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setYardsLoading(true);
    setYardsError(null);
    fetchAllYardsForAdmin()
      .then((rows) => {
        if (cancelled) return;
        const sorted = [...rows].sort((a, b) => {
          const an = (a.name || '').trim().toLocaleLowerCase('he');
          const bn = (b.name || '').trim().toLocaleLowerCase('he');
          if (an === bn) return a.id.localeCompare(b.id);
          return an.localeCompare(bn, 'he');
        });
        setYards(sorted);
      })
      .catch(() => {
        if (cancelled) return;
        setYardsError('טעינת רשימת המגרשים נכשלה.');
        setYards([]);
      })
      .finally(() => {
        if (cancelled) return;
        setYardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const formSnapshot = useMemo(
    () => ({
      siteName,
      displayName,
      logoUrl,
      heroImageUrl,
      primaryColor,
      secondaryColor,
      accentColor,
      textColor,
      backgroundColor,
      themeVariant,
      heroTitle,
      heroSubtitle,
      heroCtaText,
      heroCtaLink,
      aboutTitle,
      aboutText,
      benefitsTitle,
      benefitsItemsText,
      financeTitle,
      financeText,
      contactTitle,
      contactSubtitle,
      testimonialsTitle,
      testimonialsText,
      phone,
      whatsapp,
      email,
      address,
      city,
      facebookUrl,
      instagramUrl,
      websiteUrl,
      seoTitle,
      seoDescription,
      ogImageUrl,
      sectionOrder,
      showFeaturedCars,
      showAbout,
      showBenefits,
      showFinance,
      showTestimonials,
      showContact,
      showMap,
      yardUid,
      sellerUid,
      featuredCarIds,
      sectionStyles,
      siteThemePackKey,
      sectionInheritsSiteTheme: sectionInheritsSiteThemeLegacy,
      sectionInheritsSiteThemeStyle,
      sectionInheritsSiteThemeAccent,
      themeAccentStrategy,
      appliedThemeSnapshot,
      siteThemeSectionDefaults,
    }),
    [
      siteName,
      displayName,
      logoUrl,
      heroImageUrl,
      primaryColor,
      secondaryColor,
      accentColor,
      textColor,
      backgroundColor,
      themeVariant,
      heroTitle,
      heroSubtitle,
      heroCtaText,
      heroCtaLink,
      aboutTitle,
      aboutText,
      benefitsTitle,
      benefitsItemsText,
      financeTitle,
      financeText,
      contactTitle,
      contactSubtitle,
      testimonialsTitle,
      testimonialsText,
      phone,
      whatsapp,
      email,
      address,
      city,
      facebookUrl,
      instagramUrl,
      websiteUrl,
      seoTitle,
      seoDescription,
      ogImageUrl,
      sectionOrder,
      showFeaturedCars,
      showAbout,
      showBenefits,
      showFinance,
      showTestimonials,
      showContact,
      showMap,
      yardUid,
      sellerUid,
      featuredCarIds,
      sectionStyles,
      siteThemePackKey,
      sectionInheritsSiteThemeStyle,
      sectionInheritsSiteThemeAccent,
      sectionInheritsSiteThemeLegacy,
      themeAccentStrategy,
      appliedThemeSnapshot,
      siteThemeSectionDefaults,
    ],
  );

  const builderScope = useMemo(
    () => resolveBuilderScopeFromSelectedYard(selectedYardId, legacyTenantIdInput),
    [selectedYardId, legacyTenantIdInput],
  );
  const activeLegacyTenantId = builderScope?.legacyTenantId ?? '';
  const previewTenantId = activeLegacyTenantId || 'preview';
  const filteredYards = useMemo(() => {
    const q = yardSearch.trim().toLocaleLowerCase('he');
    if (!q) return yards;
    return yards.filter((y) => {
      const name = (y.name || '').toLocaleLowerCase('he');
      const id = y.id.toLocaleLowerCase('he');
      return name.includes(q) || id.includes(q);
    });
  }, [yards, yardSearch]);

  const selectedYard = useMemo(
    () => yards.find((y) => y.id === selectedYardId) ?? null,
    [yards, selectedYardId],
  );
  const baseSyntheticConfig = useMemo(
    () => buildSyntheticConfig(previewTenantId, formSnapshot),
    [previewTenantId, formSnapshot],
  );
  const themeCarouselPreviewKey = themeCarouselHoverKey ?? themeCarouselSelectedKey;
  const previewNormalized = useMemo(() => {
    if (screenshotPreviewNormalized) return screenshotPreviewNormalized;
    if (!themeCarouselPreviewKey?.trim()) {
      return normalizeTenantSiteConfig(baseSyntheticConfig, previewTenantId);
    }
    const input = buildThemeCarouselApplyImportInputForPackKey(themeCarouselPreviewKey.trim());
    if (!input) {
      return normalizeTenantSiteConfig(baseSyntheticConfig, previewTenantId);
    }
    const { normalized } = normalizeTenantSiteConfigImport(input, previewTenantId, baseSyntheticConfig);
    return normalized;
  }, [baseSyntheticConfig, previewTenantId, themeCarouselPreviewKey, screenshotPreviewNormalized]);
  const previewBrandingBase = useMemo(() => tenantBrandingFromNormalized(previewNormalized), [previewNormalized]);
  const previewBranding = useMemo(
    () => finalizeTenantRuntimeBranding(previewBrandingBase, builderYardProfile, saasTenant?.name ?? null),
    [previewBrandingBase, builderYardProfile, saasTenant?.name],
  );

  const previewHeroBackgroundPosition = previewBranding.heroImageUrl?.trim()
    ? `${heroFocalX}% ${heroFocalY}%`
    : null;

  const previewDisplayName =
    displayName.trim() ||
    siteName.trim() ||
    builderYardProfile?.displayName?.trim() ||
    saasTenant?.name?.trim() ||
    '';

  const previewSeoTitleLive = seoTitle.trim() || previewDisplayName || 'כותרת האתר';

  const builderHomepageMeta = useMemo(
    (): TenantHomepageSelectionMeta => getTenantHomepageSelectionMeta(builderInventoryCars, featuredCarIds),
    [builderInventoryCars, featuredCarIds],
  );

  useEffect(() => {
    const y = yardUid.trim();
    const s = sellerUid.trim();
    const tid = activeLegacyTenantId;
    if (!y && !s) {
      setBuilderInventoryCars([]);
      setBuilderInventoryLoading(false);
      setBuilderInventoryError(null);
      return;
    }
    let cancelled = false;
    setBuilderInventoryLoading(true);
    setBuilderInventoryError(null);
    fetchPublicCars(
      {},
      { tenantId: tid || null, yardUid: y || null, sellerUid: s || null },
    )
      .then((list) => {
        if (cancelled) return;
        setBuilderInventoryCars(list);
      })
      .catch(() => {
        if (cancelled) return;
        setBuilderInventoryError('טעינת המלאי נכשלה');
        setBuilderInventoryCars([]);
      })
      .finally(() => {
        if (cancelled) return;
        setBuilderInventoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [yardUid, sellerUid, activeLegacyTenantId]);

  useEffect(() => {
    const y = yardUid.trim();
    if (!y) {
      setBuilderYardProfile(null);
      return;
    }
    let cancelled = false;
    loadYardPublicProfile(y)
      .then((row) => {
        if (!cancelled) setBuilderYardProfile(row);
      })
      .catch(() => {
        if (!cancelled) setBuilderYardProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [yardUid]);

  const serializedForm = JSON.stringify(formSnapshot);

  useLayoutEffect(() => {
    setBaselineSerialized(serializedForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-baseline after load/save (baselineVersion), not each keystroke
  }, [baselineVersion]);

  const isDirty = baselineSerialized !== '' && serializedForm !== baselineSerialized;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const leave = window.confirm('יש שינויים שלא נשמרו. לעזוב את העמוד?');
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (success && isDirty) setSuccess(null);
  }, [success, isDirty]);

  useEffect(() => {
    if (!uploadInfo) return;
    const t = window.setTimeout(() => setUploadInfo(null), 4500);
    return () => window.clearTimeout(t);
  }, [uploadInfo]);

  const tenantIdMismatch =
    configLoadedForTenantId !== null &&
    activeLegacyTenantId !== '' &&
    activeLegacyTenantId !== configLoadedForTenantId;
  const formBusy = saving || loading || !!uploadingKind || themeCarouselApplyBusy;

  const applyBaselineSnapshot = useCallback((s: BuilderFormBaselineSnapshot) => {
    setSiteName(s.siteName);
    setDisplayName(s.displayName);
    setLogoUrl(s.logoUrl);
    setHeroImageUrl(s.heroImageUrl);
    setPrimaryColor(s.primaryColor);
    setSecondaryColor(s.secondaryColor);
    setAccentColor(s.accentColor);
    setTextColor(s.textColor);
    setBackgroundColor(s.backgroundColor);
    setThemeVariant(s.themeVariant);
    setHeroTitle(s.heroTitle);
    setHeroSubtitle(s.heroSubtitle);
    setHeroCtaText(s.heroCtaText);
    setHeroCtaLink(s.heroCtaLink);
    setAboutTitle(s.aboutTitle);
    setAboutText(s.aboutText);
    setBenefitsTitle(s.benefitsTitle);
    setBenefitsItemsText(s.benefitsItemsText);
    setFinanceTitle(s.financeTitle);
    setFinanceText(s.financeText);
    setContactTitle(s.contactTitle);
    setContactSubtitle(s.contactSubtitle);
    setTestimonialsTitle(s.testimonialsTitle);
    setTestimonialsText(s.testimonialsText);
    setPhone(s.phone);
    setWhatsapp(s.whatsapp);
    setEmail(s.email);
    setAddress(s.address);
    setCity(s.city);
    setFacebookUrl(s.facebookUrl);
    setInstagramUrl(s.instagramUrl);
    setWebsiteUrl(s.websiteUrl);
    setSeoTitle(s.seoTitle);
    setSeoDescription(s.seoDescription);
    setOgImageUrl(s.ogImageUrl);
    setSectionOrder(s.sectionOrder);
    setShowFeaturedCars(s.showFeaturedCars);
    setShowAbout(s.showAbout);
    setShowBenefits(s.showBenefits);
    setShowFinance(s.showFinance);
    setShowTestimonials(s.showTestimonials);
    setShowContact(s.showContact);
    setShowMap(s.showMap);
    setYardUid(s.yardUid);
    setSellerUid(s.sellerUid);
    setFeaturedCarIds([...s.featuredCarIds]);
    setSectionStyles(s.sectionStyles);
    setSiteThemePackKey(s.siteThemePackKey);
    setThemeAccentStrategy(s.themeAccentStrategy);
    setSectionInheritsSiteThemeStyle({ ...s.sectionInheritsSiteThemeStyle });
    setSectionInheritsSiteThemeAccent({ ...s.sectionInheritsSiteThemeAccent });
    setAppliedThemeSnapshot(s.appliedThemeSnapshot);
    setSiteThemeSectionDefaults(s.siteThemeSectionDefaults ?? null);
  }, []);

  const clearSectionDragUi = useCallback(() => {
    setDragSectionIndex(null);
    setSectionDropTargetIndex(null);
  }, []);

  const handleResetToLastSaved = useCallback(() => {
    if (formBusy || !isDirty) return;
    if (!window.confirm('לבטל שינויים בטיוטה ולחזור להגדרה האחרונה שנטענה או נשמרה בהצלחה?')) return;
    const parsed = parseBuilderFormBaselineSnapshot(baselineSerialized);
    if (!parsed) {
      setError('איפוס נכשל — אין צילום בסיס תקין.');
      return;
    }
    applyBaselineSnapshot(parsed);
    clearSectionDragUi();
    setSelectedSection(null);
    setHeroFocalX(50);
    setHeroFocalY(50);
    setSuccess(null);
    setError(null);
    setScreenshotPreviewNormalized(null);
  }, [formBusy, isDirty, baselineSerialized, applyBaselineSnapshot, clearSectionDragUi]);

  const fillFromConfig = useCallback((tenantId: string, data: Record<string, unknown> | null) => {
    const b = asRecord(data?.branding);
    const c = asRecord(data?.content);
    const ct = asRecord(data?.contact);
    const s = asRecord(data?.seo);
    const l = asRecord(data?.layout);
    const d = asRecord(data?.dataScope);

    const cfg = data
      ? ({
          tenantId,
          branding: asRecord(data.branding),
          content: asRecord(data.content),
          contact: asRecord(data.contact),
          seo: asRecord(data.seo),
          layout: asRecord(data.layout),
          dataScope: asRecord(data.dataScope),
        } as const)
      : null;
    const n = normalizeTenantSiteConfig(cfg, tenantId);

    setSiteName(str(b.siteName) || str(c.siteName));
    setDisplayName(str(b.displayName) || str(b.businessName));
    setLogoUrl(str(b.logoUrl));
    setHeroImageUrl(str(b.heroImageUrl));
    setPrimaryColor(str(b.primaryColor));
    setSecondaryColor(str(b.secondaryColor));
    setAccentColor(str(b.accentColor));
    setTextColor(str(b.textColor));
    setBackgroundColor(str(b.backgroundColor));
    setThemeVariant(n.branding.themeVariant);

    setHeroTitle(str(c.heroTitle));
    setHeroSubtitle(str(c.heroSubtitle));
    setHeroCtaText(str(c.heroCtaText));
    setHeroCtaLink(str(c.heroCtaLink));
    setAboutTitle(str(c.aboutTitle));
    setAboutText(str(c.aboutText) || str(c.about));
    setBenefitsTitle(str(c.benefitsTitle));
    setBenefitsItemsText(Array.isArray(c.benefitsItems) ? (c.benefitsItems as string[]).filter((x) => typeof x === 'string').join('\n') : '');
    setFinanceTitle(str(c.financeTitle));
    setFinanceText(str(c.financeText));
    setContactTitle(str(c.contactTitle));
    setContactSubtitle(str(c.contactSubtitle));
    setTestimonialsTitle(str(c.testimonialsTitle));
    setTestimonialsText(str(c.testimonialsText));

    setPhone(str(ct.phone));
    setWhatsapp(str(ct.whatsapp));
    setEmail(str(ct.email));
    setAddress(str(ct.address));
    setCity(str(ct.city));
    setFacebookUrl(str(ct.facebookUrl));
    setInstagramUrl(str(ct.instagramUrl));
    setWebsiteUrl(str(ct.websiteUrl));

    setSeoTitle(str(s.title));
    setSeoDescription(str(s.description));
    setOgImageUrl(str(s.ogImageUrl));

    setSectionOrder(normalizeHomeSectionOrderForBuilder(parseHomeSectionsList(l.homeSections)));
    setShowFeaturedCars(l.showFeaturedCars !== false);
    setShowAbout(l.showAbout !== false);
    setShowBenefits(l.showBenefits !== false);
    setShowFinance(l.showFinance !== false);
    setShowTestimonials(l.showTestimonials === true);
    setShowContact(l.showContact !== false);
    setShowMap(l.showMap === true);

    setYardUid(str(d.yardUid) || str(d.yardId));
    setSellerUid(str(d.sellerUid) || str(d.sellerId));
    setFeaturedCarIds(n.layout.featuredCarIds);
    setSectionStyles(n.layout.sectionStyles);
    setSiteThemePackKey(n.branding.siteThemePackKey ?? '');
    setThemeAccentStrategy(n.branding.themeAccentStrategy);
    setSectionInheritsSiteThemeStyle({ ...n.layout.sectionInheritsSiteThemeStyle });
    setSectionInheritsSiteThemeAccent({ ...n.layout.sectionInheritsSiteThemeAccent });
    setAppliedThemeSnapshot(n.branding.appliedThemeSnapshot);
    setSiteThemeSectionDefaults(n.branding.siteThemeSectionDefaults);
  }, []);

  const handleYardSelect = useCallback(
    (nextYardId: string) => {
      const next = nextYardId.trim();
      if (next === selectedYardId.trim()) return;
      if (isDirty && !window.confirm('יש שינויים שלא נשמרו. מעבר למגרש אחר יאפס את הטיוטה הנוכחית. להמשיך?')) {
        return;
      }
      setSelectedYardId(next);
      setYardUid(next);
      setSellerUid('');
      setConfigLoadedForTenantId(null);
      setLoadedConfigMissing(false);
      setRawLayoutHomeSections(null);
      setSaasTenant(null);
      setBuilderYardProfile(null);
      setBuilderInventoryCars([]);
      setBuilderInventoryError(null);
      setBuilderInventoryLoading(false);
      setSelectedSection(null);
      setDragSectionIndex(null);
      setSectionDropTargetIndex(null);
      setHeroFocalX(50);
      setHeroFocalY(50);
      setThemeCarouselHoverKey(null);
      setThemeCarouselSelectedKey(null);
      setThemeCarouselUndoSnapshot(null);
      setScreenshotPreviewNormalized(null);
      fillFromConfig(next || 'preview', null);
      setYardUid(next);
      setBaselineVersion((v) => v + 1);
      setError(null);
      setSuccess(null);
      setUploadInfo(null);
    },
    [selectedYardId, isDirty, fillFromConfig],
  );

  const loadConfigForTenantId = async (tid: string) => {
    if (!tid) {
      setError('נא לבחור מגרש');
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מזהה תאימות לא תקין');
      return;
    }
    if (saving) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setUploadInfo(null);
    setLoadedConfigMissing(false);
    setRawLayoutHomeSections(null);
    const preferredYardId = selectedYardId.trim();
    try {
      const doc = await getTenantSiteConfigByTenantId(tid);
      if (!doc) {
        setLoadedConfigMissing(true);
        fillFromConfig(tid, null);
      } else {
        const raw = doc as unknown as Record<string, unknown>;
        fillFromConfig(tid, raw);
        const layout = asRecord(raw.layout);
        setRawLayoutHomeSections(layout.homeSections ?? null);
      }
      if (preferredYardId) {
        setYardUid(preferredYardId);
      }
      setSelectedSection(null);
      setHeroFocalX(50);
      setHeroFocalY(50);
      setConfigLoadedForTenantId(tid);
      setBaselineVersion((v) => v + 1);
      setScreenshotPreviewNormalized(null);
    } catch (err) {
      debugLogBuilderFirestore('load tenantSiteConfig failed', err, {
        tenantId: tid,
        op: 'getDoc tenantSiteConfigs/{tenantId}',
      });
      setError('טעינת הקונפיגורציה נכשלה');
    } finally {
      setLoading(false);
      setDragSectionIndex(null);
      setSectionDropTargetIndex(null);
    }
  };

  const handleLoad = async () => {
    if (!activeLegacyTenantId) {
      setError('נא לבחור מגרש לפני טעינה');
      return;
    }
    await loadConfigForTenantId(activeLegacyTenantId);
  };

  const handleOpenPublicPreview = () => {
    const tid = activeLegacyTenantId;
    if (!tid) {
      setError('נא לבחור מגרש לתצוגה מקדימה');
      return;
    }
    const root = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const url = `${window.location.origin}${root}tenant/${encodeURIComponent(tid)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!isAdmin || authLoading) return;
    if (!urlTenantId) return;
    if (autoLoadedTenantFromUrl.current === urlTenantId) return;
    autoLoadedTenantFromUrl.current = urlTenantId;
    void loadConfigForTenantId(urlTenantId);
    // Intentionally omit loadConfigForTenantId / saving — one-shot bootstrap from ?tenantId=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, authLoading, urlTenantId]);

  const parseBenefitsLines = (text: string): string[] =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  const layoutShowFlags = useMemo(
    () => ({
      showFeaturedCars,
      showAbout,
      showBenefits,
      showFinance,
      showTestimonials,
      showContact,
      showMap,
    }),
    [showFeaturedCars, showAbout, showBenefits, showFinance, showTestimonials, showContact, showMap],
  );

  const isSectionVisibleInStructure = useCallback(
    (key: TenantHomeSectionKey) => isTenantHomeSectionFeatureEnabled(layoutShowFlags, key),
    [layoutShowFlags],
  );

  const getSectionSummary = useCallback(
    (key: TenantHomeSectionKey): string => {
      switch (key) {
        case 'hero':
          return heroTitle.trim() || previewDisplayName || 'כותרת ברירת מחדל';
        case 'featuredCars':
          return tenantHomepageBuilderSummaryHe(builderHomepageMeta);
        case 'about':
          return (
            aboutTitle.trim() ||
            (aboutText.trim().length > 0 ? `${aboutText.trim().slice(0, 72)}${aboutText.trim().length > 72 ? '…' : ''}` : '') ||
            'טקסט אודות'
          );
        case 'benefits': {
          const n = parseBenefitsLines(benefitsItemsText).length;
          return n ? `${n} פריטים` : 'רשימת יתרונות';
        }
        case 'finance':
          return financeTitle.trim() || 'מימון';
        case 'testimonials':
          return testimonialsTitle.trim() || 'המלצות';
        case 'contact':
          return [phone, whatsapp, email].some((x) => x.trim()) ? 'פרטי קשר מוגדרים' : 'השלמה מפרופיל חצר כשהשדות ריקים';
        case 'map':
          return showMap ? 'מפה מופעלת' : 'מפה כבויה';
        default:
          return '';
      }
    },
    [
      heroTitle,
      previewDisplayName,
      builderHomepageMeta,
      aboutTitle,
      aboutText,
      benefitsItemsText,
      financeTitle,
      testimonialsTitle,
      phone,
      whatsapp,
      email,
      showMap,
    ],
  );

  const builderSaveState = useMemo(() => {
    if (isDirty) return { tone: 'unsaved' as const, label: 'שינויים ללא שמירה' };
    if (configLoadedForTenantId) return { tone: 'saved' as const, label: 'מסונכרן עם האחרון שנשמר' };
    return { tone: 'neutral' as const, label: 'טיוטה — טעינה מומלצת' };
  }, [isDirty, configLoadedForTenantId]);

  const builderSelectedSectionLabel = useMemo(
    () => (selectedSection === null ? 'מיתוג ואתר' : TENANT_HOME_SECTION_LABELS_HE[selectedSection]),
    [selectedSection],
  );

  const builderLogoSourceLabel = useMemo(() => {
    if (logoUrl.trim()) return 'לוגו מהאתר';
    if (builderYardProfile?.yardLogoUrl?.trim()) return 'לוגו מפרופיל חצר';
    return 'ללא לוגו';
  }, [logoUrl, builderYardProfile?.yardLogoUrl]);

  const builderFeaturedSummary = useMemo(
    () => tenantHomepageBuilderSummaryHe(builderHomepageMeta),
    [builderHomepageMeta],
  );

  const warnings = useMemo(() => {
    const list: string[] = [];
    const tid = activeLegacyTenantId;
    if (!tid) {
      list.push('יש לבחור מגרש כדי לטעון, לשמור או לפתוח תצוגה ציבורית.');
      return list;
    }
    if (loadedConfigMissing) {
      list.push('אין מסמך tenantSiteConfigs עבור מגרש זה — שמירה תיצור/תעדכן שדות (merge).');
    }
    if (!yardUid.trim() && !sellerUid.trim()) {
      list.push('חסר dataScope.yardUid (או sellerUid) — מלאי ציבורי עלול להיות חסום או לא מסונן לפי דומיין.');
    }
    if (!logoUrl.trim() && !displayName.trim() && !siteName.trim() && !builderYardProfile?.yardLogoUrl?.trim()) {
      list.push('מומלץ להגדיר לפחות שם או לוגו למותג (או לוודא שיש לוגו בפרופיל החצר).');
    }
    if (!phone.trim() && !whatsapp.trim() && !email.trim() && !builderYardProfile?.phone?.trim()) {
      list.push('אין פרטי קשר בסיסיים בשדות המפורשים — יוצגו מפרופיל החצר אם קיימים.');
    }
    if (seoTitle.trim() && !ogImageUrl.trim()) {
      list.push('מוגדר כותרת SEO ללא ogImageUrl — שקלו להוסיף תמונת OG לשיתוף.');
    }
    const badKeys = getUnsupportedHomeSectionKeys(rawLayoutHomeSections);
    if (badKeys.length > 0) {
      list.push(`מפתחות סקשן לא נתמכים ב-Firestore: ${badKeys.join(', ')}`);
    }
    if (tid && configLoadedForTenantId === null) {
      list.push('לא בוצעה טעינה למגרש זה — מומלץ ״טען קונפיגורציה״ לפני העלאת מדיה. אפשר לשמור ישירות ליצירת מסמך.');
    }
    if (tenantIdMismatch) {
      list.push(`מזהה התאימות לא תואם למסמך שנטען (${configLoadedForTenantId}). טענו מחדש לפני שמירה/העלאה.`);
    }
    if (saasTenant && computeTenantPublicSiteSuspended(saasTenant, Date.now()).suspended) {
      list.push('לקוח זה מושבת בחנות הציבורית — גולשים לא יראו מלאי (כאן עדיין אפשר לערוך).');
    }
    if (saasTenant?.plan === 'basic') {
      list.push(`תוכנית Basic: מומלץ עד ${BASIC_PLAN_MAX_CARS} רכבים (אזהרת UI בלבד).`);
    }
    return list;
  }, [
    activeLegacyTenantId,
    configLoadedForTenantId,
    tenantIdMismatch,
    loadedConfigMissing,
    yardUid,
    sellerUid,
    logoUrl,
    displayName,
    siteName,
    phone,
    whatsapp,
    email,
    rawLayoutHomeSections,
    seoTitle,
    ogImageUrl,
    saasTenant,
    builderYardProfile,
  ]);

  const selectBuilderSection = useCallback((key: BuilderSelectedSection, opts?: { scrollCanvas?: boolean }) => {
    setSelectedSection(key);
    if (opts?.scrollCanvas && key !== null) {
      requestAnimationFrame(() => {
        canvasFrameRef.current?.querySelector(`[data-tenant-section="${key}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      });
    }
  }, []);

  const toggleBuilderSectionVisibility = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    switch (key) {
      case 'featuredCars':
        setShowFeaturedCars((v) => !v);
        break;
      case 'about':
        setShowAbout((v) => !v);
        break;
      case 'benefits':
        setShowBenefits((v) => !v);
        break;
      case 'finance':
        setShowFinance((v) => !v);
        break;
      case 'testimonials':
        setShowTestimonials((v) => !v);
        break;
      case 'contact':
        setShowContact((v) => !v);
        break;
      case 'map':
        setShowMap((v) => !v);
        break;
      default:
        break;
    }
  }, []);

  const restoreBuilderSectionVisibility = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    switch (key) {
      case 'featuredCars':
        setShowFeaturedCars(true);
        break;
      case 'about':
        setShowAbout(true);
        break;
      case 'benefits':
        setShowBenefits(true);
        break;
      case 'finance':
        setShowFinance(true);
        break;
      case 'testimonials':
        setShowTestimonials(true);
        break;
      case 'contact':
        setShowContact(true);
        break;
      case 'map':
        setShowMap(true);
        break;
      default:
        break;
    }
  }, []);

  const handleSectionDrop = useCallback(
    (targetIndex: number) => {
      if (formBusy) {
        setDragSectionIndex(null);
        setSectionDropTargetIndex(null);
        return;
      }
      const fromIndex = dragSectionIndex;
      const movedKey =
        fromIndex !== null && fromIndex >= 0 && fromIndex < sectionOrder.length ? sectionOrder[fromIndex] : null;

      setSectionOrder((prevOrder) => {
        if (fromIndex === null || fromIndex === targetIndex) {
          return prevOrder;
        }
        const next = [...prevOrder];
        const [removed] = next.splice(fromIndex, 1);
        next.splice(targetIndex, 0, removed);
        return normalizeHomeSectionOrderForBuilder(next);
      });

      if (movedKey && movedKey !== 'hero') {
        restoreBuilderSectionVisibility(movedKey);
      }

      setDragSectionIndex(null);
      setSectionDropTargetIndex(null);
    },
    [formBusy, dragSectionIndex, sectionOrder, restoreBuilderSectionVisibility],
  );

  const canvasSectionReorder = useMemo(
    () => ({
      sectionOrder,
      dragSectionIndex,
      setDragSectionIndex,
      sectionDropTargetIndex,
      setSectionDropTargetIndex,
      onDropAtOrderIndex: handleSectionDrop,
      formBusy,
    }),
    [
      sectionOrder,
      dragSectionIndex,
      sectionDropTargetIndex,
      formBusy,
      handleSectionDrop,
    ],
  );

  const handleOpenPublicSite = useCallback(async () => {
    const tid = activeLegacyTenantId;
    if (!tid) {
      setError('נא לבחור מגרש');
      return;
    }
    try {
      const rows = await listTenantDomains();
      const mine = rows.filter((r) => r.tenantId === tid && r.enabled);
      if (mine.length === 0) {
        setError('לא נמצא דומיין פעיל למגרש זה. הגדירו מיפוי בדף דומיינים.');
        return;
      }
      mine.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.hostname.localeCompare(b.hostname);
      });
      const pick = mine[0];
      setError(null);
      const url = `https://${pick.hostname}/`;
      window.open(url, '_blank', 'noopener,noreferrer');
      setUploadInfo(`נפתח האתר בלשונית חדשה (${url})`);
    } catch {
      setError('טעינת דומיינים נכשלה');
    }
  }, [activeLegacyTenantId]);

  const handleMediaPick = async (kind: TenantSiteMediaKind, fileList: FileList | null) => {
    const fieldTid = activeLegacyTenantId;
    if (configLoadedForTenantId !== null) {
      if (fieldTid !== configLoadedForTenantId) {
        setError('מזהה תאימות שונה מהמסמך שנטען לאחרונה. טענו מחדש לפני העלאה.');
        return;
      }
    }
    const uploadTid = configLoadedForTenantId ?? fieldTid;
    if (!uploadTid) {
      setError('נא לבחור מגרש ולטעון קונפיגורציה לפני העלאת קבצים.');
      return;
    }
    const file = fileList?.[0];
    if (!file) return;
    if (uploadingKind || saving) return;
    try {
      validateTenantSiteImageFile(file);
      assertSafeTenantIdForStoragePath(uploadTid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'קובץ לא תקין');
      return;
    }
    setUploadingKind(kind);
    setError(null);
    setUploadInfo(null);
    try {
      const url = await uploadTenantSiteMedia(uploadTid, kind, file);
      if (kind === 'logo') setLogoUrl(url);
      else if (kind === 'hero') setHeroImageUrl(url);
      else setOgImageUrl(url);
      setUploadInfo(kind === 'logo' ? 'הלוגו הועלה — לחצו שמור כדי לשמור ב-Firestore.' : kind === 'hero' ? 'תמונת ה-Hero הועלתה — לחצו שמור.' : 'תמונת OG הועלתה — לחצו שמור.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'העלאה נכשלה');
    } finally {
      setUploadingKind(null);
    }
  };

  const handleSave = async () => {
    const tid = activeLegacyTenantId;
    if (!tid) {
      setError('נא לבחור מגרש');
      return;
    }
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      setError(`מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו קונפיגורציה מחדש לפני שמירה.`);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מזהה תאימות לא תקין');
      return;
    }
    if (saving || !!uploadingKind) return;
    if (saveInFlightRef.current) return;

    const colorFields: { label: string; value: string }[] = [
      { label: 'צבע ראשי', value: primaryColor },
      { label: 'צבע משני', value: secondaryColor },
      { label: 'הדגשה', value: accentColor },
      { label: 'טקסט', value: textColor },
      { label: 'רקע', value: backgroundColor },
    ];
    for (const { label, value } of colorFields) {
      const v = value.trim();
      if (!v) continue;
      const r = validateColorInput(v);
      if (!r.ok) {
        setError(`${label}: ${r.error}`);
        return;
      }
    }

    const cta = heroCtaLink.trim();
    if (cta) {
      const rCta = validateOptionalUrlOrPath(cta);
      if (!rCta.ok) {
        setError(`קישור CTA: ${rCta.error}`);
        return;
      }
    }

    const urlChecks: { label: string; value: string }[] = [
      { label: 'לוגו', value: logoUrl },
      { label: 'תמונת Hero', value: heroImageUrl },
      { label: 'Facebook', value: facebookUrl },
      { label: 'Instagram', value: instagramUrl },
      { label: 'אתר', value: websiteUrl },
      { label: 'OG תמונה', value: ogImageUrl },
    ];
    for (const { label, value } of urlChecks) {
      const v = value.trim();
      if (!v) continue;
      const r = validateOptionalUrl(v);
      if (!r.ok) {
        setError(`${label}: ${r.error}`);
        return;
      }
    }

    saveInFlightRef.current = true;
    clearSectionDragUi();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const ordered = normalizeHomeSectionOrderForBuilder(sectionOrder);
      const branding: Record<string, unknown> = {};
      if (siteName.trim()) branding.siteName = siteName.trim();
      if (displayName.trim()) branding.displayName = displayName.trim();
      if (logoUrl.trim()) branding.logoUrl = logoUrl.trim();
      if (heroImageUrl.trim()) branding.heroImageUrl = heroImageUrl.trim();
      if (primaryColor.trim()) branding.primaryColor = primaryColor.trim();
      if (secondaryColor.trim()) branding.secondaryColor = secondaryColor.trim();
      if (accentColor.trim()) branding.accentColor = accentColor.trim();
      if (textColor.trim()) branding.textColor = textColor.trim();
      if (backgroundColor.trim()) branding.backgroundColor = backgroundColor.trim();
      if (themeVariant.trim()) branding.themeVariant = themeVariant.trim();
      const themePayload: Record<string, unknown> = {
        siteThemePackKey: siteThemePackKey.trim() || null,
        accentStrategy:
          themeAccentStrategy === null
            ? null
            : serializeThemeAccentStrategyForFirestore(themeAccentStrategy),
        appliedThemeSnapshot:
          appliedThemeSnapshot === null
            ? null
            : serializeAppliedThemeSnapshotForFirestore(appliedThemeSnapshot),
      };
      const persistedSectionDefaults = serializeSiteThemeSectionDefaultsForFirestore(siteThemeSectionDefaults);
      if (persistedSectionDefaults) themePayload.sectionDefaults = persistedSectionDefaults;
      branding.theme = themePayload;

      const content: Record<string, unknown> = {};
      if (heroTitle.trim()) content.heroTitle = heroTitle.trim();
      if (heroSubtitle.trim()) content.heroSubtitle = heroSubtitle.trim();
      if (heroCtaText.trim()) content.heroCtaText = heroCtaText.trim();
      if (heroCtaLink.trim()) content.heroCtaLink = heroCtaLink.trim();
      if (aboutTitle.trim()) content.aboutTitle = aboutTitle.trim();
      if (aboutText.trim()) content.aboutText = aboutText.trim();
      if (benefitsTitle.trim()) content.benefitsTitle = benefitsTitle.trim();
      const bi = parseBenefitsLines(benefitsItemsText);
      if (bi.length > 0) content.benefitsItems = bi;
      if (financeTitle.trim()) content.financeTitle = financeTitle.trim();
      if (financeText.trim()) content.financeText = financeText.trim();
      if (contactTitle.trim()) content.contactTitle = contactTitle.trim();
      if (contactSubtitle.trim()) content.contactSubtitle = contactSubtitle.trim();
      if (testimonialsTitle.trim()) content.testimonialsTitle = testimonialsTitle.trim();
      if (testimonialsText.trim()) content.testimonialsText = testimonialsText.trim();

      const contactPayload: Record<string, unknown> = {};
      if (phone.trim()) contactPayload.phone = phone.trim();
      if (whatsapp.trim()) contactPayload.whatsapp = whatsapp.trim();
      if (email.trim()) contactPayload.email = email.trim();
      if (address.trim()) contactPayload.address = address.trim();
      if (city.trim()) contactPayload.city = city.trim();
      if (facebookUrl.trim()) contactPayload.facebookUrl = facebookUrl.trim();
      if (instagramUrl.trim()) contactPayload.instagramUrl = instagramUrl.trim();
      if (websiteUrl.trim()) contactPayload.websiteUrl = websiteUrl.trim();

      const seo: Record<string, unknown> = {};
      if (seoTitle.trim()) seo.title = seoTitle.trim();
      if (seoDescription.trim()) seo.description = seoDescription.trim();
      if (ogImageUrl.trim()) seo.ogImageUrl = ogImageUrl.trim();

      const sectionInheritsLegacyPayload: Record<string, boolean> = {};
      const sectionInheritsStylePayload: Record<string, boolean> = {};
      const sectionInheritsAccentPayload: Record<string, boolean> = {};
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        if (sectionInheritsSiteThemeStyle[k] === true) sectionInheritsStylePayload[k] = true;
        if (sectionInheritsSiteThemeAccent[k] === true) sectionInheritsAccentPayload[k] = true;
        if (sectionInheritsSiteThemeLegacy[k] === true) sectionInheritsLegacyPayload[k] = true;
      }

      const layout: Record<string, unknown> = {
        homeSections: ordered,
        showFeaturedCars,
        showAbout,
        showBenefits,
        showFinance,
        showTestimonials,
        showContact,
        showMap,
        featuredCarIds: [...featuredCarIds],
        sectionStyles,
        sectionInheritsSiteTheme: sectionInheritsLegacyPayload,
        sectionInheritsSiteThemeStyle: sectionInheritsStylePayload,
        sectionInheritsSiteThemeAccent: sectionInheritsAccentPayload,
      };

      const dataScope: Record<string, unknown> = {};
      if (yardUid.trim()) dataScope.yardUid = yardUid.trim();
      if (sellerUid.trim()) dataScope.sellerUid = sellerUid.trim();

      await upsertTenantSiteConfig(tid, {
        branding,
        content,
        contact: contactPayload,
        seo,
        layout,
        dataScope,
      });
      setSuccess('נשמר בהצלחה ב-Firestore.');
      setConfigLoadedForTenantId(tid);
      setLoadedConfigMissing(false);
      setRawLayoutHomeSections(ordered);
      setBaselineVersion((v) => v + 1);
      setScreenshotPreviewNormalized(null);
    } catch (e) {
      debugLogBuilderFirestore('save tenantSiteConfig failed', e, {
        tenantId: tid,
        uid: firebaseUser?.uid ?? null,
        profileIsAdmin: userProfile?.isAdmin === true,
        op: 'setDoc merge tenantSiteConfigs/{tenantId}',
      });
      const msg = e instanceof Error ? e.message : 'שמירה נכשלה';
      setError(
        firestoreErrorCode(e) === 'permission-denied'
          ? `${msg} — ודאו שאתם מחוברים כאדמין (users/{uid}.isAdmin, claims, או config/admins).`
          : msg,
      );
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  };

  const builderSaveButtonDisabled =
    saving || loading || !!uploadingKind || tenantIdMismatch || !activeLegacyTenantId;

  const handleUnsavedPillClick = () => {
    if (builderSaveButtonDisabled) {
      builderToolbarSaveButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      builderToolbarActionsRef.current?.focus({ preventScroll: true });
      return;
    }
    void handleSave();
  };

  const handleThemeCarouselApply = useCallback(async () => {
    const tid = activeLegacyTenantId.trim();
    const packKey = themeCarouselSelectedKey?.trim();
    if (!tid || !packKey) {
      setError('נא לבחור מגרש וערכת נושא.');
      return;
    }
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      setError(`מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו קונפיגורציה מחדש לפני החלת נושא.`);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מזהה תאימות לא תקין');
      return;
    }
    const raw = buildThemeCarouselApplyImportInputForPackKey(packKey);
    if (!raw) {
      setError('ערכת הנושא לא נמצאה.');
      return;
    }
    const coerced = coerceImportedTenantSiteConfig(raw);
    devLogTenantSiteConfigImport(coerced, 'theme-carousel-apply');
    if (coerced.issues.some((i) => i.severity === 'forbidden')) {
      setError('החלת הנושא נחסמה — נמצאו שדות אסורים בייבוא.');
      return;
    }
    if (saving || !!uploadingKind || themeCarouselApplyBusy) return;

    setThemeCarouselApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const docBefore = await getTenantSiteConfigByTenantId(tid);
      setThemeCarouselUndoSnapshot(docBefore ? structuredClone(docBefore) : null);
      const merged = mergeTenantSiteConfigWritePayload(docBefore, coerced.patch);
      await upsertTenantSiteConfig(tid, merged);
      const refreshed = await getTenantSiteConfigByTenantId(tid);
      if (refreshed) {
        fillFromConfig(tid, refreshed as unknown as Record<string, unknown>);
        const layoutRec = asRecord(refreshed.layout);
        setRawLayoutHomeSections(layoutRec.homeSections ?? null);
      }
      setConfigLoadedForTenantId(tid);
      setLoadedConfigMissing(false);
      setBaselineVersion((v) => v + 1);
      setSuccess('ערכת הנושא נשמרה ב-Firestore (ייבוא + מיזוג).');
      setThemeCarouselHoverKey(null);
      setThemeCarouselSelectedKey(null);
      setScreenshotPreviewNormalized(null);
    } catch (e) {
      debugLogBuilderFirestore('theme carousel apply failed', e, {
        tenantId: tid,
        uid: firebaseUser?.uid ?? null,
        op: 'theme carousel upsert',
      });
      const msg = e instanceof Error ? e.message : 'החלת נושא נכשלה';
      setError(
        firestoreErrorCode(e) === 'permission-denied'
          ? `${msg} — ודאו הרשאות אדמין.`
          : msg,
      );
    } finally {
      setThemeCarouselApplyBusy(false);
    }
  }, [
    activeLegacyTenantId,
    themeCarouselSelectedKey,
    configLoadedForTenantId,
    saving,
    uploadingKind,
    themeCarouselApplyBusy,
    fillFromConfig,
    firebaseUser?.uid,
    userProfile?.isAdmin,
  ]);

  const handleThemeCarouselUndo = useCallback(async () => {
    const tid = activeLegacyTenantId.trim();
    const snap = themeCarouselUndoSnapshot;
    if (!tid || !snap) return;
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      setError(`מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו מחדש לפני ביטול.`);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מזהה תאימות לא תקין');
      return;
    }
    if (saving || !!uploadingKind || themeCarouselApplyBusy) return;

    setThemeCarouselApplyBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await upsertTenantSiteConfig(tid, {
        branding: snap.branding !== undefined ? snap.branding : deleteField(),
        content: snap.content !== undefined ? snap.content : deleteField(),
        contact: snap.contact !== undefined ? snap.contact : deleteField(),
        seo: snap.seo !== undefined ? snap.seo : deleteField(),
        layout: snap.layout !== undefined ? snap.layout : deleteField(),
        dataScope: snap.dataScope !== undefined ? snap.dataScope : deleteField(),
      });
      const refreshed = await getTenantSiteConfigByTenantId(tid);
      if (refreshed) {
        fillFromConfig(tid, refreshed as unknown as Record<string, unknown>);
        const layoutRec = asRecord(refreshed.layout);
        setRawLayoutHomeSections(layoutRec.homeSections ?? null);
      }
      setBaselineVersion((v) => v + 1);
      setThemeCarouselUndoSnapshot(null);
      setScreenshotPreviewNormalized(null);
      setSuccess('בוצע ביטול ערכת הנושא (שוחזר מצב לפני ההחלה).');
    } catch (e) {
      debugLogBuilderFirestore('theme carousel undo failed', e, {
        tenantId: tid,
        uid: firebaseUser?.uid ?? null,
        op: 'theme carousel undo upsert',
      });
      const msg = e instanceof Error ? e.message : 'ביטול נכשל';
      setError(
        firestoreErrorCode(e) === 'permission-denied'
          ? `${msg} — ודאו הרשאות אדמין.`
          : msg,
      );
    } finally {
      setThemeCarouselApplyBusy(false);
    }
  }, [
    activeLegacyTenantId,
    themeCarouselUndoSnapshot,
    configLoadedForTenantId,
    saving,
    uploadingKind,
    themeCarouselApplyBusy,
    fillFromConfig,
    firebaseUser?.uid,
    userProfile?.isAdmin,
  ]);

  const handleScreenshotImportApply = useCallback(
    async (patch: ScreenshotDerivedSiteConfigImportInput) => {
      const tid = activeLegacyTenantId.trim();
      if (!tid) {
        setError('נא לבחור מגרש לפני החלת ייבוא Screenshot.');
        return;
      }
      if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
        setError(`מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו מחדש לפני החלה.`);
        return;
      }
      try {
        assertSafeTenantIdForStoragePath(tid);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'מזהה תאימות לא תקין');
        return;
      }
      const safeImport = coerceImportedTenantSiteConfig(patch);
      if (safeImport.issues.some((i) => i.severity === 'forbidden')) {
        setError('ייבוא Screenshot נחסם: נמצאו שדות אסורים.');
        return;
      }
      setError(null);
      setSuccess(null);
      const docBefore = await getTenantSiteConfigByTenantId(tid);
      const merged = mergeTenantSiteConfigWritePayload(docBefore, safeImport.patch);
      await upsertTenantSiteConfig(tid, merged);
      const refreshed = await getTenantSiteConfigByTenantId(tid);
      if (refreshed) {
        fillFromConfig(tid, refreshed as unknown as Record<string, unknown>);
        const layoutRec = asRecord(refreshed.layout);
        setRawLayoutHomeSections(layoutRec.homeSections ?? null);
      }
      setConfigLoadedForTenantId(tid);
      setLoadedConfigMissing(false);
      setBaselineVersion((v) => v + 1);
      setScreenshotPreviewNormalized(null);
      setSuccess('ייבוא Screenshot הוחל ונשמר ב-Firestore (coerce + merge).');
    },
    [activeLegacyTenantId, configLoadedForTenantId, fillFromConfig],
  );

  const builderBrandingLayoutSlice = useCallback((): TenantHomeBrandingResolutionLayout => {
    const ordered = normalizeHomeSectionOrderForBuilder(sectionOrder);
    return {
      sectionStyles: normalizeTenantSectionStylesRecord(sectionStyles),
      sectionInheritsSiteThemeStyle,
      sectionInheritsSiteThemeAccent,
      homeSections: ordered,
    };
  }, [sectionOrder, sectionStyles, sectionInheritsSiteThemeStyle, sectionInheritsSiteThemeAccent]);

  const brandingResolutionLayout = useMemo(
    () => builderBrandingLayoutSlice(),
    [builderBrandingLayoutSlice],
  );

  const handleChangeSectionStyle = useCallback(
    (key: TenantHomeSectionKey, next: TenantSectionStyle, inheritBreak: 'style' | 'accent' | 'both' = 'both') => {
      if (key !== 'hero') {
        if (inheritBreak !== 'accent') {
          setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: false }));
        }
        if (inheritBreak !== 'style') {
          setSectionInheritsSiteThemeAccent((prev) => ({ ...prev, [key]: false }));
        }
      }
      setSectionStyles((prev) => ({
        ...prev,
        [key]: next,
      }));
    },
    [],
  );

  const handleResetSectionStyle = useCallback((key: TenantHomeSectionKey) => {
    if (key !== 'hero') {
      setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: false }));
      setSectionInheritsSiteThemeAccent((prev) => ({ ...prev, [key]: false }));
    }
    setSectionStyles((prev) => ({
      ...prev,
      [key]: { ...DEFAULT_TENANT_SECTION_STYLE },
    }));
  }, []);

  const handleSelectSiteThemePack = useCallback((pack: ThemeBrandPreset) => {
    setSiteThemePackKey(pack.key);
    setAppliedThemeSnapshot(null);
  }, []);

  const handleApplySiteThemePackBranding = useCallback((pack: ThemeBrandPreset) => {
    setSiteThemePackKey(pack.key);
    setPrimaryColor(pack.primaryColor);
    setSecondaryColor(pack.secondaryColor);
    setAccentColor(pack.accentColor);
    setAppliedThemeSnapshot(buildAppliedThemeSnapshotFromPreset(pack));
  }, []);

  const handleClearSiteThemePack = useCallback(() => {
    setSiteThemePackKey('');
    setAppliedThemeSnapshot(null);
  }, []);

  const handleUpgradeAppliedThemeFromLivePack = useCallback(() => {
    const packKey = siteThemePackKey.trim();
    if (!packKey) return;
    const live = getThemeBrandPresetByKey(packKey);
    if (!live) return;
    setAppliedThemeSnapshot(buildAppliedThemeSnapshotFromPreset(live));
  }, [siteThemePackKey]);

  const handleForceSiteThemeToSections = useCallback(() => {
    setSectionInheritsSiteThemeStyle((prev) => {
      const next = { ...prev };
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        next[k] = true;
      }
      return next;
    });
    setSectionInheritsSiteThemeAccent((prev) => {
      const next = { ...prev };
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        next[k] = true;
      }
      return next;
    });
  }, []);

  const handleForceSiteThemeStyleToSections = useCallback(() => {
    setSectionInheritsSiteThemeStyle((prev) => {
      const next = { ...prev };
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        next[k] = true;
      }
      return next;
    });
  }, []);

  const handleForceSiteThemeAccentToSections = useCallback(() => {
    setSectionInheritsSiteThemeAccent((prev) => {
      const next = { ...prev };
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        next[k] = true;
      }
      return next;
    });
  }, []);

  const handleClearSectionThemeInheritance = useCallback(() => {
    setSectionInheritsSiteThemeStyle({});
    setSectionInheritsSiteThemeAccent({});
  }, []);

  const handleBreakSectionFromSiteTheme = useCallback(
    (key: TenantHomeSectionKey) => {
      if (key === 'hero') return;
      const layout = builderBrandingLayoutSlice();
      const nextLayout: TenantHomeBrandingResolutionLayout = {
        ...layout,
        sectionInheritsSiteThemeStyle: { ...layout.sectionInheritsSiteThemeStyle, [key]: false },
        sectionInheritsSiteThemeAccent: { ...layout.sectionInheritsSiteThemeAccent, [key]: false },
      };
      const eff = resolveEffectiveSectionStyle(key, nextLayout, previewNormalized.branding);
      setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: false }));
      setSectionInheritsSiteThemeAccent((prev) => ({ ...prev, [key]: false }));
      setSectionStyles((prev) => ({ ...prev, [key]: eff }));
    },
    [builderBrandingLayoutSlice, previewNormalized.branding],
  );

  const handleBreakSectionStyleFromSiteTheme = useCallback(
    (key: TenantHomeSectionKey) => {
      if (key === 'hero') return;
      const layout = builderBrandingLayoutSlice();
      const nextLayout: TenantHomeBrandingResolutionLayout = {
        ...layout,
        sectionInheritsSiteThemeStyle: { ...layout.sectionInheritsSiteThemeStyle, [key]: false },
      };
      const eff = resolveEffectiveSectionStyle(key, nextLayout, previewNormalized.branding);
      setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: false }));
      setSectionStyles((prev) => ({ ...prev, [key]: eff }));
    },
    [builderBrandingLayoutSlice, previewNormalized.branding],
  );

  const handleBreakSectionAccentFromSiteTheme = useCallback(
    (key: TenantHomeSectionKey) => {
      if (key === 'hero') return;
      const layout = builderBrandingLayoutSlice();
      const nextLayout: TenantHomeBrandingResolutionLayout = {
        ...layout,
        sectionInheritsSiteThemeAccent: { ...layout.sectionInheritsSiteThemeAccent, [key]: false },
      };
      const eff = resolveEffectiveSectionStyle(key, nextLayout, previewNormalized.branding);
      setSectionInheritsSiteThemeAccent((prev) => ({ ...prev, [key]: false }));
      setSectionStyles((prev) => ({ ...prev, [key]: eff }));
    },
    [builderBrandingLayoutSlice, previewNormalized.branding],
  );

  const handleLinkSectionToSiteTheme = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: true }));
    setSectionInheritsSiteThemeAccent((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleLinkSectionStyleToTheme = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleLinkSectionAccentToTheme = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    setSectionInheritsSiteThemeAccent((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleRevertSectionAccentToTheme = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    setSectionStyles((prev) => ({
      ...prev,
      [key]: { ...prev[key], accentBaseColor: null, colorPreset: null },
    }));
  }, []);

  const handleRevertSectionStyleToTheme = useCallback((key: TenantHomeSectionKey) => {
    if (key === 'hero') return;
    setSectionStyles((prev) => ({
      ...prev,
      [key]: {
        ...DEFAULT_TENANT_SECTION_STYLE,
        accentBaseColor: prev[key].accentBaseColor,
        colorPreset: prev[key].colorPreset,
      },
    }));
    setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleApplySectionStyleToAll = useCallback((template: TenantSectionStyle) => {
    setSectionInheritsSiteThemeStyle((inh) => {
      const nextInh = { ...inh };
      for (const key of TENANT_HOME_SECTION_KEYS) {
        if (key === 'hero') continue;
        nextInh[key] = false;
      }
      return nextInh;
    });
    setSectionInheritsSiteThemeAccent((inh) => {
      const nextInh = { ...inh };
      for (const key of TENANT_HOME_SECTION_KEYS) {
        if (key === 'hero') continue;
        nextInh[key] = false;
      }
      return nextInh;
    });
    setSectionStyles((prev) => {
      const next = { ...prev };
      for (const key of TENANT_HOME_SECTION_KEYS) {
        if (key === 'hero') continue;
        next[key] = applySectionStyleRespectingCapabilities(template, prev[key], TENANT_SECTION_STYLE_CAPABILITIES[key]);
      }
      return normalizeTenantSectionStylesRecord(next);
    });
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="admin-tenant-site-builder-page">
      <div className="page-container">
        <div className="page-header">
          <h2>Website Builder</h2>
          <div className="page-header-links">
            <Link to="/admin/tenant-domains">דומייני מגרש</Link>
            <Link to="/account">חשבון</Link>
          </div>
        </div>

        <p className="muted intro">
          עורך ויזואלי לדף בית של חצר — מבנה משמאל, תצוגה חיה במרכז, כלי עריכה מימין. השינויים בטיוטה מתעדכנים מיד; שמירה כותבת ל-Firestore בלבד את הערכים שהזנתם במפורש.
        </p>

        <div className="builder-toolbar-card">
          <div className="builder-yard-picker">
            <label className="field-label">
              בחר מגרש (Admin)
              <input
                type="search"
                value={yardSearch}
                onChange={(e) => setYardSearch(e.target.value)}
                placeholder="חיפוש לפי שם/UID"
                dir="ltr"
              />
            </label>
            <label className="field-label">
              רשימת מגרשים
              <select
                value={selectedYardId}
                onChange={(e) => handleYardSelect(e.target.value)}
                disabled={yardsLoading || !!yardsError}
                aria-busy={yardsLoading}
              >
                <option value="">{yardsLoading ? 'טוען מגרשים…' : 'בחר מגרש'}</option>
                {filteredYards.map((yard) => (
                  <option key={yard.id} value={yard.id}>
                    {yard.name} ({yard.id})
                  </option>
                ))}
              </select>
            </label>
            <div className="builder-yard-picker-status" aria-live="polite">
              {yardsLoading ? <span>טוען רשימת מגרשים…</span> : null}
              {!yardsLoading && yardsError ? <span className="form-error">{yardsError}</span> : null}
              {!yardsLoading && !yardsError && yards.length === 0 ? <span>לא נמצאו מגרשים.</span> : null}
              {!yardsLoading && !yardsError && yards.length > 0 && filteredYards.length === 0 ? (
                <span>לא נמצאו תוצאות לחיפוש.</span>
              ) : null}
              {selectedYard ? (
                <span>
                  נבחר: <strong>{selectedYard.name}</strong> <code dir="ltr">{selectedYard.id}</code>
                </span>
              ) : null}
              {builderScope?.usingLegacyTenantFallback ? (
                <span className="builder-legacy-pill">מצב תאימות: tenantId ידני</span>
              ) : null}
            </div>
          </div>
          <details className="builder-advanced-scope">
            <summary>אפשרויות מתקדמות (תאימות legacy)</summary>
            <label className="field-label">
              tenantId תאימות (לשימוש חריג בלבד)
              <input
                type="text"
                value={legacyTenantIdInput}
                onChange={(e) => setLegacyTenantIdInput(e.target.value)}
                placeholder="יופעל רק אם לא נבחר מגרש"
                dir="ltr"
              />
            </label>
            <p className="hint">במצב תקין יש לבחור מגרש בלבד. שדה זה נשמר לצורכי תאימות לאחור.</p>
          </details>
          <div
            ref={builderToolbarActionsRef}
            className="form-actions builder-toolbar-actions"
            tabIndex={-1}
          >
            <button
              type="button"
              className="primary-btn"
              onClick={handleLoad}
              disabled={loading || saving}
              aria-busy={loading}
            >
              {loading ? 'טוען…' : 'טען קונפיגורציית מגרש'}
            </button>
            <button
              ref={builderToolbarSaveButtonRef}
              type="button"
              className="primary-btn"
              onClick={handleSave}
              disabled={builderSaveButtonDisabled}
              aria-busy={saving}
            >
              {saving ? 'שומר…' : 'שמור'}
            </button>
            <button
              type="button"
              className="secondary-btn builder-reset-draft-btn"
              onClick={handleResetToLastSaved}
              disabled={formBusy || !isDirty}
              title="מחזיר את כל השדות לצילום האחרון לאחר טעינה או שמירה מוצלחת"
              aria-label="איפוס טיוטה להגדרה האחרונה שנטענה או נשמרה"
            >
              איפוס לטעינה אחרונה
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={handleOpenPublicPreview}
              disabled={!activeLegacyTenantId}
              title="דף ציבורי באפליקציה (מתאים לבדיקה ללא דומיין מותאם)"
            >
              פתח תצוגה ציבורית
            </button>
            <button
              type="button"
              className="secondary-btn builder-open-site-btn"
              onClick={() => void handleOpenPublicSite()}
              disabled={!activeLegacyTenantId}
              title="דף הבית בדומיין הלקוח (אם הוגדר בדומייני מגרש)"
            >
              פתח אתר (דומיין)
            </button>
            <Link className="builder-domains-link" to="/admin/tenant-domains">
              ניהול דומיינים
            </Link>
          </div>
        </div>

        {uploadInfo ? <p className="form-success upload-flash">{uploadInfo}</p> : null}

        {warnings.length > 0 ? (
          <div className="warnings-card" role="status">
            <strong>אזהרות</strong>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="builder-workspace">
          <BuilderStructurePanel
            sectionOrder={sectionOrder}
            selectedSection={selectedSection}
            onSelectSection={selectBuilderSection}
            getSummary={getSectionSummary}
            isSectionVisible={isSectionVisibleInStructure}
            onRestoreSectionVisibility={restoreBuilderSectionVisibility}
            formBusy={formBusy}
            dragSectionIndex={dragSectionIndex}
            setDragSectionIndex={setDragSectionIndex}
            sectionDropTargetIndex={sectionDropTargetIndex}
            setSectionDropTargetIndex={setSectionDropTargetIndex}
            onSectionDropAt={handleSectionDrop}
            onResetSectionOrder={() => {
              setDragSectionIndex(null);
              setSectionDropTargetIndex(null);
              setSectionOrder([...TENANT_HOME_SECTION_KEYS]);
            }}
          />
          <div className="builder-canvas-column">
            <div className="builder-confidence-strip" role="status" aria-live="polite">
              {builderSaveState.tone === 'unsaved' ? (
                <button
                  type="button"
                  className="builder-confidence-strip__pill builder-confidence-strip__pill--unsaved builder-confidence-strip__pill--action"
                  onClick={handleUnsavedPillClick}
                  title="יש שינויים שלא נשמרו — לחצו לשמירה"
                  aria-label="שינויים ללא שמירה — לחצו לשמירה או למעבר לכפתור השמור"
                >
                  {builderSaveState.label}
                </button>
              ) : (
                <span
                  className={`builder-confidence-strip__pill builder-confidence-strip__pill--${builderSaveState.tone}`}
                >
                  {builderSaveState.label}
                </span>
              )}
              <span className="builder-confidence-strip__sep" aria-hidden>
                ·
              </span>
              <span className="builder-confidence-strip__item">
                סקשן: <strong dir="auto">{builderSelectedSectionLabel}</strong>
              </span>
              <span className="builder-confidence-strip__sep" aria-hidden>
                ·
              </span>
              <span className="builder-confidence-strip__item">מוצגים: {builderFeaturedSummary}</span>
              <span className="builder-confidence-strip__sep" aria-hidden>
                ·
              </span>
              <span className="builder-confidence-strip__item">{builderLogoSourceLabel}</span>
              <span className="builder-confidence-strip__sep" aria-hidden>
                ·
              </span>
              <span className="builder-confidence-strip__item">
                מגרש פעיל:{' '}
                <strong dir="ltr">{selectedYardId || activeLegacyTenantId || 'לא נבחר'}</strong>
              </span>
            </div>
            <BuilderCanvas
              ref={canvasFrameRef}
              viewportMode={previewDevice}
              onViewportModeChange={setPreviewDevice}
            >
              <TenantHomeSectionsView
                normalized={previewNormalized}
                branding={previewBranding}
                isPreview
                cars={builderHomepageMeta.cars}
                rootClassName="builder-preview-inner"
                builderEditMode={{
                  selectedSection,
                  onSelectSection: (k) => selectBuilderSection(k),
                  onToggleSectionVisibility: toggleBuilderSectionVisibility,
                  canvasSectionReorder,
                }}
                previewHeroBackgroundPosition={previewHeroBackgroundPosition}
                draftSectionStyles={sectionStyles}
                draftSectionInheritsSiteTheme={null}
                draftSectionInheritsSiteThemeStyle={sectionInheritsSiteThemeStyle}
                draftSectionInheritsSiteThemeAccent={sectionInheritsSiteThemeAccent}
              />
            </BuilderCanvas>
          </div>
          <div className="builder-inspector-scroll">
            <ScreenshotImportPanel
              disabled={formBusy || !activeLegacyTenantId}
              tenantId={activeLegacyTenantId || null}
              baseSyntheticConfig={baseSyntheticConfig}
              onPreviewNormalizedReady={setScreenshotPreviewNormalized}
              onApply={handleScreenshotImportApply}
            />
            <BuilderInspector
              selected={selectedSection}
              formBusy={formBusy}
              uploadingKind={uploadingKind}
              yardLogoUrl={builderYardProfile?.yardLogoUrl ?? null}
              tenantNameFallback={saasTenant?.name ?? null}
              previewDisplayName={previewDisplayName}
              previewSeoTitle={previewSeoTitleLive}
              onLogoFiles={(f) => void handleMediaPick('logo', f)}
              onHeroFiles={(f) => void handleMediaPick('hero', f)}
              onOgFiles={(f) => void handleMediaPick('og', f)}
              onApplyYardLogo={() => setLogoUrl('')}
              siteName={siteName}
              setSiteName={setSiteName}
              displayName={displayName}
              setDisplayName={setDisplayName}
              logoUrl={logoUrl}
              setLogoUrl={setLogoUrl}
              heroImageUrl={heroImageUrl}
              setHeroImageUrl={setHeroImageUrl}
              primaryColor={primaryColor}
              setPrimaryColor={setPrimaryColor}
              secondaryColor={secondaryColor}
              setSecondaryColor={setSecondaryColor}
              accentColor={accentColor}
              setAccentColor={setAccentColor}
              textColor={textColor}
              setTextColor={setTextColor}
              backgroundColor={backgroundColor}
              setBackgroundColor={setBackgroundColor}
              themeVariant={themeVariant}
              setThemeVariant={setThemeVariant}
              heroTitle={heroTitle}
              setHeroTitle={setHeroTitle}
              heroSubtitle={heroSubtitle}
              setHeroSubtitle={setHeroSubtitle}
              heroCtaText={heroCtaText}
              setHeroCtaText={setHeroCtaText}
              heroCtaLink={heroCtaLink}
              setHeroCtaLink={setHeroCtaLink}
              heroFocalX={heroFocalX}
              setHeroFocalX={setHeroFocalX}
              heroFocalY={heroFocalY}
              setHeroFocalY={setHeroFocalY}
              aboutTitle={aboutTitle}
              setAboutTitle={setAboutTitle}
              aboutText={aboutText}
              setAboutText={setAboutText}
              showAbout={showAbout}
              setShowAbout={setShowAbout}
              benefitsTitle={benefitsTitle}
              setBenefitsTitle={setBenefitsTitle}
              benefitsItemsText={benefitsItemsText}
              setBenefitsItemsText={setBenefitsItemsText}
              showBenefits={showBenefits}
              setShowBenefits={setShowBenefits}
              financeTitle={financeTitle}
              setFinanceTitle={setFinanceTitle}
              financeText={financeText}
              setFinanceText={setFinanceText}
              showFinance={showFinance}
              setShowFinance={setShowFinance}
              testimonialsTitle={testimonialsTitle}
              setTestimonialsTitle={setTestimonialsTitle}
              testimonialsText={testimonialsText}
              setTestimonialsText={setTestimonialsText}
              showTestimonials={showTestimonials}
              setShowTestimonials={setShowTestimonials}
              contactTitle={contactTitle}
              setContactTitle={setContactTitle}
              contactSubtitle={contactSubtitle}
              setContactSubtitle={setContactSubtitle}
              phone={phone}
              setPhone={setPhone}
              whatsapp={whatsapp}
              setWhatsapp={setWhatsapp}
              email={email}
              setEmail={setEmail}
              address={address}
              setAddress={setAddress}
              city={city}
              setCity={setCity}
              facebookUrl={facebookUrl}
              setFacebookUrl={setFacebookUrl}
              instagramUrl={instagramUrl}
              setInstagramUrl={setInstagramUrl}
              websiteUrl={websiteUrl}
              setWebsiteUrl={setWebsiteUrl}
              showContact={showContact}
              setShowContact={setShowContact}
              showMap={showMap}
              setShowMap={setShowMap}
              seoTitle={seoTitle}
              setSeoTitle={setSeoTitle}
              seoDescription={seoDescription}
              setSeoDescription={setSeoDescription}
              ogImageUrl={ogImageUrl}
              setOgImageUrl={setOgImageUrl}
              yardUid={yardUid}
              setYardUid={setYardUid}
              sellerUid={sellerUid}
              setSellerUid={setSellerUid}
              showFeaturedCars={showFeaturedCars}
              setShowFeaturedCars={setShowFeaturedCars}
              featuredCarIds={featuredCarIds}
              homepageSelectionMeta={builderHomepageMeta}
              builderInventoryCars={builderInventoryCars}
              builderInventoryLoading={builderInventoryLoading}
              builderInventoryError={builderInventoryError}
              yardPhone={builderYardProfile?.phone}
              yardWhatsapp={builderYardProfile?.whatsappServicePhone}
              yardEmail={builderYardProfile?.email}
              yardAddress={builderYardProfile?.address}
              yardCity={builderYardProfile?.city}
              yardWebsite={builderYardProfile?.website}
              sectionStyles={sectionStyles}
              onChangeSectionStyle={handleChangeSectionStyle}
              onResetSectionStyle={handleResetSectionStyle}
              onApplySectionStyleToAll={handleApplySectionStyleToAll}
              siteThemePackKey={siteThemePackKey}
              onSelectSiteThemePack={handleSelectSiteThemePack}
              onApplySiteThemePackBranding={handleApplySiteThemePackBranding}
              onClearSiteThemePack={handleClearSiteThemePack}
              onForceSiteThemeToSections={handleForceSiteThemeToSections}
              onClearSectionThemeInheritance={handleClearSectionThemeInheritance}
              sectionInheritsSiteThemeStyle={sectionInheritsSiteThemeStyle}
              sectionInheritsSiteThemeAccent={sectionInheritsSiteThemeAccent}
              brandingResolutionLayout={brandingResolutionLayout}
              normalizedBrandingForTheme={previewNormalized.branding}
              appliedThemeSnapshot={appliedThemeSnapshot}
              onBreakSectionFromSiteTheme={handleBreakSectionFromSiteTheme}
              onBreakSectionStyleFromSiteTheme={handleBreakSectionStyleFromSiteTheme}
              onBreakSectionAccentFromSiteTheme={handleBreakSectionAccentFromSiteTheme}
              onLinkSectionToSiteTheme={handleLinkSectionToSiteTheme}
              onLinkSectionStyleToTheme={handleLinkSectionStyleToTheme}
              onLinkSectionAccentToTheme={handleLinkSectionAccentToTheme}
              onRevertSectionStyleToTheme={handleRevertSectionStyleToTheme}
              themeAccentStrategy={themeAccentStrategy}
              onThemeAccentStrategyChange={setThemeAccentStrategy}
              onRevertSectionAccentToTheme={handleRevertSectionAccentToTheme}
              onUpgradeAppliedThemeFromLivePack={handleUpgradeAppliedThemeFromLivePack}
              onForceApplyThemeStyleToSections={handleForceSiteThemeStyleToSections}
              onForceApplyThemeAccentToSections={handleForceSiteThemeAccentToSections}
              themeCarousel={{
                disabled: builderSaveButtonDisabled,
                applyBusy: themeCarouselApplyBusy,
                hoverPackKey: themeCarouselHoverKey,
                selectedPackKey: themeCarouselSelectedKey,
                onHoverPackKey: setThemeCarouselHoverKey,
                onSelectPackKey: setThemeCarouselSelectedKey,
                onApply: () => void handleThemeCarouselApply(),
                onUndo: () => void handleThemeCarouselUndo(),
                canUndo: themeCarouselUndoSnapshot != null,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
