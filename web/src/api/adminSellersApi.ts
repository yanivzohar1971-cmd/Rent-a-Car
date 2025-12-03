import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';

/**
 * Admin-only: Summary of a private seller for admin overview
 */
export interface AdminSellerSummary {
  id: string;
  displayName?: string;
  email?: string;
}

/**
 * Admin-only: Fetch all private sellers from Firestore
 * Sellers are users where canSell === true
 */
export async function fetchAllSellersForAdmin(): Promise<AdminSellerSummary[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('canSell', '==', true));
    const snapshot = await getDocsFromServer(q);

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        displayName: data.fullName || data.displayName || null,
        email: data.email || null,
      };
    });
  } catch (error) {
    console.error('Error fetching all sellers for admin:', error);
    throw error;
  }
}

