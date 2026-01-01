# SEO Deployment Steps

**Last Updated:** 2026-01-01  
**Purpose:** Step-by-step guide to deploy SEO changes to production

## Prerequisites

1. **Firebase CLI installed:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Logged in to Firebase:**
   ```bash
   firebase login
   ```

3. **Correct project selected:**
   ```bash
   firebase use carexpert-94faa
   ```

## Deployment Steps

### Step 1: Build Functions (Required)

```bash
cd functions
npm run build
cd ..
```

**Why:** Compiles TypeScript to JavaScript for the new sitemap functions.

### Step 2: Deploy Cloud Functions (Required)

```bash
firebase deploy --only functions:scheduledGenerateCarsSitemap,functions:serveCarsSitemap,functions:runCarsSitemapNow
```

**What this does:**
- Deploys `scheduledGenerateCarsSitemap` - runs every 6 hours to generate sitemap-cars.xml
- Deploys `serveCarsSitemap` - HTTPS function to serve sitemap files
- Deploys `runCarsSitemapNow` - Manual trigger function (requires admin token)

**Alternative (deploy all functions):**
```bash
firebase deploy --only functions
```

**Note:** Before using `runCarsSitemapNow`, set the admin token:
```bash
firebase functions:config:set admin.sitemap_token="<your-secure-random-token>"
```
(Set `admin.sitemap_token` to a strong secret value. Do not share or commit it to git.)

### Step 3: Deploy Hosting (Required)

```bash
firebase deploy --only hosting
```

**What this does:**
- Builds web app (runs `predeploy` which includes sitemap generation)
- Deploys to Firebase Hosting
- Applies new rewrite rules for sitemap-cars*.xml
- Applies new caching headers

**Note:** The `predeploy` script will:
1. Run SEO coverage verification
2. Generate SEO placeholders
3. Generate sitemaps (sitemap-index.xml, sitemap-static.xml, etc.)
4. Run SEO smoke tests

### Step 4: Verify Deployment

#### Check Functions
1. Go to [Firebase Console → Functions](https://console.firebase.google.com/project/carexpert-94faa/functions)
2. Verify `scheduledGenerateCarsSitemap` and `serveCarsSitemap` are deployed
3. Check logs for `scheduledGenerateCarsSitemap` - should run automatically every 6 hours

#### Check Hosting
1. Visit: `https://www.carexperts4u.com/sitemap-index.xml`
2. Visit: `https://www.carexperts4u.com/sitemap-cars.xml`
3. Visit: `https://www.carexperts4u.com/robots.txt`

#### Test Sitemap Generation
1. Manually trigger the scheduled function (optional):
   - Go to Firebase Console → Functions → `scheduledGenerateCarsSitemap` → Test
   - Or wait for automatic run (every 6 hours)

2. Manual trigger via HTTPS function (requires admin token):
   ```bash
   curl -H "x-admin-token: <REDACTED>" \
     https://us-central1-carexpert-94faa.cloudfunctions.net/runCarsSitemapNow
   ```
   **Note:** Replace `<REDACTED>` with your configured admin token (stored securely, never in git).

#### Production Verification Script
Run the automated production verification:

```bash
cd functions
npm run prod:seo:verify
```

This verifies:
- `/robots.txt` contains correct sitemap directive
- `/sitemap-index.xml` is accessible and references all sub-sitemaps
- `/sitemap-cars.xml` is accessible (may be empty initially)

## Quick Deploy (All at Once)

If you want to deploy everything in one command:

```bash
firebase deploy --only functions:scheduledGenerateCarsSitemap,functions:serveCarsSitemap,hosting
```

## Post-Deployment Checklist

- [ ] Functions deployed successfully
- [ ] Hosting deployed successfully
- [ ] `/sitemap-index.xml` accessible
- [ ] `/sitemap-cars.xml` accessible (may be empty initially)
- [ ] `/robots.txt` accessible with correct sitemap directive
- [ ] Scheduled function appears in Firebase Console
- [ ] First sitemap generation completes (check logs after 6 hours or trigger manually)

## Troubleshooting

### Issue: Functions fail to deploy
- **Check:** TypeScript compilation errors (`npm run build` in functions/)
- **Check:** Firebase CLI version (`firebase --version`)
- **Fix:** Update Firebase CLI: `npm install -g firebase-tools@latest`

### Issue: Hosting deploy fails
- **Check:** Web build succeeds (`cd web && npm run build`)
- **Check:** Sitemap generation succeeds (`cd web && npm run gen:sitemap:advanced`)
- **Fix:** Fix build errors before deploying

### Issue: sitemap-cars.xml returns 404
- **Check:** Function `serveCarsSitemap` is deployed
- **Check:** Scheduled function has run at least once
- **Fix:** Manually trigger `scheduledGenerateCarsSitemap` or wait for scheduled run

### Issue: Sitemap is empty
- **Check:** Are there published cars in Firestore `publicCars` collection?
- **Check:** Query: `db.collection("publicCars").where("isPublished", "==", true).get()`
- **Fix:** Ensure cars have `isPublished: true`

## Next Steps After Deployment

1. **Submit sitemap to Google Search Console:**
   - Go to [Google Search Console](https://search.google.com/search-console)
   - Add property: `https://www.carexperts4u.com`
   - Submit sitemap: `https://www.carexperts4u.com/sitemap-index.xml`

2. **Monitor indexing:**
   - Check Search Console → Coverage
   - Monitor sitemap submission status
   - Review indexing errors

3. **Verify scheduled function:**
   - Check Firebase Console → Functions → Logs
   - Verify `scheduledGenerateCarsSitemap` runs every 6 hours
   - Check that sitemap-cars.xml updates with new cars

4. **Diagnose empty sitemap-cars.xml (if needed):**
   ```bash
   cd functions
   npm run probe:publiccars
   ```
   This script checks Firestore for published cars and identifies field name mismatches.

