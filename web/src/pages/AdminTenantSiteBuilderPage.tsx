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
import SiteBuilderSectionCard from '../components/admin/siteBuilder/SiteBuilderSectionCard';
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
import { orderPublicCarsByFeaturedIds } from '../tenant/tenantFeaturedCars';
import { tenantBrandingFromNormalized } from '../tenant/tenantBranding';
import './AdminTenantSiteBuilderPage.css';

function formatCarPickerLabel(car: PublicCar): string {
  const t = `${car.year ?? ''} ${car.brand ?? ''} ${car.model ?? ''}`.trim();
  return t || car.carId;
}

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
  /** After a successful load, save/upload target this tenant until the next successful load. Prevents overwriting another tenant by mistake. */
  const [configLoadedForTenantId, setConfigLoadedForTenantId] = useState<string | null>(null);
  const [baselineVersion, setBaselineVersion] = useState(1);
  const [baselineSerialized, setBaselineSerialized] = useState('');
  const [saasTenant, setSaasTenant] = useState<Tenant | null>(null);
  const autoLoadedTenantFromUrl = useRef<string>('');

  const logoFileRef = useRef<HTMLInputElement>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);
  const ogFileRef = useRef<HTMLInputElement>(null);

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
  const previewBranding = useMemo(() => tenantBrandingFromNormalized(previewNormalized), [previewNormalized]);

  const previewFeaturedCars = useMemo(() => {
    if (featuredCarIds.length > 0) {
      return orderPublicCarsByFeaturedIds(builderInventoryCars, featuredCarIds);
    }
    return builderInventoryCars.slice(0, 6);
  }, [builderInventoryCars, featuredCarIds]);

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
      setConfigLoadedForTenantId(tid);
      setBaselineVersion((v) => v + 1);
    } catch {
      setError('טעינת הקונפיגורציה נכשלה');
    } finally {
      setLoading(false);
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
    if (!logoUrl.trim() && !displayName.trim() && !siteName.trim()) {
      list.push('מומלץ להגדיר לפחות שם או לוגו למותג.');
    }
    if (!phone.trim() && !whatsapp.trim() && !email.trim()) {
      list.push('אין פרטי קשר בסיסיים (טלפון / וואטסאפ / אימייל).');
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
  ]);

  const handleSectionDrop = (targetIndex: number) => {
    if (formBusy) {
      setDragSectionIndex(null);
      return;
    }
    if (dragSectionIndex === null || dragSectionIndex === targetIndex) {
      setDragSectionIndex(null);
      return;
    }
    const next = [...sectionOrder];
    const [removed] = next.splice(dragSectionIndex, 1);
    next.splice(targetIndex, 0, removed);
    setSectionOrder(normalizeHomeSectionOrderForBuilder(next));
    setDragSectionIndex(null);
  };

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
      if (kind === 'logo') logoFileRef.current && (logoFileRef.current.value = '');
      if (kind === 'hero') heroFileRef.current && (heroFileRef.current.value = '');
      if (kind === 'og') ogFileRef.current && (ogFileRef.current.value = '');
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
          בונים את דף הבית לפי סקשנים — כל כרטיסיה מתאימה לאזור באתר. השינויים משתקפים מיד בתצוגה מימין; שמירה מעדכנת את Firestore.
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
            <button type="button" className="primary-btn" onClick={handleLoad} disabled={loading || saving}>
              {loading ? 'טוען…' : 'טען קונפיגורציה'}
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={handleSave}
              disabled={saving || loading || !!uploadingKind || tenantIdMismatch}
            >
              {saving ? 'שומר…' : 'שמור'}
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

        {isDirty ? (
          <p className="builder-dirty-hint" role="status">
            יש שינויים שלא נשמרו
            {configLoadedForTenantId ? ` (tenant פעיל: ${configLoadedForTenantId})` : null}
          </p>
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

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        <div className="builder-split">
          <div className="builder-form-scroll">
            <SiteBuilderSectionCard
              title="זהות ומראה כללי"
              mapsToSite="שם העסק, לוגו וצבעי המותג בכל דפי האתר"
              defaultOpen
              preview={
                <div className="builder-mini-strip">
                  {logoUrl.trim() ? (
                    <img src={logoUrl.trim()} alt="" className="builder-mini-logo" />
                  ) : (
                    <span className="builder-mini-placeholder">לוגו</span>
                  )}
                  <div className="builder-mini-swatches">
                    {[primaryColor, secondaryColor, accentColor, textColor, backgroundColor].map((c, i) =>
                      c.trim() ? (
                        <span key={i} className="builder-mini-swatch" style={{ background: c.trim() }} title={c.trim()} />
                      ) : null,
                    )}
                  </div>
                </div>
              }
            >
              <div className="form-grid">
                <label>
                  שם פנימי (siteName)
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} dir="ltr" />
                </label>
                <label>
                  שם מוצג (displayName)
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </label>
                <label>
                  כתובת לוגו
                  <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} dir="ltr" placeholder="https://…" />
                </label>
                <div className="upload-row">
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    className="visually-hidden"
                    onChange={(e) => handleMediaPick('logo', e.target.files)}
                  />
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!!uploadingKind || saving || tenantIdMismatch}
                    onClick={() => logoFileRef.current?.click()}
                  >
                    {uploadingKind === 'logo' ? 'מעלה…' : 'העלאת לוגו'}
                  </button>
                </div>
                <label>
                  צבע ראשי
                  <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} dir="ltr" placeholder="#0055aa" />
                </label>
                <label>
                  צבע משני
                  <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} dir="ltr" />
                </label>
                <label>
                  הדגשה
                  <input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} dir="ltr" />
                </label>
                <label>
                  צבע טקסט
                  <input value={textColor} onChange={(e) => setTextColor(e.target.value)} dir="ltr" />
                </label>
                <label>
                  צבע רקע
                  <input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} dir="ltr" />
                </label>
                <label>
                  סגנון ערכת נושא
                  <select value={themeVariant} onChange={(e) => setThemeVariant(e.target.value)}>
                    <option value="classic">קלאסי</option>
                    <option value="modern">מודרני</option>
                    <option value="luxury">יוקרתי</option>
                    <option value="minimal">מינימליסטי</option>
                  </select>
                </label>
              </div>
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="כותרת ראשית (Hero)"
              mapsToSite="המסך הראשון בראש דף הבית — תמונה, כותרות וכפתור פעולה"
              defaultOpen
              preview={
                <div className="builder-mini-hero">
                  {heroImageUrl.trim() ? (
                    <img src={heroImageUrl.trim()} alt="" className="builder-mini-hero-img" />
                  ) : (
                    <div className="builder-mini-hero-img builder-mini-hero-img--empty" />
                  )}
                  <div className="builder-mini-hero-text">
                    <span className="builder-mini-hero-title">
                      {heroTitle.trim() || displayName.trim() || siteName.trim() || 'כותרת ברירת מחדל'}
                    </span>
                    {heroSubtitle.trim() ? (
                      <span className="builder-mini-hero-sub">
                        {heroSubtitle.trim().length > 90 ? `${heroSubtitle.trim().slice(0, 90)}…` : heroSubtitle.trim()}
                      </span>
                    ) : null}
                  </div>
                </div>
              }
            >
              <div className="form-grid">
                <label>
                  תמונת רקע (Hero)
                  <input value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} dir="ltr" placeholder="https://…" />
                </label>
                <div className="upload-row">
                  <input
                    ref={heroFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    className="visually-hidden"
                    onChange={(e) => handleMediaPick('hero', e.target.files)}
                  />
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!!uploadingKind || saving || tenantIdMismatch}
                    onClick={() => heroFileRef.current?.click()}
                  >
                    {uploadingKind === 'hero' ? 'מעלה…' : 'העלאת תמונת Hero'}
                  </button>
                </div>
                <label>
                  כותרת
                  <input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} placeholder="ריק = שם מוצג" />
                </label>
                <label className="full-width">
                  תת-כותרת
                  <input value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} />
                </label>
                <label>
                  טקסט כפתור (CTA)
                  <input value={heroCtaText} onChange={(e) => setHeroCtaText(e.target.value)} />
                </label>
                <label>
                  קישור הכפתור
                  <input value={heroCtaLink} onChange={(e) => setHeroCtaLink(e.target.value)} dir="ltr" placeholder="/cars או https://…" />
                </label>
              </div>
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="רכבים נבחרים"
              mapsToSite="סקשן הרכבים בדף הבית — רק בחירה מהמלאי (ללא הקלדת פרטי רכב)"
              defaultOpen
              preview={
                <div className="builder-mini-featured">
                  <div className="builder-mini-featured-thumbs">
                    {previewFeaturedCars.slice(0, 4).map((car) =>
                      car.mainImageUrl ? (
                        <img key={car.carId} src={car.mainImageUrl} alt="" className="builder-mini-thumb" loading="lazy" />
                      ) : (
                        <div key={car.carId} className="builder-mini-thumb builder-mini-thumb--empty" />
                      ),
                    )}
                  </div>
                  <span className="builder-mini-caption">
                    {featuredCarIds.length > 0
                      ? `${featuredCarIds.length} רכבים נבחרים (סדר כפי שמופיע למטה)`
                      : 'לא נבחרו — יוצגו עד 6 רכבים ראשונים מהמלאי'}
                  </span>
                </div>
              }
            >
              <div className="checkbox-grid builder-section-checkboxes">
                <label className="checkbox-label">
                  <input type="checkbox" checked={showFeaturedCars} onChange={(e) => setShowFeaturedCars(e.target.checked)} />
                  הצג סקשן רכבים בדף הבית
                </label>
              </div>
              <p className="hint builder-section-hint">מקור המלאי (חובה לבחירת רכבים):</p>
              <div className="form-grid">
                <label>
                  מזהה חצר (yardUid)
                  <input value={yardUid} onChange={(e) => setYardUid(e.target.value)} dir="ltr" />
                </label>
                <label>
                  מזהה מוכר (sellerUid, אופציונלי)
                  <input value={sellerUid} onChange={(e) => setSellerUid(e.target.value)} dir="ltr" />
                </label>
              </div>
              <p className="hint">
                הרכבים הנבחרים נשמרים כ־מזהים בלבד (<code dir="ltr">layout.featuredCarIds</code>). רכב שלא פורסם לציבור לא יוצג.
              </p>
              {!yardUid.trim() && !sellerUid.trim() ? (
                <p className="hint">הגדירו לפחות yardUid או sellerUid למעלה כדי לטעון מלאי לבחירה.</p>
              ) : builderInventoryLoading ? (
                <p className="hint">טוען מלאי…</p>
              ) : builderInventoryError ? (
                <p className="form-error">{builderInventoryError}</p>
              ) : builderInventoryCars.length === 0 ? (
                <p className="hint">אין עדיין רכבים מפורסמים במלאי זה. הוסיפו ופרסמו רכבים בחצר, ואז חזרו לבחור כאן.</p>
              ) : (
                <>
                  {featuredCarIds.length > 0 ? (
                    <div className="featured-selected-panel">
                      <div className="featured-selected-header">סדר הצגה באתר</div>
                      <ol className="featured-selected-list">
                        {featuredCarIds.map((id, index) => {
                          const car = builderInventoryCars.find((c) => c.carId === id);
                          return (
                            <li key={id} className="featured-selected-row">
                              <span className="featured-selected-label">{car ? formatCarPickerLabel(car) : `${id} (לא במלאי המפורסם)`}</span>
                              <span className="featured-selected-actions">
                                <button
                                  type="button"
                                  className="secondary-btn featured-mini-btn"
                                  disabled={formBusy || index === 0}
                                  onClick={() =>
                                    setFeaturedCarIds((prev) => {
                                      const next = [...prev];
                                      if (index <= 0) return prev;
                                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                      return next;
                                    })
                                  }
                                  aria-label="הזז למעלה"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn featured-mini-btn"
                                  disabled={formBusy || index >= featuredCarIds.length - 1}
                                  onClick={() =>
                                    setFeaturedCarIds((prev) => {
                                      const next = [...prev];
                                      if (index >= next.length - 1) return prev;
                                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                      return next;
                                    })
                                  }
                                  aria-label="הזז למטה"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn featured-mini-btn"
                                  disabled={formBusy}
                                  onClick={() => setFeaturedCarIds((prev) => prev.filter((x) => x !== id))}
                                >
                                  הסר מהאתר
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : (
                    <p className="hint">לא נבחרו רכבים — באתר יוצגו עד 6 רכבים ראשונים מהמלאי (כמו קודם).</p>
                  )}
                  <div className="featured-inventory-grid">
                    {builderInventoryCars.map((car) => {
                      const selected = featuredCarIds.includes(car.carId);
                      return (
                        <button
                          key={car.carId}
                          type="button"
                          className={`featured-inventory-card${selected ? ' is-selected' : ''}`}
                          disabled={formBusy}
                          onClick={() =>
                            setFeaturedCarIds((prev) =>
                              selected ? prev.filter((x) => x !== car.carId) : [...prev, car.carId],
                            )
                          }
                        >
                          {car.mainImageUrl ? (
                            <img src={car.mainImageUrl} alt="" className="featured-inventory-thumb" loading="lazy" />
                          ) : (
                            <div className="featured-inventory-thumb featured-inventory-thumb--empty" />
                          )}
                          <span className="featured-inventory-meta">{formatCarPickerLabel(car)}</span>
                          <span className="featured-inventory-badge">{selected ? 'מוצג באתר' : 'לחצו לבחירה'}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="אודות"
              mapsToSite="סקשן הטקסט שמספר על העסק בדף הבית"
              preview={
                <div className="builder-mini-text-preview">
                  {aboutTitle.trim() ? <strong>{aboutTitle.trim()}</strong> : <span className="builder-mini-muted">כותרת אודות</span>}
                  {aboutText.trim() ? (
                    <p>{aboutText.trim().length > 120 ? `${aboutText.trim().slice(0, 120)}…` : aboutText.trim()}</p>
                  ) : (
                    <p className="builder-mini-muted">טקסט אודות</p>
                  )}
                </div>
              }
            >
              <div className="checkbox-grid builder-section-checkboxes">
                <label className="checkbox-label">
                  <input type="checkbox" checked={showAbout} onChange={(e) => setShowAbout(e.target.checked)} />
                  הצג סקשן אודות
                </label>
              </div>
              <div className="form-grid">
                <label>
                  כותרת הסקשן
                  <input value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} />
                </label>
                <label className="full-width">
                  תוכן
                  <textarea value={aboutText} onChange={(e) => setAboutText(e.target.value)} rows={4} />
                </label>
              </div>
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="יתרונות"
              mapsToSite="רשימת יתרונות בדף הבית (שורה = פריט)"
              preview={
                <ul className="builder-mini-benefits">
                  {parseBenefitsLines(benefitsItemsText)
                    .slice(0, 3)
                    .map((line, i) => (
                      <li key={i}>{line.length > 70 ? `${line.slice(0, 70)}…` : line}</li>
                    ))}
                  {parseBenefitsLines(benefitsItemsText).length === 0 ? (
                    <li className="builder-mini-muted">הוסיפו שורות בשדה הפריטים</li>
                  ) : null}
                </ul>
              }
            >
              <div className="checkbox-grid builder-section-checkboxes">
                <label className="checkbox-label">
                  <input type="checkbox" checked={showBenefits} onChange={(e) => setShowBenefits(e.target.checked)} />
                  הצג סקשן יתרונות
                </label>
              </div>
              <div className="form-grid">
                <label>
                  כותרת הסקשן
                  <input value={benefitsTitle} onChange={(e) => setBenefitsTitle(e.target.value)} />
                </label>
                <label className="full-width">
                  פריטים (שורה לכל פריט)
                  <textarea value={benefitsItemsText} onChange={(e) => setBenefitsItemsText(e.target.value)} rows={5} />
                </label>
              </div>
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="יצירת קשר"
              mapsToSite="פרטי קשר וכותרות הסקשן בדף הבית"
              preview={
                <div className="builder-mini-contact-chips">
                  {phone.trim() ? <span className="builder-mini-chip">טל׳</span> : null}
                  {whatsapp.trim() ? <span className="builder-mini-chip">וואטסאפ</span> : null}
                  {email.trim() ? <span className="builder-mini-chip">אימייל</span> : null}
                  {(address.trim() || city.trim()) ? <span className="builder-mini-chip">כתובת</span> : null}
                  {!phone.trim() && !whatsapp.trim() && !email.trim() && !address.trim() && !city.trim() ? (
                    <span className="builder-mini-muted">הוסיפו לפחות דרך התקשרות אחת</span>
                  ) : null}
                </div>
              }
            >
              <div className="checkbox-grid builder-section-checkboxes">
                <label className="checkbox-label">
                  <input type="checkbox" checked={showContact} onChange={(e) => setShowContact(e.target.checked)} />
                  הצג סקשן יצירת קשר
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
                  הצג מפה (כאשר יש כתובת)
                </label>
              </div>
              <div className="form-grid">
                <label>
                  כותרת הסקשן
                  <input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} />
                </label>
                <label className="full-width">
                  תת-כותרת
                  <input value={contactSubtitle} onChange={(e) => setContactSubtitle(e.target.value)} />
                </label>
                <label>
                  טלפון
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
                </label>
                <label>
                  וואטסאפ
                  <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} dir="ltr" />
                </label>
                <label>
                  אימייל
                  <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                </label>
                <label>
                  כתובת
                  <input value={address} onChange={(e) => setAddress(e.target.value)} />
                </label>
                <label>
                  עיר
                  <input value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
                <label>
                  פייסבוק
                  <input value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} dir="ltr" placeholder="https://…" />
                </label>
                <label>
                  אינסטגרם
                  <input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} dir="ltr" placeholder="https://…" />
                </label>
                <label>
                  אתר חיצוני
                  <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} dir="ltr" placeholder="https://…" />
                </label>
              </div>
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="סקשנים נוספים וסדר בעמוד"
              mapsToSite="מימון, המלצות, וסדר הופעת כל הבלוקים בדף הבית"
              preview={
                <p className="builder-mini-order-hint">
                  גררו ברשימה כדי לשנות את סדר הסקשנים. הסדר נשמר ב־<code dir="ltr">layout.homeSections</code>.
                </p>
              }
            >
              <div className="checkbox-grid builder-section-checkboxes">
                <label className="checkbox-label">
                  <input type="checkbox" checked={showFinance} onChange={(e) => setShowFinance(e.target.checked)} />
                  הצג סקשן מימון
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={showTestimonials} onChange={(e) => setShowTestimonials(e.target.checked)} />
                  הצג סקשן המלצות
                </label>
              </div>
              <div className="form-grid">
                <label>
                  כותרת מימון
                  <input value={financeTitle} onChange={(e) => setFinanceTitle(e.target.value)} />
                </label>
                <label className="full-width">
                  טקסט מימון
                  <textarea value={financeText} onChange={(e) => setFinanceText(e.target.value)} rows={3} />
                </label>
                <label>
                  כותרת המלצות
                  <input value={testimonialsTitle} onChange={(e) => setTestimonialsTitle(e.target.value)} />
                </label>
                <label className="full-width">
                  תוכן המלצות
                  <textarea value={testimonialsText} onChange={(e) => setTestimonialsText(e.target.value)} rows={3} />
                </label>
              </div>
              <p className="hint">סדר סקשנים (גרירה):</p>
              <button
                type="button"
                className="secondary-btn reset-order-btn"
                disabled={formBusy}
                onClick={() => setSectionOrder([...TENANT_HOME_SECTION_KEYS])}
              >
                איפוס סדר ברירת מחדל
              </button>
              <ul className="section-drag-list">
                {sectionOrder.map((key, index) => (
                  <li
                    key={key}
                    className={`section-drag-item ${dragSectionIndex === index ? 'is-dragging' : ''}`}
                    draggable={!formBusy}
                    onDragStart={() => !formBusy && setDragSectionIndex(index)}
                    onDragEnd={() => setDragSectionIndex(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleSectionDrop(index);
                    }}
                  >
                    <span className="drag-handle" aria-hidden>
                      ⣿
                    </span>
                    <span className="section-key" dir="ltr">
                      {key}
                    </span>
                    <span className="section-label-he">{TENANT_HOME_SECTION_LABELS_HE[key]}</span>
                  </li>
                ))}
              </ul>
            </SiteBuilderSectionCard>

            <SiteBuilderSectionCard
              title="SEO ושיתוף ברשתות"
              mapsToSite="כותרת ותיאור לתוצאות חיפוש ולשיתוף קישור"
              preview={
                <div className="builder-mini-seo">
                  <span className="builder-mini-seo-title">{seoTitle.trim() || 'כותרת דף (ברירת מחדל מהאתר)'}</span>
                  <span className="builder-mini-seo-desc">
                    {seoDescription.trim()
                      ? seoDescription.trim().length > 100
                        ? `${seoDescription.trim().slice(0, 100)}…`
                        : seoDescription.trim()
                      : 'תיאור לתצוגה מקדימה בשיתוף'}
                  </span>
                </div>
              }
            >
              <div className="form-grid">
                <label>
                  כותרת (meta title)
                  <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
                </label>
                <label className="full-width">
                  תיאור (meta description)
                  <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={3} />
                </label>
                <label className="full-width">
                  תמונת OG (כתובת)
                  <input value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} dir="ltr" placeholder="https://…" />
                </label>
                <div className="upload-row">
                  <input
                    ref={ogFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    className="visually-hidden"
                    onChange={(e) => handleMediaPick('og', e.target.files)}
                  />
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!!uploadingKind || saving || tenantIdMismatch}
                    onClick={() => ogFileRef.current?.click()}
                  >
                    {uploadingKind === 'og' ? 'מעלה…' : 'העלאת תמונת OG'}
                  </button>
                </div>
              </div>
            </SiteBuilderSectionCard>
          </div>

          <aside className="builder-preview-panel" aria-label="תצוגה מקדימה">
            <div className="builder-preview-sticky">
              <h3 className="preview-title">תצוגה מקדימה (טיוטה)</h3>
              <p className="preview-hint">
                מתעדכן בזמן אמת לפי העריכה; עתיד: לוח צמוד מלא. שמירה מעדכנת את Firestore.
              </p>
              <div className="builder-preview-frame">
                <TenantHomeSectionsView
                  normalized={previewNormalized}
                  branding={previewBranding}
                  isPreview
                  cars={previewFeaturedCars}
                  rootClassName="builder-preview-inner"
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
