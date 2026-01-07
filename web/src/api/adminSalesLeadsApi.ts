/**
 * Admin Sales/Leads API
 * 
 * Fetches leads and sales data for a customer (by UID or email).
 * Used by AdminCustomersPage modal for the Sales/Leads tab.
 */

import { collection, getDocsFromServer, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { Timestamp } from 'firebase/firestore';

/**
 * Lead item for admin display
 */
export interface AdminLeadItem {
  id: string;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
  carId: string;
  carTitle: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  status: string;
  source: string;
  sellerType: 'YARD' | 'PRIVATE';
  sellerId: string;
}

/**
 * Response metadata for leads query
 */
export interface FetchLeadsResponse {
  items: AdminLeadItem[];
  meta: {
    fromSellerId: number;
    fromEmail: number;
    deduped: number;
    total: number;
  };
}

/**
 * Fetch leads for a customer with deduplication
 * 
 * Tries multiple strategies:
 * 1. Leads where sellerId == uid (if customer is a seller)
 * 2. Leads where customerEmail == email (if customer made inquiries)
 * 
 * Returns deduplicated, sorted list (max 50 items) with metadata.
 */
export async function fetchLeadsForCustomer(params: { uid: string; email?: string }): Promise<FetchLeadsResponse> {
  const { uid, email } = params;
  const leadsMap = new Map<string, AdminLeadItem>();
  let fromSellerId = 0;
  let fromEmail = 0;

  try {
    // Strategy 1: Leads where sellerId == uid (customer is a seller)
    if (uid && uid.trim() !== '') {
      try {
        const leadsRef = collection(db, 'leads');
        const q1 = query(
          leadsRef,
          where('sellerId', '==', uid.trim()),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snapshot1 = await getDocsFromServer(q1);
        fromSellerId = snapshot1.docs.length;
        
        snapshot1.docs.forEach((doc) => {
          const data = doc.data();
          const lead: AdminLeadItem = {
            id: doc.id,
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            carId: data.carId || '',
            carTitle: data.carTitle || '',
            customerName: data.customerName || '',
            customerPhone: data.customerPhone || '',
            customerEmail: data.customerEmail || null,
            status: data.status || 'NEW',
            source: data.source || 'OTHER',
            sellerType: (data.sellerType || 'PRIVATE') as 'YARD' | 'PRIVATE',
            sellerId: data.sellerId || '',
          };
          // Map ensures deduplication by id
          leadsMap.set(doc.id, lead);
        });
      } catch (err: any) {
        // Index might not exist, continue to next strategy
        console.warn('Could not query leads by sellerId:', err);
      }
    }

    // Strategy 2: Leads where customerEmail == email (customer made inquiries)
    if (email && email.trim() !== '' && leadsMap.size < 50) {
      try {
        const leadsRef = collection(db, 'leads');
        const q2 = query(
          leadsRef,
          where('customerEmail', '==', email.trim()),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snapshot2 = await getDocsFromServer(q2);
        fromEmail = snapshot2.docs.length;
        
        snapshot2.docs.forEach((doc) => {
          // Only add if not already in map (deduplication)
          if (!leadsMap.has(doc.id)) {
            const data = doc.data();
            const lead: AdminLeadItem = {
              id: doc.id,
              createdAt: data.createdAt || null,
              updatedAt: data.updatedAt || null,
              carId: data.carId || '',
              carTitle: data.carTitle || '',
              customerName: data.customerName || '',
              customerPhone: data.customerPhone || '',
              customerEmail: data.customerEmail || null,
              status: data.status || 'NEW',
              source: data.source || 'OTHER',
              sellerType: (data.sellerType || 'PRIVATE') as 'YARD' | 'PRIVATE',
              sellerId: data.sellerId || '',
            };
            leadsMap.set(doc.id, lead);
          }
        });
      } catch (err: any) {
        // Index might not exist, continue
        console.warn('Could not query leads by customerEmail:', err);
      }
    }

    // Convert map to array and sort by createdAt desc (fallback to updatedAt)
    const allLeads = Array.from(leadsMap.values());
    allLeads.sort((a, b) => {
      // Prefer createdAt, fallback to updatedAt
      const aTime = a.createdAt?.toMillis() || a.updatedAt?.toMillis() || 0;
      const bTime = b.createdAt?.toMillis() || b.updatedAt?.toMillis() || 0;
      return bTime - aTime; // Descending
    });

    // Limit to 50 final items
    const finalLeads = allLeads.slice(0, 50);
    const deduped = fromSellerId + fromEmail - finalLeads.length;

    return {
      items: finalLeads,
      meta: {
        fromSellerId,
        fromEmail,
        deduped: Math.max(0, deduped),
        total: finalLeads.length,
      },
    };
  } catch (error) {
    console.error('Error fetching leads for customer:', error);
    throw error;
  }
}

