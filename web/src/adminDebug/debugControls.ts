/**
 * Admin Debug Controls
 * 
 * Defines debug controls for the Admin Debug Console.
 * Each control is a pure function that performs read-only or callable operations.
 */

import { db, functions, collection, query, where, getDocs, orderBy, limit as firestoreLimit, doc, getDoc, httpsCallable } from '../firebase/firebaseClient';

export interface DebugContext {
  yardUid?: string;
  carId?: string;
  limit?: number;
  verbose?: boolean;
  readOnly?: boolean;
}

export interface DebugResult {
  ok: boolean;
  level: 'OK' | 'WARN' | 'FAIL';
  title: string;
  summary: string;
  details: any; // JSON-safe
  detailsVerbose?: any; // Extra fields when verbose=true
  ts: string; // ISO string
  correlationId?: string; // For tracking in logs
}

export interface DebugControl {
  id: string;
  title: string;
  group: string;
  description: string;
  requiresCarId?: boolean; // Legacy - use requires.car instead
  requiresYardUid?: boolean; // Legacy - use requires.yard instead
  requiresReadOnly?: boolean; // Legacy - use requires.readOnlyOff instead
  requires?: {
    yard?: boolean;
    car?: boolean;
    readOnlyOff?: boolean; // If true, requires readOnly=false
    verboseRecommended?: boolean;
  };
  getDisabledReason?: (ctx: DebugContext) => string | null; // Returns Hebrew reason or null if runnable
  run: (ctx: DebugContext) => Promise<DebugResult>;
}

/**
 * Helper to create a result
 */
function createResult(
  ok: boolean,
  level: 'OK' | 'WARN' | 'FAIL',
  title: string,
  summary: string,
  details: any
): DebugResult {
  // Ensure correlationId is included if present in details
  const correlationId = details?.correlationId || undefined;
  
  return {
    ok,
    level,
    title,
    summary,
    details,
    correlationId,
    ts: new Date().toISOString(),
  };
}

/**
 * Helper to check if car is published in MASTER
 * @deprecated - Only used for client-side PUBLIC checks. All MASTER checks use callables.
 */
// @ts-ignore - Unused but kept for potential future use
function isMasterCarPublished(carData: any): boolean {
  const status = String(carData?.status || '').toLowerCase();
  const pubStatus = String(carData?.publicationStatus || '').toUpperCase();
  return status === 'published' || pubStatus === 'PUBLISHED';
}

/**
 * Helper to generate correlation ID for debug runs
 */
export function generateCorrelationId(): string {
  return `dbg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Helper to call a callable function with standardized error handling
 */
async function callCallable(
  name: string,
  payload: any,
  ctx: DebugContext
): Promise<DebugResult> {
  const correlationId = generateCorrelationId();
  const fullPayload = {
    ...payload,
    correlationId,
    verbose: ctx.verbose || false,
  };

  try {
    const fn = httpsCallable(functions, name);
    const result = await fn(fullPayload);
    
    // If result is already a DebugResult (from Functions), return it
    if (result.data && typeof result.data === 'object' && 'ok' in result.data && 'level' in result.data) {
      const debugResult = result.data as any;
      // Ensure correlationId is included in details
      const details = debugResult.details || {};
      if (!details.correlationId) {
        details.correlationId = correlationId;
      }
      return {
        ok: debugResult.ok,
        level: debugResult.level,
        title: debugResult.title,
        summary: debugResult.summary,
        details,
        correlationId: debugResult.correlationId || correlationId,
        ts: new Date().toISOString(),
      } as DebugResult;
    }
    
    // Otherwise wrap in DebugResult (shouldn't happen with new callables)
    return createResult(
      true,
      'OK',
      name,
      'Success',
      {
        ...(typeof result.data === 'object' && result.data !== null ? result.data : {}),
        correlationId,
        nextAction: 'No action needed',
      }
    );
  } catch (error: any) {
    const errorInfo = mapFirebaseError(error);
    
    // Extract reason and hint from HttpsError.details if present
    const errorDetailsFromServer: any = error.details || {};
    const serverReason = errorDetailsFromServer.reason;
    const serverHint = errorDetailsFromServer.hint;
    const serverCorrelationId = errorDetailsFromServer.correlationId || correlationId;
    
    const errorDetails: any = {
      error: error.message,
      firebaseCode: error.code,
      firebaseMessage: error.message,
      recommendedAction: errorInfo.action,
      correlationId: serverCorrelationId,
    };
    
    // If server provided reason/hint, use them (especially for internal errors)
    if (serverReason) {
      errorDetails.reason = serverReason;
    }
    if (serverHint) {
      errorDetails.hint = serverHint;
    }
    
    // If internal error, show server reason/hint or default message
    if (error.code === 'internal') {
      if (serverReason && serverHint) {
        errorDetails.nextAction = `שגיאת שרת: ${serverReason}. המלצה: ${serverHint}. Correlation ID: ${serverCorrelationId}`;
      } else {
        errorDetails.nextAction = `פתח לוגים עם correlationId: ${serverCorrelationId}`;
      }
    }
    
    return createResult(false, 'FAIL', name, errorInfo.message, {
      ...errorDetails,
      stack: ctx.verbose ? error.stack : undefined,
    });
  }
}

/**
 * Helper to map Firebase Functions errors to Hebrew messages
 */
export function mapFirebaseError(error: any): { message: string; action: string } {
  if (error?.code) {
    const code = error.code;
    switch (code) {
      case 'permission-denied':
        return {
          message: 'אין הרשאת Admin (Claims/Allowlist)',
          action: 'וודא שהמשתמש מופיע ב-config/admins או שיש לו custom claim admin=true',
        };
      case 'unauthenticated':
        return {
          message: 'לא מחובר',
          action: 'התחבר מחדש',
        };
      case 'not-found':
        return {
          message: 'הפונקציה לא קיימת/לא נפרסה',
          action: 'וודא שהפונקציה נפרסה ב-Functions',
        };
      case 'failed-precondition':
        return {
          message: 'תנאי מוקדם נכשל',
          action: 'וודא שהנתונים תקינים',
        };
      case 'internal':
        return {
          message: 'שגיאת שרת. חפש Logs לפי correlationId',
          action: 'פתח לוגים עם correlationId: [ראה בתוצאה]',
        };
      case 'unavailable':
        return {
          message: 'Functions לא זמינות/בעיה ברשת/Region',
          action: 'נסה שוב בעוד כמה רגעים',
        };
      default:
        return {
          message: `שגיאה: ${error.message || code || 'Unknown'}`,
          action: 'בדוק את ה-Logs לפי correlationId',
        };
    }
  }
  
  return {
    message: error?.message || 'שגיאה לא ידועה',
    action: 'בדוק את ה-Logs',
  };
}

/**
 * Helper to get disabled reason for a control (Hebrew)
 */
export function getControlDisabledReason(control: DebugControl, ctx: DebugContext): string | null {
  // Check requires (new format)
  if (control.requires) {
    if (control.requires.yard && !ctx.yardUid) {
      return 'נדרש לבחור מגרש';
    }
    if (control.requires.car && !ctx.carId) {
      return 'נדרש לבחור רכב';
    }
    if (control.requires.readOnlyOff && ctx.readOnly) {
      return 'כבה Read-only';
    }
  }
  
  // Check legacy format (backward compatibility)
  if (control.requiresYardUid && !ctx.yardUid) {
    return 'נדרש לבחור מגרש';
  }
  if (control.requiresCarId && !ctx.carId) {
    return 'נדרש לבחור רכב';
  }
  if (control.requiresReadOnly === false && ctx.readOnly) {
    return 'כבה Read-only';
  }
  
  // Use custom getDisabledReason if provided
  if (control.getDisabledReason) {
    return control.getDisabledReason(ctx);
  }
  
  return null; // Runnable
}

/**
 * Control 1: MASTER Car Publish State
 */
const controlMasterCarState: DebugControl = {
  id: 'master-car-state',
  title: '📄🚗 MASTER Car Publish State',
  group: '🔄 Pipeline',
  description: 'Reads users/{yardUid}/carSales/{carId} and reports publish status (via callable)',
  requiresCarId: true, // Legacy
  requiresYardUid: true, // Legacy
  requires: {
    yard: true,
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid || !ctx.carId) {
      return createResult(false, 'FAIL', 'MASTER Car State', 'Missing yardUid or carId', {});
    }

    return callCallable('adminDebugMasterCarState', {
      yardUid: ctx.yardUid,
      carId: ctx.carId,
    }, ctx);
  },
};

/**
 * Control 2: PUBLIC Car Projection State
 */
const controlPublicCarState: DebugControl = {
  id: 'public-car-state',
  title: '🌍🚗📄 PUBLIC Car Projection State',
  group: '🔄 Pipeline',
  description: 'Reads publicCars/{carId} and reports projection status (via callable)',
  requiresCarId: true, // Legacy
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'PUBLIC Car State', 'Missing carId', {});
    }

    return callCallable('adminDebugPublicCarState', {
      carId: ctx.carId,
      yardUid: ctx.yardUid, // Pass yardUid when available
    }, ctx);
  },
};

/**
 * Control 3: MASTER vs PUBLIC Diff
 */
const controlMasterPublicDiff: DebugControl = {
  id: 'master-public-diff',
  title: '🧩🚗 MASTER vs PUBLIC Diff',
  group: '🔄 Pipeline',
  description: 'Compares MASTER and PUBLIC documents and reports differences (via callable)',
  requiresCarId: true, // Legacy
  requiresYardUid: true, // Legacy
  requires: {
    yard: true,
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid || !ctx.carId) {
      return createResult(false, 'FAIL', 'MASTER vs PUBLIC Diff', 'Missing yardUid or carId', {});
    }

    return callCallable('adminDebugCheckCar', {
      yardUid: ctx.yardUid,
      carId: ctx.carId,
    }, ctx);
  },
};

/**
 * Control 4: Yard Published Counts
 */
const controlYardPublishedCounts: DebugControl = {
  id: 'yard-published-counts',
  title: '🏢📊 Yard Published Counts',
  group: '🔄 Pipeline',
  description: 'Counts MASTER and PUBLIC cars for a yard (via callable)',
  requiresYardUid: true, // Legacy
  requires: {
    yard: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid) {
      return createResult(false, 'FAIL', 'Yard Published Counts', 'Missing yardUid', {});
    }

    return callCallable('adminDebugYardPublishedCounts', {
      yardUid: ctx.yardUid,
      limit: ctx.limit || 100,
    }, ctx);
  },
};

/**
 * Control 5: Reproject Car (callable)
 */
const controlReprojectCar: DebugControl = {
  id: 'reproject-car',
  title: '🔄🚗 Reproject Car',
  group: '🔄 Functions/Projection',
  description: 'Calls adminDebugReprojectCar to force reprojection',
  requiresCarId: true, // Legacy
  requiresYardUid: true, // Legacy
  requiresReadOnly: false, // Legacy
  requires: {
    yard: true,
    car: true,
    readOnlyOff: true,
  },
  run: async (ctx) => {
    if (ctx.readOnly) {
      return createResult(false, 'WARN', 'Reproject Car', 'Disabled in read-only mode', {});
    }

    if (!ctx.yardUid || !ctx.carId) {
      return createResult(false, 'FAIL', 'Reproject Car', 'Missing yardUid or carId', {});
    }

    try {
      const correlationId = generateCorrelationId();
      const startTime = Date.now();
      const reprojectFn = httpsCallable(functions, 'adminDebugReprojectCar');
      const result = await reprojectFn({ 
        yardUid: ctx.yardUid, 
        carId: ctx.carId,
        correlationId,
      });
      const duration = Date.now() - startTime;

      return createResult(true, 'OK', 'Reproject Car', `Reprojected in ${duration}ms`, {
        carId: ctx.carId,
        yardUid: ctx.yardUid,
        duration,
        result: result.data,
        correlationId,
      });
    } catch (error: any) {
      const correlationId = generateCorrelationId();
      const errorInfo = mapFirebaseError(error);
      return createResult(false, 'FAIL', 'Reproject Car', errorInfo.message, {
        error: error.message,
        code: error.code,
        recommendedAction: errorInfo.action,
        correlationId,
        stack: ctx.verbose ? error.stack : undefined,
      });
    }
  },
};

/**
 * Control 6: Reproject Yard Batch (callable)
 */
const controlReprojectYard: DebugControl = {
  id: 'reproject-yard',
  title: '🔄🏢 Reproject Yard Batch',
  group: '🔄 Functions/Projection',
  description: 'Calls adminDebugReprojectYard to batch reproject',
  requiresYardUid: true, // Legacy
  requiresReadOnly: false, // Legacy
  requires: {
    yard: true,
    readOnlyOff: true,
  },
  run: async (ctx) => {
    if (ctx.readOnly) {
      return createResult(false, 'WARN', 'Reproject Yard Batch', 'Disabled in read-only mode', {});
    }

    if (!ctx.yardUid) {
      return createResult(false, 'FAIL', 'Reproject Yard Batch', 'Missing yardUid', {});
    }

    try {
      const correlationId = generateCorrelationId();
      const startTime = Date.now();
      const reprojectFn = httpsCallable(functions, 'adminDebugReprojectYard');
      const result = await reprojectFn({ 
        yardUid: ctx.yardUid, 
        limit: ctx.limit || 50,
        correlationId,
      });
      const duration = Date.now() - startTime;

      return createResult(true, 'OK', 'Reproject Yard Batch', `Reprojected in ${duration}ms`, {
        yardUid: ctx.yardUid,
        limit: ctx.limit || 50,
        duration,
        result: result.data,
        correlationId,
      });
    } catch (error: any) {
      const correlationId = generateCorrelationId();
      const errorInfo = mapFirebaseError(error);
      return createResult(false, 'FAIL', 'Reproject Yard Batch', errorInfo.message, {
        error: error.message,
        code: error.code,
        recommendedAction: errorInfo.action,
        correlationId,
        stack: ctx.verbose ? error.stack : undefined,
      });
    }
  },
};

/**
 * Control 7: Public Listing Query Dry Run
 */
const controlPublicListingQuery: DebugControl = {
  id: 'public-listing-query',
  title: '🔍🌍 Public Listing Query Dry Run',
  group: 'Queries & Backward Compatibility',
  description: 'Runs the same query as buyer/public page (primary + fallback)',
  requires: {}, // No requirements
  run: async (ctx) => {
    try {
      const limit = ctx.limit || 25;

      // Primary query: isPublished == true
      const primaryRef = collection(db, 'publicCars');
      const primaryQuery = query(
        primaryRef,
        where('isPublished', '==', true),
        firestoreLimit(limit)
      );
      const primarySnap = await getDocs(primaryQuery);
      const primaryCount = primarySnap.size;
      const primaryCarIds = primarySnap.docs.map(d => d.id).slice(0, 10);

      // Fallback query: no isPublished filter (backward compatibility)
      let fallbackCount = 0;
      let fallbackCarIds: string[] = [];
      let fallbackUsed = false;

      if (primaryCount === 0) {
        fallbackUsed = true;
        const fallbackQuery = query(primaryRef, firestoreLimit(limit * 2));
        const fallbackSnap = await getDocs(fallbackQuery);
        
        // Filter in-memory for published-looking docs
        fallbackSnap.forEach((doc) => {
          const data = doc.data();
          const status = String(data?.status || '').toLowerCase();
          const pubStatus = String(data?.publicationStatus || '').toUpperCase();
          if (status === 'published' || pubStatus === 'PUBLISHED' || data?.isPublished === true) {
            fallbackCount++;
            if (fallbackCarIds.length < 10) {
              fallbackCarIds.push(doc.id);
            }
          }
        });
      }

      const result: any = {
        primaryQuery: {
          count: primaryCount,
          sampleCarIds: primaryCarIds,
          query: 'isPublished == true',
        },
        fallbackQuery: {
          used: fallbackUsed,
          count: fallbackCount,
          sampleCarIds: fallbackCarIds,
          query: 'no filter (backward compatibility)',
        },
        reason: primaryCount === 0 
          ? (fallbackCount > 0 ? 'Primary returned 0, fallback found docs missing isPublished' : 'No published cars found')
          : 'Primary query successful',
      };

      let level: 'OK' | 'WARN' | 'FAIL' = 'OK';
      let summary = `Primary: ${primaryCount}, Fallback: ${fallbackUsed ? fallbackCount : 'N/A'}`;
      
      if (fallbackUsed && fallbackCount > 0) {
        level = 'WARN';
        summary += ' (fallback needed - docs missing isPublished)';
      }
      if (primaryCount === 0 && fallbackCount === 0) {
        level = 'WARN';
        summary = 'No published cars found';
      }

      return createResult(level === 'OK', level, 'Public Listing Query', summary, result);
    } catch (error: any) {
      return createResult(false, 'FAIL', 'Public Listing Query', `Error: ${error.message}`, {
        error: error.message,
        stack: ctx.verbose ? error.stack : undefined,
      });
    }
  },
};

/**
 * Control 8: Detect Old Docs Missing isPublished
 */
const controlDetectOldDocs: DebugControl = {
  id: 'detect-old-docs',
  title: '⚠️📄 Detect Old Docs Missing isPublished',
  group: 'Queries & Backward Compatibility',
  description: 'Samples publicCars and counts docs missing isPublished field',
  requires: {}, // No requirements
  run: async (ctx) => {
    try {
      const limit = ctx.limit || 100;
      const publicRef = collection(db, 'publicCars');
      const sampleQuery = query(
        publicRef,
        orderBy('updatedAt', 'desc'),
        firestoreLimit(limit)
      );
      const sampleSnap = await getDocs(sampleQuery);

      let missingIsPublished = 0;
      let hasPublicationStatus = 0;
      let hasStatus = 0;
      const sampleMissing: any[] = [];

      sampleSnap.forEach((doc) => {
        const data = doc.data();
        const hasIsPublished = data?.isPublished !== undefined;
        const hasPubStatus = data?.publicationStatus !== undefined;
        const hasStat = data?.status !== undefined;

        if (!hasIsPublished) {
          missingIsPublished++;
          if (sampleMissing.length < 10) {
            sampleMissing.push({
              carId: doc.id,
              hasPublicationStatus: hasPubStatus,
              hasStatus: hasStat,
              status: data?.status || null,
              publicationStatus: data?.publicationStatus || null,
            });
          }
        }
        if (hasPubStatus) hasPublicationStatus++;
        if (hasStat) hasStatus++;
      });

      const result: any = {
        sampleSize: sampleSnap.size,
        missingIsPublished,
        hasPublicationStatus,
        hasStatus,
        sampleMissing,
        percentage: sampleSnap.size > 0 ? Math.round((missingIsPublished / sampleSnap.size) * 100) : 0,
      };

      let level: 'OK' | 'WARN' | 'FAIL' = 'OK';
      let summary = `${missingIsPublished}/${sampleSnap.size} missing isPublished (${result.percentage}%)`;
      
      if (missingIsPublished > 0) {
        level = 'WARN';
        summary += ' - backward compatibility issue';
      }

      return createResult(level === 'OK', level, 'Detect Old Docs', summary, result);
    } catch (error: any) {
      return createResult(false, 'FAIL', 'Detect Old Docs', `Error: ${error.message}`, {
        error: error.message,
        stack: ctx.verbose ? error.stack : undefined,
      });
    }
  },
};

/**
 * Control 9: Client Write Permission Probe (SAFE)
 */
const controlWritePermissionProbe: DebugControl = {
  id: 'write-permission-probe',
  title: '🔒 Client Write Permission Probe',
  group: 'Rules/Permissions Signals',
  description: 'Tests write permissions using adminDebugProbes collection (safe)',
  requires: {}, // No requirements
  run: async (ctx) => {
    try {
      const correlationId = generateCorrelationId();
      const probeFn = httpsCallable(functions, 'adminDebugPing');
      const result = await probeFn({ correlationId });
      
      return createResult(true, 'OK', 'Write Permission Probe', 'Callable function accessible', {
        result: result.data,
        correlationId: (result.data as any)?.correlationId || correlationId,
      });
    } catch (error: any) {
      const correlationId = generateCorrelationId();
      const errorInfo = mapFirebaseError(error);
      return createResult(false, 'FAIL', 'Write Permission Probe', errorInfo.message, {
        error: error.message,
        code: error.code,
        recommendedAction: errorInfo.action,
        correlationId,
        stack: ctx.verbose ? error.stack : undefined,
      });
    }
  },
};

/**
 * Control 10: MASTER Undefined/Null Scan
 */
const controlMasterUndefinedScan: DebugControl = {
  id: 'master-undefined-scan',
  title: '🔍📄 MASTER Undefined/Null Scan',
  group: 'Data Integrity',
  description: 'Scans MASTER cars for missing/null/type issues (via callable)',
  requiresYardUid: true, // Legacy
  requires: {
    yard: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid) {
      return createResult(false, 'FAIL', 'MASTER Undefined Scan', 'Missing yardUid', {});
    }

    return callCallable('adminDebugScanMasterHealth', {
      yardUid: ctx.yardUid,
      limit: ctx.limit || 100,
    }, ctx);
  },
};

/**
 * Control 11: Publish Signal Canonicality Scan
 */
const controlPublishSignalScan: DebugControl = {
  id: 'publish-signal-scan',
  title: '🔍🚗 Publish Signal Canonicality Scan',
  group: 'Data Integrity',
  description: 'Scans for cars with misaligned publish signals (via callable)',
  requiresYardUid: true, // Legacy
  requires: {
    yard: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid) {
      return createResult(false, 'FAIL', 'Publish Signal Scan', 'Missing yardUid', {});
    }

    return callCallable('adminDebugScanPublishSignals', {
      yardUid: ctx.yardUid,
      limit: ctx.limit || 100,
    }, ctx);
  },
};

/**
 * Control 12: Functions Latency Snapshot
 */
const controlFunctionsLatency: DebugControl = {
  id: 'functions-latency',
  title: '⏱️ Functions Latency Snapshot',
  group: 'Performance / Sampling',
  description: 'Calls adminDebugPing to measure function latency',
  requires: {}, // No requirements
  run: async (ctx) => {
    try {
      const correlationId = generateCorrelationId();
      const startTime = Date.now();
      const pingFn = httpsCallable(functions, 'adminDebugPing');
      const result = await pingFn({ correlationId });
      const duration = Date.now() - startTime;

      const resultData = result.data as any;
      
      return createResult(true, 'OK', 'Functions Latency', `Ping: ${duration}ms`, {
        duration,
        serverTs: resultData?.serverTs,
        serverTsISO: resultData?.serverTsISO,
        region: resultData?.region,
        version: resultData?.version,
        correlationId: resultData?.correlationId || correlationId,
        nextAction: 'No action needed',
      });
    } catch (error: any) {
      const correlationId = generateCorrelationId();
      const errorInfo = mapFirebaseError(error);
      return createResult(false, 'FAIL', 'Functions Latency', errorInfo.message, {
        error: error.message,
        firebaseCode: error.code,
        firebaseMessage: error.message,
        recommendedAction: errorInfo.action,
        correlationId,
        stack: ctx.verbose ? error.stack : undefined,
      });
    }
  },
};

/**
 * Control 13: Seller Exposure Diagnosis
 */
const controlSellerExposureDiagnosis: DebugControl = {
  id: 'seller-exposure-diagnosis',
  title: '🔍👤 Seller Exposure Diagnosis',
  group: '🔄 Pipeline',
  description: 'Diagnoses why yard contact/logo/address are visible only in ADMIN (via callable)',
  requiresCarId: true, // Legacy
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'Seller Exposure Diagnosis', 'Missing carId', {});
    }

    return callCallable('adminDebugSellerExposureDiagnosis', {
      carId: ctx.carId,
      yardUid: ctx.yardUid, // Optional
      verbose: ctx.verbose || false,
    }, ctx);
  },
};

/**
 * Control: Repair Missing Fields (updatedAt) - Yard scope
 */
const controlRepairMissingFields: DebugControl = {
  id: 'repair-missing-fields',
  title: '🔧📄 Repair Missing Fields (updatedAt)',
  group: 'Data Integrity',
  description: 'Backfills missing updatedAt timestamps for MASTER cars (safe, does not change publish signals)',
  requires: {
    yard: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid) {
      return createResult(false, 'FAIL', 'Repair Missing Fields', 'Missing yardUid', {});
    }

    return callCallable('adminDebugRepairMissingCarFields', {
      yardUid: ctx.yardUid,
      limit: ctx.limit || 200,
      dryRun: false,
    }, ctx);
  },
};

/**
 * Control: Repair Selected Car Fields - Single car repair
 */
const controlRepairSelectedCar: DebugControl = {
  id: 'repair-selected-car',
  title: '🔧🚗 Repair Selected Car Fields',
  group: 'Data Integrity',
  description: 'Repairs missing updatedAt/publishedAt for the selected car (fast, deterministic)',
  requires: {
    yard: true,
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.yardUid || !ctx.carId) {
      return createResult(false, 'FAIL', 'Repair Selected Car Fields', 'Missing yardUid or carId', {});
    }

    return callCallable('adminDebugRepairCarFields', {
      yardUid: ctx.yardUid,
      carId: ctx.carId,
      dryRun: false,
    }, ctx);
  },
};

/**
 * Control: Public Car Existence Check
 */
const controlPublicCarExists: DebugControl = {
  id: 'public-car-exists',
  title: '✅🚗📄 publicCars Document Exists',
  group: '🚗🌍👁️ Publication & Visibility',
  description: 'Checks if publicCars/{carId} exists',
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'Public Car Existence Check', 'Missing carId', {});
    }
    return callCallable('adminDebugPublicCarExists', { carId: ctx.carId }, ctx);
  },
};

/**
 * Control: Why Car Is Not Public
 */
const controlWhyCarNotPublic: DebugControl = {
  id: 'why-car-not-public',
  title: '❓🚗🌍👁️ Why Car Is Not Public',
  group: '🚗🌍👁️ Publication & Visibility',
  description: 'Explains why a car is not public (blocking reasons)',
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'Why Car Is Not Public', 'Missing carId', {});
    }
    return callCallable('adminDebugWhyCarNotPublic', {
      carId: ctx.carId,
      yardUid: ctx.yardUid,
    }, ctx);
  },
};

/**
 * Control: Public Projection Preview (Dry Run)
 */
const controlPublicProjectionPreview: DebugControl = {
  id: 'public-projection-preview',
  title: '🔄🚗🌍 Preview Public Projection (Dry Run)',
  group: '🚗🌍👁️ Publication & Visibility',
  description: 'Preview what would be projected to publicCars (no writes)',
  requires: {
    car: true,
    yard: true,
  },
  run: async (ctx) => {
    if (!ctx.carId || !ctx.yardUid) {
      return createResult(false, 'FAIL', 'Public Projection Preview', 'Missing carId or yardUid', {});
    }
    return callCallable('adminDebugPublicProjectionPreview', {
      carId: ctx.carId,
      yardUid: ctx.yardUid,
    }, ctx);
  },
};

/**
 * Control: Seller Snapshot Raw
 */
const controlSellerSnapshotRaw: DebugControl = {
  id: 'seller-snapshot-raw',
  title: '🧾👤 Seller Snapshot (Raw)',
  group: '🏢👤 Diagnostics',
  description: 'Get raw seller data from users/yards collection (infers sellerUid from carId)',
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'Seller Snapshot Raw', 'Missing carId', {});
    }
    
    // Try to get sellerUid from publicCars first
    let sellerUid: string | null = null;
    let sellerType: string = 'YARD';
    
    try {
      const publicRef = doc(db, 'publicCars', ctx.carId);
      const publicSnap = await getDoc(publicRef);
      
      if (publicSnap.exists()) {
        const publicData = publicSnap.data();
        sellerUid = publicData.yardUid || publicData.sellerUid || null;
        if (publicData.sellerType) {
          sellerType = publicData.sellerType;
        }
      }
    } catch (error: any) {
      // Fall through to try MASTER
    }
    
    // If not found in publicCars, try MASTER
    if (!sellerUid && ctx.yardUid) {
      sellerUid = ctx.yardUid;
      sellerType = 'YARD';
    }
    
    if (!sellerUid) {
      return createResult(false, 'FAIL', 'Seller Snapshot Raw', 'Could not infer sellerUid from carId. Try selecting a yard first.', {});
    }
    
    return callCallable('adminDebugSellerSnapshotRaw', {
      sellerUid,
      sellerType,
    }, ctx);
  },
};

/**
 * Control: Exposure Flags Effective
 */
const controlExposureEffective: DebugControl = {
  id: 'exposure-effective',
  title: '🏢🔍 Exposure Flags (Effective)',
  group: '🏢👤 Diagnostics',
  description: 'Get effective exposure flags and blocked fields (infers sellerUid from carId)',
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'Exposure Flags Effective', 'Missing carId', {});
    }
    
    // Try to get sellerUid from publicCars first
    let sellerUid: string | null = null;
    
    try {
      const publicRef = doc(db, 'publicCars', ctx.carId);
      const publicSnap = await getDoc(publicRef);
      
      if (publicSnap.exists()) {
        const publicData = publicSnap.data();
        sellerUid = publicData.yardUid || publicData.sellerUid || null;
      }
    } catch (error: any) {
      // Fall through to try MASTER
    }
    
    // If not found in publicCars, try MASTER via yardUid
    if (!sellerUid && ctx.yardUid) {
      sellerUid = ctx.yardUid;
    }
    
    if (!sellerUid) {
      return createResult(false, 'FAIL', 'Exposure Flags Effective', 'Could not infer sellerUid from carId. Try selecting a yard first.', {});
    }
    
    return callCallable('adminDebugExposureEffective', { sellerUid }, ctx);
  },
};

/**
 * Control: Public Eligibility Summary
 */
const controlPublicEligibility: DebugControl = {
  id: 'public-ui-eligibility',
  title: '👁️🌍 Public UI Eligibility',
  group: '👁️ UI Sanity',
  description: 'Check if car is eligible for public display and which fields are visible',
  requires: {
    car: true,
  },
  run: async (ctx) => {
    if (!ctx.carId) {
      return createResult(false, 'FAIL', 'Public Eligibility Summary', 'Missing carId', {});
    }
    return callCallable('adminDebugPublicEligibility', { carId: ctx.carId }, ctx);
  },
};

/**
 * All controls registry
 */
export const DEBUG_CONTROLS: DebugControl[] = [
  controlMasterCarState,
  controlPublicCarState,
  controlMasterPublicDiff,
  controlYardPublishedCounts,
  controlReprojectCar,
  controlReprojectYard,
  controlPublicListingQuery,
  controlDetectOldDocs,
  controlWritePermissionProbe,
  controlMasterUndefinedScan,
  controlPublishSignalScan,
  controlFunctionsLatency,
  controlRepairMissingFields,
  controlRepairSelectedCar,
  controlSellerExposureDiagnosis,
  controlPublicCarExists,
  controlWhyCarNotPublic,
  controlPublicProjectionPreview,
  controlSellerSnapshotRaw,
  controlExposureEffective,
  controlPublicEligibility,
];

/**
 * Get controls by group
 */
export function getControlsByGroup(): Record<string, DebugControl[]> {
  const grouped: Record<string, DebugControl[]> = {};
  DEBUG_CONTROLS.forEach(control => {
    if (!grouped[control.group]) {
      grouped[control.group] = [];
    }
    grouped[control.group].push(control);
  });
  return grouped;
}

/**
 * Run a single control
 */
export async function runControl(controlId: string, ctx: DebugContext): Promise<DebugResult> {
  const control = DEBUG_CONTROLS.find(c => c.id === controlId);
  if (!control) {
    return createResult(false, 'FAIL', 'Unknown Control', `Control ${controlId} not found`, {});
  }

  // Check requirements using new helper (will check both new and legacy formats)
  const disabledReason = getControlDisabledReason(control, ctx);
  if (disabledReason) {
    // Don't return FAIL - let UI handle disable state
    // This prevents confusing "Missing carId" results when UI should just disable
    return createResult(false, 'FAIL', control.title, disabledReason, {});
  }

  return control.run(ctx);
}

/**
 * Run multiple controls sequentially
 */
export async function runMany(controlIds: string[], ctx: DebugContext): Promise<{
  results: DebugResult[];
  summary: {
    total: number;
    ok: number;
    warn: number;
    fail: number;
  };
}> {
  const results: DebugResult[] = [];

  for (const controlId of controlIds) {
    const result = await runControl(controlId, ctx);
    results.push(result);
  }

  const summary = {
    total: results.length,
    ok: results.filter(r => r.level === 'OK').length,
    warn: results.filter(r => r.level === 'WARN').length,
    fail: results.filter(r => r.level === 'FAIL').length,
  };

  return { results, summary };
}

/**
 * Run a predefined bundle for publish pipeline (requires yardUid + carId)
 */
export async function runPublishBundle(ctx: DebugContext): Promise<{
  results: DebugResult[];
  summary: {
    total: number;
    ok: number;
    warn: number;
    fail: number;
  };
}> {
  // Ensure ctx has required values (explicit, no defaults)
  if (!ctx.yardUid || !ctx.carId) {
    throw new Error('runPublishBundle requires yardUid and carId in ctx');
  }

  const bundleIds = [
    'master-car-state',
    'public-car-state',
    'master-public-diff',
    'public-listing-query',
    'write-permission-probe',
  ];

  return runMany(bundleIds, ctx);
}

/**
 * Run a predefined bundle for yard-level checks (requires yardUid only, no carId)
 */
export async function runYardBundle(ctx: DebugContext): Promise<{
  results: DebugResult[];
  summary: {
    total: number;
    ok: number;
    warn: number;
    fail: number;
  };
}> {
  // Ensure ctx has required values (explicit, no defaults)
  if (!ctx.yardUid) {
    throw new Error('runYardBundle requires yardUid in ctx');
  }

  const bundleIds = [
    'yard-published-counts',
    'detect-old-docs',
    'write-permission-probe',
    'master-undefined-scan', // MASTER health scan (yard-level, no carId needed)
  ];

  return runMany(bundleIds, ctx);
}
