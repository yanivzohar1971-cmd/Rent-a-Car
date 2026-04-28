import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchPublicCars, type PublicCar } from '../api/publicCarsApi';
import { listTenantDomains } from '../api/tenantDomainsApi';
import {
  getTenantSiteConfigByTenantId,
  upsertTenantSiteConfig,
  type TenantSiteConfig,
  type TenantSiteConfigWritePayload,
} from '../api/tenantSiteConfigsApi';
import type { UrlAnalyzerAiSummary } from '../api/tenantSiteUrlResearchApi';
import { deleteField } from '../firebase/firebaseClient';
import {
  BASIC_PLAN_MAX_CARS,
  computeTenantPublicSiteSuspended,
  getTenantById,
  type Tenant,
} from '../api/tenantsApi';
import {
  assertSafeTenantIdForStoragePath,
  mapTenantSiteMediaUploadErrorForUser,
  TENANT_SITE_UPLOAD_GUARD_MESSAGE,
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
import type { AiSiteImportPanelDebugSnapshot } from '../components/admin/siteBuilder/aiImportPanelDebug';
import { DebugActionButton } from '../components/debug/DebugActionButton';
import { CopyJsonButton } from '../components/debug/CopyJsonButton';
import { buildTenantLiveHomeSectionDiagnostics } from '../debug/tenantHomeLiveSectionDiagnostics';
import { safeStringify } from '../adminDebug/safeStringify';
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
  normalizeTenantSectionStyle,
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
import { getSectionThemePresetById } from '../tenant/sectionThemePresets';
import {
  coerceImportedTenantSiteConfig,
  devLogTenantSiteConfigImport,
  mergeTenantSiteConfigWritePayload,
  normalizeTenantSiteConfigImport,
  type ScreenshotDerivedSiteConfigImportInput,
} from '../tenant/tenantSiteConfigImport';
import type { UrlAutoApplyDebugBlock } from '../tenant/completeGeneratedTenantSiteConfig';
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
import {
  normalizeBuilderSectionVisibility,
  restoreBuilderSectionVisibility as restoreBuilderSectionVisibilityByKey,
} from '../tenant/builderSectionVisibility';
import { finalizeTenantRuntimeBranding, tenantBrandingFromNormalized } from '../tenant/tenantBranding';
import { TenantSiteYardPickerFields, useTenantSiteYardPicker } from '../components/admin/TenantSiteSelector';
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

function mapBuilderFirebaseErrorForUser(
  err: unknown,
  fallback: string,
  opts?: { requiresLoadedConfig?: boolean; requiresTenantSelection?: boolean },
): string {
  const code = firestoreErrorCode(err);
  if (opts?.requiresTenantSelection) {
    return 'בחרו מגרש לפני הפעולה.';
  }
  if (opts?.requiresLoadedConfig) {
    return 'צריך לטעון קונפיגורציה לפני הפעולה.';
  }
  if (code === 'permission-denied' || code === 'storage/permission-denied' || code === 'storage/unauthorized') {
    return 'אין לכם הרשאה לבצע פעולה זו. התחברו כמשתמש אדמין ונסו שוב.';
  }
  if (code === 'unauthenticated') {
    return 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.';
  }
  if (code === 'unavailable') {
    return 'השירות לא זמין כרגע. נסו שוב בעוד רגע.';
  }
  return err instanceof Error && err.message.trim() ? err.message : fallback;
}

function str(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v;
}

/** Primary hero URL first, then one URL per line (max 8 total). */
function combineHeroImageUrlsForBranding(primary: string, extraBlob: string): string[] {
  const out: string[] = [];
  const p = primary.trim();
  if (p) out.push(p);
  for (const line of extraBlob.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

function coerceNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveProtectedDataScopeForSave(args: {
  draftDataScope: Record<string, unknown>;
  existingConfig: TenantSiteConfig | null;
  selectedYardId: string;
  tenantId: string;
}): { dataScope: Record<string, unknown> | undefined; debug: Record<string, unknown> } {
  const debug: Record<string, unknown> = {
    tenantId: args.tenantId,
    selectedYardId: args.selectedYardId.trim() || null,
    dataScopePreservedOnSave: false,
    dataScopeRestoredFromSelectedYard: false,
  };
  const existingDataScope = asRecord(args.existingConfig?.dataScope);
  const existingHasDataScope = Object.keys(existingDataScope).length > 0;
  const draftHasDataScope = Object.keys(args.draftDataScope).length > 0;
  let out: Record<string, unknown> | undefined = draftHasDataScope ? { ...args.draftDataScope } : undefined;
  if (!out && existingHasDataScope) {
    out = { ...existingDataScope };
    debug.dataScopePreservedOnSave = true;
  }
  const selectedYardId = args.selectedYardId.trim();
  const currentYardUid = coerceNonEmptyString(out?.yardUid);
  if (selectedYardId && !currentYardUid) {
    out = { ...(out ?? {}), yardUid: selectedYardId };
    debug.dataScopeRestoredFromSelectedYard = true;
  }
  debug.finalDataScope = out ?? null;
  return { dataScope: out, debug };
}

function buildSyntheticConfig(
  tenantId: string,
  s: {
    siteName: string;
    displayName: string;
    logoUrl: string;
    tenantLogoSource: '' | 'website' | 'yard' | 'manual';
    logoWebsiteCandidateUrl: string;
    logoYardCandidateUrl: string;
    primaryCtaBackgroundColor: string;
    primaryCtaTextColor: string;
    featuredCarsPresentation: 'grid' | 'carsCarousel';
    heroImageUrl: string;
    /** Extra hero slide URLs (one per line); primary is {@link heroImageUrl}. */
    heroImageExtraUrls: string;
    pageBackgroundImageUrl: string;
    pageBackgroundOverlayOpacity: string;
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
    defaultSectionThemePresetId: string;
  },
): TenantSiteConfig {
  const branding: Record<string, unknown> = {};
  if (s.siteName.trim()) branding.siteName = s.siteName.trim();
  if (s.displayName.trim()) branding.displayName = s.displayName.trim();
  if (s.logoUrl.trim()) branding.logoUrl = s.logoUrl.trim();
  if (s.tenantLogoSource === 'website' || s.tenantLogoSource === 'yard' || s.tenantLogoSource === 'manual') {
    branding.logoSource = s.tenantLogoSource;
  }
  if (s.logoWebsiteCandidateUrl.trim()) branding.logoWebsiteCandidate = s.logoWebsiteCandidateUrl.trim();
  if (s.logoYardCandidateUrl.trim()) branding.logoYardCandidate = s.logoYardCandidateUrl.trim();
  if (s.primaryCtaBackgroundColor.trim()) branding.primaryCtaBackgroundColor = s.primaryCtaBackgroundColor.trim();
  if (s.primaryCtaTextColor.trim()) branding.primaryCtaTextColor = s.primaryCtaTextColor.trim();
  const heroCombined = combineHeroImageUrlsForBranding(s.heroImageUrl, s.heroImageExtraUrls);
  if (heroCombined.length >= 2) {
    branding.heroImageUrl = heroCombined[0];
    branding.heroImageUrls = heroCombined;
  } else if (heroCombined.length === 1) {
    branding.heroImageUrl = heroCombined[0];
  }
  if (s.pageBackgroundImageUrl.trim()) branding.pageBackgroundImageUrl = s.pageBackgroundImageUrl.trim();
  if (s.pageBackgroundOverlayOpacity.trim()) {
    const n = Number(s.pageBackgroundOverlayOpacity.trim());
    if (Number.isFinite(n)) branding.pageBackgroundOverlayOpacity = Math.max(0, Math.min(0.85, n));
  }
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
    ...(s.featuredCarsPresentation === 'carsCarousel' ? { featuredCarsPresentation: 'carsCarousel' } : {}),
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
  const dp = s.defaultSectionThemePresetId.trim();
  if (dp && getSectionThemePresetById(dp)) {
    layout.defaultSectionThemePresetId = dp;
  }

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

type PageRuntimeCapturedErrorType = 'window-error' | 'unhandledrejection' | 'resource-error';

type PageRuntimeCapturedError = {
  type: PageRuntimeCapturedErrorType;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  sourceTag?: string;
  sourceUrl?: string;
  timestamp: string;
};

const PAGE_RUNTIME_ERROR_RING_MAX = 25;

function trimRuntimeStack(stack: string | undefined, maxLen = 800): string | undefined {
  if (!stack) return undefined;
  const t = stack.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

type PageRuntimeErrorLogItem = {
  type: 'window-error' | 'unhandledrejection' | 'resource-error';
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  sourceTag?: string;
  sourceUrl?: string;
  timestamp: string;
};

type PageActionErrorLogItem = {
  type:
    | 'callable-error'
    | 'fetch-error'
    | 'xhr-error'
    | 'action-error'
    | 'save-error'
    | 'upload-error'
    | 'analyze-url-error'
    | 'analyze-screenshot-error';
  action: string;
  message: string;
  code?: string;
  phase?: string;
  status?: number;
  url?: string;
  method?: string;
  debugError?: unknown;
  callableDetails?: unknown;
  /** URL analyzer / Anthropic row when present (normalized). */
  aiSummary?: UrlAnalyzerAiSummary | null;
  timestamp: string;
};

type PageUiErrorLogItem = {
  type: 'panel-error' | 'page-error' | 'guard-error' | 'coercion-error' | 'preview-error' | 'apply-error';
  source: string;
  message: string;
  details?: unknown;
  timestamp: string;
};

const PAGE_ERROR_LOG_RING_MAX = 25;

function trimDetailsForDebug(u: unknown, maxLen = 600): unknown {
  if (u === null || u === undefined) return u;
  if (typeof u !== 'object') {
    const s = String(u);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : u;
  }
  try {
    const s = JSON.stringify(u);
    if (s.length <= maxLen) return JSON.parse(s) as unknown;
    return { _truncated: true, preview: `${s.slice(0, maxLen)}…` };
  } catch {
    return '[unserializable]';
  }
}

export default function AdminTenantSiteBuilderPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAdmin = userProfile?.isAdmin === true;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFirestoreErrorCode, setLastFirestoreErrorCode] = useState<string>('');
  const [success, setSuccess] = useState<string | null>(null);
  const [loadedConfigMissing, setLoadedConfigMissing] = useState(false);
  const [rawLayoutHomeSections, setRawLayoutHomeSections] = useState<unknown>(null);
  const [uploadingKind, setUploadingKind] = useState<TenantSiteMediaKind | null>(null);
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [uploadBlockedToast, setUploadBlockedToast] = useState<string | null>(null);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [heroUploadError, setHeroUploadError] = useState<string | null>(null);
  const [ogUploadError, setOgUploadError] = useState<string | null>(null);
  const [pageBgUploadError, setPageBgUploadError] = useState<string | null>(null);
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
  /** Latest scope for debounced auto-load timeout (avoids stale dirty/config checks). */
  const autoLoadSnapshotRef = useRef({
    activeLegacyTenantId: '',
    configLoadedForTenantId: null as string | null,
    isDirty: false,
    selectedYardId: '',
  });
  /** Prevents overlapping save requests from rapid double-clicks before `saving` state commits. */
  const saveInFlightRef = useRef(false);
  /** When set, the next `error` transition skips the generic `page-error` ui log (guard/coercion already logged). */
  const suppressNextPageErrorUiLogRef = useRef(false);
  const prevPageErrorForUiLogRef = useRef<string | null>(null);
  const lastUrlAnalyzeErrKeyRef = useRef('');
  const lastScreenshotAnalyzeErrKeyRef = useRef('');
  const lastPanelErrKeyRef = useRef('');

  const [siteName, setSiteName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [tenantLogoSource, setTenantLogoSource] = useState<'' | 'website' | 'yard' | 'manual'>('');
  const [logoWebsiteCandidateUrl, setLogoWebsiteCandidateUrl] = useState('');
  const [logoYardCandidateUrl, setLogoYardCandidateUrl] = useState('');
  const [primaryCtaBackgroundColor, setPrimaryCtaBackgroundColor] = useState('');
  const [primaryCtaTextColor, setPrimaryCtaTextColor] = useState('');
  const [featuredCarsPresentation, setFeaturedCarsPresentation] = useState<'grid' | 'carsCarousel'>('grid');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroImageExtraUrls, setHeroImageExtraUrls] = useState('');
  const [pageBackgroundImageUrl, setPageBackgroundImageUrl] = useState('');
  const [pageBackgroundOverlayOpacity, setPageBackgroundOverlayOpacity] = useState('');
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
  const [defaultSectionThemePresetId, setDefaultSectionThemePresetId] = useState('');
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
  const [previewDevice, setPreviewDevice] = useState<BuilderCanvasViewport>('desktop');
  const [screenshotPreviewNormalized, setScreenshotPreviewNormalized] = useState<ReturnType<
    typeof normalizeTenantSiteConfigImport
  >['normalized'] | null>(null);
  const [aiImportPanelDebug, setAiImportPanelDebug] = useState<AiSiteImportPanelDebugSnapshot | null>(null);
  const [aiImportTenantResetToken, setAiImportTenantResetToken] = useState(0);
  const [pageDebugExpanded, setPageDebugExpanded] = useState(false);
  const [runtimeCapturedErrors, setRuntimeCapturedErrors] = useState<PageRuntimeCapturedError[]>([]);
  const [runtimeErrorLog, setRuntimeErrorLog] = useState<PageRuntimeErrorLogItem[]>([]);
  const [actionErrorLog, setActionErrorLog] = useState<PageActionErrorLogItem[]>([]);
  const [uiErrorLog, setUiErrorLog] = useState<PageUiErrorLogItem[]>([]);

  const onAiImportDebugStateChange = useCallback((snapshot: AiSiteImportPanelDebugSnapshot) => {
    setAiImportPanelDebug(snapshot);
  }, []);

  const resetAiImportStateForTenantChange = useCallback(() => {
    setScreenshotPreviewNormalized(null);
    setAiImportPanelDebug(null);
    setAiImportTenantResetToken((v) => v + 1);
    lastUrlAnalyzeErrKeyRef.current = '';
    lastScreenshotAnalyzeErrKeyRef.current = '';
    lastPanelErrKeyRef.current = '';
    setActionErrorLog((prev) =>
      prev.filter((entry) => entry.type !== 'analyze-url-error' && entry.type !== 'analyze-screenshot-error'),
    );
    setUiErrorLog((prev) =>
      prev.filter((entry) => !(entry.type === 'panel-error' && entry.source === 'aiImportPanel')),
    );
  }, []);

  const pushRuntimeErrorLog = useCallback((entry: PageRuntimeErrorLogItem) => {
    const message = entry.message.trim().slice(0, 2000) || '(no message)';
    const stack = entry.stack ? trimRuntimeStack(entry.stack) : undefined;
    setRuntimeErrorLog((prev) =>
      [{ ...entry, message, stack }, ...prev].slice(0, PAGE_ERROR_LOG_RING_MAX),
    );
  }, []);

  const pushActionErrorLog = useCallback((entry: PageActionErrorLogItem) => {
    const message = entry.message.trim().slice(0, 2000) || '(no message)';
    setActionErrorLog((prev) =>
      [
        {
          ...entry,
          message,
          debugError: entry.debugError !== undefined ? trimDetailsForDebug(entry.debugError) : undefined,
          callableDetails:
            entry.callableDetails !== undefined ? trimDetailsForDebug(entry.callableDetails) : undefined,
          aiSummary: entry.aiSummary !== undefined ? (trimDetailsForDebug(entry.aiSummary) as UrlAnalyzerAiSummary | null) : undefined,
        },
        ...prev,
      ].slice(0, PAGE_ERROR_LOG_RING_MAX),
    );
  }, []);

  const pushUiErrorLog = useCallback((entry: PageUiErrorLogItem) => {
    const message = entry.message.trim().slice(0, 2000) || '(no message)';
    const details = entry.details !== undefined ? trimDetailsForDebug(entry.details) : undefined;
    setUiErrorLog((prev) => [{ ...entry, message, details }, ...prev].slice(0, PAGE_ERROR_LOG_RING_MAX));
  }, []);

  const onYardsFetchErrorForPicker = useCallback(
    (msg: string) => {
      pushActionErrorLog({
        type: 'fetch-error',
        action: 'fetchAllYardsForAdmin',
        message: msg,
        timestamp: new Date().toISOString(),
      });
    },
    [pushActionErrorLog],
  );

  const yardPicker = useTenantSiteYardPicker({
    enabled: isAdmin,
    onYardsFetchError: onYardsFetchErrorForPicker,
  });

  const {
    yards,
    yardsError,
    selectedYardId,
    setSelectedYardId,
    setLegacyTenantIdInput,
    activeLegacyTenantId,
    yardSelected,
  } = yardPicker;

  const appendRuntimePageError = useCallback((entry: PageRuntimeCapturedError) => {
    setRuntimeCapturedErrors((prev) => [...prev, entry].slice(-PAGE_RUNTIME_ERROR_RING_MAX));
  }, []);

  useEffect(() => {
    const onWindowError = (ev: Event) => {
      const e = ev as ErrorEvent;
      const target = e.target;
      if (target && target !== window && target instanceof HTMLElement) {
        const tag = target.tagName?.toUpperCase?.() ?? '';
        let sourceUrl: string | undefined;
        if (tag === 'IMG' && 'src' in target) {
          sourceUrl = String((target as HTMLImageElement).src || '').trim().slice(0, 500);
        } else if (tag === 'SCRIPT' && 'src' in target) {
          sourceUrl = String((target as HTMLScriptElement).src || '').trim().slice(0, 500);
        } else if (tag === 'LINK' && 'href' in target) {
          sourceUrl = String((target as HTMLLinkElement).href || '').trim().slice(0, 500);
        } else if (tag === 'SOURCE' && 'src' in target) {
          sourceUrl = String((target as HTMLSourceElement).src || '').trim().slice(0, 500);
        } else if (tag === 'VIDEO' && 'src' in target) {
          sourceUrl = String((target as HTMLVideoElement).src || '').trim().slice(0, 500);
        }
        const resEntry: PageRuntimeErrorLogItem = {
          type: 'resource-error',
          message: (e.message || 'Resource load error').trim().slice(0, 2000) || 'Resource load error',
          sourceTag: tag || undefined,
          sourceUrl: sourceUrl || undefined,
          timestamp: new Date().toISOString(),
        };
        appendRuntimePageError(resEntry);
        pushRuntimeErrorLog(resEntry);
        return;
      }
      const errObj = e.error;
      const stack =
        errObj instanceof Error && typeof errObj.stack === 'string' ? trimRuntimeStack(errObj.stack) : undefined;
      const winEntry: PageRuntimeErrorLogItem = {
        type: 'window-error',
        message: (e.message || 'window error').trim().slice(0, 2000) || 'window error',
        filename: e.filename ? String(e.filename).slice(0, 500) : undefined,
        lineno: typeof e.lineno === 'number' ? e.lineno : undefined,
        colno: typeof e.colno === 'number' ? e.colno : undefined,
        stack,
        timestamp: new Date().toISOString(),
      };
      appendRuntimePageError(winEntry);
      pushRuntimeErrorLog(winEntry);
    };

    const onUnhandled = (ev: PromiseRejectionEvent) => {
      const r = ev.reason;
      let message = 'Unhandled promise rejection';
      let stack: string | undefined;
      if (r instanceof Error) {
        message = r.message.trim().slice(0, 2000) || message;
        stack = trimRuntimeStack(r.stack);
      } else if (typeof r === 'string') {
        message = r.trim().slice(0, 2000) || message;
      } else {
        try {
          message = JSON.stringify(r).slice(0, 400);
        } catch {
          message = String(r).slice(0, 400);
        }
      }
      const rejEntry: PageRuntimeErrorLogItem = {
        type: 'unhandledrejection',
        message,
        stack,
        timestamp: new Date().toISOString(),
      };
      appendRuntimePageError(rejEntry);
      pushRuntimeErrorLog(rejEntry);
    };

    window.addEventListener('error', onWindowError, true);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onWindowError, true);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, [appendRuntimePageError, pushRuntimeErrorLog]);

  useEffect(() => {
    if (!error) {
      prevPageErrorForUiLogRef.current = null;
      return;
    }
    if (error === prevPageErrorForUiLogRef.current) return;
    if (suppressNextPageErrorUiLogRef.current) {
      suppressNextPageErrorUiLogRef.current = false;
      prevPageErrorForUiLogRef.current = error;
      return;
    }
    prevPageErrorForUiLogRef.current = error;
    pushUiErrorLog({
      type: 'page-error',
      source: 'pageError',
      message: error,
      timestamp: new Date().toISOString(),
    });
  }, [error, pushUiErrorLog]);

  useEffect(() => {
    const blk = aiImportPanelDebug?.url?.error;
    if (!blk?.exists || !blk.message?.trim()) {
      lastUrlAnalyzeErrKeyRef.current = '';
      return;
    }
    const key = `${blk.timestamp ?? ''}\0${blk.message}\0${blk.code ?? ''}\0${blk.phase ?? ''}`;
    if (key === lastUrlAnalyzeErrKeyRef.current) return;
    lastUrlAnalyzeErrKeyRef.current = key;
    pushActionErrorLog({
      type: 'analyze-url-error',
      action: 'tenantSiteUrlResearch',
      message: blk.message.trim().slice(0, 2000),
      code: blk.code,
      phase: blk.phase ?? blk.debugError?.phase,
      debugError: blk.debugError,
      callableDetails: blk.callableDetails ?? { debugError: blk.debugError },
      aiSummary: blk.aiSummary ?? null,
      timestamp: blk.timestamp || new Date().toISOString(),
    });
  }, [aiImportPanelDebug, pushActionErrorLog]);

  useEffect(() => {
    const msg = aiImportPanelDebug?.screenshot?.lastAnalysisError;
    if (!msg?.trim()) {
      lastScreenshotAnalyzeErrKeyRef.current = '';
      return;
    }
    if (msg === lastScreenshotAnalyzeErrKeyRef.current) return;
    lastScreenshotAnalyzeErrKeyRef.current = msg;
    pushActionErrorLog({
      type: 'analyze-screenshot-error',
      action: 'screenshotAiAnalysis',
      message: msg.trim().slice(0, 2000),
      timestamp: new Date().toISOString(),
    });
  }, [aiImportPanelDebug?.screenshot?.lastAnalysisError, pushActionErrorLog]);

  useEffect(() => {
    const p = aiImportPanelDebug?.panelError;
    if (!p?.trim()) {
      lastPanelErrKeyRef.current = '';
      return;
    }
    if (p === lastPanelErrKeyRef.current) return;
    lastPanelErrKeyRef.current = p;
    pushUiErrorLog({
      type: 'panel-error',
      source: 'aiImportPanel',
      message: p.trim().slice(0, 2000),
      timestamp: new Date().toISOString(),
    });
  }, [aiImportPanelDebug?.panelError, pushUiErrorLog]);

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

  const formSnapshot = useMemo(
    () => ({
      siteName,
      displayName,
      logoUrl,
      tenantLogoSource,
      logoWebsiteCandidateUrl,
      logoYardCandidateUrl,
      primaryCtaBackgroundColor,
      primaryCtaTextColor,
      featuredCarsPresentation,
      heroImageUrl,
      heroImageExtraUrls,
      pageBackgroundImageUrl,
      pageBackgroundOverlayOpacity,
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
      defaultSectionThemePresetId,
    }),
    [
      siteName,
      displayName,
      logoUrl,
      tenantLogoSource,
      logoWebsiteCandidateUrl,
      logoYardCandidateUrl,
      primaryCtaBackgroundColor,
      primaryCtaTextColor,
      featuredCarsPresentation,
      heroImageUrl,
      heroImageExtraUrls,
      pageBackgroundImageUrl,
      pageBackgroundOverlayOpacity,
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
      defaultSectionThemePresetId,
    ],
  );

  const previewTenantId = activeLegacyTenantId || 'preview';
  const tenantResetScopeRef = useRef<{
    selectedYardId: string;
    activeLegacyTenantId: string;
    configLoadedForTenantId: string | null;
  } | null>(null);

  useEffect(() => {
    const now = {
      selectedYardId: selectedYardId.trim(),
      activeLegacyTenantId: activeLegacyTenantId.trim(),
      configLoadedForTenantId: configLoadedForTenantId?.trim() || null,
    };
    const prev = tenantResetScopeRef.current;
    tenantResetScopeRef.current = now;
    if (!prev) return;
    const changed =
      prev.selectedYardId !== now.selectedYardId ||
      prev.activeLegacyTenantId !== now.activeLegacyTenantId ||
      prev.configLoadedForTenantId !== now.configLoadedForTenantId;
    if (!changed) return;
    resetAiImportStateForTenantChange();
  }, [selectedYardId, activeLegacyTenantId, configLoadedForTenantId, resetAiImportStateForTenantChange]);
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
        const msg = 'טעינת המלאי נכשלה';
        pushActionErrorLog({
          type: 'fetch-error',
          action: 'fetchPublicCars',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        setBuilderInventoryError(msg);
        setBuilderInventoryCars([]);
      })
      .finally(() => {
        if (cancelled) return;
        setBuilderInventoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [yardUid, sellerUid, activeLegacyTenantId, pushActionErrorLog]);

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

  useEffect(() => {
    const y = builderYardProfile?.yardLogoUrl?.trim();
    if (y) setLogoYardCandidateUrl(y);
  }, [builderYardProfile?.yardLogoUrl]);

  const serializedForm = JSON.stringify(formSnapshot);

  useLayoutEffect(() => {
    setBaselineSerialized(serializedForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-baseline after load/save (baselineVersion), not each keystroke
  }, [baselineVersion]);

  const isDirty = baselineSerialized !== '' && serializedForm !== baselineSerialized;

  autoLoadSnapshotRef.current = {
    activeLegacyTenantId,
    configLoadedForTenantId,
    isDirty,
    selectedYardId,
  };

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

  useEffect(() => {
    if (!uploadBlockedToast) return;
    const t = window.setTimeout(() => setUploadBlockedToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [uploadBlockedToast]);

  const tenantIdMismatch =
    configLoadedForTenantId !== null &&
    activeLegacyTenantId !== '' &&
    activeLegacyTenantId !== configLoadedForTenantId;
  const formBusy = saving || loading || !!uploadingKind || themeCarouselApplyBusy;
  const handleBlockedUploadAttempt = useCallback(() => {
    const msg = !activeLegacyTenantId
      ? 'בחרו מגרש לפני העלאת קבצים.'
      : 'נדרשת קונפיגורציה שנטענה מהשרת לפני העלאת קבצים (ריענון ידני אם הטעינה האוטומטית נכשלה).';
    setError(msg);
    setUploadBlockedToast(msg);
  }, [activeLegacyTenantId]);

  const clearUploadInlineErrors = useCallback(() => {
    setLogoUploadError(null);
    setHeroUploadError(null);
    setOgUploadError(null);
    setPageBgUploadError(null);
  }, []);

  const setUploadInlineError = useCallback((kind: TenantSiteMediaKind, message: string | null) => {
    if (kind === 'logo') setLogoUploadError(message);
    else if (kind === 'hero') setHeroUploadError(message);
    else if (kind === 'pageBg') setPageBgUploadError(message);
    else setOgUploadError(message);
  }, []);

  const applyBaselineSnapshot = useCallback((s: BuilderFormBaselineSnapshot) => {
    setSiteName(s.siteName);
    setDisplayName(s.displayName);
    setLogoUrl(s.logoUrl);
    setTenantLogoSource(s.tenantLogoSource);
    setLogoWebsiteCandidateUrl(s.logoWebsiteCandidateUrl);
    setLogoYardCandidateUrl(s.logoYardCandidateUrl);
    setPrimaryCtaBackgroundColor(s.primaryCtaBackgroundColor);
    setPrimaryCtaTextColor(s.primaryCtaTextColor);
    setFeaturedCarsPresentation(s.featuredCarsPresentation);
    setHeroImageUrl(s.heroImageUrl);
    setHeroImageExtraUrls(s.heroImageExtraUrls ?? '');
    setPageBackgroundImageUrl(s.pageBackgroundImageUrl);
    setPageBackgroundOverlayOpacity(s.pageBackgroundOverlayOpacity);
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
    setDefaultSectionThemePresetId(s.defaultSectionThemePresetId ?? '');
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
    const lsRaw = n.branding.logoSource ?? (typeof b.logoSource === 'string' ? b.logoSource : '');
    setTenantLogoSource(lsRaw === 'website' || lsRaw === 'yard' || lsRaw === 'manual' ? lsRaw : '');
    setLogoWebsiteCandidateUrl(str(n.branding.logoWebsiteCandidate ?? b.logoWebsiteCandidate));
    setLogoYardCandidateUrl(str(n.branding.logoYardCandidate ?? b.logoYardCandidate));
    setPrimaryCtaBackgroundColor(str(n.branding.primaryCtaBackgroundColor ?? b.primaryCtaBackgroundColor));
    setPrimaryCtaTextColor(str(n.branding.primaryCtaTextColor ?? b.primaryCtaTextColor));
    setFeaturedCarsPresentation(n.layout.featuredCarsPresentation);
    setHeroImageUrl(str(n.branding.heroImageUrl ?? b.heroImageUrl));
    setHeroImageExtraUrls(
      n.branding.heroImageUrls.length > 1 ? n.branding.heroImageUrls.slice(1).join('\n') : '',
    );
    setPageBackgroundImageUrl(str(n.branding.pageBackgroundImageUrl ?? b.pageBackgroundImageUrl));
    setPageBackgroundOverlayOpacity(
      n.branding.pageBackgroundOverlayOpacity != null && Number.isFinite(n.branding.pageBackgroundOverlayOpacity)
        ? String(n.branding.pageBackgroundOverlayOpacity)
        : '',
    );
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
    setDefaultSectionThemePresetId(n.layout.defaultSectionThemePresetId ?? '');
    setSiteThemePackKey(n.branding.siteThemePackKey ?? '');
    setThemeAccentStrategy(n.branding.themeAccentStrategy);
    setSectionInheritsSiteThemeStyle({ ...n.layout.sectionInheritsSiteThemeStyle });
    setSectionInheritsSiteThemeAccent({ ...n.layout.sectionInheritsSiteThemeAccent });
    setAppliedThemeSnapshot(n.branding.appliedThemeSnapshot);
    setSiteThemeSectionDefaults(n.branding.siteThemeSectionDefaults);
  }, []);

  const loadConfigForTenantId = useCallback(
    async (tid: string, opts?: { preferredYardUid?: string }) => {
      if (!tid) {
        setError('בחרו מגרש לפני טעינת קונפיגורציה.');
        return;
      }
      try {
        assertSafeTenantIdForStoragePath(tid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'מזהה תאימות לא תקין';
        pushUiErrorLog({
          type: 'guard-error',
          source: 'loadConfig:assertSafeTenantIdForStoragePath',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        return;
      }
      if (saving) return;
      setLoading(true);
      setError(null);
      setLastFirestoreErrorCode('');
      setSuccess(null);
      setUploadInfo(null);
      setLoadedConfigMissing(false);
      setRawLayoutHomeSections(null);
      const preferredYardId = (opts?.preferredYardUid ?? selectedYardId).trim();
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
        setLastFirestoreErrorCode(firestoreErrorCode(err));
        const mapped = mapBuilderFirebaseErrorForUser(err, 'טעינת הקונפיגורציה נכשלה.');
        pushActionErrorLog({
          type: 'fetch-error',
          action: 'getTenantSiteConfigByTenantId',
          message: mapped,
          code: firestoreErrorCode(err) || undefined,
          debugError: err,
          timestamp: new Date().toISOString(),
        });
        setError(mapped);
      } finally {
        setLoading(false);
        setDragSectionIndex(null);
        setSectionDropTargetIndex(null);
      }
    },
    [selectedYardId, fillFromConfig, saving, pushUiErrorLog, pushActionErrorLog],
  );

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

  const handleLoad = async () => {
    if (!activeLegacyTenantId) {
      setError('בחרו מגרש לפני טעינה.');
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

    const tidAtSchedule = activeLegacyTenantId.trim();
    if (!tidAtSchedule) return;

    const delayMs = selectedYardId.trim() ? 0 : 350;

    const timeoutId = window.setTimeout(() => {
      const snap = autoLoadSnapshotRef.current;
      const t = snap.activeLegacyTenantId.trim();
      if (!t || t !== tidAtSchedule) return;
      if (t === snap.configLoadedForTenantId) return;
      if (snap.isDirty) return;
      const preferredYardUid = snap.selectedYardId.trim() || t;
      void loadConfigForTenantId(t, { preferredYardUid });
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    isAdmin,
    authLoading,
    activeLegacyTenantId,
    selectedYardId,
    configLoadedForTenantId,
    isDirty,
    loadConfigForTenantId,
  ]);

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

  const normalizedBuilderVisibility = useMemo(
    () =>
      normalizeBuilderSectionVisibility({
        homeSections: sectionOrder,
        ...layoutShowFlags,
      }),
    [sectionOrder, layoutShowFlags],
  );

  const isSectionVisibleInStructure = useCallback(
    (key: TenantHomeSectionKey) => normalizedBuilderVisibility.isVisible(key),
    [normalizedBuilderVisibility],
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
    if (tid && configLoadedForTenantId === null && !loading) {
      list.push('לא נטענה קונפיגורציה מהשרת למגרש זה — אם הטעינה האוטומטית נכשלה, השתמשו ב״ריענון קונפיגורציה מהשרת״ לפני העלאת מדיה.');
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
    loading,
  ]);

  const pageDebugSnapshot = useMemo(() => {
    const formFilledApproxCount = Object.values(formSnapshot).filter((v) => typeof v === 'string' && String(v).trim()).length;
    const previewTopLevelKeys = Object.keys(previewNormalized).filter((k) => k !== 'raw');
    const urlErrMsg = aiImportPanelDebug?.url.error.exists ? aiImportPanelDebug.url.error.message ?? null : null;
    const recentRelevantErrors = Array.from(
      new Set(
        [
          error,
          yardsError,
          builderInventoryError,
          logoUploadError,
          heroUploadError,
          ogUploadError,
          pageBgUploadError,
          aiImportPanelDebug?.panelError,
          urlErrMsg,
          aiImportPanelDebug?.screenshot.lastAnalysisError,
        ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0),
      ),
    ).slice(0, 16);
    const tenantSuspendedLive = saasTenant ? computeTenantPublicSiteSuspended(saasTenant, Date.now()).suspended : false;
    return {
      snapshotVersion: 2,
      pageId: 'adminTenantSiteBuilder',
      timestamp: new Date().toISOString(),
      page: {
        route: location.pathname,
        queryTenantId: urlTenantId || null,
        tenantId: activeLegacyTenantId || null,
        configLoadedForTenantId,
        tenantIdMismatch,
        isLoadingConfig: loading,
        isSaving: saving,
        saveError: error,
        saveFirestoreCode: lastFirestoreErrorCode || null,
        successMessage: success,
        dirty: isDirty,
        saveStateTone: builderSaveState.tone,
        previewDevice,
        selectedSectionKey: selectedSection,
        uploadProgressPercent,
        loadedConfigMissing,
        themeCarouselApplyBusy,
      },
      builder: {
        formFilledApproxCount,
        sectionOrder,
        visibleSections: normalizedBuilderVisibility.visibleSectionOrder,
        hiddenSections: normalizedBuilderVisibility.hiddenSectionOrder,
        layoutShowFlags,
        brandingSummary: {
          hasLogo: Boolean(logoUrl.trim() || builderYardProfile?.yardLogoUrl?.trim()),
          hasHeroImage: combineHeroImageUrlsForBranding(heroImageUrl, heroImageExtraUrls).length > 0,
          hasPageBackground: Boolean(pageBackgroundImageUrl.trim()),
          siteThemePackKey: siteThemePackKey.trim() || null,
        },
        heroSummary: {
          hasTitle: Boolean(heroTitle.trim()),
          focal: { x: heroFocalX, y: heroFocalY },
        },
      },
      preview: {
        hasScreenshotAiOverride: screenshotPreviewNormalized != null,
        themeCarouselPreviewKey: themeCarouselPreviewKey?.trim() || null,
        previewSectionCount: previewNormalized.layout.homeSections.length,
        previewTopLevelKeys,
      },
      sectionPreviewDiagnostics: buildTenantLiveHomeSectionDiagnostics({
        normalized: previewNormalized,
        branding: previewBranding,
        scopeMissing: !yardUid.trim() && !sellerUid.trim(),
        publicSiteSuspended: tenantSuspendedLive,
        homepageMeta: builderHomepageMeta,
        scopedInventoryFetchedCount: builderInventoryCars.length,
        featuredCarsRendered: builderHomepageMeta.cars.length,
      }),
      urlAiGeneration: aiImportPanelDebug?.urlGeneration ?? null,
      aiContentMappingHints: {
        aboutText: Boolean(previewNormalized.content.aboutText?.trim()),
        benefitsCount: previewNormalized.content.benefitsItems.length,
        financeText: Boolean(previewNormalized.content.financeText?.trim()),
        testimonialsText: Boolean(previewNormalized.content.testimonialsText?.trim()),
        mapAddressOrCity: Boolean(
          (previewNormalized.contact.address || '').trim() || (previewNormalized.contact.city || '').trim(),
        ),
      },
      screenshotImport: aiImportPanelDebug?.screenshot ?? null,
      urlImport: aiImportPanelDebug?.url ?? null,
      aiImportPanel: aiImportPanelDebug
        ? { importSource: aiImportPanelDebug.importSource, applyBusy: aiImportPanelDebug.applyBusy, panelError: aiImportPanelDebug.panelError }
        : null,
      uploads: {
        activeUploadKind: uploadingKind,
        uploadBusy: Boolean(uploadingKind),
        uploadProgressPercent,
        uploadBlockedToast,
        errors: {
          logo: logoUploadError,
          hero: heroUploadError,
          og: ogUploadError,
          pageBg: pageBgUploadError,
        },
      },
      errors: {
        pageError: error,
        screenshotError: aiImportPanelDebug?.screenshot.lastAnalysisError ?? null,
        urlError: urlErrMsg,
        yardsError,
        builderInventoryError,
        recentRelevantErrors,
        runtimeCapturedErrors,
        runtimeErrorLog,
        actionErrorLog,
        uiErrorLog,
      },
      events: {
        recentDebugEvents: [] as unknown[],
        runtimeErrorCount: runtimeCapturedErrors.length,
        actionErrorCount: actionErrorLog.length,
        uiErrorCount: uiErrorLog.length,
        lastRuntimeErrorType: runtimeCapturedErrors.length ? runtimeCapturedErrors[runtimeCapturedErrors.length - 1]!.type : null,
        lastActionErrorType: actionErrorLog.length ? actionErrorLog[0]!.type : null,
        lastUiErrorType: uiErrorLog.length ? uiErrorLog[0]!.type : null,
        note: 'recentDebugEvents: no app-wide ring; runtime entries come from page-scoped window listeners only.',
      },
    };
  }, [
    location.pathname,
    urlTenantId,
    activeLegacyTenantId,
    configLoadedForTenantId,
    tenantIdMismatch,
    loading,
    saving,
    error,
    lastFirestoreErrorCode,
    success,
    isDirty,
    builderSaveState.tone,
    previewDevice,
    selectedSection,
    uploadProgressPercent,
    loadedConfigMissing,
    themeCarouselApplyBusy,
    formSnapshot,
    sectionOrder,
    normalizedBuilderVisibility.visibleSectionOrder,
    normalizedBuilderVisibility.hiddenSectionOrder,
    layoutShowFlags,
    logoUrl,
    builderYardProfile?.yardLogoUrl,
    heroImageUrl,
    heroImageExtraUrls,
    pageBackgroundImageUrl,
    siteThemePackKey,
    heroTitle,
    heroFocalX,
    heroFocalY,
    screenshotPreviewNormalized,
    themeCarouselPreviewKey,
    previewNormalized,
    previewBranding,
    builderHomepageMeta,
    builderInventoryCars.length,
    yardUid,
    sellerUid,
    saasTenant,
    aiImportPanelDebug,
    uploadingKind,
    uploadBlockedToast,
    logoUploadError,
    heroUploadError,
    ogUploadError,
    pageBgUploadError,
    yardsError,
    builderInventoryError,
    runtimeCapturedErrors,
    runtimeErrorLog,
    actionErrorLog,
    uiErrorLog,
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
    restoreBuilderSectionVisibilityByKey(key, {
      setShowFeaturedCars,
      setShowAbout,
      setShowBenefits,
      setShowFinance,
      setShowTestimonials,
      setShowContact,
      setShowMap,
    });
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
      const msg = 'טעינת דומיינים נכשלה';
      pushActionErrorLog({
        type: 'fetch-error',
        action: 'listTenantDomains',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      setError(msg);
    }
  }, [activeLegacyTenantId, pushActionErrorLog]);

  const handleMediaPick = async (kind: TenantSiteMediaKind, fileList: FileList | null) => {
    clearUploadInlineErrors();
    const fieldTid = activeLegacyTenantId;
    if (!fieldTid || configLoadedForTenantId === null) {
      setUploadInlineError(kind, TENANT_SITE_UPLOAD_GUARD_MESSAGE);
      handleBlockedUploadAttempt();
      return;
    }
    if (configLoadedForTenantId !== null) {
      if (fieldTid !== configLoadedForTenantId) {
        const msg = 'מזהה המגרש שונה מהקונפיגורציה שנטענה. טענו מחדש לפני העלאה.';
        setUploadInlineError(kind, msg);
        pushUiErrorLog({
          type: 'guard-error',
          source: 'handleMediaPick:tenantIdMismatch',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        return;
      }
    }
    const uploadTid = configLoadedForTenantId;
    const file = fileList?.[0];
    if (!file) return;
    if (uploadingKind || saving) return;
    try {
      validateTenantSiteImageFile(file);
      assertSafeTenantIdForStoragePath(uploadTid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'קובץ לא תקין';
      setUploadInlineError(kind, msg);
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleMediaPick:validateFileOrTenantId',
        message: msg,
        details: e,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    setUploadingKind(kind);
    setUploadProgressPercent(0);
    setError(null);
    setUploadInfo(null);
    setUploadInlineError(kind, null);
    try {
      const url = await uploadTenantSiteMedia(uploadTid, kind, file, (ratio) => {
        setUploadProgressPercent(Math.round(ratio * 100));
      });
      if (kind === 'logo') {
        setLogoUrl(url);
        setTenantLogoSource('manual');
      }
      else if (kind === 'hero') setHeroImageUrl(url);
      else if (kind === 'pageBg') setPageBackgroundImageUrl(url);
      else setOgImageUrl(url);
      setUploadInfo(
        kind === 'logo'
          ? 'הלוגו הועלה — לחצו שמור כדי לשמור ב-Firestore.'
          : kind === 'hero'
            ? 'תמונת ה-Hero הועלתה — לחצו שמור.'
            : kind === 'pageBg'
              ? 'תמונת רקע העמוד הועלתה — לחצו שמור.'
              : 'תמונת OG הועלתה — לחצו שמור.',
      );
    } catch (e) {
      const msg = mapTenantSiteMediaUploadErrorForUser(e);
      setUploadInlineError(kind, msg);
      pushActionErrorLog({
        type: 'upload-error',
        action: `uploadTenantSiteMedia:${kind}`,
        message: msg,
        code: firestoreErrorCode(e) || undefined,
        debugError: e,
        timestamp: new Date().toISOString(),
      });
      setError(msg);
      setUploadBlockedToast(msg);
    } finally {
      setUploadProgressPercent(null);
      setUploadingKind(null);
    }
  };

  const handleControlledLogoUrlChange = useCallback((v: string) => {
    setLogoUrl(v);
    if (!v.trim()) setTenantLogoSource('');
    else setTenantLogoSource('manual');
  }, []);

  const handleApplyWebsiteLogoDraft = useCallback(() => {
    const u = logoWebsiteCandidateUrl.trim();
    if (!u) return;
    setLogoUrl(u);
    setTenantLogoSource('website');
  }, [logoWebsiteCandidateUrl]);

  const handleApplyYardLogoDraft = useCallback(() => {
    const y = builderYardProfile?.yardLogoUrl?.trim();
    if (!y) return;
    setLogoUrl(y);
    setTenantLogoSource('yard');
    setLogoYardCandidateUrl(y);
  }, [builderYardProfile?.yardLogoUrl]);

  const handleSave = async () => {
    const tid = activeLegacyTenantId;
    if (!tid) {
      setError('בחרו מגרש לפני שמירה.');
      return;
    }
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      const msg = `מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו קונפיגורציה מחדש לפני שמירה.`;
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleSave:tenantIdMismatch',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'מזהה תאימות לא תקין';
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleSave:assertSafeTenantIdForStoragePath',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
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
      { label: 'צבע רקע כפתור Hero (מיובא)', value: primaryCtaBackgroundColor },
      { label: 'צבע טקסט כפתור Hero (מיובא)', value: primaryCtaTextColor },
    ];
    for (const { label, value } of colorFields) {
      const v = value.trim();
      if (!v) continue;
      const r = validateColorInput(v);
      if (!r.ok) {
        const msg = `${label}: ${r.error}`;
        pushUiErrorLog({
          type: 'guard-error',
          source: `handleSave:validateColor:${label}`,
          message: msg,
          details: { label, error: r.error },
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        return;
      }
    }

    const cta = heroCtaLink.trim();
    if (cta) {
      const rCta = validateOptionalUrlOrPath(cta);
      if (!rCta.ok) {
        const msg = `קישור CTA: ${rCta.error}`;
        pushUiErrorLog({
          type: 'guard-error',
          source: 'handleSave:validateOptionalUrlOrPath:heroCtaLink',
          message: msg,
          details: { error: rCta.error },
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        return;
      }
    }

    const heroSaveCombined = combineHeroImageUrlsForBranding(heroImageUrl, heroImageExtraUrls);
    const urlChecks: { label: string; value: string }[] = [
      { label: 'לוגו', value: logoUrl },
      { label: 'לוגו מאתר (מועמד)', value: logoWebsiteCandidateUrl },
      { label: 'לוגו חצר (מועמד)', value: logoYardCandidateUrl },
      { label: 'תמונת Hero', value: heroImageUrl },
      ...heroSaveCombined.slice(1).map((u, i) => ({ label: `תמונת Hero (${i + 2})`, value: u })),
      { label: 'רקע עמוד (תמונה)', value: pageBackgroundImageUrl },
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
        const msg = `${label}: ${r.error}`;
        pushUiErrorLog({
          type: 'guard-error',
          source: `handleSave:validateOptionalUrl:${label}`,
          message: msg,
          details: { label, error: r.error },
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        return;
      }
    }

    saveInFlightRef.current = true;
    clearSectionDragUi();
    setSaving(true);
    setError(null);
    setLastFirestoreErrorCode('');
    setSuccess(null);
    try {
      const ordered = normalizeHomeSectionOrderForBuilder(sectionOrder);
      const branding: Record<string, unknown> = {};
      if (siteName.trim()) branding.siteName = siteName.trim();
      if (displayName.trim()) branding.displayName = displayName.trim();
      if (logoUrl.trim()) branding.logoUrl = logoUrl.trim();
      if (tenantLogoSource === 'website' || tenantLogoSource === 'yard' || tenantLogoSource === 'manual') {
        branding.logoSource = tenantLogoSource;
      } else {
        branding.logoSource = deleteField();
      }
      if (logoWebsiteCandidateUrl.trim()) branding.logoWebsiteCandidate = logoWebsiteCandidateUrl.trim();
      else branding.logoWebsiteCandidate = deleteField();
      if (logoYardCandidateUrl.trim()) branding.logoYardCandidate = logoYardCandidateUrl.trim();
      else branding.logoYardCandidate = deleteField();
      if (primaryCtaBackgroundColor.trim()) branding.primaryCtaBackgroundColor = primaryCtaBackgroundColor.trim();
      else branding.primaryCtaBackgroundColor = deleteField();
      if (primaryCtaTextColor.trim()) branding.primaryCtaTextColor = primaryCtaTextColor.trim();
      else branding.primaryCtaTextColor = deleteField();
      if (heroSaveCombined.length >= 2) {
        branding.heroImageUrl = heroSaveCombined[0];
        branding.heroImageUrls = heroSaveCombined;
      } else if (heroSaveCombined.length === 1) {
        branding.heroImageUrl = heroSaveCombined[0];
        branding.heroImageUrls = deleteField();
      } else {
        branding.heroImageUrl = deleteField();
        branding.heroImageUrls = deleteField();
      }
      if (pageBackgroundImageUrl.trim()) branding.pageBackgroundImageUrl = pageBackgroundImageUrl.trim();
      if (pageBackgroundOverlayOpacity.trim()) {
        const opn = Number(pageBackgroundOverlayOpacity.trim());
        if (Number.isFinite(opn)) branding.pageBackgroundOverlayOpacity = Math.max(0, Math.min(0.85, opn));
      } else {
        branding.pageBackgroundOverlayOpacity = null;
      }
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
      if (featuredCarsPresentation === 'carsCarousel') {
        layout.featuredCarsPresentation = 'carsCarousel';
      } else {
        layout.featuredCarsPresentation = deleteField();
      }
      const dpSave = defaultSectionThemePresetId.trim();
      if (dpSave && getSectionThemePresetById(dpSave)) {
        layout.defaultSectionThemePresetId = dpSave;
      }

      const draftDataScope: Record<string, unknown> = {};
      if (yardUid.trim()) draftDataScope.yardUid = yardUid.trim();
      if (sellerUid.trim()) draftDataScope.sellerUid = sellerUid.trim();
      const docBefore = await getTenantSiteConfigByTenantId(tid);
      const guardedDataScope = resolveProtectedDataScopeForSave({
        draftDataScope,
        existingConfig: docBefore,
        selectedYardId,
        tenantId: tid,
      });
      // eslint-disable-next-line no-console -- requested dataScope save-guard diagnostics
      console.debug('dataScopePreservedOnSave', guardedDataScope.debug);
      const payload: TenantSiteConfigWritePayload = {
        branding,
        content,
        contact: contactPayload,
        seo,
        layout,
      };
      if (guardedDataScope.dataScope) payload.dataScope = guardedDataScope.dataScope;
      await upsertTenantSiteConfig(tid, payload);
      setSuccess('נשמר בהצלחה ב-Firestore.');
      setConfigLoadedForTenantId(tid);
      setLoadedConfigMissing(false);
      setRawLayoutHomeSections(ordered);
      setBaselineVersion((v) => v + 1);
      setScreenshotPreviewNormalized(null);
    } catch (e) {
      setLastFirestoreErrorCode(firestoreErrorCode(e));
      const msg = e instanceof Error ? e.message : 'שמירה נכשלה';
      const mapped = mapBuilderFirebaseErrorForUser(e, msg);
      pushActionErrorLog({
        type: 'save-error',
        action: 'upsertTenantSiteConfig',
        message: mapped,
        code: firestoreErrorCode(e) || undefined,
        debugError: e,
        timestamp: new Date().toISOString(),
      });
      setError(mapped);
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
      setError('בחרו מגרש וערכת נושא לפני החלה.');
      return;
    }
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      const msg = `מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו קונפיגורציה מחדש לפני החלת נושא.`;
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleThemeCarouselApply:tenantIdMismatch',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'מזהה תאימות לא תקין';
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleThemeCarouselApply:assertSafeTenantIdForStoragePath',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    const raw = buildThemeCarouselApplyImportInputForPackKey(packKey);
    if (!raw) {
      const msg = 'ערכת הנושא לא נמצאה.';
      pushUiErrorLog({
        type: 'apply-error',
        source: 'handleThemeCarouselApply:buildThemeCarouselApplyImportInputForPackKey',
        message: msg,
        details: { packKey },
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    const coerced = coerceImportedTenantSiteConfig(raw);
    devLogTenantSiteConfigImport(coerced, 'theme-carousel-apply');
    if (coerced.issues.some((i) => i.severity === 'forbidden')) {
      const msg = 'החלת הנושא נחסמה — נמצאו שדות אסורים בייבוא.';
      pushUiErrorLog({
        type: 'coercion-error',
        source: 'handleThemeCarouselApply:coerceImportedTenantSiteConfig',
        message: msg,
        details: { forbiddenIssues: coerced.issues.filter((i) => i.severity === 'forbidden').slice(0, 8) },
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    if (saving || !!uploadingKind || themeCarouselApplyBusy) return;

    setThemeCarouselApplyBusy(true);
    setError(null);
    setLastFirestoreErrorCode('');
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
      setLastFirestoreErrorCode(firestoreErrorCode(e));
      const msg = e instanceof Error ? e.message : 'החלת נושא נכשלה';
      const mapped = mapBuilderFirebaseErrorForUser(e, msg);
      pushActionErrorLog({
        type: 'save-error',
        action: 'handleThemeCarouselApply:upsertTenantSiteConfig',
        message: mapped,
        code: firestoreErrorCode(e) || undefined,
        debugError: e,
        timestamp: new Date().toISOString(),
      });
      setError(mapped);
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
    pushUiErrorLog,
    pushActionErrorLog,
  ]);

  const handleThemeCarouselUndo = useCallback(async () => {
    const tid = activeLegacyTenantId.trim();
    const snap = themeCarouselUndoSnapshot;
    if (!tid || !snap) return;
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      const msg = `מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו מחדש לפני ביטול.`;
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleThemeCarouselUndo:tenantIdMismatch',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'מזהה תאימות לא תקין';
      pushUiErrorLog({
        type: 'guard-error',
        source: 'handleThemeCarouselUndo:assertSafeTenantIdForStoragePath',
        message: msg,
        timestamp: new Date().toISOString(),
      });
      suppressNextPageErrorUiLogRef.current = true;
      setError(msg);
      return;
    }
    if (saving || !!uploadingKind || themeCarouselApplyBusy) return;

    setThemeCarouselApplyBusy(true);
    setError(null);
    setLastFirestoreErrorCode('');
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
      setLastFirestoreErrorCode(firestoreErrorCode(e));
      const msg = e instanceof Error ? e.message : 'ביטול נכשל';
      const mapped = mapBuilderFirebaseErrorForUser(e, msg);
      pushActionErrorLog({
        type: 'save-error',
        action: 'handleThemeCarouselUndo:upsertTenantSiteConfig',
        message: mapped,
        code: firestoreErrorCode(e) || undefined,
        debugError: e,
        timestamp: new Date().toISOString(),
      });
      setError(mapped);
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
    pushUiErrorLog,
    pushActionErrorLog,
  ]);

  const handleScreenshotImportApply = useCallback(
    async (patch: ScreenshotDerivedSiteConfigImportInput) => {
      const tid = activeLegacyTenantId.trim();
      if (!tid) {
        const msg = 'בחרו מגרש לפני החלת Screenshot Import.';
        pushUiErrorLog({
          type: 'apply-error',
          source: 'handleScreenshotImportApply:noTenant',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
        const msg = `מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו מחדש לפני החלה.`;
        pushUiErrorLog({
          type: 'guard-error',
          source: 'handleScreenshotImportApply:tenantIdMismatch',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      try {
        assertSafeTenantIdForStoragePath(tid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'מזהה תאימות לא תקין';
        pushUiErrorLog({
          type: 'guard-error',
          source: 'handleScreenshotImportApply:assertSafeTenantIdForStoragePath',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      const safeImport = coerceImportedTenantSiteConfig(patch);
      if (safeImport.issues.some((i) => i.path === 'dataScope')) {
        // eslint-disable-next-line no-console -- requested AI import dataScope drop diagnostics
        console.debug('dataScopeDroppedByImportPrevented', {
          tenantId: tid,
          issues: safeImport.issues.filter((i) => i.path === 'dataScope'),
        });
      }
      if (safeImport.issues.some((i) => i.severity === 'forbidden')) {
        const msg = 'ייבוא Screenshot נחסם: נמצאו שדות אסורים.';
        pushUiErrorLog({
          type: 'coercion-error',
          source: 'handleScreenshotImportApply:coerceImportedTenantSiteConfig',
          message: msg,
          details: { forbiddenIssues: safeImport.issues.filter((i) => i.severity === 'forbidden').slice(0, 8) },
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      setLastFirestoreErrorCode('');
      setSuccess(null);
      try {
        const docBefore = await getTenantSiteConfigByTenantId(tid);
        const merged = mergeTenantSiteConfigWritePayload(docBefore, safeImport.patch);
        const patchKeys = Object.keys(safeImport.patch);
        if (import.meta.env.DEV) {
          const beforeKeys = docBefore
            ? ['branding', 'content', 'contact', 'seo', 'layout', 'dataScope'].filter((k) => docBefore[k as keyof typeof docBefore] != null)
            : [];
          // eslint-disable-next-line no-console -- DEV-only AI import apply trace
          console.debug('[handleScreenshotImportApply]', {
            tenantId: tid,
            patchKeys,
            mergedTopLevelKeys: Object.keys(merged),
            docBeforeBucketCount: beforeKeys.length,
          });
        }
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
        const n = patchKeys.length;
        const applySummary =
          n === 0
            ? 'AI import saved to Firestore.'
            : `Applied ${n} section${n === 1 ? '' : 's'}: ${patchKeys.join(', ')} — saved to Firestore.`;
        // Defer success until after useLayoutEffect rebaselines serializedForm; otherwise
        // `success && isDirty` clears the toast in the same commit (baseline lags one frame).
        window.setTimeout(() => {
          setSuccess(applySummary);
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console -- DEV-only post-apply trace
            console.debug('[handleScreenshotImportApply] done', { patchKeys, refreshed: Boolean(refreshed) });
          }
        }, 0);
      } catch (e) {
        setLastFirestoreErrorCode(firestoreErrorCode(e));
        const msg = mapBuilderFirebaseErrorForUser(e, 'ייבוא Screenshot נכשל.');
        pushActionErrorLog({
          type: 'save-error',
          action: 'handleScreenshotImportApply:upsertTenantSiteConfig',
          message: msg,
          code: firestoreErrorCode(e) || undefined,
          debugError: e,
          timestamp: new Date().toISOString(),
        });
        setError(msg);
        setUploadBlockedToast(msg);
        throw new Error(msg);
      }
    },
    [activeLegacyTenantId, configLoadedForTenantId, fillFromConfig, pushUiErrorLog, pushActionErrorLog],
  );

  const handleUrlImportMergeToDraft = useCallback(
    async (patch: ScreenshotDerivedSiteConfigImportInput): Promise<UrlAutoApplyDebugBlock> => {
      const tid = activeLegacyTenantId.trim();
      const ts = new Date().toISOString();
      if (!tid) {
        const msg = 'בחרו מגרש לפני החלת ניתוח URL בטיוטה.';
        pushUiErrorLog({
          type: 'apply-error',
          source: 'handleUrlImportMergeToDraft:noTenant',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
        const msg = `מזהה התאימות (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). טענו מחדש לפני החלה.`;
        pushUiErrorLog({
          type: 'guard-error',
          source: 'handleUrlImportMergeToDraft:tenantIdMismatch',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      try {
        assertSafeTenantIdForStoragePath(tid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'מזהה תאימות לא תקין';
        pushUiErrorLog({
          type: 'guard-error',
          source: 'handleUrlImportMergeToDraft:assertSafeTenantIdForStoragePath',
          message: msg,
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      const safeImport = coerceImportedTenantSiteConfig(patch);
      if (safeImport.issues.some((i) => i.path === 'dataScope')) {
        // eslint-disable-next-line no-console -- requested AI import dataScope drop diagnostics
        console.debug('dataScopeDroppedByImportPrevented', {
          tenantId: tid,
          issues: safeImport.issues.filter((i) => i.path === 'dataScope'),
        });
      }
      if (safeImport.issues.some((i) => i.severity === 'forbidden')) {
        const msg = 'ייבוא URL נחסם: נמצאו שדות אסורים.';
        pushUiErrorLog({
          type: 'coercion-error',
          source: 'handleUrlImportMergeToDraft:coerceImportedTenantSiteConfig',
          message: msg,
          details: { forbiddenIssues: safeImport.issues.filter((i) => i.severity === 'forbidden').slice(0, 8) },
          timestamp: new Date().toISOString(),
        });
        suppressNextPageErrorUiLogRef.current = true;
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      setLastFirestoreErrorCode('');
      const docBase = buildSyntheticConfig(tid, formSnapshot);
      const patchBranding = asRecord(safeImport.patch.branding);
      const patchLayout = asRecord(safeImport.patch.layout);
      const extractedPrimaryColor =
        typeof patchBranding.primaryColor === 'string' && patchBranding.primaryColor.trim()
          ? patchBranding.primaryColor.trim()
          : null;
      const extractedSecondaryColor =
        typeof patchBranding.secondaryColor === 'string' && patchBranding.secondaryColor.trim()
          ? patchBranding.secondaryColor.trim()
          : null;
      const extractedAccentColor =
        typeof patchBranding.accentColor === 'string' && patchBranding.accentColor.trim()
          ? patchBranding.accentColor.trim()
          : null;
      const hasExtractedPalette = Boolean(extractedPrimaryColor || extractedSecondaryColor || extractedAccentColor);
      const previousThemePresetIdRaw = asRecord(docBase.layout).defaultSectionThemePresetId;
      const previousThemePresetId =
        typeof previousThemePresetIdRaw === 'string' && previousThemePresetIdRaw.trim()
          ? previousThemePresetIdRaw.trim()
          : null;
      const generatedThemePresetId =
        typeof patchLayout.defaultSectionThemePresetId === 'string' && patchLayout.defaultSectionThemePresetId.trim()
          ? patchLayout.defaultSectionThemePresetId.trim()
          : null;
      const themePresetWasReused = Boolean(
        previousThemePresetId && generatedThemePresetId && previousThemePresetId === generatedThemePresetId,
      );
      const merged = mergeTenantSiteConfigWritePayload(docBase, safeImport.patch);
      let themePresetClearedForNewAnalyze = false;
      if (hasExtractedPalette) {
        const mergedBranding = asRecord(merged.branding);
        const mergedLayout = asRecord(merged.layout);
        const mergedSectionStyles = asRecord(mergedLayout.sectionStyles);
        if (Object.keys(mergedSectionStyles).length > 0) {
          mergedLayout.sectionStyles = {};
        }
        mergedLayout.defaultSectionThemePresetId = generatedThemePresetId;
        merged.layout = mergedLayout;
        merged.branding = mergedBranding;
        themePresetClearedForNewAnalyze = true;
      }
      fillFromConfig(tid, merged as unknown as Record<string, unknown>);
      const layoutRec = asRecord(merged.layout);
      setRawLayoutHomeSections(layoutRec.homeSections ?? null);
      setScreenshotPreviewNormalized(null);
      setUploadInfo('טיוטת האתר עודכנה מניתוח URL — לחצו שמירה כדי לפרסם ב-Firestore.');
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- DEV-only URL draft merge trace
        console.debug('[handleUrlImportMergeToDraft]', {
          tenantId: tid,
          patchTopLevelKeys: Object.keys(safeImport.patch),
        });
      }
      return {
        attempted: true,
        applied: true,
        blockedByDirty: false,
        blockedByTenantMismatch: false,
        blockedByStaleRequest: false,
        blockedByForbidden: false,
        changedTopLevelKeys: Object.keys(safeImport.patch),
        changedLayoutFieldKeys: safeImport.patch.layout ? Object.keys(safeImport.patch.layout as object) : [],
        previousThemePresetId,
        generatedThemePresetId,
        themePresetWasReused,
        themePresetClearedForNewAnalyze,
        extractedPrimaryColor,
        extractedSecondaryColor,
        extractedAccentColor,
        rendererUsedPrimaryColor:
          typeof asRecord(merged.branding).primaryColor === 'string' ? String(asRecord(merged.branding).primaryColor) : null,
        rendererUsedAccentColor:
          typeof asRecord(merged.branding).accentColor === 'string' ? String(asRecord(merged.branding).accentColor) : null,
        timestamp: ts,
      };
    },
    [activeLegacyTenantId, configLoadedForTenantId, formSnapshot, fillFromConfig, pushUiErrorLog],
  );

  const builderBrandingLayoutSlice = useCallback((): TenantHomeBrandingResolutionLayout => {
    const ordered = normalizeHomeSectionOrderForBuilder(sectionOrder);
    const dp = defaultSectionThemePresetId.trim();
    return {
      sectionStyles: normalizeTenantSectionStylesRecord(sectionStyles),
      sectionInheritsSiteThemeStyle,
      sectionInheritsSiteThemeAccent,
      homeSections: ordered,
      defaultSectionThemePresetId: dp && getSectionThemePresetById(dp) ? dp : null,
    };
  }, [sectionOrder, sectionStyles, sectionInheritsSiteThemeStyle, sectionInheritsSiteThemeAccent, defaultSectionThemePresetId]);

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
        sectionThemePresetId: prev[key].sectionThemePresetId,
      },
    }));
    setSectionInheritsSiteThemeStyle((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleSectionThemePresetChange = useCallback((key: TenantHomeSectionKey, id: string | null) => {
    if (key === 'hero') return;
    setSectionStyles((prev) => ({
      ...prev,
      [key]: normalizeTenantSectionStyle(
        { ...prev[key], sectionThemePresetId: id },
        TENANT_SECTION_STYLE_CAPABILITIES[key],
      ),
    }));
    setSectionInheritsSiteThemeStyle((p) => ({ ...p, [key]: false }));
  }, []);

  const handleApplySectionThemePresetToAll = useCallback(() => {
    const t = defaultSectionThemePresetId.trim();
    if (!t || !getSectionThemePresetById(t)) return;
    setSectionStyles((prev) => {
      const next = { ...prev };
      for (const k of TENANT_HOME_SECTION_KEYS) {
        if (k === 'hero') continue;
        if (!Object.values(TENANT_SECTION_STYLE_CAPABILITIES[k]).some(Boolean)) continue;
        next[k] = normalizeTenantSectionStyle(
          { ...prev[k], sectionThemePresetId: t },
          TENANT_SECTION_STYLE_CAPABILITIES[k],
        );
      }
      return next;
    });
  }, [defaultSectionThemePresetId]);

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
          <TenantSiteYardPickerFields picker={yardPicker} onSelectYard={handleYardSelect} />
          {yardSelected ? (
            <div
              ref={builderToolbarActionsRef}
              className="form-actions builder-toolbar-actions"
              tabIndex={-1}
            >
            <button
              type="button"
              className="secondary-btn"
              onClick={handleLoad}
              disabled={loading || saving}
              aria-busy={loading}
              title="לאחר בחירת מגרש הקונפיגורציה נטענת אוטומטית — כפתור זה לריענון ידני מהשרת"
            >
              {loading ? 'טוען…' : 'ריענון קונפיגורציה מהשרת'}
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
            <DebugActionButton
              title="DEBUG: מצב מלא של עמוד Website Builder (ללא סודות)"
              onClick={() => setPageDebugExpanded((v) => !v)}
            />
            <CopyJsonButton
              className="secondary-btn"
              style={{ fontSize: '0.8125rem' }}
              label="DEBUG COPY JSON"
              getValue={() => pageDebugSnapshot}
              onError={() => setError('העתקת DEBUG נכשלה.')}
            />
            </div>
          ) : null}
        </div>

        {yardSelected && pageDebugExpanded ? (
          <div style={{ marginTop: '0.5rem' }} aria-label="Page debug JSON">
            <pre
              style={{
                maxHeight: 'min(50vh, 420px)',
                overflow: 'auto',
                fontSize: '0.72rem',
                padding: '0.65rem',
                background: '#0f172a',
                color: '#e2e8f0',
                borderRadius: '8px',
                direction: 'ltr',
                textAlign: 'left',
              }}
            >
              {safeStringify(pageDebugSnapshot)}
            </pre>
          </div>
        ) : null}

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

        {error ? (
          <p className="form-error">
            {error}
            {lastFirestoreErrorCode ? ` (Firestore: ${lastFirestoreErrorCode})` : ''}
          </p>
        ) : null}
        {success ? <p className="form-success">{success}</p> : null}

        {yardSelected ? (
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
            defaultSectionThemePresetId={defaultSectionThemePresetId}
            onDefaultSectionThemePresetChange={setDefaultSectionThemePresetId}
            sectionStyles={sectionStyles}
            onSectionThemePresetChange={handleSectionThemePresetChange}
            onApplySectionThemePresetToAll={handleApplySectionThemePresetToAll}
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
              disabled={formBusy}
              tenantId={activeLegacyTenantId || null}
              tenantResetToken={aiImportTenantResetToken}
              baseSyntheticConfig={baseSyntheticConfig}
              onPreviewNormalizedReady={setScreenshotPreviewNormalized}
              onApply={handleScreenshotImportApply}
              onUrlImportMergeToDraft={handleUrlImportMergeToDraft}
              urlDraftIsDirty={isDirty}
              urlMergeConfigLoadedTenantId={configLoadedForTenantId}
              urlCompletionDisplayName={previewDisplayName}
              onDebugStateChange={onAiImportDebugStateChange}
            />
            <BuilderInspector
              selected={selectedSection}
              formBusy={formBusy}
              uploadingKind={uploadingKind}
              uploadProgressPercent={uploadProgressPercent}
              yardLogoUrl={builderYardProfile?.yardLogoUrl ?? null}
              tenantNameFallback={saasTenant?.name ?? null}
              previewDisplayName={previewDisplayName}
              previewSeoTitle={previewSeoTitleLive}
              onLogoFiles={(f) => void handleMediaPick('logo', f)}
              onHeroFiles={(f) => void handleMediaPick('hero', f)}
              onPageBgFiles={(f) => void handleMediaPick('pageBg', f)}
              onOgFiles={(f) => void handleMediaPick('og', f)}
              logoUploadError={logoUploadError}
              heroUploadError={heroUploadError}
              pageBgUploadError={pageBgUploadError}
              ogUploadError={ogUploadError}
              onApplyYardLogo={handleApplyYardLogoDraft}
              onApplyWebsiteLogo={handleApplyWebsiteLogoDraft}
              websiteLogoCandidateUrl={logoWebsiteCandidateUrl}
              tenantLogoSource={tenantLogoSource}
              siteName={siteName}
              setSiteName={setSiteName}
              displayName={displayName}
              setDisplayName={setDisplayName}
              logoUrl={logoUrl}
              setLogoUrl={handleControlledLogoUrlChange}
              heroImageUrl={heroImageUrl}
              setHeroImageUrl={setHeroImageUrl}
              heroImageExtraUrls={heroImageExtraUrls}
              setHeroImageExtraUrls={setHeroImageExtraUrls}
              pageBackgroundImageUrl={pageBackgroundImageUrl}
              setPageBackgroundImageUrl={setPageBackgroundImageUrl}
              pageBackgroundOverlayOpacity={pageBackgroundOverlayOpacity}
              setPageBackgroundOverlayOpacity={setPageBackgroundOverlayOpacity}
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
              featuredCarsPresentation={featuredCarsPresentation}
              setFeaturedCarsPresentation={setFeaturedCarsPresentation}
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
              defaultSectionThemePresetId={defaultSectionThemePresetId}
              onChangeSectionThemePreset={handleSectionThemePresetChange}
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
        ) : null}
      </div>
      {uploadBlockedToast ? (
        <div className="toast-notification toast-notification--warning" role="alert" aria-live="assertive">
          {uploadBlockedToast}
        </div>
      ) : null}
    </div>
  );
}
