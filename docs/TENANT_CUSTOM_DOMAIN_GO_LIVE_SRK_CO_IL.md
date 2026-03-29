# Go-live: `srk.co.il` on Firebase Hosting (operator)

Practical steps for the first production tenant domain. Assumes the SPA is already deployed and DNS/SSL are handled in the Firebase Console (no automation in this repo).

## 1. Hosting site

- Use site **`carexpert-94faa`** (default URL **https://carexpert-94faa.web.app**). In `firebase.json` this is the first `hosting` entry with `"site": "carexpert-94faa"`.
- **Do not** attach `srk.co.il` to site **`yardsite`** unless you deliberately want the reduced rewrite set (second `hosting` block in `firebase.json`).

Deploy after a fresh build (predeploy runs build + SEO checks on this site):

```bash
firebase deploy --only hosting:carexpert-94faa
```

See **`docs/FIREBASE_HOSTING_DEPLOY.md`** for why `yardsite.web.app` can work while the default URL 404s if you only deploy the secondary site.

## 2. Custom domain + DNS + SSL (Firebase Console)

1. Firebase Console → **Hosting** → site **`carexpert-94faa`** → **Add custom domain**.
2. Add **`srk.co.il`** and complete the **A/AAAA** or **CNAME** records Firebase shows.
3. Optionally add **`www.srk.co.il`** the same way (separate hostname in Console; Firebase issues its own cert).
4. Wait until the Console shows the certificate as **Connected** / active.

## 3. Firestore: `tenantDomains`

Add mappings via **`/admin/tenant-domains`** (or Console) so the **document ID** is the normalized hostname.

- **`tenantDomains/srk.co.il`** — required if traffic hits the apex host.
- **`tenantDomains/www.srk.co.il`** — add **only if** you serve traffic on `www` and want it to resolve without relying on a single canonical host in Firebase.

Each document (existing contract):

| Field        | Purpose                                      |
|-------------|-----------------------------------------------|
| `tenantId`  | Must match `tenantSiteConfigs` doc id         |
| `enabled`   | `false` disables resolution (with `isActive`) |
| `isActive`  | `false` disables resolution (with `enabled`)  |

Runtime resolution tries **`www.` variants** (apex ↔ `www`) when reading `tenantDomains` (see `resolveTenantByHostname` and `resolveTenantByHost`), so a **single** Firestore doc id (e.g. `srk.co.il`) can satisfy visitors on `www.srk.co.il` **if** `www` is attached in Hosting and DNS. For clarity, you may still create **two** `tenantDomains` docs (`srk.co.il` and `www.srk.co.il`) pointing at the same `tenantId`.

## 4. Firestore: `tenantSiteConfigs` + `yardUid`

1. Open **`/admin/tenant-site-builder`**, select the same **`tenantId`** as in `tenantDomains`.
2. Confirm **`tenantSiteConfigs/{tenantId}.dataScope.yardUid`** (or legacy **`yardId`**) is the correct yard. Wrong UID → wrong inventory or empty lists; it does not fall through to another tenant’s cars by design.
3. Save after edits.

## 5. Firestore rules (required for anonymous visitors)

Hostname resolution and site config use **client** `getDoc` on `tenantDomains` and `tenantSiteConfigs`. Suspend / trial banners use **`tenantPublicState/{tenantId}`** (not the full `tenants/{tenantId}` record). After pulling rules, deploy:

```bash
firebase deploy --only firestore:rules
```

## 6. Storage rules (if using Website Builder media)

If logos/hero/OG images use **tenant site media** upload, deploy storage rules when they change:

```bash
firebase deploy --only storage
```

## 7. Verification on the live hostname

Use a private window. Replace host with `https://srk.co.il` (and repeat for `www` if enabled).

| Check | Pass criteria |
|--------|----------------|
| Homepage | Tenant branding / sections; not the generic marketplace home for that host. |
| `/cars` | Only cars for the configured **`yardUid`**. |
| `/cars/{id}` | Car in scope loads; **out-of-scope** id → not found / no other tenant’s data. |
| Unknown host | Host with **no** mapping → marketplace behavior (no tenant scope). |
| Disabled mapping | `enabled: false` or `isActive: false` → **must not** behave as active tenant site. |
| Admin builder | Log in as admin → **`/admin/tenant-site-builder`** still loads and saves (test on primary app URL or same custom domain). |
| Media | Tenant images from Storage load (no rules regressions). |

**Cross-tenant leak sanity check:** Open `/cars` on `srk.co.il`, note a listing id, confirm that id does not appear when opened from a **different** tenant host or unmapped host unless it is legitimately the same public listing (same inventory).

## 8. Go-live checklist (`srk.co.il`)

- [ ] Custom domain **`srk.co.il`** attached to **Hosting site `carexpert-94faa`**.
- [ ] DNS records applied; **SSL** active in Console.
- [ ] **`firebase deploy --only hosting:carexpert-94faa`** (or CI) with current `web` build.
- [ ] **`tenantDomains/srk.co.il`** (and **`www`** doc if needed) with correct **`tenantId`**, **`enabled` / `isActive`** true.
- [ ] **`tenantSiteConfigs/{tenantId}.dataScope.yardUid`** verified in builder or Console.
- [ ] **`firebase deploy --only firestore:rules`** if rules were updated.
- [ ] **`firebase deploy --only storage`** if media upload paths/rules changed.
- [ ] Homepage, **`/cars`**, **`/cars/:id`**, admin builder, media, and **no cross-tenant leakage** verified.

See also: `docs/TENANT_CUSTOM_DOMAIN_HOSTING.md`, `docs/TENANT_HOSTNAME_RESOLUTION_CONTRACT.md`.
