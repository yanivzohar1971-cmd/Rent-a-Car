/**
 * Admin Debug Callable Functions
 * 
 * Provides admin-only callable functions for debugging and diagnostics.
 * All functions require admin authentication.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { upsertPublicCarFromMaster } from "../cars/publicCarProjection";

const db = admin.firestore();

/**
 * Helper to check if user is admin.
 * Checks custom claim admin=true OR existence in config/admins collection.
 */
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    // Check custom claim first (preferred)
    const user = await admin.auth().getUser(callerUid);
    if (user.customClaims?.admin === true) {
      return true;
    }
    
    // Fallback to config/admins collection
    const adminDoc = await db.collection("config").doc("admins").get();
    if (!adminDoc.exists) {
      return false;
    }
    const data = adminDoc.data();
    const uids = (data?.uids as string[]) || [];
    return uids.includes(callerUid);
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Helper: Get MASTER car document reference using the same path logic as MASTER checks
 * This ensures repair functions write to the exact same document that the checks read.
 */
function getMasterCarDocRef(yardUid: string, carId: string): admin.firestore.DocumentReference {
  return db.doc(`users/${yardUid}/carSales/${carId}`);
}

/**
 * Helper: Safely convert any timestamp-like value to milliseconds
 * 
 * Handles multiple formats:
 * - null/undefined -> null
 * - Firestore Timestamp (with toMillis()) -> value.toMillis()
 * - Date -> value.getTime()
 * - number -> value (assumed to be milliseconds)
 * - string -> Date.parse() if valid, else null
 * - object with {seconds, nanoseconds} -> seconds*1000 + floor(nanoseconds/1e6)
 * - otherwise -> null
 */
function safeToMillis(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Firestore Timestamp with toMillis() method
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  
  // Date object
  if (value instanceof Date) {
    return value.getTime();
  }
  
  // Number (assumed to be milliseconds)
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  
  // String - try to parse as ISO date
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
    return null;
  }
  
  // Object with seconds/nanoseconds (Firestore Timestamp-like JSON)
  if (typeof value === 'object' && value !== null) {
    if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
      return value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6);
    }
  }
  
  // Unsupported type
  return null;
}

/**
 * Helper: Extract updatedAt from car data, supporting legacy fields
 * Returns: { value: Timestamp | null, source: 'updatedAt' | 'lastUpdatedAt' | 'modifiedAt' | 'updatedAtMs' | null }
 * 
 * IMPORTANT: Explicitly checks for null and undefined (not just truthy)
 */
function extractUpdatedAt(carData: any): { value: admin.firestore.Timestamp | null; source: string | null } {
  if (!carData) return { value: null, source: null };

  // Primary field: updatedAt - explicitly check for null/undefined
  const updatedAt = carData.updatedAt;
  if (updatedAt !== null && updatedAt !== undefined) {
    if (updatedAt instanceof admin.firestore.Timestamp) {
      return { value: updatedAt, source: 'updatedAt' };
    }
    if (updatedAt.toMillis && typeof updatedAt.toMillis === 'function') {
      return { value: updatedAt, source: 'updatedAt' };
    }
    if (updatedAt instanceof Date) {
      return { value: admin.firestore.Timestamp.fromDate(updatedAt), source: 'updatedAt' };
    }
    if (typeof updatedAt === 'number' && updatedAt > 0) {
      return { value: admin.firestore.Timestamp.fromMillis(updatedAt), source: 'updatedAt' };
    }
  }
  
  // Legacy field: lastUpdatedAt
  const lastUpdatedAt = carData.lastUpdatedAt;
  if (lastUpdatedAt !== null && lastUpdatedAt !== undefined) {
    if (lastUpdatedAt instanceof admin.firestore.Timestamp) {
      return { value: lastUpdatedAt, source: 'lastUpdatedAt' };
    }
    if (lastUpdatedAt.toMillis && typeof lastUpdatedAt.toMillis === 'function') {
      return { value: lastUpdatedAt, source: 'lastUpdatedAt' };
    }
    if (lastUpdatedAt instanceof Date) {
      return { value: admin.firestore.Timestamp.fromDate(lastUpdatedAt), source: 'lastUpdatedAt' };
    }
  }
  
  // Legacy field: modifiedAt
  const modifiedAt = carData.modifiedAt;
  if (modifiedAt !== null && modifiedAt !== undefined) {
    if (modifiedAt instanceof admin.firestore.Timestamp) {
      return { value: modifiedAt, source: 'modifiedAt' };
    }
    if (modifiedAt.toMillis && typeof modifiedAt.toMillis === 'function') {
      return { value: modifiedAt, source: 'modifiedAt' };
    }
    if (modifiedAt instanceof Date) {
      return { value: admin.firestore.Timestamp.fromDate(modifiedAt), source: 'modifiedAt' };
    }
  }
  
  // Legacy field: updatedAtMs (number)
  if (typeof carData.updatedAtMs === 'number' && carData.updatedAtMs > 0) {
    return { value: admin.firestore.Timestamp.fromMillis(carData.updatedAtMs), source: 'updatedAtMs' };
  }
  
  return { value: null, source: null };
}

/**
 * Helper: Repair updatedAt for a single MASTER document by path
 * 
 * This is the single source of truth for repair logic. It:
 * 1. Loads the doc at masterDocPath
 * 2. Checks if updatedAt is null/undefined
 * 3. Writes updatedAt if needed (prefers legacy fields, falls back to serverTimestamp)
 * 4. Re-reads with fresh get() to verify
 * 5. Returns before/after state with diagnostics
 * 
 * @param masterDocPath - Full Firestore path (e.g., "users/{yardUid}/carSales/{carId}")
 * @param opts - Options: { dryRun?, correlationId?, setPublishedAtIfPublished? }
 * @returns Repair result with before/after timestamps and diagnostics
 */
async function repairUpdatedAtForMasterPath(
  masterDocPath: string,
  opts: {
    dryRun?: boolean;
    correlationId?: string;
    setPublishedAtIfPublished?: boolean;
  } = {}
): Promise<{
  status: 'NOT_FOUND' | 'NO_UPDATE_NEEDED' | 'UPDATED' | 'UPDATE_FAILED' | 'VERIFY_FAILED';
  masterDocPath: string;
  beforeUpdatedAt: admin.firestore.Timestamp | null;
  afterUpdatedAt: admin.firestore.Timestamp | null;
  beforePublishedAt: admin.firestore.Timestamp | null;
  afterPublishedAt: admin.firestore.Timestamp | null;
  wroteFromLegacy: boolean;
  wroteServerTimestamp: boolean;
  didWrite: boolean;
  error?: string;
  diagnostic?: {
    docDataKeys?: string[];
    writeResult?: any;
    verifyReadSucceeded?: boolean;
  };
}> {
  const { dryRun = false, correlationId, setPublishedAtIfPublished = false } = opts;
  
  // Load doc by path
  const docRef = db.doc(masterDocPath);
  let beforeSnap;
  try {
    beforeSnap = await docRef.get();
  } catch (readError: any) {
    return {
      status: 'UPDATE_FAILED',
      masterDocPath,
      beforeUpdatedAt: null,
      afterUpdatedAt: null,
      beforePublishedAt: null,
      afterPublishedAt: null,
      wroteFromLegacy: false,
      wroteServerTimestamp: false,
      didWrite: false,
      error: `Read error: ${readError?.message || String(readError)}`,
      diagnostic: {
        verifyReadSucceeded: false,
      },
    };
  }

  if (!beforeSnap.exists) {
    return {
      status: 'NOT_FOUND',
      masterDocPath,
      beforeUpdatedAt: null,
      afterUpdatedAt: null,
      beforePublishedAt: null,
      afterPublishedAt: null,
      wroteFromLegacy: false,
      wroteServerTimestamp: false,
      didWrite: false,
    };
  }

  const beforeData = beforeSnap.data() || {};
  const updatedAtInfo = extractUpdatedAt(beforeData);
  const beforeUpdatedAt = updatedAtInfo.value;
  const beforePublishedAt = beforeData.publishedAt || null;
  
  // Check if update is needed: updatedAt is null or undefined
  const needsUpdatedAt = beforeUpdatedAt === null;
  
  // Check if publishedAt should be set
  let needsPublishedAt = false;
  if (setPublishedAtIfPublished && needsUpdatedAt) {
    const publishState = computeMasterPublishState(beforeData);
    const isEffectivelyPublished = publishState.effectivePublished && !publishState.effectiveHidden;
    const hasPublishedAt = beforePublishedAt !== null && beforePublishedAt !== undefined;
    needsPublishedAt = isEffectivelyPublished && !hasPublishedAt;
  }

  if (!needsUpdatedAt && !needsPublishedAt) {
    return {
      status: 'NO_UPDATE_NEEDED',
      masterDocPath,
      beforeUpdatedAt,
      afterUpdatedAt: beforeUpdatedAt,
      beforePublishedAt,
      afterPublishedAt: beforePublishedAt,
      wroteFromLegacy: false,
      wroteServerTimestamp: false,
      didWrite: false,
    };
  }

  // Prepare updates
  const updates: any = {};
  let wroteFromLegacy = false;
  let wroteServerTimestamp = false;

  if (needsUpdatedAt) {
    // Check if we can use a legacy field value
    if (updatedAtInfo.source && updatedAtInfo.source !== 'updatedAt' && updatedAtInfo.value) {
      updates.updatedAt = updatedAtInfo.value;
      wroteFromLegacy = true;
    } else {
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      wroteServerTimestamp = true;
    }
  }

  if (needsPublishedAt) {
    updates.publishedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  // Apply update if not dry run
  if (!dryRun) {
    try {
      await docRef.update(updates);
      
      // CRITICAL: Re-read with fresh get() to verify write
      // Wait a small amount to ensure write is committed (though get() should be consistent)
      let afterSnap;
      try {
        // Use a fresh get() call - this ensures we read the committed write
        afterSnap = await docRef.get();
      } catch (verifyError: any) {
        return {
          status: 'VERIFY_FAILED',
          masterDocPath,
          beforeUpdatedAt,
          afterUpdatedAt: null, // Unknown - verify read failed
          beforePublishedAt,
          afterPublishedAt: null,
          wroteFromLegacy,
          wroteServerTimestamp,
          didWrite: true,
          error: `Verify read error: ${verifyError?.message || String(verifyError)}`,
          diagnostic: {
            docDataKeys: Object.keys(beforeData),
            verifyReadSucceeded: false,
          },
        };
      }

      if (!afterSnap.exists) {
        return {
          status: 'VERIFY_FAILED',
          masterDocPath,
          beforeUpdatedAt,
          afterUpdatedAt: null,
          beforePublishedAt,
          afterPublishedAt: null,
          wroteFromLegacy,
          wroteServerTimestamp,
          didWrite: true,
          error: 'Document disappeared after write (verify read returned !exists)',
          diagnostic: {
            docDataKeys: Object.keys(beforeData),
            verifyReadSucceeded: false,
          },
        };
      }

      const afterData = afterSnap.data() || {};
      const afterUpdatedAtInfo = extractUpdatedAt(afterData);
      const afterUpdatedAt = afterUpdatedAtInfo.value;
      const afterPublishedAt = afterData.publishedAt || null;

      // Verify that updatedAt is now non-null
      if (needsUpdatedAt && afterUpdatedAt === null) {
        return {
          status: 'VERIFY_FAILED',
          masterDocPath,
          beforeUpdatedAt,
          afterUpdatedAt: null,
          beforePublishedAt,
          afterPublishedAt,
          wroteFromLegacy,
          wroteServerTimestamp,
          didWrite: true,
          error: 'Write succeeded but updatedAt is still null after verify read',
          diagnostic: {
            docDataKeys: Object.keys(afterData),
            verifyReadSucceeded: true,
          },
        };
      }

      // Log success
      console.info(`[repairUpdatedAtForMasterPath] Success (correlationId: ${correlationId || 'N/A'}):`, {
        masterDocPath,
        beforeUpdatedAt: safeToMillis(beforeUpdatedAt),
        afterUpdatedAt: safeToMillis(afterUpdatedAt),
        wroteFromLegacy,
        wroteServerTimestamp,
        didWrite: true,
      });

      return {
        status: 'UPDATED',
        masterDocPath,
        beforeUpdatedAt,
        afterUpdatedAt,
        beforePublishedAt,
        afterPublishedAt,
        wroteFromLegacy,
        wroteServerTimestamp,
        didWrite: true,
        diagnostic: {
          docDataKeys: Object.keys(afterData),
          verifyReadSucceeded: true,
        },
      };
    } catch (updateError: any) {
      return {
        status: 'UPDATE_FAILED',
        masterDocPath,
        beforeUpdatedAt,
        afterUpdatedAt: null,
        beforePublishedAt,
        afterPublishedAt: null,
        wroteFromLegacy,
        wroteServerTimestamp,
        didWrite: false,
        error: `Update error: ${updateError?.message || String(updateError)}`,
        diagnostic: {
          docDataKeys: Object.keys(beforeData),
          writeResult: updateError?.code || 'unknown',
        },
      };
    }
  }

  // Dry run: return what would be updated
  return {
    status: 'UPDATED', // Treat as success for dry run
    masterDocPath,
    beforeUpdatedAt,
    afterUpdatedAt: wroteFromLegacy ? beforeUpdatedAt : null, // Would be serverTimestamp
    beforePublishedAt,
    afterPublishedAt: needsPublishedAt ? null : beforePublishedAt, // Would be serverTimestamp
    wroteFromLegacy,
    wroteServerTimestamp,
    didWrite: false,
  };
}

/**
 * adminDebugPing: Simple ping function to test callable access and measure latency
 * 
 * Returns server timestamp, region, and verifies callable works.
 * 
 * Auth: Admin only
 */
export const adminDebugPing = functions.https.onCall(async (data, context) => {
  // Generate or use provided correlationId
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    console.error(`[adminDebugPing] Unauthenticated request, correlationId: ${correlationId}`);
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugPing] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const now = admin.firestore.Timestamp.now();
    const projectId = admin.app().options.projectId || null;
    const region = process.env.FUNCTION_REGION || process.env.GCLOUD_REGION || 'unknown';
    const version = process.env.K_SERVICE || process.env.FUNCTION_TARGET || null;

    console.log(`[adminDebugPing] Success for ${callerUid}, correlationId: ${correlationId}`);

    return {
      ok: true,
      level: "OK",
      title: "Functions Latency",
      summary: "OK",
      details: {
        serverTs: now.toMillis(),
        serverTsISO: now.toDate().toISOString(),
        projectId,
        region,
        version,
        correlationId,
        callerUid,
        nextAction: "No action needed",
      },
    };
  } catch (error: any) {
    // If already an HttpsError, rethrow with correlationId
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // Log with correlationId
    console.error(`[adminDebugPing] Error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugPing failed",
      { 
        correlationId,
        error: error.message,
      }
    );
  }
});

/**
 * adminDebugCheckCar: Reads MASTER and PUBLIC and returns structured result
 * 
 * This is a read-only diagnostic function that compares MASTER and PUBLIC states.
 * 
 * Auth: Admin only
 */
/**
 * Helper to compute effective published state from MASTER data
 */
function computeMasterPublishState(carData: any): {
  effectivePublished: boolean;
  effectiveHidden: boolean;
  signals: {
    status?: string;
    publicationStatus?: string;
    isPublished?: boolean;
    saleStatus?: string;
  };
} {
  if (!carData) {
    return { effectivePublished: false, effectiveHidden: true, signals: {} };
  }

  const status = String(carData?.status || '').toLowerCase();
  const pubStatus = String(carData?.publicationStatus || '').toUpperCase();
  const isPublished = carData?.isPublished === true;
  const saleStatus = String(carData?.saleStatus || '').toUpperCase();

  const effectivePublished = isPublished || pubStatus === 'PUBLISHED' || status === 'published';
  const effectiveHidden = 
    pubStatus === 'HIDDEN' || pubStatus === 'ARCHIVED' ||
    status === 'archived' || status === 'hidden' ||
    (!isPublished && !effectivePublished);

  return {
    effectivePublished: effectivePublished && saleStatus !== 'SOLD',
    effectiveHidden,
    signals: {
      status: carData?.status || undefined,
      publicationStatus: carData?.publicationStatus || undefined,
      isPublished: carData?.isPublished !== undefined ? isPublished : undefined,
      saleStatus: carData?.saleStatus || undefined,
    },
  };
}

/**
 * adminDebugMasterCarState: Reads MASTER car document and returns publish state
 * 
 * Auth: Admin only
 */
export const adminDebugMasterCarState = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    console.error(`[adminDebugMasterCarState] Unauthenticated, correlationId: ${correlationId}`);
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("adminDebugMasterCarState:start", { 
      correlationId, 
      yardUid: data?.yardUid, 
      carId: data?.carId, 
      uid: callerUid 
    });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugMasterCarState] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin only",
        { correlationId }
      );
    }

    // Strict validation with sanitization
    let yardUid = data?.yardUid;
    let carId = data?.carId;
    
    if (!yardUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid is required",
        { correlationId }
      );
    }
    
    if (!carId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "carId is required",
        { correlationId }
      );
    }
    
    // Sanitize inputs
    yardUid = String(yardUid).trim();
    carId = String(carId).trim();
    
    if (!yardUid || !carId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid and carId must be non-empty strings",
        { correlationId }
      );
    }

    const { verbose = false } = data;

    // Read MASTER using Admin SDK (bypasses Firestore rules)
    // Use helper function to ensure consistent path logic
    const masterDocRef = getMasterCarDocRef(yardUid, carId);
    const masterDocPath = masterDocRef.path;
    let masterSnap;
    try {
      masterSnap = await masterDocRef.get();
    } catch (readError: any) {
      console.error("adminDebugMasterCarState:error", {
        correlationId,
        yardUid,
        carId,
        masterDocPath,
        uid: callerUid,
        message: readError?.message,
        code: readError?.code,
        stack: readError?.stack,
      });
      throw new functions.https.HttpsError(
        "internal",
        "adminDebugMasterCarState failed",
        {
          correlationId,
          masterDocPath,
          reason: readError?.message || String(readError),
          hint: "Check Firestore path users/{yardUid}/carSales/{carId}, Admin SDK init, or field parsing assumptions",
        }
      );
    }

    if (!masterSnap.exists) {
      return {
        ok: false,
        level: "FAIL",
        title: "MASTER Car Publish State",
        summary: "MASTER car not found",
        details: {
          yardUid,
          carId,
          masterDocPath,
          correlationId,
          nextAction: "Verify yardUid and carId are correct",
        },
        ts: new Date().toISOString(),
      };
    }

    // Null-safe data extraction
    const masterData = masterSnap.data() || {};
    
    // Null-safe field extraction with type guards
    const status = typeof masterData.status === "string" ? masterData.status : null;
    const publicationStatus = typeof masterData.publicationStatus === "string" ? masterData.publicationStatus : null;
    const isPublished = typeof masterData.isPublished === "boolean" ? masterData.isPublished : null;
    const saleStatus = typeof masterData.saleStatus === "string" ? masterData.saleStatus : null;
    
    // Safe Timestamp handling
    let updatedAt: number | null = null;
    let publishedAt: number | null = null;
    
    if (masterData.updatedAt) {
      if (masterData.updatedAt.toMillis) {
        updatedAt = masterData.updatedAt.toMillis();
      } else if (masterData.updatedAt instanceof Date) {
        updatedAt = masterData.updatedAt.getTime();
      } else if (typeof masterData.updatedAt === "number") {
        updatedAt = masterData.updatedAt;
      }
    }
    
    if (masterData.publishedAt) {
      if (masterData.publishedAt.toMillis) {
        publishedAt = masterData.publishedAt.toMillis();
      } else if (masterData.publishedAt instanceof Date) {
        publishedAt = masterData.publishedAt.getTime();
      } else if (typeof masterData.publishedAt === "number") {
        publishedAt = masterData.publishedAt;
      }
    }
    
    // Compute effective published state (null-safe)
    const effectivePublished = 
      (status && typeof status === "string" && status.toLowerCase() === "published") ||
      (publicationStatus && typeof publicationStatus === "string" && publicationStatus.toUpperCase() === "PUBLISHED") ||
      (isPublished === true);
    
    const effectiveHidden = 
      saleStatus === "SOLD" ||
      (status && typeof status === "string" && status.toLowerCase() === "sold") ||
      (isPublished === false && !effectivePublished);
    
    const publishState = {
      effectivePublished,
      effectiveHidden,
      signals: {
        status,
        publicationStatus,
        isPublished,
        saleStatus,
      },
    };
    
    // Extract readable fields (null-safe)
    const plateNumber = typeof masterData.licensePlatePartial === "string" ? masterData.licensePlatePartial :
                       typeof masterData.plateNumber === "string" ? masterData.plateNumber : null;
    const make = typeof masterData.brand === "string" ? masterData.brand :
                 typeof masterData.brandText === "string" ? masterData.brandText : null;
    const model = typeof masterData.model === "string" ? masterData.model :
                  typeof masterData.modelText === "string" ? masterData.modelText : null;
    const year = typeof masterData.year === "number" ? masterData.year : null;

    // Determine level and summary
    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = `Published: ${publishState.effectivePublished ? 'Yes' : 'No'}`;
    let nextAction = "No action needed";

    const missingFields: string[] = [];
    if (!status && !publicationStatus) missingFields.push('status/publicationStatus');
    if (isPublished === null || isPublished === undefined) missingFields.push('isPublished');
    
    // Check updatedAt: use helper to check for legacy fields too
    const updatedAtInfo = extractUpdatedAt(masterData);
    if (!updatedAtInfo.value) {
      missingFields.push('updatedAt');
    }

    // Check for misaligned signals (null-safe)
    const signalsMisaligned = 
      (status && status.toLowerCase() === 'published' && isPublished !== true) ||
      (publicationStatus && publicationStatus.toUpperCase() === 'PUBLISHED' && isPublished !== true) ||
      (isPublished === true && publishState.effectiveHidden);

    if (saleStatus === 'SOLD' || (status && status.toLowerCase() === 'sold')) {
      level = "WARN";
      summary += ", SOLD (should not be published)";
      nextAction = "Unpublish from publicCars";
    } else if (signalsMisaligned) {
      level = "WARN";
      summary += " (signals misaligned)";
      nextAction = "Fix publish signals";
    } else if (missingFields.length > 0) {
      level = "WARN";
      summary += `, Missing: ${missingFields.join(', ')}`;
      // If only updatedAt is missing, suggest repair tool
      if (missingFields.length === 1 && missingFields[0] === 'updatedAt') {
        nextAction = "Run 'Repair Missing Fields' to backfill updatedAt";
      } else {
        nextAction = "Add missing fields";
      }
    }

    if (!publishState.effectivePublished && missingFields.length > 2) {
      level = "FAIL";
      summary = "No publish signals found";
      nextAction = "Add publish signals (status/publicationStatus/isPublished)";
    }

    if (publishState.effectivePublished) {
      nextAction = "Ensure projection exists in publicCars";
    }

    const details: any = {
      correlationId,
      yardUid,
      carId,
      masterDocPath,
      signals: publishState.signals,
      effective: {
        published: publishState.effectivePublished,
        hidden: publishState.effectiveHidden,
      },
      plateNumber,
      make,
      model,
      year,
      updatedAt,
      publishedAt,
      missingFields,
      nextAction,
    };

    if (verbose) {
      details.fullData = masterData;
    }

    console.info(`[adminDebugMasterCarState] Success (correlationId: ${correlationId}):`, {
      yardUid,
      carId,
      effectivePublished: publishState.effectivePublished,
    });

    return {
      ok: level === "OK",
      level,
      title: "MASTER Car Publish State",
      summary,
      details,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    // If already an HttpsError, rethrow with correlationId if missing
    if (error instanceof functions.https.HttpsError) {
      const existingDetails: any = error.details || {};
      if (!existingDetails.correlationId) {
        throw new functions.https.HttpsError(
          error.code,
          error.message,
          { ...existingDetails, correlationId }
        );
      }
      throw error;
    }
    
    // Log full error details
    console.error("adminDebugMasterCarState:error", {
      correlationId,
      yardUid: data?.yardUid,
      carId: data?.carId,
      uid: callerUid,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugMasterCarState failed",
      {
        correlationId,
        reason: error?.message || String(error),
        hint: "Check Firestore path users/{yardUid}/carSales/{carId}, Admin SDK init, or field parsing assumptions",
      }
    );
  }
});

/**
 * adminDebugPublicCarState: Reads PUBLIC car document and returns projection state
 * 
 * Auth: Admin only
 */
export const adminDebugPublicCarState = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("[adminDebugPublicCarState] start", { correlationId, carId: data?.carId, yardUid: data?.yardUid, uid: callerUid });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugPublicCarState] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { carId, yardUid, verbose = false } = data;
    
    if (!carId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "carId is required",
        { correlationId }
      );
    }

    // If yardUid is provided, check MASTER first to determine if PUBLIC is expected
    let masterPublished = false;
    let masterHidden = false;
    
    if (yardUid) {
      try {
        const masterRef = db.collection("users").doc(yardUid).collection("carSales").doc(carId);
        const masterSnap = await masterRef.get();
        
        if (masterSnap.exists) {
          const masterData = masterSnap.data() || {};
          const masterPublishState = computeMasterPublishState(masterData);
          masterPublished = masterPublishState.effectivePublished;
          masterHidden = masterPublishState.effectiveHidden;
        }
      } catch (masterError: any) {
        console.warn("[adminDebugPublicCarState] Could not read MASTER", { correlationId, yardUid, carId, error: masterError?.message });
        // Continue without MASTER check
      }
    }

    // Read PUBLIC
    const publicRef = db.collection("publicCars").doc(carId);
    let publicSnap;
    try {
      publicSnap = await publicRef.get();
    } catch (readError: any) {
      console.error("[adminDebugPublicCarState] PUBLIC read error", { correlationId, carId, error: readError?.message, stack: readError?.stack });
      // Continue with publicExists = false
      publicSnap = { exists: false, data: () => null };
    }

    if (!publicSnap.exists) {
      // If MASTER is not published or is hidden, PUBLIC not existing is expected (OK)
      if (yardUid && (!masterPublished || masterHidden)) {
        return {
          ok: true,
          level: "OK",
          title: "PUBLIC Car Projection State",
          summary: "Not published/hidden — PUBLIC projection not expected",
          details: {
            carId,
            yardUid,
            correlationId,
            masterPublished,
            masterHidden,
            nextAction: "No action needed",
          },
          ts: new Date().toISOString(),
        };
      }
      
      return {
        ok: false,
        level: "WARN",
        title: "PUBLIC Car Projection State",
        summary: "PUBLIC document not found (not projected)",
        details: {
          carId,
          yardUid: yardUid || null,
          correlationId,
          masterPublished: yardUid ? masterPublished : null,
          nextAction: "Run reproject if MASTER is published",
        },
        ts: new Date().toISOString(),
      };
    }

    // Null-safe data extraction
    const publicData = publicSnap.data() || {};
    const isPublished = publicData?.isPublished === true;
    const status = typeof publicData.status === "string" ? publicData.status : null;
    const publicationStatus = typeof publicData.publicationStatus === "string" ? publicData.publicationStatus : null;

    // Safe Timestamp handling
    let updatedAt: number | null = null;
    let publishedAt: number | null = null;
    
    if (publicData.updatedAt) {
      if (publicData.updatedAt.toMillis) {
        updatedAt = publicData.updatedAt.toMillis();
      } else if (publicData.updatedAt instanceof Date) {
        updatedAt = publicData.updatedAt.getTime();
      } else if (typeof publicData.updatedAt === "number") {
        updatedAt = publicData.updatedAt;
      }
    }
    
    if (publicData.publishedAt) {
      if (publicData.publishedAt.toMillis) {
        publishedAt = publicData.publishedAt.toMillis();
      } else if (publicData.publishedAt instanceof Date) {
        publishedAt = publicData.publishedAt.getTime();
      } else if (typeof publicData.publishedAt === "number") {
        publishedAt = publicData.publishedAt;
      }
    }

    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = `isPublished: ${isPublished}`;
    let nextAction = "No action needed";

    if (!isPublished && (status === 'published' || publicationStatus === 'PUBLISHED')) {
      level = "WARN";
      summary += " (has status=published but isPublished=false)";
      nextAction = "Fix isPublished field";
    }
    if (!isPublished && !status && !publicationStatus) {
      level = "WARN";
      summary += " (no publish signals)";
      nextAction = "Add publish signals or reproject";
    }

    const details: any = {
      carId,
      yardUid: yardUid || publicData?.yardUid || publicData?.ownerUid || null,
      correlationId,
      isPublished,
      status,
      publicationStatus,
      masterPublished: yardUid ? masterPublished : null,
      masterHidden: yardUid ? masterHidden : null,
      updatedAt,
      publishedAt,
      nextAction,
    };

    if (verbose) {
      details.fullData = publicData;
    }

    console.info(`[adminDebugPublicCarState] Success (correlationId: ${correlationId}):`, {
      carId,
      isPublished,
      masterPublished: yardUid ? masterPublished : null,
      level,
    });

    return {
      ok: level === "OK",
      level,
      title: "PUBLIC Car Projection State",
      summary,
      details,
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugPublicCarState] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
      carId: data?.carId,
    });
    
    // Return structured response instead of throwing internal error
    return {
      ok: false,
      level: "FAIL",
      title: "PUBLIC Car Projection State",
      summary: "Unexpected error during check",
      details: {
        correlationId,
        error: error.message || String(error),
        nextAction: "Check server logs for correlationId",
      },
      ts: new Date().toISOString(),
    };
  }
});

export const adminDebugCheckCar = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("[adminDebugCheckCar] start", { correlationId, yardUid: data?.yardUid, carId: data?.carId, uid: callerUid });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugCheckCar] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { yardUid, carId, verbose = false } = data;
    
    if (!yardUid || !carId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid and carId are required",
        { correlationId }
      );
    }

    // Read MASTER using Admin SDK
    const masterRef = db.collection("users").doc(yardUid).collection("carSales").doc(carId);
    let masterSnap;
    try {
      masterSnap = await masterRef.get();
    } catch (readError: any) {
      console.error("[adminDebugCheckCar] MASTER read error", { correlationId, yardUid, carId, error: readError?.message, stack: readError?.stack });
      return {
        ok: false,
        level: "FAIL",
        title: "MASTER vs PUBLIC Diff",
        summary: "Failed to read MASTER document",
        details: {
          yardUid,
          carId,
          correlationId,
          error: readError?.message || String(readError),
          nextAction: "Check Firestore path and permissions",
        },
        ts: new Date().toISOString(),
      };
    }
    
    // Read PUBLIC
    const publicRef = db.collection("publicCars").doc(carId);
    let publicSnap;
    try {
      publicSnap = await publicRef.get();
    } catch (readError: any) {
      console.error("[adminDebugCheckCar] PUBLIC read error", { correlationId, carId, error: readError?.message, stack: readError?.stack });
      // Continue with publicExists = false
      publicSnap = { exists: false, data: () => null };
    }

    const masterExists = masterSnap.exists;
    const publicExists = publicSnap.exists;

    if (!masterExists) {
      return {
        ok: false,
        level: "FAIL",
        title: "MASTER vs PUBLIC Diff",
        summary: "MASTER not found",
        details: {
          yardUid,
          carId,
          correlationId,
          nextAction: "Verify yardUid and carId are correct",
        },
        ts: new Date().toISOString(),
      };
    }

    // Null-safe data extraction
    const masterData = masterSnap.data() || {};
    const publicData = publicExists ? (publicSnap.data() || {}) : null;

    const masterPublishState = computeMasterPublishState(masterData);
    const masterPublished = masterPublishState.effectivePublished;
    const masterHidden = masterPublishState.effectiveHidden;
    const publicPublished = publicData?.isPublished === true;

    // Extract readable fields from MASTER (null-safe)
    const plateNumber = typeof masterData.licensePlatePartial === "string" ? masterData.licensePlatePartial :
                       typeof masterData.plateNumber === "string" ? masterData.plateNumber : null;
    const make = typeof masterData.brand === "string" ? masterData.brand :
                 typeof masterData.brandText === "string" ? masterData.brandText : null;
    const model = typeof masterData.model === "string" ? masterData.model :
                  typeof masterData.modelText === "string" ? masterData.modelText : null;
    const year = typeof masterData.year === "number" ? masterData.year : null;

    // Safe Timestamp handling for MASTER
    let masterUpdatedAt: number | null = null;
    if (masterData.updatedAt) {
      if (masterData.updatedAt.toMillis) {
        masterUpdatedAt = masterData.updatedAt.toMillis();
      } else if (masterData.updatedAt instanceof Date) {
        masterUpdatedAt = masterData.updatedAt.getTime();
      } else if (typeof masterData.updatedAt === "number") {
        masterUpdatedAt = masterData.updatedAt;
      }
    }

    // Safe Timestamp handling for PUBLIC
    let publicUpdatedAt: number | null = null;
    if (publicData?.updatedAt) {
      if (publicData.updatedAt.toMillis) {
        publicUpdatedAt = publicData.updatedAt.toMillis();
      } else if (publicData.updatedAt instanceof Date) {
        publicUpdatedAt = publicData.updatedAt.getTime();
      } else if (typeof publicData.updatedAt === "number") {
        publicUpdatedAt = publicData.updatedAt;
      }
    }

    // Compute diff
    const mismatches: string[] = [];
    const missingInPublic: string[] = [];

    if (masterPublished !== publicPublished) {
      mismatches.push(`isPublished: MASTER=${masterPublished}, PUBLIC=${publicPublished}`);
    }

    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = `MASTER: ${masterPublished ? 'Published' : 'Not published'}, PUBLIC: ${publicPublished ? 'Published' : 'Not published'}`;
    let nextAction = "No action needed";

    // If MASTER is not published or is hidden, PUBLIC not existing is expected (OK)
    if (!masterPublished || masterHidden) {
      if (!publicExists) {
        level = "OK";
        summary = `MASTER: Not published/hidden — PUBLIC projection not expected`;
        nextAction = "No action needed";
      } else if (publicPublished) {
        level = "WARN";
        summary += " (PUBLIC exists but MASTER not published)";
        nextAction = "Unpublish from publicCars";
      }
    } else {
      // MASTER is published, PUBLIC should exist
      if (!publicExists) {
        level = "WARN";
        summary += " (PUBLIC not found)";
        nextAction = "Run reproject";
      } else if (mismatches.length > 0) {
        level = "WARN";
        summary += " (mismatch)";
        nextAction = "Run reproject to sync";
      }
    }

    const details: any = {
      yardUid,
      carId,
      correlationId,
      plateNumber,
      make,
      model,
      year,
      master: {
        exists: masterExists,
        published: masterPublished,
        hidden: masterHidden,
        status: typeof masterData.status === "string" ? masterData.status : null,
        publicationStatus: typeof masterData.publicationStatus === "string" ? masterData.publicationStatus : null,
        saleStatus: typeof masterData.saleStatus === "string" ? masterData.saleStatus : null,
        updatedAt: masterUpdatedAt,
      },
      public: {
        exists: publicExists,
        published: publicPublished,
        isPublished: publicData?.isPublished || null,
        status: typeof publicData?.status === "string" ? publicData.status : null,
        updatedAt: publicUpdatedAt,
      },
      diff: {
        mismatches,
        missingInPublic,
        inSync: masterPublished === publicPublished && publicExists,
      },
      nextAction,
    };

    if (verbose) {
      details.masterFullData = masterData;
      if (publicData) {
        details.publicFullData = publicData;
      }
    }

    console.info(`[adminDebugCheckCar] Success (correlationId: ${correlationId}):`, {
      yardUid,
      carId,
      masterPublished,
      masterHidden,
      publicExists,
      level,
    });

    return {
      ok: level === "OK",
      level,
      title: "MASTER vs PUBLIC Diff",
      summary,
      details,
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugCheckCar] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
      yardUid: data?.yardUid,
      carId: data?.carId,
    });
    
    // Return structured response instead of throwing internal error
    return {
      ok: false,
      level: "FAIL",
      title: "MASTER vs PUBLIC Diff",
      summary: "Unexpected error during check",
      details: {
        correlationId,
        error: error.message || String(error),
        nextAction: "Check server logs for correlationId",
      },
      ts: new Date().toISOString(),
    };
  }
});

/**
 * adminDebugReprojectCar: Forces upsert projection for a car
 * 
 * This function calls upsertPublicCarFromMaster to reproject a single car.
 * It will create or update the publicCars/{carId} document based on MASTER state.
 * 
 * Auth: Admin only
 */
export const adminDebugReprojectCar = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can access debug functions"
    );
  }

  const { yardUid, carId } = data;
  
  if (!yardUid || !carId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "yardUid and carId are required"
    );
  }

  try {
    const startTime = Date.now();
    
    // Call the projection function
    await upsertPublicCarFromMaster(yardUid, carId);
    
    const duration = Date.now() - startTime;

    // Verify result
    const publicRef = db.collection("publicCars").doc(carId);
    const publicSnap = await publicRef.get();
    const publicExists = publicSnap.exists;
    const publicData = publicExists ? publicSnap.data() : null;

    return {
      success: true,
      yardUid,
      carId,
      duration,
      reprojected: publicExists,
      isPublished: publicData?.isPublished || false,
      message: publicExists 
        ? `Car ${carId} reprojected successfully`
        : `Car ${carId} reprojected (may be unpublished if not published in MASTER)`,
    };
  } catch (error: any) {
    console.error("Error in adminDebugReprojectCar:", error);
    
    // Don't fail if seller snapshot missing - return partial success
    if (error.message && error.message.includes('seller')) {
      return {
        success: true,
        yardUid,
        carId,
        warning: "Reprojected but seller snapshot may be missing",
        error: error.message,
      };
    }
    
    throw new functions.https.HttpsError(
      "internal",
      `Failed to reproject car: ${error.message}`,
      error
    );
  }
});

/**
 * adminDebugReprojectYard: Batch reproject limited cars for a yard
 * 
 * This function reprojects up to limit cars for a yard.
 * It processes cars sequentially to avoid rate limits.
 * 
 * Auth: Admin only
 * Rate limit: max 50 cars per call
 */
export const adminDebugReprojectYard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can access debug functions"
    );
  }

  const { yardUid, limit = 50 } = data;
  
  if (!yardUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "yardUid is required"
    );
  }

  // Enforce rate limit
  const maxLimit = 50;
  const actualLimit = Math.min(limit, maxLimit);

  try {
    // Get all cars for this yard
    const carSalesRef = db
      .collection("users")
      .doc(yardUid)
      .collection("carSales");
    
    const snapshot = await carSalesRef.limit(actualLimit).get();
    
    if (snapshot.empty) {
      return {
        success: true,
        yardUid,
        processed: 0,
        reprojected: 0,
        errors: 0,
        message: "No cars found for this yard",
      };
    }

    let processed = 0;
    let reprojected = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const perCarResults: any[] = [];

    // Process each car sequentially
    for (const docSnap of snapshot.docs) {
      const carId = docSnap.id;
      
      try {
        processed++;
        await upsertPublicCarFromMaster(yardUid, carId);
        reprojected++;
        
        // Check if actually published
        const publicRef = db.collection("publicCars").doc(carId);
        const publicSnap = await publicRef.get();
        const isPublished = publicSnap.exists && publicSnap.data()?.isPublished === true;
        
        perCarResults.push({
          carId,
          success: true,
          isPublished,
        });
      } catch (error: any) {
        errors++;
        const errorMsg = `Car ${carId}: ${error.message}`;
        errorDetails.push(errorMsg);
        perCarResults.push({
          carId,
          success: false,
          error: error.message,
        });
        console.error(`[adminDebugReprojectYard] Error processing car ${carId}:`, error);
        // Continue with other cars
      }
    }

    return {
      success: true,
      yardUid,
      processed,
      reprojected,
      errors,
      perCarResults: perCarResults.slice(0, 20), // Limit response size
      message: `Processed ${processed} cars: ${reprojected} reprojected${errors > 0 ? `, ${errors} errors` : ''}`,
      errorDetails: errorDetails.slice(0, 10), // Limit error details
    };
  } catch (error: any) {
    console.error("Error in adminDebugReprojectYard:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to reproject yard: ${error.message}`,
      error
    );
  }
});

/**
 * adminDebugRepairMissingCarFields: Repairs missing updatedAt (and optionally publishedAt) timestamps
 * 
 * This function scans MASTER cars for a yard and backfills missing updatedAt timestamps.
 * Optionally, if a car is effectively published and publishedAt is missing, it sets publishedAt as well.
 * 
 * Safety: Does NOT change publish signals (status/publicationStatus/isPublished).
 * 
 * Auth: Admin only
 */
export const adminDebugRepairMissingCarFields = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("[adminDebugRepairMissingCarFields] start", { correlationId, yardUid: data?.yardUid, uid: callerUid });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugRepairMissingCarFields] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { yardUid, limit = 200, dryRun = false } = data;
    
    if (!yardUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid is required",
        { correlationId }
      );
    }

    const actualLimit = Math.max(1, Math.min(limit || 200, 200)); // Clamp between 1 and 200

    // CRITICAL: Query MASTER cars using the EXACT same collection path as MASTER checks
    // Collection: users/{yardUid}/carSales
    const masterCollectionRef = db.collection("users").doc(yardUid).collection("carSales");
    const masterCollectionPath = masterCollectionRef.path; // For logging
    
    // Query for cars (Firestore doesn't support "where field is null", so we scan and filter)
    let masterSnap;
    try {
      masterSnap = await masterCollectionRef.limit(actualLimit).get();
    } catch (queryError: any) {
      console.error("[adminDebugRepairMissingCarFields] Query error", { 
        correlationId, 
        yardUid, 
        masterCollectionPath,
        error: queryError?.message, 
        stack: queryError?.stack 
      });
      return {
        ok: false,
        level: "FAIL",
        title: "Repair Missing Fields (updatedAt)",
        summary: "Failed to query MASTER cars",
        details: {
          yardUid,
          correlationId,
          masterCollectionPath,
          error: queryError?.message || String(queryError),
          nextAction: "Check Firestore path and permissions",
        },
        ts: new Date().toISOString(),
      };
    }

    let scanned = 0;
    let updatedUpdatedAt = 0;
    let updatedPublishedAt = 0;
    let skipped = 0;
    let notFound = 0;
    let updateFailed = 0;
    let verifyFailed = 0;
    const errors: Array<{ carId: string; error: string; masterDocPath: string }> = [];
    const sampleUpdatedCarIds: string[] = [];

    // Process each document sequentially using the centralized helper
    // This ensures each write is verified individually
    for (const doc of masterSnap.docs) {
      scanned++;
      
      if (scanned > actualLimit) {
        break; // Stop after limit
      }

      const carId = doc.id;
      const masterDocPath = `users/${yardUid}/carSales/${carId}`;

      try {
        // Use the centralized repair helper for each doc
        const repairResult = await repairUpdatedAtForMasterPath(masterDocPath, {
          dryRun,
          correlationId: `${correlationId}_${carId}`,
          setPublishedAtIfPublished: true,
        });

        // Log instrumentation for each repair
        console.info(`[adminDebugRepairMissingCarFields] Car repair result (correlationId: ${correlationId}):`, {
          correlationId,
          yardUid,
          carId,
          masterDocPath,
          status: repairResult.status,
          beforeUpdatedAt: safeToMillis(repairResult.beforeUpdatedAt),
          afterUpdatedAt: safeToMillis(repairResult.afterUpdatedAt),
          didWrite: repairResult.didWrite,
        });

        switch (repairResult.status) {
          case 'NOT_FOUND':
            notFound++;
            errors.push({
              carId,
              error: 'Document not found',
              masterDocPath,
            });
            break;
          
          case 'NO_UPDATE_NEEDED':
            skipped++;
            break;
          
          case 'UPDATED':
            if (repairResult.beforeUpdatedAt === null && repairResult.afterUpdatedAt !== null) {
              updatedUpdatedAt++;
              if (sampleUpdatedCarIds.length < 10) {
                sampleUpdatedCarIds.push(carId);
              }
            }
            if (repairResult.beforePublishedAt === null && repairResult.afterPublishedAt !== null) {
              updatedPublishedAt++;
            }
            break;
          
          case 'UPDATE_FAILED':
            updateFailed++;
            errors.push({
              carId,
              error: repairResult.error || 'Update failed',
              masterDocPath,
            });
            break;
          
          case 'VERIFY_FAILED':
            verifyFailed++;
            errors.push({
              carId,
              error: repairResult.error || 'Verify failed',
              masterDocPath,
            });
            break;
        }
      } catch (docError: any) {
        updateFailed++;
        errors.push({
          carId,
          error: docError?.message || String(docError),
          masterDocPath,
        });
        console.error(`[adminDebugRepairMissingCarFields] Error processing car ${carId} (correlationId: ${correlationId}):`, {
          error: docError?.message,
          stack: docError?.stack,
          masterDocPath,
        });
      }
    }

    // Determine level based on results
    let level: "OK" | "WARN" | "FAIL" = "OK";
    if (updateFailed > 0 || verifyFailed > 0) {
      level = "FAIL";
    } else if (errors.length > 0 || notFound > 0) {
      level = "WARN";
    }

    const summary = dryRun 
      ? `Dry run: ${scanned} scanned, ${updatedUpdatedAt} would update updatedAt, ${updatedPublishedAt} would update publishedAt, ${skipped} skipped${errors.length > 0 ? `, ${errors.length} errors` : ''}`
      : `${scanned} scanned, ${updatedUpdatedAt} updated updatedAt, ${updatedPublishedAt} updated publishedAt, ${skipped} skipped${errors.length > 0 ? `, ${errors.length} errors (${updateFailed} update failed, ${verifyFailed} verify failed, ${notFound} not found)` : ''}`;
    
    const nextAction = dryRun 
      ? "Run without dryRun=true to apply updates"
      : errors.length > 0 
        ? "Some cars failed to update - check errors array for details"
        : "No action needed";

    // Comprehensive logging
    console.info(`[adminDebugRepairMissingCarFields] Complete (correlationId: ${correlationId}):`, {
      correlationId,
      yardUid,
      masterCollectionPath,
      scanned,
      updatedUpdatedAt,
      updatedPublishedAt,
      skipped,
      notFound,
      updateFailed,
      verifyFailed,
      totalErrors: errors.length,
      dryRun,
    });

    return {
      ok: level === "OK",
      level,
      title: "Repair Missing Fields (updatedAt)",
      summary,
      details: {
        yardUid,
        correlationId,
        masterCollectionPath,
        scanned,
        updatedUpdatedAt,
        updatedPublishedAt,
        skipped,
        notFound,
        updateFailed,
        verifyFailed,
        errors: errors.slice(0, 20), // Limit error details
        sampleUpdatedCarIds,
        dryRun,
        nextAction,
      },
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugRepairMissingCarFields] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
      yardUid: data?.yardUid,
      masterCollectionPath: data?.yardUid ? `users/${data.yardUid}/carSales` : 'unknown',
    });
    
    // Return controlled FAIL JSON instead of throwing
    return {
      ok: false,
      level: "FAIL",
      title: "Repair Missing Fields (updatedAt)",
      summary: "Unexpected error during repair",
      details: {
        correlationId,
        yardUid: data?.yardUid,
        error: error.message || String(error),
        nextAction: "Check server logs for correlationId",
      },
      ts: new Date().toISOString(),
    };
  }
});

/**
 * adminDebugRepairCarFields: Repairs missing updatedAt (and optionally publishedAt) for a single car
 * 
 * This function repairs a specific car by carId. Useful for quick, deterministic fixes.
 * 
 * Safety: Does NOT change publish signals (status/publicationStatus/isPublished).
 * 
 * Auth: Admin only
 */
export const adminDebugRepairCarFields = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("[adminDebugRepairCarFields] start", { correlationId, yardUid: data?.yardUid, carId: data?.carId, uid: callerUid });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugRepairCarFields] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { yardUid, carId, dryRun = false } = data;
    
    if (!yardUid || !carId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid and carId are required",
        { correlationId }
      );
    }

    // Compute masterDocPath exactly as in MASTER check (using helper)
    const masterDocRef = getMasterCarDocRef(yardUid, carId);
    const masterDocPath = masterDocRef.path;

    // Use the centralized repair helper
    const repairResult = await repairUpdatedAtForMasterPath(masterDocPath, {
      dryRun,
      correlationId,
      setPublishedAtIfPublished: true, // Set publishedAt if effectively published
    });

    // Log comprehensive instrumentation
    console.info(`[adminDebugRepairCarFields] Repair result (correlationId: ${correlationId}):`, {
      correlationId,
      yardUid,
      carId,
      masterDocPath,
      status: repairResult.status,
      beforeUpdatedAt: safeToMillis(repairResult.beforeUpdatedAt),
      afterUpdatedAt: safeToMillis(repairResult.afterUpdatedAt),
      didWrite: repairResult.didWrite,
      wroteFromLegacy: repairResult.wroteFromLegacy,
      wroteServerTimestamp: repairResult.wroteServerTimestamp,
      error: repairResult.error,
    });

    // Map repair result status to response
    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = "";
    let nextAction = "";

    switch (repairResult.status) {
      case 'NOT_FOUND':
        return {
          ok: false,
          level: "FAIL",
          title: "Repair Selected Car Fields",
          summary: "MASTER car not found",
          details: {
            yardUid,
            carId,
            masterDocPath,
            correlationId,
            nextAction: "Verify yardUid and carId are correct",
          },
          correlationId,
          ts: new Date().toISOString(),
        };
      
      case 'NO_UPDATE_NEEDED':
        // Track timestamp coercion warnings for diagnostic purposes
        const timestampWarnings: string[] = [];
        const beforeUpdatedAtMs = safeToMillis(repairResult.beforeUpdatedAt);
        const beforePublishedAtMs = safeToMillis(repairResult.beforePublishedAt);
        const afterUpdatedAtMs = safeToMillis(repairResult.afterUpdatedAt);
        const afterPublishedAtMs = safeToMillis(repairResult.afterPublishedAt);
        
        if (repairResult.beforeUpdatedAt !== null && beforeUpdatedAtMs === null) {
          timestampWarnings.push('beforeUpdatedAt: unsupported type');
        }
        if (repairResult.beforePublishedAt !== null && beforePublishedAtMs === null) {
          timestampWarnings.push('beforePublishedAt: unsupported type');
        }
        if (repairResult.afterUpdatedAt !== null && afterUpdatedAtMs === null) {
          timestampWarnings.push('afterUpdatedAt: unsupported type');
        }
        if (repairResult.afterPublishedAt !== null && afterPublishedAtMs === null) {
          timestampWarnings.push('afterPublishedAt: unsupported type');
        }
        
        return {
          ok: true,
          level: "OK",
          title: "Repair Selected Car Fields",
          summary: "No updates needed (all fields present)",
          details: {
            yardUid,
            carId,
            masterDocPath,
            correlationId,
            before: {
              updatedAt: beforeUpdatedAtMs,
              publishedAt: beforePublishedAtMs,
            },
            after: {
              updatedAt: afterUpdatedAtMs,
              publishedAt: afterPublishedAtMs,
            },
            ...(timestampWarnings.length > 0 && { timestampCoercionWarnings: timestampWarnings }),
            nextAction: "No action needed",
          },
          correlationId,
          ts: new Date().toISOString(),
        };
      
      case 'UPDATED':
        level = repairResult.afterUpdatedAt ? "OK" : "WARN";
        summary = dryRun 
          ? `Dry run: Would update ${repairResult.wroteFromLegacy ? 'updatedAt (from legacy)' : 'updatedAt (serverTimestamp)'}${repairResult.afterPublishedAt !== repairResult.beforePublishedAt ? ', publishedAt' : ''}`
          : `Updated ${repairResult.wroteFromLegacy ? 'updatedAt (from legacy)' : 'updatedAt (serverTimestamp)'}${repairResult.afterPublishedAt !== repairResult.beforePublishedAt ? ', publishedAt' : ''} (verified)`;
        nextAction = "Re-run MASTER Car Publish State to verify";
        break;
      
      case 'UPDATE_FAILED':
      case 'VERIFY_FAILED':
        level = "FAIL";
        summary = repairResult.status === 'UPDATE_FAILED' 
          ? "Failed to update car document"
          : "Update succeeded but verification failed";
        nextAction = repairResult.error 
          ? `Check error: ${repairResult.error}`
          : "Check Firestore permissions and document state";
        break;
    }

    // Track timestamp coercion warnings for diagnostic purposes
    const timestampWarnings: string[] = [];
    const beforeUpdatedAtMs = safeToMillis(repairResult.beforeUpdatedAt);
    const beforePublishedAtMs = safeToMillis(repairResult.beforePublishedAt);
    const afterUpdatedAtMs = safeToMillis(repairResult.afterUpdatedAt);
    const afterPublishedAtMs = safeToMillis(repairResult.afterPublishedAt);
    
    if (repairResult.beforeUpdatedAt !== null && beforeUpdatedAtMs === null) {
      timestampWarnings.push('beforeUpdatedAt: unsupported type');
    }
    if (repairResult.beforePublishedAt !== null && beforePublishedAtMs === null) {
      timestampWarnings.push('beforePublishedAt: unsupported type');
    }
    if (repairResult.afterUpdatedAt !== null && afterUpdatedAtMs === null) {
      timestampWarnings.push('afterUpdatedAt: unsupported type');
    }
    if (repairResult.afterPublishedAt !== null && afterPublishedAtMs === null) {
      timestampWarnings.push('afterPublishedAt: unsupported type');
    }
    
    return {
      ok: level === "OK",
      level,
      title: "Repair Selected Car Fields",
      summary,
      details: {
        yardUid,
        carId,
        masterDocPath,
        correlationId,
        before: {
          updatedAt: beforeUpdatedAtMs,
          publishedAt: beforePublishedAtMs,
        },
        after: {
          updatedAt: afterUpdatedAtMs,
          publishedAt: afterPublishedAtMs,
        },
        wroteFromLegacy: repairResult.wroteFromLegacy,
        wroteServerTimestamp: repairResult.wroteServerTimestamp,
        didWrite: repairResult.didWrite,
        error: repairResult.error,
        diagnostic: repairResult.diagnostic,
        ...(timestampWarnings.length > 0 && { timestampCoercionWarnings: timestampWarnings }),
        nextAction,
      },
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugRepairCarFields] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
      yardUid: data?.yardUid,
      carId: data?.carId,
      masterDocPath: data?.yardUid && data?.carId ? `users/${data.yardUid}/carSales/${data.carId}` : 'unknown',
    });
    
    // Return structured response instead of throwing
    return {
      ok: false,
      level: "FAIL",
      title: "Repair Selected Car Fields",
      summary: "Unexpected error during repair",
      details: {
        correlationId,
        error: error.message || String(error),
        nextAction: "Check server logs for correlationId",
      },
      ts: new Date().toISOString(),
    };
  }
});

/**
 * adminDebugYardPublishedCounts: Counts published cars for a yard (sample-based)
 * 
 * Auth: Admin only
 */
export const adminDebugYardPublishedCounts = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { yardUid, limit = 100, verbose = false } = data;
    
    if (!yardUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid is required",
        { correlationId }
      );
    }

    const actualLimit = Math.min(limit, 1000);

    // Count MASTER cars (sample)
    const masterRef = db.collection("users").doc(yardUid).collection("carSales");
    let masterQuery = masterRef.limit(actualLimit);
    
    // Try to order by updatedAt if exists, else just limit
    try {
      masterQuery = masterRef.orderBy("updatedAt", "desc").limit(actualLimit);
    } catch {
      // If no index, just use limit
      masterQuery = masterRef.limit(actualLimit);
    }
    
    const masterSnap = await masterQuery.get();

    let masterTotal = 0;
    let masterEffectivePublished = 0;
    let masterSignalsMisaligned = 0;
    let soldCount = 0;
    const publishedCarIds: string[] = [];

    masterSnap.forEach((doc) => {
      masterTotal++;
      const carData = doc.data();
      const publishState = computeMasterPublishState(carData);
      
      if (publishState.effectivePublished) {
        masterEffectivePublished++;
        publishedCarIds.push(doc.id);
      }
      
      if (publishState.signals.saleStatus === 'SOLD') {
        soldCount++;
      }
      
      // Check for misaligned signals
      if (publishState.signals.status === 'published' && publishState.signals.isPublished !== true) {
        masterSignalsMisaligned++;
      }
    });

    // Count PUBLIC cars for this yard (if yardUid field exists)
    let publicTotal = 0;
    let publicPublished = 0;
    let publicCountsAvailable = false;

    try {
      const publicQuery = db.collection("publicCars")
        .where("yardUid", "==", yardUid)
        .limit(actualLimit);
      const publicSnap = await publicQuery.get();
      
      publicSnap.forEach((doc) => {
        publicTotal++;
        if (doc.data()?.isPublished === true) {
          publicPublished++;
        }
      });
      publicCountsAvailable = true;
    } catch {
      // If query fails (no index or field missing), mark as unavailable
      publicCountsAvailable = false;
    }

    const publicCarIdsSet = new Set<string>();
    if (publicCountsAvailable) {
      try {
        const publicSnap = await db.collection("publicCars")
          .where("yardUid", "==", yardUid)
          .limit(actualLimit)
          .get();
        publicSnap.forEach(doc => publicCarIdsSet.add(doc.id));
      } catch {
        // Ignore
      }
    }

    const missingProjections = publishedCarIds.filter(id => !publicCarIdsSet.has(id)).slice(0, 20);

    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = `MASTER (sample): ${masterEffectivePublished}/${masterTotal} published`;
    if (publicCountsAvailable) {
      summary += `, PUBLIC: ${publicPublished}/${publicTotal}`;
    }
    let nextAction = "No action needed";

    if (missingProjections.length > 0) {
      level = "WARN";
      summary += `, ${missingProjections.length} missing projection(s)`;
      nextAction = "Run reproject for missing cars";
    }
    if (masterEffectivePublished !== publicPublished && publicCountsAvailable) {
      level = "WARN";
      summary += " (count mismatch)";
      nextAction = "Run reproject to sync counts";
    }
    if (masterSignalsMisaligned > 0) {
      level = "WARN";
      summary += `, ${masterSignalsMisaligned} misaligned signal(s)`;
      nextAction = "Fix publish signals";
    }

    const details: any = {
      yardUid,
      correlationId,
      sampleSize: masterTotal,
      master: {
        total: masterTotal,
        effectivePublished: masterEffectivePublished,
        signalsMisaligned: masterSignalsMisaligned,
        sold: soldCount,
        sampleCarIds: publishedCarIds.slice(0, 10),
      },
      publicCars: publicCountsAvailable ? {
        total: publicTotal,
        published: publicPublished,
      } : "unavailable (missing yardUid field in publicCars or no index)",
      issues: {
        missingProjections: missingProjections.slice(0, 20),
        missingCount: missingProjections.length,
        mismatch: masterEffectivePublished !== publicPublished && publicCountsAvailable,
      },
      nextAction,
    };

    if (verbose) {
      details.allPublishedCarIds = publishedCarIds;
    }

    return {
      ok: level === "OK",
      level,
      title: "Yard Published Counts",
      summary,
      details,
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugYardPublishedCounts] Error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugYardPublishedCounts failed",
      { correlationId, error: error.message }
    );
  }
});

/**
 * adminDebugScanMasterHealth: Scans MASTER cars for missing/null/type issues
 * 
 * Auth: Admin only
 */
export const adminDebugScanMasterHealth = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    console.error(`[adminDebugScanMasterHealth] Unauthenticated request, correlationId: ${correlationId}`);
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("adminDebugScanMasterHealth:start", { 
      correlationId, 
      yardUid: data?.yardUid, 
      limit: data?.limit, 
      uid: callerUid 
    });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugScanMasterHealth] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin only",
        { correlationId }
      );
    }

    const { yardUid, limit = 25, verbose = false } = data;
    
    if (!yardUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid is required",
        { correlationId }
      );
    }

    // Clamp limit: default 25, max 50, min 1
    const actualLimit = Math.max(1, Math.min(limit || 25, 50));
    
    // Safe baseline query without orderBy to avoid index/field failures
    const col = db.collection(`users/${yardUid}/carSales`);
    let masterSnap;
    let usedOrderBy = false;
    
    // Try orderBy, but fallback to simple limit if it fails (missing index/field)
    try {
      const orderedQuery = col.orderBy("updatedAt", "desc").limit(actualLimit);
      masterSnap = await orderedQuery.get();
      usedOrderBy = true;
      console.info(`[adminDebugScanMasterHealth] Used orderBy (correlationId: ${correlationId})`);
    } catch (orderByError: any) {
      // Fallback to no-order query
      console.warn(`[adminDebugScanMasterHealth] orderBy failed, using simple limit (correlationId: ${correlationId}):`, {
        error: orderByError?.message,
        hint: "Missing index on updatedAt or field doesn't exist",
      });
      try {
        masterSnap = await col.limit(actualLimit).get();
        usedOrderBy = false;
      } catch (queryError: any) {
        console.error("adminDebugScanMasterHealth:error", {
          correlationId,
          message: queryError?.message,
          code: queryError?.code,
          stack: queryError?.stack,
        });
        throw new functions.https.HttpsError(
          "internal",
          "adminDebugScanMasterHealth failed",
          {
            correlationId,
            reason: queryError?.message || String(queryError),
            hint: "Check query path, orderBy/index, missing fields, or bad yardUid",
          }
        );
      }
    }

    const issues: Array<{
      carId: string;
      problems: string[];
      plateNumber?: string;
    }> = [];
    let missingIsPublished = 0;
    let missingPublicationStatus = 0;
    let missingStatus = 0;
    let missingUpdatedAt = 0;
    let parseErrors = 0;
    let scannedCount = 0;

    // Process each document with per-doc error handling (must not crash the whole scan)
    masterSnap.forEach((doc) => {
      scannedCount++;
      try {
        const carData = doc.data();
        const carIssues: string[] = [];

        if (carData?.isPublished === undefined) {
          missingIsPublished++;
          carIssues.push('isPublished missing');
        }
        if (!carData?.publicationStatus) {
          missingPublicationStatus++;
          carIssues.push('publicationStatus missing');
        }
        if (!carData?.status) {
          missingStatus++;
          carIssues.push('status missing');
        }
        if (!carData?.updatedAt) {
          missingUpdatedAt++;
          carIssues.push('updatedAt missing');
        }

        // Type checks
        if (carData?.isPublished !== undefined && typeof carData.isPublished !== 'boolean') {
          carIssues.push('isPublished wrong type (not boolean)');
        }
        if (carData?.imageUrls !== undefined && !Array.isArray(carData.imageUrls)) {
          carIssues.push('imageUrls wrong type (not array)');
        }

        if (carIssues.length > 0 && issues.length < 50) {
          issues.push({
            carId: doc.id,
            problems: carIssues,
            plateNumber: carData?.licensePlatePartial || carData?.plateNumber || undefined,
          });
        }
      } catch (docError: any) {
        // Per-doc parsing error - log but continue (must not crash the whole scan)
        parseErrors++;
        console.warn(`[adminDebugScanMasterHealth] Error parsing doc ${doc.id} (correlationId: ${correlationId}):`, {
          error: docError?.message,
          carId: doc.id,
        });
        if (issues.length < 50) {
          issues.push({
            carId: doc.id,
            problems: ["parse_failed"],
            reason: docError?.message || String(docError),
          } as any);
        }
        // Continue to next document
      }
    });

    // Determine level based on results (return partial success instead of FAIL when possible)
    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = `Scanned ${scannedCount} cars, ${issues.length} issues`;
    let nextAction = "No action needed";
    const partial = parseErrors > 0 || scannedCount < masterSnap.size;

    if (parseErrors > 0) {
      level = "WARN";
      summary += ` (${parseErrors} parse errors)`;
      nextAction = "Some documents failed to parse - check data structure";
    } else if (issues.length > 0) {
      level = "WARN";
      nextAction = "Fix missing/null/type issues in MASTER documents";
    }
    
    // Only FAIL when collection read fails or yardUid invalid (handled in catch block)

    const details: any = {
      yardUid,
      correlationId,
      sampleSize: scannedCount,
      totalDocs: masterSnap.size,
      partial,
      usedOrderBy,
      issues: issues.slice(0, 50),
      counts: {
        missingIsPublished,
        missingPublicationStatus,
        missingStatus,
        missingUpdatedAt,
        parseErrors,
      },
      nextAction,
    };

    if (verbose) {
      details.allIssues = issues;
    }

    console.info(`[adminDebugScanMasterHealth] Success (correlationId: ${correlationId}):`, {
      yardUid,
      scannedCount,
      issuesFound: issues.length,
      parseErrors,
    });

    return {
      ok: level === "OK",
      level,
      title: "MASTER Undefined/Null Scan",
      summary,
      details,
    };
  } catch (error: any) {
    // If already an HttpsError, rethrow with correlationId if missing
    if (error instanceof functions.https.HttpsError) {
      const existingDetails: any = error.details || {};
      if (!existingDetails.correlationId) {
        // Create new HttpsError with correlationId added
        throw new functions.https.HttpsError(
          error.code,
          error.message,
          { ...existingDetails, correlationId }
        );
      }
      throw error;
    }
    
    // Log full error details
    console.error("adminDebugScanMasterHealth:error", {
      correlationId,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugScanMasterHealth failed",
      {
        correlationId,
        reason: error?.message || String(error),
        hint: "Check query path, orderBy/index, missing fields, or bad yardUid",
      }
    );
  }
});

/**
 * adminDebugScanPublishSignals: Scans for misaligned publish signals
 * 
 * Auth: Admin only
 */
export const adminDebugScanPublishSignals = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { yardUid, limit = 100, verbose = false } = data;
    
    if (!yardUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid is required",
        { correlationId }
      );
    }

    const actualLimit = Math.min(limit, 500);
    const masterRef = db.collection("users").doc(yardUid).collection("carSales");
    
    let masterQuery = masterRef.limit(actualLimit);
    try {
      masterQuery = masterRef.orderBy("updatedAt", "desc").limit(actualLimit);
    } catch {
      masterQuery = masterRef.limit(actualLimit);
    }
    
    const masterSnap = await masterQuery.get();

    const misaligned: Array<{
      carId: string;
      effectivePublished: boolean;
      isPublishedField: boolean;
      status?: string;
      publicationStatus?: string;
      recommendedFix: string;
      plateNumber?: string;
    }> = [];

    masterSnap.forEach((doc) => {
      const carData = doc.data();
      const publishState = computeMasterPublishState(carData);
      const hasIsPublished = carData?.isPublished !== undefined;
      const isPublishedValue = carData?.isPublished === true;

      // Check for misalignment
      if (publishState.effectivePublished !== isPublishedValue && hasIsPublished) {
        let recommendedFix = "Set isPublished to match effective published state";
        
        if (publishState.effectivePublished && !isPublishedValue) {
          recommendedFix = "Set isPublished=true (status/publicationStatus indicate published)";
        } else if (!publishState.effectivePublished && isPublishedValue) {
          recommendedFix = "Set isPublished=false OR fix status/publicationStatus";
        }

        misaligned.push({
          carId: doc.id,
          effectivePublished: publishState.effectivePublished,
          isPublishedField: isPublishedValue,
          status: publishState.signals.status,
          publicationStatus: publishState.signals.publicationStatus,
          recommendedFix,
          plateNumber: carData?.licensePlatePartial || carData?.plateNumber || undefined,
        });
      }
    });

    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = `${misaligned.length} misaligned signal(s) (sample: ${masterSnap.size})`;
    let nextAction = "No action needed";

    if (misaligned.length > 0) {
      level = "WARN";
      nextAction = "Fix misaligned publish signals (see details for recommended fixes)";
    }

    const details: any = {
      yardUid,
      correlationId,
      sampleSize: masterSnap.size,
      misaligned: misaligned.slice(0, 50),
      misalignedCount: misaligned.length,
      nextAction,
    };

    if (verbose) {
      details.allMisaligned = misaligned;
    }

    return {
      ok: level === "OK",
      level,
      title: "Publish Signal Canonicality Scan",
      summary,
      details,
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugScanPublishSignals] Error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugScanPublishSignals failed",
      { correlationId, error: error.message }
    );
  }
});

/**
 * adminDebugCustomerHealthCheck: Health check for Customer Management tabs
 * 
 * Checks adminUsersIndex collection for a specific role and returns diagnostics.
 * 
 * Auth: Admin only
 */
export const adminDebugCustomerHealthCheck = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("[adminDebugCustomerHealthCheck] start", { correlationId, role: data?.role, uid: callerUid });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugCustomerHealthCheck] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { role } = data; // 'YARD' | 'AGENT' | 'PRIVATE' | 'ALL'
    
    if (!role || !['YARD', 'AGENT', 'PRIVATE', 'ALL'].includes(role)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "role must be one of: YARD, AGENT, PRIVATE, ALL",
        { correlationId }
      );
    }

    const collectionPath = 'adminUsersIndex';
    let queryRef: admin.firestore.Query = db.collection(collectionPath);
    const filters: any = {};
    const queryConstraints: any[] = [];

    // Apply role filter if not ALL
    if (role !== 'ALL') {
      // For PRIVATE role, normalize to handle both "PRIVATE" and "PRIVATE_USER"
      if (role === 'PRIVATE') {
        // Use whereIn to query for both values
        queryRef = queryRef.where('primaryRole', 'in', ['PRIVATE', 'PRIVATE_USER']);
        filters.primaryRole = ['PRIVATE', 'PRIVATE_USER'];
        queryConstraints.push({ type: 'where', field: 'primaryRole', operator: 'in', value: ['PRIVATE', 'PRIVATE_USER'] });
      } else {
        queryRef = queryRef.where('primaryRole', '==', role);
        filters.primaryRole = role;
        queryConstraints.push({ type: 'where', field: 'primaryRole', operator: '==', value: role });
      }
    }

    // Execute query with limit for safety
    const limit = 1000; // Reasonable limit for health check
    queryRef = queryRef.limit(limit);
    
    let snapshot;
    let count = 0;
    const sampleIds: string[] = [];
    let oldestUpdatedAt: admin.firestore.Timestamp | null = null;
    let newestUpdatedAt: admin.firestore.Timestamp | null = null;
    let lastError: any = null;
    
    // Helper to convert Timestamp to millis safely
    const timestampToMillis = (ts: admin.firestore.Timestamp | null): number | null => {
      if (ts === null) return null;
      if (ts instanceof admin.firestore.Timestamp) {
        return ts.toMillis();
      }
      return null;
    };

    // Check adminUsersIndex first
    try {
      snapshot = await queryRef.get();
      count = snapshot.size;
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (sampleIds.length < 10) {
          sampleIds.push(doc.id);
        }
        
        const updatedAt = data.updatedAt;
        if (updatedAt instanceof admin.firestore.Timestamp) {
          if (oldestUpdatedAt === null || updatedAt.toMillis() < oldestUpdatedAt.toMillis()) {
            oldestUpdatedAt = updatedAt;
          }
          if (newestUpdatedAt === null || updatedAt.toMillis() > newestUpdatedAt.toMillis()) {
            newestUpdatedAt = updatedAt;
          }
        }
      });
    } catch (queryError: any) {
      lastError = {
        code: queryError?.code || 'unknown',
        message: queryError?.message || String(queryError),
      };
      console.error("[adminDebugCustomerHealthCheck] Query error", { correlationId, role, error: queryError });
    }

    // Canonical fallback: if adminUsersIndex is empty or missing, query users collection
    let canonicalCount = 0;
    let canonicalSampleIds: string[] = [];
    let canonicalCollectionPaths: string[] = [];
    let sourceUsed: 'adminUsersIndex' | 'canonicalFallback' | 'both' = 'adminUsersIndex';
    
    if (count === 0 || lastError) {
      console.log(`[adminDebugCustomerHealthCheck] adminUsersIndex empty or error, using canonical fallback (correlationId: ${correlationId}, role: ${role})`);
      
      try {
        const usersRef = db.collection('users');
        let canonicalQuery: admin.firestore.Query = usersRef;
        
        // Build canonical query based on role
        if (role === 'YARD') {
          // YARD: isYard === true OR primaryRole === 'YARD'
          canonicalQuery = usersRef.where('isYard', '==', true);
          canonicalCollectionPaths.push('users (isYard=true)');
          // Also try primaryRole if needed (fallback if isYard query fails)
        } else if (role === 'AGENT') {
          // AGENT: isAgent === true OR primaryRole === 'AGENT'
          canonicalQuery = usersRef.where('isAgent', '==', true);
          canonicalCollectionPaths.push('users (isAgent=true)');
        } else if (role === 'PRIVATE') {
          // PRIVATE: primaryRole in ['PRIVATE_USER', 'PRIVATE'] OR isPrivateUser === true
          // Prefer primaryRole-based query first to match Health Check definition
          canonicalQuery = usersRef.where('primaryRole', 'in', ['PRIVATE_USER', 'PRIVATE']);
          canonicalCollectionPaths.push('users (primaryRole in [PRIVATE_USER, PRIVATE])');
        } else if (role === 'ALL') {
          // ALL: just get all users
          canonicalQuery = usersRef;
          canonicalCollectionPaths.push('users (all)');
        }
        
        canonicalQuery = canonicalQuery.limit(limit);
        const canonicalSnapshot = await canonicalQuery.get();
        
        // For PRIVATE, we need to filter out YARD/AGENT users, so count after filtering
        if (role === 'PRIVATE') {
          const filteredDocs = canonicalSnapshot.docs.filter((doc) => {
            const data = doc.data();
            return !(data.isYard === true || data.isAgent === true || 
                     data.primaryRole === 'YARD' || data.primaryRole === 'AGENT');
          });
          canonicalCount = filteredDocs.length;
          filteredDocs.forEach((doc) => {
            if (canonicalSampleIds.length < 10) {
              canonicalSampleIds.push(doc.id);
            }
          });
        } else {
          canonicalCount = canonicalSnapshot.size;
          canonicalSnapshot.forEach((doc) => {
            if (canonicalSampleIds.length < 10) {
              canonicalSampleIds.push(doc.id);
            }
          });
        }
        
        if (canonicalCount > 0) {
          sourceUsed = count > 0 ? 'both' : 'canonicalFallback';
        }
      } catch (canonicalError: any) {
        console.error(`[adminDebugCustomerHealthCheck] Canonical fallback error (correlationId: ${correlationId}):`, canonicalError);
        // Don't fail the whole check if canonical fails, just log it
      }
    }

    // Determine level and summary based on both sources
    let level: "OK" | "WARN" | "FAIL" = "OK";
    let summary = '';
    let nextAction = "No action needed";
    
    const totalCount = sourceUsed === 'both' ? count + canonicalCount : (sourceUsed === 'canonicalFallback' ? canonicalCount : count);
    
    if (lastError && canonicalCount === 0) {
      level = "FAIL";
      summary = `Query failed: ${lastError.code}`;
      if (lastError.code === 'failed-precondition') {
        nextAction = "Create missing Firestore index (see error message for details)";
      } else if (lastError.code === 'permission-denied') {
        nextAction = "Check admin claim and Firestore rules";
      } else {
        nextAction = "Check server logs for correlationId";
      }
    } else if (totalCount === 0) {
      level = "WARN";
      summary = `No ${role === 'ALL' ? 'users' : role.toLowerCase()} found in index or canonical sources`;
      nextAction = sourceUsed === 'canonicalFallback' 
        ? "adminUsersIndex is empty; using canonical fallback. Consider rebuilding index."
        : "Verify collection exists and contains documents";
    } else {
      if (sourceUsed === 'canonicalFallback') {
        level = "WARN";
        summary = `${canonicalCount} ${role === 'ALL' ? 'users' : role.toLowerCase()} found (canonical fallback; adminUsersIndex empty)`;
        nextAction = "adminUsersIndex is empty. Click 'Rebuild Customers Index' to populate it.";
      } else if (sourceUsed === 'both') {
        level = "OK";
        summary = `${count} in index, ${canonicalCount} in canonical (${totalCount} total)`;
        nextAction = "Both sources available";
      } else {
        level = "OK";
        summary = `${count} ${role === 'ALL' ? 'users' : role.toLowerCase()} found in index`;
        nextAction = "No action needed";
      }
      
      if (count >= limit || canonicalCount >= limit) {
        level = "WARN";
        summary += ` (limited to ${limit})`;
        nextAction = "Consider pagination for full results";
      }
    }

    const details: any = {
      correlationId,
      sourceUsed,
      adminUsersIndex: {
        collectionPath,
        count,
        sampleIds: sampleIds.slice(0, 10),
        oldestUpdatedAt: timestampToMillis(oldestUpdatedAt),
        newestUpdatedAt: timestampToMillis(newestUpdatedAt),
        lastError,
      },
      canonicalFallback: {
        collectionPaths: canonicalCollectionPaths,
        count: canonicalCount,
        sampleIds: canonicalSampleIds.slice(0, 10),
      },
      role,
      filters,
      queryConstraints,
      totalCount,
      nextAction,
    };

    console.info(`[adminDebugCustomerHealthCheck] Success (correlationId: ${correlationId}):`, {
      role,
      count,
      level,
    });

    return {
      ok: level === "OK",
      level,
      title: `Customer Health Check: ${role}`,
      summary,
      details,
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugCustomerHealthCheck] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
      role: data?.role,
    });
    
    return {
      ok: false,
      level: "FAIL",
      title: `Customer Health Check: ${data?.role || 'unknown'}`,
      summary: "Unexpected error during health check",
      details: {
        correlationId,
        error: error.message || String(error),
        nextAction: "Check server logs for correlationId",
      },
      ts: new Date().toISOString(),
    };
  }
});

/**
 * Helper: Extract roles from user document (same logic as adminUsersIndex.ts)
 */
function extractRolesFromUser(userData: any): string[] {
  const roles: string[] = [];
  
  if (userData.isYard === true || userData.primaryRole === "YARD") {
    roles.push("YARD");
  }
  
  if (userData.isAgent === true || userData.primaryRole === "AGENT") {
    roles.push("AGENT");
  }
  
  if (userData.canSell === true || 
      (!userData.isYard && !userData.isAgent && !userData.primaryRole)) {
    roles.push("PRIVATE");
  }
  
  if (roles.length === 0) {
    roles.push("PRIVATE");
  }
  
  return Array.from(new Set(roles));
}

/**
 * Helper: Compute primaryRole from roles array (same logic as adminUsersIndex.ts)
 */
function computePrimaryRole(roles: string[]): "YARD" | "AGENT" | "PRIVATE" {
  if (roles.includes("YARD")) {
    return "YARD";
  }
  if (roles.includes("AGENT")) {
    return "AGENT";
  }
  return "PRIVATE";
}

/**
 * Admin-only: Rebuild adminUsersIndex from canonical sources
 * 
 * Scans users collection and populates adminUsersIndex for the specified role(s).
 */
export const adminDebugRebuildAdminUsersIndex = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `rebuild_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const ts = new Date().toISOString();

  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  
  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only", { correlationId });
    }

    const { role = 'ALL', limit = 1000, dryRun = false } = data;
    
    if (!['YARD', 'AGENT', 'PRIVATE', 'ALL'].includes(role)) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid role", { correlationId });
    }

    console.log(`[adminDebugRebuildAdminUsersIndex] Starting rebuild (correlationId: ${correlationId}, role: ${role}, limit: ${limit}, dryRun: ${dryRun})`);

    let scanned = 0;
    let upserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    const sampleUpsertedIds: string[] = [];
    const batchSize = 50;

    // Build canonical query
    const usersRef = db.collection('users');
    let queryRef: admin.firestore.Query = usersRef;
    
    if (role === 'YARD') {
      queryRef = usersRef.where('isYard', '==', true);
    } else if (role === 'AGENT') {
      queryRef = usersRef.where('isAgent', '==', true);
    } else if (role === 'PRIVATE') {
      queryRef = usersRef.where('canSell', '==', true);
    }
    // else role === 'ALL' - no filter
    
    queryRef = queryRef.limit(limit);
    const snapshot = await queryRef.get();
    
    // Process in batches
    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = snapshot.docs.slice(i, i + batchSize);
      
      for (const userDoc of batch) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        
        try {
          scanned++;
          
          // Filter by role logic if needed (for PRIVATE, exclude YARD/AGENT)
          if (role === 'PRIVATE') {
            if (userData.isYard === true || userData.isAgent === true || 
                userData.primaryRole === 'YARD' || userData.primaryRole === 'AGENT') {
              skipped++;
              continue;
            }
          }
          
          if (!dryRun) {
            const roles = extractRolesFromUser(userData);
            const primaryRole = computePrimaryRole(roles);
            
            const indexDoc: any = {
              uid,
              email: userData.email || null,
              displayName: userData.displayName || userData.fullName || null,
              phone: userData.phone || null,
              roles,
              primaryRole,
              plan: userData.subscriptionPlan || null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            
            const indexRef = db.collection('adminUsersIndex').doc(uid);
            await indexRef.set(indexDoc, { merge: true });
            
            upserted++;
            if (sampleUpsertedIds.length < 10) {
              sampleUpsertedIds.push(uid);
            }
          } else {
            upserted++; // Count as would-upsert in dry run
            if (sampleUpsertedIds.length < 10) {
              sampleUpsertedIds.push(uid);
            }
          }
        } catch (error: any) {
          const errorMsg = `User ${uid}: ${error.message || String(error)}`;
          errors.push(errorMsg);
          console.error(`[adminDebugRebuildAdminUsersIndex] Error processing ${uid}:`, error);
        }
      }
    }

    const level = errors.length > 0 ? "WARN" : "OK";
    const summary = dryRun 
      ? `Dry run: Would upsert ${upserted} users (scanned ${scanned}, skipped ${skipped})`
      : `Upserted ${upserted} users (scanned ${scanned}, skipped ${skipped}${errors.length > 0 ? `, ${errors.length} errors` : ''})`;

    console.info(`[adminDebugRebuildAdminUsersIndex] Completed (correlationId: ${correlationId}):`, {
      role,
      scanned,
      upserted,
      skipped,
      errors: errors.length,
    });

    return {
      ok: errors.length === 0,
      level,
      title: `Rebuild Customers Index: ${role}`,
      summary,
      details: {
        correlationId,
        role,
        scanned,
        upserted,
        skipped,
        errors: errors.slice(0, 10), // Limit to first 10 errors
        sampleUpsertedIds,
        dryRun,
        sourceCollection: 'users',
        targetCollection: 'adminUsersIndex',
      },
      correlationId,
      ts,
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugRebuildAdminUsersIndex] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
    });
    
    return {
      ok: false,
      level: "FAIL",
      title: `Rebuild Customers Index Failed`,
      summary: "Unexpected error during rebuild",
      details: {
        correlationId,
        error: error.message,
        nextAction: "Check server logs for correlationId.",
      },
      correlationId,
      ts,
    };
  }
});
