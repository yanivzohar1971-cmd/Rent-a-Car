# Tenant site config — canonical import contract

This document is the developer-facing contract for **Website Builder** persistence, **Theme Carousel** apply payloads, and future **Screenshot → JSON** extraction. Runtime behavior is implemented in:

- `web/src/tenant/tenantSiteConfig.ts` — normalize / parse (tolerant reads)
- `web/src/tenant/tenantSiteConfigImport.ts` — **strict import boundary** (AI, carousel, extraction)
- `web/src/api/tenantSiteConfigsApi.ts` — Firestore `tenantSiteConfigs/{tenantId}` merge writes

## 1. Firestore document shape (top level)

Persisted buckets (each optional, `Record<string, unknown>` at the API edge):

| Key          | Role |
|-------------|------|
| `tenantId`  | Document id mirror (client type only; not a merge field from imports) |
| `branding`  | Name, colors, `themeVariant`, nested `theme` (pack, accent, snapshot, section defaults patch) |
| `content`   | Homepage copy |
| `contact`   | Contact + social URLs |
| `seo`       | `title`, `description`, `ogImageUrl` |
| `layout`    | Section order, visibility flags, `sectionStyles`, inheritance maps, `featuredCarIds` |
| `dataScope` | `yardUid` / `sellerUid` (aliases `yardId` / `sellerId` accepted at read) |

Legacy: root `brand` (name, logo) is still read inside `normalizeTenantSiteConfig`, but the REST client does not surface it; imports map `brand` → `branding` where possible.

## 2. Normalized vs persisted vs derived

| Layer | Description |
|-------|-------------|
| **Persisted (Firestore)** | Loose records above; may omit keys or hold legacy aliases. |
| **Normalized (`NormalizedTenantSiteConfig`)** | Output of `normalizeTenantSiteConfig`: typed defaults, coerced enums, parsed theme snapshot, merged inheritance maps. Still **not** “effective” section chrome. |
| **Effective section style** | `resolveEffectiveSectionStyle` / `resolveEffectiveSectionStylesRecord`: pack + `branding.theme.sectionDefaults` + stored `layout.sectionStyles` + inheritance + virtual Hive accent. **Never write this back** as the stored `sectionStyles` unless the user explicitly broke inheritance and materialized values (builder does this on “break from theme”). |
| **Runtime branding UI model** | `tenantBrandingFromNormalized` + `finalizeTenantRuntimeBranding`: yard/tenant fallbacks; `theme` token object is **not** a Firestore blob. |

### Preview-only (builder)

- Hero focal point (`heroFocalX` / `heroFocalY`) is **local UI state**; it is not part of `tenantSiteConfigs`.

### Import must not set

- Any bucket named like diagnostics: `effective`, `resolved`, `preview`, `normalized`, `hive`, etc. (stripped with `forbidden` issues in `tenantSiteConfigImport.ts`).
- Effective Hive palettes, merged “final sectionStyles”, or runtime-only branding tokens.

## 3. `branding.theme` (canonical nested)

Allowed keys for **import** and **carousel**:

- `siteThemePackKey` — must match `getThemeBrandPresetByKey` or is nulled.
- `sectionDefaults` — partial subset of section style fields (no Hive keys): `backgroundMode`, `textTone`, `align`, `layoutVariant`, `paddingDensity`, `cardStyle`. Parsed via `parseSiteThemeSectionDefaultsObject`.
- `accentStrategy` — `parsePersistedThemeAccentStrategy` / `serializeThemeAccentStrategyForFirestore`.
- `appliedThemeSnapshot` — frozen pack colors + defaults; parsed via `parseAppliedThemeSnapshot` and must match `siteThemePackKey` to stay active.

**Canonical:** `sectionDefaults` is fully supported in normalize, `flattenEffectiveThemeSectionDefaults`, builder preview (via synthetic config), save, and live rendering. The builder now **round-trips** `sectionDefaults` in form state so preview and save stay aligned with normalization.

## 4. `layout` (importable)

- `homeSections` — array of known section keys; unknown keys dropped (`TENANT_HOME_SECTION_KEYS`).
- `showFeaturedCars`, `showAbout`, `showBenefits`, `showFinance`, `showTestimonials`, `showContact`, `showMap` — booleans.
- `featuredCarIds` — string[] (legacy carousel fallback).
- `sectionStyles` — per `TenantHomeSectionKey`; values sanitized with `normalizeTenantSectionStyle` + capabilities.
- `sectionInheritsSiteTheme` / `Style` / `Accent` — maps; only `true` entries for non-hero keys kept.

## 5. Enum source of truth

Use the exported **canonical arrays** (never duplicate ad hoc unions for import/carousel):

- `TENANT_HOME_SECTION_KEYS` + `CANONICAL_TENANT_THEME_VARIANTS`
- `CANONICAL_TENANT_SECTION_BACKGROUND_MODES`, `CANONICAL_TENANT_SECTION_TEXT_TONES`, `CANONICAL_TENANT_SECTION_ALIGNS`, `CANONICAL_TENANT_SECTION_LAYOUT_VARIANTS`, `CANONICAL_TENANT_SECTION_PADDING_DENSITIES`, `CANONICAL_TENANT_SECTION_CARD_STYLES`
- `CANONICAL_THEME_ACCENT_STRATEGY_MODES`, `CANONICAL_THEME_ACCENT_TARGET_SCOPES`, `CANONICAL_THEME_ACCENT_INTENSITIES` (`themeAccentStrategy.ts`)

## 6. Import API usage

1. `coerceImportedTenantSiteConfig(unknown)` → `{ patch, issues }`  
   - **Partial** `TenantSiteConfigWritePayload`; unknown keys stripped.
2. `mergeTenantSiteConfigWritePayload(existingDoc, patch)` — safe merge for partial imports (deep-merge `branding.theme`, `layout.sectionStyles`, inheritance maps).
3. `normalizeTenantSiteConfigImport(input, tenantId, existing?)` — preview normalized output after merge.
4. `validateTenantSiteConfigImport` — alias of issues from coerce.

**AI and carousel:** Never assign raw JSON into React builder state. Pass through `coerceImportedTenantSiteConfig` (and merge with loaded doc when applying partial patches).

**Screenshot extraction:** Target `ScreenshotDerivedSiteConfigImportInput` (`branding` + `content` + `layout` only). Store OCR confidence and model metadata **outside** `tenantSiteConfigs`.

## 7. Theme carousel payload

Type: `ThemeCarouselApplyImportInput` = `Pick<TenantSiteConfigWritePayload, 'branding' | 'layout'>`.  
Allowed writes: theme pack key, `sectionDefaults`, accent strategy, applied snapshot (when applying a template), `homeSections`, `sectionStyles` overrides, inheritance flags, layout toggles. Same allowlist as `tenantSiteConfigImport.ts`.

## 8. Backward compatibility

- Normalize remains tolerant: missing buckets, legacy `brand`, legacy `featuredCars` arrays, single-map inheritance.
- Import remains strict on allowlists but does not require migrations.
- Invalid enums and section keys sanitize to defaults or drop with `issues` logged.
