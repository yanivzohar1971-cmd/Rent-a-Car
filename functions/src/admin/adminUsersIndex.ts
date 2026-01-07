/**
 * Admin Users Index Maintenance
 * 
 * Maintains a canonical index collection adminUsersIndex/{uid} that provides
 * a single source of truth for user roles and primaryRole.
 * 
 * This solves the "role salad" problem where users appear in multiple tabs
 * in the Admin Customer Management page.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Admin Users Index Document Structure
 */
export interface AdminUsersIndexDoc {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  roles: string[]; // e.g. ["PRIVATE", "YARD"]
  primaryRole: "YARD" | "AGENT" | "PRIVATE";
  plan: string | null; // FREE, PLUS, PRO, etc.
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Compute primaryRole from roles array with priority: YARD > AGENT > PRIVATE
 */
function computePrimaryRole(roles: string[]): "YARD" | "AGENT" | "PRIVATE" {
  if (roles.includes("YARD")) {
    return "YARD";
  }
  if (roles.includes("AGENT")) {
    return "AGENT";
  }
  if (roles.includes("PRIVATE")) {
    return "PRIVATE";
  }
  // Default to PRIVATE if no roles match
  return "PRIVATE";
}

/**
 * Extract roles from user document
 * 
 * Rules:
 * - roles array contains ALL roles the user has (can be multiple)
 * - Check both primaryRole (canonical) and legacy flags (isYard, isAgent)
 * - If isYard === true -> add "YARD" to roles
 * - If isAgent === true -> add "AGENT" to roles
 * - If canSell === true OR no explicit role -> add "PRIVATE" to roles (default)
 * - If roles array is empty after processing, default to ["PRIVATE"]
 * 
 * Note: A user can have multiple roles (e.g., ["YARD", "PRIVATE"]),
 * but primaryRole is computed with priority YARD > AGENT > PRIVATE.
 */
function extractRolesFromUser(userData: any): string[] {
  const roles: string[] = [];
  
  // Check isYard flag (legacy or primaryRole)
  if (userData.isYard === true || userData.primaryRole === "YARD") {
    roles.push("YARD");
  }
  
  // Check isAgent flag (legacy or primaryRole)
  if (userData.isAgent === true || userData.primaryRole === "AGENT") {
    roles.push("AGENT");
  }
  
  // Check canSell or default to PRIVATE
  // If user has canSell === true OR has no explicit role, they are PRIVATE
  // Note: PRIVATE can coexist with YARD/AGENT (user might have multiple roles)
  if (userData.canSell === true || 
      (!userData.isYard && !userData.isAgent && !userData.primaryRole)) {
    roles.push("PRIVATE");
  }
  
  // If no roles found, default to PRIVATE
  if (roles.length === 0) {
    roles.push("PRIVATE");
  }
  
  // Remove duplicates and return
  return Array.from(new Set(roles));
}

/**
 * Upsert adminUsersIndex document for a user
 */
async function upsertAdminUsersIndex(uid: string, userData: any): Promise<void> {
  try {
    const roles = extractRolesFromUser(userData);
    const primaryRole = computePrimaryRole(roles);
    
    const indexDoc: Partial<AdminUsersIndexDoc> = {
      uid,
      email: userData.email || null,
      displayName: userData.displayName || userData.fullName || null,
      phone: userData.phone || null,
      roles,
      primaryRole,
      plan: userData.subscriptionPlan || null,
      updatedAt: admin.firestore.Timestamp.now(),
    };
    
    const indexRef = db.collection("adminUsersIndex").doc(uid);
    await indexRef.set(indexDoc, { merge: true });
    
    console.log(`[adminUsersIndex] Updated index for ${uid}: roles=${roles.join(",")}, primaryRole=${primaryRole}`);
  } catch (error) {
    console.error(`[adminUsersIndex] Error upserting index for ${uid}:`, error);
    throw error;
  }
}

/**
 * Firestore trigger: Maintain adminUsersIndex when users/{uid} changes
 */
export const onUserWriteUpdateAdminUsersIndex = functions.firestore
  .document("users/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    
    try {
      // If user deleted, remove from index (optional - you may want to keep for audit)
      if (!change.after.exists) {
        const indexRef = db.collection("adminUsersIndex").doc(uid);
        await indexRef.delete();
        console.log(`[adminUsersIndex] Removed index for deleted user ${uid}`);
        return;
      }
      
      const userData = change.after.data();
      if (!userData) {
        console.warn(`[adminUsersIndex] User ${uid} exists but has no data`);
        return;
      }
      
      await upsertAdminUsersIndex(uid, userData);
    } catch (error) {
      // Log but don't fail - user write should succeed even if index update fails
      console.error(`[adminUsersIndex] Error updating index for user ${uid}:`, error);
    }
  });

/**
 * Backfill adminUsersIndex for all users
 * 
 * Admin-only callable function that scans all users and creates/updates
 * adminUsersIndex documents.
 */
export const backfillAdminUsersIndex = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  
  // Check if caller is admin
  const isAdmin = await checkIsAdmin(callerUid);
  if (!isAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can backfill adminUsersIndex"
    );
  }

  console.log(`[backfillAdminUsersIndex] Starting backfill (called by admin ${callerUid})`);

  try {
    let processed = 0;
    let upserted = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const batchSize = 50; // Process in batches to avoid timeout

    // Get all users
    const usersSnapshot = await db.collection("users").get();
    
    // Process in batches
    for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
      const batch = usersSnapshot.docs.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userDoc) => {
        const uid = userDoc.id;
        const userData = userDoc.data();
        
        try {
          processed++;
          await upsertAdminUsersIndex(uid, userData);
          upserted++;
          
          if (upserted % batchSize === 0) {
            console.log(`[backfillAdminUsersIndex] Progress: ${processed} processed, ${upserted} upserted...`);
          }
        } catch (error: any) {
          errors++;
          const errorMsg = `User ${uid}: ${error instanceof Error ? error.message : String(error)}`;
          errorDetails.push(errorMsg);
          console.error(`[backfillAdminUsersIndex] Error processing user ${uid}:`, error);
        }
      });
      
      await Promise.all(batchPromises);
    }

    const result = {
      success: true,
      processed,
      upserted,
      errors,
      message: `Backfill completed: ${processed} users processed, ${upserted} upserted${errors > 0 ? `, ${errors} errors` : ''}`,
    };

    if (errors > 0 && errorDetails.length > 0) {
      // Limit error details to first 10 to avoid response size issues
      result.message += `. First errors: ${errorDetails.slice(0, 10).join('; ')}`;
    }

    console.log(`[backfillAdminUsersIndex] Completed backfill (called by admin ${callerUid}):`, result);
    return result;
  } catch (error: any) {
    console.error(`[backfillAdminUsersIndex] Error during backfill:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to backfill adminUsersIndex",
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Helper to check if user is admin
 */
async function checkIsAdmin(uid: string): Promise<boolean> {
  try {
    // Check custom claim first (preferred)
    const user = await admin.auth().getUser(uid);
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
    return uids.includes(uid);
  } catch (error) {
    console.error(`[checkIsAdmin] Error checking admin status for ${uid}:`, error);
    return false;
  }
}

