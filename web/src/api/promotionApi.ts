import {
  collection,
  query,
  where,
  getDocsFromServer,
  doc,
  getDocFromServer,
  serverTimestamp,
  Timestamp,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
import type {
  PromotionProduct,
  PromotionOrder,
  PromotionScope,
  PromotionOrderStatus,
  CarPromotionState,
  YardPromotionState,
} from '../types/Promotion';

/**
 * Map Firestore document to PromotionProduct
 */
function mapPromotionProductDoc(docSnap: any): PromotionProduct {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    type: data.type || 'BOOST',
    scope: data.scope || 'PRIVATE_SELLER_AD', // Default for backwards compatibility
    name: data.name || data.labelHe || '', // Use labelHe if available, fallback to name
    description: data.description || data.descriptionHe || undefined,
    price: typeof data.priceIls === 'number' ? data.priceIls : (typeof data.price === 'number' ? data.price : 0),
    currency: data.currency || 'ILS',
    durationDays: typeof data.durationDays === 'number' ? data.durationDays : undefined,
    numBumps: typeof data.numBumps === 'number' ? data.numBumps : undefined,
    isActive: data.isActive === true,
    createdAt: data.createdAt || Timestamp.now(),
    updatedAt: data.updatedAt || Timestamp.now(),
    // New enhanced fields
    code: data.code || undefined,
    labelHe: data.labelHe || undefined,
    labelEn: data.labelEn || undefined,
    descriptionHe: data.descriptionHe || undefined,
    descriptionEn: data.descriptionEn || undefined,
    priceIls: typeof data.priceIls === 'number' ? data.priceIls : undefined,
    maxCarsPerOrder: typeof data.maxCarsPerOrder === 'number' ? data.maxCarsPerOrder : (data.maxCarsPerOrder === null ? null : undefined),
    highlightLevel: typeof data.highlightLevel === 'number' ? data.highlightLevel : undefined,
    isFeatured: data.isFeatured === true,
    isArchived: data.isArchived === true,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
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
 * Only returns products that are active and not archived
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
    const products = snapshot.docs.map(mapPromotionProductDoc);
    
    // Filter out archived products (for backward compatibility with products that don't have isArchived field)
    return products.filter(p => !p.isArchived);
  } catch (error) {
    console.error('Error fetching active promotion products:', error);
    throw error;
  }
}

/**
 * Fetch all promotion products (Admin-only use)
 * Sorted by sortOrder (ascending), then by createdAt (descending) for products without sortOrder
 */
export async function fetchAllPromotionProducts(): Promise<PromotionProduct[]> {
  try {
    const productsRef = collection(db, 'promotionProducts');
    // Fetch all products (we'll sort in code since Firestore can't sort by multiple fields easily)
    const snapshot = await getDocsFromServer(productsRef);
    const products = snapshot.docs.map(mapPromotionProductDoc);
    
    // Sort by sortOrder (ascending), then by createdAt (descending for products without sortOrder)
    return products.sort((a, b) => {
      const sortA = a.sortOrder ?? 999999;
      const sortB = b.sortOrder ?? 999999;
      if (sortA !== sortB) {
        return sortA - sortB;
      }
      // If same sortOrder, sort by createdAt (newer first)
      const timeA = a.createdAt?.toMillis() ?? 0;
      const timeB = b.createdAt?.toMillis() ?? 0;
      return timeB - timeA;
    });
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
): Promise<PromotionProduct> {
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
    
    // Fetch and return the updated document
    const docSnap = await getDocFromServer(productRef);
    if (!docSnap.exists()) {
      throw new Error('Product not found after update');
    }
    return mapPromotionProductDoc(docSnap);
  } catch (error) {
    console.error('Error updating promotion product:', error);
    throw error;
  }
}

/**
 * Archive a promotion product (Admin-only)
 * Sets isArchived = true and isActive = false
 */
export async function archivePromotionProduct(id: string): Promise<PromotionProduct> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to archive promotion products');
  }

  try {
    const productRef = doc(db, 'promotionProducts', id);
    await updateDoc(productRef, {
      isArchived: true,
      isActive: false,
      updatedAt: serverTimestamp(),
    });
    
    // Fetch and return the archived document
    const docSnap = await getDocFromServer(productRef);
    if (!docSnap.exists()) {
      throw new Error('Product not found after archive');
    }
    return mapPromotionProductDoc(docSnap);
  } catch (error) {
    console.error('Error archiving promotion product:', error);
    throw error;
  }
}

/**
 * Toggle promotion product active status (Admin-only)
 */
export async function togglePromotionProductActive(
  id: string,
  isActive: boolean
): Promise<PromotionProduct> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to toggle promotion product status');
  }

  try {
    const productRef = doc(db, 'promotionProducts', id);
    await updateDoc(productRef, {
      isActive,
      updatedAt: serverTimestamp(),
    });
    
    // Fetch and return the updated document
    const docSnap = await getDocFromServer(productRef);
    if (!docSnap.exists()) {
      throw new Error('Product not found after toggle');
    }
    return mapPromotionProductDoc(docSnap);
  } catch (error) {
    console.error('Error toggling promotion product active status:', error);
    throw error;
  }
}

/**
 * Create a promotion order draft (server-side via Cloud Function)
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
    // Call Cloud Function instead of direct Firestore write
    const createOrderFunction = httpsCallable(functions, 'createPromotionOrderDraft');
    const result = await createOrderFunction({
      carId: carId || null,
      items: items,
      autoMarkAsPaid: autoMarkAsPaid,
    });

    const orderData = result.data as any;
    
    // Map server response to PromotionOrder type
    return {
      id: orderData.id,
      userId: orderData.userId,
      carId: orderData.carId,
      items: orderData.items,
      totalAmount: orderData.totalAmount,
      currency: orderData.currency,
      status: orderData.status as PromotionOrderStatus,
      paymentMethod: orderData.paymentMethod,
      createdAt: orderData.createdAt ? Timestamp.fromMillis(orderData.createdAt) : Timestamp.now(),
      updatedAt: orderData.updatedAt ? Timestamp.fromMillis(orderData.updatedAt) : Timestamp.now(),
    };
  } catch (error: any) {
    console.error('Error creating promotion order:', error);
    
    // Re-throw with user-friendly message
    if (error?.code === 'permission-denied') {
      throw new Error('אין הרשאה ליצירת הזמנה. נסה לרענן את הדף או פנה לתמיכה.');
    } else if (error?.code === 'not-found') {
      throw new Error('מוצר הקידום לא נמצא. נסה לרענן את הדף.');
    }
    
    throw error;
  }
}

/**
 * Mark a promotion order as paid (server-side via Cloud Function)
 */
export async function markPromotionOrderAsPaid(orderId: string): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to mark orders as paid');
  }

  try {
    // Call Cloud Function instead of direct Firestore write
    const markPaidFunction = httpsCallable(functions, 'markPromotionOrderAsPaid');
    await markPaidFunction({
      orderId: orderId,
    });
  } catch (error: any) {
    console.error('Error marking promotion order as paid:', error);
    
    // Re-throw with user-friendly message
    if (error?.code === 'permission-denied') {
      throw new Error('אין הרשאה לעדכן הזמנה זו. נסה לרענן את הדף או פנה לתמיכה.');
    } else if (error?.code === 'not-found') {
      throw new Error('ההזמנה לא נמצאה. נסה לרענן את הדף.');
    }
    
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

/**
 * Apply a YARD_BRAND promotion order to a yard profile
 * Updates the yard's promotion state based on the order items
 */
export async function applyYardBrandPromotion(order: PromotionOrder): Promise<void> {
  if (order.items.some((item) => item.scope !== 'YARD_BRAND')) {
    console.warn('Order contains non-YARD_BRAND items, skipping yard brand promotion');
    return;
  }

  try {
    // Load product details to get durationDays
    const allProducts = await fetchAllPromotionProducts();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    // Load yard profile
    const userRef = doc(db, 'users', order.userId);
    const userDoc = await getDocFromServer(userRef);

    if (!userDoc.exists()) {
      throw new Error(`User ${order.userId} not found`);
    }

    const userData = userDoc.data();
    const now = Timestamp.now();
    const currentPromotion: YardPromotionState = userData.promotion || {};

    // Calculate new promotion state from order items
    let newPromotion: YardPromotionState = { ...currentPromotion };

    for (const item of order.items) {
      if (item.scope !== 'YARD_BRAND') continue;

      const product = productMap.get(item.productId);
      const durationDays = product?.durationDays || 30; // Default 30 days

      // Based on product type, update promotion state
      switch (item.productType) {
        case 'BOOST':
        case 'BUNDLE':
          // For brand promotions, we might set premium status
          const premiumUntil = new Timestamp(
            now.seconds + durationDays * 24 * 60 * 60,
            now.nanoseconds
          );
          newPromotion.premiumUntil = newPromotion.premiumUntil &&
            newPromotion.premiumUntil.toDate().getTime() > premiumUntil.toDate().getTime()
            ? newPromotion.premiumUntil
            : premiumUntil;
          newPromotion.isPremium = true;
          newPromotion.showRecommendedBadge = true;
          break;
        case 'HIGHLIGHT':
        case 'EXPOSURE_PLUS':
          // Featured in strips
          const featuredUntil = new Timestamp(
            now.seconds + durationDays * 24 * 60 * 60,
            now.nanoseconds
          );
          newPromotion.featuredInStrips = true;
          // Store until date in premiumUntil for featured status
          if (!newPromotion.premiumUntil || newPromotion.premiumUntil.toDate().getTime() < featuredUntil.toDate().getTime()) {
            newPromotion.premiumUntil = featuredUntil;
          }
          break;
      }

      // Set max featured cars if product includes extra slots
      if (product?.durationDays && product.durationDays > 0) {
        // Could be configured per product, for now use a default
        if (!newPromotion.maxFeaturedCars || newPromotion.maxFeaturedCars < 5) {
          newPromotion.maxFeaturedCars = 5; // Default max featured cars
        }
      }
    }

    // Update yard profile
    await updateDoc(userRef, {
      promotion: newPromotion,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error applying yard brand promotion:', error);
    throw error;
  }
}

