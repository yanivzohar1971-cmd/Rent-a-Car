# Phase 1 Advertising System - Deployment Runbook

## Quick Links

- Firebase Console → Hosting: https://console.firebase.google.com/project/carexpert-94faa/hosting
- Firebase Console → Functions: https://console.firebase.google.com/project/carexpert-94faa/functions
- Firebase Console → Firestore → rentalCompanies: https://console.firebase.google.com/project/carexpert-94faa/firestore/data/~2FrentalCompanies
- Firebase Console → Firestore → partnerAdStatsDaily: https://console.firebase.google.com/project/carexpert-94faa/firestore/data/~2FpartnerAdStatsDaily
- Live URLs:
  - https://www.carexperts4u.com/cars
  - https://www.carexperts4u.com/partner/{slug}
  - https://www.carexperts4u.com/sitemap.xml

---

## Pre-Deploy Sanity Checks (Local)

### 1. Verify firebase.json Rewrite Order

**Git Bash / Linux:**
```bash
cat firebase.json | grep -A 2 "partner"
```

**PowerShell:**
```powershell
Get-Content firebase.json | Select-String -Pattern "partner" -Context 0,2
```

**Status:** NOT VERIFIED (needs manual check)

### 2. Build Functions

**Git Bash / Linux:**
```bash
cd functions && npm run build | tail -10
```

**PowerShell:**
```powershell
cd functions; npm run build | Select-Object -Last 10
```

**Status:** NOT VERIFIED (paste last 10 lines of output below)

### 3. Build Web

**Git Bash / Linux:**
```bash
cd web && npm run build | tail -10
```

**PowerShell:**
```powershell
cd ..\web; npm run build | Select-Object -Last 10
```

**Status:** NOT VERIFIED (paste last 10 lines of output below)

---

## Deploy to Production

### Option A: Deploy All (Recommended)
```bash
# From project root
firebase deploy --only functions:seo,functions:trackPartnerClick,hosting
```

### Option B: Deploy Separately (if needed)
```bash
# Functions only
firebase deploy --only functions:seo,functions:trackPartnerClick

# Hosting only
firebase deploy --only hosting
```

**Note:** Even if `trackPartnerClick` wasn't modified, deploy it once to ensure it exists in production.

---

## Copy/Paste: Minimal PROD Run (Windows PowerShell)

```powershell
firebase deploy --only functions:seo,functions:trackPartnerClick,hosting
firebase functions:log --only trackPartnerClick --limit 20
curl.exe -I https://www.carexperts4u.com/partner/{slug}
curl.exe https://www.carexperts4u.com/sitemap.xml | Select-String -Pattern "/partner/" | Select-Object -First 5
```

---

## Manual Verification Checklist

### A) Ads Strip on /cars (Not Logged In)

**Steps:**
1. Open browser in incognito/private mode
2. Navigate to: `https://www.carexperts4u.com/cars` (or your production URL)
3. Scroll to top of page (after header, before filters)

**Status:** NOT VERIFIED (needs manual check)

**Evidence:**
- URL tested: `https://www.carexperts4u.com/cars`
- Observation: [Paste what you see]
- Browser console errors: [Paste any errors]

**If strip doesn't appear:**
- Check Firestore: `rentalCompanies` collection
- Verify partner has `isVisible=true` and `placements` includes `CARS_SEARCH_TOP_STRIP`
- Check browser console for errors

---

### B) External Click Conversion

**Steps:**
1. Click on a partner logo in the ads strip
2. Observe new tab behavior

**Status:** NOT VERIFIED (needs manual check)

**Evidence:**
- Partner clicked: [Partner name/ID]
- External URL opened: [Full URL with UTM params]
- Popup blocker: [Yes/No]

**If popup blocked:**
- Verify link uses `<a href="..." target="_blank">` (not `window.open`)
- Check browser console for errors

---

### C) Click Tracking

**Steps:**
1. Click a partner logo (from step B)
2. Wait 2-3 seconds
3. Check Firestore or Cloud Functions logs

**Status:** NOT VERIFIED (needs manual check)

**Evidence (choose one):**

**Option 1: Firestore Console**
- Document path: `rentalCompanies/{partnerId}`
- Field `clicksTotal` value before: [number]
- Field `clicksTotal` value after: [number]
- Document path: `partnerAdStatsDaily/{partnerId}_YYYYMMDD}`
- Field `clicks` value: [number]
- Field `lastPlacement` value: [string]

**Option 2: Cloud Functions Logs**
- Command: `firebase functions:log --only trackPartnerClick --limit 20`
- Output: [Paste 3 lines showing 204 responses]

**If tracking fails:**
- Check browser console for CORS errors
- Verify function URL: `https://us-central1-carexpert-94faa.cloudfunctions.net/trackPartnerClick`
- Check sessionStorage throttle (10-second window)

---

### D) Partner Landing + SSR Meta

**Steps:**
1. Get a partner slug from admin panel or Firestore
2. Open directly (not via SPA navigation): `https://www.carexperts4u.com/partner/{slug}`
3. View page source (Right-click → View Page Source)

**Status:** NOT VERIFIED (needs manual check)

**Evidence for Visible Partner:**
- URL tested: `https://www.carexperts4u.com/partner/{slug}`
- HTTP status: [200/404]
- `<title>` content: [Paste title]
- `<meta name="description">` content: [Paste description]
- `<link rel="canonical">` href: [Paste URL]
- `<meta property="og:url">` content: [Paste URL]
- `<meta name="robots">` content: [index,follow / noindex,nofollow]

**Evidence for Hidden Partner:**
- URL tested: `https://www.carexperts4u.com/partner/{slug}`
- HTTP status: [404]
- `<meta name="robots">` content: [noindex,nofollow]

**If SSR doesn't work:**
- Verify hosting rewrite: `/partner/**` → `function: seo`
- Check Cloud Functions logs: `firebase functions:log --only seo`
- Ensure function is deployed: `firebase functions:list`

---

### E) Sitemap

**Steps:**
1. Open: `https://www.carexperts4u.com/sitemap.xml` (or your sitemap route)
2. Search for `/partner/` entries

**Status:** NOT VERIFIED (needs manual check)

**Evidence:**
- URL tested: `https://www.carexperts4u.com/sitemap.xml`
- Partner entries found: [Count]
- Sample entry: `<loc>https://www.carexperts4u.com/partner/{slug}</loc>`
- Hidden partner check: [Test with known hidden partner slug - should NOT appear]

**If sitemap is wrong:**
- Check `functions/src/seo.ts` → `generateSitemap()` function
- Verify query filters: `where("slug", "!=", null)` + post-fetch `isVisible` check

---

## Troubleshooting

### Issue: Ads strip doesn't appear on /cars

**Check:**
1. Firestore: `rentalCompanies` collection
   - Partner exists
   - `isVisible = true`
   - `placements` array includes `"CARS_SEARCH_TOP_STRIP"`
   - `activeFrom`/`activeTo` window (if set) includes current date
2. Browser console: Network errors loading companies
3. Component: Check `PartnerAdsStrip` is imported in `CarsSearchPage.tsx`

**Fix:**
- Create/edit partner in admin panel: `/admin/rental-companies`
- Set placement: "עמוד חיפוש רכבים (פס עליון)"

---

### Issue: Click tracking not incrementing

**Check:**
1. Browser console: CORS errors or network failures
2. Function logs: `firebase functions:log --only trackPartnerClick`
3. SessionStorage throttle: Check if clicked within 10 seconds (throttle prevents double-count)

**Fix:**
- Verify function is deployed: `firebase functions:list` (PowerShell: `firebase functions:list | Select-String trackPartnerClick`)
- Check function URL in `PartnerAdsStrip.tsx` matches deployed function
- Wait 10+ seconds between clicks (throttle window)

---

### Issue: Partner landing page returns 404 (but partner exists)

**Check:**
1. Firestore: Partner document
   - `slug` field exists and is non-empty
   - `isVisible = true`
2. Hosting rewrite: Verify `/partner/**` → `function: seo` in `firebase.json`
3. Function logs: `firebase functions:log --only seo`

**Fix:**
- Ensure partner has valid slug (URL-safe: lowercase, hyphens only)
- Verify hosting rewrite is deployed: `firebase hosting:channel:list`
- Redeploy if rewrite missing: `firebase deploy --only hosting`

---

### Issue: Sitemap includes hidden partners

**Check:**
1. `functions/src/seo.ts` → `generateSitemap()` function
   - Query should filter `isVisible` after fetch (not in query to avoid composite index)

**Fix:**
- Verify code checks `data.isVisible !== true` before adding to sitemap
- Redeploy function: `firebase deploy --only functions:seo`

---

## Quick Verification Commands

```bash
# Check deployed functions
firebase functions:list

# View recent logs
firebase functions:log --only seo --limit 20
firebase functions:log --only trackPartnerClick --limit 20

# Verify hosting rewrites
firebase hosting:channel:list

# Check Firestore (requires console access)
# Go to: https://console.firebase.google.com/project/carexpert-94faa/firestore
```

---

---

## Evidence Section

## Evidence Paste Template

### Deploy Output (last 30 lines)
```
[Paste here]
```

### trackPartnerClick Logs (last 20 lines)
```
[Paste here]
```

### Partner HEAD (status line)
```
[Paste here]
```

### Sitemap sample (first 5 partner lines)
```
[Paste here]
```

---

### Build Outputs

**Functions Build (PowerShell):**
```powershell
cd functions; npm run build | Select-Object -Last 10
```
```
[Paste last 10 lines of output]
```

**Web Build (PowerShell):**
```powershell
cd ..\web; npm run build | Select-Object -Last 10
```
```
[Paste last 10 lines of output]
```

### Deploy Output

```
[Paste summary lines from: firebase deploy --only functions:seo,functions:trackPartnerClick,hosting]
```

### Function Logs

**trackPartnerClick:**
```powershell
firebase functions:log --only trackPartnerClick --limit 20
```
```
[Paste 3 lines showing 204 responses]
Example:
2025-12-16 11:30:15 trackPartnerClick POST 204
2025-12-16 11:30:16 trackPartnerClick POST 204
```

**seo (partner route):**
```powershell
firebase functions:log --only seo --limit 20 | Select-String -Pattern "partner"
```
```
[Paste 3 lines]
```

### Firestore Document Paths to Inspect

**Before click:**
- `rentalCompanies/{partnerId}` → Check `clicksTotal` field
- `partnerAdStatsDaily/{partnerId}_YYYYMMDD}` → Check if exists

**After click:**
- `rentalCompanies/{partnerId}` → Verify `clicksTotal` incremented
- `partnerAdStatsDaily/{partnerId}_YYYYMMDD}` → Verify `clicks` incremented, `lastPlacement` set

**Sitemap verification:**
- Query: `rentalCompanies` collection
- Filter: `isVisible == true` AND `slug != null`
- Count: [Number of visible partners with slugs]
- Compare with sitemap entries: [Number of `/partner/` entries in sitemap.xml]

---

## Evidence: What 'Good' Looks Like

### trackPartnerClick Logs
- ✅ Should show `POST` requests with `204` status code
- ✅ No `400` or `500` errors
- ✅ Example: `2025-12-16 11:30:15 trackPartnerClick POST 204`

### Partner Landing Page Headers
- ✅ Visible partner: HTTP `200` status
- ✅ Hidden/missing partner: HTTP `404` status

### SSR Meta Tags
- ✅ Visible partner: `<meta name="robots" content="index,follow">` (or absent, defaults to index)
- ✅ Hidden/missing partner: `<meta name="robots" content="noindex,nofollow">`
- ✅ `<title>` should contain partner headline or name (never empty)
- ✅ `<link rel="canonical">` should match the URL: `https://www.carexperts4u.com/partner/{slug}`

### Sitemap
- ✅ Should contain `/partner/{slug}` entries **only** for:
  - Partners with `isVisible == true`
  - Partners with non-empty `slug` field
- ✅ Hidden partners (`isVisible == false`) should **NOT** appear
- ✅ Partners without slugs should **NOT** appear

---

## Manual Verification Script (Copy/Paste)

### PowerShell (Recommended for Windows)

```powershell
# 1. Deploy
firebase deploy --only functions:seo,functions:trackPartnerClick,hosting

# 2. Check function logs
firebase functions:log --only trackPartnerClick --limit 20
firebase functions:log --only seo --limit 20

# 3. Test partner landing headers (replace {slug} with actual slug)
curl.exe -I https://www.carexperts4u.com/partner/{slug}

# 4. Test SSR meta (replace {slug} with actual slug)
curl.exe https://www.carexperts4u.com/partner/{slug} |
  Select-String -Pattern "<title>", "meta name=""description""", "link rel=""canonical""", "property=""og:url""", "name=""robots""" -SimpleMatch

# 5. Test sitemap
curl.exe https://www.carexperts4u.com/sitemap.xml |
  Select-String -Pattern "/partner/" |
  Select-Object -First 5

# 6. Build outputs (last 10 lines)
cd functions; npm run build | Select-Object -Last 10
cd ..\web; npm run build | Select-Object -Last 10
```

### Git Bash / Linux

```bash
# 1. Deploy
firebase deploy --only functions:seo,functions:trackPartnerClick,hosting

# 2. Check function logs
firebase functions:log --only trackPartnerClick --limit 20
firebase functions:log --only seo --limit 20

# 3. Test partner landing headers (replace {slug} with actual slug)
curl -I https://www.carexperts4u.com/partner/{slug}

# 4. Test SSR meta (replace {slug} with actual slug)
curl https://www.carexperts4u.com/partner/{slug} | grep -E '<title>|<meta name="description">|<link rel="canonical">|<meta property="og:url">|<meta name="robots">'

# 5. Test sitemap
curl https://www.carexperts4u.com/sitemap.xml | grep -o '/partner/[^<]*' | head -5

# 6. Build outputs (last 10 lines)
cd functions && npm run build | tail -10
cd ../web && npm run build | tail -10
```

---

## Rollback (if needed)

```bash
# Rollback hosting to previous version
firebase hosting:channel:list
firebase hosting:channel:deploy <previous-version-id>

# Rollback functions (requires version history)
# Use Firebase Console → Functions → Version History
```

---

**Last Updated:** 2025-12-16
**Phase:** 1 (Production-Ready)
