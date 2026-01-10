/**
 * Admin Users Index API
 * 
 * Queries the canonical adminUsersIndex collection to get users
 * grouped by primaryRole, ensuring no duplicates across tabs.
 */

import { collection, getDocsFromServer, query, where, Timestamp, doc, getDocFromServer } from 'firebase/firestore';
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
 * Includes fallback to canonical sources (users collection) when index is empty
 */
export async function fetchYardsFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    let q = query(indexRef, where('primaryRole', '==', 'YARD'));
    let snapshot;
    let useCanonicalFallback = false;
    
    try {
      snapshot = await getDocsFromServer(q);
      // If index is empty, use canonical fallback
      if (snapshot.empty || snapshot.size === 0) {
        console.warn('[fetchYardsFromIndex] Index empty, using canonical fallback');
        useCanonicalFallback = true;
      }
    } catch (queryError: any) {
      // If failed-precondition (missing index), use canonical fallback
      if (queryError?.code === 'failed-precondition' || queryError?.message?.includes('index')) {
        console.warn('[fetchYardsFromIndex] Index missing, using canonical fallback');
        useCanonicalFallback = true;
      } else {
        throw queryError;
      }
    }

    // Canonical fallback: query users collection directly
    if (useCanonicalFallback) {
      const usersRef = collection(db, 'users');
      const canonicalQ = query(usersRef, where('isYard', '==', true));
      const canonicalSnapshot = await getDocsFromServer(canonicalQ);
      
      return canonicalSnapshot.docs.map((doc: any) => {
        const data = doc.data();
        let subscriptionPlan: SubscriptionPlan = 'FREE';
        if (data.subscriptionPlan && ['FREE', 'PLUS', 'PRO'].includes(data.subscriptionPlan)) {
          subscriptionPlan = data.subscriptionPlan as SubscriptionPlan;
        }
        
        return {
          id: doc.id,
          type: 'YARD',
          name: data.displayName || data.fullName || data.email || 'מגרש ללא שם',
          email: data.email || undefined,
          phone: data.phone || undefined,
          subscriptionPlan,
          hasCustomDeal: false,
          roles: ['YARD'],
          primaryRole: 'YARD' as const,
        };
      });
    }

    if (!snapshot) {
      // Should not happen, but TypeScript safety
      return [];
    }

    return snapshot.docs.map((doc: any) => {
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
        hasCustomDeal: false,
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
 * Excludes admins (isAdmin !== true) and requires roleStatus === 'APPROVED'
 * Includes fallback to canonical sources (users collection) when index is empty
 */
export async function fetchAgentsFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    let q = query(indexRef, where('primaryRole', '==', 'AGENT'));
    let snapshot;
    let useCanonicalFallback = false;
    
    try {
      snapshot = await getDocsFromServer(q);
      if (snapshot.empty || snapshot.size === 0) {
        console.warn('[fetchAgentsFromIndex] Index empty, using canonical fallback');
        useCanonicalFallback = true;
      }
    } catch (queryError: any) {
      if (queryError?.code === 'failed-precondition' || queryError?.message?.includes('index')) {
        console.warn('[fetchAgentsFromIndex] Index missing, using canonical fallback');
        useCanonicalFallback = true;
      } else {
        throw queryError;
      }
    }

    if (useCanonicalFallback) {
      const usersRef = collection(db, 'users');
      const canonicalQ = query(usersRef, where('isAgent', '==', true));
      const canonicalSnapshot = await getDocsFromServer(canonicalQ);
      
      // Filter: exclude admins and require roleStatus === 'APPROVED'
      const filteredDocs = canonicalSnapshot.docs.filter((doc: any) => {
        const data = doc.data();
        // Exclude admins
        if (data.isAdmin === true) {
          return false;
        }
        // Require roleStatus === 'APPROVED' (PENDING requests should not appear as agents)
        if (data.roleStatus !== 'APPROVED') {
          return false;
        }
        return true;
      });
      
      return filteredDocs.map((doc: any) => {
        const data = doc.data();
        let subscriptionPlan: SubscriptionPlan = 'FREE';
        if (data.subscriptionPlan && ['FREE', 'PLUS', 'PRO'].includes(data.subscriptionPlan)) {
          subscriptionPlan = data.subscriptionPlan as SubscriptionPlan;
        }
        
        return {
          id: doc.id,
          type: 'AGENT',
          name: data.displayName || data.fullName || data.email || 'סוכן ללא שם',
          email: data.email || undefined,
          phone: data.phone || undefined,
          subscriptionPlan,
          hasCustomDeal: false,
          roles: ['AGENT'],
          primaryRole: 'AGENT' as const,
        };
      });
    }

    if (!snapshot) {
      // Should not happen, but TypeScript safety
      return [];
    }

    // Filter index results: need to check full user data for isAdmin and roleStatus
    const filteredResults: AdminCustomerRow[] = [];
    
    for (const indexDoc of snapshot.docs) {
      const data = indexDoc.data() as AdminUsersIndexDoc;
      
      // Load full user data to check isAdmin and roleStatus
      try {
        const userDocRef = doc(db, 'users', data.uid);
        const userDoc = await getDocFromServer(userDocRef);
        
        if (!userDoc.exists()) {
          continue; // Skip if user doesn't exist
        }
        
        const userData = userDoc.data();
        
        // Exclude admins
        if (userData.isAdmin === true) {
          continue;
        }
        
        // Require roleStatus === 'APPROVED'
        if (userData.roleStatus !== 'APPROVED') {
          continue;
        }
        
        // Validate subscriptionPlan
        let subscriptionPlan: SubscriptionPlan = 'FREE';
        if (data.plan && ['FREE', 'PLUS', 'PRO'].includes(data.plan)) {
          subscriptionPlan = data.plan as SubscriptionPlan;
        }
        
        filteredResults.push({
          id: data.uid,
          type: 'AGENT',
          name: data.displayName || data.email || 'סוכן ללא שם',
          email: data.email || undefined,
          phone: data.phone || undefined,
          subscriptionPlan,
          hasCustomDeal: false,
          roles: data.roles || [],
          primaryRole: data.primaryRole,
        });
      } catch (userLoadError) {
        console.warn(`[fetchAgentsFromIndex] Error loading user ${data.uid}:`, userLoadError);
        // Skip this user if we can't load their data
        continue;
      }
    }
    
    return filteredResults;
  } catch (error) {
    console.error('Error fetching agents from adminUsersIndex:', error);
    throw error;
  }
}

/**
 * Admin-only: Fetch all users with primaryRole = PRIVATE
 * Includes fallback to canonical sources (users collection) when index is empty
 */
export async function fetchPrivateSellersFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    const indexRef = collection(db, 'adminUsersIndex');
    let q = query(indexRef, where('primaryRole', '==', 'PRIVATE'));
    let snapshot;
    let useCanonicalFallback = false;
    
    try {
      snapshot = await getDocsFromServer(q);
      if (snapshot.empty || snapshot.size === 0) {
        console.warn('[fetchPrivateSellersFromIndex] Index empty, using canonical fallback');
        useCanonicalFallback = true;
      }
    } catch (queryError: any) {
      if (queryError?.code === 'failed-precondition' || queryError?.message?.includes('index')) {
        console.warn('[fetchPrivateSellersFromIndex] Index missing, using canonical fallback');
        useCanonicalFallback = true;
      } else {
        throw queryError;
      }
    }

    if (useCanonicalFallback) {
      const usersRef = collection(db, 'users');
      const canonicalQ = query(usersRef, where('canSell', '==', true));
      const canonicalSnapshot = await getDocsFromServer(canonicalQ);
      
      // Filter out YARD/AGENT users
      const filteredDocs = canonicalSnapshot.docs.filter((doc: any) => {
        const data = doc.data();
        return !(data.isYard === true || data.isAgent === true || 
                 data.primaryRole === 'YARD' || data.primaryRole === 'AGENT');
      });
      
      return filteredDocs.map((doc: any) => {
        const data = doc.data();
        let subscriptionPlan: SubscriptionPlan = 'FREE';
        if (data.subscriptionPlan && ['FREE', 'PLUS', 'PRO'].includes(data.subscriptionPlan)) {
          subscriptionPlan = data.subscriptionPlan as SubscriptionPlan;
        }
        
        return {
          id: doc.id,
          type: 'PRIVATE_SELLER',
          name: data.displayName || data.fullName || data.email || 'מוכר ללא שם',
          email: data.email || undefined,
          phone: data.phone || undefined,
          subscriptionPlan,
          hasCustomDeal: false,
          roles: ['PRIVATE'],
          primaryRole: 'PRIVATE' as const,
        };
      });
    }

    if (!snapshot) {
      // Should not happen, but TypeScript safety
      return [];
    }

    return snapshot.docs.map((doc: any) => {
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
        hasCustomDeal: false,
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

    return snapshot.docs.map((doc: any) => {
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

/**
 * Admin-only: Fetch all managers (users where isAdmin === true)
 * Managers are platform administrators and should be managed separately from business roles
 */
export async function fetchManagersFromIndex(): Promise<AdminCustomerRow[]> {
  try {
    // Query users collection directly since adminUsersIndex doesn't track isAdmin
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('isAdmin', '==', true));
    const snapshot = await getDocsFromServer(q);
    
    return snapshot.docs.map((doc: any) => {
      const data = doc.data();
      
      // Validate subscriptionPlan
      let subscriptionPlan: SubscriptionPlan = 'FREE';
      if (data.subscriptionPlan && ['FREE', 'PLUS', 'PRO'].includes(data.subscriptionPlan)) {
        subscriptionPlan = data.subscriptionPlan as SubscriptionPlan;
      }
      
      // Determine type based on primaryRole or legacy fields
      // Managers can have any business role, but we display them as MANAGER type
      let type: 'YARD' | 'AGENT' | 'PRIVATE_SELLER' = 'PRIVATE_SELLER';
      if (data.primaryRole === 'YARD' || data.isYard === true) {
        type = 'YARD';
      } else if (data.primaryRole === 'AGENT' || data.isAgent === true) {
        type = 'AGENT';
      }
      
      return {
        id: doc.id,
        type,
        name: data.displayName || data.fullName || data.email || 'מנהל ללא שם',
        email: data.email || undefined,
        phone: data.phone || undefined,
        subscriptionPlan,
        hasCustomDeal: false,
        roles: data.roles || [],
        primaryRole: data.primaryRole || 'PRIVATE',
      };
    });
  } catch (error) {
    console.error('Error fetching managers:', error);
    throw error;
  }
}

