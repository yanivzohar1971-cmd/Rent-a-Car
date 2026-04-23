/**
 * Deterministic completion for URL (and similar) AI import patches so the builder
 * always receives a usable site shape before merge into draft.
 */
import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import { normalizeTenantSiteConfigImport, type ScreenshotDerivedSiteConfigImportInput } from './tenantSiteConfigImport';
import { SECTION_THEME_PRESET_LIST, getSectionThemePresetById } from './sectionThemePresets';
import { parseCssColorForContrast } from './tenantVisualResolver';
import type { NormalizedTenantSiteConfig } from './tenantSiteConfig';

export type UrlGenerationCompletionSummary = {
  completedHero: boolean;
  completedAbout: boolean;
  completedBenefits: boolean;
  completedContact: boolean;
  completedSeo: boolean;
  appliedDefaultSectionOrder: boolean;
  appliedThemePreset: string | null;
};

export type UrlAutoApplyDebugBlock = {
  attempted: boolean;
  applied: boolean;
  blockedByDirty: boolean;
  blockedByTenantMismatch: boolean;
  blockedByStaleRequest: boolean;
  blockedByForbidden: boolean;
  changedTopLevelKeys: string[];
  changedLayoutFieldKeys: string[];
  timestamp: string;
};

const DEFAULT_URL_IMPORT_HOME_ORDER = [
  'hero',
  'featuredCars',
  'about',
  'benefits',
  'finance',
  'contact',
] as const;

/** Rich deterministic benefits when AI omits, shortens, or returns label-like lines (order fixed). */
const DEFAULT_URL_BENEFITS_HE = [
  'שירות אישי וליווי מלא לאורך כל התהליך — מאבחון הצורך ועד מסירת הרכב, עם זמינות לשאלות והכוונה מקצועית.',
  'מבחר רחב של רכבים איכותיים ועדכניים, כדי שתמצאו את השילוב המדויק בין נוחות, בטיחות ותקציב.',
  'מחירים הוגנים ותנאי מימון נוחים, כך שתדעו מראש לאן אתם הולכים ובלי הפתעות לאורך הדרך.',
  'אמינות, שקיפות ומוניטין מוכח — אנחנו מאמינים ששירות טוב נבנה על אמון, והלקוחות שלנו חוזרים שוב ושוב.',
];

const HERO_TITLE_SUFFIX_HE = 'רכבים איכותיים במבחר גדול';
const HERO_SUBTITLE_FALLBACK_HE =
  'מבחר רכבים עדכני, מחירים משתלמים ושירות אישי מהשורה הראשונה';
const HERO_CTA_TEXT_FALLBACK_HE = 'צפו במלאי הרכבים שלנו';
/** Omitted in Firestore: live site resolves default CTA to the tenant storefront cars URL. */
const HERO_CTA_LINK_FALLBACK = '';

const CONTACT_TITLE_FALLBACK_HE = 'צרו איתנו קשר עוד היום';
const CONTACT_INVITE_LINE_HE = 'נשמח לעזור לכם למצוא את הרכב המתאים ביותר עבורכם.';

const BENEFITS_SECTION_TITLE_FALLBACK_HE = 'למה לבחור בנו?';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function mergeImportBuckets(
  a: ScreenshotDerivedSiteConfigImportInput,
  b: ScreenshotDerivedSiteConfigImportInput,
): ScreenshotDerivedSiteConfigImportInput {
  const out: ScreenshotDerivedSiteConfigImportInput = {};
  const keys: Array<keyof ScreenshotDerivedSiteConfigImportInput> = ['branding', 'content', 'contact', 'seo', 'layout'];
  for (const k of keys) {
    const ar = asRecord(a[k]);
    const br = asRecord(b[k]);
    if (Object.keys(ar).length === 0 && Object.keys(br).length === 0) continue;
    out[k] = { ...ar, ...br } as ScreenshotDerivedSiteConfigImportInput[typeof k];
  }
  return out;
}

function rgbDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Pick catalog preset whose accent is closest in sRGB to the given brand accent (fallback first preset). */
export function pickSectionThemePresetIdFromBrandColors(accentHex: string | null, primaryHex: string | null): string {
  const target = parseCssColorForContrast(accentHex?.trim() || '') ?? parseCssColorForContrast(primaryHex?.trim() || '');
  if (!target) return SECTION_THEME_PRESET_LIST[0]?.id ?? 'paper-classic';
  let bestId = SECTION_THEME_PRESET_LIST[0]?.id ?? 'paper-classic';
  let best = Number.POSITIVE_INFINITY;
  for (const p of SECTION_THEME_PRESET_LIST) {
    const pr = parseCssColorForContrast(p.accentBaseColor);
    if (!pr) continue;
    const d = rgbDist(target, pr);
    if (d < best) {
      best = d;
      bestId = p.id;
    }
  }
  return bestId;
}

function normalizedLooksEmpty(n: NormalizedTenantSiteConfig, which: 'aboutText' | 'seoTitle'): boolean {
  switch (which) {
    case 'aboutText':
      return !(n.content.aboutText?.trim());
    case 'seoTitle':
      return !(n.seo.title?.trim());
    default:
      return true;
  }
}

/** Hero must read as a full block in the builder (title + subtitle + CTA label). */
function heroNeedsCompletion(n: NormalizedTenantSiteConfig): boolean {
  return (
    !(n.content.heroTitle?.trim()) ||
    !(n.content.heroSubtitle?.trim()) ||
    !(n.content.heroCtaText?.trim())
  );
}

function benefitsItemLooksWeak(line: string): boolean {
  const t = line.trim();
  if (t.length < 22) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return true;
  if (words.length < 3) return true;
  return false;
}

/** True when title/list missing or list reads like short labels, not full benefit lines. */
function benefitsLookWeak(n: NormalizedTenantSiteConfig): boolean {
  const title = n.content.benefitsTitle?.trim();
  const raw = n.content.benefitsItems ?? [];
  const nonEmpty = raw.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
  if (!title || nonEmpty.length === 0) return true;
  if (nonEmpty.length < 4) return true;
  return nonEmpty.some((line) => benefitsItemLooksWeak(line));
}

/** Contact headline + blurb; phone/address alone are not enough for visible section copy. */
function contactHeadlineNeedsCompletion(n: NormalizedTenantSiteConfig): boolean {
  return !(n.content.contactTitle?.trim()) || !(n.content.contactSubtitle?.trim());
}

function baseSyntheticPhone(base: TenantSiteConfig): string {
  const p = asRecord(base.contact).phone;
  return typeof p === 'string' ? p.trim() : '';
}

export type TenantContextForUrlCompletion = {
  tenantId: string;
  displayName: string;
  industryHint?: string;
};

/**
 * Merges coerced AI patch into the current synthetic config view, fills obvious gaps deterministically,
 * and returns an expanded import patch (still import-shaped; coerce again in caller).
 */
export function buildCompleteUrlImportPatch(args: {
  tenantContext: TenantContextForUrlCompletion;
  baseSyntheticConfig: TenantSiteConfig;
  coercedPatch: ScreenshotDerivedSiteConfigImportInput;
}): { patch: ScreenshotDerivedSiteConfigImportInput; completionSummary: UrlGenerationCompletionSummary } {
  const tid = args.tenantContext.tenantId.trim() || 'preview';
  const label =
    args.tenantContext.displayName.trim() ||
    (asRecord(args.baseSyntheticConfig.branding).displayName as string | undefined)?.trim() ||
    'העסק';

  const summary: UrlGenerationCompletionSummary = {
    completedHero: false,
    completedAbout: false,
    completedBenefits: false,
    completedContact: false,
    completedSeo: false,
    appliedDefaultSectionOrder: false,
    appliedThemePreset: null,
  };

  const augment: ScreenshotDerivedSiteConfigImportInput = {};
  const layoutKeysInSource = Object.keys(asRecord(args.coercedPatch.layout));
  const hadHomeSectionsInSource = layoutKeysInSource.includes('homeSections');
  const homeSectionsFromAi = hadHomeSectionsInSource
    ? (() => {
        const raw = asRecord(args.coercedPatch.layout).homeSections;
        return Array.isArray(raw)
          ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).length
          : 0;
      })()
    : 0;

  if (!hadHomeSectionsInSource || homeSectionsFromAi === 0) {
    augment.layout = {
      homeSections: [...DEFAULT_URL_IMPORT_HOME_ORDER],
      showFeaturedCars: true,
      showAbout: true,
      showBenefits: true,
      showFinance: true,
      showContact: true,
      showTestimonials: false,
      showMap: false,
    } as ScreenshotDerivedSiteConfigImportInput['layout'];
    summary.appliedDefaultSectionOrder = true;
  }

  let combined = mergeImportBuckets(args.coercedPatch, augment);
  let n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;

  if (heroNeedsCompletion(n)) {
    const prevContent = asRecord(augment.content);
    const heroTitle =
      n.content.heroTitle?.trim() || `${label} - ${HERO_TITLE_SUFFIX_HE}`;
    const heroSubtitle = n.content.heroSubtitle?.trim() || HERO_SUBTITLE_FALLBACK_HE;
    const heroCtaText = n.content.heroCtaText?.trim() || HERO_CTA_TEXT_FALLBACK_HE;
    const heroCtaLink = n.content.heroCtaLink?.trim() || HERO_CTA_LINK_FALLBACK;
    augment.content = {
      ...prevContent,
      heroTitle,
      heroSubtitle,
      heroCtaText,
      heroCtaLink,
    };
    summary.completedHero = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (normalizedLooksEmpty(n, 'aboutText')) {
    const hint = args.tenantContext.industryHint?.trim();
    const hintSentence = hint
      ? ` אנו מכירים לעומק את תחום ${hint} ומתאימים את ההמלצות לצרכים האמיתיים בשטח.`
      : '';
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      aboutTitle: (typeof prevContent.aboutTitle === 'string' && prevContent.aboutTitle.trim()
        ? prevContent.aboutTitle
        : 'אודותינו') as string,
      aboutText: `חברת ${label} מתמחה במכירת רכבים איכותיים ללקוחות פרטיים ועסקיים, עם דגש על בחירה קפדנית של כלי רכב עדכניים ובטוחים.${hintSentence} אנו שמים דגש על שירות אישי, הסבר ברור וליווי סבלני — מהפגישה הראשונה ועד רגע קבלת הרכב. הלקוחות שלנו נהנים משקיפות מלאה, מאמינות לטווח ארוך ומצוות שמבין שרכב הוא לא רק עסקה, אלא חלק מהשגרה והביטחון שלכם על הכביש.`,
    };
    summary.completedAbout = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (benefitsLookWeak(n)) {
    const prevContent = asRecord(augment.content);
    const fromModel = n.content.benefitsTitle?.trim() ?? '';
    const fromAugment =
      typeof prevContent.benefitsTitle === 'string' && prevContent.benefitsTitle.trim()
        ? prevContent.benefitsTitle.trim()
        : '';
    const pickTitle = fromModel.length >= 10 ? fromModel : fromAugment.length >= 10 ? fromAugment : '';
    const benefitsTitle = pickTitle || BENEFITS_SECTION_TITLE_FALLBACK_HE;
    augment.content = {
      ...prevContent,
      benefitsTitle,
      benefitsItems: [...DEFAULT_URL_BENEFITS_HE],
    };
    summary.completedBenefits = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (contactHeadlineNeedsCompletion(n)) {
    const prevContent = asRecord(augment.content);
    const basePhone = baseSyntheticPhone(args.baseSyntheticConfig);
    const fromModelTitle = n.content.contactTitle?.trim() ?? '';
    const fromAugmentTitle =
      typeof prevContent.contactTitle === 'string' && prevContent.contactTitle.trim()
        ? prevContent.contactTitle.trim()
        : '';
    const contactTitle =
      fromModelTitle || fromAugmentTitle || CONTACT_TITLE_FALLBACK_HE;
    const defaultSubtitle =
      basePhone.length > 0
        ? `${CONTACT_INVITE_LINE_HE} צוות ${label} זמין לכל שאלה, להצעת מחיר ולתיאום ביקור — גם בטלפון ${basePhone}. נשמח לקבל אתכם ולהראות לכם את המלאי בפועל.`
        : `${CONTACT_INVITE_LINE_HE} השאירו פרטים בטופס או צרו קשר טלפוני, ונחזור אליכם במהירות עם מענה אדיב ומקצועי.`;
    const fromModelSub = n.content.contactSubtitle?.trim() ?? '';
    const fromAugmentSub =
      typeof prevContent.contactSubtitle === 'string' && prevContent.contactSubtitle.trim()
        ? prevContent.contactSubtitle.trim()
        : '';
    const contactSubtitle = fromModelSub || fromAugmentSub || defaultSubtitle;
    augment.content = {
      ...prevContent,
      contactTitle,
      contactSubtitle,
    };
    if (!n.contact.phone?.trim() && basePhone) {
      augment.contact = {
        ...asRecord(args.coercedPatch.contact),
        ...asRecord(augment.contact),
        phone: basePhone,
      };
    }
    summary.completedContact = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (normalizedLooksEmpty(n, 'seoTitle')) {
    const prevSeo = asRecord(augment.seo);
    const existingDesc = typeof prevSeo.description === 'string' && prevSeo.description.trim() ? prevSeo.description : '';
    augment.seo = {
      ...prevSeo,
      title: `${label} | דף הבית`,
      description:
        existingDesc ||
        `${label} — מידע, יצירת קשר ושירות ללקוחות. עודכן אוטומטית מניתוח אתר.`,
    };
    summary.completedSeo = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  const presetExisting = n.layout.defaultSectionThemePresetId;
  if (!presetExisting?.trim() || !getSectionThemePresetById(presetExisting)) {
    const accent = n.branding.accentColor?.trim() || null;
    const primary = n.branding.primaryColor?.trim() || null;
    const picked = pickSectionThemePresetIdFromBrandColors(accent, primary);
    augment.layout = {
      ...(augment.layout ?? {}),
      defaultSectionThemePresetId: picked,
    };
    summary.appliedThemePreset = picked;
  } else {
    summary.appliedThemePreset = presetExisting.trim();
  }

  return { patch: mergeImportBuckets(args.coercedPatch, augment), completionSummary: summary };
}
