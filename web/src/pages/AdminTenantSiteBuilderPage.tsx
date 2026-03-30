import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchPublicCars, type PublicCar } from '../api/publicCarsApi';
import { listTenantDomains } from '../api/tenantDomainsApi';
import { getTenantSiteConfigByTenantId, upsertTenantSiteConfig, type TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import {
  BASIC_PLAN_MAX_CARS,
  computeTenantPublicSiteSuspended,
  getTenantById,
  type Tenant,
} from '../api/tenantsApi';
import {
  assertSafeTenantIdForStoragePath,
  uploadTenantSiteMedia,
  validateTenantSiteImageFile,
  type TenantSiteMediaKind,
} from '../api/tenantSiteMediaApi';
import { loadYardPublicProfile, type YardProfileData } from '../api/yardProfileApi';
import BuilderCanvas from '../components/admin/siteBuilder/BuilderCanvas';
import {
  parseBuilderFormBaselineSnapshot,
  type BuilderFormBaselineSnapshot,
} from '../components/admin/siteBuilder/builderFormBaseline';
import BuilderInspector from '../components/admin/siteBuilder/BuilderInspector';
import BuilderStructurePanel, {
  type BuilderSelectedSection,
} from '../components/admin/siteBuilder/BuilderStructurePanel';
import TenantHomeSectionsView from '../components/tenant/TenantHomeSectionsView';
import {
  getUnsupportedHomeSectionKeys,
  normalizeHomeSectionOrderForBuilder,
  normalizeTenantSiteConfig,
  parseHomeSectionsList,
  TENANT_HOME_SECTION_KEYS,
  TENANT_HOME_SECTION_LABELS_HE,
  validateColorInput,
  validateOptionalUrl,
  validateOptionalUrlOrPath,
  type TenantHomeSectionKey,
} from '../tenant/tenantSiteConfig';
import {
  getTenantHomepageSelectionMeta,
  tenantHomepageBuilderSummaryHe,
  type TenantHomepageSelectionMeta,
} from '../tenant/tenantHomepageCars';
import { finalizeTenantRuntimeBranding, tenantBrandingFromNormalized } from '../tenant/tenantBranding';
import './AdminTenantSiteBuilderPage.css';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v;
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

  const [tenantIdInput, setTenantIdInput] = useState('');
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
    if (urlTenantId) {
      setTenantIdInput(urlTenantId);
    }
  }, [urlTenantId]);

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
    ],
  );

  const previewTenantId = tenantIdInput.trim() || 'preview';
  const syntheticConfig = useMemo(
    () => buildSyntheticConfig(previewTenantId, formSnapshot),
    [previewTenantId, formSnapshot],
  );
  const previewNormalized = useMemo(
    () => normalizeTenantSiteConfig(syntheticConfig, previewTenantId),
    [syntheticConfig, previewTenantId],
  );
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
    const tid = tenantIdInput.trim();
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
  }, [yardUid, sellerUid, tenantIdInput]);

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

  const tenantIdFieldTrimmed = tenantIdInput.trim();
  const tenantIdMismatch =
    configLoadedForTenantId !== null && tenantIdFieldTrimmed !== '' && tenantIdFieldTrimmed !== configLoadedForTenantId;
  const formBusy = saving || loading || !!uploadingKind;

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
  }, []);

  const loadConfigForTenantId = async (tid: string) => {
    if (!tid) {
      setError('נא להזין tenantId');
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'tenantId לא תקין');
      return;
    }
    if (saving) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setUploadInfo(null);
    setLoadedConfigMissing(false);
    setRawLayoutHomeSections(null);
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
      setSelectedSection(null);
      setHeroFocalX(50);
      setHeroFocalY(50);
      setConfigLoadedForTenantId(tid);
      setBaselineVersion((v) => v + 1);
    } catch {
      setError('טעינת הקונפיגורציה נכשלה');
    } finally {
      setLoading(false);
      setDragSectionIndex(null);
      setSectionDropTargetIndex(null);
    }
  };

  const handleLoad = async () => {
    await loadConfigForTenantId(tenantIdInput.trim());
  };

  const handleOpenPublicPreview = () => {
    const tid = tenantIdInput.trim();
    if (!tid) {
      setError('נא להזין tenantId לתצוגה מקדימה');
      return;
    }
    const root = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const url = `${window.location.origin}${root}tenant/${encodeURIComponent(tid)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!isAdmin || authLoading) return;
    if (!urlTenantId || tenantIdInput.trim() !== urlTenantId) return;
    if (autoLoadedTenantFromUrl.current === urlTenantId) return;
    autoLoadedTenantFromUrl.current = urlTenantId;
    void loadConfigForTenantId(urlTenantId);
    // Intentionally omit loadConfigForTenantId / saving — one-shot bootstrap from ?tenantId=
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, authLoading, urlTenantId, tenantIdInput]);

  const parseBenefitsLines = (text: string): string[] =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  const isSectionVisibleInStructure = useCallback(
    (key: TenantHomeSectionKey): boolean => {
      switch (key) {
        case 'hero':
          return true;
        case 'featuredCars':
          return showFeaturedCars;
        case 'about':
          return showAbout;
        case 'benefits':
          return showBenefits;
        case 'finance':
          return showFinance;
        case 'testimonials':
          return showTestimonials;
        case 'contact':
          return showContact;
        case 'map':
          return showMap;
        default:
          return true;
      }
    },
    [showFeaturedCars, showAbout, showBenefits, showFinance, showTestimonials, showContact, showMap],
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
    const tid = tenantIdInput.trim();
    if (!tid) return list;
    if (loadedConfigMissing) {
      list.push('אין מסמך tenantSiteConfigs עבור tenant זה — שמירה תיצור/תעדכן שדות (merge).');
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
      list.push('לא בוצעה טעינה ל-tenant זה — מומלץ ״טען קונפיגורציה״ לפני העלאת מדיה (מניעת נתיב שגוי). אפשר לשמור ישירות ליצירת מסמך.');
    }
    if (tenantIdMismatch) {
      list.push(`השדה tenantId לא תואם ל-tenant שנטען (${configLoadedForTenantId}). טענו מחדש או החזירו את המזהה לפני שמירה/העלאה.`);
    }
    if (saasTenant && computeTenantPublicSiteSuspended(saasTenant, Date.now()).suspended) {
      list.push('לקוח זה מושבת בחנות הציבורית — גולשים לא יראו מלאי (כאן עדיין אפשר לערוך).');
    }
    if (saasTenant?.plan === 'basic') {
      list.push(`תוכנית Basic: מומלץ עד ${BASIC_PLAN_MAX_CARS} רכבים (אזהרת UI בלבד).`);
    }
    return list;
  }, [
    tenantIdInput,
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

  const handleSectionDrop = useCallback(
    (targetIndex: number) => {
      if (formBusy) {
        setDragSectionIndex(null);
        setSectionDropTargetIndex(null);
        return;
      }
      setSectionOrder((prevOrder) => {
        if (dragSectionIndex === null || dragSectionIndex === targetIndex) {
          return prevOrder;
        }
        const next = [...prevOrder];
        const [removed] = next.splice(dragSectionIndex, 1);
        next.splice(targetIndex, 0, removed);
        return normalizeHomeSectionOrderForBuilder(next);
      });
      setDragSectionIndex(null);
      setSectionDropTargetIndex(null);
    },
    [formBusy, dragSectionIndex],
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
    const tid = tenantIdInput.trim();
    if (!tid) {
      setError('נא להזין tenantId');
      return;
    }
    try {
      const rows = await listTenantDomains();
      const mine = rows.filter((r) => r.tenantId === tid && r.enabled);
      if (mine.length === 0) {
        setError('לא נמצא דומיין פעיל ל-tenant הזה. הגדירו מיפוי בדף Tenant Domains.');
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
  }, [tenantIdInput]);

  const handleMediaPick = async (kind: TenantSiteMediaKind, fileList: FileList | null) => {
    const fieldTid = tenantIdInput.trim();
    if (configLoadedForTenantId !== null) {
      if (fieldTid !== configLoadedForTenantId) {
        setError('מזהה tenant בשדה שונה מהטעינה האחרונה. טענו מחדש או החזירו את אותו tenantId לפני העלאה.');
        return;
      }
    }
    const uploadTid = configLoadedForTenantId ?? fieldTid;
    if (!uploadTid) {
      setError('נא להזין tenantId ולטעון קונפיגורציה לפני העלאת קבצים (מניעת העלאה ל-tenant שגוי).');
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
    const tid = tenantIdInput.trim();
    if (!tid) {
      setError('נא להזין tenantId');
      return;
    }
    if (configLoadedForTenantId !== null && tid !== configLoadedForTenantId) {
      setError(`השדה tenantId (${tid}) שונה מהמסמך שנטען (${configLoadedForTenantId}). לחצו ״טען קונפיגורציה״ ל-tenant הנכון או תקנו את השדה.`);
      return;
    }
    try {
      assertSafeTenantIdForStoragePath(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'tenantId לא תקין');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="admin-tenant-site-builder-page">
      <div className="page-container">
        <div className="page-header">
          <h2>Website Builder</h2>
          <div className="page-header-links">
            <Link to="/admin/tenant-domains">Tenant Domains</Link>
            <Link to="/account">חשבון</Link>
          </div>
        </div>

        <p className="muted intro">
          עורך ויזואלי לדף בית של חצר — מבנה משמאל, תצוגה חיה במרכז, כלי עריכה מימין. השינויים בטיוטה מתעדכנים מיד; שמירה כותבת ל-Firestore בלבד את הערכים שהזנתם במפורש.
        </p>

        <div className="builder-toolbar-card">
          <label className="field-label">
            tenantId
            <input
              type="text"
              value={tenantIdInput}
              onChange={(e) => setTenantIdInput(e.target.value)}
              placeholder="למשל yard-123"
              dir="ltr"
            />
          </label>
          <div className="form-actions builder-toolbar-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={handleLoad}
              disabled={loading || saving}
              aria-busy={loading}
            >
              {loading ? 'טוען…' : 'טען קונפיגורציה'}
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={handleSave}
              disabled={saving || loading || !!uploadingKind || tenantIdMismatch}
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
              disabled={!tenantIdInput.trim()}
              title="דף ציבורי באפליקציה (מתאים לבדיקה ללא דומיין מותאם)"
            >
              פתח תצוגה ציבורית
            </button>
            <button
              type="button"
              className="secondary-btn builder-open-site-btn"
              onClick={() => void handleOpenPublicSite()}
              disabled={!tenantIdInput.trim()}
              title="דף הבית בדומיין הלקוח (אם הוגדר ב-Tenant Domains)"
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
              <span
                className={`builder-confidence-strip__pill builder-confidence-strip__pill--${builderSaveState.tone}`}
              >
                {builderSaveState.label}
              </span>
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
            </div>
            <BuilderCanvas ref={canvasFrameRef}>
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
              />
            </BuilderCanvas>
          </div>
          <div className="builder-inspector-scroll">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
