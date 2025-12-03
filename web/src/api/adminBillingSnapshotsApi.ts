import { collection, doc, setDoc, getDocsFromServer, getDocFromServer, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { fetchAllYardsForAdmin } from './adminYardsApi';
import { fetchAllSellersForAdmin } from './adminSellersApi';
import { fetchLeadStatsForYardInRange, fetchLeadStatsForSellerInRange, getDateRangeForPeriod } from './leadsApi';
import { getEffectivePlanForUser } from '../config/billingConfig';
import type { BillingSnapshot } from '../types/BillingSnapshot';
import type { LeadSellerType } from '../types/Lead';
import type { UserProfile } from '../types/UserProfile';

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

    // Fetch all entities
    const [yards, sellers] = await Promise.all([
      fetchAllYardsForAdmin(),
      fetchAllSellersForAdmin(),
    ]);

    // Helper function to process an entity
    const processEntity = async (
      entityId: string,
      entityName: string,
      sellerType: LeadSellerType,
      userProfile: UserProfile
    ) => {
      try {
        // Get lead stats
        const stats =
          sellerType === 'YARD'
            ? await fetchLeadStatsForYardInRange(entityId, from, to)
            : await fetchLeadStatsForSellerInRange(entityId, from, to);

        const monthlyTotal = stats.total;

        // Get effective plan (from Firestore or legacy config)
        const effectivePlan = await getEffectivePlanForUser(userProfile);

        // Determine effective values (considering deal overrides)
        let effectiveFreeQuota: number;
        let effectiveLeadPrice: number;
        let effectiveFixedFee: number;
        let effectiveCurrency: string;
        let hasCustomDeal = false;

        if (userProfile.customFreeMonthlyLeadQuota !== null && userProfile.customFreeMonthlyLeadQuota !== undefined) {
          effectiveFreeQuota = userProfile.customFreeMonthlyLeadQuota;
          hasCustomDeal = true;
        } else {
          effectiveFreeQuota = effectivePlan?.freeMonthlyLeadQuota || 0;
        }

        if (userProfile.customLeadPrice !== null && userProfile.customLeadPrice !== undefined) {
          effectiveLeadPrice = userProfile.customLeadPrice;
          hasCustomDeal = true;
        } else {
          effectiveLeadPrice = effectivePlan?.leadPrice || 0;
        }

        if (userProfile.customFixedMonthlyFee !== null && userProfile.customFixedMonthlyFee !== undefined) {
          effectiveFixedFee = userProfile.customFixedMonthlyFee;
          hasCustomDeal = true;
        } else {
          effectiveFixedFee = effectivePlan?.fixedMonthlyFee || 0;
        }

        if (userProfile.customCurrency) {
          effectiveCurrency = userProfile.customCurrency;
          hasCustomDeal = true;
        } else {
          effectiveCurrency = effectivePlan?.currency || 'ILS';
        }

        // Calculate billing
        const freeLeadsUsed = Math.min(monthlyTotal, effectiveFreeQuota);
        const billableLeads = Math.max(0, monthlyTotal - effectiveFreeQuota);
        const variablePart = billableLeads * effectiveLeadPrice;
        const totalAmount = variablePart + effectiveFixedFee;

        const snapshot: BillingSnapshot = {
          periodId,
          sellerId: entityId,
          sellerType,
          name: entityName,
          subscriptionPlan: userProfile.subscriptionPlan || 'FREE',
          monthlyTotal,
          freeQuota: effectiveFreeQuota,
          billableLeads,
          leadPrice: effectiveLeadPrice,
          fixedMonthlyFee: effectiveFixedFee,
          amountToCharge: totalAmount,
          currency: effectiveCurrency,
          status: 'OPEN',
          createdAt: serverTimestamp() as Timestamp,
          closedAt: serverTimestamp() as Timestamp,
          externalInvoiceId: null,
          externalInvoiceNumber: null,
          externalInvoiceUrl: null,
          billingDealName: userProfile.billingDealName || null,
          billingDealValidUntil: userProfile.billingDealValidUntil || null,
          hasCustomDeal,
          freeLeadsUsed,
        };

        return { snapshot, sellerId: entityId };
      } catch (err) {
        console.error(`Error processing entity ${entityId} for period ${periodId}:`, err);
        return null;
      }
    };

    // Process all entities
    const allSnapshots = await Promise.all([
      // Process yards
      ...yards.map(async (yard) => {
        // Load full user profile
        const userDoc = await getDocFromServer(doc(db, 'users', yard.id));
        if (!userDoc.exists()) {
          console.warn(`User ${yard.id} not found`);
          return null;
        }
        const userData = userDoc.data();
        const userProfile: UserProfile = {
          uid: yard.id,
          email: userData.email || '',
          fullName: userData.fullName || '',
          phone: userData.phone || '',
          role: userData.role || null,
          canBuy: userData.canBuy || false,
          canSell: userData.canSell || false,
          isAgent: userData.isAgent || false,
          isYard: userData.isYard || false,
          isAdmin: userData.isAdmin || false,
          status: userData.status || 'ACTIVE',
          primaryRole: userData.primaryRole || null,
          requestedRole: userData.requestedRole || null,
          roleStatus: userData.roleStatus || null,
          subscriptionPlan: userData.subscriptionPlan || 'FREE',
          billingDealName: userData.billingDealName || null,
          billingDealValidUntil: userData.billingDealValidUntil || null,
          customFreeMonthlyLeadQuota: userData.customFreeMonthlyLeadQuota || null,
          customLeadPrice: userData.customLeadPrice || null,
          customFixedMonthlyFee: userData.customFixedMonthlyFee || null,
          customCurrency: userData.customCurrency || null,
        };
        return processEntity(yard.id, yard.name, 'YARD', userProfile);
      }),
      // Process sellers
      ...sellers.map(async (seller) => {
        const userDoc = await getDocFromServer(doc(db, 'users', seller.id));
        if (!userDoc.exists()) {
          console.warn(`User ${seller.id} not found`);
          return null;
        }
        const userData = userDoc.data();
        const userProfile: UserProfile = {
          uid: seller.id,
          email: userData.email || '',
          fullName: userData.fullName || '',
          phone: userData.phone || '',
          role: userData.role || null,
          canBuy: userData.canBuy || false,
          canSell: userData.canSell || false,
          isAgent: userData.isAgent || false,
          isYard: userData.isYard || false,
          isAdmin: userData.isAdmin || false,
          status: userData.status || 'ACTIVE',
          primaryRole: userData.primaryRole || null,
          requestedRole: userData.requestedRole || null,
          roleStatus: userData.roleStatus || null,
          subscriptionPlan: userData.subscriptionPlan || 'FREE',
          billingDealName: userData.billingDealName || null,
          billingDealValidUntil: userData.billingDealValidUntil || null,
          customFreeMonthlyLeadQuota: userData.customFreeMonthlyLeadQuota || null,
          customLeadPrice: userData.customLeadPrice || null,
          customFixedMonthlyFee: userData.customFixedMonthlyFee || null,
          customCurrency: userData.customCurrency || null,
        };
        return processEntity(
          seller.id,
          seller.displayName || seller.email || 'מוכר ללא שם',
          'PRIVATE',
          userProfile
        );
      }),
      // Process agents (if they have leads in the future)
      // For now, agents are not included in billing, but the structure is ready
    ]);

    // Filter out null results
    const validSnapshots = allSnapshots.filter((s): s is { snapshot: BillingSnapshot; sellerId: string } => s !== null);

    await Promise.all(
      validSnapshots.map(async ({ snapshot, sellerId }) => {
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
        fixedMonthlyFee: data.fixedMonthlyFee ?? 0, // Default to 0 for backward compatibility
        amountToCharge: data.amountToCharge || 0,
        currency: data.currency || 'ILS',
        status: data.status || 'OPEN',
        createdAt: data.createdAt,
        closedAt: data.closedAt,
        externalInvoiceId: data.externalInvoiceId || null,
        externalInvoiceNumber: data.externalInvoiceNumber || null,
        externalInvoiceUrl: data.externalInvoiceUrl || null,
        billingDealName: data.billingDealName || null,
        billingDealValidUntil: data.billingDealValidUntil || null,
        hasCustomDeal: data.hasCustomDeal || false,
        freeLeadsUsed: data.freeLeadsUsed ?? (data.monthlyTotal ? Math.min(data.monthlyTotal, data.freeQuota || 0) : 0),
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

