#!/usr/bin/env node
/**
 * Production SEO Verification Script
 * 
 * Validates that production endpoints serve correct content and headers.
 * Uses Node built-ins only (no external dependencies).
 */

const BASE_URL = "https://www.carexperts4u.com";

/**
 * Fetch URL and return response with status, headers, and body
 */
async function fetchUrl(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "CarExpert-SEO-Verify/1.0",
      },
    });

    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());
    const body = await response.text();

    return { status, headers, body, ok: response.ok };
  } catch (error) {
    return {
      status: 0,
      headers: {},
      body: "",
      ok: false,
      error: error.message,
    };
  }
}

/**
 * Check robots.txt
 */
async function checkRobotsTxt() {
  console.log("\n[1/3] Checking /robots.txt...");
  const result = await fetchUrl(`${BASE_URL}/robots.txt`);

  if (!result.ok || result.status !== 200) {
    console.error(`  ❌ FAIL: HTTP ${result.status}`);
    return false;
  }

  const hasSitemap = result.body.includes("Sitemap: https://www.carexperts4u.com/sitemap-index.xml");
  if (!hasSitemap) {
    console.error("  ❌ FAIL: Missing sitemap directive");
    return false;
  }

  console.log("  ✅ PASS: Contains correct sitemap directive");
  return true;
}

/**
 * Check sitemap-index.xml
 */
async function checkSitemapIndex() {
  console.log("\n[2/3] Checking /sitemap-index.xml...");
  const result = await fetchUrl(`${BASE_URL}/sitemap-index.xml`);

  if (!result.ok || result.status !== 200) {
    console.error(`  ❌ FAIL: HTTP ${result.status}`);
    return false;
  }

  const contentType = result.headers["content-type"] || "";
  if (!contentType.includes("xml") && !contentType.includes("text")) {
    console.warn(`  ⚠️  WARN: Content-Type is ${contentType} (expected xml/text)`);
  }

  const requiredSitemaps = [
    "sitemap-static.xml",
    "sitemap-blog.xml",
    "sitemap-landing.xml",
    "sitemap-cars.xml",
  ];

  const missing = requiredSitemaps.filter((name) => !result.body.includes(name));
  if (missing.length > 0) {
    console.error(`  ❌ FAIL: Missing references: ${missing.join(", ")}`);
    return false;
  }

  console.log("  ✅ PASS: Contains all required sitemap references");
  return true;
}

/**
 * Check sitemap-cars.xml
 */
async function checkSitemapCars() {
  console.log("\n[3/3] Checking /sitemap-cars.xml...");
  const result = await fetchUrl(`${BASE_URL}/sitemap-cars.xml`);

  if (result.status === 404) {
    console.warn("  ⚠️  WARN: HTTP 404 (sitemap not generated yet)");
    return true; // Not a critical failure, just needs generation
  }

  if (!result.ok || result.status !== 200) {
    console.error(`  ❌ FAIL: HTTP ${result.status}`);
    return false;
  }

  const contentType = result.headers["content-type"] || "";
  if (!contentType.includes("xml") && !contentType.includes("application/xml")) {
    console.warn(`  ⚠️  WARN: Content-Type is ${contentType} (expected application/xml)`);
  }

  const cacheControl = result.headers["cache-control"] || "";
  if (!cacheControl.includes("max-age=3600")) {
    console.warn(`  ⚠️  WARN: Cache-Control missing max-age=3600 (got: ${cacheControl})`);
  }

  // Check if empty
  const hasUrlset = result.body.includes("<urlset");
  const hasUrl = result.body.includes("<url>");
  
  if (!hasUrlset) {
    console.error("  ❌ FAIL: Invalid XML (missing <urlset>)");
    return false;
  }

  if (!hasUrl) {
    console.warn("  ⚠️  EMPTY: sitemap-cars.xml contains no <url> entries");
    console.warn("  → This is expected if no published cars exist or function hasn't run yet");
    return true; // Not a critical failure
  }

  // Count URLs (rough estimate)
  const urlMatches = result.body.match(/<url>/g);
  const urlCount = urlMatches ? urlMatches.length : 0;
  console.log(`  ✅ PASS: Contains ${urlCount} URL(s)`);
  return true;
}

/**
 * Main verification
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Production SEO Verification");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("=".repeat(60));

  const results = {
    robots: await checkRobotsTxt(),
    index: await checkSitemapIndex(),
    cars: await checkSitemapCars(),
  };

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  robots.txt:     ${results.robots ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  sitemap-index:  ${results.index ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  sitemap-cars:   ${results.cars ? "✅ PASS" : "⚠️  WARN/EMPTY"}`);
  console.log("=".repeat(60));

  const allCritical = results.robots && results.index;
  if (allCritical) {
    console.log("\n✅ All critical checks passed!");
    process.exit(0);
  } else {
    console.log("\n❌ Some critical checks failed!");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});

