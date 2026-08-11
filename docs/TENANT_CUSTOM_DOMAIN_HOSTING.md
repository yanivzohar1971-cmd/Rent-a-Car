# Tenant custom domains + Firebase Hosting (go-live)

This app is a **single-page application (SPA)**. One Firebase Hosting site serves **all** hostnames attached to it; **which tenant** is shown is decided at **runtime** from `window.location.hostname` and Firestore **`tenantDomains`**.

## 1. Repo / Hosting readiness

- **Build output:** `web/dist` (see `firebase.json` → `hosting[].public`).
- **SPA fallback:** the last rewrite sends **`**` → `/index.html`**, so deep links (`/cars`, `/cars/:id`, `/admin/...`) work on refresh.
- **Earlier rewrites** (sitemaps, `robots.txt`, selected `function` routes) stay **before** the catch-all; do not remove them without checking traffic.
- **Sites:** `carexpert-94faa` (default `*.web.app` for the project) is the **correct** Hosting site for production tenant domains such as **`srk.co.il`** — full rewrites and predeploy. Site `yardsite` uses the same `web/dist` but **fewer** rewrites; avoid attaching tenant customer domains there unless intentional (see `firebase.json` and `docs/FIREBASE_HOSTING_DEPLOY.md`).

## 2. Connect a customer domain (operator)

1. **Firebase Console** → **Hosting** → select the correct **site / target** → **Add custom domain** (e.g. `srk.co.il`, `www.srk.co.il`).
2. Complete **DNS** steps the console shows (A/AAAA or CNAME). No registrar automation is in this repo.
3. Wait for **SSL provisioning** (Firebase-managed).
4. Deploy the current `web` build to that Hosting site (`firebase deploy --only hosting:carexpert-94faa` or your CI).

## 3. Firestore mapping

1. In **`tenantDomains`**, create/update a document whose **ID is the normalized hostname** (as your app already expects — see existing domain admin and hostname resolver docs).
2. Set **`tenantId`** and keep **`enabled`** / **`isActive`** true (either field `false` disables resolution). Disabled or missing mappings must **not** resolve as an active tenant site.
3. Deploy **Firestore rules** when updating access for `tenantDomains` / `tenantSiteConfigs` (`firebase deploy --only firestore:rules`). Anonymous users must be able to **get** the mapped docs for the storefront to resolve.

## 4. Tenant config and inventory

1. Open **Website Builder**: `/admin/tenant-site-builder`.
2. Confirm **`tenantSiteConfigs/{tenantId}`** exists (or save to create merged fields).
3. Set **`dataScope.yardUid`** (or **`sellerUid`** if used) so **only that inventory** appears on the tenant host.
4. Configure branding, content, layout, SEO, contact; use **media upload** for logo/hero/OG (Storage path `tenantSiteAssets/{tenantId}/...`, rules require **admin** token). After pulling repo changes, deploy rules once: `firebase deploy --only storage`.

## 5. Test on the live hostname

Use a private window or DNS that already points to Hosting.

## 6. Go-live checklist (e.g. `srk.co.il`)

Step-by-step for **`srk.co.il`**: `docs/TENANT_CUSTOM_DOMAIN_GO_LIVE_SRK_CO_IL.md`.

- [ ] Domain **DNS** points to Firebase Hosting as instructed in Console.
- [ ] Hosting serves the app (no stale project/site).
- [ ] **`tenantDomains`** has hostname → correct **`tenantId`**, active (**`enabled`** / **`isActive`**).
- [ ] **`tenantSiteConfigs/{tenantId}.dataScope.yardUid`** (or seller scope) is correct.
- [ ] **Website Builder**: load tenant → save after edits; **Storage rules deployed** if using media upload (`firebase deploy --only storage`).
- [ ] Homepage **branding** and **section order** match builder (hard-refresh after save).
- [ ] **`/cars`** lists **only** tenant-scoped cars.
- [ ] **Car detail** (`/cars/:id`) for a car **outside** tenant scope shows **not found** / no data leak.
- [ ] **Disabled** or **unknown** hostname does **not** resolve as an active tenant storefront.
- [ ] **Firestore rules** deployed if `tenantDomains` / `tenantSiteConfigs` access was changed.

## Related docs

- `docs/TENANT_SITE_ENGINE.md` — Firestore contract and public rendering.
- Existing tenant hostname / domain operations docs in `docs/` (if present).
