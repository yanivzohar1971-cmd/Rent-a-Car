import type { Timestamp } from 'firebase/firestore';

/**
 * Promotion Product Types
 */
export type PromotionProductType =
  | 'BOOST'
  | 'HIGHLIGHT'
  | 'MEDIA_PLUS'
  | 'EXPOSURE_PLUS'
  | 'BUNDLE'; // combination of others

/**
 * Promotion Scope - determines who can use this product
 */
export type PromotionScope =
  | 'PRIVATE_SELLER_AD'
  | 'YARD_CAR'
  | 'YARD_BRAND';

/**
 * Promotion Product interface
 * Represents a promotion product that can be purchased
 * 
 * Firestore path: promotionProducts/{productId}
 */
export interface PromotionProduct {
  id: string; // Firestore doc id
  type: PromotionProductType;
  scope: PromotionScope;
  name: string;
  description?: string;
  price: number; // in ILS for now
  currency: string; // e.g. 'ILS'
  durationDays?: number; // for time-based promos
  numBumps?: number; // for BOOST packages (optional)
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Promotion Order Status
 */
export type PromotionOrderStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'CANCELLED';

/**
 * Promotion Order Payment Method
 */
export type PromotionOrderPaymentMethod =
  | 'OFFLINE_SIMULATED'
  | 'FUTURE_GATEWAY'; // placeholder for future

/**
 * Promotion Order Item
 */
export interface PromotionOrderItem {
  productId: string;
  productType: PromotionProductType;
  scope: PromotionScope;
  name: string;
  quantity: number;
  pricePerUnit: number;
  currency: string;
}

/**
 * Promotion Order interface
 * Represents a purchase of promotion products for a car or yard
 * 
 * Firestore path: promotionOrders/{orderId}
 */
export interface PromotionOrder {
  id: string;
  userId: string;
  carId?: string | null; // null for YARD_BRAND orders
  items: PromotionOrderItem[];
  totalAmount: number;
  currency: string;
  status: PromotionOrderStatus;
  paymentMethod: PromotionOrderPaymentMethod;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Car Promotion State
 * Applied to car ads to reflect active promotions
 */
export interface CarPromotionState {
  boostUntil?: Timestamp; // time until which the ad is "boosted" in search
  highlightUntil?: Timestamp; // time until which the ad is visually highlighted
  mediaPlusEnabled?: boolean; // allows more photos/video
  exposurePlusUntil?: Timestamp; // for future extended exposure features
  // Optional metadata for debugging/analytics:
  lastPromotionSource?: 'PRIVATE_SELLER' | 'YARD';
}

/**
 * Yard Promotion State
 * Applied to yard profiles for brand-level promotions
 */
export interface YardPromotionState {
  isPremium?: boolean;
  premiumUntil?: Timestamp | null; // null = unlimited (e.g. PRO plan)
  showRecommendedBadge?: boolean;
  featuredInStrips?: boolean;
  maxFeaturedCars?: number | null; // how many cars can be marked as "featured"
}

