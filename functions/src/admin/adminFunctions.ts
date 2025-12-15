import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

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
 * amIAdmin: Returns whether the caller is an admin
 */
export const amIAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const adminStatus = await isAdmin(callerUid);
  
  return { isAdmin: adminStatus };
});

/**
 * setAdminCustomClaim: Set admin custom claim for a user
 * 
 * SECURITY: Restricted to super-admin emails defined in environment variable SUPER_ADMIN_EMAILS
 * (comma-separated list, e.g., "admin@example.com,super@example.com")
 * 
 * This function sets the custom claim { admin: true } which is required for:
 * - Storage rules (rentalCompanies/** write/delete)
 * - Any other rules that check request.auth.token.admin
 * 
 * Usage (from client or Firebase Console):
 *   const setAdminClaim = httpsCallable(functions, 'setAdminCustomClaim');
 *   await setAdminClaim({ targetUid: 'user-uid-here' });
 */
export const setAdminCustomClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerEmail = context.auth.token.email as string | undefined;
  
  // Check if caller is super-admin via email whitelist
  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  
  if (!callerEmail || !superAdminEmails.includes(callerEmail.toLowerCase())) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only super-admins can set custom claims. Contact system administrator."
    );
  }

  const { targetUid } = data;
  if (!targetUid || typeof targetUid !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "targetUid (string) is required"
    );
  }

  try {
    // Verify target user exists
    const targetUser = await admin.auth().getUser(targetUid);
    
    // Set custom claim { admin: true }
    await admin.auth().setCustomUserClaims(targetUid, {
      admin: true,
    });

    // Force token refresh by invalidating existing tokens (optional but recommended)
    // User will need to sign out and sign in again for the claim to take effect
    
    return {
      success: true,
      message: `Admin custom claim set for user ${targetUid} (${targetUser.email || "no email"})`,
      note: "User must sign out and sign in again for the claim to take effect",
    };
  } catch (error: any) {
    console.error("Error setting admin custom claim:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      `Failed to set admin custom claim: ${error.message}`,
      error
    );
  }
});

/**
 * Helper to mirror yard status to user-scoped profile
 */
async function mirrorYardStatusToProfile(
  yardUid: string,
  status: string,
  reason: string | null
): Promise<void> {
  const profileRef = db
    .collection("users")
    .doc(yardUid)
    .collection("yardProfile")
    .doc("profile");

  await profileRef.set(
    {
      yardStatus: status,
      yardStatusReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * adminListYards: List yards with filtering and pagination
 */
export const adminListYards = functions.https.onCall(async (data, context) => {
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
      "Only admins can list yards"
    );
  }

  try {
      const { filterStatus, searchQuery, pageToken, limit = 50 } = data;

    let query: admin.firestore.Query = db.collection("yards");

    // Filter by status
    if (filterStatus && filterStatus !== "ALL") {
      query = query.where("status", "==", filterStatus);
    }

    // Apply search (prefix search on displayName, phone, city)
    if (searchQuery && typeof searchQuery === "string" && searchQuery.trim().length > 0) {
      const searchLower = searchQuery.trim().toLowerCase();
      // Firestore doesn't support OR queries easily, so we'll do multiple queries
      // For now, search by displayName prefix (most common case)
      query = query
        .where("displayName", ">=", searchLower)
        .where("displayName", "<=", searchLower + "\uf8ff");
    }

    // Apply pagination
    if (pageToken) {
      const pageTokenDoc = await db.collection("yards").doc(pageToken).get();
      if (pageTokenDoc.exists) {
        query = query.startAfter(pageTokenDoc);
      }
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      const importProfile = data.importProfile as any;
      return {
        yardUid: doc.id,
        displayName: data.displayName || "",
        city: data.city || "",
        phone: data.phone || "",
        status: data.status || "PENDING",
        hasImportProfile: !!(importProfile?.importerId),
      };
    });

    return {
      items,
      nextPageToken: items.length === limit && items.length > 0 
        ? items[items.length - 1].yardUid 
        : null,
    };
  } catch (error: any) {
    console.error("Error listing yards:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to list yards",
      error
    );
  }
});

/**
 * adminGetYardDetails: Get yard details (core + profile subset)
 */
export const adminGetYardDetails = functions.https.onCall(
  async (data, context) => {
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
        "Only admins can view yard details"
      );
    }

    const { yardUid } = data;
    if (!yardUid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid is required"
      );
    }

    try {
      // Get yard from global registry
      const yardDoc = await db.collection("yards").doc(yardUid).get();
      if (!yardDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Yard not found"
        );
      }

      const yardData = yardDoc.data()!;
      const importProfile = yardData.importProfile as any;

      // Get profile subset from user-scoped collection
      const profileDoc = await db
        .collection("users")
        .doc(yardUid)
        .collection("yardProfile")
        .doc("profile")
        .get();

      let profileData: any = null;
      if (profileDoc.exists) {
        const profile = profileDoc.data()!;
        profileData = {
          legalName: profile.legalName || null,
          companyId: profile.registrationNumber || null,
          addressCity: profile.city || null,
          addressStreet: profile.street || null,
          usageValidUntil: profile.usageValidUntil
            ? new Date(profile.usageValidUntil).toISOString().split("T")[0]
            : null,
        };
      }

      return {
        yard: {
          yardUid,
          displayName: yardData.displayName || "",
          phone: yardData.phone || "",
          city: yardData.city || "",
          status: yardData.status || "PENDING",
          statusReason: yardData.statusReason || null,
          importerId: importProfile?.importerId || null,
          importerVersion: importProfile?.importerVersion || null,
        },
        profile: profileData,
      };
    } catch (error: any) {
      console.error("Error getting yard details:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get yard details",
        error
      );
    }
  }
);

/**
 * adminSetYardStatus: Set yard status and mirror to user profile
 */
export const adminSetYardStatus = functions.https.onCall(
  async (data, context) => {
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
        "Only admins can set yard status"
      );
    }

    const { yardUid, status, reason } = data;

    if (!yardUid || !status) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid and status are required"
      );
    }

    const validStatuses = ["PENDING", "APPROVED", "REJECTED", "NEEDS_INFO"];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `status must be one of: ${validStatuses.join(", ")}`
      );
    }

    try {
      const yardRef = db.collection("yards").doc(yardUid);
      const yardDoc = await yardRef.get();

      if (!yardDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Yard not found"
        );
      }

      const now = admin.firestore.Timestamp.now();
      const updateData: any = {
        status,
        statusReason: reason || null,
        updatedAt: now,
      };

      // If approving, set verified fields
      if (status === "APPROVED") {
        updateData.verifiedAt = now;
        updateData.verifiedBy = callerUid;
      }

      await yardRef.update(updateData);

      // Mirror to user-scoped profile
      await mirrorYardStatusToProfile(yardUid, status, reason || null);

      const updatedYard = {
        yardUid,
        ...(await yardRef.get()).data(),
      };

      return {
        success: true,
        yard: updatedYard,
      };
    } catch (error: any) {
      console.error("Error setting yard status:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to set yard status",
        error
      );
    }
  }
);

/**
 * adminAssignYardImporter: Assign import profile to a yard
 */
export const adminAssignYardImporter = functions.https.onCall(
  async (data, context) => {
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
        "Only admins can assign importers"
      );
    }

    const { yardUid, importerId, importerVersion, config } = data;

    if (!yardUid || !importerId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "yardUid and importerId are required"
      );
    }

    try {
      const yardRef = db.collection("yards").doc(yardUid);
      const yardDoc = await yardRef.get();

      if (!yardDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Yard not found"
        );
      }

      const importProfile = {
        importerId,
        importerVersion: importerVersion || 1,
        config: config || {},
        assignedAt: admin.firestore.Timestamp.now(),
        assignedBy: callerUid,
      };

      await yardRef.update({
        importProfile,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mirror to user-scoped profile
      const profileRef = db
        .collection("users")
        .doc(yardUid)
        .collection("yardProfile")
        .doc("profile");

      await profileRef.set(
        {
          import: {
            importerId,
            importerVersion: importerVersion || 1,
            config: config || {},
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        success: true,
        message: "Importer assigned successfully",
      };
    } catch (error: any) {
      console.error("Error assigning importer:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to assign importer",
        error
      );
    }
  }
);

/**
 * trackCarView: Track a car view event (callable)
 */
export const trackCarView = functions.https.onCall(async (data, context) => {
  // No auth required for tracking (anonymous tracking allowed)
  const { yardUid, carId, sessionId, viewerUid } = data;

  if (!yardUid || !carId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "yardUid and carId are required"
    );
  }

  try {
    const now = admin.firestore.Timestamp.now();
    const eventRef = db.collection("analyticsEvents").doc();

    const eventData: any = {
      type: "CAR_VIEW",
      createdAt: now,
      yardUid,
      carId,
      sessionId: sessionId || null,
      viewerUid: viewerUid || context.auth?.uid || null,
      device: {
        platform: "ANDROID",
        appVersion: null, // Can be passed from client if available
      },
    };

    await eventRef.set(eventData);

    // Update aggregated counters (fire-and-forget, errors are logged but don't fail the call)
    updateAggregatedCounters(yardUid, now).catch((err) => {
      console.error("Error updating aggregated counters:", err);
    });

    return { success: true, eventId: eventRef.id };
  } catch (error: any) {
    console.error("Error tracking car view:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to track car view",
      error
    );
  }
});

/**
 * Helper to update aggregated counters
 */
async function updateAggregatedCounters(
  yardUid: string,
  eventTime: admin.firestore.Timestamp
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const today = new Date(eventTime.toMillis());
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0].replace(/-/g, ""); // yyyyMMdd

  // Update system aggregate
  const systemAggRef = db.collection("analyticsAgg").doc("system");
  await systemAggRef.set(
    {
      carViewsTotal: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
    },
    { merge: true }
  );

  // Update yard aggregate
  const yardAggRef = db
    .collection("analyticsAgg")
    .doc("yards")
    .collection(yardUid)
    .doc("summary");
  await yardAggRef.set(
    {
      carViewsTotal: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
    },
    { merge: true }
  );

  // Update daily bucket for system
  const systemDailyRef = db
    .collection("analyticsDaily")
    .doc("system")
    .collection(todayStr)
    .doc(todayStr);
  await systemDailyRef.set(
    {
      carViews: admin.firestore.FieldValue.increment(1),
      date: todayStr,
    },
    { merge: true }
  );

  // Update daily bucket for yard
  const yardDailyRef = db
    .collection("analyticsDaily")
    .doc("yards")
    .collection(yardUid)
    .doc(todayStr);
  await yardDailyRef.set(
    {
      carViews: admin.firestore.FieldValue.increment(1),
      date: todayStr,
    },
    { merge: true }
  );
}

/**
 * adminGetDashboard: Get dashboard data (aggregated stats)
 */
export const adminGetDashboard = functions.https.onCall(
  async (data, context) => {
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
        "Only admins can access dashboard"
      );
    }

    try {
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Get system aggregate
      const systemAggDoc = await db
        .collection("analyticsAgg")
        .doc("system")
        .get();
      const systemAgg = systemAggDoc.data() || {};

      // Calculate last 7d and 30d from daily buckets
      const system7d = await calculatePeriodViews("system", sevenDaysAgo, now);
      const system30d = await calculatePeriodViews("system", thirtyDaysAgo, now);

      // Get yard counts
      const pendingYards = await db
        .collection("yards")
        .where("status", "==", "PENDING")
        .count()
        .get();
      const approvedYards = await db
        .collection("yards")
        .where("status", "==", "APPROVED")
        .count()
        .get();
      const needsInfoYards = await db
        .collection("yards")
        .where("status", "==", "NEEDS_INFO")
        .count()
        .get();
      const rejectedYards = await db
        .collection("yards")
        .where("status", "==", "REJECTED")
        .count()
        .get();

      // Get top yards last 7d
      const topYards = await getTopYardsLast7d();

      // Get top cars last 7d
      const topCars = await getTopCarsLast7d();

      return {
        yards: {
          pending: pendingYards.data().count,
          approved: approvedYards.data().count,
          needsInfo: needsInfoYards.data().count,
          rejected: rejectedYards.data().count,
        },
        imports: {
          carsImportedLast7d: 0, // TODO: Implement import tracking
          carsImportedLast30d: 0, // TODO: Implement import tracking
        },
        views: {
          totalCarViews: systemAgg.carViewsTotal || 0,
          carViewsLast7d: system7d,
          carViewsLast30d: system30d,
        },
        topYardsLast7d: topYards,
        topCarsLast7d: topCars,
      };
    } catch (error: any) {
      console.error("Error getting dashboard:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to get dashboard",
        error
      );
    }
  }
);

/**
 * Helper to calculate views for a period from daily buckets
 */
async function calculatePeriodViews(
  pathPrefix: string,
  startMs: number,
  endMs: number
): Promise<number> {
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  let total = 0;

  // Iterate through each day in the period
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split("T")[0].replace(/-/g, "");
    try {
      const dailyDoc = await db
        .collection("analyticsDaily")
        .doc(pathPrefix)
        .collection(dateStr)
        .doc(dateStr)
        .get();

      if (dailyDoc.exists) {
        const data = dailyDoc.data();
        total += data?.carViews || 0;
      }
    } catch (err) {
      // Skip missing days
    }

    current.setDate(current.getDate() + 1);
  }

  return total;
}

/**
 * Helper to get top yards by views in last 7 days
 */
async function getTopYardsLast7d(): Promise<any[]> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const yardViewsMap = new Map<string, number>();

  // Get all yard UIDs from yards collection
  const yardsSnapshot = await db.collection("yards").get();
  const yardUids = yardsSnapshot.docs.map((doc) => doc.id);

  // Count views for each yard in last 7 days
  for (const yardUid of yardUids) {
    const views = await calculatePeriodViews(
      `yards/${yardUid}`,
      sevenDaysAgo,
      Date.now()
    );
    if (views > 0) {
      yardViewsMap.set(yardUid, views);
    }
  }

  // Sort and get top 10
  const sorted = Array.from(yardViewsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Enrich with yard display names
  const result = await Promise.all(
    sorted.map(async ([yardUid, views]) => {
      const yardDoc = await db.collection("yards").doc(yardUid).get();
      const yardData = yardDoc.data();
      return {
        yardUid,
        displayName: yardData?.displayName || "Unknown",
        views,
      };
    })
  );

  return result;
}

/**
 * Helper to get top cars by views in last 7 days
 */
async function getTopCarsLast7d(): Promise<any[]> {
  const sevenDaysAgo = admin.firestore.Timestamp.fromMillis(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  // Query events from last 7 days
  const eventsSnapshot = await db
    .collection("analyticsEvents")
    .where("type", "==", "CAR_VIEW")
    .where("createdAt", ">=", sevenDaysAgo)
    .get();

  // Count views per car
  const carViewsMap = new Map<string, number>();
  eventsSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const key = `${data.yardUid}/${data.carId}`;
    carViewsMap.set(key, (carViewsMap.get(key) || 0) + 1);
  });

  // Sort and get top 10
  const sorted = Array.from(carViewsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Enrich with yard names
  const result = await Promise.all(
    sorted.map(async ([key, views]) => {
      const [yardUid, carId] = key.split("/");
      const yardDoc = await db.collection("yards").doc(yardUid).get();
      const yardData = yardDoc.data();
      return {
        yardUid,
        yardName: yardData?.displayName || "Unknown",
        carId,
        views,
      };
    })
  );
  
  return result;

  return sorted;
}

