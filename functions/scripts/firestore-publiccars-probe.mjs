#!/usr/bin/env node
/**
 * Firestore PublicCars Probe (Read-Only)
 * 
 * Diagnoses why sitemap-cars.xml is empty by checking:
 * - Collection existence
 * - Document counts
 * - Field names for published status
 * - Sample documents
 * 
 * Uses firebase-admin SDK (service account from Functions environment)
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project ID from firebase.json (in repo root)
let projectId = "carexpert-94faa"; // default
try {
  const firebaseJsonPath = join(__dirname, "..", "..", "firebase.json");
  const firebaseJson = JSON.parse(readFileSync(firebaseJsonPath, "utf8"));
  // Try to get project from .firebaserc or use default
  if (firebaseJson.project) {
    projectId = firebaseJson.project;
  }
} catch (error) {
  // Use default if firebase.json not found
}

// Initialize admin SDK
// Note: This script requires authentication. Options:
// 1. Run via Firebase Functions emulator (uses emulator credentials)
// 2. Set GOOGLE_APPLICATION_CREDENTIALS to service account key file
// 3. Use gcloud auth application-default login
if (!admin.apps.length) {
  try {
    // Try to use Application Default Credentials (from gcloud or service account)
    admin.initializeApp({
      projectId: projectId,
      credential: admin.credential.applicationDefault(),
    });
  } catch (error) {
    // Fallback: try without explicit credential (may work in some environments)
    try {
      admin.initializeApp({
        projectId: projectId,
      });
    } catch (fallbackError) {
      console.error("\n❌ Failed to initialize Firebase Admin SDK");
      console.error("   Error:", error.message || fallbackError.message);
      console.error("\n   This script requires authentication to access Firestore.");
      console.error("   Options:");
      console.error("   1. Install gcloud CLI and run: gcloud auth application-default login");
      console.error("   2. Set GOOGLE_APPLICATION_CREDENTIALS to service account key file path");
      console.error("   3. Run via Firebase Functions emulator (uses emulator credentials)");
      console.error("\n   Note: Firebase CLI login (firebase login) is not sufficient for this script.");
      console.error("   You need Application Default Credentials (ADC) from gcloud.");
      throw fallbackError;
    }
  }
}

const db = admin.firestore();

/**
 * Format timestamp for display
 */
function formatTimestamp(ts) {
  if (!ts) return "N/A";
  if (ts.toDate) {
    return ts.toDate().toISOString();
  }
  if (typeof ts === "number") {
    return new Date(ts).toISOString();
  }
  return String(ts);
}

/**
 * Get safe field value (no sensitive data)
 */
function getSafeField(doc, fieldName) {
  const value = doc[fieldName];
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.length > 100) {
    return value.substring(0, 100) + "...";
  }
  return value;
}

/**
 * Check collection and count documents
 */
async function probeCollection(collectionName) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Collection: ${collectionName}`);
  console.log("=".repeat(60));

  try {
    // Check if collection exists (try to read first doc)
    const firstDoc = await db.collection(collectionName).limit(1).get();
    
    if (firstDoc.empty) {
      console.log(`⚠️  Collection exists but is EMPTY (0 documents)`);
      return { exists: true, totalCount: 0, publishedCount: 0 };
    }

    // Count total documents (sample-based, limited)
    const sampleSize = 1000;
    const totalSample = await db.collection(collectionName).limit(sampleSize).get();
    const totalCount = totalSample.size;
    const isLimited = totalCount === sampleSize;
    
    console.log(`✅ Collection exists`);
    console.log(`   Total documents (sampled): ${totalCount}${isLimited ? "+" : ""} ${isLimited ? `(at least ${sampleSize}, may be more)` : ""}`);

    // Check for published status fields
    const publishedFields = [
      { name: "isPublished", value: true },
      { name: "published", value: true },
      { name: "is_public", value: true },
      { name: "status", value: "PUBLISHED" },
      { name: "status", value: "published" },
      { name: "publicationStatus", value: "PUBLISHED" },
      { name: "visibility", value: "PUBLIC" },
    ];

    console.log(`\n   Checking published status fields...`);
    
    let publishedCount = 0;
    let foundField = null;

    for (const field of publishedFields) {
      try {
        const query = db.collection(collectionName).where(field.name, "==", field.value);
        const snapshot = await query.limit(1000).get();
        
        if (snapshot.size > 0) {
          console.log(`   ✅ Found ${snapshot.size}${snapshot.size === 1000 ? "+" : ""} documents with ${field.name} == ${JSON.stringify(field.value)}`);
          if (!foundField || snapshot.size > publishedCount) {
            foundField = field;
            publishedCount = snapshot.size;
          }
        }
      } catch (error) {
        // Field doesn't exist or query failed (expected for some field/value combinations)
        // Silently continue
      }
    }

    if (!foundField) {
      console.log(`   ⚠️  No published documents found with any known field pattern`);
      console.log(`   → Checking sample documents for field names...`);
    } else {
      console.log(`\n   📊 Best match: ${foundField.name} == ${JSON.stringify(foundField.value)} → ${publishedCount}${publishedCount === 1000 ? "+" : ""} documents`);
    }

    // Get sample documents to show field structure
    console.log(`\n   Sample documents (last 3, safe fields only):`);
    const recentDocs = await db.collection(collectionName)
      .orderBy("updatedAt", "desc")
      .limit(3)
      .get();

    if (recentDocs.empty) {
      // Try without orderBy if updatedAt doesn't exist
      const anyDocs = await db.collection(collectionName).limit(3).get();
      anyDocs.forEach((doc, idx) => {
        const data = doc.data();
        console.log(`\n   [${idx + 1}] ID: ${doc.id}`);
        console.log(`       Fields: ${Object.keys(data).join(", ")}`);
        console.log(`       isPublished: ${getSafeField(data, "isPublished")}`);
        console.log(`       published: ${getSafeField(data, "published")}`);
        console.log(`       status: ${getSafeField(data, "status")}`);
        console.log(`       publicationStatus: ${getSafeField(data, "publicationStatus")}`);
        console.log(`       updatedAt: ${formatTimestamp(data.updatedAt || data.createdAt)}`);
      });
    } else {
      recentDocs.forEach((doc, idx) => {
        const data = doc.data();
        console.log(`\n   [${idx + 1}] ID: ${doc.id}`);
        console.log(`       Fields: ${Object.keys(data).slice(0, 10).join(", ")}${Object.keys(data).length > 10 ? "..." : ""}`);
        console.log(`       isPublished: ${getSafeField(data, "isPublished")}`);
        console.log(`       published: ${getSafeField(data, "published")}`);
        console.log(`       status: ${getSafeField(data, "status")}`);
        console.log(`       publicationStatus: ${getSafeField(data, "publicationStatus")}`);
        console.log(`       updatedAt: ${formatTimestamp(data.updatedAt || data.createdAt)}`);
      });
    }

    return {
      exists: true,
      totalCount: totalCount,
      publishedCount: publishedCount,
      foundField: foundField,
    };
  } catch (error) {
    if (error.code === 7 || error.message?.includes("not found")) {
      console.log(`❌ Collection does NOT exist or access denied`);
      return { exists: false, totalCount: 0, publishedCount: 0 };
    }
    console.error(`❌ Error probing collection:`, error.message);
    throw error;
  }
}

/**
 * Main probe function
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Firestore PublicCars Probe (Read-Only)");
  console.log(`Project: ${admin.app().options.projectId || "unknown"}`);
  console.log("=".repeat(60));

  const collections = ["publicCars", "carAds"];

  const results = {};

  for (const collectionName of collections) {
    results[collectionName] = await probeCollection(collectionName);
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));

  for (const [collectionName, result] of Object.entries(results)) {
    console.log(`\n${collectionName}:`);
    if (!result.exists) {
      console.log(`  ❌ Collection does not exist or access denied`);
    } else {
      console.log(`  Total documents: ${result.totalCount}${result.totalCount >= 1000 ? "+" : ""}`);
      if (result.foundField) {
        console.log(`  Published (${result.foundField.name} == ${JSON.stringify(result.foundField.value)}): ${result.publishedCount}${result.publishedCount >= 1000 ? "+" : ""}`);
      } else {
        console.log(`  Published: 0 (no matching field found)`);
      }
    }
  }

  // Diagnosis
  console.log(`\n${"=".repeat(60)}`);
  console.log("DIAGNOSIS");
  console.log("=".repeat(60));

  const publicCarsResult = results.publicCars;
  
  if (!publicCarsResult.exists) {
    console.log(`\n❌ Collection 'publicCars' does not exist or access denied.`);
    console.log(`   → Check Firestore security rules and service account permissions.`);
  } else if (publicCarsResult.totalCount === 0) {
    console.log(`\n⚠️  Collection 'publicCars' exists but is EMPTY (0 documents).`);
    console.log(`   → No cars have been published to publicCars collection yet.`);
    console.log(`   → Check if cars are being published from users/{uid}/carSales.`);
  } else if (publicCarsResult.publishedCount === 0) {
    console.log(`\n⚠️  Collection has ${publicCarsResult.totalCount} documents, but 0 are published.`);
    if (publicCarsResult.foundField) {
      console.log(`   → Found field '${publicCarsResult.foundField.name}' but query returned 0.`);
    } else {
      console.log(`   → No published status field found matching known patterns.`);
      console.log(`   → Check sample documents above for actual field names.`);
      console.log(`   → Update generateCarsSitemap.ts to use correct field name.`);
    }
  } else {
    console.log(`\n✅ Found ${publicCarsResult.publishedCount} published cars in 'publicCars'.`);
    if (publicCarsResult.foundField.name !== "isPublished" || publicCarsResult.foundField.value !== true) {
      console.log(`   ⚠️  Field used: ${publicCarsResult.foundField.name} == ${JSON.stringify(publicCarsResult.foundField.value)}`);
      console.log(`   → Current code uses: isPublished == true`);
      console.log(`   → Consider updating generateCarsSitemap.ts to use: ${publicCarsResult.foundField.name} == ${JSON.stringify(publicCarsResult.foundField.value)}`);
    } else {
      console.log(`   → Field matches current code (isPublished == true)`);
      console.log(`   → If sitemap is still empty, check:`);
      console.log(`     - Has scheduledGenerateCarsSitemap run?`);
      console.log(`     - Check function logs for errors`);
      console.log(`     - Try manual run: runCarsSitemapNow (requires admin token)`);
    }
  }

  console.log(`\n${"=".repeat(60)}\n`);
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});

