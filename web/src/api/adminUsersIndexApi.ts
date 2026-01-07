/**
 * Admin Users Index API
 * 
 * Queries the canonical adminUsersIndex collection to get users
 * grouped by primaryRole, ensuring no duplicates across tabs.
 */

import { collection, getDocsFromServer, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { SubscriptionPlan } from '../types/UserProfile';

/**
 * Admin Users Index Document (from Firestore)
 */
export interface AdminUsersIndexDoc {
  uid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  roles: string[];
  primaryRole: 'YARD' | 'AGENT' | 'PRIVATE';
  plan: string | null;
  updatedAt: Timestamp;
}

/**
 * Convert AdminUsersIndexDoc to CustomerRow format
 */
export interface AdminCustomerRow {
  id: string;
  type: 'YARD' | 'AGENT' | 'PRIVATE_SELLER';
  name: string;
  email?: string;
  phone?: string;
  subscriptionPlan: SubscriptionPlan;
  billingDealName?: string | null;
  billingDealValidUntil?: Timestamp | null;
  hasCustomDeal: boolean;
  roles: string[]; // All roles this user has
  primaryRole: 'YARD' | 'AGENT' | 'PRIVATE';
}

/**
 * Admin-only: Fetch all users with primaryRole = YARD
 */
export async function fetchYardsFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    const q = query(indexRef, where('primaryRole', '==', 'YARD'));
    const snapshot = await getDocsFromServer(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data() as AdminUsersIndexDoc;
      
      // Validate subscriptionPlan
      let subscriptionPlan: SubscriptionPlan = 'FREE';
      if (data.plan && ['FREE', 'PLUS', 'PRO'].includes(data.plan)) {
        subscriptionPlan = data.plan as SubscriptionPlan;
      }
      
      return {
        id: data.uid,
        type: 'YARD',
        name: data.displayName || data.email || 'מגרש ללא שם',
        email: data.email || undefined,
        phone: data.phone || undefined,
        subscriptionPlan,
        hasCustomDeal: false, // Will be updated when loading full user data
        roles: data.roles || [],
        primaryRole: data.primaryRole,
      };
    });
  } catch (error) {
    console.error('Error fetching yards from adminUsersIndex:', error);
    throw error;
  }
}

/**
 * Admin-only: Fetch all users with primaryRole = AGENT
 */
export async function fetchAgentsFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    const q = query(indexRef, where('primaryRole', '==', 'AGENT'));
    const snapshot = await getDocsFromServer(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data() as AdminUsersIndexDoc;
      
      // Validate subscriptionPlan
      let subscriptionPlan: SubscriptionPlan = 'FREE';
      if (data.plan && ['FREE', 'PLUS', 'PRO'].includes(data.plan)) {
        subscriptionPlan = data.plan as SubscriptionPlan;
      }
      
      return {
        id: data.uid,
        type: 'AGENT',
        name: data.displayName || data.email || 'סוכן ללא שם',
        email: data.email || undefined,
        phone: data.phone || undefined,
        subscriptionPlan,
        hasCustomDeal: false, // Will be updated when loading full user data
        roles: data.roles || [],
        primaryRole: data.primaryRole,
      };
    });
  } catch (error) {
    console.error('Error fetching agents from adminUsersIndex:', error);
    throw error;
  }
}

/**
 * Admin-only: Fetch all users with primaryRole = PRIVATE
 */
export async function fetchPrivateSellersFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    const q = query(indexRef, where('primaryRole', '==', 'PRIVATE'));
    const snapshot = await getDocsFromServer(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data() as AdminUsersIndexDoc;
      
      // Validate subscriptionPlan
      let subscriptionPlan: SubscriptionPlan = 'FREE';
      if (data.plan && ['FREE', 'PLUS', 'PRO'].includes(data.plan)) {
        subscriptionPlan = data.plan as SubscriptionPlan;
      }
      
      return {
        id: data.uid,
        type: 'PRIVATE_SELLER',
        name: data.displayName || data.email || 'מוכר ללא שם',
        email: data.email || undefined,
        phone: data.phone || undefined,
        subscriptionPlan,
        hasCustomDeal: false, // Will be updated when loading full user data
        roles: data.roles || [],
        primaryRole: data.primaryRole,
      };
    });
  } catch (error) {
    console.error('Error fetching private sellers from adminUsersIndex:', error);
    throw error;
  }
}

/**
 * Admin-only: Fetch all users from index (for deals tab)
 */
export async function fetchAllUsersFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    const snapshot = await getDocsFromServer(indexRef);

    return snapshot.docs.map((doc) => {
      const data = doc.data() as AdminUsersIndexDoc;
      
      // Validate subscriptionPlan
      let subscriptionPlan: SubscriptionPlan = 'FREE';
      if (data.plan && ['FREE', 'PLUS', 'PRO'].includes(data.plan)) {
        subscriptionPlan = data.plan as SubscriptionPlan;
      }
      
      // Map primaryRole to type
      let type: 'YARD' | 'AGENT' | 'PRIVATE_SELLER';
      if (data.primaryRole === 'YARD') {
        type = 'YARD';
      } else if (data.primaryRole === 'AGENT') {
        type = 'AGENT';
      } else {
        type = 'PRIVATE_SELLER';
      }
      
      return {
        id: data.uid,
        type,
        name: data.displayName || data.email || 'משתמש ללא שם',
        email: data.email || undefined,
        phone: data.phone || undefined,
        subscriptionPlan,
        hasCustomDeal: false, // Will be updated when loading full user data
        roles: data.roles || [],
        primaryRole: data.primaryRole,
      };
    });
  } catch (error) {
    console.error('Error fetching all users from adminUsersIndex:', error);
    throw error;
  }
}

