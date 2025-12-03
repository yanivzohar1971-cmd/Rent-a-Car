import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * HTTP callable function to get aggregated demand stats for YARD users
 * Returns demand by manufacturer/model based on active saved searches
 */
export const getYardDemand = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;

  // Verify user is a YARD
  try {
    const userDoc = await db.collection("users").doc(callerUid).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("not-found", "User not found");
    }

    const userData = userDoc.data();
    const isYard = userData?.isYard || userData?.primaryRole === "YARD";

    if (!isYard) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only YARD users can access demand data"
      );
    }
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Error verifying user role",
      error
    );
  }

  try {
    // Query all active saved searches of type CAR_FOR_SALE
    const savedSearchesSnapshot = await db
      .collectionGroup("savedSearches")
      .where("type", "==", "CAR_FOR_SALE")
      .where("active", "==", true)
      .get();

    console.log(`Found ${savedSearchesSnapshot.size} active saved searches`);

    // Aggregate by manufacturer/model
    const demandMap = new Map<string, {
      manufacturerId?: string;
      manufacturer?: string;
      modelId?: string;
      model?: string;
      searchCount: number;
      minYearFrom?: number;
      maxYearTo?: number;
      minPriceFrom?: number;
      maxPriceTo?: number;
    }>();

    savedSearchesSnapshot.docs.forEach((doc) => {
      const searchData = doc.data();
      const filters = searchData.filters || {};

      // Extract manufacturer and model from filters
      const manufacturer = filters.manufacturer || "";
      const model = filters.model || "";

      // Skip if no manufacturer or model
      if (!manufacturer && !model) {
        return;
      }

      // Create a key for grouping (manufacturer + model)
      const key = `${manufacturer || "*"}_${model || "*"}`;

      if (!demandMap.has(key)) {
        demandMap.set(key, {
          manufacturer: manufacturer || undefined,
          model: model || undefined,
          searchCount: 0,
        });
      }

      const entry = demandMap.get(key)!;
      entry.searchCount++;

      // Aggregate year range
      if (filters.yearFrom !== undefined) {
        if (entry.minYearFrom === undefined || filters.yearFrom < entry.minYearFrom) {
          entry.minYearFrom = filters.yearFrom;
        }
      }
      if (filters.yearTo !== undefined) {
        if (entry.maxYearTo === undefined || filters.yearTo > entry.maxYearTo) {
          entry.maxYearTo = filters.yearTo;
        }
      }

      // Aggregate price range
      if (filters.priceFrom !== undefined) {
        if (entry.minPriceFrom === undefined || filters.priceFrom < entry.minPriceFrom) {
          entry.minPriceFrom = filters.priceFrom;
        }
      }
      if (filters.priceTo !== undefined) {
        if (entry.maxPriceTo === undefined || filters.priceTo > entry.maxPriceTo) {
          entry.maxPriceTo = filters.priceTo;
        }
      }
    });

    // Convert map to array and sort by searchCount descending
    const demandEntries = Array.from(demandMap.values())
      .filter((entry) => entry.searchCount > 0)
      .sort((a, b) => b.searchCount - a.searchCount);

    console.log(`Returning ${demandEntries.length} demand entries`);

    return {
      success: true,
      entries: demandEntries,
    };
  } catch (error: any) {
    console.error("Error getting yard demand:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to get demand data",
      error
    );
  }
});

