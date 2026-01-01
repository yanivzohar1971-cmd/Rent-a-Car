/**
 * Probe PublicCars Collection (Read-Only Diagnostic)
 * 
 * HTTPS function to diagnose why sitemap-cars.xml is empty.
 * Checks Firestore collections for published cars without requiring local credentials.
 * 
 * Protection: Requires x-admin-token header matching functions config secret.
 * 
 * Usage:
 *   curl -H "x-admin-token: <REDACTED>" https://us-central1-carexpert-94faa.cloudfunctions.net/probePublicCarsNow
 * 
 * SECURITY: Never commit real tokens to git. Use placeholder <REDACTED> in code/docs.
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const db = admin.firestore();

/**
 * Format timestamp for display
 */
function formatTimestamp(ts: any): string {
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
function getSafeField(data: any, fieldName: string): any {
  const value = data[fieldName];
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.length > 100) {
    return value.substring(0, 100) + "...";
  }
  return value;
}

/**
 * Probe a collection for published cars
 */
async function probeCollection(collectionName: string): Promise<{
  exists: boolean;
  totalCount: number;
  publishedCount: number;
  fieldMatched: string | null;
  sample: Array<{
    id: string;
    published: boolean | null;
    status: string | null;
    updatedAt: string;
    slug?: string | null;
  }>;
  notes: string[];
}> {
  const notes: string[] = [];
  
  try {
    // Check if collection exists (try to read first doc)
    const firstDoc = await db.collection(collectionName).limit(1).get();
    
    if (firstDoc.empty) {
      return {
        exists: true,
        totalCount: 0,
        publishedCount: 0,
        fieldMatched: null,
        sample: [],
        notes: [`Collection exists but is EMPTY (0 documents)`],
      };
    }

    // Count total documents (sample-based, limited)
    const sampleSize = 1000;
    const totalSample = await db.collection(collectionName).limit(sampleSize).get();
    const totalCount = totalSample.size;
    const isLimited = totalCount === sampleSize;
    
    if (isLimited) {
      notes.push(`Total count is at least ${sampleSize} (may be more)`);
    }

    // Check for published status fields (in order of preference)
    const publishedFields = [
      { name: "isPublished", value: true },
      { name: "published", value: true },
      { name: "status", value: "PUBLISHED" },
      { name: "status", value: "published" },
      { name: "publicationStatus", value: "PUBLISHED" },
      { name: "visibility", value: "PUBLIC" },
    ];

    let publishedCount = 0;
    let foundField: typeof publishedFields[0] | null = null;

    for (const field of publishedFields) {
      try {
        const query = db.collection(collectionName).where(field.name, "==", field.value);
        const snapshot = await query.limit(1000).get();
        
        if (snapshot.size > 0) {
          if (!foundField || snapshot.size > publishedCount) {
            foundField = field;
            publishedCount = snapshot.size;
          }
        }
      } catch (error: any) {
        // Field doesn't exist or query failed (expected for some field/value combinations)
        // Silently continue
      }
    }

    // Get sample documents
    const sample: Array<{
      id: string;
      published: boolean | null;
      status: string | null;
      updatedAt: string;
      slug?: string | null;
    }> = [];

    try {
      const recentDocs = await db.collection(collectionName)
        .orderBy("updatedAt", "desc")
        .limit(3)
        .get();

      if (!recentDocs.empty) {
        recentDocs.forEach((doc) => {
          const data = doc.data();
          sample.push({
            id: doc.id,
            published: getSafeField(data, "isPublished") ?? getSafeField(data, "published"),
            status: getSafeField(data, "status") ?? getSafeField(data, "publicationStatus"),
            updatedAt: formatTimestamp(data.updatedAt || data.createdAt),
            slug: getSafeField(data, "slug") ?? getSafeField(data, "carId") ?? getSafeField(data, "id"),
          });
        });
      }
    } catch (error) {
      // If orderBy fails, try without it
      const anyDocs = await db.collection(collectionName).limit(3).get();
      anyDocs.forEach((doc) => {
        const data = doc.data();
        sample.push({
          id: doc.id,
          published: getSafeField(data, "isPublished") ?? getSafeField(data, "published"),
          status: getSafeField(data, "status") ?? getSafeField(data, "publicationStatus"),
          updatedAt: formatTimestamp(data.updatedAt || data.createdAt),
          slug: getSafeField(data, "slug") ?? getSafeField(data, "carId") ?? getSafeField(data, "id"),
        });
      });
    }

    return {
      exists: true,
      totalCount: totalCount,
      publishedCount: publishedCount,
      fieldMatched: foundField ? `${foundField.name}==${JSON.stringify(foundField.value)}` : null,
      sample,
      notes,
    };
  } catch (error: any) {
    if (error.code === 7 || error.message?.includes("not found")) {
      return {
        exists: false,
        totalCount: 0,
        publishedCount: 0,
        fieldMatched: null,
        sample: [],
        notes: [`Collection does NOT exist or access denied: ${error.message}`],
      };
    }
    throw error;
  }
}

/**
 * Secure HTTPS function to probe Firestore collections
 */
export const probePublicCarsNow = functions.https.onRequest(async (req, res) => {
  try {
    // Security: Verify admin token
    const providedToken = req.headers["x-admin-token"] as string | undefined;
    const expectedToken = functions.config().admin?.sitemap_token;

    if (!expectedToken) {
      console.error("[probePublicCarsNow] ERROR: admin.sitemap_token not configured");
      res.status(500).json({
        ok: false,
        error: "Server configuration error: admin token not set",
      });
      return;
    }

    if (!providedToken || providedToken !== expectedToken) {
      console.warn(`[probePublicCarsNow] Unauthorized attempt from ${req.ip} (token provided: ${providedToken ? "yes" : "no"})`);
      // Never log the actual token value
      res.status(401).json({
        ok: false,
        error: "Unauthorized: Invalid or missing x-admin-token header",
      });
      return;
    }

    console.log("[probePublicCarsNow] Authorized request, starting probe...");
    
    const collections = ["publicCars", "carAds"];
    const results: Record<string, any> = {};

    for (const collectionName of collections) {
      results[collectionName] = await probeCollection(collectionName);
    }

    // Determine which collection to use (prefer publicCars)
    const primaryCollection = results.publicCars.exists ? "publicCars" : 
                              results.carAds.exists ? "carAds" : "none";

    // Build response
    const response: any = {
      ok: true,
      collectionUsed: primaryCollection,
      totals: {
        all: results[primaryCollection]?.totalCount || 0,
        published: results[primaryCollection]?.publishedCount || 0,
      },
      fieldMatched: results[primaryCollection]?.fieldMatched || "none",
      sample: results[primaryCollection]?.sample || [],
      notes: results[primaryCollection]?.notes || [],
    };

    // Add diagnosis
    const diagnosis: string[] = [];
    if (!results.publicCars.exists) {
      diagnosis.push("Collection 'publicCars' does not exist or access denied");
    } else if (results.publicCars.totalCount === 0) {
      diagnosis.push("Collection 'publicCars' exists but is EMPTY (0 documents)");
    } else if (results.publicCars.publishedCount === 0) {
      diagnosis.push(`Collection has ${results.publicCars.totalCount} documents, but 0 are published`);
      if (!results.publicCars.fieldMatched) {
        diagnosis.push("No published status field found matching known patterns");
      }
    } else {
      diagnosis.push(`Found ${results.publicCars.publishedCount} published cars`);
      if (results.publicCars.fieldMatched !== "isPublished==true") {
        diagnosis.push(`Field used: ${results.publicCars.fieldMatched} (current code uses isPublished==true)`);
      }
    }

    response.diagnosis = diagnosis;

    console.log("[probePublicCarsNow] Success:", {
      collection: primaryCollection,
      totals: response.totals,
      fieldMatched: response.fieldMatched,
    });
    
    res.status(200).json(response);
  } catch (error: any) {
    console.error("[probePublicCarsNow] Error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Unknown error",
    });
  }
});

