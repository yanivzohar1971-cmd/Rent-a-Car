# Sitemap Cars Function Documentation

**Last Updated:** 2026-01-01  
**Purpose:** Generate and serve `sitemap-cars.xml` from Firestore `publicCars` collection

## Overview

The sitemap-cars function automatically generates XML sitemaps for all published vehicle detail pages. This enables search engines to discover and index all car listings.

## Architecture

### Components

1. **Scheduled Function** (`scheduledGenerateCarsSitemap`)
   - Runs every 6 hours (Asia/Jerusalem timezone)
   - Queries Firestore `publicCars` collection for `isPublished === true`
   - Generates XML sitemap files
   - Uploads to Cloud Storage

2. **HTTPS Function** (`serveCarsSitemap`)
   - Serves sitemap files from Cloud Storage
   - Handles requests to `/sitemap-cars.xml` and `/sitemap-cars-N.xml`
   - Returns 404 for invalid filenames

3. **Storage Location**
   - Path: `gs://<bucket>/seo/sitemaps/sitemap-cars*.xml`
   - Files are **private** in Cloud Storage (security best practice)
   - Served publicly via HTTPS function using service account credentials
   - Cache-Control: `public, max-age=3600` (set by function response headers)

## Data Source

### Collection: `publicCars`

**Query Filter:**
- `isPublished === true`

**Fields Used:**
- `id` (document ID) - Used as car ID in URL
- `updatedAt` - Used for `<lastmod>` (falls back to `createdAt` if not available)

**URL Format:**
- `https://www.carexperts4u.com/car/{carId}`

## Sitemap Structure

### Single File (≤50,000 URLs)
- `sitemap-cars.xml`

### Multiple Files (>50,000 URLs)
- `sitemap-cars.xml` (first 50k)
- `sitemap-cars-2.xml` (next 50k)
- `sitemap-cars-3.xml` (next 50k)
- etc.

Each file follows the sitemap spec:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.carexperts4u.com/car/{carId}</loc>
    <lastmod>2026-01-01</lastmod>
  </url>
  ...
</urlset>
```

## Schedule

- **Frequency:** Every 6 hours
- **Timezone:** Asia/Jerusalem
- **Trigger:** Cloud Scheduler (Pub/Sub)

### Manual Trigger

To manually trigger generation:
```bash
# Via Firebase Console: Functions > scheduledGenerateCarsSitemap > Test
# Or via gcloud:
gcloud functions call scheduledGenerateCarsSitemap --region=<region>
```

## Firebase Hosting Integration

The sitemap files are served via HTTPS function. Update `firebase.json` rewrites:

```json
{
  "source": "/sitemap-cars*.xml",
  "function": "serveCarsSitemap"
}
```

## Verification

### Check Generation
1. View Cloud Function logs: `firebase functions:log --only scheduledGenerateCarsSitemap`
2. Check logs for:
   - Number of published cars found
   - Number of URLs generated
   - First and last URL (for verification)
   - Number of sitemap files created
3. Check Cloud Storage: `gs://<bucket>/seo/sitemaps/sitemap-cars.xml`
4. Verify file exists and has content

### Test Serving (Production)

**Test single file:**
```bash
curl -I https://www.carexperts4u.com/sitemap-cars.xml
```

**Expected response:**
- HTTP 200
- `Content-Type: application/xml; charset=utf-8`
- `Cache-Control: public, max-age=3600`
- Valid XML body with `<urlset>` root

**Test split files (if >50k URLs):**
```bash
curl -I https://www.carexperts4u.com/sitemap-cars-1.xml
curl -I https://www.carexperts4u.com/sitemap-cars-2.xml
```

**Test 404 handling:**
```bash
curl -I https://www.carexperts4u.com/sitemap-cars-invalid.xml
# Should return 404 with XML error response
```

### Validate XML
- Use [XML Validator](https://www.xmlvalidation.com/)
- Check sitemap-index.xml references are correct
- Verify all URLs are absolute and use HTTPS
- Verify `<lastmod>` dates are in ISO 8601 format (YYYY-MM-DD)

## Monitoring

### Key Metrics
- **Total URLs generated** (logged on each run)
- **Number of sitemap files** (if split)
- **Generation time** (check function execution duration)
- **Storage size** (monitor Cloud Storage usage)

### Alerts
- Function execution failures
- Empty sitemap generation (0 URLs)
- Storage quota warnings

## Troubleshooting

### Issue: Sitemap is empty
- **Check:** Are there published cars in `publicCars`?
- **Query:** `db.collection("publicCars").where("isPublished", "==", true).get()`
- **Fix:** Ensure cars have `isPublished: true`

### Issue: Sitemap not updating
- **Check:** Scheduled function logs
- **Check:** Last execution time in Firebase Console
- **Fix:** Manually trigger if needed

### Issue: 404 when accessing sitemap
- **Check:** File exists in Cloud Storage
- **Check:** Firebase Hosting rewrite rule
- **Check:** Function deployment status

### Issue: Invalid XML
- **Check:** XML escaping (special characters)
- **Check:** URL encoding
- **Fix:** Review `escapeXml()` function

## Performance

### Expected Performance
- **Query time:** < 5 seconds for 10k cars
- **Generation time:** < 10 seconds for 10k cars
- **Upload time:** < 2 seconds per file
- **Total:** < 20 seconds for typical inventory

### Optimization
- Uses Firestore index on `isPublished`
- Processes in batches if needed
- Minimal memory footprint (streams XML generation)

## Security

### Access Control
- Sitemap files are **publicly readable** (required for search engines)
- HTTPS function validates filename (only `sitemap-cars*.xml`)
- No sensitive data exposed (only public car IDs)

### Rate Limiting
- Cloud Storage has built-in rate limiting
- HTTPS function has Firebase default rate limits
- Consider CDN caching for high traffic

## Maintenance

### Regular Tasks
- **Weekly:** Review generation logs
- **Monthly:** Check sitemap file sizes
- **Quarterly:** Review schedule frequency (adjust if inventory grows)

### Updates
- If URL structure changes, update `BASE_URL` constant
- If collection structure changes, update query logic
- If sitemap spec changes, update XML generation

## Related Documentation

- `docs/seo/SEO_FIX_SUMMARY.md` - Overall SEO implementation
- `docs/seo/TECH_SEO_IMPLEMENTATION.md` - Technical SEO details
- `docs/DATA_MODEL_FIRESTORE.md` - Firestore data model

