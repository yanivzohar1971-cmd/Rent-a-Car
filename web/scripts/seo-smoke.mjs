#!/usr/bin/env node

/**
 * SEO Smoke Test
 * 
 * Verifies that all sitemap files exist in dist/ after build.
 * Exits with non-zero code if any files are missing or invalid.
 * 
 * Usage: npm run seo:smoke
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const distDir = path.join(webRoot, "dist");

const REQUIRED_SITEMAPS = [
  "sitemap-index.xml",
  "sitemap-static.xml",
  "sitemap-blog.xml",
  "sitemap-landing.xml",
  "sitemap-cars.xml",
];

let errors = [];

// Check if dist directory exists
if (!fs.existsSync(distDir)) {
  console.error(`[seo-smoke] ERROR: dist/ directory not found at ${distDir}`);
  console.error(`[seo-smoke] Run 'npm run build' first.`);
  process.exit(1);
}

// Check each required sitemap file exists
console.log("[seo-smoke] Checking sitemap files...");
for (const filename of REQUIRED_SITEMAPS) {
  const filePath = path.join(distDir, filename);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing file: ${filename}`);
    console.error(`[seo-smoke] ❌ Missing: ${filename}`);
  } else {
    console.log(`[seo-smoke] ✅ Found: ${filename}`);
  }
}

// Parse sitemap-index.xml and verify all referenced files exist
const indexPath = path.join(distDir, "sitemap-index.xml");
if (fs.existsSync(indexPath)) {
  try {
    const indexContent = fs.readFileSync(indexPath, "utf8");
    
    // Simple regex-based parsing (no external dependencies)
    const sitemapMatches = indexContent.match(/<loc>([^<]+)<\/loc>/g);
    if (!sitemapMatches || sitemapMatches.length === 0) {
      errors.push("sitemap-index.xml has no <loc> entries");
      console.error("[seo-smoke] ❌ sitemap-index.xml has no <loc> entries");
    } else {
      const referencedSitemaps = sitemapMatches.map((match) => {
        // Extract URL from <loc>...</loc>
        const url = match.replace(/<\/?loc>/g, "");
        // Extract filename from URL
        const filename = url.split("/").pop();
        return filename;
      });

      console.log("[seo-smoke] Checking referenced sitemaps in index...");
      for (const filename of referencedSitemaps) {
        const filePath = path.join(distDir, filename);
        if (!fs.existsSync(filePath)) {
          errors.push(`sitemap-index.xml references missing file: ${filename}`);
          console.error(`[seo-smoke] ❌ Referenced but missing: ${filename}`);
        } else {
          console.log(`[seo-smoke] ✅ Referenced file exists: ${filename}`);
        }
      }
    }
  } catch (error) {
    errors.push(`Failed to parse sitemap-index.xml: ${error.message}`);
    console.error(`[seo-smoke] ❌ Failed to parse sitemap-index.xml: ${error.message}`);
  }
} else {
  errors.push("sitemap-index.xml not found");
}

// Validate XML structure of each sitemap
console.log("[seo-smoke] Validating XML structure...");
for (const filename of REQUIRED_SITEMAPS) {
  const filePath = path.join(distDir, filename);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      
      // Basic XML validation: check for root element
      if (filename === "sitemap-index.xml") {
        if (!content.includes("<sitemapindex")) {
          errors.push(`${filename} missing <sitemapindex> root element`);
          console.error(`[seo-smoke] ❌ ${filename} has invalid root element`);
        } else {
          console.log(`[seo-smoke] ✅ ${filename} has valid <sitemapindex> root`);
        }
      } else {
        if (!content.includes("<urlset")) {
          errors.push(`${filename} missing <urlset> root element`);
          console.error(`[seo-smoke] ❌ ${filename} has invalid root element`);
        } else {
          console.log(`[seo-smoke] ✅ ${filename} has valid <urlset> root`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read ${filename}: ${error.message}`);
      console.error(`[seo-smoke] ❌ Failed to read ${filename}: ${error.message}`);
    }
  }
}

// Summary
if (errors.length > 0) {
  console.error("\n[seo-smoke] ❌ FAILED: Found", errors.length, "error(s):");
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
} else {
  console.log("\n[seo-smoke] ✅ All checks passed!");
  process.exit(0);
}
