import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { sanitizeFirestoreData } from '../utils/firestoreSanitize';
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
    const payload = { subscriptionPlan: plan };
    const cleanPayload = sanitizeFirestoreData(payload);
    await updateDoc(userRef, cleanPayload);
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

    const cleanUpdateData = sanitizeFirestoreData(updateData);
    await updateDoc(userRef, cleanUpdateData);
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
    const payload = {
      billingDealName: null,
      billingDealValidUntil: null,
      customFreeMonthlyLeadQuota: null,
      customLeadPrice: null,
      customFixedMonthlyFee: null,
      customCurrency: null,
    };
    const cleanPayload = sanitizeFirestoreData(payload);
    await updateDoc(userRef, cleanPayload);
  } catch (error) {
    console.error('Error clearing user deal:', error);
    throw error;
  }
}

/**
 * Admin-only: Approve Yard (Activate)
 * Sets roleStatus=APPROVED, status=ACTIVE, primaryRole=YARD, isYard=true
 * @param userId The user ID (Firestore document ID)
 * @param adminUid The admin user ID who is performing the action
 */
export async function approveYard(userId: string, adminUid: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const payload = {
      roleStatus: 'APPROVED',
      status: 'ACTIVE',
      primaryRole: 'YARD',
      isYard: true,
      isPrivateUser: false,
      roleUpdatedAt: serverTimestamp(),
      roleUpdatedByUid: adminUid,
      roleUpdateReason: 'ADMIN_APPROVE_YARD',
      // Update legacy fields for backward compatibility
      role: 'USER',
      canBuy: true,
      canSell: true,
    };
    const cleanPayload = sanitizeFirestoreData(payload);
    await updateDoc(userRef, cleanPayload);
  } catch (error) {
    console.error('Error approving yard:', error);
    throw error;
  }
}

/**
 * Admin-only: Reject Yard Request
 * Sets roleStatus=REJECTED, status=REJECTED, isYard=false
 * @param userId The user ID (Firestore document ID)
 * @param adminUid The admin user ID who is performing the action
 */
export async function rejectYardRequest(userId: string, adminUid: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const payload = {
      roleStatus: 'REJECTED',
      status: 'REJECTED',
      primaryRole: 'PRIVATE_USER',
      isYard: false,
      roleUpdatedAt: serverTimestamp(),
      roleUpdatedByUid: adminUid,
      roleUpdateReason: 'ADMIN_REJECT_YARD',
      // Update legacy fields for backward compatibility
      role: 'USER',
      isPrivateUser: true,
      canBuy: true,
      canSell: true,
    };
    const cleanPayload = sanitizeFirestoreData(payload);
    await updateDoc(userRef, cleanPayload);
  } catch (error) {
    console.error('Error rejecting yard request:', error);
    throw error;
  }
}

/**
 * Admin-only: Revert to Private User
 * Removes yard status and returns user to PRIVATE_USER state
 * @param userId The user ID (Firestore document ID)
 * @param adminUid The admin user ID who is performing the action
 */
export async function revertToPrivateUser(userId: string, adminUid: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const payload = {
      roleStatus: null,
      status: 'ACTIVE',
      primaryRole: 'PRIVATE_USER',
      requestedRole: null,
      isYard: false,
      isPrivateUser: true,
      roleUpdatedAt: serverTimestamp(),
      roleUpdatedByUid: adminUid,
      roleUpdateReason: 'ADMIN_REVERT_TO_PRIVATE',
      // Update legacy fields for backward compatibility
      role: 'USER',
      canBuy: true,
      canSell: true,
    };
    const cleanPayload = sanitizeFirestoreData(payload);
    await updateDoc(userRef, cleanPayload);
  } catch (error) {
    console.error('Error reverting to private user:', error);
    throw error;
  }
}

