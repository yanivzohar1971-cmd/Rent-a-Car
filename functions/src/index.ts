import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

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
  adminListYards,
  adminGetYardDetails,
  adminSetYardStatus,
  adminAssignYardImporter,
  trackCarView,
  adminGetDashboard,
} from "./admin/adminFunctions";

