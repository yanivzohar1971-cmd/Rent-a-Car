import { collection, doc, setDoc, getDocsFromServer, getDocFromServer, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { fetchAllYardsForAdmin } from './adminYardsApi';
import { fetchAllSellersForAdmin } from './adminSellersApi';
import { fetchLeadStatsForYardInRange, fetchLeadStatsForSellerInRange, getDateRangeForPeriod } from './leadsApi';
import { getFreeMonthlyLeadQuota, getLeadPrice } from '../config/billingConfig';
import type { BillingSnapshot } from '../types/BillingSnapshot';
import type { LeadSellerType } from '../types/Lead';

/**
 * Close a billing period by generating snapshots for all entities
 * @param periodId Period ID in 'YYYY-MM' format (e.g. '2025-01')
 */
export async function closeBillingPeriod(periodId: string): Promise<void> {
  try {
    // Validate periodId format
    if (!/^\d{4}-\d{2}$/.test(periodId)) {
      throw new Error(`Invalid periodId format: ${periodId}. Expected YYYY-MM`);
    }

    // Get date range for the period
    const { from, to } = getDateRangeForPeriod(periodId);

    // Fetch all yards and sellers
    const [yards, sellers] = await Promise.all([
      fetchAllYardsForAdmin(),
      fetchAllSellersForAdmin(),
    ]);

    // Process yards
    const yardSnapshots = await Promise.all(
      yards.map(async (yard) => {
        try {
          const stats = await fetchLeadStatsForYardInRange(yard.id, from, to);
          const plan = yard.subscriptionPlan ?? 'FREE';
          const sellerType: LeadSellerType = 'YARD';
          const monthlyTotal = stats.total;
          const freeQuota = getFreeMonthlyLeadQuota(sellerType, plan);
          const billableLeads = Math.max(0, monthlyTotal - freeQuota);
          const leadPrice = getLeadPrice(sellerType, plan);
          const amountToCharge = billableLeads * leadPrice;

          const snapshot: BillingSnapshot = {
            periodId,
            sellerId: yard.id,
            sellerType: 'YARD',
            name: yard.name,
            subscriptionPlan: plan,
            monthlyTotal,
            freeQuota,
            billableLeads,
            leadPrice,
            amountToCharge,
            currency: 'ILS',
            status: 'OPEN',
            createdAt: serverTimestamp() as Timestamp,
            closedAt: serverTimestamp() as Timestamp,
            externalInvoiceId: null,
            externalInvoiceNumber: null,
            externalInvoiceUrl: null,
          };

          return { snapshot, sellerId: yard.id };
        } catch (err) {
          console.error(`Error processing yard ${yard.id} for period ${periodId}:`, err);
          return null;
        }
      })
    );

    // Process sellers
    const sellerSnapshots = await Promise.all(
      sellers.map(async (seller) => {
        try {
          const stats = await fetchLeadStatsForSellerInRange(seller.id, from, to);
          const plan = seller.subscriptionPlan ?? 'FREE';
          const sellerType: LeadSellerType = 'PRIVATE';
          const monthlyTotal = stats.total;
          const freeQuota = getFreeMonthlyLeadQuota(sellerType, plan);
          const billableLeads = Math.max(0, monthlyTotal - freeQuota);
          const leadPrice = getLeadPrice(sellerType, plan);
          const amountToCharge = billableLeads * leadPrice;

          const snapshot: BillingSnapshot = {
            periodId,
            sellerId: seller.id,
            sellerType: 'PRIVATE',
            name: seller.displayName || seller.email || 'מוכר ללא שם',
            subscriptionPlan: plan,
            monthlyTotal,
            freeQuota,
            billableLeads,
            leadPrice,
            amountToCharge,
            currency: 'ILS',
            status: 'OPEN',
            createdAt: serverTimestamp() as Timestamp,
            closedAt: serverTimestamp() as Timestamp,
            externalInvoiceId: null,
            externalInvoiceNumber: null,
            externalInvoiceUrl: null,
          };

          return { snapshot, sellerId: seller.id };
        } catch (err) {
          console.error(`Error processing seller ${seller.id} for period ${periodId}:`, err);
          return null;
        }
      })
    );

    // Write all snapshots to Firestore
    const allSnapshots = [...yardSnapshots, ...sellerSnapshots].filter((s): s is { snapshot: BillingSnapshot; sellerId: string } => s !== null);

    await Promise.all(
      allSnapshots.map(async ({ snapshot, sellerId }) => {
        const docRef = doc(db, 'billingPeriods', periodId, 'entities', sellerId);
        
        // Check if document exists to preserve createdAt
        const existingDoc = await getDocFromServer(docRef);
        const updateData: Partial<BillingSnapshot> = {
          ...snapshot,
          closedAt: serverTimestamp() as Timestamp,
        };

        if (existingDoc.exists()) {
          // Preserve original createdAt, only update closedAt
          const existingData = existingDoc.data();
          if (existingData.createdAt) {
            updateData.createdAt = existingData.createdAt;
          }
        } else {
          // New document - set createdAt
          updateData.createdAt = serverTimestamp() as Timestamp;
        }

        await setDoc(docRef, updateData, { merge: false }); // Overwrite completely
      })
    );
  } catch (error) {
    console.error('Error closing billing period:', error);
    throw error;
  }
}

/**
 * Fetch list of all billing periods (periodIds)
 * @returns Array of periodId strings, sorted descending (newest first)
 * Returns empty array if no periods exist (not an error)
 */
export async function fetchBillingPeriods(): Promise<string[]> {
  try {
    const periodsRef = collection(db, 'billingPeriods');
    const snapshot = await getDocsFromServer(periodsRef);
    
    const periodIds: string[] = [];
    snapshot.docs.forEach((doc) => {
      periodIds.push(doc.id);
    });

    // Sort descending (newest first)
    return periodIds.sort((a, b) => b.localeCompare(a));
  } catch (error: any) {
    // If collection doesn't exist or is empty, return empty array (not an error)
    // Only throw for real errors (permissions, network, etc.)
    if (error?.code === 'permission-denied' || error?.code === 'unavailable') {
      console.error('Error fetching billing periods:', error);
      throw error;
    }
    // For other cases (e.g., collection doesn't exist yet), return empty array
    console.warn('No billing periods found or collection not initialized:', error?.message);
    return [];
  }
}

/**
 * Fetch all billing snapshots for a specific period
 * @param periodId Period ID in 'YYYY-MM' format
 * @returns Array of BillingSnapshot objects
 * Returns empty array if period has no snapshots (not an error)
 */
export async function fetchBillingSnapshotsForPeriod(periodId: string): Promise<BillingSnapshot[]> {
  try {
    const entitiesRef = collection(db, 'billingPeriods', periodId, 'entities');
    const snapshot = await getDocsFromServer(entitiesRef);
    
    const snapshots: BillingSnapshot[] = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      snapshots.push({
        periodId: data.periodId || periodId,
        sellerId: data.sellerId || doc.id,
        sellerType: data.sellerType,
        name: data.name || '',
        subscriptionPlan: data.subscriptionPlan || 'FREE',
        monthlyTotal: data.monthlyTotal || 0,
        freeQuota: data.freeQuota || 0,
        billableLeads: data.billableLeads || 0,
        leadPrice: data.leadPrice || 0,
        amountToCharge: data.amountToCharge || 0,
        currency: data.currency || 'ILS',
        status: data.status || 'OPEN',
        createdAt: data.createdAt,
        closedAt: data.closedAt,
        externalInvoiceId: data.externalInvoiceId || null,
        externalInvoiceNumber: data.externalInvoiceNumber || null,
        externalInvoiceUrl: data.externalInvoiceUrl || null,
      } as BillingSnapshot);
    });

    return snapshots;
  } catch (error: any) {
    // If subcollection doesn't exist or is empty, return empty array (not an error)
    // Only throw for real errors (permissions, network, invalid periodId, etc.)
    if (error?.code === 'permission-denied' || error?.code === 'unavailable' || error?.code === 'invalid-argument') {
      console.error('Error fetching billing snapshots for period:', error);
      throw error;
    }
    // For other cases (e.g., subcollection doesn't exist yet), return empty array
    console.warn(`No snapshots found for period ${periodId} or subcollection not initialized:`, error?.message);
    return [];
  }
}

/**
 * Format a date as YYYY-MM period ID
 */
export function formatToYYYYMM(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

