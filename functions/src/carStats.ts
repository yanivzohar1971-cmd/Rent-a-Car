import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();

/**
 * Generate a server-side anti-abuse token
 * Hashes IP + User-Agent + carId + dayBucket to prevent duplicate counting
 */
function generateAntiAbuseToken(
  ip: string | undefined,
  userAgent: string | undefined,
  carId: string
): string {
  const dayBucket = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const input = `${ip || "unknown"}|${userAgent || "unknown"}|${carId}|${dayBucket}`;
  return crypto.createHash("sha256").update(input).digest("hex").substring(0, 16);
}

/**
 * Track a car view event (PUBLIC - no auth required)
 * 
 * Implements:
 * 1. Server-side anti-abuse (IP + User-Agent + carId + dayBucket hash)
 * 2. Updates carViewStats/{carId} aggregate
 * 3. Updates publicCars/{carId}.viewsCount
 * 
 * Input:
 * - carId: string
 * 
 * Returns: { success: true }
 */
export const logCarView = functions.https.onCall(async (data, context) => {
  const { carId } = data;

  // Validate input
  if (!carId || typeof carId !== "string" || carId.trim() === "") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "carId is required and must be a non-empty string"
    );
  }

  try {
    // Verify car exists in publicCars (only published cars are in publicCars)
    const publicCarRef = db.collection("publicCars").doc(carId);
    const publicCarDoc = await publicCarRef.get();

    if (!publicCarDoc.exists) {
      console.log(`[logCarView] Car ${carId} not found in publicCars, skipping view tracking`);
      return { success: true, skipped: true, reason: "car_not_found" };
    }

    // Generate anti-abuse token
    const req = context.rawRequest;
    const ip = req?.ip || req?.connection?.remoteAddress || undefined;
    const userAgent = req?.headers?.["user-agent"] || undefined;
    const abuseToken = generateAntiAbuseToken(ip, userAgent, carId);

    const statsRef = db.collection("carViewStats").doc(carId);
    const today = new Date().toISOString().split("T")[0];

    // Use transaction to safely check token cache and increment viewsCount
    await db.runTransaction(async (transaction) => {
      const statsSnapshot = await transaction.get(statsRef);
      const currentStats = statsSnapshot.data();
      const currentCount = typeof currentStats?.viewsCount === "number" ? currentStats.viewsCount : 0;

      // Check token cache (bounded per-day cache)
      const tokenDays: Record<string, string> = currentStats?.tokenDays || {};
      
      // If this token was already counted today, skip increment
      if (tokenDays[abuseToken] === today) {
        console.log(`[logCarView] Duplicate view token for car ${carId}, skipping`);
        return; // Early return from transaction (no increment)
      }

      // Prune tokenDays: remove entries not from today, then limit to max 200 keys
      const prunedTokenDays: Record<string, string> = {};
      for (const [token, day] of Object.entries(tokenDays)) {
        if (day === today) {
          prunedTokenDays[token] = day;
        }
      }
      
      // Add current token
      prunedTokenDays[abuseToken] = today;
      
      // If still over limit, remove arbitrary excess (keep most recent by keeping all from today)
      // Since we only keep today's tokens, and we just added one, we should be fine
      // But if somehow we have > 200 tokens in one day, remove oldest (arbitrary selection)
      const tokenKeys = Object.keys(prunedTokenDays);
      if (tokenKeys.length > 200) {
        // Remove excess tokens (keep first 200)
        const excessKeys = tokenKeys.slice(200);
        for (const key of excessKeys) {
          delete prunedTokenDays[key];
        }
      }

      const newViewsCount = currentCount + 1;
      const now = admin.firestore.Timestamp.now();

      // Update carViewStats with new count and token cache
      transaction.set(
        statsRef,
        {
          viewsCount: newViewsCount,
          tokenDays: prunedTokenDays,
          updatedAt: now,
        },
        { merge: true }
      );

      // Update publicCars.viewsCount
      transaction.update(publicCarRef, {
        viewsCount: newViewsCount,
      });
    });

    console.log(`[logCarView] Tracked view for car ${carId} (token: ${abuseToken.substring(0, 8)}...)`);

    return { success: true };
  } catch (error: any) {
    console.error(`[logCarView] Error tracking view for car ${carId}:`, error);
    // Don't throw - we don't want to break the UI if tracking fails
    // Return success anyway, but log the error
    return { success: true, error: "tracking_failed" };
  }
});

/**
 * Legacy trackCarView function (kept for backward compatibility)
 * @deprecated Use logCarView instead
 */
export const trackCarView = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to track views"
    );
  }

  const userUid = context.auth.uid;
  const { yardUid, carId } = data;

  // Validate input
  if (!yardUid || typeof yardUid !== "string" || yardUid.trim() === "") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "yardUid is required and must be a non-empty string"
    );
  }

  if (!carId || typeof carId !== "string" || carId.trim() === "") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "carId is required and must be a non-empty string"
    );
  }

  try {
    // Fetch car document
    const carRef = db.collection("users").doc(yardUid).collection("carSales").doc(carId);
    const carDoc = await carRef.get();

    if (!carDoc.exists) {
      console.log(`Car ${carId} not found for yard ${yardUid}, skipping view tracking`);
      return { success: true, skipped: true, reason: "car_not_found" };
    }

    const carData = carDoc.data();
    const publicationStatus = carData?.publicationStatus || "DRAFT";

    // Only track views for PUBLISHED cars
    if (publicationStatus !== "PUBLISHED") {
      console.log(
        `Car ${carId} is not PUBLISHED (status: ${publicationStatus}), skipping view tracking`
      );
      return { success: true, skipped: true, reason: "not_published" };
    }

    // Increment viewsCount and update lastViewedAt
    await carRef.set(
      {
        viewsCount: admin.firestore.FieldValue.increment(1),
        lastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`Tracked view for car ${carId} by user ${userUid} (yard: ${yardUid})`);

    return { success: true };
  } catch (error: any) {
    console.error(`Error tracking view for car ${carId}:`, error);
    // Don't throw - we don't want to break the UI if tracking fails
    // Return success anyway, but log the error
    return { success: true, error: "tracking_failed" };
  }
});

