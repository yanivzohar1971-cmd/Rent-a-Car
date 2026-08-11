import { collection, getDocsFromServer, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { YardLead, YardLeadStatus } from '../types/YardLead';

/**
 * Filters for yard leads
 */
export interface YardLeadsFilters {
  status?: YardLeadStatus | 'ALL';
  text?: string; // Search in name, phone, email, message
}

/**
 * Sort configuration for yard leads
 */
export interface YardLeadsSort {
  field: 'createdAt';
  direction: 'desc' | 'asc';
}

/**
 * Map Firestore document to YardLead
 */
function mapLeadDoc(docSnap: any): YardLead {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    carId: data.carId || '',
    yardUid: data.yardUid || '',
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || null,
    message: data.message || null,
    status: (data.status || 'NEW') as YardLeadStatus,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Fetch yard leads with filters and sorting
 * Firestore path: users/{yardUid}/leads
 */
export async function fetchYardLeads(
  yardUid: string,
  filters?: YardLeadsFilters,
  sort?: YardLeadsSort
): Promise<YardLead[]> {
  try {
    const leadsRef = collection(db, 'users', yardUid, 'leads');
    
    // Build query with server-side filters
    const constraints: any[] = [];
    
    // Status filter (server-side if not 'ALL')
    if (filters?.status && filters.status !== 'ALL') {
      constraints.push(where('status', '==', filters.status));
    }
    
    // Sort (server-side)
    const sortField = sort?.field || 'createdAt';
    const sortDirection = sort?.direction || 'desc';
    constraints.push(orderBy(sortField, sortDirection));
    
    const q = query(leadsRef, ...constraints);
    const snapshot = await getDocsFromServer(q);
    
    let leads = snapshot.docs.map(mapLeadDoc);
    
    // Apply text search client-side (if provided)
    if (filters?.text) {
      const searchText = filters.text.toLowerCase();
      leads = leads.filter((lead) => {
        const searchableText = [
          lead.name,
          lead.phone,
          lead.email,
          lead.message,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(searchText);
      });
    }
    
    return leads;
  } catch (error) {
    console.error('Error fetching yard leads:', error);
    throw error;
  }
}

/**
 * Observe yard leads in real-time
 * Returns unsubscribe function
 */
export function observeYardLeads(
  yardUid: string,
  filters: YardLeadsFilters,
  sort: YardLeadsSort,
  callback: (leads: YardLead[]) => void
): () => void {
  const leadsRef = collection(db, 'users', yardUid, 'leads');
  
  // Build query with server-side filters
  const constraints: any[] = [];
  
  // Status filter (server-side if not 'ALL')
  if (filters.status && filters.status !== 'ALL') {
    constraints.push(where('status', '==', filters.status));
  }
  
  // Sort (server-side)
  const sortField = sort.field || 'createdAt';
  const sortDirection = sort.direction || 'desc';
  constraints.push(orderBy(sortField, sortDirection));
  
  const q = query(leadsRef, ...constraints);
  
  return onSnapshot(
    q,
    (snapshot) => {
      let leads = snapshot.docs.map(mapLeadDoc);
      
      // Apply text search client-side (if provided)
      if (filters.text) {
        const searchText = filters.text.toLowerCase();
        leads = leads.filter((lead) => {
          const searchableText = [
            lead.name,
            lead.phone,
            lead.email,
            lead.message,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchableText.includes(searchText);
        });
      }
      
      callback(leads);
    },
    (error) => {
      console.error('Error observing yard leads:', error);
      callback([]);
    }
  );
}

/**
 * Update lead status
 */
export async function updateLeadStatus(
  yardUid: string,
  leadId: string,
  newStatus: YardLeadStatus
): Promise<void> {
  try {
    const leadRef = doc(db, 'users', yardUid, 'leads', leadId);
    await updateDoc(leadRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating lead status:', error);
    throw error;
  }
}

