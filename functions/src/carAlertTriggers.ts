import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Check if a car matches a saved search's filters
 */
function carMatchesFilters(carData: any, filters: any): boolean {
  // Manufacturer filter (text match)
  if (filters.manufacturer) {
    const carBrand = (carData.brand || carData.brandText || "").toLowerCase();
    const filterBrand = filters.manufacturer.toLowerCase();
    if (!carBrand.includes(filterBrand)) {
      return false;
    }
  }

  // Model filter (text match)
  if (filters.model) {
    const carModel = (carData.model || carData.modelText || "").toLowerCase();
    const filterModel = filters.model.toLowerCase();
    if (!carModel.includes(filterModel)) {
      return false;
    }
  }

  // Year range
  const carYear = typeof carData.year === "number" ? carData.year : null;
  if (carYear !== null) {
    if (filters.yearFrom !== undefined && carYear < filters.yearFrom) {
      return false;
    }
    if (filters.yearTo !== undefined && carYear > filters.yearTo) {
      return false;
    }
    // Legacy minYear
    if (filters.minYear !== undefined && carYear < filters.minYear) {
      return false;
    }
  }

  // Price range
  const carPrice = carData.salePrice || carData.price || 0;
  if (filters.priceFrom !== undefined && carPrice < filters.priceFrom) {
    return false;
  }
  if (filters.priceTo !== undefined && carPrice > filters.priceTo) {
    return false;
  }
  // Legacy maxPrice
  if (filters.maxPrice !== undefined && carPrice > filters.maxPrice) {
    return false;
  }

  // KM range
  const carKm = carData.mileageKm || carData.km || 0;
  if (filters.kmFrom !== undefined && carKm < filters.kmFrom) {
    return false;
  }
  if (filters.kmTo !== undefined && carKm > filters.kmTo) {
    return false;
  }

  // Gearbox type
  if (filters.gearboxTypes && Array.isArray(filters.gearboxTypes) && filters.gearboxTypes.length > 0) {
    const carGearbox = carData.gearboxType || carData.gear;
    if (!carGearbox || !filters.gearboxTypes.includes(carGearbox)) {
      return false;
    }
  }

  // Fuel type
  if (filters.fuelTypes && Array.isArray(filters.fuelTypes) && filters.fuelTypes.length > 0) {
    const carFuel = carData.fuelType || carData.fuel;
    if (!carFuel || !filters.fuelTypes.includes(carFuel)) {
      return false;
    }
  }

  // Body type
  if (filters.bodyTypes && Array.isArray(filters.bodyTypes) && filters.bodyTypes.length > 0) {
    const carBody = carData.bodyType || carData.body;
    if (!carBody || !filters.bodyTypes.includes(carBody)) {
      return false;
    }
  }

  // City filter
  if (filters.cityId) {
    const carCityId = carData.cityId;
    if (!carCityId || carCityId !== filters.cityId) {
      return false;
    }
  }

  // Region filter
  if (filters.regionId) {
    const carRegionId = carData.regionId;
    if (!carRegionId || carRegionId !== filters.regionId) {
      return false;
    }
  }

  return true;
}

/**
 * Generate notification title and body for a car match
 */
function generateNotificationText(carData: any): { title: string; body: string } {
  const brand = carData.brand || carData.brandText || "";
  const model = carData.model || carData.modelText || "";
  const year = carData.year || "";
  const km = carData.mileageKm || carData.km || 0;
  const price = carData.salePrice || carData.price || 0;

  const title = "נוסף רכב חדש שמתאים לחיפוש שלך";
  const body = `${brand} ${model} ${year}, ${km.toLocaleString("he-IL")} ק״מ, ${price.toLocaleString("he-IL")} ₪`;

  return { title, body };
}

/**
 * Check if we've already notified this user about this car for this saved search
 */
async function hasAlreadyNotified(
  userUid: string,
  savedSearchId: string,
  carId: string
): Promise<boolean> {
  try {
    const notificationsRef = db
      .collection("users")
      .doc(userUid)
      .collection("notifications");
    const q = notificationsRef
      .where("savedSearchId", "==", savedSearchId)
      .where("carId", "==", carId)
      .limit(1);
    const snapshot = await q.get();
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking existing notifications:", error);
    // On error, assume not notified to avoid missing alerts
    return false;
  }
}

/**
 * Trigger: When a car sale is created or updated
 * Path: users/{yardUid}/carSales/{carId}
 */
export const onCarSaleChange = functions.firestore
  .document("users/{yardUid}/carSales/{carId}")
  .onWrite(async (change, context) => {
    const carId = context.params.carId;
    const yardUid = context.params.yardUid;
    const carData = change.after.exists ? change.after.data() : null;

    // Only process if car exists and is published
    if (!carData) {
      console.log(`Car ${carId} deleted or doesn't exist, skipping`);
      return;
    }

    const publicationStatus = carData.publicationStatus || "DRAFT";
    if (publicationStatus !== "PUBLISHED") {
      console.log(`Car ${carId} is not PUBLISHED (status: ${publicationStatus}), skipping`);
      return;
    }

    // Check if this is a new car or an update that should trigger alerts
    const wasPublished = change.before.exists
      ? (change.before.data()?.publicationStatus || "DRAFT") === "PUBLISHED"
      : false;
    const isNewlyPublished = !wasPublished && publicationStatus === "PUBLISHED";

    // For updates, only trigger if key fields changed
    const shouldTrigger = isNewlyPublished || (wasPublished && publicationStatus === "PUBLISHED");

    if (!shouldTrigger) {
      console.log(`Car ${carId} update doesn't require alert trigger, skipping`);
      return;
    }

    console.log(`Processing car ${carId} from yard ${yardUid} for alerts`);

    // Build searchable projection
    const carProjection = {
      brand: carData.brand || carData.brandText || "",
      brandText: carData.brandText || carData.brand || "",
      model: carData.model || carData.modelText || "",
      modelText: carData.modelText || carData.model || "",
      year: carData.year || null,
      salePrice: carData.salePrice || carData.price || 0,
      price: carData.price || carData.salePrice || 0,
      mileageKm: carData.mileageKm || carData.km || 0,
      km: carData.km || carData.mileageKm || 0,
      gearboxType: carData.gearboxType || carData.gear || null,
      gear: carData.gear || carData.gearboxType || null,
      fuelType: carData.fuelType || carData.fuel || null,
      fuel: carData.fuel || carData.fuelType || null,
      bodyType: carData.bodyType || carData.body || null,
      body: carData.body || carData.bodyType || null,
      cityId: carData.cityId || null,
      regionId: carData.regionId || null,
    };

    // Find all active saved searches that might match
    // We'll query by type and active status, then filter in memory
    try {
      const savedSearchesSnapshot = await db
        .collectionGroup("savedSearches")
        .where("type", "==", "CAR_FOR_SALE")
        .where("active", "==", true)
        .get();

      console.log(`Found ${savedSearchesSnapshot.size} active saved searches to check`);

      const matchingSearches: Array<{
        userUid: string;
        savedSearchId: string;
        filters: any;
      }> = [];

      // Filter searches that match this car
      savedSearchesSnapshot.docs.forEach((doc) => {
        const searchData = doc.data();
        const filters = searchData.filters || {};

        // Only consider BUYER, SELLER, AGENT roles (not YARD for now)
        const role = searchData.role || "BUYER";
        if (role === "YARD") {
          return;
        }

        if (carMatchesFilters(carProjection, filters)) {
          matchingSearches.push({
            userUid: doc.ref.parent.parent?.id || "",
            savedSearchId: doc.id,
            filters,
          });
        }
      });

      console.log(`Found ${matchingSearches.length} matching saved searches for car ${carId}`);

      if (matchingSearches.length === 0) {
        return;
      }

      // Create notifications for each matching search
      const batch = db.batch();
      const now = admin.firestore.Timestamp.now();
      const notificationText = generateNotificationText(carProjection);

      for (const match of matchingSearches) {
        // Check if already notified
        const alreadyNotified = await hasAlreadyNotified(
          match.userUid,
          match.savedSearchId,
          carId
        );

        if (alreadyNotified) {
          console.log(
            `Skipping notification for user ${match.userUid}, search ${match.savedSearchId}, car ${carId} (already notified)`
          );
          continue;
        }

        // Create notification
        const notificationRef = db
          .collection("users")
          .doc(match.userUid)
          .collection("notifications")
          .doc();

        batch.set(notificationRef, {
          userUid: match.userUid,
          type: "CAR_MATCH",
          savedSearchId: match.savedSearchId,
          carId: carId,
          yardUid: yardUid,
          title: notificationText.title,
          body: notificationText.body,
          isRead: false,
          createdAt: now,
        });

        // Update lastNotifiedAt on saved search
        const savedSearchRef = db
          .collection("users")
          .doc(match.userUid)
          .collection("savedSearches")
          .doc(match.savedSearchId);

        batch.update(savedSearchRef, {
          lastNotifiedAt: now,
        });
      }

      await batch.commit();
      console.log(
        `Created ${matchingSearches.length} notifications for car ${carId}`
      );
    } catch (error) {
      console.error(`Error processing alerts for car ${carId}:`, error);
      // Don't throw - we don't want to fail the car creation/update
    }
  });

