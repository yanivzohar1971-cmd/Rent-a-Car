#!/usr/bin/env node
/**
 * Firestore PublicCars Probe (Read-Only)
 * 
 * Diagnoses why sitemap-cars.xml is empty by calling the secured Cloud Function.
 * This avoids requiring Application Default Credentials (ADC) locally.
 * 
 * Usage:
 *   PROBE_URL=https://us-central1-carexpert-94faa.cloudfunctions.net/probePublicCarsNow \
 *   PROBE_TOKEN=<your-admin-token> \
 *   npm run probe:publiccars
 */

const PROBE_URL = process.env.PROBE_URL || "https://us-central1-carexpert-94faa.cloudfunctions.net/probePublicCarsNow";
const PROBE_TOKEN = process.env.PROBE_TOKEN;

/**
 * Fetch URL and return response
 */
async function fetchProbe() {
  if (!PROBE_TOKEN) {
    console.error("❌ Error: PROBE_TOKEN environment variable is required");
    console.error("\n   To use this script:");
    console.error("   1. Set PROBE_URL (optional, defaults to production function)");
    console.error("   2. Set PROBE_TOKEN to your admin token (stored securely, never in git)");
    console.error("\n   Example:");
    console.error("   $env:PROBE_TOKEN=\"<your-token>\"; npm run probe:publiccars");
    console.error("\n   Or use curl directly:");
    console.error(`   curl -H "x-admin-token: <REDACTED>" ${PROBE_URL}`);
    process.exit(1);
  }

  try {
    const response = await fetch(PROBE_URL, {
      method: "GET",
      headers: {
        "x-admin-token": PROBE_TOKEN,
        "User-Agent": "CarExpert-Probe-Script/1.0",
      },
    });

    const status = response.status;
    const body = await response.json();

    return { status, body, ok: response.ok };
  } catch (error) {
    return {
      status: 0,
      body: null,
      ok: false,
      error: error.message,
    };
  }
}

/**
 * Format the probe response
 */
function formatResponse(result) {
  if (!result.ok) {
    if (result.status === 401) {
      console.error("❌ Unauthorized: Invalid or missing x-admin-token");
      console.error("   Check that PROBE_TOKEN is set correctly");
    } else if (result.status === 500) {
      console.error("❌ Server error:", result.body?.error || "Unknown error");
    } else {
      console.error("❌ Request failed:", result.error || `HTTP ${result.status}`);
    }
    return;
  }

  const data = result.body;

  console.log("=".repeat(60));
  console.log("Firestore PublicCars Probe Results");
  console.log("=".repeat(60));

  console.log(`\nCollection Used: ${data.collectionUsed}`);
  console.log(`Total Documents: ${data.totals.all}`);
  console.log(`Published Documents: ${data.totals.published}`);
  console.log(`Field Matched: ${data.fieldMatched || "none"}`);

  if (data.notes && data.notes.length > 0) {
    console.log(`\nNotes:`);
    data.notes.forEach((note) => console.log(`  - ${note}`));
  }

  if (data.diagnosis && data.diagnosis.length > 0) {
    console.log(`\nDiagnosis:`);
    data.diagnosis.forEach((diag) => console.log(`  - ${diag}`));
  }

  if (data.sample && data.sample.length > 0) {
    console.log(`\nSample Documents (last 3):`);
    data.sample.forEach((doc, idx) => {
      console.log(`\n  [${idx + 1}] ID: ${doc.id}`);
      console.log(`      Published: ${doc.published}`);
      console.log(`      Status: ${doc.status || "N/A"}`);
      console.log(`      Updated: ${doc.updatedAt}`);
      if (doc.slug) {
        console.log(`      Slug: ${doc.slug}`);
      }
    });
  }

  console.log("\n" + "=".repeat(60));
}

/**
 * Main function
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Firestore PublicCars Probe (via Cloud Function)");
  console.log(`Function URL: ${PROBE_URL}`);
  console.log("=".repeat(60));
  console.log("\n⚠️  Note: This script calls a secured Cloud Function.");
  console.log("   No local credentials (ADC) are required.\n");

  const result = await fetchProbe();
  formatResponse(result);

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
