import { doc, updateDoc } from 'firebase/firestore';
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

