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
    // Use safe path construction
    const ref = db.doc(`users/${yardUid}/carSales/${carId}`);
    let masterSnap;
    try {
      masterSnap = await ref.get();
    } catch (readError: any) {
      console.error("adminDebugMasterCarState:error", {
        correlationId,
        yardUid,
        carId,
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
    if (!updatedAt) missingFields.push('updatedAt');

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

    // Query MASTER cars where updatedAt is null/missing
    const masterRef = db.collection("users").doc(yardUid).collection("carSales");
    
    // Query for cars with missing updatedAt (using where clause if possible, or scan all)
    // Note: Firestore doesn't support "where field is null", so we'll scan and filter
    let masterSnap;
    try {
      masterSnap = await masterRef.limit(actualLimit * 2).get(); // Get more to filter
    } catch (queryError: any) {
      console.error("[adminDebugRepairMissingCarFields] Query error", { correlationId, yardUid, error: queryError?.message, stack: queryError?.stack });
      throw new functions.https.HttpsError(
        "internal",
        "Failed to query MASTER cars",
        { correlationId, reason: queryError?.message || String(queryError) }
      );
    }

    const now = admin.firestore.Timestamp.now();
    
    let scanned = 0;
    let updatedUpdatedAt = 0;
    let updatedPublishedAt = 0;
    let skipped = 0;
    const errors: Array<{ carId: string; error: string }> = [];
    const sampleUpdatedCarIds: string[] = [];

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500; // Firestore batch limit

    masterSnap.forEach((doc) => {
      scanned++;
      
      if (scanned > actualLimit) {
        return; // Stop after limit
      }

      try {
        const carData = doc.data();
        const carId = doc.id;
        
        // Check if updatedAt is missing/null
        const hasUpdatedAt = carData?.updatedAt !== null && carData?.updatedAt !== undefined;
        
        // Compute effective published state
        const publishState = computeMasterPublishState(carData);
        const isEffectivelyPublished = publishState.effectivePublished && !publishState.effectiveHidden;
        const hasPublishedAt = carData?.publishedAt !== null && carData?.publishedAt !== undefined;
        
        let needsUpdate = false;
        const updates: any = {};
        
        if (!hasUpdatedAt) {
          updates.updatedAt = now;
          needsUpdate = true;
        }
        
        // Optional: set publishedAt if effectively published and missing
        if (isEffectivelyPublished && !hasPublishedAt && !hasUpdatedAt) {
          // Only set publishedAt if we're also setting updatedAt (safe rule)
          updates.publishedAt = now;
          needsUpdate = true;
        }
        
        if (needsUpdate && !dryRun) {
          const carRef = masterRef.doc(carId);
          batch.update(carRef, updates);
          batchCount++;
          
          if (!hasUpdatedAt) {
            updatedUpdatedAt++;
            if (sampleUpdatedCarIds.length < 10) {
              sampleUpdatedCarIds.push(carId);
            }
          }
          if (isEffectivelyPublished && !hasPublishedAt) {
            updatedPublishedAt++;
          }
          
          // Commit batch if approaching limit
          if (batchCount >= BATCH_LIMIT - 10) {
            // This is a limitation - we can't commit mid-iteration
            // In practice, we'll commit after the loop
          }
        } else if (needsUpdate && dryRun) {
          // Dry run: count but don't update
          if (!hasUpdatedAt) {
            updatedUpdatedAt++;
            if (sampleUpdatedCarIds.length < 10) {
              sampleUpdatedCarIds.push(carId);
            }
          }
          if (isEffectivelyPublished && !hasPublishedAt) {
            updatedPublishedAt++;
          }
        } else {
          skipped++;
        }
      } catch (docError: any) {
        errors.push({
          carId: doc.id,
          error: docError?.message || String(docError),
        });
        console.warn(`[adminDebugRepairMissingCarFields] Error processing car ${doc.id} (correlationId: ${correlationId}):`, {
          error: docError?.message,
        });
      }
    });

    // Commit batch if not dry run
    if (!dryRun && batchCount > 0) {
      try {
        await batch.commit();
        console.info(`[adminDebugRepairMissingCarFields] Committed ${batchCount} updates (correlationId: ${correlationId})`);
      } catch (commitError: any) {
        console.error("[adminDebugRepairMissingCarFields] Batch commit error", { correlationId, error: commitError?.message, stack: commitError?.stack });
        throw new functions.https.HttpsError(
          "internal",
          "Failed to commit updates",
          { correlationId, reason: commitError?.message || String(commitError) }
        );
      }
    }

    const level: "OK" | "WARN" | "FAIL" = errors.length > 0 ? "WARN" : "OK";
    const summary = dryRun 
      ? `Dry run: ${scanned} scanned, ${updatedUpdatedAt} would update updatedAt, ${updatedPublishedAt} would update publishedAt, ${skipped} skipped`
      : `${scanned} scanned, ${updatedUpdatedAt} updated updatedAt, ${updatedPublishedAt} updated publishedAt, ${skipped} skipped${errors.length > 0 ? `, ${errors.length} errors` : ''}`;
    const nextAction = dryRun 
      ? "Run without dryRun=true to apply updates"
      : errors.length > 0 
        ? "Some cars failed to update - check errors"
        : "No action needed";

    console.info(`[adminDebugRepairMissingCarFields] Success (correlationId: ${correlationId}):`, {
      yardUid,
      scanned,
      updatedUpdatedAt,
      updatedPublishedAt,
      skipped,
      errors: errors.length,
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
        scanned,
        updatedUpdatedAt,
        updatedPublishedAt,
        skipped,
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
    });
    
    throw new functions.https.HttpsError(
      "internal",
      "adminDebugRepairMissingCarFields failed",
      {
        correlationId,
        reason: error?.message || String(error),
        hint: "Check Firestore permissions, batch limits, or yardUid validity",
      }
    );
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
