/**
 * Cloud Functions for Promotion Orders (YARD_BRAND flow)
 * 
 * These functions handle server-side writes to promotionOrders collection
 * to comply with Firestore security rules that deny client writes.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Create a promotion order draft (server-side)
 * 
 * Replaces client-side createPromotionOrderDraft() in promotionApi.ts
 */
export const createPromotionOrderDraft = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const { carId, items, autoMarkAsPaid } = data;

  // Validate input
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "items array is required and must not be empty"
    );
  }

  try {
    // Fetch product details to build order items
    const productsSnapshot = await db.collection("promotionProducts").get();
    const activeProducts = productsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((p: any) => p.isActive);

    const orderItems: any[] = [];

    for (const item of items) {
      const product = activeProducts.find((p: any) => p.id === item.productId);
      if (!product) {
        throw new functions.https.HttpsError(
          "not-found",
          `Product ${item.productId} not found`
        );
      }

      orderItems.push({
        productId: product.id,
        productType: product.type,
        scope: product.scope,
        name: product.name || product.labelHe || product.type,
        quantity: item.quantity || 1,
        pricePerUnit: product.priceIls || product.price || 0,
        currency: product.currency || "ILS",
      });
    }

    // Calculate total
    const totalAmount = orderItems.reduce(
      (sum: number, item: any) => sum + item.pricePerUnit * item.quantity,
      0
    );
    const currency = orderItems[0]?.currency || "ILS";

    // Create order
    const orderRef = db.collection("promotionOrders").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    await orderRef.set({
      id: orderRef.id,
      userId: callerUid, // Use context.auth.uid, not client-provided userId
      carId: carId || null,
      items: orderItems,
      totalAmount: totalAmount,
      currency: currency,
      status: autoMarkAsPaid ? "PAID" : "DRAFT",
      paymentMethod: "OFFLINE_SIMULATED",
      createdAt: now,
      updatedAt: now,
    });

    // Fetch and return the created order
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      throw new functions.https.HttpsError(
        "internal",
        "Failed to create promotion order"
      );
    }

    const orderData = orderDoc.data()!;
    
    // If auto-marked as paid, apply promotions immediately
    if (autoMarkAsPaid) {
      // Check if this is a yard brand promotion (no carId or YARD_BRAND scope)
      const hasYardBrandItems = orderItems.some((item: any) => item.scope === "YARD_BRAND");
      if (hasYardBrandItems && !carId) {
        // Apply yard brand promotion (server-side)
        await applyYardBrandPromotionServer(orderData, callerUid);
      } else if (carId) {
        // For YARD_CAR, use existing applyPromotionToYardCar function
        // This case should not happen in YARD_BRAND flow, but handle gracefully
        console.warn(`[createPromotionOrderDraft] Car promotion should use applyPromotionToYardCar for carId: ${carId}`);
      }
    }

    return {
      id: orderDoc.id,
      ...orderData,
      createdAt: orderData.createdAt?.toMillis?.() || null,
      updatedAt: orderData.updatedAt?.toMillis?.() || null,
    };
  } catch (error: any) {
    console.error("[createPromotionOrderDraft] Error:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create promotion order",
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Mark a promotion order as paid (server-side)
 * 
 * Replaces client-side markPromotionOrderAsPaid() in promotionApi.ts
 */
export const markPromotionOrderAsPaid = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const { orderId } = data;

  // Validate input
  if (!orderId || typeof orderId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "orderId is required and must be a string"
    );
  }

  try {
    const orderRef = db.collection("promotionOrders").doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Order not found"
      );
    }

    const orderData = orderDoc.data()!;

    // Verify ownership (user can only mark their own orders as paid)
    if (orderData.userId !== callerUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You can only mark your own orders as paid"
      );
    }

    // Update order status
    await orderRef.update({
      status: "PAID",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Apply promotions based on scope
    const updatedOrder = { ...orderData, status: "PAID" };
    
    // Check if this is a yard brand promotion
    const hasYardBrandItems = (orderData.items || []).some((item: any) => item.scope === "YARD_BRAND");
    if (hasYardBrandItems) {
      await applyYardBrandPromotionServer(updatedOrder, callerUid);
    }
    
    // Apply promotions to car if carId exists (for YARD_CAR or PRIVATE_SELLER_AD)
    if (orderData.carId) {
      // For YARD_CAR, use existing applyPromotionToYardCar function
      // This case should not happen in YARD_BRAND flow, but handle gracefully
      console.warn(`[markPromotionOrderAsPaid] Car promotion should use applyPromotionToYardCar for carId: ${orderData.carId}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error("[markPromotionOrderAsPaid] Error:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      "Failed to mark order as paid",
      error instanceof Error ? error.message : String(error)
    );
  }
});

/**
 * Apply yard brand promotion (server-side helper)
 * 
 * Replaces client-side applyYardBrandPromotion() logic
 */
async function applyYardBrandPromotionServer(orderData: any, userId: string): Promise<void> {
  try {
    // Load product details to get durationDays
    const productsSnapshot = await db.collection("promotionProducts").get();
    const productMap = new Map(
      productsSnapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
    );

    // Load yard profile
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error(`User ${userId} not found`);
    }

    const userData = userDoc.data()!;
    const now = admin.firestore.Timestamp.now();
    const currentPromotion = userData.promotion || {};

    // Build new promotion state
    const newPromotion: any = { ...currentPromotion };

    // Process each order item
    for (const item of orderData.items || []) {
      if (item.scope !== "YARD_BRAND") continue;

      const product = productMap.get(item.productId);
      if (!product) continue;

      const durationDays = (product as any).durationDays || 7;
      const productType = (product as any).type;

      switch (productType) {
        case "PREMIUM":
          // Premium yard status
          const premiumUntil = new admin.firestore.Timestamp(
            now.seconds + durationDays * 24 * 60 * 60,
            now.nanoseconds
          );
          const currentPremiumUntil = currentPromotion.premiumUntil;
          if (!currentPremiumUntil ||
              (currentPremiumUntil instanceof admin.firestore.Timestamp &&
               currentPremiumUntil.toMillis() < premiumUntil.toMillis())) {
            newPromotion.premiumUntil = premiumUntil;
          } else {
            newPromotion.premiumUntil = currentPremiumUntil;
          }
          newPromotion.isPremium = true;
          newPromotion.showRecommendedBadge = true;
          break;
        case "HIGHLIGHT":
        case "EXPOSURE_PLUS":
          // Featured in strips
          const featuredUntil = new admin.firestore.Timestamp(
            now.seconds + durationDays * 24 * 60 * 60,
            now.nanoseconds
          );
          newPromotion.featuredInStrips = true;
          // Store until date in premiumUntil for featured status
          const currentFeaturedUntil = currentPromotion.premiumUntil;
          if (!currentFeaturedUntil ||
              (currentFeaturedUntil instanceof admin.firestore.Timestamp &&
               currentFeaturedUntil.toMillis() < featuredUntil.toMillis())) {
            newPromotion.premiumUntil = featuredUntil;
          } else {
            newPromotion.premiumUntil = currentFeaturedUntil;
          }
          break;
      }

      // Set max featured cars if product includes extra slots
      if (durationDays > 0) {
        if (!newPromotion.maxFeaturedCars || newPromotion.maxFeaturedCars < 5) {
          newPromotion.maxFeaturedCars = 5; // Default max featured cars
        }
      }
    }

    // Update yard profile
    await userRef.update({
      promotion: newPromotion,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[applyYardBrandPromotionServer] Applied yard brand promotion for user ${userId}`);
  } catch (error) {
    console.error("[applyYardBrandPromotionServer] Error:", error);
    throw error;
  }
}
