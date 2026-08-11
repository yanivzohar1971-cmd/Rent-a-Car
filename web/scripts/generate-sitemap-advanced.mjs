/**
 * Advanced Sitemap Generator
 * 
 * Generates a sitemap-index.xml and multiple sitemap files:
 * - sitemap-static.xml (main pages, blog categories)
 * - sitemap-blog.xml (blog posts and tags)
 * - sitemap-cars.xml (vehicle detail pages - requires Firestore access)
 * - sitemap-landing.xml (SEO landing pages)
 * 
 * Splits sitemaps if > 50k URLs per file (sitemap spec limit)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const publicDir = path.join(webRoot, "public");
const blogPostsPath = path.join(webRoot, "src", "assets", "blogPosts.he.json");
const seoLandingPagesPath = path.join(webRoot, "src", "assets", "seoLandingPages.he.json");

const BASE_URL = "https://www.carexperts4u.com";
const MAX_URLS_PER_SITEMAP = 50000; // Sitemap spec limit

// Ensure directories exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

/**
 * Generate a single sitemap XML file
 * Always returns valid XML, even if urls array is empty (empty urlset)
 */
function generateSitemapXml(urls) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  if (urls.length > 0) {
    urls.forEach((url) => {
      xml += `  <url>
    <loc>${url.loc}</loc>`;
      if (url.lastmod) {
        xml += `
    <lastmod>${url.lastmod}</lastmod>`;
      }
      if (url.changefreq) {
        xml += `
    <changefreq>${url.changefreq}</changefreq>`;
      }
      if (url.priority !== undefined) {
        xml += `
    <priority>${url.priority}</priority>`;
      }
      xml += `
  </url>
`;
    });
  }

  xml += `</urlset>`;
  return xml;
}

/**
 * Split URLs into chunks if needed
 */
function splitSitemap(urls, maxPerFile) {
  const chunks = [];
  for (let i = 0; i < urls.length; i += maxPerFile) {
    chunks.push(urls.slice(i, i + maxPerFile));
  }
  return chunks;
}

/**
 * Generate sitemap-index.xml
 */
function generateSitemapIndex(sitemaps) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  sitemaps.forEach((sitemap) => {
    xml += `  <sitemap>
    <loc>${BASE_URL}${sitemap.path}</loc>`;
    if (sitemap.lastmod) {
      xml += `
    <lastmod>${sitemap.lastmod}</lastmod>`;
    }
    xml += `
  </sitemap>
`;
  });

  xml += `</sitemapindex>`;
  return xml;
}

// Early exit if SKIP_SITEMAP_ADVANCED=1
if (process.env.SKIP_SITEMAP_ADVANCED === "1") {
  console.log("[gen:sitemap:advanced] SKIPPED via SKIP_SITEMAP_ADVANCED=1");
  process.exit(0);
}

/**
 * Check if error is network-related
 */
function isNetworkError(error) {
  const errorMessage = error.message?.toLowerCase() || "";
  const errorCode = error.code?.toLowerCase() || "";
  const networkPatterns = [
    "connection failed",
    "fetch failed",
    "econnreset",
    "enotfound",
    "etimedout",
    "eai_again",
    "network",
    "timeout",
    "connect econnrefused",
  ];
  return (
    networkPatterns.some((pattern) => errorMessage.includes(pattern)) ||
    networkPatterns.some((pattern) => errorCode.includes(pattern))
  );
}

/**
 * Generate minimal safe sitemap (homepage + main static pages only)
 */
function generateMinimalSitemap() {
  const today = new Date().toISOString().split("T")[0];
  const minimalUrls = [
    { loc: `${BASE_URL}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${BASE_URL}/cars`, priority: "0.9", changefreq: "hourly" },
    { loc: `${BASE_URL}/sell`, priority: "0.6", changefreq: "weekly" },
    { loc: `${BASE_URL}/blog`, priority: "0.7", changefreq: "weekly" },
  ];

  const minimalXml = generateSitemapXml(minimalUrls);
  const sitemapIndexXml = generateSitemapIndex([
    { path: "/sitemap-static.xml", lastmod: today },
  ]);

  // Write minimal sitemaps
  fs.writeFileSync(
    path.join(publicDir, "sitemap-static.xml"),
    minimalXml,
    "utf8"
  );
  fs.writeFileSync(
    path.join(publicDir, "sitemap-index.xml"),
    sitemapIndexXml,
    "utf8"
  );

  // Create minimal empty sitemaps for other files if they don't exist
  const emptyXml = generateSitemapXml([]);
  const otherSitemaps = ["sitemap-blog.xml", "sitemap-landing.xml", "sitemap-cars.xml"];
  otherSitemaps.forEach((filename) => {
    const filepath = path.join(publicDir, filename);
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, emptyXml, "utf8");
    }
  });

  console.log(
    `[generate-sitemap-advanced] Generated minimal sitemap (offline mode) with ${minimalUrls.length} URLs`
  );
}

try {
  // Read blog posts
  if (!fs.existsSync(blogPostsPath)) {
    console.warn(
      `[generate-sitemap-advanced] Warning: Blog posts file not found at ${blogPostsPath}, using minimal sitemap`
    );
    generateMinimalSitemap();
    process.exit(0);
  }

  let blogPosts;
  try {
    const blogPostsContent = fs.readFileSync(blogPostsPath, "utf8");
    blogPosts = JSON.parse(blogPostsContent);
  } catch (error) {
    if (isNetworkError(error)) {
      console.warn(
        `[generate-sitemap-advanced] Network error reading blog posts (offline mode): ${error.message}`
      );
      generateMinimalSitemap();
      process.exit(0);
    }
    throw error; // Re-throw non-network errors (JSON parse, file read permission, etc.)
  }

  // Read SEO landing pages
  let seoLandingPages = [];
  if (fs.existsSync(seoLandingPagesPath)) {
    try {
      const seoLandingPagesContent = fs.readFileSync(seoLandingPagesPath, "utf8");
      seoLandingPages = JSON.parse(seoLandingPagesContent);
    } catch (error) {
      if (isNetworkError(error)) {
        console.warn(
          `[generate-sitemap-advanced] Network error reading landing pages (offline mode): ${error.message}`
        );
        // Continue with empty array for landing pages
      } else {
        throw error; // Re-throw non-network errors
      }
    }
  } else {
    console.warn(`[generate-sitemap-advanced] Warning: SEO landing pages file not found at ${seoLandingPagesPath}`);
  }

  // Collect unique tags
  const uniqueTags = new Set();
  blogPosts.forEach((post) => {
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach((tag) => uniqueTags.add(tag));
    }
  });

  const today = new Date().toISOString().split("T")[0];

  // 1. Static pages sitemap
  const staticPages = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/cars", priority: "0.9", changefreq: "hourly" },
    { path: "/sell", priority: "0.6", changefreq: "weekly" },
    { path: "/blog", priority: "0.7", changefreq: "weekly" },
    { path: "/topics", priority: "0.7", changefreq: "weekly" },
    { path: "/legal/terms", priority: "0.2", changefreq: "yearly" },
    { path: "/legal/content-policy", priority: "0.2", changefreq: "yearly" },
  ];

  const staticUrls = staticPages.map((page) => ({
    loc: `${BASE_URL}${page.path}`,
    priority: page.priority,
    changefreq: page.changefreq,
  }));

  // 2. Blog sitemap (posts + tags)
  const blogUrls = [];

  // Blog posts
  blogPosts.forEach((post) => {
    if (!post.slug) return;

    const lastmod = post.publishedAt
      ? new Date(post.publishedAt).toISOString().split("T")[0]
      : today;

    blogUrls.push({
      loc: `${BASE_URL}/blog/${post.slug}`,
      lastmod,
      changefreq: "monthly",
      priority: "0.7",
    });
  });

  // Blog tag pages
  uniqueTags.forEach((tag) => {
    const encodedTag = encodeURIComponent(tag);
    blogUrls.push({
      loc: `${BASE_URL}/blog/tag/${encodedTag}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.4",
    });
  });

  // 3. Landing pages sitemap
  const landingUrls = seoLandingPages
    .filter((page) => page.path)
    .map((page) => ({
      loc: `${BASE_URL}${page.path}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.6",
    }));

  // Add /cars-for-sale if not already in landing pages
  if (!landingUrls.some((u) => u.loc.includes("/cars-for-sale"))) {
    landingUrls.unshift({
      loc: `${BASE_URL}/cars-for-sale`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.8",
    });
  }

  // 4. Vehicle detail pages sitemap
  // NOTE: This requires Firestore access. For now, we'll create an empty sitemap
  // that can be populated by a Cloud Function or build-time script with Firestore access
  const carUrls = [];
  // TODO: Fetch from Firestore publicCars collection
  // This should be done via a Cloud Function scheduled job or build script with Firebase Admin SDK

  // Generate sitemap files
  const sitemapFiles = [];

  // Static sitemap
  const staticXml = generateSitemapXml(staticUrls);
  const staticPath = "/sitemap-static.xml";
  fs.writeFileSync(path.join(publicDir, "sitemap-static.xml"), staticXml, "utf8");
  sitemapFiles.push({ path: staticPath, lastmod: today });

  // Blog sitemap (split if needed)
  const blogChunks = splitSitemap(blogUrls, MAX_URLS_PER_SITEMAP);
  blogChunks.forEach((chunk, index) => {
    const filename = index === 0 ? "sitemap-blog.xml" : `sitemap-blog-${index + 1}.xml`;
    const filepath = `/${filename}`;
    const xml = generateSitemapXml(chunk);
    fs.writeFileSync(path.join(publicDir, filename), xml, "utf8");
    sitemapFiles.push({ path: filepath, lastmod: today });
  });

  // Landing pages sitemap
  const landingXml = generateSitemapXml(landingUrls);
  fs.writeFileSync(path.join(publicDir, "sitemap-landing.xml"), landingXml, "utf8");
  sitemapFiles.push({ path: "/sitemap-landing.xml", lastmod: today });

  // Cars sitemap (empty for now, to be populated by Cloud Function)
  const carsXml = generateSitemapXml(carUrls);
  fs.writeFileSync(path.join(publicDir, "sitemap-cars.xml"), carsXml, "utf8");
  sitemapFiles.push({ path: "/sitemap-cars.xml", lastmod: today });

  // Generate sitemap-index
  const indexXml = generateSitemapIndex(sitemapFiles);
  fs.writeFileSync(path.join(publicDir, "sitemap-index.xml"), indexXml, "utf8");

  // Also create /sitemap.xml that redirects to sitemap-index (for backward compatibility)
  // In Firebase Hosting, this is handled by rewrites in firebase.json

  const totalUrls =
    staticUrls.length + blogUrls.length + landingUrls.length + carUrls.length;

  console.log(
    `[generate-sitemap-advanced] Generated sitemap-index.xml with ${sitemapFiles.length} sitemaps`
  );
  console.log(
    `[generate-sitemap-advanced] Total URLs: ${totalUrls} (${staticUrls.length} static, ${blogUrls.length} blog, ${landingUrls.length} landing, ${carUrls.length} cars)`
  );
  console.log(
    `[generate-sitemap-advanced] Note: Vehicle detail pages (sitemap-cars.xml) is empty and should be populated by a Cloud Function or build script with Firestore access`
  );
} catch (error) {
  // Check if it's a network error - fail-open with minimal sitemap
  if (isNetworkError(error)) {
    console.warn(
      `[generate-sitemap-advanced] Network error detected (offline mode): ${error.message}`
    );
    try {
      generateMinimalSitemap();
      process.exit(0);
    } catch (fallbackError) {
      // If even minimal sitemap generation fails, check if existing sitemap exists
      const existingIndexPath = path.join(publicDir, "sitemap-index.xml");
      if (fs.existsSync(existingIndexPath)) {
        console.warn(
          `[generate-sitemap-advanced] Keeping existing sitemap due to network error`
        );
        process.exit(0);
      }
      // Last resort: fail (but this should be very rare)
      console.error(
        `[generate-sitemap-advanced] Critical error: ${fallbackError.message}`
      );
      process.exit(1);
    }
  } else {
    // Non-network errors (JSON parse, file write permission, etc.) - fail build
    console.error(
      `[generate-sitemap-advanced] Error generating sitemaps:`,
      error.message
    );
    process.exit(1);
  }
}

