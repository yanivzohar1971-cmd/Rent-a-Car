// IMPORTANT (AI / Cursor / humans):
// This changelog powers the Build Info Center in the UI.
// Do NOT remove BUILD_CHANGELOG or replace it with placeholders.
// New builds should be PREPENDED (newest first), keeping the current build at index 0.
// See web/docs/AI_GLOBAL_RULES.md – "Build Info Center – Must Always Exist".

// web/src/config/buildChangelog.ts
import { BUILD_ENV, BUILD_LABEL, BUILD_VERSION } from './buildInfo';

export interface BuildChangeItem {
  type: 'feature' | 'bugfix' | 'ui' | 'infra' | 'other';
  title: string;
  description?: string;
}

export interface BuildEntry {
  version: string;     // e.g. "2025.12.09-01"
  label: string;       // e.g. "v2025.12.09-01"
  env: string;         // "production" | "staging" | "local" | etc.
  topic: string;       // short title in Hebrew or English
  timestamp: string;   // ISO string or "YYYY-MM-DD HH:mm:ss" – displayed as-is
  summary?: string;    // one-line summary
  changes?: BuildChangeItem[];
}

/**
 * Build Changelog
 * 
 * NOTE:
 * - The FIRST entry in this array MUST always be the CURRENT build.
 * - CI/CD can prepend a new entry per deploy before running `npm run build`.
 * - To add a new build: prepend a new BuildEntry object at the top of the array.
 * 
 * CI Integration:
 * - CI can set VITE_DEPLOY_VERSION and VITE_DEPLOY_ENV environment variables
 * - CI can prepend a new entry with version, topic, summary, and changes
 * - After prepending, run `npm run build` and deploy
 */
export const BUILD_CHANGELOG: BuildEntry[] = [
  // Previous build - Promotion ranking fix + lead stats consistency
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Promotion + Leads: Fix "Promote Car" to actually change ranking + UI and make lead stats consistent',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed promotion system so promoted cars actually appear at top of search results with visible badges. Yard promotions from publicCars are now read by UI. Ranking prioritizes promotions (tier-based) over price. Added visual styling (highlighted cards, badges, subtle animations). Fixed backend projection to preserve promotion state. YardStats now uses canonical leads collection instead of unused subcollection.',
    changes: [
      {
        type: 'bugfix',
        title: 'Yard promotions now appear in Buyer listing (badges + sorting)',
        description: 'Fixed searchResultMappers to pass through promotion from publicCars (was setting undefined). Updated carsApi to include promotion and highlightLevel fields in Car type. Promotions now appear in car cards with "מודעה מקודמת" and "מוקפץ" badges.'
      },
      {
        type: 'feature',
        title: 'Ranking prioritizes promoted cars',
        description: 'Changed sorting logic in CarsSearchPage: Primary sort by total promotion tier (BOOST=300, HIGHLIGHT=200, EXPOSURE_PLUS=100 + yard promotion score). Secondary sort by promotion freshness (bumpedAt or boostUntil). Tertiary sort by price (ascending). Promoted cars now float to top instead of only acting as tie-breaker.'
      },
      {
        type: 'ui',
        title: 'Visual promotion styling (highlighted cards, badges, animations)',
        description: 'Added is-highlighted and is-boosted CSS classes to CarListItem. Highlighted cars show green border, soft glow, and light background tint. Boosted cars show orange top border. Promotion badges have subtle pulse animation (respects prefers-reduced-motion). Highlighted titles are bold.'
      },
      {
        type: 'bugfix',
        title: 'Backend projection preserves promotion state',
        description: 'Fixed publicCarProjection to carry promotion forward from MASTER to publicCars. Computes highlightLevel only when promo exists (avoids overwriting). Promotion state is preserved when car is published after promotion is applied. Added promotion field to PublicCar type.'
      },
      {
        type: 'feature',
        title: 'bumpedAt timestamp for promotion freshness',
        description: 'Added bumpedAt timestamp in applyPromotionToYardCar when BOOST or BUNDLE is applied. Allows UI to sort boosted cars by "most recently promoted" for freshness-based ranking.'
      },
      {
        type: 'bugfix',
        title: 'YardStats lead counts now reflect real leads (canonical leads collection)',
        description: 'Fixed yardStatsApi to use fetchLeadsForYard from canonical leads collection instead of unused users/{yardUid}/leads subcollection. Hardened fetchLeadsForYard to require authenticated user and validate yardId matches currentUser.uid to prevent cross-yard reads. Added Firestore composite index for leads: sellerType, sellerId, createdAt.'
      }
    ]
  },
  // Previous build - Buyer filters strict + normalized, model filter implemented, publicCars backfill repair, Yard QR branding
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Buyer filters strict + normalized, model filter implemented, publicCars backfill repair (auto + manual), Yard QR print + modal branding (logo above email)',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed Buyer "רכבים למכירה" flow: (1) Filters are now strict - cars missing required fields are excluded when filters are active. Added normalization helpers for Hebrew apostrophe variants (צ\'רי/צ׳רי) and robust text matching. (2) Implemented ModelFilterDialog - "דגם" filter now works end-to-end (requires single brand selection). (3) Added auto-backfill check in YardFleetPage that repairs publicCars projection when mismatch detected, plus manual "תיקון מכירה (סנכרון)" button. (4) Yard QR shows logo above email in both print window and fullscreen modal.',
    changes: [
      {
        type: 'bugfix',
        title: 'Buyer filters are strict + normalized (Hebrew apostrophe variants)',
        description: 'Added normalizeComparableText() helper that handles Hebrew geresh ׳, typographic apostrophes, and quotes. Added matchesAnyToken() for robust brand/model matching. Updated fetchPublicCars filter logic to be STRICT: if a filter is active (manufacturerIds, model, yearFrom/yearTo, priceFrom/priceTo, kmFrom/kmTo, cityId, gearboxTypes, fuelTypes, bodyTypes) AND the car field is missing/null/empty, the car is EXCLUDED. Prevents filter bypass where cars with missing fields were silently included.'
      },
      {
        type: 'feature',
        title: 'Model filter implemented (דגם)',
        description: 'Created ModelFilterDialog.tsx component similar to BrandFilterDialog. Requires exactly one brand selected (shows message if 0 or >1 brands). Uses carCatalog.searchModels() to search models by brand. When model selected, stores Hebrew model name (modelHe) into filters.model. Updated CarSearchFilterBar to open ModelFilterDialog instead of showing TODO alert. Model filter now works end-to-end: chip opens dialog, select model, URL updates, results filtered.'
      },
      {
        type: 'bugfix',
        title: 'PublicCars backfill repair (auto + manual) so all published cars appear',
        description: 'Added auto-check in YardFleetPage that runs once after cars load: compares publishedMasterCount (PUBLISHED cars in MASTER) vs publicCount (published cars in publicCars). If mismatch detected, automatically calls rebuildPublicCarsForYard() and reloads cars. Added manual "תיקון מכירה (סנכרון)" button in YardFleetPage header that triggers rebuildPublicCarsForYard() on demand. Updated yardBulkStatusApi to call rebuildPublicCarsForYard() after bulk status updates complete (once at end, not per batch). Ensures all published cars (e.g., "צ\'רי") appear in Buyer listing.'
      },
      {
        type: 'feature',
        title: 'Yard QR print + modal branding (logo above email)',
        description: 'Updated YardQrCard to accept yardEmail prop. Print window now shows: yard name (h1), logo (if exists), email (if exists), QR, instruction. Fullscreen modal shows: logo (if exists), email (if exists), QR, instruction. Logo appears above email in both views. Print window waits for both logo and QR images to load before printing (2000ms fallback). Updated YardDashboard to pass email from currentUserProfile or firebaseUser.'
      }
    ]
  },
  // Previous build - Yard QR: added yard logo above identity in print + fullscreen customer modal
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Yard QR: added yard logo above identity in print + fullscreen customer modal',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Added yard logo display above email/name in both print window ("הורד להדפסה") and fullscreen customer modal ("הצג QR ללקוח"). Print window now waits for both logo and QR images to load before auto-printing, with 2000ms fallback timeout. Logo appears centered above identity line in both views.',
    changes: [
      {
        type: 'feature',
        title: 'Yard logo in QR print window and fullscreen modal',
        description: 'Updated YardQrCard to accept yardLogoUrl prop. Added logo display above email/name in both print window and fullscreen modal. Print window uses image load detection to wait for both logo and QR images before printing, preventing missing logo in print output. Added responsive CSS for logo sizing and identity text styling.'
      }
    ]
  },
  // Previous build - Bugfix: Buyer search + chips refresh on URL param change, car details crash fixed, city filter for private ads
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Bugfix: Buyer search + chips refresh on URL param change (useLocation.search as dependency), car details crash fixed (scrollTo behavior "instant" -> safe "auto"), city filter for private ads (cityId -> city label mapping)',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed three critical Buyer flow bugs: (1) Homepage search and filter chips now reliably trigger data refresh by using location.search as useEffect dependency instead of searchParams object identity. (2) Car details pages no longer crash with route error - replaced invalid scrollTo behavior "instant" with safe "auto" fallback. (3) City filter now works for private ads by converting cityId to Hebrew city name before calling fetchActiveCarAds.',
    changes: [
      {
        type: 'bugfix',
        title: 'Buyer search + chips refresh on URL param change (useLocation.search as dependency)',
        description: 'Fixed CarsSearchPage to use location.search as the single source of truth for useEffect dependency instead of searchParams object. Memoized searchParams from location.search to ensure stable reference. Changed dependency from [searchParams, lockedYardId, currentYardId] to [location.search, lockedYardId, currentYardId]. This ensures homepage navigation and filter chip changes always trigger fresh data fetch.'
      },
      {
        type: 'bugfix',
        title: 'Car details crash fixed (scrollTo behavior "instant" -> safe "auto")',
        description: 'Replaced invalid scrollTo behavior "instant" (not a valid ScrollBehavior) with safe helper function in both CarDetailsPage and PublicCarPage. Helper uses behavior: "auto" with try-catch fallback to window.scrollTo(0, 0). Prevents route error boundary from triggering when scrollTo throws in some browsers.'
      },
      {
        type: 'bugfix',
        title: 'City filter for private ads (cityId -> city label mapping)',
        description: 'Added resolveCityNameHe helper function in CarsSearchPage that converts cityId (internal catalog ID) to Hebrew city name (labelHe) before calling fetchActiveCarAds. Searches through all regions if regionId is not provided. Ensures city filtering works correctly for both yard cars (publicCars) and private seller ads (carAds).'
      }
    ]
  },
  // Previous build - SEO: Auto-generate seo-placeholder.png (1200×630) from svg during web prebuild
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'SEO: Auto-generate seo-placeholder.png (1200×630) from svg during web prebuild to ensure reliable social previews',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Added automatic generation of seo-placeholder.png from seo-placeholder.svg during web build. Script runs via prebuild hook using @resvg/resvg-js to convert SVG to PNG at 1200×630. Ensures the placeholder image always exists in production output for reliable OG/Twitter social previews when listings have no images.',
    changes: [
      {
        type: 'infra',
        title: 'Auto-generate seo-placeholder.png from SVG during build',
        description: 'Created web/scripts/gen-seo-placeholder.mjs that converts seo-placeholder.svg to PNG at 1200×630 using @resvg/resvg-js. Added prebuild script hook to run automatically before vite build. PNG is generated in web/public/ and included in hosting deploy output. Removes manual conversion step and ensures placeholder always exists for social previews.'
      }
    ]
  },
  // Previous build - SEO: Added PUBLIC_OG_IMAGES flag to prevent broken social previews when Storage isn't public
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'SEO: Added PUBLIC_OG_IMAGES flag to prevent broken social previews when Storage isn\'t public',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Added PUBLIC_OG_IMAGES environment flag to control gs:// URL conversion for OG/Twitter images. When false (default), gs:// images are immediately replaced with seo-placeholder.png to prevent 401/403 errors from crawlers. When true, gs:// URLs are converted to firebasestorage.googleapis.com public URLs. Default is false for production safety.',
    changes: [
      {
        type: 'infra',
        title: 'Added PUBLIC_OG_IMAGES flag to prevent broken social previews',
        description: 'Added environment flag PUBLIC_OG_IMAGES (default: false) that controls whether gs:// URLs are converted to Firebase Storage public HTTPS URLs. When false, any gs:// image URL is immediately replaced with seo-placeholder.png to prevent crawlers (WhatsApp/Facebook/Google) from getting 401/403 errors. Set PUBLIC_OG_IMAGES=true only if Storage objects are publicly readable by crawlers.'
      }
    ]
  },
  // Previous build - SEO: Added share-ready og:image placeholder (1200×630) and wired fallback for missing images
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'SEO: Added share-ready og:image placeholder (1200×630) and wired fallback for missing images',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Added proper OpenGraph/Twitter placeholder image for social sharing. Created seo-placeholder.svg (reference) and updated SEO renderer to always use seo-placeholder.png (1200×630) as fallback when car/yard images are missing or invalid. Added og:image:width and og:image:height meta tags. All og:image and twitter:image URLs are now always absolute and always present, ensuring WhatsApp/Facebook/X always show a preview.',
    changes: [
      {
        type: 'infra',
        title: 'Added share-ready og:image placeholder (1200×630)',
        description: 'Created seo-placeholder.svg as reference design (CarExpert branding with gradient background). Updated SEO renderer to always use seo-placeholder.png as fallback when car/yard images are missing, invalid, or cannot be normalized. Placeholder uses absolute URL: ${baseUrl}/seo-placeholder.png'
      },
      {
        type: 'infra',
        title: 'Added og:image:width and og:image:height meta tags',
        description: 'Added <meta property="og:image:width" content="1200"> and <meta property="og:image:height" content="630"> to all rendered pages. Helps social platforms optimize image display and ensures proper aspect ratio.'
      },
      {
        type: 'infra',
        title: 'Always include og:image and twitter:image (never conditional)',
        description: 'Updated fetchAndInjectMeta and generateFallbackHtml to always include og:image and twitter:image meta tags. If no car/yard image is available, uses seo-placeholder.png. Ensures social sharing always shows a preview image.'
      }
    ]
  },
  // Previous build - Hardening: location filtering, filter arrays, routing helper, dev logs, redundant refetch prevention
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Hardening: location filtering matches cityNameHe/city; filter arrays normalized; routing helper to prevent /car vs /cars regressions; dev logs gated; avoid redundant refetch',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Hardened Buyer flow for production: location filtering now normalizes city strings and matches against all city fields (cityNameHe, city, cityName). Filter arrays (gearboxTypes/fuelTypes/bodyTypes) normalized to handle string/array/comma-delimited inputs. Created centralized routing helper getCarDetailsUrl() to prevent /car/:id vs /cars/:id confusion. Gated all console.logs with dev-only checks. Added redundant refetch prevention in filter change handler.',
    changes: [
      {
        type: 'bugfix',
        title: 'Location filtering matches cityNameHe/city with normalization',
        description: 'Added normalizeCity() helper to trim, remove double spaces, and normalize punctuation. Location filtering now checks all possible city fields (cityNameHe, city, cityName) with normalized comparison. cityId resolution fails open (no filter) if catalog lookup fails, with dev-only logging. Prevents false negatives due to whitespace differences.'
      },
      {
        type: 'bugfix',
        title: 'Filter arrays normalized (gearboxTypes/fuelTypes/bodyTypes)',
        description: 'Added toArray() helper to normalize filter inputs: handles Array, string (comma-delimited), or undefined. All filter types (gearboxTypes, fuelTypes, bodyTypes) normalized before filtering. Car fields converted to strings for reliable matching. Ensures filter chips always apply correctly regardless of URL format.'
      },
      {
        type: 'infra',
        title: 'Centralized routing helper to prevent /car vs /cars regressions',
        description: 'Created getCarDetailsUrl() helper in utils/carRouting.ts. YARD cars (PUBLIC_CAR source) → /cars/:id, private seller ads (CAR_AD source) → /car/:id. Replaced scattered string concatenations in CarsSearchPage with centralized helper. Prevents future routing mistakes.'
      },
      {
        type: 'infra',
        title: 'Dev logs gated (no production console noise)',
        description: 'Wrapped all console.log/console.error/console.warn calls with import.meta.env.DEV checks in publicCarsApi, HomePage, CarsSearchPage, and CarDetailsPage. Prevents production console noise and potential data leakage. Error handling remains functional, only logging is gated.'
      },
      {
        type: 'bugfix',
        title: 'Prevent redundant refetch on filter changes',
        description: 'Added URL comparison in handleFiltersChange before navigation. If new URL equals current URL, navigation is skipped. Prevents unnecessary refetch when clicking a chip that re-selects the same value. Normal filter changes still refetch immediately.'
      }
    ]
  },
  // Previous build - SEO hardening: absolute URLs, real OG placeholder, sitemap absolute+limits, cached index.html fetch, content-type headers
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'SEO hardening: absolute URLs, real OG placeholder, sitemap absolute+limits, cached index.html fetch, content-type headers',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Hardened SEO infrastructure for production: fixed getBaseUrl to prioritize x-forwarded-host for custom domains, normalized all image URLs to absolute (handles relative paths, gs:// Storage URLs), added in-memory cache for index.html fetch (60s TTL) with loop protection, added Vary: Accept-Encoding headers, added sitemap limits (20k per collection, 45k total) with proper Firestore Timestamp handling for lastmod, updated robots.txt with custom domain note. All canonical/og:url/og:image now use absolute URLs with correct domain/protocol.',
    changes: [
      {
        type: 'infra',
        title: 'Fixed getBaseUrl to prioritize x-forwarded-host for custom domains',
        description: 'Updated getBaseUrl to check x-forwarded-host before host header, ensuring custom domains work correctly. Protocol uses x-forwarded-proto with https fallback. All canonical URLs, og:url, and image URLs now use absolute URLs with correct domain.'
      },
      {
        type: 'infra',
        title: 'Image URL normalization to always absolute',
        description: 'Added normalizeImageUrl function that ensures all og:image and twitter:image URLs are absolute. Handles http/https (keeps as-is), gs:// Storage URLs (warns and uses fallback), relative paths (prepends baseUrl). Fallback uses /vite.svg as absolute URL.'
      },
      {
        type: 'infra',
        title: 'Index.html fetch caching and loop protection',
        description: 'Added in-memory cache for index.html (60s TTL) to reduce latency and hosting load. Added loop protection guard to prevent /index.html from being requested through the function. Added generateFallbackHtml function that returns minimal HTML with meta tags and redirect script if fetch fails.'
      },
      {
        type: 'infra',
        title: 'Response headers: Content-Type + Vary',
        description: 'Added Vary: Accept-Encoding header to all responses (HTML and XML). Content-Type already set correctly (text/html; charset=utf-8 for pages, application/xml; charset=utf-8 for sitemap). Cache-Control headers remain unchanged (5min/15min for pages, 1hr for sitemap).'
      },
      {
        type: 'infra',
        title: 'Sitemap robustness: limits and proper lastmod',
        description: 'Added query limits: 20,000 per collection (publicCars, carAds), 45,000 total URLs. Logs warning if limit reached (future: sitemap index). Fixed lastmod handling to properly convert Firestore Timestamp using toDate() method. Omits lastmod if missing (valid XML).'
      },
      {
        type: 'infra',
        title: 'robots.txt custom domain support',
        description: 'Updated robots.txt with comment noting how to update for custom domains. Kept default Firebase hosting domain for now. File is served from web/public and included in build output.'
      }
    ]
  },
  // Previous build - Critical Buyer regressions fix
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Critical Buyer regressions — homepage search, filters, and car-details navigation',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed critical Buyer flow regressions: homepage search now correctly maps cityId to cityNameHe for filtering, filter chips properly update URL and apply filters, car details navigation fixed (hooks order), and added comprehensive dev logging for debugging. All filters (brand, model, year, price, location, gearbox, fuel, body type) now work correctly.',
    changes: [
      {
        type: 'bugfix',
        title: 'Homepage search → Results navigation fixed (cityId mapping)',
        description: 'Fixed cityId vs city/cityNameHe mismatch in fetchPublicCars. Homepage sends cityId from location catalog (e.g., "tel_aviv"), but publicCars stores cityNameHe (e.g., "תל אביב"). Added robust mapping using locationCatalog.getCityById() to resolve cityId to cityNameHe before filtering. Supports both cityId and direct city/cityNameHe matching for backward compatibility.'
      },
      {
        type: 'bugfix',
        title: 'Buyer results filters (chips/dropdowns) now apply correctly',
        description: 'Enhanced fetchPublicCars to apply all filter types: gearboxTypes, fuelTypes, bodyTypes (previously missing). Filter chips in CarSearchFilterBar properly update URL via handleFiltersChange, which triggers useEffect to refetch with new filters. Added dev logging to track filter changes and results count.'
      },
      {
        type: 'bugfix',
        title: 'Car details navigation and hooks order fixed',
        description: 'Fixed React hooks order violation in CarDetailsPage - moved showAdvancedDetails useState before early returns. Car details page correctly loads via /cars/:id route using fetchCarByIdWithFallback (publicCars). Navigation from search results works for both YARD cars (/cars/:id) and private seller ads (/car/:id).'
      },
      {
        type: 'infra',
        title: 'Dev logging added for Buyer flow debugging',
        description: 'Added comprehensive dev-only logging in HomePage (search payload), CarsSearchPage (parsed filters, fetched results, filter changes), and publicCarsApi (cityId resolution). All logs gated with import.meta.env.DEV to avoid production overhead.'
      }
    ]
  },
  // Previous build - Fix Price and Year range filter UX/logic
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix: Price range slider RTL direction + reliable dragging + prevent inverted range',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed Price range slider RTL direction issues, made dragging reliable on desktop and mobile, and prevented value inversion. Fixed Year range dropdown to enforce FROM<=TO (small→large) and block reverse selections. Added filters hardening: price input parsing (commas/empty), slider hit-area reliability, year reset logic.',
    changes: [
      {
        type: 'bugfix',
        title: 'Price range slider RTL direction + reliable dragging + prevent inverted range',
        description: 'Added dir="ltr" to price-slider-container and price-slider-labels to force LTR direction for slider area. Fixed CSS to make range inputs clickable (removed pointer-events: none, added pointer-events: auto, touch-action: none). Added step={1000} to both range inputs. Updated handleSliderFromChange and handleSliderToChange to clamp values and prevent inversion (from never exceeds to, to never goes below from). Updated handleConfirm to clamp instead of swapping values. Added transparent track styles for webkit and moz vendors.'
      },
      {
        type: 'bugfix',
        title: 'Year range dropdown now enforces FROM<=TO (small→large) and blocks reverse selections',
        description: 'Changed YEARS array to ascending order (MIN_YEAR to CURRENT_YEAR). Added filtering to FROM dropdown to only show years <= (yearTo ?? CURRENT_YEAR). Added filtering to TO dropdown to only show years >= (yearFrom ?? MIN_YEAR). Added useEffect normalization to ensure from <= to on mount and value changes. Updated handleConfirm to clamp instead of swapping values.'
      },
      {
        type: 'bugfix',
        title: 'Filters hardening: price input parsing (commas/empty), slider hit-area reliability, year reset logic',
        description: 'Enhanced price input parsing to support commas and handle empty strings gracefully. Added raw text state for focused inputs to prevent reformatting during typing. Implemented dynamic z-index for dual range sliders to ensure correct thumb hit-area on mobile (fromOnTop logic). Verified year dropdown empty/reset behavior: when FROM is null, TO shows all years; when TO is null, FROM shows all years. Normalization only applies when both values are defined.'
      }
    ]
  },
  // Previous build - SEO infrastructure: server-side meta rendering + dynamic sitemap + robots.txt
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'SEO infrastructure: /car and /yard server meta rendering + dynamic sitemap.xml + robots.txt',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Added comprehensive SEO infrastructure for organic search and social sharing. Created Firebase Cloud Function (seo) that renders server-side meta tags for /car/:id and /yard/:yardId routes. Function fetches deployed index.html, injects OpenGraph tags, Twitter cards, canonical URLs, and JSON-LD structured data. Added dynamic sitemap.xml generation including all published cars and active carAds. Created robots.txt pointing to sitemap. All routes preserve SPA behavior for real users while providing crawler-friendly HTML.',
    changes: [
      {
        type: 'infra',
        title: 'Firebase Cloud Function for SEO rendering',
        description: 'Created functions/src/seo.ts with Express app handling /car/:id, /yard/:yardId, and /sitemap.xml. Function fetches index.html from hosting, injects/replaces meta tags (title, description, OG tags, Twitter cards, canonical, JSON-LD) in <head>, and returns modified HTML. Uses Firebase Admin SDK to read carAds, publicCars, and users collections. Includes proper error handling and 404 responses for missing resources.'
      },
      {
        type: 'infra',
        title: 'Firebase Hosting rewrites for SEO routes',
        description: 'Updated firebase.json to add rewrites for /car/** and /yard/** to the seo function, and /sitemap.xml to the seo function. SPA catch-all rewrite to /index.html remains after SEO routes to ensure normal navigation still works. /index.html itself is NOT rewritten (served as static file) to avoid infinite loops when function fetches it.'
      },
      {
        type: 'infra',
        title: 'Dynamic sitemap.xml generation',
        description: 'SEO function generates XML sitemap including homepage (/), search page (/cars), all published publicCars (/car/{id}), all active carAds (/car/{id}), and yard pages for yards with published cars (/yard/{yardId}). Uses lastmod from updatedAt when available. Safe fallback to minimal sitemap on query errors.'
      },
      {
        type: 'infra',
        title: 'robots.txt for crawlers',
        description: 'Created web/public/robots.txt allowing all crawlers and pointing to sitemap.xml. File is deployed with hosting static assets and accessible at /robots.txt.'
      },
      {
        type: 'infra',
        title: 'JSON-LD structured data',
        description: 'Added schema.org structured data: Vehicle + Offer for car pages (includes brand, model, year, mileage, fuelType, price, availability), and AutoDealer/Organization for yard pages (includes name, telephone, address, url, image). Improves search engine understanding and enables rich snippets.'
      },
      {
        type: 'infra',
        title: 'Caching headers for SEO routes',
        description: 'Set Cache-Control headers: public, max-age=300, s-maxage=900 for /car/:id and /yard/:yardId (5min browser, 15min CDN), and public, max-age=3600, s-maxage=3600 for /sitemap.xml (1 hour). Balances freshness with performance.'
      }
    ]
  },
  // Previous build - Fix Firestore permission errors (Hot Demands + Promotion)
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Firestore permission errors — Hot Demands page load + Promotion "Start Promotion" modal',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed Hot Demands page permission errors with enhanced diagnostic logging. Fixed Promotion "Start Promotion" modal permission denied errors by moving restricted writes to server-side Cloud Function. Added applyPromotionToYardCar callable function that verifies ownership and applies promotions to publicCars server-side.',
    changes: [
      {
        type: 'bugfix',
        title: 'Hot Demands permission/rules stabilized (no more load error)',
        description: 'Enhanced YardDemandPage error logging with detailed context (error.code, error.message, query target, uid, yardId, sellerType) for debugging. Firestore rules for leads collection already support YARD queries (sellerType == "YARD" AND sellerId == auth.uid).'
      },
      {
        type: 'bugfix',
        title: 'Promotion start moved to server-side to avoid Firestore permission denied',
        description: 'Created applyPromotionToYardCar Cloud Function that verifies car ownership, ensures publicCars projection exists, and applies promotion fields server-side. Updated YardCarPromotionDialog to call Cloud Function instead of direct client-side writes to carAds/publicCars. Added enhanced diagnostic logging (dev-only) with error.code, path, uid, yardId, promotion scope, and resolved IDs.'
      }
    ]
  },
  // Previous build - Fix Buyer car details + Smart Publish dropdown parity + Leads hot demands
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Buyer car details navigation + Smart Publish dropdown parity + Leads hot demands load error',
    timestamp: '2025-12-13 21:15:10',
    summary: 'Fixed Buyer car details page error loading by improving error handling with retry button and enhanced logging. Added dropdown status actions to all 3 Smart Publish status cards for consistency (DRAFT, PUBLISHED, HIDDEN all now have dropdown + primary action). Fixed Leads "Hot demands" page loading error with better auth checks and user-friendly error messages.',
    changes: [
      {
        type: 'bugfix',
        title: 'Buyer car details route aligns with publicCars (no load error)',
        description: 'Enhanced CarDetailsPage error handling with detailed logging (carId, errorCode, errorMessage) and added retry button for user-friendly recovery. The page already uses publicCars via fetchCarByIdWithFallback, but now provides better UX when errors occur.'
      },
      {
        type: 'ui',
        title: 'Smart Publish cards dropdown parity',
        description: 'Added consistent dropdown "העבר הכל ל:" to all 3 status summary cards (DRAFT, PUBLISHED, HIDDEN). Each card now has both a primary action button (if applicable) and a dropdown for batch status changes. All cards use the same layout pattern with flexDirection: column for consistent UX.'
      },
      {
        type: 'bugfix',
        title: 'Leads "Hot demands" load fixed (auth/index/query)',
        description: 'Enhanced YardDemandPage error handling with authentication checks, better error logging (errorCode, userId, isYard), and user-friendly error messages based on error type. Added login gate button when user is not authenticated. Improved error context for debugging permission-denied and unauthenticated errors.'
      }
    ]
  },
  // Previous build - Buyer publicCars migration + Smart Publish improvements + Leads auth + TS fixes
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Buyer publicCars migration + Smart Publish improvements + Leads auth + TS fixes',
    timestamp: '2025-12-13 20:35:17',
    summary: 'Migrated Buyer /cars to use publicCars projection (fetchPublicCars). Enhanced Smart Publish with Hide All confirmation and Publish All enablement gating. Fixed Leads to use auth.uid for sellerId with improved logging. Fixed TypeScript compilation errors for Vite compatibility (import.meta.env.MODE) and removed unused imports.',
    changes: [
      {
        type: 'feature',
        title: 'Buyer /cars switched to publicCars (fetchPublicCars)',
        description: 'Updated Buyer car listings to use fetchPublicCars API instead of legacy carSales query. Ensures consistent data projection and better performance.'
      },
      {
        type: 'feature',
        title: 'Smart Publish: Hide All confirmation + Publish All enablement gating',
        description: 'Added confirmation dialog for Hide All batch action. Enhanced Publish All button with enablement gating logic to prevent invalid operations.'
      },
      {
        type: 'bugfix',
        title: 'Leads: sellerId uses auth.uid + logging',
        description: 'Fixed Leads API to consistently use authenticated user UID (auth.uid) for sellerId field. Added comprehensive logging for lead operations.'
      },
      {
        type: 'infra',
        title: 'TS fixes for Vite (import.meta.env.MODE) and removed unused imports',
        description: 'Fixed TypeScript compilation errors by replacing process.env.NODE_ENV with import.meta.env.MODE for Vite compatibility. Removed unused imports and parameters to meet strict TypeScript requirements.'
      }
    ]
  },
  // Previous build - Fix Buyer listings + Always-on Publish All + Sold flow with Storage purge
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Buyer listings + Always-on Publish All + Sold flow with Storage purge',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed Buyer "רכבים למכירה" empty results by ensuring server-side publicCars projection sync via Firestore trigger. Made "פרסם הכל" button always visible and functional (runs backfill when no drafts). Added "נמכר" (Sold) feature with confirmation dialog, Storage image purge, and Sales History page. Sold cars are filtered from active inventory and appear only in Sales History.',
    changes: [
      {
        type: 'bugfix',
        title: 'Server-side publicCars projection sync via Firestore trigger',
        description: 'Extended onCarSaleChange trigger to automatically maintain publicCars projection when MASTER changes. Now supports both status="published" and publicationStatus="PUBLISHED" formats, and excludes SOLD cars. Ensures Buyer page shows published cars regardless of publishing source (Web/Android/Import).'
      },
      {
        type: 'bugfix',
        title: 'Always-on "פרסם הכל" button with backfill support',
        description: 'Removed conditional rendering - button now always visible. When DRAFT=0, clicking runs rebuildPublicCarsForYard backfill to repair projection. After batch publish, automatically runs backfill to guarantee projection correctness.'
      },
      {
        type: 'feature',
        title: 'Mark car as Sold with Storage purge',
        description: 'Added "נמכר" button to YardFleetPage and YardSmartPublishPage. Creates markYardCarSold callable function that: sets saleStatus="SOLD", removes from publicCars, deletes ALL Storage images permanently, clears image metadata fields. Includes confirmation dialog warning about permanent image deletion.'
      },
      {
        type: 'feature',
        title: 'Sales History page for Yard users',
        description: 'Created YardSalesHistoryPage showing all sold cars with statistics: total sold count, total sold value, average days-to-sell. Displays table with sold date, car details, sold price, and notes. Accessible from Yard Dashboard and Yard Fleet page.'
      },
      {
        type: 'infra',
        title: 'Filter SOLD cars from active inventory',
        description: 'Updated fetchYardCarsForUser in carsMasterApi to exclude SOLD cars by default. Updated yardFleetApi mapping to include saleStatus field. Sold cars appear only in Sales History, not in active fleet or Smart Publish lists.'
      },
      {
        type: 'infra',
        title: 'Enhanced publicCarProjection with city field and safe imageUrls',
        description: 'Harden projection builder: writes both city and cityNameHe fields, safely handles missing/invalid imageUrls arrays, ensures isPublished flag is set correctly for published cars.'
      }
    ]
  },
  // Previous build - Fix Yard Promotion page hook order crash
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard Promotion page crash - React hooks order violation (קידום המגרש)',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
    summary: 'Fixed production crash "Minified React error #310 - Rendered more hooks than during the previous render" when clicking "קידום המגרש שלי" button. Root cause: useMemo hook was called after an early return for loading state, causing hook order mismatch between renders. Moved all hooks (useState, useEffect, useMemo) before any early returns. Added ErrorBoundary and route-level errorElement for better UX. Added dev-only console logging for future debugging.',
    changes: [
      {
        type: 'bugfix',
        title: 'Fixed React hooks order violation in YardPromotionsPage',
        description: 'Moved useMemo hook (and all other hooks) before the early return for loading state. Previously, when loading=true, the component returned early and useMemo was never called. When loading became false, useMemo was called, causing React error #310. All hooks are now called unconditionally at the top level on every render.'
      },
      {
        type: 'infra',
        title: 'Added ErrorBoundary for Yard Promotion route',
        description: 'Created YardRouteErrorBoundary component and added it to yard/promotions route. Also added route-level errorElement (YardPromotionErrorElement) for React Router error handling. Users now see a friendly error message with "Try again" and "Back to dashboard" buttons instead of blank "Unexpected Application Error" screen.'
      },
      {
        type: 'infra',
        title: 'Added dev-only console logging for debugging',
        description: 'Added console.log statements (only in dev mode) to track component renders and button clicks. This will help identify future hook order issues or render problems during development.'
      }
    ]
  },
  // Previous build - Smart Publish image count badge opens images editor
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Smart Publish – click image count to open images editor with drag & drop',
    timestamp: '2025-12-11 17:30:00',
    summary: 'Added clickable image count badge in Smart Publish table. Clicking the badge (📷 0/1) opens YardCarImagesDialog for quick image management without leaving the page. Supports drag & drop upload, delete, and set main image. Image count updates immediately in the table after changes.',
    changes: [
      {
        type: 'feature',
        title: 'Clickable image count badge in Smart Publish',
        description: 'Added images column to Smart Publish table with clickable badge showing image count. Badge uses same styling as Yard Fleet page (green for has-images, red for no-images). Clicking opens YardCarImagesDialog for managing car images.'
      },
      {
        type: 'feature',
        title: 'Images dialog integration in Smart Publish',
        description: 'Integrated YardCarImagesDialog into Smart Publish page with state management. Dialog supports drag & drop upload, delete images, set main image, and updates image count in table immediately after changes.'
      },
      {
        type: 'ui',
        title: 'Image badge styling consistency',
        description: 'Added CSS styles for image-count-badge in Smart Publish page matching YardFleetPage styling. Badge shows hover effects and color coding (green/red) based on image presence.'
      }
    ]
  },
  // Previous build - Fix Yard Smart Publish car status update
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard Smart Publish car status update (טיוטה/מפורסם/מוסתר)',
    timestamp: '2025-12-11 17:00:00',
    summary: 'Fixed critical bug where changing car status to "מוסתר" (HIDDEN) or "מפורסם" (PUBLISHED) failed with "שגיאה בעדכון סטטוס הרכב". The issue was incorrect status mapping: HIDDEN was mapped to "draft" instead of "archived", causing saveYardCar to set wrong publicationStatus. Status updates now work correctly and UI refreshes properly.',
    changes: [
      {
        type: 'bugfix',
        title: 'Fixed HIDDEN status mapping in updateCarPublicationStatus',
        description: 'Changed HIDDEN status mapping from "draft" to "archived" in both updateCarPublicationStatus and batchUpdateCarPublicationStatus. This ensures saveYardCar correctly sets publicationStatus="HIDDEN" and yardFleetApi maps it back correctly for the UI.'
      },
      {
        type: 'bugfix',
        title: 'Enhanced error logging for status updates',
        description: 'Added detailed error logging in handleStatusChange and updateCarPublicationStatus to capture carId, status, userId, and full error details. This helps diagnose any future status update failures.'
      },
      {
        type: 'infra',
        title: 'Status mapping flow verification',
        description: 'Verified complete status mapping flow: UI CarPublicationStatus → YardCarMaster.status → Firestore status/publicationStatus → yardFleetApi publicationStatus → UI display. All mappings now align correctly.'
      }
    ]
  },
  // Previous build - Yard Fleet quick images edit modal with drag & drop upload
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Yard Fleet – quick images edit modal from image count with drag & drop upload',
    timestamp: '2025-12-11 16:30:00',
    summary: 'Added quick image editing modal accessible from the image count badge in Yard Fleet table. Users can now click the image count to open a focused modal for managing car images with drag & drop upload support, without navigating to the full car edit page.',
    changes: [
      {
        type: 'feature',
        title: 'Quick images edit modal from Yard Fleet table',
        description: 'Clicking the image count badge (📷 0/1/35) in the Yard Fleet table now opens a compact modal for editing only the car\'s images. The modal includes upload, delete, and set main image functionality, matching the existing images section in Yard Car Edit page.'
      },
      {
        type: 'ui',
        title: 'Drag & drop image upload',
        description: 'Added drag & drop upload zone in the images editor. Users can drag multiple image files directly onto the drop zone or click to select files. The drop zone provides visual feedback when dragging files over it.'
      },
      {
        type: 'feature',
        title: 'Reusable YardCarImagesEditor component',
        description: 'Extracted image management logic from YardCarEditPage into a reusable YardCarImagesEditor component. This component handles image loading, upload, delete, mark as main, and drag & drop reordering, and can be used both in the full edit page and in the quick edit modal.'
      },
      {
        type: 'ui',
        title: 'Real-time image count updates',
        description: 'Image count badge in the Yard Fleet table updates immediately after images are added or deleted in the modal, without requiring a page refresh.'
      }
    ]
  },
  // Previous build - Fix Yard Excel import flow (simplified upload + Storage trigger fixes)
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Fix Yard Excel import flow (simplified upload + Storage trigger fixes)',
    timestamp: '2025-12-11 15:00:00',
    summary: 'Simplified Yard Excel import on Web (removed progress bar, KISS upload), fixed Storage rules, ensured jobs never stay stuck at UPLOADED, and fixed bucket mismatch between Web and Functions.',
    changes: [
      {
        type: 'bugfix',
        title: 'Simplified Yard Excel import on Web',
        description: 'Removed upload progress bar and per-percent tracking. Changed from uploadBytesResumable to simple uploadBytes. UI now shows simple busy state "מעלה ומעבד את קובץ האקסל..." instead of progress percentage. Added success/failure alerts when job completes.'
      },
      {
        type: 'bugfix',
        title: 'Fixed Firebase Storage rules for Yard Excel import',
        description: 'Updated storage.rules to allow authenticated yard owners to upload Excel/CSV files to yardImports/{yardUid}/{jobId}.xlsx. Added support for .xlsx, .xls, and .csv file types with proper MIME type validation.'
      },
      {
        type: 'bugfix',
        title: 'Fixed yardImportParseExcel to never leave jobs stuck',
        description: 'Refactored Storage trigger to ensure jobs always move from UPLOADED to either PREVIEW_READY or FAILED. Converted early returns to throws inside try/catch block. Added comprehensive logging at every step. Jobs can no longer remain stuck at UPLOADED status.'
      },
      {
        type: 'bugfix',
        title: 'Fixed Storage bucket mismatch between Web and Functions',
        description: 'Added explicit storageBucket: "carexpert-94faa.appspot.com" to admin.initializeApp() in functions/src/index.ts. This ensures Functions use the same bucket as Web, fixing "No such object" errors when clicking "יבוא ישירות". Added bucket logging in yardImportCommitJob and yardImportParseExcel.'
      },
      {
        type: 'infra',
        title: 'Enhanced logging for Yard Import functions',
        description: 'Added detailed logging throughout yardImportParseExcel and yardImportCommitJob to track bucket usage, file downloads, and status transitions. All logs use consistent [yardImportParseExcel] and [yardImportCommitJob] prefixes.'
      }
    ]
  },
  // Previous build - Add yardImportWebSimple Cloud Function (KISS Excel import for Web)
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Add yardImportWebSimple Cloud Function (KISS Excel import for Web)',
    timestamp: '2025-12-10 16:32:49',
    summary: 'Added new yardImportWebSimple Cloud Function that enables direct Excel import for Web without job-based flow. Function receives base64 file, parses it, and creates/updates cars in carSales. Returns summary with counts. This is a parallel path to the existing job-based flow used by Android.',
    changes: [
      {
        type: 'feature',
        title: 'New yardImportWebSimple Cloud Function',
        description: 'Added HTTPS callable function that accepts Excel file as base64, parses it using shared parsing logic, creates/updates cars in carSales (MASTER), and optionally creates publicCars projection. Returns summary with rowsTotal, rowsValid, carsCreated, carsUpdated, carsSkipped.'
      },
      {
        type: 'infra',
        title: 'Added importYardExcelSimple API function',
        description: 'Added Web API function in yardImportApi.ts that converts File to base64 and calls yardImportWebSimple. Includes error handling and user-friendly error messages.'
      },
      {
        type: 'infra',
        title: 'Reused existing import logic',
        description: 'yardImportWebSimple reuses existing parseExcelFileBuffer, buildYardCarMasterDataFromImportRow, upsertYardCarMaster, and upsertPublicCarFromMaster helpers. No duplication of parsing or car creation logic.'
      }
    ]
  },
  // Previous build: Final fix: Yard Fleet imageCount=0 and Yard Car Edit missing images
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Final fix: Yard Fleet imageCount=0 and Yard Car Edit missing images',
    timestamp: '2025-12-09 21:45:00',
    summary: 'Fixed critical bug where normalizeCarImages used explicitCount=0 instead of imageUrls.length. Yard Fleet now shows correct image counts, and Yard Car Edit displays external images correctly.',
    changes: [
      {
        type: 'bugfix',
        title: 'Fixed normalizeCarImages count logic',
        description: 'Changed logic to only trust explicitCount if it\'s > 0. When explicitCount is 0 or null, now uses imageUrls.length as source of truth. Fixes cases where publicCars.imageUrls has 10 images but imagesCount=0.'
      },
      {
        type: 'bugfix',
        title: 'Yard Car Edit external images display',
        description: 'Fixed rendering logic to show external images even when managed images exist. Updated lightbox to handle combined managed + external images. "אין תמונות עדיין" now only shows when both arrays are empty.'
      },
      {
        type: 'infra',
        title: 'Debug logging for specific car',
        description: 'Added dev-only debug logging for car 1764682386599 to trace image data flow from Firestore → yardFleetApi → YardCarEditPage. All logs gated with import.meta.env.DEV.'
      }
    ]
  },
  // Previous build: Public car details layout, image filters, and yard edit improvements
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Public car details layout, image filters, and yard edit improvements',
    timestamp: '2025-12-09 21:00:00',
    summary: 'Reworked car details page layout, added "with images only" filter, fixed yard fleet image counts, and improved yard car edit to show existing images.',
    changes: [
      {
        type: 'ui',
        title: 'Public car details layout',
        description: 'Reworked car details page to show gallery first (full-width at top), with all details and contact form below. Added expandable "Advanced details" section for technical/ownership fields.'
      },
      {
        type: 'feature',
        title: 'With images only filter',
        description: 'Added filter chip "רק עם תמונות" in car search page to show only cars that have images (mainImageUrl or imageUrls).'
      },
      {
        type: 'bugfix',
        title: 'Yard fleet image count accuracy',
        description: 'Enhanced image count logic to derive from publicCars.imageUrls.length when explicit count is missing. Ensures accurate counts for all yard cars.'
      },
      {
        type: 'bugfix',
        title: 'Yard car edit shows existing images',
        description: 'Yard car edit screen now displays existing images from publicCars/carSales as read-only thumbnails, preventing "אין תמונות עדיין" when images exist on the public side.'
      }
    ]
  },
  // Previous build: Robust public car linking + accurate image count
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Robust public car linking + accurate image count',
    timestamp: '2025-12-09 20:00:00',
    summary: 'Fixed "car not found" from Facebook share links and image count=0 bug in Yard Fleet. Added validation to prevent broken URLs.',
    changes: [
      {
        type: 'bugfix',
        title: 'Robust public car linking',
        description: 'Added verifyPublicCarExists() validation before generating /cars/:id URLs. getEffectivePublicCarId now verifies publicCars doc exists, preventing "הרכב לא נמצא" from Smart Publish links.'
      },
      {
        type: 'bugfix',
        title: 'Accurate image count in yard fleet',
        description: 'Image counts now reflect real image availability from publicCars and carSales, including legacy fields. Added safety check to force imageCount when publicCars has imageUrls but count is 0.'
      },
      {
        type: 'infra',
        title: 'Public car validation',
        description: 'New verifyPublicCarExists() helper in carsApi.ts ensures share URLs only use valid publicCars document IDs.'
      },
      {
        type: 'infra',
        title: 'Enhanced image normalization',
        description: 'Improved merging of publicCars and carSales image data in yardFleetApi, ensuring all field variants are passed to normalizeCarImages().'
      }
    ]
  },
  // Previous build: Fix main image and image count in yard fleet
  {
    version: '2025.12.09-04',
    label: 'v2025.12.09-04',
    env: 'production',
    topic: 'Fix main image and image count in yard fleet',
    timestamp: '2025-12-09 15:20:00',
    summary: 'Fixed empty main image rendering in CarImageGallery and imageCount=0 bug in Yard Fleet list.',
    changes: [
      {
        type: 'bugfix',
        title: 'Main image rendering',
        description: 'Fixed CarImageGallery to properly display main image (was showing empty gradient). Now renders <img> directly when selectedUrl exists.'
      },
      {
        type: 'bugfix',
        title: 'Image count from publicCars',
        description: 'Strengthened publicCars ↔ carSales mapping to use ALL candidate keys. imageCount now correctly reflects publicCars.imageUrls when available.'
      },
      {
        type: 'infra',
        title: 'Multi-key mapping',
        description: 'addPublicCarToMap now maps each publicCars doc under all relevant keys (carSaleId, originalCarId, carId, id, publicCarId) for robust linking.'
      }
    ]
  },
  // Previous deploy: Fix yard car image gallery & Facebook links
  {
    version: '2025.12.09-03',
    label: 'v2025.12.09-03',
    env: 'production',
    topic: 'Fix yard car image gallery & Facebook links',
    timestamp: '2025-12-09 14:30:00',
    summary: 'Fixed main image selection, added zoom overlay, unified image loading from publicCars.',
    changes: [
      {
        type: 'feature',
        title: 'Image Zoom Overlay',
        description: 'Clicking main image opens full-screen zoom overlay with ESC/backdrop close support.'
      },
      {
        type: 'bugfix',
        title: 'Robust image selection',
        description: 'CarImageGallery now properly selects mainImageUrl on load, falls back to first image.'
      },
      {
        type: 'bugfix',
        title: 'YardFleet preview from publicCars',
        description: 'Preview dialog now loads images from publicCars (same as public car page), ensuring consistency.'
      },
      {
        type: 'infra',
        title: 'Facebook share verified',
        description: 'Confirmed Facebook share uses getEffectivePublicCarId with Firestore fallback resolution.'
      }
    ]
  },
  // Previous deploy: Build Info Center + AI Governance Layer
  {
    version: '2025.12.09-02',
    label: 'v2025.12.09-02',
    env: 'production',
    topic: 'Deploy – Build Info Center + AI Governance Layer',
    timestamp: '2025-12-09 12:10:00',
    summary: 'Added Build Info Center, footer version label, and AI governance docs for all future AI work.',
    changes: [
      {
        type: 'feature',
        title: 'Build Info Center',
        description: 'Footer "Build Info" button opens modal dialog showing current and historical builds.'
      },
      {
        type: 'infra',
        title: 'AI Governance Docs',
        description: 'Added AI_GLOBAL_RULES.md and CURSOR_MASTER_PROMPT.md to guide all future AI/Cursor work on this repo.'
      },
      {
        type: 'ui',
        title: 'Footer version label',
        description: 'BUILD_LABEL displayed in footer as system version indicator (RTL-friendly).'
      },
      {
        type: 'infra',
        title: 'Build changelog module',
        description: 'TypeScript-based BUILD_CHANGELOG array for version history (no DB yet).'
      },
      {
        type: 'infra',
        title: 'MASTER BUILD RULES',
        description: 'AI agents must treat Topic/Summary as Build Log material and output BuildEntry templates for deploys.'
      }
    ]
  },
  // Previous build entry
  {
    version: '2025.12.09-01',
    label: 'v2025.12.09-01',
    env: 'local',
    topic: 'Build Info Center - מרכז מידע גרסאות',
    timestamp: '2025-12-09 11:15:00',
    summary: 'הוספת מרכז מידע גרסאות עם היסטוריית שינויים.',
    changes: [
      {
        type: 'feature',
        title: 'מודל Build Info',
        description: 'דיאלוג מודרני להצגת גרסה נוכחית והיסטוריה.'
      },
      {
        type: 'ui',
        title: 'כפתור Build Info בפוטר',
        description: 'כפתור קטן ליד הגרסה לפתיחת המודל.'
      },
      {
        type: 'infra',
        title: 'מודול buildChangelog.ts',
        description: 'מבנה נתונים typed להיסטוריית גרסאות.'
      }
    ]
  },
  {
    version: '2025.12.09-00',
    label: 'v2025.12.09-00',
    env: 'local',
    topic: 'Build Version Indicator - הושלם',
    timestamp: '2025-12-09 11:07:00',
    summary: 'הוספת גרסת BUILD לפוטר ולוג גרסה בקונסול.',
    changes: [
      {
        type: 'feature',
        title: 'הצגת גרסת מערכת בפוטר',
        description: 'תווית vXXXX עם תמיכה ב-RTL ו-LTR למספרים.'
      },
      {
        type: 'infra',
        title: 'לוג גרסה בקונסול',
        description: 'הדפסת BUILD_LABEL ו-BUILD_ENV בתחילת טעינת האפליקציה.'
      }
    ]
  },
  // Older builds go here, newest first (descending by date).
  // CI/CD or manual editing should prepend new entries above.
];

/**
 * Get the current build entry (first in the changelog)
 */
export function getCurrentBuild(): BuildEntry | undefined {
  return BUILD_CHANGELOG[0];
}

/**
 * Get historical builds (all except the current one)
 */
export function getBuildHistory(): BuildEntry[] {
  return BUILD_CHANGELOG.slice(1);
}

