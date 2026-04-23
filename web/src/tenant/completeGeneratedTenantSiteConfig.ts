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

const GENERIC_BENEFITS_HE = [
  'מגוון רכבים זמינים לבחירה',
  'מחירים שקופים וללא הפתעות',
  'שירות לקוחות אדיב ומקצועי',
  'אפשרות מימון והחלפת רכב',
  'זמינות מהירה לשאלות ולתיאום',
];

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

function normalizedLooksEmpty(n: NormalizedTenantSiteConfig, which: 'heroTitle' | 'aboutText' | 'benefits' | 'contactBlock' | 'seoTitle'): boolean {
  switch (which) {
    case 'heroTitle':
      return !(n.content.heroTitle?.trim());
    case 'aboutText':
      return !(n.content.aboutText?.trim());
    case 'benefits':
      return !n.content.benefitsItems?.length && !(n.content.benefitsTitle?.trim());
    case 'contactBlock':
      return !(n.content.contactTitle?.trim()) && !(n.contact.phone?.trim()) && !(n.contact.address?.trim());
    case 'seoTitle':
      return !(n.seo.title?.trim());
    default:
      return true;
  }
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

  if (normalizedLooksEmpty(n, 'heroTitle')) {
    augment.content = {
      ...(augment.content ?? {}),
      heroTitle: label,
      heroSubtitle: `ברוכים הבאים ל-${label}`,
    };
    summary.completedHero = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (normalizedLooksEmpty(n, 'aboutText')) {
    const hint = args.tenantContext.industryHint?.trim();
    const tail = hint ? ` תחום פעילות: ${hint}.` : '';
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      aboutTitle: (typeof prevContent.aboutTitle === 'string' && prevContent.aboutTitle.trim()
        ? prevContent.aboutTitle
        : 'אודות') as string,
      aboutText: `${label} מספקים שירות מקצועי ואמין ללקוחות.${tail} נשמח לעמוד לשירותכם.`,
    };
    summary.completedAbout = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (normalizedLooksEmpty(n, 'benefits')) {
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      benefitsTitle: (typeof prevContent.benefitsTitle === 'string' && prevContent.benefitsTitle.trim()
        ? prevContent.benefitsTitle
        : 'יתרונות') as string,
      benefitsItems: [...GENERIC_BENEFITS_HE],
    };
    summary.completedBenefits = true;
    combined = mergeImportBuckets(args.coercedPatch, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (normalizedLooksEmpty(n, 'contactBlock')) {
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      contactTitle: (typeof prevContent.contactTitle === 'string' && prevContent.contactTitle.trim()
        ? prevContent.contactTitle
        : 'יצירת קשר') as string,
      contactSubtitle: (typeof prevContent.contactSubtitle === 'string' && prevContent.contactSubtitle.trim()
        ? prevContent.contactSubtitle
        : 'נשמח לשמוע מכם') as string,
    };
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
