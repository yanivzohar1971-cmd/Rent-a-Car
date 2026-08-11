/**
 * Admin Debug Callable Functions
 * 
 * Provides admin-only callable functions for debugging and diagnostics.
 * All functions require admin authentication.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { upsertPublicCarFromMaster, loadAdminSellerExposure, loadPublicSellerProfile, isMasterCarPublished } from "../cars/publicCarProjection";
import { getYardCarMaster } from "../cars/masterCarService";

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
export async function adminDebugPingHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugPing = functions.https.onCall(adminDebugPingHandler);

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
export async function adminDebugMasterCarStateHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugMasterCarState = functions.https.onCall(adminDebugMasterCarStateHandler);

/**
 * adminDebugPublicCarState: Reads PUBLIC car document and returns projection state
 * 
 * Auth: Admin only
 */
export async function adminDebugPublicCarStateHandler(data: any, context: functions.https.CallableContext) {
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

    // Always resolve MASTER publish intent FIRST to determine if PUBLIC is expected
    // Determine effectivePublished boolean:
    //   effectivePublished = masterExists && (isPublished === true || publicationStatus === "PUBLISHED" || status === "published")
    let masterPublished = false;
    let masterHidden = false;
    let masterStateKnown = false;
    let masterExists = false;
    
    // Determine effective yardUid: use provided yardUid, or try to parse from carId
    let effectiveYardUid = yardUid || null;
    
    // If yardUid not provided, try to parse from carId prefix (format: "{yardUid}_{...}")
    if (!effectiveYardUid && carId) {
      // Try to extract yardUid from carId prefix (e.g., "1834..._11893703_2022" -> "1834...")
      const firstUnderscore = carId.indexOf('_');
      if (firstUnderscore > 0) {
        const potentialYardUid = carId.substring(0, firstUnderscore);
        // Validate: yardUid should be a reasonable length (typically 28 chars for Firebase Auth UID)
        if (potentialYardUid.length >= 10 && potentialYardUid.length <= 50) {
          effectiveYardUid = potentialYardUid;
          console.info("[adminDebugPublicCarState] Parsed yardUid from carId", { correlationId, carId, parsedYardUid: effectiveYardUid });
        }
      }
    }
    
    // Check MASTER if effective yardUid is available
    if (effectiveYardUid) {
      try {
        const masterRef = db.collection("users").doc(effectiveYardUid).collection("carSales").doc(carId);
        const masterSnap = await masterRef.get();
        
        if (masterSnap.exists) {
          masterExists = true;
          const masterData = masterSnap.data() || {};
          const masterPublishState = computeMasterPublishState(masterData);
          // effectivePublished is determined by computeMasterPublishState:
          // effectivePublished = isPublished || pubStatus === 'PUBLISHED' || status === 'published'
          masterPublished = masterPublishState.effectivePublished;
          masterHidden = masterPublishState.effectiveHidden;
          masterStateKnown = true;
        } else {
          // MASTER doesn't exist - state is known (not published)
          masterStateKnown = true;
          masterPublished = false;
          masterExists = false;
        }
      } catch (masterError: any) {
        console.warn("[adminDebugPublicCarState] Could not read MASTER", { correlationId, yardUid: effectiveYardUid, carId, error: masterError?.message });
        // Continue without MASTER check - masterStateKnown remains false
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
    
    // If we still don't know MASTER state and PUBLIC exists, try to get yardUid from PUBLIC and check MASTER
    if (!masterStateKnown && publicSnap.exists) {
      const publicDataTemp = publicSnap.data() || {};
      const publicYardUid = publicDataTemp?.yardUid || publicDataTemp?.ownerUid || null;
      
      // Use yardUid from PUBLIC if we don't have one yet, or if it's different from what we tried
      if (publicYardUid && publicYardUid !== effectiveYardUid) {
        effectiveYardUid = publicYardUid;
        try {
          const masterRef = db.collection("users").doc(effectiveYardUid).collection("carSales").doc(carId);
          const masterSnap = await masterRef.get();
          
          if (masterSnap.exists) {
            masterExists = true;
            const masterData = masterSnap.data() || {};
            const masterPublishState = computeMasterPublishState(masterData);
            masterPublished = masterPublishState.effectivePublished;
            masterHidden = masterPublishState.effectiveHidden;
            masterStateKnown = true;
          } else {
            // MASTER doesn't exist - state is known (not published)
            masterStateKnown = true;
            masterPublished = false;
            masterExists = false;
          }
        } catch (masterError: any) {
          console.warn("[adminDebugPublicCarState] Could not read MASTER from PUBLIC yardUid", { correlationId, yardUid: effectiveYardUid, carId, error: masterError?.message });
          // Continue without MASTER check - masterStateKnown remains false
        }
      }
    } else if (publicSnap.exists && !effectiveYardUid) {
      // PUBLIC exists but we don't have yardUid yet - get it from PUBLIC
      const publicDataTemp = publicSnap.data() || {};
      effectiveYardUid = publicDataTemp?.yardUid || publicDataTemp?.ownerUid || null;
    }

    if (!publicSnap.exists) {
      // IF publicDoc does NOT exist:
      //   IF effectivePublished === false:
      //     - ok = true, level = "OK", summary = "PUBLIC document correctly absent (MASTER not published)"
      //     - details.expectedAbsence = true
      //     - REMOVE nextAction
      //   ELSE (effectivePublished === true):
      //     - ok = false, level = "WARN", summary = "PUBLIC document missing for published MASTER"
      //     - details.expectedAbsence = false
      //     - nextAction = "Run reproject"
      
      // If MASTER publish state is known AND effectivePublished === false,
      // treat missing PUBLIC doc as EXPECTED (OK)
      if (masterStateKnown && masterPublished === false) {
        return {
          ok: true,
          level: "OK",
          title: "PUBLIC Car Projection State",
          summary: "PUBLIC document correctly absent (MASTER not published)",
          details: {
            carId,
            yardUid: effectiveYardUid || null,
            correlationId,
            masterPublished: masterPublished, // Always boolean when masterStateKnown is true
            masterHidden,
            masterExists,
            expectedAbsence: true,
          },
          ts: new Date().toISOString(),
        };
      }
      
      // Only keep WARN when:
      // - MASTER is published (effectivePublished === true)
      // - AND PUBLIC doc is missing
      // (this indicates a real projection failure)
      if (masterStateKnown && masterPublished === true) {
        return {
          ok: false,
          level: "WARN",
          title: "PUBLIC Car Projection State",
          summary: "PUBLIC document missing for published MASTER",
          details: {
            carId,
            yardUid: effectiveYardUid || null,
            correlationId,
            masterPublished: masterPublished, // Always boolean when masterStateKnown is true
            masterHidden,
            masterExists,
            expectedAbsence: false,
            nextAction: "Run reproject",
          },
          ts: new Date().toISOString(),
        };
      }
      
      // If MASTER state is unknown (e.g., yardUid not found or MASTER read failed),
      // we cannot determine if absence is expected, so return WARN
      // BUT if we determined that MASTER doesn't exist (masterStateKnown === true && masterExists === false),
      // then it's OK (no MASTER means no PUBLIC expected)
      if (masterStateKnown && !masterExists) {
        return {
          ok: true,
          level: "OK",
          title: "PUBLIC Car Projection State",
          summary: "PUBLIC document correctly absent (MASTER does not exist)",
          details: {
            carId,
            yardUid: effectiveYardUid || null,
            correlationId,
            masterPublished: false, // MASTER doesn't exist, so not published
            masterExists: false,
            expectedAbsence: true,
          },
          ts: new Date().toISOString(),
        };
      }
      
      // MASTER state is truly unknown - cannot determine if absence is expected
      return {
        ok: false,
        level: "WARN",
        title: "PUBLIC Car Projection State",
        summary: "MASTER state unknown (need yardUid)",
        details: {
          carId,
          yardUid: effectiveYardUid || null,
          correlationId,
          masterPublished: null,
          masterStateKnown: false,
          expectedAbsence: false,
          nextAction: "Provide yardUid or check MASTER document exists",
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
      yardUid: effectiveYardUid || null,
      correlationId,
      isPublished,
      status,
      publicationStatus,
      masterPublished: masterStateKnown ? masterPublished : null, // Boolean when known, null when unknown
      masterHidden: masterStateKnown ? masterHidden : null,
      masterExists: masterStateKnown ? masterExists : null,
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
      masterPublished: masterStateKnown ? masterPublished : null,
      masterStateKnown,
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
}

export const adminDebugPublicCarState = functions.https.onCall(adminDebugPublicCarStateHandler);

export async function adminDebugCheckCarHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugCheckCar = functions.https.onCall(adminDebugCheckCarHandler);

/**
 * adminDebugReprojectCar: Forces upsert projection for a car
 * 
 * This function calls upsertPublicCarFromMaster to reproject a single car.
 * It will create or update the publicCars/{carId} document based on MASTER state.
 * 
 * Auth: Admin only
 */
export async function adminDebugReprojectCarHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugReprojectCar = functions.https.onCall(adminDebugReprojectCarHandler);

/**
 * adminDebugReprojectYard: Batch reproject limited cars for a yard
 * 
 * This function reprojects up to limit cars for a yard.
 * It processes cars sequentially to avoid rate limits.
 * 
 * Auth: Admin only
 * Rate limit: max 50 cars per call
 */
export async function adminDebugReprojectYardHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugReprojectYard = functions.https.onCall(adminDebugReprojectYardHandler);

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
export async function adminDebugRepairMissingCarFieldsHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugRepairMissingCarFields = functions.https.onCall(adminDebugRepairMissingCarFieldsHandler);

/**
 * adminDebugRepairCarFields: Repairs missing updatedAt (and optionally publishedAt) for a single car
 * 
 * This function repairs a specific car by carId. Useful for quick, deterministic fixes.
 * 
 * Safety: Does NOT change publish signals (status/publicationStatus/isPublished).
 * 
 * Auth: Admin only
 */
export async function adminDebugRepairCarFieldsHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugRepairCarFields = functions.https.onCall(adminDebugRepairCarFieldsHandler);

/**
 * adminDebugYardPublishedCounts: Counts published cars for a yard (sample-based)
 * 
 * Auth: Admin only
 */
export async function adminDebugYardPublishedCountsHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugYardPublishedCounts = functions.https.onCall(adminDebugYardPublishedCountsHandler);

/**
 * adminDebugScanMasterHealth: Scans MASTER cars for missing/null/type issues
 * 
 * Auth: Admin only
 */
export async function adminDebugScanMasterHealthHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugScanMasterHealth = functions.https.onCall(adminDebugScanMasterHealthHandler);

/**
 * adminDebugScanPublishSignals: Scans for misaligned publish signals
 * 
 * Auth: Admin only
 */
export async function adminDebugScanPublishSignalsHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugScanPublishSignals = functions.https.onCall(adminDebugScanPublishSignalsHandler);

/**
 * adminDebugCustomerHealthCheck: Health check for Customer Management tabs
 * 
 * Checks adminUsersIndex collection for a specific role and returns diagnostics.
 * 
 * Auth: Admin only
 */
export async function adminDebugCustomerHealthCheckHandler(data: any, context: functions.https.CallableContext) {
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
        } else if (role === 'AGENT') {
          // For AGENT, apply same filtering as fetchAgentsFromIndex: exclude admins and REJECTED/PENDING
          const filteredDocs = canonicalSnapshot.docs.filter((doc) => {
            const data = doc.data();
            // Exclude admins
            if (data.isAdmin === true) {
              return false;
            }
            // Backward compatible: allow APPROVED or null/undefined (legacy users)
            // Exclude only explicit REJECTED and PENDING status
            if (data.roleStatus === 'REJECTED' || data.roleStatus === 'PENDING') {
              return false;
            }
            return true;
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

    // For AGENT role, calculate filtering diagnostics BEFORE summary calculation
    const agentDiagnostics: any = {};
    if (role === 'AGENT') {
      // Count agents by status for diagnostics (only when using canonical fallback or when we need to explain)
      if (sourceUsed === 'canonicalFallback' || canonicalCount > 0) {
        try {
          const usersRef = db.collection('users');
          const agentQuery = usersRef.where('isAgent', '==', true).limit(limit);
          const agentSnapshot = await agentQuery.get();
          
          let indexCount = agentSnapshot.size;
          let approvedLikeCount = 0;
          let excludedByRoleStatusCount = 0;
          let excludedAdminCount = 0;
          const sampleExcludedIds: string[] = [];
          
          agentSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.isAdmin === true) {
              excludedAdminCount++;
              if (sampleExcludedIds.length < 10) {
                sampleExcludedIds.push(`${doc.id} (isAdmin=true)`);
              }
            } else if (data.roleStatus === 'REJECTED' || data.roleStatus === 'PENDING') {
              excludedByRoleStatusCount++;
              if (sampleExcludedIds.length < 10) {
                sampleExcludedIds.push(`${doc.id} (roleStatus=${data.roleStatus})`);
              }
            } else {
              approvedLikeCount++; // APPROVED or null/undefined (legacy)
            }
          });
          
          agentDiagnostics.indexCount = indexCount;
          agentDiagnostics.approvedLikeCount = approvedLikeCount;
          agentDiagnostics.excludedByRoleStatusCount = excludedByRoleStatusCount;
          agentDiagnostics.excludedAdminCount = excludedAdminCount;
          if (sampleExcludedIds.length > 0) {
            agentDiagnostics.sampleExcludedIds = sampleExcludedIds;
          }
        } catch (diagError) {
          // Don't fail health check if diagnostics fail
          console.warn('[adminDebugCustomerHealthCheck] Agent diagnostics error:', diagError);
        }
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
      // For AGENT role with diagnostics, update summary to explain exclusions
      if (role === 'AGENT' && Object.keys(agentDiagnostics).length > 0) {
        const eligibleCount = agentDiagnostics.approvedLikeCount || canonicalCount;
        const excludedTotal = (agentDiagnostics.excludedByRoleStatusCount || 0) + (agentDiagnostics.excludedAdminCount || 0);
        if (excludedTotal > 0) {
          const excludedDetails: string[] = [];
          if (agentDiagnostics.excludedByRoleStatusCount > 0) {
            excludedDetails.push(`${agentDiagnostics.excludedByRoleStatusCount} by roleStatus`);
          }
          if (agentDiagnostics.excludedAdminCount > 0) {
            excludedDetails.push(`${agentDiagnostics.excludedAdminCount} admins`);
          }
          summary = `${agentDiagnostics.indexCount} in index (${eligibleCount} eligible for Agents tab, ${excludedTotal} excluded: ${excludedDetails.join(', ')})`;
        } else {
          summary = `${canonicalCount} ${role.toLowerCase()} found (canonical fallback; adminUsersIndex empty)`;
        }
        level = sourceUsed === 'canonicalFallback' ? "WARN" : "OK";
        nextAction = sourceUsed === 'canonicalFallback' 
          ? "adminUsersIndex is empty. Click 'Rebuild Customers Index' to populate it."
          : "No action needed";
      } else {
        // Standard summary for other roles
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
      ...(Object.keys(agentDiagnostics).length > 0 && { agentFiltering: agentDiagnostics }),
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
}

export const adminDebugCustomerHealthCheck = functions.https.onCall(adminDebugCustomerHealthCheckHandler);

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
export async function adminDebugRebuildAdminUsersIndexHandler(data: any, context: functions.https.CallableContext) {
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
}

export const adminDebugRebuildAdminUsersIndex = functions.https.onCall(adminDebugRebuildAdminUsersIndexHandler);

/**
 * Admin-only: Search yards by name (optimized with prefix search and proper indexing)
 * 
 * Performance optimizations:
 * - Uses prefix search on displayName field (>= and <= with \uf8ff)
 * - Limits results aggressively (default 10, max 50)
 * - Requires composite index on yards collection: displayName (ASCENDING)
 */
export const adminDebugSearchYards = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `search_yards_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startTime = Date.now();

  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only", { correlationId });
    }

    const { q, limit: limitParam = 10 } = data;

    if (!q || typeof q !== 'string' || !q.trim()) {
      return { ok: true, results: [] };
    }

    const query = q.trim();
    const limit = Math.min(Math.max(1, parseInt(String(limitParam)) || 10), 50); // Clamp between 1-50

    console.log(`[adminDebugSearchYards] Starting search (correlationId: ${correlationId}, query: "${query}", limit: ${limit})`);

    // Strategy 1: Try exact UID match first (fastest path)
    if (query.length > 20 && /^[a-zA-Z0-9_-]+$/.test(query)) {
      try {
        const yardDoc = await db.collection('yards').doc(query).get();
        if (yardDoc.exists) {
          const yardData = yardDoc.data()!;
          const elapsed = Date.now() - startTime;
          console.log(`[adminDebugSearchYards] Found by UID (correlationId: ${correlationId}, elapsed: ${elapsed}ms)`);
          return {
            ok: true,
            results: [{
              yardUid: yardDoc.id,
              yardName: yardData.displayName || yardDoc.id,
              city: yardData.city || undefined,
            }],
          };
        }
      } catch (uidError) {
        // Continue to name search if UID lookup fails
        console.warn(`[adminDebugSearchYards] UID lookup failed, continuing with name search:`, uidError);
      }
    }

    // Strategy 2: Prefix search on displayName (requires index on displayName)
    // Normalize query to lowercase for consistent prefix matching
    const searchLower = query.toLowerCase();
    
    let queryRef: admin.firestore.Query = db.collection('yards')
      .where('displayName', '>=', searchLower)
      .where('displayName', '<=', searchLower + '\uf8ff')
      .limit(limit);

    const snapshot = await queryRef.get();
    const results = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        yardUid: doc.id,
        yardName: data.displayName || doc.id,
        city: data.city || undefined,
      };
    });

    const elapsed = Date.now() - startTime;
    console.log(`[adminDebugSearchYards] Completed (correlationId: ${correlationId}, results: ${results.length}, elapsed: ${elapsed}ms)`);

    return {
      ok: true,
      results,
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[adminDebugSearchYards] Error (correlationId: ${correlationId}, elapsed: ${elapsed}ms):`, error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Check if error is due to missing index
    if (error.message && error.message.includes('index')) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Firestore index required. Please create a composite index on 'yards' collection with field 'displayName' (ASCENDING). Error: ${error.message}`,
        { correlationId, originalError: error.message }
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to search yards: ${error.message}`,
      { correlationId, originalError: error.message }
    );
  }
});

/**
 * Admin-only: Search cars by plate number or carId (optimized with proper indexing)
 * 
 * Performance optimizations:
 * - Exact match on carId (document ID) - fastest path
 * - Prefix search on licensePlatePartial in publicCars (if index exists)
 * - If yardUid provided, searches in users/{yardUid}/carSales subcollection
 * - Limits results aggressively (default 10, max 50)
 * - Requires composite index on publicCars: licensePlatePartial (ASCENDING) if using plate search
 */
export const adminDebugSearchCars = functions.https.onCall(async (data, context) => {
  const correlationId = data?.correlationId || `search_cars_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startTime = Date.now();

  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only", { correlationId });
    }

    const { q, yardUid, limit: limitParam = 10 } = data;

    if (!q || typeof q !== 'string' || !q.trim()) {
      return { ok: true, results: [] };
    }

    const query = q.trim();
    const limit = Math.min(Math.max(1, parseInt(String(limitParam)) || 10), 50); // Clamp between 1-50

    console.log(`[adminDebugSearchCars] Starting search (correlationId: ${correlationId}, query: "${query}", yardUid: ${yardUid || 'none'}, limit: ${limit})`);

    // Strategy 1: Try exact carId match first (fastest path)
    // carId format: typically long alphanumeric strings (Firestore doc IDs)
    if (query.length > 15 && /^[a-zA-Z0-9_-]+$/.test(query) && !query.includes(' ')) {
      try {
        // If yardUid provided, check in yard's carSales subcollection first
        if (yardUid && typeof yardUid === 'string') {
          const masterCarDoc = await db.doc(`users/${yardUid}/carSales/${query}`).get();
          if (masterCarDoc.exists) {
            const carData = masterCarDoc.data()!;
            const elapsed = Date.now() - startTime;
            console.log(`[adminDebugSearchCars] Found by carId in yard (correlationId: ${correlationId}, elapsed: ${elapsed}ms)`);
            return {
              ok: true,
              results: [{
                carId: masterCarDoc.id,
                yardUid: yardUid,
                plateNumber: carData.licensePlatePartial || undefined,
                make: carData.brand || undefined,
                model: carData.model || undefined,
                year: typeof carData.year === 'number' ? carData.year : undefined,
                title: carData.brand && carData.model ? `${carData.brand} ${carData.model}` : undefined,
              }],
            };
          }
        }

        // Also check publicCars collection
        const publicCarDoc = await db.collection('publicCars').doc(query).get();
        if (publicCarDoc.exists) {
          const carData = publicCarDoc.data()!;
          const elapsed = Date.now() - startTime;
          console.log(`[adminDebugSearchCars] Found by carId in publicCars (correlationId: ${correlationId}, elapsed: ${elapsed}ms)`);
          return {
            ok: true,
            results: [{
              carId: publicCarDoc.id,
              yardUid: carData.yardUid || carData.ownerUid || carData.userId || '',
              plateNumber: carData.licensePlatePartial || undefined,
              make: carData.brand || undefined,
              model: carData.model || undefined,
              year: typeof carData.year === 'number' ? carData.year : undefined,
              title: carData.brand && carData.model ? `${carData.brand} ${carData.model}` : undefined,
            }],
          };
        }
      } catch (carIdError) {
        // Continue to plate search if carId lookup fails
        console.warn(`[adminDebugSearchCars] carId lookup failed, continuing with plate search:`, carIdError);
      }
    }

    // Strategy 2: Search by license plate (prefix search on licensePlatePartial)
    const searchLower = query.toLowerCase().replace(/\s+/g, ''); // Normalize: lowercase, remove spaces

    const results: Array<{
      carId: string;
      yardUid: string;
      plateNumber?: string;
      make?: string;
      model?: string;
      year?: number;
      title?: string;
    }> = [];

    if (yardUid && typeof yardUid === 'string') {
      // Search within yard's carSales subcollection
      // Note: This requires a query on licensePlatePartial - if not indexed, will fail gracefully
      try {
        let queryRef: admin.firestore.Query = db.collection(`users/${yardUid}/carSales`)
          .where('licensePlatePartial', '>=', searchLower)
          .where('licensePlatePartial', '<=', searchLower + '\uf8ff')
          .limit(limit);

        const snapshot = await queryRef.get();
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          results.push({
            carId: doc.id,
            yardUid: yardUid,
            plateNumber: data.licensePlatePartial || undefined,
            make: data.brand || undefined,
            model: data.model || undefined,
            year: typeof data.year === 'number' ? data.year : undefined,
            title: data.brand && data.model ? `${data.brand} ${data.model}` : undefined,
          });
        });
      } catch (yardQueryError) {
        // If index missing, log but don't fail - will try publicCars search
        console.warn(`[adminDebugSearchCars] Yard subcollection query failed (may need index):`, yardQueryError);
      }
    } else {
      // Search publicCars collection (requires index on licensePlatePartial)
      try {
        let queryRef: admin.firestore.Query = db.collection('publicCars')
          .where('licensePlatePartial', '>=', searchLower)
          .where('licensePlatePartial', '<=', searchLower + '\uf8ff')
          .limit(limit);

        const snapshot = await queryRef.get();
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          results.push({
            carId: doc.id,
            yardUid: data.yardUid || data.ownerUid || data.userId || '',
            plateNumber: data.licensePlatePartial || undefined,
            make: data.brand || undefined,
            model: data.model || undefined,
            year: typeof data.year === 'number' ? data.year : undefined,
            title: data.brand && data.model ? `${data.brand} ${data.model}` : undefined,
          });
        });
      } catch (publicQueryError) {
        // Check if error is due to missing index
        if (publicQueryError instanceof Error && publicQueryError.message.includes('index')) {
          const elapsed = Date.now() - startTime;
          console.error(`[adminDebugSearchCars] Index missing (correlationId: ${correlationId}, elapsed: ${elapsed}ms):`, publicQueryError);
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Firestore index required. Please create a composite index on 'publicCars' collection with field 'licensePlatePartial' (ASCENDING). Error: ${publicQueryError.message}`,
            { correlationId, originalError: publicQueryError.message }
          );
        }
        throw publicQueryError;
      }
    }

    // Deduplicate by carId (in case same car appears in both yard and publicCars)
    const uniqueResults = Array.from(
      new Map(results.map(r => [r.carId, r])).values()
    ).slice(0, limit);

    const elapsed = Date.now() - startTime;
    console.log(`[adminDebugSearchCars] Completed (correlationId: ${correlationId}, results: ${uniqueResults.length}, elapsed: ${elapsed}ms)`);

    return {
      ok: true,
      results: uniqueResults,
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[adminDebugSearchCars] Error (correlationId: ${correlationId}, elapsed: ${elapsed}ms):`, error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to search cars: ${error.message}`,
      { correlationId, originalError: error.message }
    );
  }
});

/**
 * Admin-only: List all yards (load once for local filtering)
 * 
 * Returns minimal fields for fast loading:
 * - yardUid, name (displayName), phones (array)
 * - Max 5000 results
 * 
 * Used by Debug UI to load once, then filter locally (no per-keystroke calls).
 */
export async function adminDebugListYardsHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `list_yards_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startTime = Date.now();

  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only", { correlationId });
    }

    const maxLimit = 5000;
    console.log(`[adminDebugListYards] Starting list (correlationId: ${correlationId}, limit: ${maxLimit})`);

    type YardLite = { yardUid: string; name?: string | null; phones?: string[] | null };

    const shapeDoc = (doc: admin.firestore.DocumentSnapshot): YardLite => {
      const data = doc.data();
      if (!data) {
        return { yardUid: doc.id, name: 'מגרש ללא שם', phones: undefined };
      }
      const yardName = data.yardName || data.displayName || data.fullName || data.businessName || data.companyName || data.name || data.email || 'מגרש ללא שם';
      const phones: string[] = [];
      const pushPhone = (p?: any) => {
        if (!p) return;
        const s = String(p).trim();
        if (!s) return;
        phones.push(s);
      };
      if (Array.isArray(data.phones)) {
        data.phones.forEach(pushPhone);
      }
      pushPhone(data.phone);
      pushPhone(data.contactPhone);
      pushPhone(data.whatsappPhone);
      pushPhone(data.whatsAppPhone);
      const dedupedPhones = Array.from(new Set(phones));
      return {
        yardUid: doc.id,
        name: yardName,
        phones: dedupedPhones.length > 0 ? dedupedPhones : undefined,
      };
    };

    const mergeInto = (map: Map<string, YardLite>, doc: admin.firestore.DocumentSnapshot) => {
      const entry = shapeDoc(doc);
      const existing = map.get(doc.id);
      if (!existing) {
        map.set(doc.id, entry);
        return;
      }
      // Prefer non-empty name/phones
      const name = (entry.name && entry.name !== 'מגרש ללא שם') ? entry.name : existing.name;
      const phones = (entry.phones && entry.phones.length > 0) ? entry.phones : existing.phones;
      map.set(doc.id, { yardUid: doc.id, name: name || existing.name, phones });
    };

    const usersRef = db.collection('users');
    const merged = new Map<string, YardLite>();
    let queryErrors = 0;

    const runQuery = async (label: string, query: admin.firestore.Query): Promise<number> => {
      try {
        const snapshot = await query.limit(maxLimit).get();
        snapshot.docs.forEach(doc => mergeInto(merged, doc));
        console.log(`[adminDebugListYards] ${label}: ${snapshot.size} docs (correlationId: ${correlationId})`);
        return snapshot.size;
      } catch (err: any) {
        queryErrors++;
        console.warn(`[adminDebugListYards] ${label} failed:`, err?.message || err, `(correlationId: ${correlationId})`);
        return 0;
      }
    };

    await runQuery('isYard==true', usersRef.where('isYard', '==', true));
    await runQuery("role=='YARD'", usersRef.where('role', '==', 'YARD'));
    await runQuery("primaryRole=='YARD'", usersRef.where('primaryRole', '==', 'YARD'));
    await runQuery("roles array-contains 'YARD'", usersRef.where('roles', 'array-contains', 'YARD'));
    // Include legacy yards collection (merge by doc.id / UID)
    await runQuery('yards collection', db.collection('yards'));

    if (queryErrors > 0) {
      console.warn(`[adminDebugListYards] WARNING: ${queryErrors} query(ies) failed; returning best-effort merge (correlationId: ${correlationId})`);
    }

    const results = Array.from(merged.values()).sort((a, b) => {
      const na = (a.name || '').localeCompare(b.name || '', 'he');
      return na !== 0 ? na : (a.yardUid || '').localeCompare(b.yardUid || '');
    });

    const elapsed = Date.now() - startTime;
    console.log(`[adminDebugListYards] Completed (correlationId: ${correlationId}, results: ${results.length}, elapsed: ${elapsed}ms)`);

    return {
      ok: true,
      results,
      _debug: { mergedCount: results.length },
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[adminDebugListYards] Error (correlationId: ${correlationId}, elapsed: ${elapsed}ms):`, error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to list yards: ${error.message}`,
      { correlationId, originalError: error.message }
    );
  }
}

export const adminDebugListYards = functions.https.onCall(adminDebugListYardsHandler);

/**
 * Admin-only: List all cars for a yard (load once per yard for local filtering)
 * 
 * Returns minimal fields for fast loading:
 * - carId, plateNumber, make, model, year, title
 * - Max 10000 results
 * 
 * Used by Debug UI to load once per yard, then filter locally (no per-keystroke calls).
 */
export async function adminDebugListYardCarsHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `list_yard_cars_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startTime = Date.now();

  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Admin only", { correlationId });
    }

    const { yardUid } = data;

    if (!yardUid || typeof yardUid !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'yardUid (string) is required',
        { correlationId }
      );
    }

    const maxLimit = 10000;
    console.log(`[adminDebugListYardCars] Starting list (correlationId: ${correlationId}, yardUid: ${yardUid}, limit: ${maxLimit})`);

    // Query all cars in yard's carSales subcollection
    const queryRef: admin.firestore.Query = db.collection(`users/${yardUid}/carSales`)
      .limit(maxLimit);

    const snapshot = await queryRef.get();
    const results = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        carId: doc.id,
        plateNumber: data.licensePlatePartial || undefined,
        make: data.brand || undefined,
        model: data.model || undefined,
        year: typeof data.year === 'number' ? data.year : undefined,
        title: data.brand && data.model ? `${data.brand} ${data.model}` : undefined,
      };
    });

    const elapsed = Date.now() - startTime;
    console.log(`[adminDebugListYardCars] Completed (correlationId: ${correlationId}, results: ${results.length}, elapsed: ${elapsed}ms)`);

    return {
      ok: true,
      results,
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[adminDebugListYardCars] Error (correlationId: ${correlationId}, elapsed: ${elapsed}ms):`, error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to list yard cars: ${error.message}`,
      { correlationId, originalError: error.message }
    );
  }
}

export const adminDebugListYardCars = functions.https.onCall(adminDebugListYardCarsHandler);

/**
 * adminDebugSellerExposureDiagnosis: Diagnose why yard contact/logo/address are visible only in ADMIN
 * 
 * Returns comprehensive JSON diagnosis explaining:
 * - MASTER publish state
 * - PUBLIC doc existence + seller/contact fields
 * - Admin exposure flags (with defaults)
 * - Seller snapshot from yards/users
 * - Computed effective visibility decision + reasons
 * 
 * Auth: Admin only
 */
export async function adminDebugSellerExposureDiagnosisHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    console.error(`[adminDebugSellerExposureDiagnosis] Unauthenticated, correlationId: ${correlationId}`);
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated",
      { correlationId }
    );
  }

  const callerUid = context.auth.uid;
  
  try {
    console.info("[adminDebugSellerExposureDiagnosis] start", { 
      correlationId, 
      carId: data?.carId, 
      yardUid: data?.yardUid, 
      uid: callerUid 
    });
    
    const callerIsAdmin = await isAdmin(callerUid);
    
    if (!callerIsAdmin) {
      console.error(`[adminDebugSellerExposureDiagnosis] Permission denied for ${callerUid}, correlationId: ${correlationId}`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only admins can access debug functions",
        { correlationId }
      );
    }

    const { carId, yardUid } = data;
    
    if (!carId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "carId is required",
        { correlationId }
      );
    }

    // Step 1: Resolve yardUid if not provided
    let effectiveYardUid = yardUid ? String(yardUid).trim() : null;
    
    // Step 2: Read MASTER if yardUid provided
    let masterData: any = null;
    let masterExists = false;
    let masterPublished = false;
    let masterHidden = false;
    
    if (effectiveYardUid) {
      try {
        const masterCar = await getYardCarMaster(effectiveYardUid, carId);
        if (masterCar) {
          masterExists = true;
          masterData = masterCar;
          // Use isMasterCarPublished helper logic
          const statusStr = String(masterCar.status ?? '').trim().toLowerCase();
          const pubStr = String((masterCar as any).publicationStatus ?? '').trim().toUpperCase();
          const isPublishedFlag = (masterCar as any).isPublished === true;
          const saleStatus = String((masterCar as any).saleStatus ?? '').trim().toUpperCase();
          
          masterHidden = saleStatus === 'SOLD' || 
                        statusStr === 'archived' || statusStr === 'draft' || statusStr === 'hidden' ||
                        pubStr === 'DRAFT' || pubStr === 'HIDDEN';
          
          masterPublished = !masterHidden && (
            statusStr === 'published' || statusStr === 'publish' ||
            pubStr === 'PUBLISHED' || pubStr === 'PUBLIC' || pubStr === 'VISIBLE' ||
            isPublishedFlag
          );
        }
      } catch (masterError: any) {
        console.warn("[adminDebugSellerExposureDiagnosis] Could not read MASTER", { 
          correlationId, 
          yardUid: effectiveYardUid, 
          carId, 
          error: masterError?.message 
        });
      }
    }
    
    // Step 3: Read PUBLIC
    const publicRef = db.collection("publicCars").doc(carId);
    const publicSnap = await publicRef.get();
    const publicExists = publicSnap.exists;
    const publicData = publicExists ? (publicSnap.data() || {}) : null;
    
    // Step 4: If yardUid not provided, try to infer from PUBLIC
    if (!effectiveYardUid && publicData) {
      effectiveYardUid = publicData.yardUid || publicData.ownerUid || publicData.agentUid || null;
      if (effectiveYardUid && !masterExists) {
        // Try to read MASTER with inferred yardUid
        try {
          const masterCar = await getYardCarMaster(effectiveYardUid, carId);
          if (masterCar) {
            masterExists = true;
            masterData = masterCar;
            const statusStr = String(masterCar.status ?? '').trim().toLowerCase();
            const pubStr = String((masterCar as any).publicationStatus ?? '').trim().toUpperCase();
            const isPublishedFlag = (masterCar as any).isPublished === true;
            const saleStatus = String((masterCar as any).saleStatus ?? '').trim().toUpperCase();
            
            masterHidden = saleStatus === 'SOLD' || 
                          statusStr === 'archived' || statusStr === 'draft' || statusStr === 'hidden' ||
                          pubStr === 'DRAFT' || pubStr === 'HIDDEN';
            
            masterPublished = !masterHidden && (
              statusStr === 'published' || statusStr === 'publish' ||
              pubStr === 'PUBLISHED' || pubStr === 'PUBLIC' || pubStr === 'VISIBLE' ||
              isPublishedFlag
            );
          }
        } catch (masterError: any) {
          console.warn("[adminDebugSellerExposureDiagnosis] Could not read MASTER with inferred yardUid", { 
            correlationId, 
            yardUid: effectiveYardUid, 
            carId, 
            error: masterError?.message 
          });
        }
      }
    }
    
    // Step 5: Determine seller identity
    let sellerUid: string | null = null;
    let sellerType: 'YARD' | 'AGENT' | 'PRIVATE' = 'PRIVATE';
    let source: 'MASTER' | 'PUBLIC' | 'NONE' = 'NONE';
    
    if (masterExists && masterData) {
      // Prefer MASTER
      source = 'MASTER';
      const masterSellerType = (masterData as any).sellerType;
      if (masterSellerType && ['YARD', 'AGENT', 'PRIVATE'].includes(masterSellerType)) {
        sellerType = masterSellerType;
      } else if (masterData.yardUid) {
        sellerType = 'YARD';
      } else if ((masterData as any).agentUid) {
        sellerType = 'AGENT';
      }
      sellerUid = masterData.yardUid || (masterData as any).agentUid || null;
    } else if (publicData) {
      // Fallback to PUBLIC
      source = 'PUBLIC';
      const publicSellerType = publicData.sellerType;
      if (publicSellerType && ['YARD', 'AGENT', 'PRIVATE'].includes(publicSellerType)) {
        sellerType = publicSellerType;
      } else if (publicData.yardUid) {
        sellerType = 'YARD';
      } else if (publicData.agentUid) {
        sellerType = 'AGENT';
      }
      sellerUid = publicData.yardUid || publicData.agentUid || null;
    }
    
    // Step 6: Load admin exposure and seller snapshot
    const adminExposure = sellerUid && (sellerType === 'YARD' || sellerType === 'AGENT')
      ? await loadAdminSellerExposure(sellerUid)
      : null;
    
    const sellerSnapshot = sellerUid
      ? await loadPublicSellerProfile(sellerUid, sellerType)
      : null;
    
    // Step 7: Build diagnosis object
    const diagnosis: any = {
      ok: false,
      title: "Seller Exposure Diagnosis",
      correlationId,
      input: {
        carId,
        yardUid: yardUid || null,
      },
      resolved: {
        sellerUid,
        sellerType,
        source,
      },
      master: {
        exists: masterExists,
        publishedIntent: masterExists ? masterPublished : null,
        hidden: masterExists ? masterHidden : null,
        yardUid: masterData?.yardUid || null,
        fields: masterExists ? {
          status: masterData?.status || null,
          publicationStatus: (masterData as any)?.publicationStatus || null,
          isPublished: (masterData as any)?.isPublished || null,
          saleStatus: (masterData as any)?.saleStatus || null,
          yardUid: masterData?.yardUid || null,
          agentUid: (masterData as any)?.agentUid || null,
          sellerType: (masterData as any)?.sellerType || null,
        } : null,
      },
      public: {
        exists: publicExists,
        isPublished: publicData?.isPublished === true,
        fields: publicExists ? {
          yardDisplayName: publicData?.yardDisplayName || null,
          sellerDisplayName: publicData?.sellerDisplayName || null,
          yardPhone: publicData?.yardPhone || null,
          sellerPhone: publicData?.sellerPhone || null,
          yardWhatsappPhone: publicData?.yardWhatsappPhone || null,
          sellerWhatsappPhone: publicData?.sellerWhatsappPhone || null,
          yardLogoUrl: publicData?.yardLogoUrl || null,
          sellerLogoUrl: publicData?.sellerLogoUrl || null,
          sellerCity: publicData?.sellerCity || null,
          sellerAddress: publicData?.sellerAddress || null,
          showSellerNameInBadge: publicData?.showSellerNameInBadge !== undefined ? publicData.showSellerNameInBadge : undefined,
          showSellerLogo: publicData?.showSellerLogo !== undefined ? publicData.showSellerLogo : undefined,
          showSellerPhone: publicData?.showSellerPhone !== undefined ? publicData.showSellerPhone : undefined,
          showSellerWhatsapp: publicData?.showSellerWhatsapp !== undefined ? publicData.showSellerWhatsapp : undefined,
        } : null,
      },
      adminExposure: adminExposure ? {
        raw: adminExposure,
        effective: {
          showNameInBadge: adminExposure.showNameInBadge !== false,
          showLogo: adminExposure.showLogo !== false,
          showPhone: adminExposure.showPhone !== false,
          showWhatsapp: adminExposure.showWhatsapp !== false,
          showCity: adminExposure.showCity !== false,
          showAddress: adminExposure.showAddress !== false,
        },
      } : null,
      sellerSnapshot: sellerSnapshot ? {
        sellerName: sellerSnapshot.sellerName,
        sellerPhone: sellerSnapshot.sellerPhone,
        sellerWhatsappPhone: sellerSnapshot.sellerWhatsappPhone,
        sellerLogoUrl: sellerSnapshot.sellerLogoUrl,
        sellerCity: sellerSnapshot.sellerCity,
        sellerAddress: sellerSnapshot.sellerAddress,
        showSellerNameInBadge: sellerSnapshot.showSellerNameInBadge,
        source: sellerSnapshot.source,
      } : null,
      computed: {
        willWrite: {
          name: false,
          phone: false,
          whatsapp: false,
          logo: false,
          city: false,
          address: false,
        },
        reasons: [] as string[],
      },
    };
    
    // Step 8: Compute willWrite and reasons
    const reasons: string[] = [];
    
    if (!sellerSnapshot) {
      reasons.push("sellerSnapshot=null (seller profile not found in yards/users)");
    } else {
      // name
      if (adminExposure?.showNameInBadge !== false && sellerSnapshot.sellerName) {
        diagnosis.computed.willWrite.name = true;
      } else {
        if (!sellerSnapshot.sellerName) {
          reasons.push("name: sellerSnapshot.sellerName missing");
        } else if (adminExposure?.showNameInBadge === false) {
          reasons.push("name: adminExposure.showNameInBadge=false");
        }
      }
      
      // phone
      if (adminExposure?.showPhone !== false && sellerSnapshot.sellerPhone) {
        diagnosis.computed.willWrite.phone = true;
      } else {
        if (!sellerSnapshot.sellerPhone) {
          reasons.push("phone: sellerSnapshot.sellerPhone missing");
        } else if (adminExposure?.showPhone === false) {
          reasons.push("phone: adminExposure.showPhone=false");
        }
      }
      
      // whatsapp
      if (adminExposure?.showWhatsapp !== false && sellerSnapshot.sellerWhatsappPhone) {
        diagnosis.computed.willWrite.whatsapp = true;
      } else {
        if (!sellerSnapshot.sellerWhatsappPhone) {
          reasons.push("whatsapp: sellerSnapshot.sellerWhatsappPhone missing");
        } else if (adminExposure?.showWhatsapp === false) {
          reasons.push("whatsapp: adminExposure.showWhatsapp=false");
        }
      }
      
      // logo
      if (adminExposure?.showLogo !== false && sellerSnapshot.sellerLogoUrl) {
        diagnosis.computed.willWrite.logo = true;
      } else {
        if (!sellerSnapshot.sellerLogoUrl) {
          reasons.push("logo: sellerSnapshot.sellerLogoUrl missing");
        } else if (adminExposure?.showLogo === false) {
          reasons.push("logo: adminExposure.showLogo=false");
        }
      }
      
      // city
      if (adminExposure?.showCity !== false && sellerSnapshot.sellerCity) {
        diagnosis.computed.willWrite.city = true;
      } else {
        if (!sellerSnapshot.sellerCity) {
          reasons.push("city: sellerSnapshot.sellerCity missing");
        } else if (adminExposure?.showCity === false) {
          reasons.push("city: adminExposure.showCity=false");
        }
      }
      
      // address
      if (adminExposure?.showAddress !== false && sellerSnapshot.sellerAddress) {
        diagnosis.computed.willWrite.address = true;
      } else {
        if (!sellerSnapshot.sellerAddress) {
          reasons.push("address: sellerSnapshot.sellerAddress missing");
        } else if (adminExposure?.showAddress === false) {
          reasons.push("address: adminExposure.showAddress=false");
        }
      }
    }
    
    diagnosis.computed.reasons = reasons;
    
    // Step 9: Determine ok status
    const hasAnyField = diagnosis.computed.willWrite.name || 
                       diagnosis.computed.willWrite.phone || 
                       diagnosis.computed.willWrite.whatsapp || 
                       diagnosis.computed.willWrite.logo || 
                       diagnosis.computed.willWrite.city || 
                       diagnosis.computed.willWrite.address;
    
    if (publicExists && (hasAnyField || (reasons.length > 0 && reasons.every(r => r.includes('adminExposure'))))) {
      diagnosis.ok = true;
    } else if (!publicExists) {
      diagnosis.ok = false;
      reasons.unshift("publicCars document does not exist");
    } else {
      diagnosis.ok = false;
    }
    
    // Add summary
    const summaryParts: string[] = [];
    if (!publicExists) {
      summaryParts.push("PUBLIC doc missing");
    } else if (!sellerSnapshot) {
      summaryParts.push("Seller snapshot not found");
    } else if (!hasAnyField) {
      summaryParts.push("No seller fields will be written");
    } else {
      summaryParts.push("Some seller fields available");
    }
    diagnosis.summary = summaryParts.join(", ");
    
    console.info(`[adminDebugSellerExposureDiagnosis] Success (correlationId: ${correlationId}):`, {
      carId,
      sellerUid,
      sellerType,
      ok: diagnosis.ok,
    });

    return {
      ok: diagnosis.ok,
      level: diagnosis.ok ? "OK" : "WARN",
      title: diagnosis.title,
      summary: diagnosis.summary,
      details: diagnosis,
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    console.error(`[adminDebugSellerExposureDiagnosis] Unexpected error for ${callerUid}, correlationId: ${correlationId}:`, {
      error: error.message,
      stack: error.stack,
      correlationId,
      carId: data?.carId,
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugSellerExposureDiagnosis failed",
      {
        correlationId,
        reason: error?.message || String(error),
        hint: "Check Firestore paths, seller UID resolution, or helper function calls",
      }
    );
  }
}

export const adminDebugSellerExposureDiagnosis = functions.https.onCall(adminDebugSellerExposureDiagnosisHandler);

/**
 * adminDebugPublicCarExists: Check if publicCars/{carId} exists
 * 
 * Auth: Admin only
 */
export async function adminDebugPublicCarExistsHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  const carId = data?.carId;

  if (!carId || typeof carId !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "carId is required", { correlationId });
  }

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can access debug functions", { correlationId });
    }

    const publicRef = db.collection("publicCars").doc(carId);
    const publicSnap = await publicRef.get();

    const exists = publicSnap.exists;
    const result: any = {
      exists,
      carId,
    };

    if (exists) {
      const data = publicSnap.data() || {};
      if (data.createdAt) {
        result.createdAt = safeToMillis(data.createdAt);
      }
      if (data.updatedAt) {
        result.updatedAt = safeToMillis(data.updatedAt);
      }
    } else {
      result.reason = "publicCars doc does not exist";
    }

    return {
      ok: true,
      level: exists ? "OK" : "WARN",
      title: "Public Car Existence Check",
      summary: exists ? "PUBLIC doc exists" : "PUBLIC doc does not exist",
      details: result,
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "adminDebugPublicCarExists failed", { correlationId, error: error.message });
  }
}

export const adminDebugPublicCarExists = functions.https.onCall(adminDebugPublicCarExistsHandler);

/**
 * adminDebugWhyCarNotPublic: Explain why a car is not public
 * 
 * Auth: Admin only
 */
export async function adminDebugWhyCarNotPublicHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  const carId = data?.carId;
  const yardUid = data?.yardUid;

  if (!carId || typeof carId !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "carId is required", { correlationId });
  }

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can access debug functions", { correlationId });
    }

    // Try to get yardUid from parameter or infer from car
    let effectiveYardUid = yardUid;
    if (!effectiveYardUid) {
      // Try to get from publicCars first
      const publicRef = db.collection("publicCars").doc(carId);
      const publicSnap = await publicRef.get();
      if (publicSnap.exists) {
        const publicData = publicSnap.data() || {};
        effectiveYardUid = publicData.yardUid || null;
      }
    }

    // Read MASTER car
    let masterData: any = null;
    let masterExists = false;
    if (effectiveYardUid) {
      try {
        const masterRef = db.collection("users").doc(effectiveYardUid).collection("carSales").doc(carId);
        const masterSnap = await masterRef.get();
        if (masterSnap.exists) {
          masterExists = true;
          masterData = masterSnap.data() || {};
        }
      } catch (masterError: any) {
        console.warn(`[adminDebugWhyCarNotPublic] Could not read MASTER: ${masterError?.message}`);
      }
    }

    const blockingReasons: string[] = [];
    let canBePublic = false;

    if (!masterExists) {
      blockingReasons.push("MASTER car document does not exist");
    } else {
      const publishState = computeMasterPublishState(masterData);
      
      if (publishState.effectiveHidden) {
        blockingReasons.push("Car is marked as hidden/archived");
      }
      
      if (!publishState.effectivePublished) {
        blockingReasons.push("Car is not marked as published (status/publicationStatus/isPublished)");
      }
      
      if (masterData.saleStatus === 'SOLD') {
        blockingReasons.push("Car is marked as SOLD");
      }

      canBePublic = publishState.effectivePublished && !publishState.effectiveHidden && masterData.saleStatus !== 'SOLD';
    }

    const result: any = {
      canBePublic,
      blockingReasons,
      masterState: masterExists ? {
        status: masterData.status || null,
        publicationStatus: masterData.publicationStatus || null,
        hidden: computeMasterPublishState(masterData).effectiveHidden,
        publishedIntent: computeMasterPublishState(masterData).effectivePublished,
      } : null,
      carId,
      yardUid: effectiveYardUid || null,
    };

    return {
      ok: true,
      level: canBePublic ? "OK" : "WARN",
      title: "Why Car Is Not Public",
      summary: canBePublic ? "Car can be public" : `Blocked: ${blockingReasons.join(", ")}`,
      details: result,
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "adminDebugWhyCarNotPublic failed", { correlationId, error: error.message });
  }
}

export const adminDebugWhyCarNotPublic = functions.https.onCall(adminDebugWhyCarNotPublicHandler);

/**
 * adminDebugPublicProjectionPreview: Preview what would be projected (dry run)
 * 
 * Auth: Admin only
 */
export async function adminDebugPublicProjectionPreviewHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  const carId = data?.carId;
  const yardUid = data?.yardUid;

  if (!carId || typeof carId !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "carId is required", { correlationId });
  }

  if (!yardUid || typeof yardUid !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "yardUid is required", { correlationId });
  }

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can access debug functions", { correlationId });
    }

    // Read MASTER car
    const masterCar = await getYardCarMaster(yardUid, carId);
    if (!masterCar) {
      return {
        ok: false,
        level: "FAIL",
        title: "Public Projection Preview",
        summary: "MASTER car not found",
        details: {
          wouldCreatePublicDoc: false,
          projectedFields: null,
          carId,
          yardUid,
        },
        correlationId,
        ts: new Date().toISOString(),
      };
    }

    // Check if would be published
    const isPublished = isMasterCarPublished(masterCar);
    
    // Derive sellerType
    let sellerType: 'YARD' | 'AGENT' | 'PRIVATE' = 'PRIVATE';
    const masterSellerType = (masterCar as any).sellerType;
    if (masterSellerType && ['YARD', 'AGENT', 'PRIVATE'].includes(masterSellerType)) {
      sellerType = masterSellerType;
    } else if (masterCar.yardUid) {
      sellerType = 'YARD';
    } else if ((masterCar as any).agentUid) {
      sellerType = 'AGENT';
    }

    // Load seller snapshot (dry run - no writes)
    const sellerUid = masterCar.yardUid || (masterCar as any).agentUid || null;
    const sellerSnapshot = sellerUid ? await loadPublicSellerProfile(sellerUid, sellerType) : null;
    
    // Load admin exposure
    const adminExposure = (sellerUid && (sellerType === 'YARD' || sellerType === 'AGENT')) 
      ? await loadAdminSellerExposure(sellerUid)
      : null;

    // Compute projected fields (same logic as upsertPublicCarFromMaster but no writes)
    const projectedFields: any = {
      sellerName: null,
      sellerPhone: null,
      sellerWhatsapp: null,
      sellerLogoUrl: null,
      sellerCity: null,
      sellerAddress: null,
    };

    if (sellerSnapshot) {
      // Apply admin exposure flags
      const showName = adminExposure?.showNameInBadge !== false;
      const showPhone = adminExposure?.showPhone !== false;
      const showWhatsapp = adminExposure?.showWhatsapp !== false;
      const showLogo = adminExposure?.showLogo !== false;
      const showCity = adminExposure?.showCity !== false;
      const showAddress = adminExposure?.showAddress === true; // Default false

      projectedFields.sellerName = showName ? sellerSnapshot.sellerName : null;
      projectedFields.sellerPhone = showPhone ? sellerSnapshot.sellerPhone : null;
      projectedFields.sellerWhatsapp = showWhatsapp ? sellerSnapshot.sellerWhatsappPhone : null;
      projectedFields.sellerLogoUrl = showLogo ? sellerSnapshot.sellerLogoUrl : null;
      projectedFields.sellerCity = showCity ? sellerSnapshot.sellerCity : null;
      projectedFields.sellerAddress = showAddress ? sellerSnapshot.sellerAddress : null;
    }

    return {
      ok: true,
      level: isPublished ? "OK" : "WARN",
      title: "Public Projection Preview",
      summary: isPublished ? "Would create PUBLIC doc" : "Would NOT create PUBLIC doc (not published)",
      details: {
        wouldCreatePublicDoc: isPublished,
        projectedFields,
        sellerUid,
        sellerType,
        adminExposure: adminExposure ? {
          showNameInBadge: adminExposure.showNameInBadge,
          showPhone: adminExposure.showPhone,
          showWhatsapp: adminExposure.showWhatsapp,
          showLogo: adminExposure.showLogo,
          showCity: adminExposure.showCity,
          showAddress: adminExposure.showAddress,
        } : null,
      },
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "adminDebugPublicProjectionPreview failed", { correlationId, error: error.message });
  }
}

export const adminDebugPublicProjectionPreview = functions.https.onCall(adminDebugPublicProjectionPreviewHandler);

/**
 * adminDebugSellerSnapshotRaw: Get raw seller data from users/yards
 * 
 * Auth: Admin only
 */
export async function adminDebugSellerSnapshotRawHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  const sellerUid = data?.sellerUid;
  const sellerType = data?.sellerType || 'YARD';

  if (!sellerUid || typeof sellerUid !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "sellerUid is required", { correlationId });
  }

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can access debug functions", { correlationId });
    }

    let source: 'users' | 'yards' | 'none' = 'none';
    let rawData: any = null;

    // Try yards first for YARD type
    if (sellerType === 'YARD') {
      try {
        const yardRef = db.collection("yards").doc(sellerUid);
        const yardSnap = await yardRef.get();
        if (yardSnap.exists) {
          source = 'yards';
          rawData = yardSnap.data() || {};
        }
      } catch (yardError: any) {
        console.warn(`[adminDebugSellerSnapshotRaw] Error reading yards/${sellerUid}: ${yardError?.message}`);
      }
    }

    // Fallback to users
    if (source === 'none') {
      try {
        const userRef = db.collection("users").doc(sellerUid);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          source = 'users';
          rawData = userSnap.data() || {};
        }
      } catch (userError: any) {
        console.warn(`[adminDebugSellerSnapshotRaw] Error reading users/${sellerUid}: ${userError?.message}`);
      }
    }

    return {
      ok: true,
      level: source !== 'none' ? "OK" : "WARN",
      title: "Seller Snapshot Raw",
      summary: source !== 'none' ? `Found in ${source}` : "Seller not found",
      details: {
        source,
        rawData: rawData ? JSON.parse(JSON.stringify(rawData)) : null, // Serialize Firestore types
        sellerUid,
        sellerType,
      },
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "adminDebugSellerSnapshotRaw failed", { correlationId, error: error.message });
  }
}

export const adminDebugSellerSnapshotRaw = functions.https.onCall(adminDebugSellerSnapshotRawHandler);

/**
 * adminDebugExposureEffective: Get effective exposure flags
 * 
 * Auth: Admin only
 */
export async function adminDebugExposureEffectiveHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  const sellerUid = data?.sellerUid;

  if (!sellerUid || typeof sellerUid !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "sellerUid is required", { correlationId });
  }

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can access debug functions", { correlationId });
    }

    // Load admin exposure
    const adminExposure = await loadAdminSellerExposure(sellerUid);

    // Load seller profile
    // Try to determine sellerType from users/yards
    let sellerType: 'YARD' | 'AGENT' | 'PRIVATE' = 'YARD';
    try {
      const yardRef = db.collection("yards").doc(sellerUid);
      const yardSnap = await yardRef.get();
      if (yardSnap.exists) {
        sellerType = 'YARD';
      } else {
        const userRef = db.collection("users").doc(sellerUid);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          const userData = userSnap.data() || {};
          if (userData.isAgent) {
            sellerType = 'AGENT';
          } else {
            sellerType = 'PRIVATE';
          }
        }
      }
    } catch (error: any) {
      console.warn(`[adminDebugExposureEffective] Error determining sellerType: ${error?.message}`);
    }

    const sellerSnapshot = await loadPublicSellerProfile(sellerUid, sellerType);

    // Compute effective flags
    const effective: any = {
      showNameInBadge: adminExposure?.showNameInBadge !== false,
      showPhone: adminExposure?.showPhone !== false,
      showWhatsapp: adminExposure?.showWhatsapp !== false,
      showLogo: adminExposure?.showLogo !== false,
      showCity: adminExposure?.showCity !== false,
      showAddress: adminExposure?.showAddress === true, // Default false
    };

    // Determine blocked fields
    const blockedFields: string[] = [];
    if (!effective.showNameInBadge && sellerSnapshot?.sellerName) {
      blockedFields.push("sellerName");
    }
    if (!effective.showPhone && sellerSnapshot?.sellerPhone) {
      blockedFields.push("sellerPhone");
    }
    if (!effective.showWhatsapp && sellerSnapshot?.sellerWhatsappPhone) {
      blockedFields.push("sellerWhatsapp");
    }
    if (!effective.showLogo && sellerSnapshot?.sellerLogoUrl) {
      blockedFields.push("sellerLogoUrl");
    }
    if (!effective.showCity && sellerSnapshot?.sellerCity) {
      blockedFields.push("sellerCity");
    }
    if (!effective.showAddress && sellerSnapshot?.sellerAddress) {
      blockedFields.push("sellerAddress");
    }

    return {
      ok: true,
      level: "OK",
      title: "Exposure Flags Effective",
      summary: `${blockedFields.length} fields blocked by exposure flags`,
      details: {
        raw: adminExposure ? JSON.parse(JSON.stringify(adminExposure)) : null,
        effective,
        blockedFields,
        sellerUid,
        sellerType,
        sellerSnapshot: sellerSnapshot ? {
          sellerName: sellerSnapshot.sellerName,
          sellerPhone: sellerSnapshot.sellerPhone,
          sellerWhatsappPhone: sellerSnapshot.sellerWhatsappPhone,
          sellerLogoUrl: sellerSnapshot.sellerLogoUrl,
          sellerCity: sellerSnapshot.sellerCity,
          sellerAddress: sellerSnapshot.sellerAddress,
          source: sellerSnapshot.source,
        } : null,
      },
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "adminDebugExposureEffective failed", { correlationId, error: error.message });
  }
}

export const adminDebugExposureEffective = functions.https.onCall(adminDebugExposureEffectiveHandler);

/**
 * adminDebugPublicEligibility: Check if car is eligible for public display
 * 
 * Auth: Admin only
 */
export async function adminDebugPublicEligibilityHandler(data: any, context: functions.https.CallableContext) {
  const correlationId = data?.correlationId || `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated", { correlationId });
  }

  const callerUid = context.auth.uid;
  const carId = data?.carId;

  if (!carId || typeof carId !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "carId is required", { correlationId });
  }

  try {
    const callerIsAdmin = await isAdmin(callerUid);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can access debug functions", { correlationId });
    }

    // Read PUBLIC car
    const publicRef = db.collection("publicCars").doc(carId);
    const publicSnap = await publicRef.get();

    let eligible = false;
    let reason = "";
    const expectedVisibleFields: string[] = [];

    if (!publicSnap.exists) {
      reason = "PUBLIC doc does not exist";
    } else {
      const publicData = publicSnap.data() || {};
      eligible = publicData.isPublished === true;

      if (!eligible) {
        reason = "PUBLIC doc exists but isPublished is not true";
      } else {
        reason = "Car is eligible for public display";
        
        // Check which seller fields would be visible
        if (publicData.sellerName) expectedVisibleFields.push("sellerName");
        if (publicData.sellerPhone) expectedVisibleFields.push("sellerPhone");
        if (publicData.sellerWhatsapp) expectedVisibleFields.push("sellerWhatsapp");
        if (publicData.sellerLogoUrl) expectedVisibleFields.push("sellerLogoUrl");
        if (publicData.sellerCity) expectedVisibleFields.push("sellerCity");
        if (publicData.sellerAddress) expectedVisibleFields.push("sellerAddress");
      }
    }

    return {
      ok: true,
      level: eligible ? "OK" : "WARN",
      title: "Public Eligibility Summary",
      summary: eligible ? "Car is eligible" : reason,
      details: {
        eligible,
        reason,
        expectedVisibleFields,
        carId,
        publicExists: publicSnap.exists,
      },
      correlationId,
      ts: new Date().toISOString(),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", "adminDebugPublicEligibility failed", { correlationId, error: error.message });
  }
}

export const adminDebugPublicEligibility = functions.https.onCall(adminDebugPublicEligibilityHandler);
