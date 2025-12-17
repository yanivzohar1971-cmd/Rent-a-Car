import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { SubscriptionPlan } from '../types/UserProfile';

/**
 * Admin-only: Summary of a yard for admin overview
 */
export interface AdminYardSummary {
  id: string;
  name: string;
  contactName?: string;
  contactPhone?: string;
  email?: string;
  subscriptionPlan?: SubscriptionPlan;
}

/**
 * Admin-only: Fetch all yards from Firestore
 * Yards are users where isYard === true
 */
export async function fetchAllYardsForAdmin(): Promise<AdminYardSummary[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('isYard', '==', true));
    const snapshot = await getDocsFromServer(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      // Validate subscriptionPlan
      let subscriptionPlan: SubscriptionPlan | undefined = undefined;
      if (data.subscriptionPlan && ['FREE', 'PLUS', 'PRO'].includes(data.subscriptionPlan)) {
        subscriptionPlan = data.subscriptionPlan as SubscriptionPlan;
      }
      return {
        id: doc.id,
        name: data.displayName || data.fullName || data.email || 'מגרש ללא שם',
        contactName: data.fullName || null,
        contactPhone: data.phone || null,
        email: data.email || null,
        subscriptionPlan,
      };
    });
  } catch (error) {
    console.error('Error fetching all yards for admin:', error);
    throw error;
  }
}

