import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { SubscriptionPlan } from '../types/UserProfile';

/**
 * Admin-only: Update a user's subscription plan
 * @param userId The user ID (Firestore document ID)
 * @param plan The new subscription plan
 */
export async function adminUpdateUserSubscriptionPlan(
  userId: string,
  plan: SubscriptionPlan
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { subscriptionPlan: plan });
  } catch (error) {
    console.error('Error updating user subscription plan:', error);
    throw error;
  }
}

/**
 * Admin-only: Update a user's subscription plan and deal overrides
 * @param userId The user ID (Firestore document ID)
 * @param payload Update data including subscription plan and deal fields
 */
export interface UpdateUserSubscriptionAndDealPayload {
  subscriptionPlan?: SubscriptionPlan;
  billingDealName?: string | null;
  billingDealValidUntil?: Timestamp | null;
  customFreeMonthlyLeadQuota?: number | null;
  customLeadPrice?: number | null;
  customFixedMonthlyFee?: number | null;
  customCurrency?: string | null;
}

export async function updateUserSubscriptionAndDeal(
  userId: string,
  payload: UpdateUserSubscriptionAndDealPayload
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const updateData: Record<string, any> = {};
    
    if (payload.subscriptionPlan !== undefined) {
      updateData.subscriptionPlan = payload.subscriptionPlan;
    }
    if (payload.billingDealName !== undefined) {
      updateData.billingDealName = payload.billingDealName;
    }
    if (payload.billingDealValidUntil !== undefined) {
      updateData.billingDealValidUntil = payload.billingDealValidUntil;
    }
    if (payload.customFreeMonthlyLeadQuota !== undefined) {
      updateData.customFreeMonthlyLeadQuota = payload.customFreeMonthlyLeadQuota;
    }
    if (payload.customLeadPrice !== undefined) {
      updateData.customLeadPrice = payload.customLeadPrice;
    }
    if (payload.customFixedMonthlyFee !== undefined) {
      updateData.customFixedMonthlyFee = payload.customFixedMonthlyFee;
    }
    if (payload.customCurrency !== undefined) {
      updateData.customCurrency = payload.customCurrency;
    }

    await updateDoc(userRef, updateData);
  } catch (error) {
    console.error('Error updating user subscription and deal:', error);
    throw error;
  }
}

/**
 * Admin-only: Clear all deal overrides for a user
 * @param userId The user ID (Firestore document ID)
 */
export async function clearUserDeal(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      billingDealName: null,
      billingDealValidUntil: null,
      customFreeMonthlyLeadQuota: null,
      customLeadPrice: null,
      customFixedMonthlyFee: null,
      customCurrency: null,
    });
  } catch (error) {
    console.error('Error clearing user deal:', error);
    throw error;
  }
}

