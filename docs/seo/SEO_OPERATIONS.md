# SEO Operations Guide

## Google Search Console Setup

### Verification
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: `https://www.carexperts4u.com`
3. Verification methods:
   - **HTML Tag:** Add meta tag to `web/index.html` (temporary, can remove after verification)
   - **DNS:** Add TXT record to domain DNS (preferred, permanent)
   - **HTML File:** Upload HTML file to `web/public/` (alternative)

### After Verification
1. Submit sitemap: `https://www.carexperts4u.com/sitemap-index.xml`
2. Monitor indexing status
3. Check for crawl errors
4. Review search performance data

## Sitemap Generation

### Build-Time Generation
Sitemaps are generated automatically during build via `npm run prebuild`:
```bash
cd web
npm run gen:sitemap:advanced
```

This creates:
- `sitemap-index.xml` - Main sitemap index
- `sitemap-static.xml` - Static pages
- `sitemap-blog.xml` - Blog posts and tags
- `sitemap-landing.xml` - SEO landing pages
- `sitemap-cars.xml` - Vehicle detail pages (empty, populated by Cloud Function)

### Vehicle Detail Pages Sitemap
The `sitemap-cars.xml` is currently empty and should be populated by:

**Option 1: Cloud Function (Recommended)**
- Create a scheduled Cloud Function that:
  1. Queries Firestore `publicCars` collection
  2. Generates URLs for all published cars
  3. Writes to `sitemap-cars.xml` in Firebase Storage
  4. Runs daily or on inventory changes

**Option 2: Build Script with Firebase Admin**
- Create `web/scripts/generate-cars-sitemap.mjs`
- Use Firebase Admin SDK to query `publicCars`
- Run as part of build process
- Note: Requires Firebase Admin credentials

### Manual Regeneration
If needed, regenerate sitemaps manually:
```bash
cd web
npm run gen:sitemap:advanced
```

## SEO Debug Overlay (Dev-Only)

### Implementation
Create `web/src/components/seo/SeoDebugOverlay.tsx`:

```tsx
import { useEffect, useState } from 'react';

export function SeoDebugOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show in dev mode or with ?debugSeo=1
    const shouldShow = 
      import.meta.env.DEV || 
      new URLSearchParams(window.location.search).get('debugSeo') === '1';
    setShow(shouldShow);
  }, []);

  if (!show) return null;

  const metaRobots = document.querySelector('meta[name="robots"]');
  const canonical = document.querySelector('link[rel="canonical"]');
  const metaDesc = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const jsonLd = document.querySelector('script[type="application/ld+json"]');

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: '#fff',
      border: '2px solid #000',
      padding: '1rem',
      maxWidth: '400px',
      fontSize: '0.8rem',
      zIndex: 9999,
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    }}>
      <h3 style={{ marginTop: 0 }}>SEO Debug Info</h3>
      <div><strong>Title:</strong> {document.title}</div>
      <div><strong>Robots:</strong> {metaRobots?.getAttribute('content') || 'not set'}</div>
      <div><strong>Canonical:</strong> {canonical?.getAttribute('href') || 'not set'}</div>
      <div><strong>Description:</strong> {metaDesc?.getAttribute('content')?.substring(0, 50) || 'not set'}...</div>
      <div><strong>OG Title:</strong> {ogTitle?.getAttribute('content') || 'not set'}</div>
      <div><strong>JSON-LD:</strong> {jsonLd ? 'present' : 'not present'}</div>
      <button onClick={() => setShow(false)} style={{ marginTop: '0.5rem' }}>
        Close
      </button>
    </div>
  );
}
```

Add to `MainLayout.tsx`:
```tsx
import { SeoDebugOverlay } from './components/seo/SeoDebugOverlay';

// In MainLayout component:
<SeoDebugOverlay />
```

## Monitoring & Maintenance

### Weekly Tasks
1. Check Google Search Console for:
   - New indexing issues
   - Search performance trends
   - Click-through rates
   - Impressions vs. clicks

2. Review sitemap status:
   - Ensure sitemap-index.xml is accessible
   - Check for broken URLs in sitemaps
   - Verify vehicle detail pages are being indexed

### Monthly Tasks
1. Update sitemap lastmod dates for:
   - Blog posts (if updated)
   - Landing pages (if content changed)
   - Vehicle detail pages (via Cloud Function)

2. Review and update:
   - Landing page content (keep fresh)
   - Internal linking (add new links as content grows)
   - Meta descriptions (optimize based on performance)

### Quarterly Tasks
1. Content audit:
   - Review blog article performance
   - Identify top-performing landing pages
   - Plan new content based on search trends

2. Technical audit:
   - Check for broken internal links
   - Verify canonical tags are correct
   - Review robots.txt (ensure no unintended blocks)
   - Check structured data with Google Rich Results Test

## Troubleshooting

### Sitemap Not Updating
- Check build logs for sitemap generation errors
- Verify `gen:sitemap:advanced` script runs in prebuild
- Manually regenerate if needed

### Pages Not Indexing
- Check robots.txt (ensure not disallowed)
- Verify noindex meta tag is not set
- Check canonical tag (should point to correct URL)
- Submit URL manually in Search Console

### Structured Data Errors
- Use [Google Rich Results Test](https://search.google.com/test/rich-results)
- Fix any schema validation errors
- Ensure only factual data is included

## Performance Monitoring

### Key Metrics to Track
1. **Indexing:**
   - Total pages indexed
   - Indexing coverage (indexed vs. submitted)
   - Indexing errors

2. **Search Performance:**
   - Impressions
   - Clicks
   - CTR (Click-Through Rate)
   - Average position

3. **Landing Page Performance:**
   - Which landing pages get most traffic
   - Which keywords drive traffic
   - Conversion rates (if tracking)

### Tools
- **Google Search Console:** Primary tool for SEO monitoring
- **Google Analytics:** Track user behavior on SEO pages
- **Google Rich Results Test:** Validate structured data
- **PageSpeed Insights:** Monitor page performance (affects SEO)

## Best Practices

1. **Content Updates:**
   - Update landing page content quarterly
   - Keep blog articles current
   - Refresh FAQs based on user questions

2. **Internal Linking:**
   - Add 3-5 internal links per article
   - Link from high-authority pages to new content
   - Use descriptive anchor text

3. **URL Structure:**
   - Keep URLs clean and descriptive
   - Use stable slugs (avoid changing)
   - Implement 301 redirects if URLs change

4. **Performance:**
   - Ensure fast page load times
   - Optimize images (lazy loading)
   - Minimize JavaScript bundle size

