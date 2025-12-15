import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";
import * as fs from "fs";
import * as path from "path";

const db = admin.firestore();

const app = express();

// Index.html cache (in-memory, TTL 60 seconds)
const INDEX_HTML_CACHE_TTL = 60000; // 60 seconds
let indexHtmlCache: { html: string; timestamp: number } | null = null;

/**
 * Production guard: Controls whether gs:// URLs are converted to public HTTPS URLs
 * for OG/Twitter images.
 * 
 * Set PUBLIC_OG_IMAGES=true ONLY if Firebase Storage objects are publicly readable
 * by crawlers (WhatsApp/Facebook/Google). If Storage is not public, crawlers will
 * get 401/403 errors and social previews will break.
 * 
 * Default: false (safe - always uses placeholder)
 */
const PUBLIC_OG_IMAGES = (process.env.PUBLIC_OG_IMAGES ?? "").toLowerCase() === "true";

/**
 * Get the base URL from the request
 * Prioritizes x-forwarded-host (for custom domains) over host header
 */
function getBaseUrl(req: express.Request): string {
  const host = req.get("x-forwarded-host") || req.get("host") || "carexpert-94faa.web.app";
  const protocol = req.get("x-forwarded-proto") || "https";
  return `${protocol}://${host}`;
}

/**
 * Parse gs:// URL into bucket and object path
 * Returns { bucket, objectPath } or null if invalid
 */
function parseGsUrl(gsUrl: string): { bucket: string; objectPath: string } | null {
  if (!gsUrl.startsWith("gs://")) {
    return null;
  }

  // Remove gs:// prefix
  const withoutPrefix = gsUrl.slice(5);
  const firstSlashIndex = withoutPrefix.indexOf("/");

  if (firstSlashIndex === -1) {
    // No path after bucket name
    return null;
  }

  const bucket = withoutPrefix.slice(0, firstSlashIndex);
  const objectPath = withoutPrefix.slice(firstSlashIndex + 1);

  if (!bucket || !objectPath) {
    return null;
  }

  return { bucket, objectPath };
}

/**
 * Convert gs:// URL to Firebase Storage public HTTPS URL
 * Format: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<urlEncodedPath>?alt=media
 */
function convertGsUrlToHttps(gsUrl: string): string | null {
  const parsed = parseGsUrl(gsUrl);
  if (!parsed) {
    return null;
  }

  const { bucket, objectPath } = parsed;
  
  // URL encode the object path (encodeURIComponent handles / as %2F)
  const encodedPath = encodeURIComponent(objectPath);
  
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;
}

/**
 * Normalize image URL to always be absolute
 * - If already absolute (http/https), keep it
 * - If Storage gs:// URL, convert to https download URL
 * - If relative path, prepend baseUrl
 * - If undefined/null, use fallback
 */
function normalizeImageUrl(
  imageUrl: string | undefined | null,
  baseUrl: string,
  fallback: string
): string {
  if (!imageUrl) {
    return fallback;
  }

  // Already absolute URL
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  // Storage gs:// URL - convert to Firebase Storage public HTTPS URL (if enabled)
  if (imageUrl.startsWith("gs://")) {
    // Production guard: only convert if PUBLIC_OG_IMAGES is enabled
    if (!PUBLIC_OG_IMAGES) {
      // Storage not public - use placeholder to prevent broken previews
      if (process.env.NODE_ENV !== "production" || process.env.FUNCTIONS_EMULATOR) {
        console.warn("[seo] gs:// URL detected but PUBLIC_OG_IMAGES=false, using placeholder:", imageUrl);
      }
      return fallback;
    }

    // Attempt conversion to public HTTPS URL
    const httpsUrl = convertGsUrlToHttps(imageUrl);
    if (httpsUrl) {
      return httpsUrl;
    }
    
    // Conversion failed - log DEV-only warning and fall back
    if (process.env.NODE_ENV !== "production" || process.env.FUNCTIONS_EMULATOR) {
      console.warn("[seo] Failed to convert gs:// URL to HTTPS, using fallback:", imageUrl);
    }
    return fallback;
  }

  // Relative path - make absolute
  if (imageUrl.startsWith("/")) {
    return `${baseUrl}${imageUrl}`;
  }

  // Relative path without leading slash
  return `${baseUrl}/${imageUrl}`;
}

/**
 * Fetch index.html from hosting and inject SEO meta tags
 * Uses in-memory cache to reduce latency and hosting load
 */
async function fetchAndInjectMeta(
  baseUrl: string,
  metaTags: {
    title: string;
    description: string;
    imageUrl?: string;
    canonical: string;
    jsonLd?: object;
    noindex?: boolean;
    ogType?: string;
  },
  reqPath?: string
): Promise<string> {
  // Loop protection: if somehow /index.html is requested through the function, return 404
  if (reqPath === "/index.html") {
    throw new Error("Loop protection: /index.html should be served as static file");
  }

  let html: string;

  // Check cache first
  const now = Date.now();
  if (indexHtmlCache && (now - indexHtmlCache.timestamp) < INDEX_HTML_CACHE_TTL) {
    html = indexHtmlCache.html;
  } else {
    try {
      // Fetch the deployed index.html
      const indexUrl = `${baseUrl}/index.html`;
      const response = await fetch(indexUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch index.html: ${response.status}`);
      }
      html = await response.text();
      
      // Update cache
      indexHtmlCache = {
        html,
        timestamp: now,
      };
    } catch (error) {
      console.error("[seo] Error fetching index.html, using fallback template:", error);
      // Fallback: minimal HTML template with meta tags + redirect script
      return generateFallbackHtml(metaTags);
    }
  }

  try {
    // Inject/replace meta tags in <head>
    const headEndIndex = html.indexOf("</head>");
    if (headEndIndex === -1) {
      throw new Error("Could not find </head> tag");
    }

    // Build meta tags HTML
    // Always include image (will be placeholder if not provided)
    const imageUrl = metaTags.imageUrl || `${baseUrl}/seo-placeholder.png`;
    const metaHtml = `
    <title>${escapeHtml(metaTags.title)}</title>
    <meta name="description" content="${escapeHtml(metaTags.description)}">
    <meta property="og:title" content="${escapeHtml(metaTags.title)}">
    <meta property="og:description" content="${escapeHtml(metaTags.description)}">
    <meta property="og:url" content="${escapeHtml(metaTags.canonical)}">
    <meta property="og:type" content="${metaTags.ogType || "website"}">
    <meta property="og:site_name" content="CarExpert">
    <meta property="og:locale" content="he_IL">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(metaTags.title)}">
    <meta name="twitter:description" content="${escapeHtml(metaTags.description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <link rel="canonical" href="${escapeHtml(metaTags.canonical)}">
    <link rel="alternate" hreflang="he-il" href="${escapeHtml(metaTags.canonical)}">
    ${metaTags.noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
    ${metaTags.jsonLd ? (Array.isArray(metaTags.jsonLd) 
      ? metaTags.jsonLd.map(schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`).join("\n    ")
      : `<script type="application/ld+json">${JSON.stringify(metaTags.jsonLd)}</script>`) : ""}
    `;

    // Remove existing title and meta tags (if any) and inject new ones
    html = html.replace(/<title>.*?<\/title>/i, "");
    html = html.replace(/<meta\s+name=["']description["'].*?>/i, "");
    html = html.replace(/<meta\s+property=["']og:.*?>/gi, "");
    html = html.replace(/<meta\s+name=["']twitter:.*?>/gi, "");
    html = html.replace(/<link\s+rel=["']canonical["'].*?>/i, "");
    html = html.replace(/<meta\s+name=["']robots["'].*?>/gi, "");
    html = html.replace(/<script\s+type=["']application\/ld\+json["'].*?<\/script>/gi, "");

    // Insert new meta tags before </head>
    html = html.slice(0, headEndIndex) + metaHtml + html.slice(headEndIndex);

    return html;
  } catch (error) {
    console.error("[seo] Error injecting meta tags, using fallback template:", error);
    return generateFallbackHtml(metaTags);
  }
}

/**
 * Generate fallback HTML template when index.html fetch fails
 * Includes meta tags and a script to redirect to SPA route
 */
function generateFallbackHtml(metaTags: {
  title: string;
  description: string;
  imageUrl?: string;
  canonical: string;
  jsonLd?: object;
  noindex?: boolean;
  ogType?: string;
}): string {
  const redirectPath = new URL(metaTags.canonical).pathname;
  const baseUrl = new URL(metaTags.canonical).origin;
  // Always include image (use placeholder if not provided)
  const imageUrl = metaTags.imageUrl || `${baseUrl}/seo-placeholder.png`;
  
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(metaTags.title)}</title>
  <meta name="description" content="${escapeHtml(metaTags.description)}">
  <meta property="og:title" content="${escapeHtml(metaTags.title)}">
  <meta property="og:description" content="${escapeHtml(metaTags.description)}">
  <meta property="og:url" content="${escapeHtml(metaTags.canonical)}">
  <meta property="og:type" content="${metaTags.ogType || "website"}">
  <meta property="og:site_name" content="CarExpert">
  <meta property="og:locale" content="he_IL">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(metaTags.title)}">
  <meta name="twitter:description" content="${escapeHtml(metaTags.description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <link rel="canonical" href="${escapeHtml(metaTags.canonical)}">
  <link rel="alternate" hreflang="he-il" href="${escapeHtml(metaTags.canonical)}">
  ${metaTags.noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
  ${metaTags.jsonLd ? (Array.isArray(metaTags.jsonLd) 
    ? metaTags.jsonLd.map(schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`).join("\n  ")
    : `<script type="application/ld+json">${JSON.stringify(metaTags.jsonLd)}</script>`) : ""}
  <script>
    // Redirect to SPA route
    window.location.replace("${escapeHtml(redirectPath)}");
  </script>
</head>
<body>
  <p>טוען...</p>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get car data for /car/:id
 */
async function getCarData(carId: string, baseUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl?: string;
  jsonLd?: object;
} | null> {
  try {
    // Try carAds first
    const carAdDoc = await db.collection("carAds").doc(carId).get();
    if (carAdDoc.exists) {
      const data = carAdDoc.data();
      if (data?.status === "ACTIVE") {
        const title = `${data.year || ""} ${data.manufacturer || ""} ${data.model || ""} למכירה`.trim();
        const descParts: string[] = [];
        if (data.price) descParts.push(`₪${data.price.toLocaleString("he-IL")}`);
        if (data.mileageKm) descParts.push(`${data.mileageKm.toLocaleString("he-IL")} ק״מ`);
        if (data.city) descParts.push(data.city);
        descParts.push("רכב למכירה ב-CarExpert");
        const description = descParts.join(" · ");
        const rawImageUrl = data.mainImageUrl || (Array.isArray(data.imageUrls) && data.imageUrls.length > 0 ? data.imageUrls[0] : undefined);
        const imageUrl = normalizeImageUrl(rawImageUrl, baseUrl, `${baseUrl}/seo-placeholder.png`);

        // JSON-LD for Vehicle + Offer
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "Vehicle",
          "brand": data.manufacturer || "",
          "model": data.model || "",
          "vehicleModelDate": data.year || "",
          "mileageFromOdometer": {
            "@type": "QuantitativeValue",
            "value": data.mileageKm || 0,
            "unitCode": "KMT",
          },
          "fuelType": data.fuelType || undefined,
          "vehicleTransmission": data.gearboxType || undefined,
          "offers": {
            "@type": "Offer",
            "priceCurrency": "ILS",
            "price": data.price || 0,
            "availability": "https://schema.org/InStock",
            "url": "", // Will be set by caller
          },
        };

        return { title, description, imageUrl, jsonLd };
      }
    }

    // Fallback to publicCars
    const publicCarDoc = await db.collection("publicCars").doc(carId).get();
    if (publicCarDoc.exists) {
      const data = publicCarDoc.data();
      if (data?.isPublished === true) {
        const title = `${data.year || ""} ${data.brand || ""} ${data.model || ""} למכירה`.trim();
        const descParts: string[] = [];
        if (data.price) descParts.push(`₪${data.price.toLocaleString("he-IL")}`);
        if (data.mileageKm) descParts.push(`${data.mileageKm.toLocaleString("he-IL")} ק״מ`);
        if (data.city) descParts.push(data.city);
        descParts.push("רכב למכירה ב-CarExpert");
        const description = descParts.join(" · ");
        const rawImageUrl = data.mainImageUrl || (Array.isArray(data.imageUrls) && data.imageUrls.length > 0 ? data.imageUrls[0] : undefined);
        const imageUrl = normalizeImageUrl(rawImageUrl, baseUrl, `${baseUrl}/seo-placeholder.png`);

        // JSON-LD for Vehicle + Offer
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "Vehicle",
          "brand": data.brand || "",
          "model": data.model || "",
          "vehicleModelDate": data.year || "",
          "mileageFromOdometer": {
            "@type": "QuantitativeValue",
            "value": data.mileageKm || 0,
            "unitCode": "KMT",
          },
          "fuelType": data.fuelType || undefined,
          "vehicleTransmission": data.gearboxType || undefined,
          "offers": {
            "@type": "Offer",
            "priceCurrency": "ILS",
            "price": data.price || 0,
            "availability": "https://schema.org/InStock",
            "url": "", // Will be set by caller
          },
        };

        return { title, description, imageUrl, jsonLd };
      }
    }

    return null;
  } catch (error) {
    console.error("[seo] Error fetching car data:", error);
    return null;
  }
}

/**
 * Get yard data for /yard/:yardId
 */
async function getYardData(yardId: string, baseUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl?: string;
  jsonLd?: object;
} | null> {
  try {
    const yardDoc = await db.collection("users").doc(yardId).get();
    if (!yardDoc.exists) {
      return null;
    }

    const data = yardDoc.data();
    const displayName = data?.displayName || data?.yardName || data?.fullName || "מגרש רכבים";
    const title = `${displayName} - רכבים למכירה | CarExpert`;

    const descParts: string[] = [];
    if (data?.yardDescription) descParts.push(data.yardDescription);
    if (data?.city || data?.yardCity) descParts.push(data.city || data.yardCity);
    if (data?.phone || data?.yardPhone) descParts.push(`טלפון: ${data.phone || data.yardPhone}`);
    const description = descParts.length > 0 ? descParts.join(" · ") : `${displayName} - רכבים למכירה ב-CarExpert`;

    const rawImageUrl = data?.yardLogoUrl;
    const imageUrl = normalizeImageUrl(rawImageUrl, baseUrl, `${baseUrl}/seo-placeholder.png`);

    // JSON-LD for LocalBusiness / AutoDealer
    const jsonLd: any = {
      "@context": "https://schema.org",
      "@type": "AutoDealer",
      "name": displayName,
      "url": "", // Will be set by caller
    };

    if (data?.phone || data?.yardPhone) {
      jsonLd.telephone = data.phone || data.yardPhone;
    }

    if (data?.city || data?.yardCity) {
      jsonLd.address = {
        "@type": "PostalAddress",
        "addressLocality": data.city || data.yardCity,
      };
    }

    if (imageUrl) {
      jsonLd.image = imageUrl;
    }

    return { title, description, imageUrl, jsonLd };
  } catch (error) {
    console.error("[seo] Error fetching yard data:", error);
    return null;
  }
}

/**
 * Generate sitemap.xml
 * Includes limits to prevent oversized sitemaps
 */
async function generateSitemap(baseUrl: string): Promise<string> {
  const urls: Array<{ loc: string; lastmod?: string }> = [];
  const MAX_URLS_PER_COLLECTION = 20000;
  const MAX_TOTAL_URLS = 45000;

  // Homepage
  urls.push({ loc: `${baseUrl}/` });

  // Search page
  urls.push({ loc: `${baseUrl}/cars` });

  // Blog index
  urls.push({ loc: `${baseUrl}/blog` });

  // Blog posts (use getBlogPosts() for consistency with SSR)
  const blogPosts = getBlogPosts();
  if (blogPosts.length > 0) {
    for (const post of blogPosts) {
      if (urls.length >= MAX_TOTAL_URLS) {
        break;
      }
      const publishedAt = post.publishedAt;
      urls.push({
        loc: `${baseUrl}/blog/${post.slug}`,
        lastmod: publishedAt ? (typeof publishedAt === "string" ? publishedAt.split("T")[0] : undefined) : undefined,
      });
    }

    // Blog tag pages (dedupe tags)
    const tagSet = new Set<string>();
    for (const post of blogPosts) {
      if (post.tags && Array.isArray(post.tags)) {
        for (const tag of post.tags) {
          if (typeof tag === "string" && tag.trim()) {
            tagSet.add(tag.trim());
          }
        }
      }
    }
    for (const tag of tagSet) {
      if (urls.length >= MAX_TOTAL_URLS) {
        break;
      }
      urls.push({
        loc: `${baseUrl}/blog/tag/${encodeURIComponent(tag)}`,
      });
    }
  }

  // RSS feed
  urls.push({ loc: `${baseUrl}/rss.xml` });

  try {
    // Published publicCars (with limit)
    const publicCarsQuery = db
      .collection("publicCars")
      .where("isPublished", "==", true)
      .limit(MAX_URLS_PER_COLLECTION);
    
    const publicCarsSnapshot = await publicCarsQuery.get();

    const yardUids = new Set<string>();

    publicCarsSnapshot.forEach((doc) => {
      if (urls.length >= MAX_TOTAL_URLS) {
        return; // Stop adding if we hit the limit
      }

      const data = doc.data();
      let lastmod: string | undefined;
      
      // Properly handle Firestore Timestamp
      if (data?.updatedAt) {
        if (data.updatedAt.toDate && typeof data.updatedAt.toDate === "function") {
          lastmod = data.updatedAt.toDate().toISOString().split("T")[0];
        } else if (data.updatedAt instanceof admin.firestore.Timestamp) {
          lastmod = data.updatedAt.toDate().toISOString().split("T")[0];
        }
      }

      urls.push({
        loc: `${baseUrl}/car/${doc.id}`,
        lastmod,
      });

      // Collect yard UIDs for yard pages
      const yardUid = data?.yardUid || data?.ownerUid || data?.userId;
      if (yardUid) {
        yardUids.add(yardUid);
      }
    });

    // Active carAds (with limit)
    const carAdsQuery = db
      .collection("carAds")
      .where("status", "==", "ACTIVE")
      .limit(MAX_URLS_PER_COLLECTION);
    
    const carAdsSnapshot = await carAdsQuery.get();

    carAdsSnapshot.forEach((doc) => {
      if (urls.length >= MAX_TOTAL_URLS) {
        return; // Stop adding if we hit the limit
      }

      const data = doc.data();
      let lastmod: string | undefined;
      
      // Properly handle Firestore Timestamp
      if (data?.updatedAt) {
        if (data.updatedAt.toDate && typeof data.updatedAt.toDate === "function") {
          lastmod = data.updatedAt.toDate().toISOString().split("T")[0];
        } else if (data.updatedAt instanceof admin.firestore.Timestamp) {
          lastmod = data.updatedAt.toDate().toISOString().split("T")[0];
        }
      }

      urls.push({
        loc: `${baseUrl}/car/${doc.id}`,
        lastmod,
      });
    });

    // Yard pages (only yards with published cars)
    for (const yardUid of yardUids) {
      if (urls.length >= MAX_TOTAL_URLS) {
        break; // Stop if we hit the limit
      }
      urls.push({
        loc: `${baseUrl}/yard/${yardUid}`,
      });
    }

    // Log warning if we hit limits
    if (urls.length >= MAX_TOTAL_URLS) {
      console.warn(`[seo] Sitemap reached MAX_TOTAL_URLS limit (${MAX_TOTAL_URLS}). Consider implementing sitemap index.`);
    }
  } catch (error) {
    console.error("[seo] Error generating sitemap:", error);
    // Return minimal sitemap on error
  }

  // Build XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>` : ""}
  </url>`
  )
  .join("\n")}
</urlset>`;

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Route: /car/:id
app.get("/car/:id", async (req, res) => {
  try {
    const carId = req.params.id;
    const baseUrl = getBaseUrl(req);
    const canonical = `${baseUrl}/car/${carId}`;

    const carData = await getCarData(carId, baseUrl);
    if (!carData) {
      // Car not found - return 404 with basic HTML
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>הרכב לא נמצא | CarExpert</title>
            <meta charset="utf-8">
          </head>
          <body>
            <h1>הרכב לא נמצא</h1>
            <p>הרכב המבוקש לא נמצא במערכת.</p>
          </body>
        </html>
      `);
      return;
    }

    // Update JSON-LD with canonical URL
    if (carData.jsonLd && typeof carData.jsonLd === "object") {
      const jsonLd = carData.jsonLd as any;
      if (jsonLd.offers) {
        jsonLd.offers.url = canonical;
      }
    }

    const html = await fetchAndInjectMeta(baseUrl, {
      title: carData.title,
      description: carData.description,
      imageUrl: carData.imageUrl,
      canonical,
      jsonLd: carData.jsonLd,
    }, req.path);

    res.set("Cache-Control", "public, max-age=300, s-maxage=900");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(html);
  } catch (error) {
    console.error("[seo] Error handling /car/:id:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route: /yard/:yardId
app.get("/yard/:yardId", async (req, res) => {
  try {
    const yardId = req.params.yardId;
    const baseUrl = getBaseUrl(req);
    const canonical = `${baseUrl}/yard/${yardId}`;

    const yardData = await getYardData(yardId, baseUrl);
    if (!yardData) {
      // Yard not found - return 404 with basic HTML
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>המגרש לא נמצא | CarExpert</title>
            <meta charset="utf-8">
          </head>
          <body>
            <h1>המגרש לא נמצא</h1>
            <p>המגרש המבוקש לא נמצא במערכת.</p>
          </body>
        </html>
      `);
      return;
    }

    // Update JSON-LD with canonical URL
    if (yardData.jsonLd && typeof yardData.jsonLd === "object") {
      const jsonLd = yardData.jsonLd as any;
      jsonLd.url = canonical;
    }

    const html = await fetchAndInjectMeta(baseUrl, {
      title: yardData.title,
      description: yardData.description,
      imageUrl: yardData.imageUrl,
      canonical,
      jsonLd: yardData.jsonLd,
    }, req.path);

    res.set("Cache-Control", "public, max-age=300, s-maxage=900");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(html);
  } catch (error) {
    console.error("[seo] Error handling /yard/:yardId:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Blog post type (minimal typing to avoid over-constraining schema)
 */
type BlogPost = {
  slug: string;
  title: string;
  description?: string;
  titleHe?: string;
  metaDescriptionHe?: string;
  publishedAt?: string;
  [key: string]: any; // Allow additional fields
};

/**
 * Cached blog posts (loaded once, reused)
 */
let cachedBlogPosts: BlogPost[] | null = null;

/**
 * Safely read and parse a JSON file
 */
function readJsonFileSafe(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("[SEO] Failed reading JSON:", filePath, e);
    return null;
  }
}

/**
 * Load blog posts from shared JSON file with fallback candidates
 * 
 * Production-safe: tries multiple path candidates to handle different
 * deployment scenarios (compiled lib/, source functions/, etc.)
 * 
 * Canonical path: functions/shared/content/blogPosts.he.json
 * This is the runtime source for Functions (fs read).
 * Web uses web/src/assets/blogPosts.he.json (build-time import).
 */
function getBlogPosts(): BlogPost[] {
  // Return cached result if available
  if (cachedBlogPosts !== null) {
    return cachedBlogPosts;
  }

  // Try multiple path candidates (production-safe fallbacks)
  const candidates = [
    // Most reliable in Firebase Functions: cwd is typically the deployed functions root
    path.resolve(process.cwd(), "shared", "content", "blogPosts.he.json"),
    // When compiled JS runs from lib/ (sometimes __dirname points there)
    path.resolve(__dirname, "..", "shared", "content", "blogPosts.he.json"),
    path.resolve(__dirname, "..", "..", "shared", "content", "blogPosts.he.json"),
  ];

  let parsed: any = null;
  for (const candidatePath of candidates) {
    parsed = readJsonFileSafe(candidatePath);
    if (parsed) {
      console.log("[SEO] Loaded blogPosts.he.json from:", candidatePath);
      break;
    }
  }

  // Validate: must be an array
  if (!Array.isArray(parsed)) {
    console.error("[SEO] blogPosts.he.json not found or invalid. Tried:", candidates);
    cachedBlogPosts = [];
    return cachedBlogPosts;
  }

  // Minimal validation: ensure slug exists + unique
  const seen = new Set<string>();
  const posts: BlogPost[] = [];
  for (const item of parsed) {
    // Support both title/titleHe and description/metaDescriptionHe
    const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
    if (!slug) {
      continue; // Skip items without slug
    }
    if (seen.has(slug)) {
      continue; // Skip duplicates
    }
    seen.add(slug);
    posts.push(item);
  }

  // Cache the result
  cachedBlogPosts = posts;
  return cachedBlogPosts;
}

// Route: /blog/tag/:tag (must come before /blog/:slug)
app.get("/blog/tag/:tag", async (req, res) => {
  try {
    const tag = decodeURIComponent(req.params.tag);
    const baseUrl = getBaseUrl(req);
    const canonical = `${baseUrl}/blog/tag/${encodeURIComponent(tag)}`;

    const blogPosts = getBlogPosts();
    const postsWithTag = blogPosts.filter((p) => p.tags && Array.isArray(p.tags) && p.tags.includes(tag));

    // Breadcrumbs JSON-LD
    const breadcrumbsJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "בית",
          item: baseUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "בלוג",
          item: `${baseUrl}/blog`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `תגית ${tag}`,
          item: canonical,
        },
      ],
    };

    // CollectionPage JSON-LD
    const collectionPageJsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `מאמרים בנושא ${tag}`,
      description: `מאמרים וטיפים בנושא ${tag} - מדריכים קצרים לקריאה מהירה`,
      url: canonical,
      isPartOf: {
        "@type": "Blog",
        name: "CarExpert Blog",
        url: `${baseUrl}/blog`,
      },
    };

    // Organization JSON-LD
    const organizationJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CarExpert",
      url: baseUrl,
      logo: `${baseUrl}/seo-placeholder.png`,
    };

    const metaTags = {
      title: `מאמרים בנושא ${tag} | CarExpert`,
      description: `מאמרים וטיפים בנושא ${tag}. מדריכים קצרים לקריאה מהירה על רכב, תחזוקה, קנייה חכמה ועוד.`,
      imageUrl: `${baseUrl}/seo-placeholder.png`,
      canonical,
      jsonLd: [breadcrumbsJsonLd, collectionPageJsonLd, organizationJsonLd],
    };

    const html = await fetchAndInjectMeta(baseUrl, metaTags, req.path);

    res.set("Cache-Control", "public, max-age=60, s-maxage=600");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(html);
  } catch (error) {
    console.error("[seo] Error handling /blog/tag/:tag:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route: /blog
app.get("/blog", async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const canonical = `${baseUrl}/blog`;

    // Get blog posts to check if any exist (for optional meta)
    const blogPosts = getBlogPosts();
    const hasPosts = blogPosts.length > 0;

    // Organization JSON-LD for blog index
    const organizationJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CarExpert",
      url: baseUrl,
      logo: `${baseUrl}/seo-placeholder.png`,
    };

    const metaTags = {
      title: "בלוג רכב | CarExpert",
      description: hasPosts 
        ? "טיפים קצרים לרכב, אביזרים, תחזוקה וקנייה חכמה — מאמרים קצרים לקריאה מהירה."
        : "בלוג רכב | CarExpert",
      imageUrl: `${baseUrl}/seo-placeholder.png`,
      canonical,
      jsonLd: organizationJsonLd,
    };

    const html = await fetchAndInjectMeta(baseUrl, metaTags, req.path);

    // Safe cache headers: public, max-age=60, s-maxage=600
    res.set("Cache-Control", "public, max-age=60, s-maxage=600");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(html);
  } catch (error) {
    console.error("[seo] Error handling /blog:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route: /blog/:slug
app.get("/blog/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    const baseUrl = getBaseUrl(req);
    const canonical = `${baseUrl}/blog/${slug}`;

    // Use getBlogPosts() (production-safe with fallbacks)
    const blogPosts = getBlogPosts();
    const post = blogPosts.find((p) => p.slug === slug);

    if (!post) {
      // Post not found - return HTML with noindex + no-store cache
      const html = await fetchAndInjectMeta(
        baseUrl,
        {
          title: "מאמר לא נמצא | CarExpert",
          description: "המאמר המבוקש לא נמצא.",
          imageUrl: `${baseUrl}/seo-placeholder.png`,
          canonical,
          noindex: true,
        },
        req.path
      );
      res.set("Cache-Control", "no-store");
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(404).send(html);
      return;
    }

    // Support both title/titleHe and description/metaDescriptionHe
    const titleHe = post.titleHe || post.title || "מאמר";
    const metaDescriptionHe = post.metaDescriptionHe || post.description || "";
    const publishedAt = post.publishedAt || "";
    const tags = post.tags || [];

    // Calculate word count from content (estimate from sections + FAQ)
    let wordCount = 0;
    if (post.sections && Array.isArray(post.sections)) {
      for (const section of post.sections) {
        if (section.bodyHe) {
          wordCount += section.bodyHe.split(/\s+/).length;
        }
      }
    }
    if (post.faq && Array.isArray(post.faq)) {
      for (const item of post.faq) {
        if (item.aHe) {
          wordCount += item.aHe.split(/\s+/).length;
        }
      }
    }

    // JSON-LD BlogPosting schema (enhanced from Article)
    const blogPostingJsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: titleHe,
      description: metaDescriptionHe,
      datePublished: publishedAt,
      dateModified: publishedAt, // Until we add edit tracking
      inLanguage: "he-IL",
      wordCount: wordCount > 0 ? wordCount : undefined,
      keywords: tags.length > 0 ? tags.join(", ") : undefined,
      author: {
        "@type": "Organization",
        name: "CarExpert",
      },
      publisher: {
        "@type": "Organization",
        name: "CarExpert",
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonical,
      },
      image: `${baseUrl}/seo-placeholder.png`,
      isPartOf: {
        "@type": "Blog",
        name: "CarExpert Blog",
        url: `${baseUrl}/blog`,
      },
    };

    // Breadcrumbs JSON-LD
    const breadcrumbsJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "בית",
          item: baseUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "בלוג",
          item: `${baseUrl}/blog`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: titleHe,
          item: canonical,
        },
      ],
    };

    // Organization JSON-LD
    const organizationJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CarExpert",
      url: baseUrl,
      logo: `${baseUrl}/seo-placeholder.png`,
    };

    // FAQPage JSON-LD if post has FAQ
    const faqJsonLd = post.faq && Array.isArray(post.faq) && post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item: any) => ({
            "@type": "Question",
            name: item.qHe || "",
            acceptedAnswer: {
              "@type": "Answer",
              text: item.aHe || "",
            },
          })),
        }
      : null;

    // Combine all JSON-LD schemas into an array
    const jsonLd = [blogPostingJsonLd, breadcrumbsJsonLd, organizationJsonLd];
    if (faqJsonLd) {
      jsonLd.push(faqJsonLd);
    }

    const html = await fetchAndInjectMeta(
      baseUrl,
      {
        title: `${titleHe} | CarExpert`,
        description: metaDescriptionHe,
        imageUrl: `${baseUrl}/seo-placeholder.png`,
        canonical,
        jsonLd,
        // Set og:type to article for blog posts
        ogType: "article",
      },
      req.path
    );

    // Safe cache headers: public, max-age=60, s-maxage=600
    res.set("Cache-Control", "public, max-age=60, s-maxage=600");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(html);
  } catch (error) {
    console.error("[seo] Error handling /blog/:slug:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route: /rss.xml
app.get("/rss.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const blogPosts = getBlogPosts();

    // Sort by publishedAt (newest first)
    const sortedPosts = [...blogPosts].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });

    // Build RSS items
    const items = sortedPosts.map((post) => {
      const titleHe = post.titleHe || post.title || "";
      const metaDescriptionHe = post.metaDescriptionHe || post.description || "";
      const slug = post.slug || "";
      const publishedAt = post.publishedAt || "";

      // Format pubDate (RFC 822)
      let pubDate = "";
      if (publishedAt) {
        try {
          const date = new Date(publishedAt);
          pubDate = date.toUTCString();
        } catch {
          // Invalid date, skip pubDate
        }
      }

      // Escape XML
      const escapeXmlRss = (text: string): string => {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;");
      };

      return `  <item>
    <title>${escapeXmlRss(titleHe)}</title>
    <link>${baseUrl}/blog/${slug}</link>
    <guid>${baseUrl}/blog/${slug}</guid>
    ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
    <description>${escapeXmlRss(metaDescriptionHe)}</description>
  </item>`;
    }).join("\n");

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CarExpert Blog</title>
    <link>${baseUrl}/blog</link>
    <description>טיפים קצרים לרכב, אביזרים, תחזוקה וקנייה חכמה — מאמרים קצרים לקריאה מהירה</description>
    <language>he-IL</language>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(rss);
  } catch (error) {
    console.error("[seo] Error generating RSS:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route: /sitemap.xml
app.get("/sitemap.xml", async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const xml = await generateSitemap(baseUrl);

    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Vary", "Accept-Encoding");
    res.send(xml);
  } catch (error) {
    console.error("[seo] Error generating sitemap:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Export as Firebase HTTPS Function
export const seo = functions.https.onRequest(app);
