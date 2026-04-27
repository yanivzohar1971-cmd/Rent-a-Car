/**
 * Deterministic SiteResearchBundle → tenant site import buckets (branding, content, contact, seo, layout).
 * Fills gaps before/under Claude output; does not invent vehicles or fake street addresses.
 */

import type { SiteResearchBundle, SiteResearchPage } from "./siteResearchExtractor";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function trimStr(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function clip(s: string, max: number): string {
  const t = trimStr(s);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const ABOUT_HEADING_RE =
  /אודות|מי\s*אנחנו|קצת\s*עלינו|החברה|על\s*החברה|about\s+us|about\b|who\s*we\s*are|our\s+story/i;
const BENEFIT_KEYWORD_RE =
  /למה\s*לבחור|יתרונות|שירות|אמינות|מימון|אחריות|שקיפות|why\s*choose|benefits|service|trust|warranty|transparency/i;
const FINANCE_HINT_RE =
  /מימון|הלוואה|תשלומים|פריסת\s*תשלומים|טרייד|trade-?in|finance|financing|loan|leasing|credit/i;
const TESTIMONIAL_HINT_RE = /המלצות|ביקורות|חוות\s*דעת|reviews?|testimonials?|customers?\s+say/i;

const FULL_HOME_ORDER = [
  "hero",
  "featuredCars",
  "about",
  "benefits",
  "finance",
  "testimonials",
  "contact",
  "map",
] as const;

export type TenantSiteDeterministicImportDebug = {
  pagesFetchedCount: number;
  researchPagesByHint: Record<string, number>;
  deterministicFieldsProduced: string[];
  structureDetectedSections: string[];
  detectedHeroImageUrl?: string;
  detectedLogoUrl?: string;
  detectedCoreColors: string[];
  imageCandidatesCount: number;
  ignoredImagesCount: number;
  mappedSections: string[];
  unmappedImportantContentReasons: string[];
  visualHierarchyHint?: string;
  finalHeroImageUrl?: string;
  finalLogoUrl?: string;
  imageUrlWasMirrored?: boolean;
  brokenExternalImageUrlRejected?: boolean;
  mediaMirrorAttempted?: boolean;
  mediaMirrorSucceeded?: boolean;
  mirroredHeroImageCount?: number;
  mirroredLogoApplied?: boolean;
  mediaMirrorFailures?: string[];
  unsafeMediaRejectedCount?: number;
  selectedMediaBeforeMirror?: string[];
  selectedMediaAfterMirror?: string[];
  heroPreservedAfterMirror?: boolean;
  heroRemovedByValidation?: number;
  analyzeTimeoutSeconds?: number;
  rawDetectedColors?: string[];
  classifiedBrandColors?: string[];
  classifiedLogoColors?: string[];
  classifiedHeaderNavColors?: string[];
  classifiedHeroTextColors?: string[];
  classifiedCtaColors?: string[];
  classifiedNeutralColors?: string[];
  rejectedNeutralThemeColors?: string[];
  selectedPaletteBeforeNeutralFilter?: string[];
  selectedPaletteAfterNeutralFilter?: string[];
  selectedPrimaryColor?: string;
  selectedSecondaryColor?: string;
  selectedAccentColor?: string;
  screenshotColorSamplingUsed?: boolean;
  screenshotColorSamplingSkippedReason?: string;
};

function countPagesByHint(pages: SiteResearchPage[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    for (const h of p.researchHints) {
      out[h] = (out[h] ?? 0) + 1;
    }
  }
  return out;
}

function pageCorpus(p: SiteResearchPage): string {
  const parts = [
    p.title,
    p.metaDescription,
    p.ogTitle,
    p.ogDescription,
    p.headingLines?.join("\n"),
    p.mainTextSample,
    p.footerText,
    p.navLabels?.join("\n"),
  ].filter(Boolean) as string[];
  return parts.join("\n\n");
}

function bundleCorpus(pages: SiteResearchPage[]): string {
  return pages.filter((p) => p.fetchedOk).map(pageCorpus).join("\n\n");
}

function pickAboutPage(pages: SiteResearchPage[]): SiteResearchPage | undefined {
  const hinted = pages.filter((p) => p.fetchedOk && p.researchHints.includes("about"));
  if (hinted.length) return hinted.sort((a, b) => pageCorpus(b).length - pageCorpus(a).length)[0];
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    const blob = `${p.headingLines?.join(" ")}\n${p.title}`;
    if (ABOUT_HEADING_RE.test(blob)) return p;
  }
  return pages.find((p) => p.fetchedOk && p.researchHints.includes("home"));
}

function extractAboutFromPage(p: SiteResearchPage): { title: string; text: string } | null {
  const lines = p.headingLines ?? [];
  let title = "אודותינו";
  for (const h of lines) {
    if (ABOUT_HEADING_RE.test(h)) {
      title = clip(h, 72);
      break;
    }
  }
  const sample = trimStr(p.mainTextSample);
  if (!sample) return null;
  const idx = sample.search(ABOUT_HEADING_RE);
  let body = idx >= 0 ? sample.slice(idx).replace(ABOUT_HEADING_RE, "").trim() : sample;
  body = clip(body.replace(/^\W+/, "").trim(), 2800);
  if (body.length < 60) return null;
  return { title, text: body };
}

function extractBenefitSentences(corpus: string): string[] {
  if (!BENEFIT_KEYWORD_RE.test(corpus)) return [];
  const paras = corpus.split(/\n{2,}|\r\n\r\n/).map((x) => trimStr(x)).filter((x) => x.length >= 40);
  const sentences: string[] = [];
  const seen = new Set<string>();
  for (const block of paras) {
    if (!BENEFIT_KEYWORD_RE.test(block)) continue;
    const chunks = block.split(/(?<=[.!?])\s+/).map((x) => trimStr(x)).filter((x) => x.length >= 28);
    for (const c of chunks) {
      const words = c.split(/\s+/).filter(Boolean);
      if (words.length < 5) continue;
      const k = c.slice(0, 100);
      if (seen.has(k)) continue;
      seen.add(k);
      sentences.push(clip(c, 420));
      if (sentences.length >= 6) return sentences;
    }
  }
  if (sentences.length >= 4) return sentences;
  const lines = corpus.split(/\n/).map((x) => trimStr(x)).filter((x) => x.length >= 40);
  for (const ln of lines) {
    if (!BENEFIT_KEYWORD_RE.test(ln)) continue;
    const words = ln.split(/\s+/).filter(Boolean);
    if (words.length < 5) continue;
    const k = ln.slice(0, 100);
    if (seen.has(k)) continue;
    seen.add(k);
    sentences.push(clip(ln, 420));
    if (sentences.length >= 6) break;
  }
  return sentences;
}

function pickFinancePage(pages: SiteResearchPage[]): SiteResearchPage | undefined {
  const hinted = pages.filter((p) => p.fetchedOk && p.researchHints.includes("finance"));
  if (hinted.length) return hinted[0];
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    if (FINANCE_HINT_RE.test(pageCorpus(p))) return p;
  }
  return undefined;
}

function extractFinanceBlock(p: SiteResearchPage): { title: string; text: string } | null {
  const corpus = pageCorpus(p);
  const m = corpus.match(FINANCE_HINT_RE);
  if (!m || m.index === undefined) return null;
  const start = Math.max(0, m.index - 20);
  const slice = clip(corpus.slice(start, start + 900), 880);
  if (slice.length < 50) return null;
  return { title: "מימון ותשלומים", text: slice };
}

function pickTestimonialsPage(pages: SiteResearchPage[]): SiteResearchPage | undefined {
  const hinted = pages.filter((p) => p.fetchedOk && p.researchHints.includes("testimonials"));
  if (hinted.length) return hinted[0];
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    if (TESTIMONIAL_HINT_RE.test(pageCorpus(p))) return p;
  }
  return undefined;
}

function extractQuotedLines(text: string): string[] {
  const out: string[] = [];
  const dq = /"([^"]{24,600})"/g;
  let m: RegExpExecArray | null;
  while ((m = dq.exec(text)) !== null) {
    const q = trimStr(m[1]);
    if (q.length >= 24) out.push(q);
    if (out.length >= 4) break;
  }
  const he = /\u201C([^\u201D]{24,600})\u201D/g;
  while ((m = he.exec(text)) !== null) {
    const q = trimStr(m[1]);
    if (q.length >= 24) out.push(q);
    if (out.length >= 4) break;
  }
  return out;
}

function extractTestimonialsFromPage(p: SiteResearchPage): { title: string; text: string } | null {
  const corpus = pageCorpus(p);
  const quotes = extractQuotedLines(corpus);
  let title = "מה לקוחות אומרים";
  for (const h of p.headingLines ?? []) {
    if (TESTIMONIAL_HINT_RE.test(h)) {
      title = clip(h, 56);
      break;
    }
  }
  if (quotes.length >= 1) {
    return { title, text: quotes.slice(0, 3).join("\n\n") };
  }
  return null;
}

function extractEmails(text: string): string[] {
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const e = m[0].trim().toLowerCase();
    if (!seen.has(e)) {
      seen.add(e);
      out.push(m[0].trim());
    }
    if (out.length >= 3) break;
  }
  return out;
}

function extractPhones(text: string): string[] {
  const patterns = [/\+972[\s-]?(?:\d[\s-]?){8,12}/g, /0(?:5[0-9]|[23489])[\s-]?\d{7,8}/g, /0\d{1,2}[\s-]\d{7}/g];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].replace(/[\s-]+/g, "").trim();
      if (raw.length < 9 || raw.length > 14) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      out.push(m[0].trim());
      if (out.length >= 3) return out;
    }
  }
  return out;
}

function extractWhatsappDigits(text: string): string | undefined {
  const m = text.match(/(?:wa\.me\/|whatsapp|וואטסאפ|ווטסאפ)[^\d]*(\+?972\d{8,11}|05\d{8})/i);
  if (m?.[1]) return m[1].replace(/\D/g, "").replace(/^972/, "0");
  return undefined;
}

function extractCityLine(text: string): string | undefined {
  const hebCities =
    /(ירושלים|תל\s*אביב|חיפה|באר\s*שבע|ראשון|פתח\s*תקווה|נתניה|אשדוד|הרצליה|רמת\s*גן|חולון|בני\s*ברק|רחובות|כפר\s*סבא|מודיעין|רעננה|אשקלון|קריית\s*גת|נצרת|עכו|אילת|צפון|דרום|מרכז)/;
  const m = text.match(hebCities);
  if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  return undefined;
}

function extractStreetishAddress(text: string): string | undefined {
  const lines = text.split(/\n/).map((l) => trimStr(l)).filter(Boolean);
  const addrHints = /רחוב|שדרות|כביש|פינת|st\.|street|ave\.|blvd\.|#\d+/i;
  for (const line of lines) {
    if (line.length < 10 || line.length > 200) continue;
    if (addrHints.test(line) || (/\d/.test(line) && /[א-ת]{3,}/.test(line))) {
      return clip(line, 180);
    }
  }
  return undefined;
}

function resolveBusinessName(pages: SiteResearchPage[], startUrl: string): string {
  const home = pages.find((p) => p.fetchedOk && p.researchHints.includes("home"));
  const sig = home?.businessNameSignals;
  const n = trimStr(sig?.resolvedBusinessName ?? sig?.refinedBusinessName);
  if (n) return clip(n, 100);
  const t = trimStr(home?.title);
  if (t) return clip(t.split(/\s*[|–—-]\s*/)[0] ?? t, 100);
  try {
    const u = new URL(startUrl);
    const host = u.hostname.replace(/^www\./i, "").split(".")[0];
    return host || "העסק";
  } catch {
    return "העסק";
  }
}

function collectStructureSections(pages: SiteResearchPage[]): string[] {
  const s = new Set<string>();
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    for (const h of p.researchHints) {
      if (h === "home") s.add("hero");
      else if (h === "inventory") s.add("featuredCars");
      else s.add(h);
    }
    const c = pageCorpus(p);
    if (/nav|תפריט|menu/i.test(p.navLabels?.join(" ") ?? "")) s.add("nav");
    if (HEROISH(p)) s.add("hero");
    if (ABOUT_HEADING_RE.test(c)) s.add("about");
    if (BENEFIT_KEYWORD_RE.test(c)) s.add("benefits");
    if (FINANCE_HINT_RE.test(c)) s.add("finance");
    if (TESTIMONIAL_HINT_RE.test(c)) s.add("testimonials");
    if (p.researchHints.includes("contact") || /צור\s*קשר|contact|footer/i.test(c)) s.add("contact");
    if (/מפה|map|waze|google\s*maps/i.test(c)) s.add("map");
  }
  return [...s];
}

function HEROISH(p: SiteResearchPage): boolean {
  return (p.heroBannerImageCandidates?.length ?? 0) > 0 || (p.layoutSignals?.heroImagesDetectedCount ?? 0) > 0;
}

function inferVisualHierarchy(pages: SiteResearchPage[]): string | undefined {
  const c = bundleCorpus(pages).toLowerCase();
  if (/מימון|finance|loan|leasing/.test(c) && /premium|luxury|פרימיום|יוקרה/.test(c)) return "luxury_finance";
  if (/מבצע|discount|הנחה|cheap|זול/.test(c)) return "budget";
  if (/משפחה|שירות|אמון|family|service/.test(c)) return "family_service";
  if (/מימון|trade|טרייד/.test(c)) return "financing";
  if (/מלאי|inventory|stock|רכבים/.test(c)) return "showroom";
  if (/אמינות|trust|warranty|אחריות/.test(c)) return "trust";
  return undefined;
}

/** Known-good preset ids from `web/src/tenant/sectionThemePresets.ts` (import sanitization drops unknown). */
function presetIdForHierarchy(h: string | undefined): string | undefined {
  switch (h) {
    case "luxury_finance":
      return "midnight-ink";
    case "budget":
      return "amber-glow";
    case "family_service":
      return "sage-calm";
    case "financing":
      return "sea-glass";
    case "showroom":
      return "cobalt-classic";
    case "trust":
      return "linen-natural";
    default:
      return undefined;
  }
}

function collectCoreColors(pages: SiteResearchPage[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (hex: string | undefined) => {
    if (!hex) return;
    const t = hex.trim().toLowerCase();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(t)) return;
    if (t === "#000" || t === "#000000" || t === "#fff" || t === "#ffffff") return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    for (const c of p.coreColorPalette?.colors ?? []) push(c);
    push(p.themeColor);
    const ls = p.layoutSignals;
    push(ls?.primaryCtaBackgroundColor);
    push(ls?.primaryCtaTextColor);
  }
  return out.slice(0, 5);
}

function collectPaletteDebug(pages: SiteResearchPage[]): Pick<
  TenantSiteDeterministicImportDebug,
  | "rawDetectedColors"
  | "classifiedBrandColors"
  | "classifiedLogoColors"
  | "classifiedHeaderNavColors"
  | "classifiedHeroTextColors"
  | "classifiedCtaColors"
  | "classifiedNeutralColors"
  | "rejectedNeutralThemeColors"
  | "selectedPaletteBeforeNeutralFilter"
  | "selectedPaletteAfterNeutralFilter"
  | "screenshotColorSamplingUsed"
  | "screenshotColorSamplingSkippedReason"
> {
  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean).map((x) => x.trim().toLowerCase()))];
  const flat = <K extends keyof NonNullable<SiteResearchPage["coreColorPalette"]>>(k: K): string[] =>
    uniq(
      pages.flatMap((p) => {
        const v = p.coreColorPalette?.[k];
        return Array.isArray(v) ? (v as string[]) : [];
      }),
    );
  const rawDetectedColors = flat("rawDetectedColors").slice(0, 12);
  return {
    rawDetectedColors,
    classifiedBrandColors: flat("classifiedBrandColors").slice(0, 8),
    classifiedLogoColors: flat("classifiedLogoColors").slice(0, 8),
    classifiedHeaderNavColors: flat("classifiedHeaderNavColors").slice(0, 8),
    classifiedHeroTextColors: flat("classifiedHeroTextColors").slice(0, 8),
    classifiedCtaColors: flat("classifiedCtaColors").slice(0, 8),
    classifiedNeutralColors: flat("classifiedNeutralColors").slice(0, 8),
    rejectedNeutralThemeColors: flat("rejectedNeutralThemeColors").slice(0, 8),
    selectedPaletteBeforeNeutralFilter: flat("selectedPaletteBeforeNeutralFilter").slice(0, 5),
    selectedPaletteAfterNeutralFilter: flat("selectedPaletteAfterNeutralFilter").slice(0, 5),
    screenshotColorSamplingUsed: pages.some((p) => p.coreColorPalette?.screenshotColorSamplingUsed === true),
    screenshotColorSamplingSkippedReason:
      pages.find((p) => p.coreColorPalette?.screenshotColorSamplingSkippedReason)?.coreColorPalette?.screenshotColorSamplingSkippedReason ??
      "not_reported",
  };
}

function countImageSignals(pages: SiteResearchPage[]): { candidates: number; ignored: number } {
  let candidates = 0;
  let ignored = 0;
  for (const p of pages) {
    if (!p.fetchedOk) continue;
    candidates += p.heroBannerImageCandidates?.length ?? 0;
    candidates += p.layoutSignals?.logoCandidates?.length ?? 0;
    const b = p.layoutSignals?.heroCandidateUrlsCountBeforeFilter ?? 0;
    const a = p.layoutSignals?.heroCandidateUrlsCountAfterFilter ?? 0;
    ignored += Math.max(0, b - a);
  }
  return { candidates, ignored };
}

export type BuildTenantSiteImportFromResearchResult = {
  patch: Record<string, unknown>;
  debug: TenantSiteDeterministicImportDebug;
};

/**
 * Builds a sanitized-shape import object from fetched research pages only (no model).
 */
export function buildTenantSiteImportFromResearchBundle(research: SiteResearchBundle): BuildTenantSiteImportFromResearchResult {
  const pages = research.pages;
  const okPages = pages.filter((p) => p.fetchedOk);
  const corpus = bundleCorpus(okPages);
  const business = resolveBusinessName(pages, research.startUrl);
  const hierarchy = inferVisualHierarchy(okPages);
  const produced: string[] = [];

  const branding: Record<string, unknown> = {};
  const content: Record<string, unknown> = {};
  const contact: Record<string, unknown> = {};
  const seo: Record<string, unknown> = {};
  const layout: Record<string, unknown> = {};

  const home = okPages.find((p) => p.researchHints.includes("home"));
  const domHero = home?.heroImageCandidatesRanked?.map((x) => x.url) ?? [];
  const heuristicHero = home?.heroBannerImageCandidates ?? [];
  const heroUrls = (domHero.length ? domHero : heuristicHero).filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
  if (heroUrls.length >= 2) {
    branding.heroImageUrls = heroUrls.slice(0, 8);
    branding.heroImageUrl = heroUrls[0];
    produced.push("branding.heroImageUrls");
  } else if (heroUrls.length === 1) {
    branding.heroImageUrl = heroUrls[0];
    produced.push("branding.heroImageUrl");
  } else if (home?.ogImage && /^https?:\/\//i.test(home.ogImage.trim())) {
    branding.heroImageUrl = home.ogImage.trim();
    produced.push("branding.heroImageUrl(ogImage)");
  }

  const logoTop = home?.layoutSignals?.logoCandidates?.[0]?.url;
  const logoFromImages = home?.imageCandidates?.find((x) => x.score >= 24 && /logo|brand/i.test(x.url))?.url;
  const logoPick = logoTop || logoFromImages;
  if (logoPick && /^https?:\/\//i.test(logoPick)) {
    branding.logoWebsiteCandidate = logoPick;
    produced.push("branding.logoWebsiteCandidate");
  }

  const colors = collectCoreColors(okPages);
  if (colors[0]) {
    branding.primaryColor = colors[0];
    produced.push("branding.primaryColor");
  }
  if (colors[1]) {
    branding.secondaryColor = colors[1];
    produced.push("branding.secondaryColor");
  }
  if (colors[2]) {
    branding.accentColor = colors[2];
    produced.push("branding.accentColor");
  }

  branding.displayName = business;
  branding.siteName = business;
  branding.businessName = business;
  produced.push("branding.displayName", "branding.siteName", "branding.businessName");

  content.heroTitle = clip(`${business} — רכבים איכותיים ושירות מקצועי`, 120);
  content.heroSubtitle = clip(
    trimStr(home?.metaDescription) || `מבחר רכבים, ייעוץ וליווי אישי — ${business}.`,
    240,
  );
  content.heroCtaText = "צפו במלאי הרכבים";
  produced.push("content.heroTitle", "content.heroSubtitle", "content.heroCtaText");

  const aboutPage = pickAboutPage(okPages);
  const aboutBlock = aboutPage ? extractAboutFromPage(aboutPage) : null;
  if (aboutBlock) {
    content.aboutTitle = aboutBlock.title;
    content.aboutText = aboutBlock.text;
    produced.push("content.aboutTitle", "content.aboutText");
  }

  const benefits = extractBenefitSentences(corpus);
  if (benefits.length >= 3) {
    content.benefitsTitle = "למה לבחור בנו?";
    content.benefitsItems = benefits;
    produced.push("content.benefitsTitle", "content.benefitsItems");
  }

  const finPage = pickFinancePage(okPages);
  const finBlock = finPage ? extractFinanceBlock(finPage) : null;
  if (finBlock) {
    content.financeTitle = finBlock.title;
    content.financeText = finBlock.text;
    produced.push("content.financeTitle", "content.financeText");
  }

  const testPage = pickTestimonialsPage(okPages);
  const testBlock = testPage ? extractTestimonialsFromPage(testPage) : null;
  if (testBlock) {
    content.testimonialsTitle = testBlock.title;
    content.testimonialsText = testBlock.text;
    produced.push("content.testimonialsTitle", "content.testimonialsText");
  } else {
    content.testimonialsTitle = "מה לקוחות אומרים";
    content.testimonialsText =
      "«שירות ברור ומקצועי מהרגע הראשון — הרגשתי שמקשיבים לצורך ולא רק מנסים לסגור עסקה» (לקוח פרטי).\n\n" +
      "«חשוב לי שקיפות ומענה מהיר; כאן קיבלתי בדיוק את זה» (עסק קטן).";
    produced.push("content.testimonialsText(fallbackNeutral)");
  }

  const phones = extractPhones(corpus);
  const emails = extractEmails(corpus);
  const wa = extractWhatsappDigits(corpus);
  const addr = extractStreetishAddress(corpus + "\n" + okPages.map((p) => p.footerText ?? "").join("\n"));
  const city =
    extractCityLine(corpus + "\n" + okPages.map((p) => p.footerText ?? "").join("\n")) ||
    extractCityLine(addr ?? "");

  if (phones[0]) {
    contact.phone = phones[0].replace(/\s+/g, "");
    produced.push("contact.phone");
  }
  const phoneNorm = ((contact.phone as string | undefined) ?? "").replace(/\D/g, "");
  const waNorm = (wa ?? "").replace(/\D/g, "");
  if (waNorm && waNorm !== phoneNorm) {
    let disp = waNorm;
    if (disp.startsWith("972")) disp = `0${disp.slice(3)}`;
    else if (!disp.startsWith("0") && disp.length >= 9) disp = `0${disp}`;
    contact.whatsapp = disp;
    produced.push("contact.whatsapp");
  }
  if (emails[0]) {
    contact.email = emails[0];
    produced.push("contact.email");
  }
  if (addr) {
    contact.address = addr;
    produced.push("contact.address");
  }
  if (city) {
    contact.city = city;
    produced.push("contact.city");
  }

  content.contactTitle = "דברו איתנו";
  content.contactSubtitle = clip(
    trimStr(home?.metaDescription) || `נשמח לעזור בבחירת רכב — ${business}.`,
    220,
  );
  produced.push("content.contactTitle", "content.contactSubtitle");

  const seoTitle = trimStr(home?.title) || `${business} | דף הבית`;
  const seoDesc = trimStr(home?.metaDescription ?? home?.ogDescription) || clip(corpus, 220);
  seo.title = clip(seoTitle, 120);
  seo.description = clip(seoDesc, 300);
  if (home?.ogImage && /^https?:\/\//i.test(home.ogImage.trim())) {
    seo.ogImageUrl = home.ogImage.trim();
    produced.push("seo.ogImageUrl");
  }
  produced.push("seo.title", "seo.description");

  layout.homeSections = [...FULL_HOME_ORDER];
  layout.showFeaturedCars = true;
  layout.showAbout = true;
  layout.showBenefits = true;
  layout.showFinance = true;
  layout.showTestimonials = true;
  layout.showContact = true;
  const hasGeo = !!(trimStr(contact.address as string) || trimStr(contact.city as string));
  layout.showMap = hasGeo;
  produced.push("layout.homeSections", "layout.showMap");
  const presetPick = presetIdForHierarchy(hierarchy);
  if (presetPick) {
    layout.defaultSectionThemePresetId = presetPick;
    produced.push("layout.defaultSectionThemePresetId");
  }

  const reasons: string[] = [];
  if (!aboutBlock) reasons.push("about_insufficient_copy");
  if (benefits.length < 3) reasons.push("benefits_not_detected");
  if (!finBlock) reasons.push("finance_page_or_copy_missing");
  if (!testBlock) reasons.push("testimonials_synthesized");
  if (!phones[0] && !emails[0]) reasons.push("no_phone_or_email_in_corpus");

  const imgSig = countImageSignals(okPages);
  const struct = [
    ...new Set([...collectStructureSections(okPages), ...okPages.flatMap((p) => p.structureDetectedSections ?? [])]),
  ];
  const mapped = [
    "hero",
    "featuredCars",
    aboutBlock ? "about" : "",
    benefits.length >= 3 ? "benefits" : "",
    finBlock ? "finance" : "",
    "testimonials",
    "contact",
    hasGeo ? "map" : "",
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  const patch: Record<string, unknown> = {};
  if (Object.keys(branding).length) patch.branding = branding;
  if (Object.keys(content).length) patch.content = content;
  if (Object.keys(contact).length) patch.contact = contact;
  if (Object.keys(seo).length) patch.seo = seo;
  if (Object.keys(layout).length) patch.layout = layout;

  const debug: TenantSiteDeterministicImportDebug = {
    pagesFetchedCount: pages.length,
    researchPagesByHint: countPagesByHint(pages),
    deterministicFieldsProduced: produced,
    structureDetectedSections: struct,
    detectedHeroImageUrl: (branding.heroImageUrl as string) || heroUrls[0],
    detectedLogoUrl: logoPick,
    detectedCoreColors: colors,
    imageCandidatesCount: imgSig.candidates,
    ignoredImagesCount: imgSig.ignored,
    mappedSections: mapped,
    unmappedImportantContentReasons: reasons,
    visualHierarchyHint: hierarchy,
    ...collectPaletteDebug(okPages),
    selectedPrimaryColor: typeof branding.primaryColor === "string" ? branding.primaryColor : undefined,
    selectedSecondaryColor: typeof branding.secondaryColor === "string" ? branding.secondaryColor : undefined,
    selectedAccentColor: typeof branding.accentColor === "string" ? branding.accentColor : undefined,
  };

  return { patch, debug };
}

function meaningfulValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return true;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some((x) => typeof x === "string" && x.trim().length > 0);
  if (typeof v === "number" && Number.isFinite(v)) return true;
  return false;
}

function mergeScalarBuckets(d: Record<string, unknown>, c: Record<string, unknown>): Record<string, unknown> {
  const keys = new Set([...Object.keys(d), ...Object.keys(c)]);
  const merged: Record<string, unknown> = {};
  for (const k of keys) {
    const cv = c[k];
    const dv = d[k];
    if (meaningfulValue(cv)) merged[k] = cv;
    else if (meaningfulValue(dv)) merged[k] = dv;
  }
  return merged;
}

/**
 * Claude wins on meaningful fields; deterministic fills missing or empty-string / empty-array keys.
 */
export function mergeDeterministicResearchUnderSanitizedClaude(
  deterministicPatch: Record<string, unknown>,
  claudePatch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...claudePatch };
  const tops = ["branding", "content", "contact", "seo"] as const;
  for (const top of tops) {
    const d = asRecord(deterministicPatch[top]);
    const c = asRecord((out[top] as Record<string, unknown>) ?? {});
    const merged = mergeScalarBuckets(d, c);
    if (Object.keys(merged).length > 0) out[top] = merged;
    else delete out[top];
  }
  const dL = asRecord(deterministicPatch.layout);
  const cL = asRecord((out.layout as Record<string, unknown>) ?? {});
  const mergedLayout: Record<string, unknown> = mergeScalarBuckets(dL, cL);
  const hsC = cL.homeSections;
  const hsD = dL.homeSections;
  if (Array.isArray(hsC) && hsC.filter((x) => typeof x === "string" && x.trim()).length > 0) {
    mergedLayout.homeSections = hsC;
  } else if (Array.isArray(hsD) && hsD.length > 0) {
    mergedLayout.homeSections = hsD;
  }
  if (Object.keys(mergedLayout).length > 0) out.layout = mergedLayout;
  else delete out.layout;
  return out;
}
