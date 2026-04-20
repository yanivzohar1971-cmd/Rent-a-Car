/**
 * Single safe boundary for external/generated JSON → Firestore-shaped tenant site config.
 * @see docs/TENANT_SITE_CONFIG_IMPORT_CONTRACT.md
 */
import type { TenantSiteConfig, TenantSiteConfigWritePayload } from '../api/tenantSiteConfigsApi';
import { applyTenantSiteImportContrastGuardrails } from './tenantSiteImportContrast';
import { getThemeBrandPresetByKey } from './themeBrandPresets';
import {
  parsePersistedThemeAccentStrategy,
  serializeThemeAccentStrategyForFirestore,
} from './themeAccentStrategy';
import {
  parseAppliedThemeSnapshot,
  parseHomeSectionsList,
  parseSiteThemeSectionDefaultsObject,
  serializeAppliedThemeSnapshotForFirestore,
  serializeSiteThemeSectionDefaultsForFirestore,
  normalizeTenantSiteConfig,
  normalizeTenantSectionStylesRecord,
  TENANT_HOME_SECTION_KEYS,
  type NormalizedTenantSiteConfig,
} from './tenantSiteConfig';

export type TenantSiteConfigImportIssueSeverity = 'strip' | 'sanitize' | 'forbidden';

export type TenantSiteConfigImportIssue = {
  severity: TenantSiteConfigImportIssueSeverity;
  path: string;
  message: string;
};

const TOP_LEVEL_ALLOWED = new Set([
  'branding',
  'content',
  'contact',
  'seo',
  'layout',
  'dataScope',
  'brand',
  'tenantId',
]);

const BRANDING_KEYS = new Set([
  'siteName',
  'displayName',
  'logoUrl',
  'heroImageUrl',
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'textColor',
  'backgroundColor',
  'themeVariant',
  'businessName',
  'theme',
]);

const THEME_NESTED_KEYS = new Set(['siteThemePackKey', 'sectionDefaults', 'accentStrategy', 'appliedThemeSnapshot']);

const CONTENT_KEYS = new Set([
  'heroTitle',
  'heroSubtitle',
  'heroCtaText',
  'heroCtaLink',
  'aboutTitle',
  'aboutText',
  'about',
  'benefitsTitle',
  'benefitsItems',
  'financeTitle',
  'financeText',
  'contactTitle',
  'contactSubtitle',
  'testimonialsTitle',
  'testimonialsText',
  'siteName',
  'businessName',
  'featuredCars',
]);

const CONTACT_KEYS = new Set([
  'phone',
  'whatsapp',
  'email',
  'address',
  'city',
  'facebookUrl',
  'instagramUrl',
  'websiteUrl',
]);

const SEO_KEYS = new Set(['title', 'description', 'ogImageUrl']);

const LAYOUT_KEYS = new Set([
  'homeSections',
  'showFeaturedCars',
  'showAbout',
  'showBenefits',
  'showFinance',
  'showTestimonials',
  'showContact',
  'showMap',
  'featuredCarIds',
  'sectionStyles',
  'sectionInheritsSiteTheme',
  'sectionInheritsSiteThemeStyle',
  'sectionInheritsSiteThemeAccent',
  'variant',
  'themeVariant',
]);

const DATA_SCOPE_KEYS = new Set(['yardUid', 'yardId', 'sellerUid', 'sellerId']);

const BRAND_LEGACY_ROOT_KEYS = new Set(['name', 'logoUrl']);

/** Virtual / diagnostic buckets must never be written to Firestore from imports. */
const FORBIDDEN_TOP_LEVEL = new Set([
  'effective',
  'resolved',
  'preview',
  'diagnostics',
  'normalized',
  'rawSnapshot',
  'hive',
  'runtime',
]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function pickAllowlisted(source: Record<string, unknown>, allowed: Set<string>, path: string, issues: TenantSiteConfigImportIssue[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    if (!allowed.has(k)) {
      issues.push({ severity: 'strip', path: `${path}.${k}`, message: 'Unknown key removed from import' });
      continue;
    }
    out[k] = v;
  }
  return out;
}

function coerceString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function sanitizeBrandingTheme(
  raw: unknown,
  path: string,
  issues: TenantSiteConfigImportIssue[],
): Record<string, unknown> | undefined {
  const t = asRecord(raw);
  const picked = pickAllowlisted(t, THEME_NESTED_KEYS, path, issues);
  const out: Record<string, unknown> = {};

  const packRaw = picked.siteThemePackKey;
  if (packRaw !== undefined) {
    const s = coerceString(packRaw) ?? null;
    if (s && !getThemeBrandPresetByKey(s)) {
      issues.push({ severity: 'sanitize', path: `${path}.siteThemePackKey`, message: 'Invalid siteThemePackKey dropped' });
      out.siteThemePackKey = null;
    } else {
      out.siteThemePackKey = s;
    }
  }

  if (picked.sectionDefaults !== undefined) {
    const sd = serializeSiteThemeSectionDefaultsForFirestore(
      parseSiteThemeSectionDefaultsObject(picked.sectionDefaults),
    );
    if (sd) out.sectionDefaults = sd;
    else if (picked.sectionDefaults != null && typeof picked.sectionDefaults === 'object') {
      issues.push({ severity: 'sanitize', path: `${path}.sectionDefaults`, message: 'sectionDefaults had no valid fields' });
    }
  }

  if (picked.accentStrategy !== undefined) {
    const parsed = parsePersistedThemeAccentStrategy(picked.accentStrategy);
    const ser = serializeThemeAccentStrategyForFirestore(parsed);
    out.accentStrategy = ser;
  }

  if (picked.appliedThemeSnapshot !== undefined) {
    const parsed = parseAppliedThemeSnapshot(picked.appliedThemeSnapshot);
    out.appliedThemeSnapshot = parsed ? serializeAppliedThemeSnapshotForFirestore(parsed) : null;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeLayoutSectionStyles(raw: unknown, issues: TenantSiteConfigImportIssue[]): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  const rec = asRecord(raw);
  const slim: Record<string, unknown> = {};
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k in rec) slim[k] = rec[k];
  }
  for (const k of Object.keys(rec)) {
    if (!TENANT_HOME_SECTION_KEYS.includes(k as (typeof TENANT_HOME_SECTION_KEYS)[number])) {
      issues.push({ severity: 'strip', path: `layout.sectionStyles.${k}`, message: 'Unknown section key removed' });
    }
  }
  return normalizeTenantSectionStylesRecord(slim) as unknown as Record<string, unknown>;
}

function sanitizeInheritMap(raw: unknown, path: string, issues: TenantSiteConfigImportIssue[]): Record<string, boolean> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ severity: 'sanitize', path, message: 'Inheritance map ignored (not an object)' });
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const k of TENANT_HOME_SECTION_KEYS) {
    if (k === 'hero') continue;
    if (o[k] === true) out[k] = true;
  }
  return Object.keys(out).length > 0 ? out : {};
}

function coerceLayout(layoutRaw: unknown, issues: TenantSiteConfigImportIssue[]): Record<string, unknown> | undefined {
  const layout = asRecord(layoutRaw);
  if (Object.keys(layout).length === 0) return undefined;
  const picked = pickAllowlisted(layout, LAYOUT_KEYS, 'layout', issues);
  const out: Record<string, unknown> = {};

  if (picked.homeSections !== undefined) {
    const before = Array.isArray(picked.homeSections)
      ? (picked.homeSections as unknown[]).filter((x) => typeof x === 'string').length
      : 0;
    const after = parseHomeSectionsList(picked.homeSections).length;
    if (before !== after && Array.isArray(picked.homeSections)) {
      issues.push({ severity: 'sanitize', path: 'layout.homeSections', message: 'Invalid or duplicate section keys removed' });
    }
    out.homeSections = parseHomeSectionsList(picked.homeSections);
  }

  for (const k of [
    'showFeaturedCars',
    'showAbout',
    'showBenefits',
    'showFinance',
    'showTestimonials',
    'showContact',
    'showMap',
  ] as const) {
    if (picked[k] !== undefined) {
      out[k] = typeof picked[k] === 'boolean' ? picked[k] : Boolean(picked[k]);
    }
  }

  if (picked.featuredCarIds !== undefined) {
    if (Array.isArray(picked.featuredCarIds)) {
      const ids = (picked.featuredCarIds as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim());
      out.featuredCarIds = ids;
    } else {
      issues.push({ severity: 'sanitize', path: 'layout.featuredCarIds', message: 'featuredCarIds must be an array' });
    }
  }

  const styles = sanitizeLayoutSectionStyles(picked.sectionStyles, issues);
  if (styles !== undefined) out.sectionStyles = styles;

  const leg = sanitizeInheritMap(picked.sectionInheritsSiteTheme, 'layout.sectionInheritsSiteTheme', issues);
  if (leg !== undefined) out.sectionInheritsSiteTheme = leg;

  const st = sanitizeInheritMap(picked.sectionInheritsSiteThemeStyle, 'layout.sectionInheritsSiteThemeStyle', issues);
  if (st !== undefined) out.sectionInheritsSiteThemeStyle = st;

  const ac = sanitizeInheritMap(picked.sectionInheritsSiteThemeAccent, 'layout.sectionInheritsSiteThemeAccent', issues);
  if (ac !== undefined) out.sectionInheritsSiteThemeAccent = ac;

  if (picked.variant !== undefined && coerceString(picked.variant)) out.variant = coerceString(picked.variant);
  if (picked.themeVariant !== undefined && coerceString(picked.themeVariant)) out.themeVariant = coerceString(picked.themeVariant);

  return Object.keys(out).length > 0 ? out : undefined;
}

function coerceBranding(brandingRaw: unknown, issues: TenantSiteConfigImportIssue[]): Record<string, unknown> | undefined {
  const b = asRecord(brandingRaw);
  if (Object.keys(b).length === 0) return undefined;
  const picked = pickAllowlisted(b, BRANDING_KEYS, 'branding', issues);
  const out: Record<string, unknown> = {};

  for (const k of [
    'siteName',
    'displayName',
    'logoUrl',
    'heroImageUrl',
    'primaryColor',
    'secondaryColor',
    'accentColor',
    'textColor',
    'backgroundColor',
    'themeVariant',
    'businessName',
  ] as const) {
    if (picked[k] !== undefined) {
      const s = coerceString(picked[k]);
      if (s) out[k] = s;
    }
  }

  if (picked.theme !== undefined) {
    const theme = sanitizeBrandingTheme(picked.theme, 'branding.theme', issues);
    if (theme) out.theme = theme;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function shallowScalarBucket(
  raw: unknown,
  keys: Set<string>,
  path: string,
  issues: TenantSiteConfigImportIssue[],
): Record<string, unknown> | undefined {
  const o = asRecord(raw);
  if (Object.keys(o).length === 0) return undefined;
  return pickAllowlisted(o, keys, path, issues);
}

export type CoerceImportedTenantSiteConfigResult = {
  /** Sanitized partial payload; merge with an existing doc before `upsertTenantSiteConfig` unless replacing the full bucket via builder. */
  patch: TenantSiteConfigWritePayload;
  issues: TenantSiteConfigImportIssue[];
};

/**
 * Validates and sanitizes external JSON into a partial {@link TenantSiteConfigWritePayload}.
 * Strips unknown keys, forbids obvious virtual/diagnostic top-level buckets, and re-serializes theme objects through parsers.
 */
export function coerceImportedTenantSiteConfig(input: unknown): CoerceImportedTenantSiteConfigResult {
  const issues: TenantSiteConfigImportIssue[] = [];
  const root = asRecord(input);
  const patch: TenantSiteConfigWritePayload = {};

  for (const k of Object.keys(root)) {
    if (FORBIDDEN_TOP_LEVEL.has(k)) {
      issues.push({ severity: 'forbidden', path: k, message: 'Virtual/diagnostic top-level key blocked from import' });
    }
  }

  for (const k of Object.keys(root)) {
    if (!TOP_LEVEL_ALLOWED.has(k) && !FORBIDDEN_TOP_LEVEL.has(k)) {
      issues.push({ severity: 'strip', path: k, message: 'Unknown top-level key removed from import' });
    }
  }

  if (root.branding !== undefined) {
    const b = coerceBranding(root.branding, issues);
    if (b) patch.branding = b;
  }

  if (root.content !== undefined) {
    const c = shallowScalarBucket(root.content, CONTENT_KEYS, 'content', issues);
    if (c && Object.keys(c).length > 0) patch.content = c;
  }

  if (root.contact !== undefined) {
    const c = shallowScalarBucket(root.contact, CONTACT_KEYS, 'contact', issues);
    if (c && Object.keys(c).length > 0) patch.contact = c;
  }

  if (root.seo !== undefined) {
    const s = shallowScalarBucket(root.seo, SEO_KEYS, 'seo', issues);
    if (s && Object.keys(s).length > 0) patch.seo = s;
  }

  if (root.layout !== undefined) {
    const l = coerceLayout(root.layout, issues);
    if (l) patch.layout = l;
  }

  if (root.dataScope !== undefined) {
    const d = shallowScalarBucket(root.dataScope, DATA_SCOPE_KEYS, 'dataScope', issues);
    if (d && Object.keys(d).length > 0) patch.dataScope = d;
  }

  if (root.brand !== undefined) {
    const legacy = shallowScalarBucket(root.brand, BRAND_LEGACY_ROOT_KEYS, 'brand', issues);
    if (legacy && Object.keys(legacy).length > 0) {
      issues.push({
        severity: 'sanitize',
        path: 'brand',
        message: 'Legacy root `brand` mapped into `branding` (Firestore API omits root `brand` on read)',
      });
      const fold: Record<string, unknown> = { ...(patch.branding ?? {}) };
      const nm = coerceString(legacy.name);
      const lu = coerceString(legacy.logoUrl);
      if (nm) fold.displayName = nm;
      if (lu) fold.logoUrl = lu;
      if (Object.keys(fold).length > 0) patch.branding = fold;
    }
  }

  if (root.tenantId !== undefined) {
    issues.push({ severity: 'strip', path: 'tenantId', message: 'tenantId in import body ignored (use URL/context)' });
  }

  const guardedPatch = applyTenantSiteImportContrastGuardrails(patch);
  return { patch: guardedPatch, issues };
}

/**
 * Deep-merge a sanitized import patch into an existing Firestore-shaped config.
 * Shallow merges per bucket; `branding.theme` and `layout.sectionStyles` merge one level deep.
 */
export function mergeTenantSiteConfigWritePayload(
  existing: TenantSiteConfig | null,
  patch: TenantSiteConfigWritePayload,
): TenantSiteConfigWritePayload {
  const out: TenantSiteConfigWritePayload = {};

  const mergeShallow = (key: 'content' | 'contact' | 'seo' | 'dataScope') => {
    const p = patch[key];
    if (p === undefined) return;
    const base = asRecord(existing?.[key] as unknown);
    out[key] = { ...base, ...asRecord(p as unknown) } as TenantSiteConfigWritePayload[typeof key];
  };

  mergeShallow('content');
  mergeShallow('contact');
  mergeShallow('seo');
  mergeShallow('dataScope');

  if (patch.branding !== undefined) {
    const base = asRecord(existing?.branding as unknown);
    const pb = asRecord(patch.branding as unknown);
    const merged: Record<string, unknown> = { ...base, ...pb };
    if (pb.theme !== undefined || base.theme !== undefined) {
      const bt = asRecord(base.theme);
      const pt = asRecord(pb.theme);
      merged.theme = { ...bt, ...pt };
    }
    out.branding = merged;
  }

  if (patch.layout !== undefined) {
    const base = asRecord(existing?.layout as unknown);
    const pl = asRecord(patch.layout as unknown);
    const merged: Record<string, unknown> = { ...base, ...pl };
    if (pl.sectionStyles !== undefined || base.sectionStyles !== undefined) {
      merged.sectionStyles = {
        ...asRecord(base.sectionStyles),
        ...asRecord(pl.sectionStyles),
      };
    }
    if (pl.sectionInheritsSiteTheme !== undefined || base.sectionInheritsSiteTheme !== undefined) {
      merged.sectionInheritsSiteTheme = {
        ...asRecord(base.sectionInheritsSiteTheme as unknown),
        ...asRecord(pl.sectionInheritsSiteTheme as unknown),
      };
    }
    if (pl.sectionInheritsSiteThemeStyle !== undefined || base.sectionInheritsSiteThemeStyle !== undefined) {
      merged.sectionInheritsSiteThemeStyle = {
        ...asRecord(base.sectionInheritsSiteThemeStyle as unknown),
        ...asRecord(pl.sectionInheritsSiteThemeStyle as unknown),
      };
    }
    if (pl.sectionInheritsSiteThemeAccent !== undefined || base.sectionInheritsSiteThemeAccent !== undefined) {
      merged.sectionInheritsSiteThemeAccent = {
        ...asRecord(base.sectionInheritsSiteThemeAccent as unknown),
        ...asRecord(pl.sectionInheritsSiteThemeAccent as unknown),
      };
    }
    out.layout = merged;
  }

  return out;
}

/** Non-throwing validation entrypoint; always inspect `issues` (especially `forbidden`). */
export function validateTenantSiteConfigImport(input: unknown): { issues: TenantSiteConfigImportIssue[] } {
  return { issues: coerceImportedTenantSiteConfig(input).issues };
}

function syntheticConfigFromWritePayload(tenantId: string, payload: TenantSiteConfigWritePayload): TenantSiteConfig {
  return {
    tenantId,
    branding: payload.branding as TenantSiteConfig['branding'],
    content: payload.content as TenantSiteConfig['content'],
    contact: payload.contact as TenantSiteConfig['contact'],
    seo: payload.seo as TenantSiteConfig['seo'],
    layout: payload.layout as TenantSiteConfig['layout'],
    dataScope: payload.dataScope as TenantSiteConfig['dataScope'],
  };
}

/**
 * Preview normalized config after applying an import patch to optional existing stored config.
 */
export function normalizeTenantSiteConfigImport(
  input: unknown,
  tenantId: string | null,
  existing?: TenantSiteConfig | null,
): { normalized: NormalizedTenantSiteConfig; issues: TenantSiteConfigImportIssue[] } {
  const { patch, issues } = coerceImportedTenantSiteConfig(input);
  const merged = existing ? mergeTenantSiteConfigWritePayload(existing, patch) : patch;
  const tid = tenantId ?? existing?.tenantId ?? null;
  const synthetic = syntheticConfigFromWritePayload(tid ?? 'import-preview', merged);
  return { normalized: normalizeTenantSiteConfig(synthetic, tid), issues };
}

/** Legal Firestore buckets for theme carousel / template apply (subset enforced by {@link coerceImportedTenantSiteConfig}). */
export type ThemeCarouselApplyImportInput = Pick<TenantSiteConfigWritePayload, 'branding' | 'layout'>;

/**
 * AI-assisted builder imports (screenshot vision + URL research) share the same safe buckets.
 * Confidence metadata must stay outside Firestore.
 */
export type ScreenshotDerivedSiteConfigImportInput = Pick<
  TenantSiteConfigWritePayload,
  'branding' | 'content' | 'layout' | 'contact' | 'seo'
>;

/**
 * DEV-only: log import coercion summary. Does nothing in production builds.
 */
export function devLogTenantSiteConfigImport(result: CoerceImportedTenantSiteConfigResult, label?: string): void {
  if (typeof import.meta === 'undefined' || !import.meta.env?.DEV) return;
  console.debug(`[tenantSiteConfigImport]${label ? ` ${label}` : ''}`, {
    patchKeys: Object.keys(result.patch),
    issueCount: result.issues.length,
    issues: result.issues,
  });
}
