/**
 * Generate sitemap-cars.xml from Firestore publicCars collection
 * 
 * This function:
 * - Queries published cars from publicCars collection
 * - Generates XML sitemap files (splits if >50k URLs)
 * - Stores in Cloud Storage for serving via HTTPS function
 * - Updates sitemap-index.xml references
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket();

const BASE_URL = "https://www.carexperts4u.com";
const MAX_URLS_PER_SITEMAP = 50000; // Sitemap spec limit
const SITEMAP_STORAGE_PATH = "seo/sitemaps";

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

/**
 * Format date to ISO 8601 (YYYY-MM-DD)
 */
function formatDate(date: admin.firestore.Timestamp | number | null | undefined): string | undefined {
  if (!date) return undefined;
  
  try {
    let dateObj: Date;
    if (date instanceof admin.firestore.Timestamp) {
      dateObj = date.toDate();
    } else if (typeof date === "number") {
      dateObj = new Date(date);
    } else {
      return undefined;
    }
    
    return dateObj.toISOString().split("T")[0];
  } catch {
    return undefined;
  }
}

/**
 * Generate a single sitemap XML file
 */
function generateSitemapXml(urls: Array<{ loc: string; lastmod?: string }>): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  if (urls.length > 0) {
    urls.forEach((url) => {
      xml += `  <url>
    <loc>${escapeXml(url.loc)}</loc>`;
      if (url.lastmod) {
        xml += `
    <lastmod>${escapeXml(url.lastmod)}</lastmod>`;
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
 * Generate sitemap-index.xml that references all car sitemaps
 */
function generateSitemapIndex(sitemapFiles: string[]): string {
  const today = new Date().toISOString().split("T")[0];
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  sitemapFiles.forEach((filename) => {
    xml += `  <sitemap>
    <loc>${BASE_URL}/${filename}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
`;
  });

  xml += `</sitemapindex>`;
  return xml;
}

/**
 * Upload XML content to Cloud Storage
 * Files are kept private; served via HTTPS function for security
 */
async function uploadToStorage(
  filename: string,
  content: string,
  contentType: string = "application/xml"
): Promise<void> {
  const file = bucket.file(`${SITEMAP_STORAGE_PATH}/${filename}`);
  
  await file.save(content, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=3600",
    },
    // Do NOT set public: true - files remain private, served via function
  });
  
  console.log(`[generateCarsSitemap] Uploaded ${filename} to ${SITEMAP_STORAGE_PATH}/`);
}

/**
 * Main function to generate cars sitemap
 */
export async function generateCarsSitemap(): Promise<{
  sitemapFiles: string[];
  totalUrls: number;
}> {
  console.log("[generateCarsSitemap] Starting generation...");

  try {
    // Query all published cars
    const publicCarsQuery = db
      .collection("publicCars")
      .where("isPublished", "==", true);

    const snapshot = await publicCarsQuery.get();
    console.log(`[generateCarsSitemap] Found ${snapshot.size} published cars`);

    // Build URL list with lastmod
    const urls: Array<{ loc: string; lastmod?: string }> = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const carId = doc.id;
      
      // Only include cars with valid ID
      if (!carId) {
        return;
      }

      const lastmod = formatDate(data.updatedAt || data.createdAt);
      
      urls.push({
        loc: `${BASE_URL}/car/${carId}`,
        lastmod,
      });
    });

    console.log(`[generateCarsSitemap] Generated ${urls.length} URLs`);

    // Verification logging
    if (urls.length > 0) {
      const firstUrl = urls[0].loc;
      const lastUrl = urls[urls.length - 1].loc;
      console.log(`[generateCarsSitemap] First URL: ${firstUrl}`);
      console.log(`[generateCarsSitemap] Last URL: ${lastUrl}`);
    }

    // Split into chunks if needed
    const sitemapFiles: string[] = [];
    const chunks: Array<Array<{ loc: string; lastmod?: string }>> = [];

    for (let i = 0; i < urls.length; i += MAX_URLS_PER_SITEMAP) {
      chunks.push(urls.slice(i, i + MAX_URLS_PER_SITEMAP));
    }

    console.log(`[generateCarsSitemap] Split into ${chunks.length} sitemap file(s)`);

    // Generate sitemap files
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const filename = i === 0 ? "sitemap-cars.xml" : `sitemap-cars-${i + 1}.xml`;
      
      const xml = generateSitemapXml(chunk);
      await uploadToStorage(filename, xml);
      
      sitemapFiles.push(filename);
      console.log(`[generateCarsSitemap] Generated ${filename} with ${chunk.length} URLs`);
    }

    // If no cars, still generate empty sitemap
    if (sitemapFiles.length === 0) {
      const xml = generateSitemapXml([]);
      await uploadToStorage("sitemap-cars.xml", xml);
      sitemapFiles.push("sitemap-cars.xml");
      console.log("[generateCarsSitemap] Generated empty sitemap-cars.xml");
    }

    console.log(`[generateCarsSitemap] Completed: ${sitemapFiles.length} file(s), ${urls.length} total URLs`);

    return {
      sitemapFiles,
      totalUrls: urls.length,
    };
  } catch (error) {
    console.error("[generateCarsSitemap] Error:", error);
    throw error;
  }
}

/**
 * Scheduled function to regenerate cars sitemap every 6 hours
 */
export const scheduledGenerateCarsSitemap = functions.pubsub
  .schedule("every 6 hours")
  .timeZone("Asia/Jerusalem")
  .onRun(async (context) => {
    console.log("[scheduledGenerateCarsSitemap] Triggered at", new Date().toISOString());
    
    try {
      const result = await generateCarsSitemap();
      console.log("[scheduledGenerateCarsSitemap] Success:", result);
      return result;
    } catch (error) {
      console.error("[scheduledGenerateCarsSitemap] Error:", error);
      throw error;
    }
  });

/**
 * Validate filename to prevent path traversal
 * Only allows: sitemap-cars.xml or sitemap-cars-<positive-number>.xml
 */
function validateSitemapFilename(filename: string): boolean {
  // Must start with sitemap-cars and end with .xml
  if (!filename.startsWith("sitemap-cars") || !filename.endsWith(".xml")) {
    return false;
  }

  // Exact match: sitemap-cars.xml
  if (filename === "sitemap-cars.xml") {
    return true;
  }

  // Pattern: sitemap-cars-<number>.xml
  const match = filename.match(/^sitemap-cars-(\d+)\.xml$/);
  if (!match) {
    return false;
  }

  // Validate number is positive and within safe range (max 100 parts)
  const number = parseInt(match[1], 10);
  return number > 0 && number <= 100;
}

/**
 * HTTPS function to serve sitemap-cars*.xml files from Cloud Storage
 * Files are kept private in GCS; function serves them publicly via service account
 */
export const serveCarsSitemap = functions.https.onRequest(async (req, res) => {
  try {
    // Extract filename from path
    const pathParts = req.path.split("/").filter((p) => p);
    const filename = pathParts[pathParts.length - 1] || "sitemap-cars.xml";
    
    // Validate filename (security: prevent path traversal)
    if (!validateSitemapFilename(filename)) {
      console.error(`[serveCarsSitemap] Invalid filename: ${filename}`);
      res.status(404).send("Not Found");
      return;
    }

    const file = bucket.file(`${SITEMAP_STORAGE_PATH}/${filename}`);
    const [exists] = await file.exists();
    
    if (!exists) {
      console.error(`[serveCarsSitemap] File not found: ${SITEMAP_STORAGE_PATH}/${filename}`);
      // Return valid minimal XML 404 response
      res.status(404).set("Content-Type", "application/xml; charset=utf-8").send(
        '<?xml version="1.0" encoding="UTF-8"?><error><message>Sitemap not found</message></error>'
      );
      return;
    }

    // Download file using service account (files remain private in GCS)
    const [content] = await file.download();
    const xml = content.toString("utf8");

    // Validate XML is well-formed (basic check)
    if (!xml.includes("<?xml") || (!xml.includes("<urlset") && !xml.includes("</urlset>"))) {
      console.error(`[serveCarsSitemap] Invalid XML content in ${filename}`);
      res.status(500).set("Content-Type", "application/xml; charset=utf-8").send(
        '<?xml version="1.0" encoding="UTF-8"?><error><message>Invalid sitemap content</message></error>'
      );
      return;
    }

    // Set correct headers for search engines
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.set("Vary", "Accept-Encoding");
    res.status(200).send(xml);
  } catch (error) {
    console.error("[serveCarsSitemap] Error:", error);
    res.status(500).set("Content-Type", "application/xml; charset=utf-8").send(
      '<?xml version="1.0" encoding="UTF-8"?><error><message>Internal Server Error</message></error>'
    );
  }
});

