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
  /** Structured fields inferred from allowlisted import strings (keywords, quotes, contact patterns). */
  appliedContentTextMapping: boolean;
  /** Enabled finance section had no body copy until completion. */
  completedFinance: boolean;
  /** Enabled testimonials section had no quote body until completion. */
  completedTestimonials: boolean;
  /** Enabled map section had no geo hint until a searchable address line was added. */
  completedMapAddress: boolean;
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

const DEFAULT_URL_IMPORT_HOME_ORDER = [
  'hero',
  'featuredCars',
  'about',
  'benefits',
  'finance',
  'contact',
] as const;

const ABOUT_HEADING_KEYWORDS_HE = /אודות|מי\s*אנחנו|החברה|קצת\s*עלינו|על\s*החברה/i;
const BENEFITS_HEADING_KEYWORDS_HE = /יתרונות|למה\s*לבחור|למה\s*אנחנו|היתרונות|מה\s*מקבלים/i;
const TESTIMONIALS_HEADING_KEYWORDS_HE = /לקוחות\s*אומרים|המלצות|חוות\s*דעת|מה\s*הלקוחות|reviews?|testimonials?/i;
const FINANCE_KEYWORDS_HE = /מימון|הלוואה|תשלומים|מסגרת\s*אשראי|פריסת\s*תשלומים|leasing|finance|loan/i;

const FINANCE_SECTION_TITLE_FALLBACK_HE = 'מימון נוח לרכב';
const FINANCE_TEXT_FALLBACK_HE = (business: string) =>
  `ב-${business} אנו מסייעים בהתאמת מסלול מימון או הלוואה לרכב — כולל פריסת תשלומים נוחה, שקיפות מלאה לגבי עלויות ותנאים, וליווי מקצועי משלב הבדיקה ועד החתימה. נשמח לעבור איתכם בקצרה על האפשרויות הרלוונטיות, בלי התחייבות ובקצב נוח לכם.`;

const TESTIMONIALS_TITLE_FALLBACK_HE = 'מה לקוחות אומרים';
const TESTIMONIALS_TEXT_FALLBACK_HE = (business: string) =>
  `«קיבלנו שירות ברור וסבלני מהרגע הראשון — הרגשתי שאכן רואים את הלקוח לפני העסקה» (לקוח פרטי, ${business}).\n\n«חשוב לי רכב אמין במחיר הוגן; ישר קיבלתי שקיפות ומענה מהיר לכל שאלה» (עסק קטן).`;

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

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** AI sometimes returns `benefitsItems` as a newline/bullet blob; normalization expects an array. */
function normalizeCoercedBenefitsItemsString(
  patch: ScreenshotDerivedSiteConfigImportInput,
): ScreenshotDerivedSiteConfigImportInput {
  const c = asRecord(patch.content);
  const bi = c.benefitsItems;
  if (typeof bi !== 'string' || !bi.trim()) return patch;
  const lines = splitLooseBenefitLines(bi);
  if (lines.length < 2) return patch;
  return {
    ...patch,
    content: { ...c, benefitsItems: lines } as ScreenshotDerivedSiteConfigImportInput['content'],
  };
}

function splitLooseBenefitLines(blob: string): string[] {
  const raw = blob
    .split(/\r?\n|•|·|◦|▪|‣|⁃|–\s*\*\s*|(?=\n?\d+[\.)]\s+)/)
    .map((x) => x.replace(/^[\s\-*•·\d.)]+/g, '').trim())
    .filter((x) => x.length >= 12 && x.length < 900);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw) {
    const k = line.slice(0, 120);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= 8) break;
  }
  return out;
}

function collectImportTextCorpus(patch: ScreenshotDerivedSiteConfigImportInput): string {
  const parts: string[] = [];
  const c = asRecord(patch.content);
  const keys = [
    'heroTitle',
    'heroSubtitle',
    'heroCtaText',
    'aboutTitle',
    'aboutText',
    'about',
    'benefitsTitle',
    'financeTitle',
    'financeText',
    'contactTitle',
    'contactSubtitle',
    'testimonialsTitle',
    'testimonialsText',
  ] as const;
  for (const k of keys) {
    const t = trimStr(c[k]);
    if (t) parts.push(t);
  }
  const bi = c.benefitsItems;
  if (Array.isArray(bi)) {
    for (const x of bi) {
      if (typeof x === 'string' && x.trim()) parts.push(x.trim());
    }
  } else if (typeof bi === 'string' && bi.trim()) {
    parts.push(bi.trim());
  }
  const seo = asRecord(patch.seo);
  const desc = trimStr(seo.description);
  if (desc) parts.push(desc);
  return parts.join('\n\n');
}

function extractEmails(text: string): string[] {
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(text)) !== null) {
    const e = m[0].trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(m[0].trim());
    }
    if (out.length >= 3) break;
  }
  return out;
}

/** Israeli-style phones and generic +972 patterns from visible text. */
function extractPhones(text: string): string[] {
  const patterns: RegExp[] = [
    /\+972[\s-]?(?:\d[\s-]?){8,12}/g,
    /0(?:5[0-9]|[23489])[\s-]?\d{7,8}/g,
    /0\d{1,2}[\s-]\d{7}/g,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].replace(/[\s-]+/g, '').trim();
      if (raw.length < 9 || raw.length > 14) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      out.push(m[0].trim());
      if (out.length >= 3) return out;
    }
  }
  return out;
}

function extractAddressLine(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const addrHints =
    /רחוב|שדרות|כביש|פינת|מספר|כתובת|st\.|street|ave\.|blvd\.|#\d+|,\s*\d{3,5}\s*$/i;
  const hebCity = /(?:ירושלים|תל\s*אביב|חיפה|באר\s*שבע|ראשון|פתח\s*תקווה|נתניה|אשדוד|הרצליה|רמת\s*גן|חולון|בני\s*ברק|רחובות|כפר\s*סבא|מודיעין|רעננה)/;
  for (const line of lines) {
    if (line.length < 8 || line.length > 220) continue;
    if (addrHints.test(line) || (/\d/.test(line) && hebCity.test(line))) {
      return line;
    }
  }
  const inline = text.match(
    /(?:כתובת|מיקום|נמצאים)\s*[:\-]\s*([^\n]{10,180})/i,
  );
  if (inline?.[1]?.trim()) return inline[1].trim();
  return null;
}

function sliceAfterKeyword(text: string, re: RegExp, maxLen: number): string | null {
  const m = text.match(re);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  let chunk = text.slice(start, start + maxLen).trim();
  const softStop = chunk.search(/\n\n|(?=לקוחות אומרים|המלצות|מימון|הלוואה|יצירת קשר|contact|finance)/i);
  if (softStop > 80) chunk = chunk.slice(0, softStop).trim();
  chunk = chunk.replace(/^\W+/, '').trim();
  if (chunk.length < 40) return null;
  return chunk.length > 1200 ? `${chunk.slice(0, 1197)}…` : chunk;
}

function extractAboutParagraph(corpus: string): { title: string | null; text: string | null } {
  if (!ABOUT_HEADING_KEYWORDS_HE.test(corpus)) return { title: null, text: null };
  const text = sliceAfterKeyword(corpus, ABOUT_HEADING_KEYWORDS_HE, 1100);
  if (!text) return { title: null, text: null };
  const titleMatch = corpus.match(ABOUT_HEADING_KEYWORDS_HE);
  const title =
    titleMatch?.[0] && titleMatch[0].length <= 40
      ? titleMatch[0].replace(/\s+/g, ' ').trim()
      : 'אודותינו';
  return { title, text };
}

function extractFinanceParagraph(corpus: string): string | null {
  if (!FINANCE_KEYWORDS_HE.test(corpus)) return null;
  const idx = corpus.search(FINANCE_KEYWORDS_HE);
  if (idx < 0) return null;
  const from = Math.max(0, idx - 40);
  let chunk = corpus.slice(from, from + 520).trim();
  const nl = chunk.indexOf('\n\n');
  if (nl > 120) chunk = chunk.slice(0, nl).trim();
  return chunk.length >= 35 ? (chunk.length > 800 ? `${chunk.slice(0, 797)}…` : chunk) : null;
}

function extractQuotedTestimonials(corpus: string): { title: string | null; text: string | null } {
  const quotes: string[] = [];
  const dq = /"([^"]{22,800})"/g;
  let m: RegExpExecArray | null;
  while ((m = dq.exec(corpus)) !== null) {
    const q = m[1].trim();
    if (q.length >= 22) quotes.push(q);
    if (quotes.length >= 4) break;
  }
  const heq = /\u201C([^\u201D]{22,800})\u201D/g;
  while ((m = heq.exec(corpus)) !== null) {
    const q = m[1].trim();
    if (q.length >= 22) quotes.push(q);
    if (quotes.length >= 4) break;
  }
  let title: string | null = null;
  const hm = corpus.match(TESTIMONIALS_HEADING_KEYWORDS_HE);
  if (hm) title = hm[0].length <= 48 ? hm[0].trim() : TESTIMONIALS_TITLE_FALLBACK_HE;
  if (quotes.length === 0) return { title, text: null };
  const text = quotes.join('\n\n');
  return { title: title ?? TESTIMONIALS_TITLE_FALLBACK_HE, text };
}

function extractBenefitLinesFromCorpus(corpus: string): string[] | null {
  if (!BENEFITS_HEADING_KEYWORDS_HE.test(corpus)) return null;
  const slice = sliceAfterKeyword(corpus, BENEFITS_HEADING_KEYWORDS_HE, 1600);
  if (!slice) return null;
  const lines = splitLooseBenefitLines(slice);
  return lines.length >= 3 ? lines : null;
}

/**
 * Underlay patch: coerced import wins on conflicts ({@link mergeImportBuckets}(this, coerced)).
 * Only fills empty / non-array benefits from analyzed allowlisted strings.
 */
function mapAnalyzedImportTextToStructuredPatch(
  coercedPatch: ScreenshotDerivedSiteConfigImportInput,
  _businessLabel: string,
): ScreenshotDerivedSiteConfigImportInput {
  const out: ScreenshotDerivedSiteConfigImportInput = {};
  const corpus = collectImportTextCorpus(coercedPatch);
  if (!corpus.trim()) return out;

  const c = asRecord(coercedPatch.content);
  const hasAboutText = !!(trimStr(c.aboutText) || trimStr(c.about));
  if (!hasAboutText) {
    const ab = extractAboutParagraph(corpus);
    if (ab.text) {
      out.content = {
        ...(out.content as Record<string, unknown> | undefined),
        aboutTitle: ab.title ?? undefined,
        aboutText: ab.text,
      } as ScreenshotDerivedSiteConfigImportInput['content'];
    }
  }

  if (!Array.isArray(c.benefitsItems) && typeof c.benefitsItems !== 'string') {
    const lines = extractBenefitLinesFromCorpus(corpus);
    if (lines?.length) {
      out.content = {
        ...asRecord(out.content),
        benefitsTitle: trimStr(c.benefitsTitle) || BENEFITS_SECTION_TITLE_FALLBACK_HE,
        benefitsItems: lines,
      } as ScreenshotDerivedSiteConfigImportInput['content'];
    }
  } else if (Array.isArray(c.benefitsItems) && c.benefitsItems.filter((x) => typeof x === 'string' && x.trim()).length < 3) {
    const lines = extractBenefitLinesFromCorpus(corpus);
    if (lines?.length) {
      out.content = {
        ...asRecord(out.content),
        benefitsTitle: trimStr(c.benefitsTitle) || BENEFITS_SECTION_TITLE_FALLBACK_HE,
        benefitsItems: lines,
      } as ScreenshotDerivedSiteConfigImportInput['content'];
    }
  }

  if (!trimStr(c.financeText)) {
    const fin = extractFinanceParagraph(corpus);
    if (fin) {
      out.content = {
        ...asRecord(out.content),
        financeTitle: trimStr(c.financeTitle) || FINANCE_SECTION_TITLE_FALLBACK_HE,
        financeText: fin,
      } as ScreenshotDerivedSiteConfigImportInput['content'];
    }
  }

  if (!trimStr(c.testimonialsText)) {
    const te = extractQuotedTestimonials(corpus);
    if (te.text) {
      out.content = {
        ...asRecord(out.content),
        testimonialsTitle: te.title ?? undefined,
        testimonialsText: te.text,
      } as ScreenshotDerivedSiteConfigImportInput['content'];
    }
  }

  const existingContact = asRecord(coercedPatch.contact);
  const contactOut: Record<string, unknown> = {};
  if (!trimStr(existingContact.phone)) {
    const phones = extractPhones(corpus);
    if (phones[0]) contactOut.phone = phones[0].replace(/\s+/g, '');
  }
  if (!trimStr(existingContact.email)) {
    const emails = extractEmails(corpus);
    if (emails[0]) contactOut.email = emails[0];
  }
  if (!trimStr(existingContact.address)) {
    const addr = extractAddressLine(corpus);
    if (addr) contactOut.address = addr;
  }
  if (Object.keys(contactOut).length > 0) {
    out.contact = contactOut as ScreenshotDerivedSiteConfigImportInput['contact'];
  }

  return out;
}

function patchHasAnyMappedFields(p: ScreenshotDerivedSiteConfigImportInput): boolean {
  return (
    Object.keys(asRecord(p.content)).length > 0 ||
    Object.keys(asRecord(p.contact)).length > 0 ||
    Object.keys(asRecord(p.layout)).length > 0 ||
    Object.keys(asRecord(p.seo)).length > 0 ||
    Object.keys(asRecord(p.branding)).length > 0
  );
}

function financeNeedsCompletion(n: NormalizedTenantSiteConfig): boolean {
  return n.layout.showFinance && !n.content.financeText?.trim();
}

function testimonialsNeedCompletion(n: NormalizedTenantSiteConfig): boolean {
  return n.layout.showTestimonials && !n.content.testimonialsText?.trim();
}

function mapSectionNeedsGeo(n: NormalizedTenantSiteConfig): boolean {
  return n.layout.showMap && !(n.contact.address?.trim() || n.contact.city?.trim());
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

  const shapeFixedCoerced = normalizeCoercedBenefitsItemsString(args.coercedPatch);
  const textMappingUnderlay = mapAnalyzedImportTextToStructuredPatch(shapeFixedCoerced, label);
  const effectiveCoerced = mergeImportBuckets(textMappingUnderlay, shapeFixedCoerced);

  const summary: UrlGenerationCompletionSummary = {
    completedHero: false,
    completedAbout: false,
    completedBenefits: false,
    completedContact: false,
    completedSeo: false,
    appliedContentTextMapping: patchHasAnyMappedFields(textMappingUnderlay),
    completedFinance: false,
    completedTestimonials: false,
    completedMapAddress: false,
    appliedDefaultSectionOrder: false,
    appliedThemePreset: null,
  };

  const augment: ScreenshotDerivedSiteConfigImportInput = {};
  const layoutKeysInSource = Object.keys(asRecord(effectiveCoerced.layout));
  const hadHomeSectionsInSource = layoutKeysInSource.includes('homeSections');
  const homeSectionsFromAi = hadHomeSectionsInSource
    ? (() => {
        const raw = asRecord(effectiveCoerced.layout).homeSections;
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

  let combined = mergeImportBuckets(effectiveCoerced, augment);
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
    combined = mergeImportBuckets(effectiveCoerced, augment);
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
    combined = mergeImportBuckets(effectiveCoerced, augment);
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
    combined = mergeImportBuckets(effectiveCoerced, augment);
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
        ...asRecord(effectiveCoerced.contact),
        ...asRecord(augment.contact),
        phone: basePhone,
      };
    }
    summary.completedContact = true;
    combined = mergeImportBuckets(effectiveCoerced, augment);
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
    combined = mergeImportBuckets(effectiveCoerced, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (financeNeedsCompletion(n)) {
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      financeTitle:
        (typeof prevContent.financeTitle === 'string' && prevContent.financeTitle.trim()
          ? prevContent.financeTitle
          : n.content.financeTitle?.trim()) || FINANCE_SECTION_TITLE_FALLBACK_HE,
      financeText: FINANCE_TEXT_FALLBACK_HE(label),
    };
    summary.completedFinance = true;
    combined = mergeImportBuckets(effectiveCoerced, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (testimonialsNeedCompletion(n)) {
    const prevContent = asRecord(augment.content);
    augment.content = {
      ...prevContent,
      testimonialsTitle:
        (typeof prevContent.testimonialsTitle === 'string' && prevContent.testimonialsTitle.trim()
          ? prevContent.testimonialsTitle
          : n.content.testimonialsTitle?.trim()) || TESTIMONIALS_TITLE_FALLBACK_HE,
      testimonialsText: TESTIMONIALS_TEXT_FALLBACK_HE(label),
    };
    summary.completedTestimonials = true;
    combined = mergeImportBuckets(effectiveCoerced, augment);
    n = normalizeTenantSiteConfigImport(combined as unknown, tid, args.baseSyntheticConfig).normalized;
  }

  if (mapSectionNeedsGeo(n)) {
    augment.contact = {
      ...asRecord(effectiveCoerced.contact),
      ...asRecord(augment.contact),
      address: `${label}, ישראל`,
    };
    summary.completedMapAddress = true;
    combined = mergeImportBuckets(effectiveCoerced, augment);
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

  return { patch: mergeImportBuckets(effectiveCoerced, augment), completionSummary: summary };
}
