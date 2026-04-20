import { anthropicClient } from "./anthropicClient";

/** Vision-capable model for layout/colors/text extraction from screenshots (not the smoke-test model). */
export const CLAUDE_SITE_BUILDER_VISION_MODEL = "claude-3-5-sonnet-20241022";

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
  "heroImageUrl",
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

function sanitizeLayout(layoutRaw: unknown, warnings: string[]): Record<string, unknown> | undefined {
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

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Strips unsupported keys and inventory-style data from a parsed JSON object before returning to clients.
 * Client still runs coerceImportedTenantSiteConfig.
 */
export function sanitizeAiTenantSiteImportPayload(
  parsed: unknown,
  warnings: string[],
): Record<string, unknown> {
  const root = asRecord(parsed);
  const out: Record<string, unknown> = {};

  for (const k of Object.keys(root)) {
    if (!TOP_LEVEL_KEYS.has(k)) {
      warnings.push(`Removed top-level key: ${k}`);
    }
  }

  if (root.branding !== undefined) {
    const b = pickStrings(asRecord(root.branding), BRANDING_KEYS, "branding", warnings);
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
    if (inner.sectionStyles !== undefined) {
      warnings.push("Stripped layout.sectionStyles (use builder for per-section styles)");
    }
    const l = sanitizeLayout(inner, warnings);
    if (l) out.layout = l;
  }

  return out;
}

function extractJsonObjectFromModelText(text: string): unknown {
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

  return { payload, warnings, notes };
}
