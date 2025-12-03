import { collection, addDoc, getDocsFromServer, doc, getDocFromServer, updateDoc, query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { Lead, LeadStatus, LeadSource, LeadSellerType } from '../types/Lead';

/**
 * Map Firestore document to Lead
 */
function mapLeadDoc(docSnap: any): Lead {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    carId: data.carId || '',
    carTitle: data.carTitle || '',
    sellerType: (data.sellerType || 'PRIVATE') as LeadSellerType,
    sellerId: data.sellerId || '',
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    customerEmail: data.customerEmail || null,
    note: data.note || null,
    source: (data.source || 'OTHER') as LeadSource,
    status: (data.status || 'NEW') as LeadStatus,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Parameters for creating a new lead
 */
export interface CreateLeadParams {
  carId: string;
  carTitle: string;
  sellerType: LeadSellerType;
  sellerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  note?: string | null;
  source: LeadSource;
}

/**
 * Create a new lead
 */
export async function createLead(params: CreateLeadParams): Promise<Lead> {
  try {
    const leadsRef = collection(db, 'leads');
    const now = serverTimestamp();
    
    const docRef = await addDoc(leadsRef, {
      carId: params.carId,
      carTitle: params.carTitle,
      sellerType: params.sellerType,
      sellerId: params.sellerId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail || null,
      note: params.note || null,
      source: params.source,
      status: 'NEW' as LeadStatus,
      createdAt: now,
      updatedAt: now,
    });

    // Fetch the created document to return it
    const leadDocRef = doc(db, 'leads', docRef.id);
    const leadDocSnap = await getDocFromServer(leadDocRef);
    
    if (leadDocSnap.exists()) {
      return mapLeadDoc(leadDocSnap);
    }

    // Fallback: return a constructed Lead (timestamps will be resolved on next fetch)
    return {
      id: docRef.id,
      carId: params.carId,
      carTitle: params.carTitle,
      sellerType: params.sellerType,
      sellerId: params.sellerId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail || null,
      note: params.note || null,
      source: params.source,
      status: 'NEW',
      createdAt: now as Timestamp,
      updatedAt: now as Timestamp,
    };
  } catch (error) {
    console.error('Error creating lead:', error);
    throw error;
  }
}

/**
 * Fetch leads for a private seller (by sellerUserId)
 */
export async function fetchLeadsForSeller(sellerUserId: string): Promise<Lead[]> {
  try {
    const leadsRef = collection(db, 'leads');
    const q = query(
      leadsRef,
      where('sellerType', '==', 'PRIVATE'),
      where('sellerId', '==', sellerUserId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapLeadDoc);
  } catch (error) {
    console.error('Error fetching leads for seller:', error);
    throw error;
  }
}

/**
 * Fetch leads for a yard (by yardId)
 */
export async function fetchLeadsForYard(yardId: string): Promise<Lead[]> {
  try {
    const leadsRef = collection(db, 'leads');
    const q = query(
      leadsRef,
      where('sellerType', '==', 'YARD'),
      where('sellerId', '==', yardId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapLeadDoc);
  } catch (error) {
    console.error('Error fetching leads for yard:', error);
    throw error;
  }
}

/**
 * Update lead status
 */
export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  try {
    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating lead status:', error);
    throw error;
  }
}

/**
 * Update lead (generic function for future extensibility)
 */
export interface UpdateLeadParams {
  status?: LeadStatus;
  note?: string | null;
}

/**
 * Update a lead with partial data
 */
export async function updateLead(leadId: string, updates: UpdateLeadParams): Promise<void> {
  try {
    const leadRef = doc(db, 'leads', leadId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };
    
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }
    
    if (updates.note !== undefined) {
      updateData.note = updates.note;
    }
    
    await updateDoc(leadRef, updateData);
  } catch (error) {
    console.error('Error updating lead:', error);
    throw error;
  }
}

/**
 * Lead statistics
 */
export interface LeadStats {
  total: number;
  newCount: number;
  inProgressCount: number;
  closedCount: number;
  lostCount: number;
}

/**
 * Fetch lead statistics for a yard
 * Client-side aggregation for now
 */
export async function fetchLeadStatsForYard(yardId: string): Promise<LeadStats> {
  try {
    const leads = await fetchLeadsForYard(yardId);
    
    const stats: LeadStats = {
      total: leads.length,
      newCount: 0,
      inProgressCount: 0,
      closedCount: 0,
      lostCount: 0,
    };
    
    leads.forEach((lead) => {
      switch (lead.status) {
        case 'NEW':
          stats.newCount++;
          break;
        case 'IN_PROGRESS':
          stats.inProgressCount++;
          break;
        case 'CLOSED':
          stats.closedCount++;
          break;
        case 'LOST':
          stats.lostCount++;
          break;
      }
    });
    
    return stats;
  } catch (error) {
    console.error('Error fetching lead stats for yard:', error);
    throw error;
  }
}

/**
 * Fetch lead statistics for a private seller
 * Client-side aggregation for now
 */
export async function fetchLeadStatsForSeller(sellerUserId: string): Promise<LeadStats> {
  try {
    const leads = await fetchLeadsForSeller(sellerUserId);
    
    const stats: LeadStats = {
      total: leads.length,
      newCount: 0,
      inProgressCount: 0,
      closedCount: 0,
      lostCount: 0,
    };
    
    leads.forEach((lead) => {
      switch (lead.status) {
        case 'NEW':
          stats.newCount++;
          break;
        case 'IN_PROGRESS':
          stats.inProgressCount++;
          break;
        case 'CLOSED':
          stats.closedCount++;
          break;
        case 'LOST':
          stats.lostCount++;
          break;
      }
    });
    
    return stats;
  } catch (error) {
    console.error('Error fetching lead stats for seller:', error);
    throw error;
  }
}

/**
 * Get start and end of current month as Firestore Timestamps
 */
function getCurrentMonthRange(): { start: Timestamp; end: Timestamp } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
  };
}

/**
 * Monthly lead statistics (current month)
 */
export interface LeadMonthlyStats {
  total: number;
  newCount: number;
  inProgressCount: number;
  closedCount: number;
  lostCount: number;
}

/**
 * Fetch monthly lead statistics for a yard (current month only)
 */
export async function fetchLeadMonthlyStatsForYardCurrentMonth(yardId: string): Promise<LeadMonthlyStats> {
  try {
    const { start, end } = getCurrentMonthRange();
    const leadsRef = collection(db, 'leads');
    const q = query(
      leadsRef,
      where('sellerType', '==', 'YARD'),
      where('sellerId', '==', yardId),
      where('createdAt', '>=', start),
      where('createdAt', '<=', end)
    );
    const snapshot = await getDocsFromServer(q);
    
    const stats: LeadMonthlyStats = {
      total: snapshot.docs.length,
      newCount: 0,
      inProgressCount: 0,
      closedCount: 0,
      lostCount: 0,
    };
    
    snapshot.docs.forEach((docSnap) => {
      const lead = mapLeadDoc(docSnap);
      switch (lead.status) {
        case 'NEW':
          stats.newCount++;
          break;
        case 'IN_PROGRESS':
          stats.inProgressCount++;
          break;
        case 'CLOSED':
          stats.closedCount++;
          break;
        case 'LOST':
          stats.lostCount++;
          break;
      }
    });
    
    return stats;
  } catch (error) {
    console.error('Error fetching monthly lead stats for yard:', error);
    throw error;
  }
}

/**
 * Fetch monthly lead statistics for a private seller (current month only)
 */
export async function fetchLeadMonthlyStatsForSellerCurrentMonth(sellerUserId: string): Promise<LeadMonthlyStats> {
  try {
    const { start, end } = getCurrentMonthRange();
    const leadsRef = collection(db, 'leads');
    const q = query(
      leadsRef,
      where('sellerType', '==', 'PRIVATE'),
      where('sellerId', '==', sellerUserId),
      where('createdAt', '>=', start),
      where('createdAt', '<=', end)
    );
    const snapshot = await getDocsFromServer(q);
    
    const stats: LeadMonthlyStats = {
      total: snapshot.docs.length,
      newCount: 0,
      inProgressCount: 0,
      closedCount: 0,
      lostCount: 0,
    };
    
    snapshot.docs.forEach((docSnap) => {
      const lead = mapLeadDoc(docSnap);
      switch (lead.status) {
        case 'NEW':
          stats.newCount++;
          break;
        case 'IN_PROGRESS':
          stats.inProgressCount++;
          break;
        case 'CLOSED':
          stats.closedCount++;
          break;
        case 'LOST':
          stats.lostCount++;
          break;
      }
    });
    
    return stats;
  } catch (error) {
    console.error('Error fetching monthly lead stats for seller:', error);
    throw error;
  }
}

