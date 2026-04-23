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

/** Deterministic benefits lines when AI omits or empties list (order fixed). */
const DEFAULT_URL_BENEFITS_HE = [
  'שירות אמין ואישי',
  'מבחר רכבים רחב',
  'מחירים תחרותיים',
  'ליווי מקצועי',
];

const HERO_TITLE_SUFFIX_HE = 'רכבים איכותיים במחירים מעולים';
const HERO_SUBTITLE_FALLBACK_HE = 'מבחר רכבים חדש ועדכני עם שירות אישי ואמין';
const HERO_CTA_TEXT_FALLBACK_HE = 'צפו ברכבים';
const HERO_CTA_LINK_FALLBACK = '/cars';

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

function benefitsLookWeak(n: NormalizedTenantSiteConfig): boolean {
  const title = n.content.benefitsTitle?.trim();
  const raw = n.content.benefitsItems ?? [];
  const nonEmpty = raw.filter((x) => typeof x === 'string' && x.trim().length > 0);
  return !title || nonEmpty.length === 0;
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
    const tail = hint ? ` (${hint})` : '';
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      aboutTitle: (typeof prevContent.aboutTitle === 'string' && prevContent.aboutTitle.trim()
        ? prevContent.aboutTitle
        : 'אודות') as string,
      aboutText: `${label} מתמחים במכירת ובחירת רכבים איכותיים ללקוחות פרטיים ועסקיים${tail}. אנו מאמינים בשקיפות, במחויבות לשירות אמין ואישי, ובליווי צמוד בכל שלב. כל רכב נבדק בקפידה כדי שתצאו לדרך בביטחון ובמקצועיות.`,
    };
    summary.completedAbout = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (benefitsLookWeak(n)) {
    const prevContent = asRecord(augment.content);
    const benefitsTitle =
      n.content.benefitsTitle?.trim() ||
      (typeof prevContent.benefitsTitle === 'string' && prevContent.benefitsTitle.trim()
        ? prevContent.benefitsTitle.trim()
        : 'יתרונות');
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
    const contactTitle =
      n.content.contactTitle?.trim() ||
      (typeof prevContent.contactTitle === 'string' && prevContent.contactTitle.trim()
        ? prevContent.contactTitle
        : 'יצירת קשר');
    const defaultSubtitle =
      basePhone.length > 0
        ? `נשמח לעמוד לשירותכם. צוות מקצועי זמין לשאלות, הצעות מחיר ותיאום ביקור. ניתן ליצור קשר בטלפון ${basePhone}.`
        : 'נשמח לעמוד לשירותכם. צוות מקצועי זמין לשאלות, הצעות מחיר ותיאום ביקור — השאירו פרטים ונחזור אליכם בהקדם.';
    const contactSubtitle = n.content.contactSubtitle?.trim() || defaultSubtitle;
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
