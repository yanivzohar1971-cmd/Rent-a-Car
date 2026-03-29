# Tenant site engine

Firestore document **`tenantSiteConfigs/{tenantId}`** drives the public experience for custom domains mapped in **`tenantDomains`** (hostname → `tenantId`, `enabled`).

## Connection flow

1. Browser hostname resolves via `tenantDomains` and loads `tenantSiteConfigs/{tenantId}`.
2. `TenantContext` + `normalizeTenantSiteConfig()` expose branding, content, contact, SEO, layout, and `dataScope`.
3. **`dataScope.yardUid`** (or `yardId`) / **`sellerUid`** scopes inventory (`useTenantInventoryScope`); without a valid scope, tenant hosts do not show marketplace inventory.

## Field groups (contract)

| Group | Purpose |
|--------|---------|
| **branding** | `siteName`, `displayName`, `logoUrl`, `heroImageUrl`, `primaryColor`, `secondaryColor`, `accentColor`, `textColor`, `backgroundColor`, `themeVariant` (`classic` / `modern` / `luxury` / `minimal`). Legacy `brand.*` still supported where previously documented. |
| **content** | Homepage copy: `heroTitle`, `heroSubtitle`, `heroCtaText`, `heroCtaLink` (`/path` or `https://…`), `aboutTitle`, `aboutText` (or legacy `about`), `benefitsTitle`, `benefitsItems` (array of strings), `financeTitle`, `financeText`, `contactTitle`, `contactSubtitle`, `testimonialsTitle`, `testimonialsText`. |
| **contact** | `phone`, `whatsapp`, `email`, `address`, `city`, `facebookUrl`, `instagramUrl`, `websiteUrl`. |
| **seo** | `title`, `description`, `ogImageUrl` (client-side meta updates on tenant host). |
| **layout** | `homeSections` (ordered list of section keys), plus booleans: `showFeaturedCars`, `showAbout`, `showBenefits`, `showFinance`, `showTestimonials`, `showContact`, `showMap`. Optional `variant` / `themeVariant` on `layout` also map to theme variant if `branding.themeVariant` is absent. |
| **dataScope** | `yardUid` / `yardId`, `sellerUid` / `sellerId` — inventory scope for the tenant domain. |

### Homepage section keys

Allowed `layout.homeSections` values (ordered in **Website Builder** admin, drag-and-drop):

`hero`, `featuredCars`, `about`, `benefits`, `finance`, `testimonials`, `contact`, `map`

If the array is missing or empty in Firestore, a default order is used. Section toggles can hide groups even if they appear in the list.

## Code entry points

- Normalization: `web/src/tenant/tenantSiteConfig.ts` — `normalizeTenantSiteConfig()`, validators.
- Hook: `web/src/hooks/useTenantSiteConfig.ts` — `useTenantSiteConfig()` for public UI.
- Branding CSS variables + meta: `web/src/components/tenant/TenantBrandingRuntime.tsx`.
- Homepage sections: `web/src/components/tenant/TenantHomeBlocks.tsx` (renders via `TenantHomeSectionsView`).
- Admin: **`/admin/tenant-site-builder`** — Website Builder (preview, section order, media upload, merge write). Legacy **`/admin/tenant-site-config`** redirects here.
- Tenant media (admin upload): Firebase Storage `tenantSiteAssets/{tenantId}/…` → URLs stored in `branding` / `seo`.

## Onboarding a new customer site (ADMIN)

1. **Connect domain** — create / enable `tenantDomains` (see **Tenant Domains** admin).
2. Ensure **`tenantSiteConfigs/{tenantId}`** exists or create it via **Website Builder**.
3. Set **`dataScope.yardUid`** (or `sellerUid` if applicable) so listings are scoped.
4. Configure **branding**, **content**, **layout** (`homeSections` + toggles), **contact**, and **seo**.
5. Open the live tenant hostname and verify homepage sections, inventory-only listings, and `/cars` / car detail pages.

## Fallbacks

- Missing or partial config: public tenant site still renders; defaults apply; no hard dependency on every field.
- Missing inventory scope: tenant host keeps fail-safe scoping (no marketplace leak).

## Hosting + custom domains

See **`docs/TENANT_CUSTOM_DOMAIN_HOSTING.md`** for Firebase Hosting SPA notes and an operator checklist (e.g. `srk.co.il`).
