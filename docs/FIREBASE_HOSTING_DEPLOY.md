# Firebase Hosting — sites, deploy commands, tenant domains

Project: `carexpert-94faa` (see `.firebaserc`).

## Two Hosting sites (not interchangeable)

| Site ID           | Default URL                         | Role |
|-------------------|-------------------------------------|------|
| `carexpert-94faa` | https://carexpert-94faa.web.app     | **Primary.** Full rewrites (sitemaps, SEO Cloud Functions, SPA). **Attach customer tenant custom domains here.** |
| `yardsite`        | https://yardsite.web.app            | **Secondary.** Same `web/dist` build, **fewer** rewrites. Use only if you intentionally want this slice. **Does not** update `*.web.app` for the default site. |

Configuration lives in `firebase.json` → `hosting[]` entries, each with a **`site`** field (Firebase CLI does not allow `site` + `target` together in the same block).

## Exact deploy commands

**Production (default URL + tenant domains on the primary site):**

```bash
firebase deploy --only hosting:carexpert-94faa
```

**Secondary site only:**

```bash
firebase deploy --only hosting:yardsite
```

**Both sites** (runs predeploy for **each** site — two builds; yardsite’s predeploy is build-only to avoid duplicate SEO guard runs):

```bash
firebase deploy --only hosting
```

**Local build without deploy:**

```bash
cd web && npm run build
```

Artifacts must exist at **`web/dist/index.html`** (Vite output). Both sites use `"public": "web/dist"`.

## Why the default URL showed “Page Not Found”

The default URL (`carexpert-94faa.web.app`) maps to site **`carexpert-94faa`**. If you only run `firebase deploy --only hosting:yardsite` (or only the second site is released), **`yardsite.web.app`** updates while **`carexpert-94faa.web.app`** stays empty or stale → Firebase’s “no `index.html`” / 404 style response.

Always deploy **`hosting:carexpert-94faa`** when you want the primary app and default project URL updated.

## SPA rewrites

Both configs end with a catch-all `**` → `/index.html`. The primary site adds route-specific rewrites **before** that rule (sitemaps, `/car/**`, `/admin` is client-side only — no hosting rewrite required for `/admin/**`).

## Legacy note

Older docs referred to CLI **targets** `main` / `yardsite` in `.firebaserc`. Deploy identifiers are now the **site IDs** above, matching `firebase.json` `site` fields.
