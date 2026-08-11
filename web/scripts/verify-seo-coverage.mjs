import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const requiredKeywordsPath = path.join(webRoot, "src", "assets", "seoRequiredKeywords.he.json");
const seoLandingPagesPath = path.join(webRoot, "src", "assets", "seoLandingPages.he.json");

try {
  // Read required keywords
  if (!fs.existsSync(requiredKeywordsPath)) {
    console.error(`[verify-seo-coverage] Error: Required keywords file not found at ${requiredKeywordsPath}`);
    process.exit(1);
  }
  const requiredKeywordsContent = fs.readFileSync(requiredKeywordsPath, "utf8");
  const requiredKeywords = JSON.parse(requiredKeywordsContent);

  // Read SEO landing pages
  if (!fs.existsSync(seoLandingPagesPath)) {
    console.error(`[verify-seo-coverage] Error: SEO landing pages file not found at ${seoLandingPagesPath}`);
    process.exit(1);
  }
  const seoLandingPagesContent = fs.readFileSync(seoLandingPagesPath, "utf8");
  const seoLandingPages = JSON.parse(seoLandingPagesContent);

  // Validate total count
  if (seoLandingPages.length !== 70) {
    console.error(`[verify-seo-coverage] ERROR: Expected 70 SEO pages, found ${seoLandingPages.length}`);
    process.exit(1);
  }

  // Collect targetKeywords from pages
  const foundKeywords = new Set();
  const keywordToPage = new Map();
  const duplicates = [];

  seoLandingPages.forEach((page, index) => {
    if (!page.targetKeyword) {
      console.error(`[verify-seo-coverage] ERROR: Page at index ${index} (slug: ${page.slug || 'unknown'}) is missing targetKeyword field`);
      process.exit(1);
    }

    if (foundKeywords.has(page.targetKeyword)) {
      duplicates.push({
        keyword: page.targetKeyword,
        pages: [keywordToPage.get(page.targetKeyword), page.slug || `index-${index}`]
      });
    } else {
      foundKeywords.add(page.targetKeyword);
      keywordToPage.set(page.targetKeyword, page.slug || `index-${index}`);
    }
  });

  // Find missing keywords
  const missingKeywords = requiredKeywords.filter(kw => !foundKeywords.has(kw));

  // Find extra keywords (not in required list)
  const extraKeywords = Array.from(foundKeywords).filter(kw => !requiredKeywords.includes(kw));

  // Report results
  if (duplicates.length > 0) {
    console.error(`[verify-seo-coverage] ERROR: Found ${duplicates.length} duplicate targetKeywords:`);
    duplicates.forEach(dup => {
      console.error(`  - "${dup.keyword}" appears in: ${dup.pages.join(", ")}`);
    });
    process.exit(1);
  }

  if (missingKeywords.length > 0) {
    console.error(`[verify-seo-coverage] ERROR: Missing ${missingKeywords.length} required keywords:`);
    missingKeywords.forEach(kw => {
      console.error(`  - "${kw}"`);
    });
    process.exit(1);
  }

  if (extraKeywords.length > 0) {
    console.warn(`[verify-seo-coverage] WARNING: Found ${extraKeywords.length} extra keywords not in required list:`);
    extraKeywords.forEach(kw => {
      console.warn(`  - "${kw}"`);
    });
  }

  // Success
  console.log(`[verify-seo-coverage] ✓ PASS: All 70 required keywords are covered exactly once`);
  console.log(`[verify-seo-coverage]   Total pages: ${seoLandingPages.length}`);
  console.log(`[verify-seo-coverage]   Required keywords: ${requiredKeywords.length}`);
  console.log(`[verify-seo-coverage]   Coverage: 100%`);
} catch (error) {
  console.error(`[verify-seo-coverage] Error:`, error.message);
  process.exit(1);
}
