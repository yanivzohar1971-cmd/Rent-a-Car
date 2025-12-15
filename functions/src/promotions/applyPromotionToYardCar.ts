/**
 * Cloud Function: applyPromotionToYardCar
 * 
 * Applies a promotion to a yard car server-side.
 * This function:
 * 1. Verifies ownership (yardCar belongs to auth.uid)
 * 2. Resolves/ensures publicCars projection exists
 * 3. Applies promotion fields to publicCars (or carAds if needed)
 * 
 * This avoids client-side permission errors when writing to restricted collections.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { upsertPublicCarFromMaster, isMasterCarPublished } from "../cars/publicCarProjection";
import { getYardCarMaster } from "../cars/masterCarService";

const db = admin.firestore();

export const applyPromotionToYardCar = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const { yardCarId, promotionProductId, scope } = data;

  // Validate input
  if (!yardCarId || typeof yardCarId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "yardCarId is required and must be a string"
    );
  }

  if (!promotionProductId || typeof promotionProductId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "promotionProductId is required and must be a string"
    );
  }

  if (scope !== "YARD_CAR") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "scope must be YARD_CAR"
    );
  }

  try {
    // Step 1: Verify ownership - ensure yardCar belongs to auth.uid
    const masterCar = await getYardCarMaster(callerUid, yardCarId);
    
    if (!masterCar) {
      throw new functions.https.HttpsError(
        "not-found",
        `Yard car ${yardCarId} not found for user ${callerUid}`
      );
    }

    if (masterCar.yardUid !== callerUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You do not own this car"
      );
    }

    // Step 2: Fetch promotion product details
    const productDoc = await db.collection("promotionProducts").doc(promotionProductId).get();
    
    if (!productDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `Promotion product ${promotionProductId} not found`
      );
    }

    const productData = productDoc.data();
    if (!productData || !productData.isActive) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Promotion product is not active"
      );
    }

    const productType = productData.type || "BOOST";
    const durationDays = productData.durationDays || 7;

    // Step 3: Resolve/ensure publicCars projection exists
    // If the car is published, ensure publicCars doc exists
    const isPublished = isMasterCarPublished(masterCar as any);
    
    if (isPublished && masterCar.saleStatus !== "SOLD") {
      await upsertPublicCarFromMaster(callerUid, yardCarId);
    }

    // Step 4: Apply promotion to publicCars (or carAds if car is published)
    const now = admin.firestore.Timestamp.now();
    const publicCarId = yardCarId; // publicCars uses same ID as MASTER

    // Calculate promotion end time
    const promotionEndSeconds = now.seconds + (durationDays * 24 * 60 * 60);
    const promotionEnd = new admin.firestore.Timestamp(promotionEndSeconds, now.nanoseconds);

    // Get current promotion state from publicCars (if exists)
    const publicCarRef = db.collection("publicCars").doc(publicCarId);
    const publicCarDoc = await publicCarRef.get();
    
    const currentPromotion = publicCarDoc.exists 
      ? (publicCarDoc.data()?.promotion || {})
      : {};

    // Build new promotion state based on product type
    let newPromotion: any = { ...currentPromotion };

    switch (productType) {
      case "BOOST": {
        // Use max of current and new boostUntil
        const currentBoostUntil = currentPromotion.boostUntil;
        if (!currentBoostUntil || 
            (currentBoostUntil instanceof admin.firestore.Timestamp && 
             currentBoostUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.boostUntil = promotionEnd;
          // Set bumpedAt for freshness sorting
          newPromotion.bumpedAt = now;
        } else {
          newPromotion.boostUntil = currentBoostUntil;
        }
        break;
      }
      case "HIGHLIGHT": {
        const currentHighlightUntil = currentPromotion.highlightUntil;
        if (!currentHighlightUntil || 
            (currentHighlightUntil instanceof admin.firestore.Timestamp && 
             currentHighlightUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.highlightUntil = promotionEnd;
        } else {
          newPromotion.highlightUntil = currentHighlightUntil;
        }
        break;
      }
      case "MEDIA_PLUS": {
        newPromotion.mediaPlusEnabled = true;
        break;
      }
      case "EXPOSURE_PLUS": {
        const currentExposureUntil = currentPromotion.exposurePlusUntil;
        if (!currentExposureUntil || 
            (currentExposureUntil instanceof admin.firestore.Timestamp && 
             currentExposureUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.exposurePlusUntil = promotionEnd;
        } else {
          newPromotion.exposurePlusUntil = currentExposureUntil;
        }
        break;
      }
      case "BUNDLE": {
        // Apply both boost and highlight
        const currentBoostUntil = currentPromotion.boostUntil;
        const currentHighlightUntil = currentPromotion.highlightUntil;
        if (!currentBoostUntil || 
            (currentBoostUntil instanceof admin.firestore.Timestamp && 
             currentBoostUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.boostUntil = promotionEnd;
          // Set bumpedAt for freshness sorting
          newPromotion.bumpedAt = now;
        } else {
          newPromotion.boostUntil = currentBoostUntil;
        }
        if (!currentHighlightUntil || 
            (currentHighlightUntil instanceof admin.firestore.Timestamp && 
             currentHighlightUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.highlightUntil = promotionEnd;
        } else {
          newPromotion.highlightUntil = currentHighlightUntil;
        }
        break;
      }
      case "PLATINUM": {
        const currentPlatinumUntil = currentPromotion.platinumUntil;
        if (!currentPlatinumUntil || 
            (currentPlatinumUntil instanceof admin.firestore.Timestamp && 
             currentPlatinumUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.platinumUntil = promotionEnd;
          // Set bumpedAt for freshness sorting (reuse bumpedAt, no separate platinumBumpedAt)
          newPromotion.bumpedAt = now;
        } else {
          newPromotion.platinumUntil = currentPlatinumUntil;
        }
        break;
      }
      case "DIAMOND": {
        const currentDiamondUntil = currentPromotion.diamondUntil;
        if (!currentDiamondUntil || 
            (currentDiamondUntil instanceof admin.firestore.Timestamp && 
             currentDiamondUntil.toMillis() < promotionEnd.toMillis())) {
          newPromotion.diamondUntil = promotionEnd;
          // Set bumpedAt for freshness sorting
          newPromotion.bumpedAt = now;
        } else {
          newPromotion.diamondUntil = currentDiamondUntil;
        }
        break;
      }
    }

    // Set promotion source
    newPromotion.lastPromotionSource = "YARD";

    // Set showStripes based on tier (DIAMOND or PLATINUM get stripes)
    newPromotion.showStripes = Boolean(newPromotion.diamondUntil || newPromotion.platinumUntil);

    // Compute highlightLevel (used for both MASTER and publicCars)
    let highlightLevel: 'none' | 'basic' | 'plus' | 'premium' | 'platinum' | 'diamond' = 'none';
    const nowMillis = now.toMillis();
    const isDiamondActive = newPromotion.diamondUntil && 
      (newPromotion.diamondUntil.toMillis ? newPromotion.diamondUntil.toMillis() : newPromotion.diamondUntil) > nowMillis;
    const isPlatinumActive = newPromotion.platinumUntil && 
      (newPromotion.platinumUntil.toMillis ? newPromotion.platinumUntil.toMillis() : newPromotion.platinumUntil) > nowMillis;
    const isHighlightActive = newPromotion.highlightUntil && 
      (newPromotion.highlightUntil.toMillis ? newPromotion.highlightUntil.toMillis() : newPromotion.highlightUntil) > nowMillis;
    const isExposurePlusActive = newPromotion.exposurePlusUntil && 
      (newPromotion.exposurePlusUntil.toMillis ? newPromotion.exposurePlusUntil.toMillis() : newPromotion.exposurePlusUntil) > nowMillis;
    const isBoostActive = newPromotion.boostUntil && 
      (newPromotion.boostUntil.toMillis ? newPromotion.boostUntil.toMillis() : newPromotion.boostUntil) > nowMillis;
    
    if (isDiamondActive) {
      highlightLevel = 'diamond';
    } else if (isPlatinumActive) {
      highlightLevel = 'platinum';
    } else if (isBoostActive && isHighlightActive) {
      highlightLevel = 'premium';
    } else if (isExposurePlusActive) {
      highlightLevel = 'plus';
    } else if (isHighlightActive) {
      highlightLevel = 'basic';
    }

    // Step 5: ALWAYS write to MASTER (so Yard can track promotions)
    const masterCarRef = db.collection("users").doc(callerUid)
      .collection("carSales").doc(yardCarId);
    await masterCarRef.set({
      promotion: newPromotion,
      highlightLevel: highlightLevel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Step 6: ALSO update publicCars if car is published (for Buyer UI)
    if (isPublished && masterCar.saleStatus !== "SOLD") {
      await publicCarRef.set({
        promotion: newPromotion,
        highlightLevel: highlightLevel,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // Step 7: Create tracking record in promotionOrders
    try {
      const orderRef = db.collection("promotionOrders").doc();
      const productName = productData.name || productData.labelHe || productType;
      const productPrice = productData.priceIls || productData.price || 0;
      
      await orderRef.set({
        id: orderRef.id,
        userId: callerUid,
        carId: yardCarId,
        items: [{
          productId: promotionProductId,
          productType: productType,
          scope: "YARD_CAR",
          name: productName,
          quantity: 1,
          pricePerUnit: productPrice,
          currency: productData.currency || "ILS",
        }],
        totalAmount: productPrice,
        currency: productData.currency || "ILS",
        status: "PAID",
        paymentMethod: "OFFLINE_SIMULATED",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      console.log(`[applyPromotionToYardCar] Created promotionOrder ${orderRef.id} for car ${yardCarId}`);
    } catch (orderError) {
      // Non-blocking: log but don't fail the promotion application
      console.error(`[applyPromotionToYardCar] Error creating promotionOrder (non-blocking):`, orderError);
    }

    // DEV-ONLY: Log promotion tier and showStripes value
    if (process.env.NODE_ENV !== 'production') {
      const tier = newPromotion.diamondUntil ? 'DIAMOND' : 
                    newPromotion.platinumUntil ? 'PLATINUM' : 
                    newPromotion.boostUntil ? 'BOOST' : 
                    newPromotion.highlightUntil ? 'HIGHLIGHT' : 
                    newPromotion.exposurePlusUntil ? 'EXPOSURE_PLUS' : 'UNKNOWN';
      console.log(`[applyPromotionToYardCar] Applied ${productType} (tier: ${tier}) to car ${yardCarId}, showStripes=${newPromotion.showStripes}`);
    } else {
      console.log(`[applyPromotionToYardCar] Applied ${productType} promotion to car ${yardCarId} for user ${callerUid}`);
    }

    // Return response with promotion details
    // Note: Timestamps are returned as-is (Firebase Functions will serialize them correctly)
    return {
      success: true,
      yardCarId,
      publicCarId: isPublished ? publicCarId : null,
      promotionType: productType,
      promotionEnd: promotionEnd.toMillis(),
      promotion: newPromotion, // Timestamps will be serialized by Firebase Functions
      highlightLevel: highlightLevel,
      durationDays: durationDays,
      price: productData.priceIls || productData.price || 0,
    };
  } catch (error: any) {
    console.error(`[applyPromotionToYardCar] Error applying promotion:`, error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to apply promotion",
      error instanceof Error ? error.message : String(error)
    );
  }
});
