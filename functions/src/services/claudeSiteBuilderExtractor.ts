import { anthropicClient, ANTHROPIC_SITE_BUILDER_DEFAULT_MODEL } from "./anthropicClient";

/** Vision-capable model for layout/colors/text extraction from screenshots (not the smoke-test model). */
export const CLAUDE_SITE_BUILDER_VISION_MODEL = ANTHROPIC_SITE_BUILDER_DEFAULT_MODEL;

const TENANT_HOME_SECTION_KEYS = [
  "hero",
  "featuredCars",
  "about",
  "benefits",
  "finance",
  "testimonials",
  "contact",
  "map",
] as const;

const BRANDING_KEYS = new Set([
  "siteName",
  "displayName",
  "logoUrl",
  "logoSource",
  "logoWebsiteCandidate",
  "logoYardCandidate",
  "heroImageUrl",
  "primaryCtaBackgroundColor",
  "primaryCtaTextColor",
  "pageBackgroundImageUrl",
  "pageBackgroundOverlayOpacity",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "textColor",
  "backgroundColor",
  "themeVariant",
  "businessName",
]);

const CONTENT_KEYS = new Set([
  "heroTitle",
  "heroSubtitle",
  "heroCtaText",
  "heroCtaLink",
  "aboutTitle",
  "aboutText",
  "about",
  "benefitsTitle",
  "benefitsItems",
  "financeTitle",
  "financeText",
  "contactTitle",
  "contactSubtitle",
  "testimonialsTitle",
  "testimonialsText",
  "siteName",
  "businessName",
  "featuredCars",
]);

const CONTACT_KEYS = new Set([
  "phone",
  "whatsapp",
  "email",
  "address",
  "city",
  "facebookUrl",
  "instagramUrl",
  "websiteUrl",
]);

const SEO_KEYS = new Set(["title", "description", "ogImageUrl"]);

const LAYOUT_BOOLEAN_KEYS = new Set([
  "showFeaturedCars",
  "showAbout",
  "showBenefits",
  "showFinance",
  "showTestimonials",
  "showContact",
  "showMap",
]);

const TOP_LEVEL_KEYS = new Set([
  "branding",
  "content",
  "contact",
  "seo",
  "layout",
]);

const MAX_STRING_LEN = 8000;
const MAX_BENEFIT_ITEMS = 12;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function coerceString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > MAX_STRING_LEN ? t.slice(0, MAX_STRING_LEN) : t;
}

/** Map loose labels to supported section keys only. */
function normalizeSectionKey(raw: string): (typeof TENANT_HOME_SECTION_KEYS)[number] | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  for (const key of TENANT_HOME_SECTION_KEYS) {
    if (key.toLowerCase() === lower) return key;
  }
  const k = lower.replace(/[\s_-]+/g, "");
  const aliases: Record<string, (typeof TENANT_HOME_SECTION_KEYS)[number]> = {
    hero: "hero",
    featuredcars: "featuredCars",
    inventory: "featuredCars",
    stock: "featuredCars",
    cars: "featuredCars",
    listings: "featuredCars",
    about: "about",
    aboutus: "about",
    benefits: "benefits",
    whyus: "benefits",
    finance: "finance",
    testimonials: "testimonials",
    reviews: "testimonials",
    contact: "contact",
    map: "map",
    location: "map",
  };
  return aliases[k] ?? null;
}

function parseHomeSectionsOrder(value: unknown, warnings: string[]): string[] {
  if (!Array.isArray(value)) {
    warnings.push("layout.homeSections missing or not an array; omitted");
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const nk = normalizeSectionKey(item);
    if (!nk) {
      warnings.push(`Unknown section key removed: ${String(item).slice(0, 40)}`);
      continue;
    }
    if (seen.has(nk)) continue;
    seen.add(nk);
    out.push(nk);
  }
  return out;
}

function pickStrings(
  source: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  warnings: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    if (!allowed.has(k)) {
      warnings.push(`Stripped ${path}.${k}`);
      continue;
    }
    const s = coerceString(v);
    if (s) out[k] = s;
  }
  return out;
}

function sanitizeBenefitsItems(raw: unknown, warnings: string[]): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = coerceString(x);
    if (s) out.push(s);
    if (out.length >= MAX_BENEFIT_ITEMS) break;
  }
  return out.length > 0 ? out : undefined;
}

const MAX_HERO_IMAGE_URLS = 8;

function sanitizeHeroImageUrls(raw: unknown, warnings: string[]): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = coerceString(x);
    if (!s || !/^https?:\/\//i.test(s)) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= MAX_HERO_IMAGE_URLS) break;
  }
  if (out.length === 0) return undefined;
  if (out.length === 1) {
    warnings.push("branding.heroImageUrls had only one URL; treating as single heroImageUrl downstream");
  }
  return out;
}

const SECTION_STYLE_KEYS = new Set([
  "backgroundMode",
  "textTone",
  "align",
  "layoutVariant",
  "paddingDensity",
  "cardStyle",
  "accentBaseColor",
  "colorPreset",
  "sectionBackgroundColor",
  "sectionBackgroundImageUrl",
]);

function sanitizeSectionStylesBlock(raw: unknown, warnings: string[]): Record<string, unknown> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of TENANT_HOME_SECTION_KEYS) {
    if (key === "hero") continue;
    const v = src[key];
    if (typeof v !== "object" || v === null) continue;
    const rec = v as Record<string, unknown>;
    const slim: Record<string, unknown> = {};
    for (const [sk, sv] of Object.entries(rec)) {
      if (!SECTION_STYLE_KEYS.has(sk)) {
        warnings.push(`Stripped layout.sectionStyles.${String(key)}.${sk}`);
        continue;
      }
      if (sk === "accentBaseColor") {
        const s = coerceString(sv);
        if (s && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) slim[sk] = s.toLowerCase();
        continue;
      }
      if (sk === "sectionBackgroundColor") {
        const s = coerceString(sv);
        if (s && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) slim[sk] = s.toLowerCase();
        continue;
      }
      if (sk === "sectionBackgroundImageUrl") {
        const s = coerceString(sv);
        if (s && /^https?:\/\//i.test(s)) slim[sk] = s;
        continue;
      }
      if (typeof sv === "string" && sv.trim()) slim[sk] = sv.trim();
    }
    if (Object.keys(slim).length > 0) out[key] = slim;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeLayout(layoutRaw: unknown, warnings: string[], opts?: { allowSectionStyles?: boolean }): Record<string, unknown> | undefined {
  const layout = asRecord(layoutRaw);
  if (Object.keys(layout).length === 0) return undefined;
  const out: Record<string, unknown> = {};

  if (layout.homeSections !== undefined) {
    out.homeSections = parseHomeSectionsOrder(layout.homeSections, warnings);
  }

  for (const k of LAYOUT_BOOLEAN_KEYS) {
    if (layout[k] !== undefined) {
      out[k] = typeof layout[k] === "boolean" ? layout[k] : Boolean(layout[k]);
    }
  }

  const variant = coerceString(layout.variant);
  if (variant) out.variant = variant;
  const themeVariant = coerceString(layout.themeVariant);
  if (themeVariant) out.themeVariant = themeVariant;

  const featuredCarsPresentation = coerceString(layout.featuredCarsPresentation)?.toLowerCase();
  if (featuredCarsPresentation === "carscarousel" || featuredCarsPresentation === "cars_carousel") {
    out.featuredCarsPresentation = "carsCarousel";
  } else if (featuredCarsPresentation === "grid") {
    out.featuredCarsPresentation = "grid";
  }

  if (opts?.allowSectionStyles && layout.sectionStyles !== undefined) {
    const ss = sanitizeSectionStylesBlock(layout.sectionStyles, warnings);
    if (ss) out.sectionStyles = ss;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export type SanitizeAiTenantSiteImportOptions = {
  /** URL research may suggest per-section chrome; screenshots intentionally omit this. */
  allowLayoutSectionStyles?: boolean;
};

/**
 * Strips unsupported keys and inventory-style data from a parsed JSON object before returning to clients.
 * Client still runs coerceImportedTenantSiteConfig.
 */
export function sanitizeAiTenantSiteImportPayload(
  parsed: unknown,
  warnings: string[],
  options?: SanitizeAiTenantSiteImportOptions,
): Record<string, unknown> {
  const root = asRecord(parsed);
  const out: Record<string, unknown> = {};

  for (const k of Object.keys(root)) {
    if (!TOP_LEVEL_KEYS.has(k)) {
      warnings.push(`Removed top-level key: ${k}`);
    }
  }

  if (root.branding !== undefined) {
    const bRaw = asRecord(root.branding);
    const bRawNoHeroList = { ...bRaw };
    delete (bRawNoHeroList as { heroImageUrls?: unknown }).heroImageUrls;
    const b = pickStrings(bRawNoHeroList, BRANDING_KEYS, "branding", warnings);
    const heroList = sanitizeHeroImageUrls(bRaw.heroImageUrls, warnings);
    if (heroList && heroList.length > 0) {
      (b as Record<string, unknown>).heroImageUrls = heroList;
      if (!(b as Record<string, unknown>).heroImageUrl && heroList[0]) {
        (b as Record<string, unknown>).heroImageUrl = heroList[0];
      }
    }
    const opRaw = bRaw.pageBackgroundOverlayOpacity;
    if (typeof opRaw === "number" && Number.isFinite(opRaw)) {
      b.pageBackgroundOverlayOpacity = Math.max(0, Math.min(0.85, opRaw));
    } else if (typeof opRaw === "string" && opRaw.trim()) {
      const n = Number(opRaw.trim());
      if (Number.isFinite(n)) b.pageBackgroundOverlayOpacity = Math.max(0, Math.min(0.85, n));
    }
    const br = b as Record<string, unknown>;
    const logoSrc = coerceString(br.logoSource)?.toLowerCase();
    if (logoSrc && (logoSrc === "website" || logoSrc === "yard" || logoSrc === "manual")) {
      br.logoSource = logoSrc;
    } else if (br.logoSource !== undefined) {
      delete br.logoSource;
      warnings.push("Stripped invalid branding.logoSource");
    }
    for (const lk of ["logoWebsiteCandidate", "logoYardCandidate"] as const) {
      const u = coerceString(br[lk]);
      if (!u) continue;
      if (!/^https?:\/\//i.test(u)) {
        delete br[lk];
        warnings.push(`Stripped invalid branding.${lk}`);
      } else {
        br[lk] = u;
      }
    }
    for (const ck of ["primaryCtaBackgroundColor", "primaryCtaTextColor"] as const) {
      const v = coerceString(br[ck]);
      if (!v) continue;
      if (!/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/i.test(v)) {
        delete br[ck];
        warnings.push(`Stripped invalid branding.${ck}`);
      } else {
        br[ck] = v.toLowerCase();
      }
    }
    if (Object.keys(b).length > 0) out.branding = b;
  }

  if (root.content !== undefined) {
    const c = pickStrings(asRecord(root.content), CONTENT_KEYS, "content", warnings);
    const cr = asRecord(root.content);
    const items = sanitizeBenefitsItems(cr.benefitsItems, warnings);
    if (items) c.benefitsItems = items;
    if (Object.keys(c).length > 0) out.content = c;
  }

  if (root.contact !== undefined) {
    const c = pickStrings(asRecord(root.contact), CONTACT_KEYS, "contact", warnings);
    if (Object.keys(c).length > 0) out.contact = c;
  }

  if (root.seo !== undefined) {
    const s = pickStrings(asRecord(root.seo), SEO_KEYS, "seo", warnings);
    if (Object.keys(s).length > 0) out.seo = s;
  }

  if (root.layout !== undefined) {
    const inner = asRecord(root.layout);
    if (inner.featuredCarIds !== undefined) {
      warnings.push("Stripped layout.featuredCarIds (not inferred from screenshots)");
    }
    if (inner.sectionStyles !== undefined && !options?.allowLayoutSectionStyles) {
      warnings.push("Stripped layout.sectionStyles (use builder for per-section styles)");
    }
    const l = sanitizeLayout(inner, warnings, { allowSectionStyles: options?.allowLayoutSectionStyles === true });
    if (l) out.layout = l;
  }

  return out;
}

export function extractJsonObjectFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(trimmed);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  const slice = body.slice(start, end + 1);
  return JSON.parse(slice) as unknown;
}

export type ExtractTenantSiteFromScreenshotResult = {
  payload: Record<string, unknown>;
  warnings: string[];
  notes: string[];
};

/**
 * Calls Claude with the screenshot and returns a sanitized import-shaped object (no DB writes).
 */
export async function extractTenantSiteFromScreenshot(params: {
  imageBase64: string;
  mediaType: string;
}): Promise<ExtractTenantSiteFromScreenshotResult> {
  const warnings: string[] = [];
  const notes: string[] = [
    "Output restricted to branding/content/contact/seo/layout import buckets.",
    "Section keys normalized to tenant home section vocabulary.",
  ];

  const instruction = `You are analyzing a single screenshot of a car-dealership or business homepage.
Return ONE JSON object only (no markdown, no prose). Keys allowed at top level: branding, content, contact, seo, layout — use only keys you can infer; omit empty objects.

Rules:
- branding: optional strings primaryColor, secondaryColor, accentColor as #rrggbb hex if visible; optional siteName, displayName, businessName as plain text.
- content: optional heroTitle, heroSubtitle, aboutTitle, aboutText, benefitsTitle, benefitsItems (array of short bullet strings), contactTitle, contactSubtitle, financeTitle, financeText, testimonialsTitle, testimonialsText. Use the page language (Hebrew is fine).
- contact: optional phone, whatsapp, email, address, city, facebookUrl, instagramUrl, websiteUrl as shown.
- seo: optional title, description if clearly visible.
- layout: optional homeSections as array of section ids in top-to-bottom reading order. Valid ids ONLY: hero, featuredCars, about, benefits, finance, testimonials, contact, map. Optional booleans showFeaturedCars, showAbout, showBenefits, showFinance, showTestimonials, showContact, showMap when inferable.
- NEVER output image URL fields from this screenshot: branding.heroImageUrl, branding.heroImageUrls, branding.logoUrl, branding.pageBackgroundImageUrl, seo.ogImageUrl (screenshots are style references, not stable CDN assets).
- NEVER include: tenantId, yardUid, sellerUid, dataScope, featuredCarIds, car IDs, Firestore ids, sectionStyles, diagnostics, or nested objects other than the buckets above.`;

  const response = await anthropicClient.messages.create({
    model: CLAUDE_SITE_BUILDER_VISION_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: params.imageBase64,
            },
          },
          { type: "text", text: instruction },
        ],
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = extractJsonObjectFromModelText(text);
  } catch (e) {
    const snippet = text.slice(0, 400);
    console.error("claudeSiteBuilderExtractor: JSON parse failed", e, snippet);
    throw new Error("Model response was not valid JSON");
  }

  const payload = sanitizeAiTenantSiteImportPayload(parsed, warnings);
  if (Object.keys(payload).length === 0) {
    warnings.push("Sanitized payload is empty after extraction");
  }

  const bStrip = payload.branding && typeof payload.branding === "object" ? { ...(payload.branding as Record<string, unknown>) } : null;
  if (bStrip) {
    if (bStrip.heroImageUrl) {
      delete bStrip.heroImageUrl;
      warnings.push("Removed branding.heroImageUrl from screenshot import (screenshots are not stable hero assets).");
    }
    if (bStrip.heroImageUrls) {
      delete bStrip.heroImageUrls;
      warnings.push("Removed branding.heroImageUrls from screenshot import (screenshots are not stable hero assets).");
    }
    if (bStrip.pageBackgroundImageUrl) {
      delete bStrip.pageBackgroundImageUrl;
      warnings.push("Removed branding.pageBackgroundImageUrl from screenshot import.");
    }
    if (bStrip.logoUrl) {
      delete bStrip.logoUrl;
      warnings.push("Removed branding.logoUrl from screenshot import (logos must be uploaded explicitly).");
    }
    if (Object.keys(bStrip).length === 0) delete payload.branding;
    else payload.branding = bStrip;
  }

  return { payload, warnings, notes };
}
