import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Track a car view event
 * Increments viewsCount on the car document for PUBLISHED cars
 * 
 * Input:
 * - yardUid: string (owner of the car)
 * - carId: string
 * 
 * Returns: { success: true }
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

