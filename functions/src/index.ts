import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp({
  storageBucket: "carexpert-94faa.firebasestorage.app",
});

// Note: Removed top-level storage bucket access to avoid deployment timeout
// The bucket will be accessed lazily when functions are called

const db = admin.firestore();

/**
 * Helper function to check if the caller is an admin.
 * Reads from /config/admins document with uids array.
 */
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
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
 * Callable function to set a user's primary role.
 * Requires admin privileges.
 */
export const setUserRole = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const { targetUid, primaryRole, reason } = data;

  // Validate input
  if (!targetUid || !primaryRole) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "targetUid and primaryRole are required"
    );
  }

  // Validate primaryRole enum
  const validRoles = ["PRIVATE_USER", "AGENT", "YARD", "ADMIN"];
  if (!validRoles.includes(primaryRole)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "primaryRole must be one of: PRIVATE_USER, AGENT, YARD, ADMIN"
    );
  }

  // Check if caller is admin
  const callerIsAdmin = await isAdmin(callerUid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can set user roles"
    );
  }

  try {
    const userRef = db.collection("users").doc(targetUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "User not found"
      );
    }

    const now = admin.firestore.Timestamp.now();
    const updateData: any = {
      primaryRole: primaryRole,
      roleStatus: "APPROVED",
      roleUpdatedAt: now,
      roleUpdatedByUid: callerUid,
      roleUpdateReason: reason || null,
      // Clear requestedRole if it was set
      requestedRole: admin.firestore.FieldValue.delete(),
    };

    // Update legacy fields for backward compatibility
    if (primaryRole === "AGENT") {
      updateData.isAgent = true;
      updateData.isYard = false;
      updateData.canBuy = true; // All users can buy
      updateData.canSell = true; // All users can sell
      updateData.isPrivateUser = false;
      updateData.role = "AGENT";
      updateData.status = "ACTIVE";
    } else if (primaryRole === "YARD") {
      updateData.isAgent = false;
      updateData.isYard = true;
      updateData.canBuy = true; // All users can buy
      updateData.canSell = true; // All users can sell
      updateData.isPrivateUser = false;
      updateData.role = "USER";
      updateData.status = "ACTIVE";
    } else if (primaryRole === "PRIVATE_USER") {
      updateData.isAgent = false;
      updateData.isYard = false;
      updateData.canBuy = true; // All users can buy
      updateData.canSell = true; // All users can sell
      updateData.isPrivateUser = true;
      updateData.role = "USER";
      updateData.status = "ACTIVE";
    } else if (primaryRole === "ADMIN") {
      updateData.isAgent = false;
      updateData.isYard = false;
      updateData.canBuy = true;
      updateData.canSell = true;
      updateData.isPrivateUser = false;
      updateData.role = "ADMIN";
      updateData.status = "ACTIVE";
    }

    await userRef.update(updateData);

    return {
      success: true,
      message: `User role set to ${primaryRole}`,
    };
  } catch (error: any) {
    console.error("Error setting user role:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to set user role",
      error
    );
  }
});

/**
 * Callable function to resolve a role request (approve or reject).
 * Requires admin privileges.
 */
export const resolveRoleRequest = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const { targetUid, action, reason } = data;

  // Validate input
  if (!targetUid || !action) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "targetUid and action are required"
    );
  }

  if (action !== "APPROVE" && action !== "REJECT") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "action must be APPROVE or REJECT"
    );
  }

  // Check if caller is admin
  const callerIsAdmin = await isAdmin(callerUid);
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can resolve role requests"
    );
  }

  try {
    const userRef = db.collection("users").doc(targetUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "User not found"
      );
    }

    const userData = userDoc.data();
    const requestedRole = userData?.requestedRole;

    if (!requestedRole) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "User has no pending role request"
      );
    }

    const now = admin.firestore.Timestamp.now();
    const updateData: any = {
      roleUpdatedAt: now,
      roleUpdatedByUid: callerUid,
      roleUpdateReason: reason || null,
    };

    if (action === "APPROVE") {
      // Approve: set primaryRole to requestedRole and clear requestedRole
      updateData.primaryRole = requestedRole;
      updateData.roleStatus = "APPROVED";
      updateData.requestedRole = admin.firestore.FieldValue.delete();
      updateData.status = "ACTIVE";

      // Update legacy fields
      if (requestedRole === "AGENT") {
        updateData.isAgent = true;
        updateData.isYard = false;
        updateData.canBuy = true; // All users can buy
        updateData.canSell = true; // All users can sell
        updateData.isPrivateUser = false;
        updateData.role = "AGENT";
      } else if (requestedRole === "YARD") {
        updateData.isAgent = false;
        updateData.isYard = true;
        updateData.canBuy = true; // All users can buy
        updateData.canSell = true; // All users can sell
        updateData.isPrivateUser = false;
        updateData.role = "USER";
      }
    } else {
      // Reject: keep current primaryRole, clear requestedRole, set status to REJECTED
      updateData.roleStatus = "REJECTED";
      updateData.requestedRole = admin.firestore.FieldValue.delete();
    }

    await userRef.update(updateData);

    return {
      success: true,
      message: `Role request ${action.toLowerCase()}d`,
    };
  } catch (error: any) {
    console.error("Error resolving role request:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to resolve role request",
      error
    );
  }
});

// Export admin functions
export {
  amIAdmin,
  setAdminCustomClaim,
  adminListYards,
  adminGetYardDetails,
  adminSetYardStatus,
  adminAssignYardImporter,
  adminGetDashboard,
} from "./admin/adminFunctions";

// Yard import functions (callables + Storage trigger)
export {
  yardImportCreateJob,
  yardImportParseExcel,
  yardImportCommitJob,
} from "./yardImport";

// Export car alert triggers
export { onCarSaleChange } from "./carAlertTriggers";

// Export public car projection sync triggers
export { 
  onCarSaleChangePublicProjection,
  onYardProfileChangeUpdatePublicCars,
  onAdminSellerExposureChangeUpdatePublicCars,
} from "./cars/publicCarSyncTrigger";

// Export public car projection functions
export { 
  adminDebugPlanRebuildPublicCarsForYard,
  adminReprojectPublicCars,
  rebuildPublicCarsForYard,
  upsertPublicCarForSingleCar,
  updateHomepageFlagOnly,
  backfillPublicCars,
  backfillPublicCarById,
  bulkRepairPublicCarSnapshots,
  repairPublicCarSnapshotsById,
  diagnoseYardPublicCars,
} from "./cars/publicCarProjectionFunctions";

// Export public car snapshots sync
export {
  onPublicCarWriteSyncSnapshots,
  backfillPublicCarSnapshots,
} from "./cars/publicCarSnapshotsSync";

// Export mark car as sold function
export { markYardCarSold } from "./cars/markYardCarSold";

// Export yard demand function
export { getYardDemand } from "./yardDemand";

// Export car stats functions
export { logCarView, trackCarView } from "./carStats";

// Export promotion functions
export { applyPromotionToYardCar } from "./promotions/applyPromotionToYardCar";
export { createPromotionOrderDraft, markPromotionOrderAsPaid } from "./promotions/promotionOrders";

// Export SEO function (lazy wrapper)
export const seo = functions.https.onRequest(async (req, res) => {
  const mod = await import("./seo");
  return mod.seo(req, res);
});

// Export sitemap generation functions (lazy wrappers)
export const scheduledGenerateCarsSitemap = functions.pubsub
  .schedule("every 6 hours")
  .timeZone("Asia/Jerusalem")
  .onRun(async (context) => {
    const mod = await import("./sitemaps/generateCarsSitemap");
    if (typeof mod.generateCarsSitemap === "function") {
      return mod.generateCarsSitemap();
    }
    return mod.scheduledGenerateCarsSitemap(context);
  });

export const serveCarsSitemap = functions.https.onRequest(async (req, res) => {
  const mod = await import("./sitemaps/generateCarsSitemap");
  return mod.serveCarsSitemap(req, res);
});

export const runCarsSitemapNow = functions.https.onRequest(async (req, res) => {
  const mod = await import("./sitemaps/generateCarsSitemap");
  return mod.runCarsSitemapNow(req, res);
});

// Export diagnostic probe function (lazy wrapper)
export const probePublicCarsNow = functions.https.onRequest(async (req, res) => {
  const mod = await import("./sitemaps/probePublicCars");
  return mod.probePublicCarsNow(req, res);
});

// Export partner click tracking
export { trackPartnerClick } from "./ads/partnerClick";

// Ministry of Transport (gov.il) sync - callables + trigger
export { syncVehicleByPlate } from "./govSync/syncVehicleByPlate";
export { startGovSyncJob, onGovSyncJobCreated } from "./govSync/startGovSyncJob";

// SEO Redirect Resolver (Phase 1: test endpoint /__seo_redirect_test__/** only)
export { seoRedirectResolver } from "./redirects/seoRedirectResolver";

// Export admin users index functions
export {
  onUserWriteUpdateAdminUsersIndex,
  backfillAdminUsersIndex,
} from "./admin/adminUsersIndex";

// Lazy-loaded AdminDebug functions (to reduce index.ts load time)
// All functions delegate to handler modules that load only when invoked
export const adminDebugPing = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugPing_impl(data, context);
});

export const adminDebugMasterCarState = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugMasterCarState_impl(data, context);
});

export const adminDebugPublicCarState = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugPublicCarState_impl(data, context);
});

export const adminDebugCheckCar = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugCheckCar_impl(data, context);
});

export const adminDebugReprojectCar = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugReprojectCar_impl(data, context);
});

export const adminDebugReprojectYard = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugReprojectYard_impl(data, context);
});

export const adminDebugYardPublishedCounts = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugYardPublishedCounts_impl(data, context);
});

export const adminDebugScanMasterHealth = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugScanMasterHealth_impl(data, context);
});

export const adminDebugScanPublishSignals = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugScanPublishSignals_impl(data, context);
});

export const adminDebugRepairMissingCarFields = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugRepairMissingCarFields_impl(data, context);
});

export const adminDebugRepairCarFields = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugRepairCarFields_impl(data, context);
});

export const adminDebugCustomerHealthCheck = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugCustomerHealthCheck_impl(data, context);
});

export const adminDebugRebuildAdminUsersIndex = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugRebuildAdminUsersIndex_impl(data, context);
});

export const adminDebugListYards = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugListYards_impl(data, context);
});

export const adminDebugListYardCars = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugListYardCars_impl(data, context);
});

export const adminDebugListPublicCars = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugPublicCarState_impl(data, context);
});

export const adminDebugSellerExposureDiagnosis = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugSellerExposureDiagnosis_impl(data, context);
});

export const adminDebugSearchYards = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebugSearch");
  return mod.adminDebugSearchYards_impl(data, context);
});

export const adminDebugSearchCars = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebugSearch");
  return mod.adminDebugSearchCars_impl(data, context);
});

export const adminDebugPublicCarExists = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugPublicCarExists_impl(data, context);
});

export const adminDebugWhyCarNotPublic = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugWhyCarNotPublic_impl(data, context);
});

export const adminDebugPublicProjectionPreview = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugPublicProjectionPreview_impl(data, context);
});

export const adminDebugSellerSnapshotRaw = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugSellerSnapshotRaw_impl(data, context);
});

export const adminDebugExposureEffective = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugExposureEffective_impl(data, context);
});

export const adminDebugPublicEligibility = functions.https.onCall(async (data, context) => {
  const mod = await import("./_handlers/adminDebug");
  return mod.adminDebugPublicEligibility_impl(data, context);
});

// Admin Debug: Seller Profile Resolver
export { adminDebugResolveSellerProfile } from "./admin/adminDebugSellerProfile";

export { adminDebugInspectPublicCar } from "./admin/adminDebugPublicCarInspect";
