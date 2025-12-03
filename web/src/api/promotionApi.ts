import {
  collection,
  query,
  where,
  getDocsFromServer,
  addDoc,
  doc,
  getDocFromServer,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type {
  PromotionProduct,
  PromotionOrder,
  PromotionOrderItem,
  PromotionScope,
  PromotionOrderStatus,
  CarPromotionState,
} from '../types/Promotion';
import type { CarAd } from '../types/CarAd';

/**
 * Map Firestore document to PromotionProduct
 */
function mapPromotionProductDoc(docSnap: any): PromotionProduct {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    type: data.type || 'BOOST',
    scope: data.scope || 'PRIVATE_SELLER_AD', // Default for backwards compatibility
    name: data.name || '',
    description: data.description || undefined,
    price: typeof data.price === 'number' ? data.price : 0,
    currency: data.currency || 'ILS',
    durationDays: typeof data.durationDays === 'number' ? data.durationDays : undefined,
    numBumps: typeof data.numBumps === 'number' ? data.numBumps : undefined,
    isActive: data.isActive === true,
    createdAt: data.createdAt || Timestamp.now(),
    updatedAt: data.updatedAt || Timestamp.now(),
  };
}

/**
 * Map Firestore document to PromotionOrder
 */
function mapPromotionOrderDoc(docSnap: any): PromotionOrder {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userId: data.userId || '',
    carId: data.carId || null,
    items: Array.isArray(data.items) ? data.items : [],
    totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : 0,
    currency: data.currency || 'ILS',
    status: (data.status || 'DRAFT') as PromotionOrderStatus,
    paymentMethod: (data.paymentMethod || 'OFFLINE_SIMULATED') as any,
    createdAt: data.createdAt || Timestamp.now(),
    updatedAt: data.updatedAt || Timestamp.now(),
  };
}

/**
 * Fetch active promotion products (read-only for clients)
 */
export async function fetchActivePromotionProducts(
  scope?: PromotionScope
): Promise<PromotionProduct[]> {
  try {
    const productsRef = collection(db, 'promotionProducts');
    let q = query(productsRef, where('isActive', '==', true));

    if (scope) {
      q = query(q, where('scope', '==', scope));
    }

    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapPromotionProductDoc);
  } catch (error) {
    console.error('Error fetching active promotion products:', error);
    throw error;
  }
}

/**
 * Fetch all promotion products (Admin-only use)
 */
export async function fetchAllPromotionProducts(): Promise<PromotionProduct[]> {
  try {
    const productsRef = collection(db, 'promotionProducts');
    const snapshot = await getDocsFromServer(productsRef);
    return snapshot.docs.map(mapPromotionProductDoc);
  } catch (error) {
    console.error('Error fetching all promotion products:', error);
    throw error;
  }
}

/**
 * Create a new promotion product (Admin-only)
 */
export async function createPromotionProduct(
  input: Omit<PromotionProduct, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PromotionProduct> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to create promotion products');
  }

  try {
    const now = serverTimestamp();
    const productsRef = collection(db, 'promotionProducts');
    const docRef = await addDoc(productsRef, {
      ...input,
      createdAt: now,
      updatedAt: now,
    });

    // Fetch and return the created document
    const docSnap = await getDocFromServer(docRef);
    if (!docSnap.exists()) {
      throw new Error('Failed to create promotion product');
    }
    return mapPromotionProductDoc(docSnap);
  } catch (error) {
    console.error('Error creating promotion product:', error);
    throw error;
  }
}

/**
 * Update a promotion product (Admin-only)
 */
export async function updatePromotionProduct(
  id: string,
  changes: Partial<PromotionProduct>
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to update promotion products');
  }

  try {
    const { id: _, createdAt, updatedAt, ...updateData } = changes;
    const productRef = doc(db, 'promotionProducts', id);
    await updateDoc(productRef, {
      ...updateData,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating promotion product:', error);
    throw error;
  }
}

/**
 * Create a promotion order draft
 */
export async function createPromotionOrderDraft(
  userId: string,
  carId: string | null,
  items: Array<{
    productId: string;
    quantity: number;
  }>,
  autoMarkAsPaid: boolean = false
): Promise<PromotionOrder> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user || user.uid !== userId) {
    throw new Error('User must be authenticated and match userId');
  }

  try {
    // Fetch product details to build order items
    const products = await fetchActivePromotionProducts();
    const orderItems: PromotionOrderItem[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      orderItems.push({
        productId: product.id,
        productType: product.type,
        scope: product.scope,
        name: product.name,
        quantity: item.quantity,
        pricePerUnit: product.price,
        currency: product.currency,
      });
    }

    // Calculate total
    const totalAmount = orderItems.reduce(
      (sum, item) => sum + item.pricePerUnit * item.quantity,
      0
    );
    const currency = orderItems[0]?.currency || 'ILS';

    // Create order
    const now = serverTimestamp();
    const ordersRef = collection(db, 'promotionOrders');
    const docRef = await addDoc(ordersRef, {
      userId,
      carId: carId || null,
      items: orderItems,
      totalAmount,
      currency,
      status: autoMarkAsPaid ? 'PAID' : 'DRAFT',
      paymentMethod: 'OFFLINE_SIMULATED',
      createdAt: now,
      updatedAt: now,
    });

    // Fetch and return the created order
    const docSnap = await getDocFromServer(docRef);
    if (!docSnap.exists()) {
      throw new Error('Failed to create promotion order');
    }

    const order = mapPromotionOrderDoc(docSnap);

    // If auto-marked as paid, apply promotions immediately
    if (autoMarkAsPaid && carId) {
      await applyPromotionOrderToCar(order);
    }

    return order;
  } catch (error) {
    console.error('Error creating promotion order:', error);
    throw error;
  }
}

/**
 * Mark a promotion order as paid (Admin-only for now)
 */
export async function markPromotionOrderAsPaid(orderId: string): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to mark orders as paid');
  }

  try {
    const orderRef = doc(db, 'promotionOrders', orderId);
    const orderDoc = await getDocFromServer(orderRef);

    if (!orderDoc.exists()) {
      throw new Error('Order not found');
    }

    const order = mapPromotionOrderDoc(orderDoc);

    // Update order status
    await updateDoc(orderRef, {
      status: 'PAID',
      updatedAt: serverTimestamp(),
    });

    // Apply promotions to car if carId exists
    if (order.carId) {
      await applyPromotionOrderToCar({ ...order, status: 'PAID' });
    }
  } catch (error) {
    console.error('Error marking promotion order as paid:', error);
    throw error;
  }
}

/**
 * Fetch promotion orders for a user
 */
export async function fetchPromotionOrdersForUser(
  userId: string
): Promise<PromotionOrder[]> {
  try {
    const ordersRef = collection(db, 'promotionOrders');
    const q = query(ordersRef, where('userId', '==', userId));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapPromotionOrderDoc);
  } catch (error) {
    console.error('Error fetching promotion orders for user:', error);
    throw error;
  }
}

/**
 * Apply a promotion order to a car
 * Updates the car's promotion state based on the order items
 */
export async function applyPromotionOrderToCar(
  order: PromotionOrder
): Promise<void> {
  if (!order.carId) {
    console.warn('Cannot apply promotion order without carId');
    return;
  }

  try {
    // Fetch product details to get durationDays
    const allProducts = await fetchAllPromotionProducts();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const carRef = doc(db, 'carAds', order.carId);
    const carDoc = await getDocFromServer(carRef);

    if (!carDoc.exists()) {
      throw new Error(`Car ad ${order.carId} not found`);
    }

    const carData = carDoc.data();
    const now = Timestamp.now();
    const currentPromotion: CarPromotionState = carData.promotion || {};

    // Calculate new promotion state from order items
    let newPromotion: CarPromotionState = { ...currentPromotion };

    for (const item of order.items) {
      const productScope = item.scope || 'PRIVATE_SELLER_AD'; // Default for backwards compat

      // Only apply if it's a car-level promotion (not YARD_BRAND)
      if (productScope !== 'YARD_BRAND') {
        const product = productMap.get(item.productId);
        const durationDays = product?.durationDays || 7; // Default 7 days

        switch (item.productType) {
          case 'BOOST': {
            const boostUntil = new Timestamp(
              now.seconds + durationDays * 24 * 60 * 60,
              now.nanoseconds
            );
            // Use max of current and new
            newPromotion.boostUntil =
              currentPromotion.boostUntil &&
              currentPromotion.boostUntil.toMillis() > boostUntil.toMillis()
                ? currentPromotion.boostUntil
                : boostUntil;
            break;
          }
          case 'HIGHLIGHT': {
            const highlightUntil = new Timestamp(
              now.seconds + durationDays * 24 * 60 * 60,
              now.nanoseconds
            );
            newPromotion.highlightUntil =
              currentPromotion.highlightUntil &&
              currentPromotion.highlightUntil.toMillis() > highlightUntil.toMillis()
                ? currentPromotion.highlightUntil
                : highlightUntil;
            break;
          }
          case 'MEDIA_PLUS': {
            newPromotion.mediaPlusEnabled = true;
            break;
          }
          case 'EXPOSURE_PLUS': {
            const exposureUntil = new Timestamp(
              now.seconds + durationDays * 24 * 60 * 60,
              now.nanoseconds
            );
            newPromotion.exposurePlusUntil =
              currentPromotion.exposurePlusUntil &&
              currentPromotion.exposurePlusUntil.toMillis() > exposureUntil.toMillis()
                ? currentPromotion.exposurePlusUntil
                : exposureUntil;
            break;
          }
          case 'BUNDLE': {
            // For bundles, we'll apply each bundled feature
            // For now, treat as boost + highlight combo with same duration
            const bundleUntil = new Timestamp(
              now.seconds + durationDays * 24 * 60 * 60,
              now.nanoseconds
            );
            newPromotion.boostUntil =
              currentPromotion.boostUntil &&
              currentPromotion.boostUntil.toMillis() > bundleUntil.toMillis()
                ? currentPromotion.boostUntil
                : bundleUntil;
            newPromotion.highlightUntil =
              currentPromotion.highlightUntil &&
              currentPromotion.highlightUntil.toMillis() > bundleUntil.toMillis()
                ? currentPromotion.highlightUntil
                : bundleUntil;
            break;
          }
        }

        // Set promotion source
        newPromotion.lastPromotionSource = productScope === 'YARD_CAR' ? 'YARD' : 'PRIVATE_SELLER';
      }
    }

    // Update car document
    await updateDoc(carRef, {
      promotion: newPromotion,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error applying promotion order to car:', error);
    throw error;
  }
}

