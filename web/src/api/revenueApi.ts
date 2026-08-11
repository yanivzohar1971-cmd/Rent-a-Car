/**
 * Revenue API
 * Aggregates revenue data from leads and promotion orders
 */

import { Timestamp, doc, getDocFromServer, collection, query, orderBy, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { fetchLeadsInRange } from './leadsApi';
import { getLeadPrice, getFreeMonthlyLeadQuota } from '../config/billingConfig';
import type {
  RevenueLineItem,
  RevenueBucketSummary,
  RevenueBucketKey,
  RevenueFilters,
  RevenueSource,
  RevenueScope,
} from '../types/Revenue';
import type { PromotionOrder, PromotionOrderStatus, PromotionOrderPaymentMethod } from '../types/Promotion';
import type { Lead, LeadSellerType } from '../types/Lead';
import type { UserProfile } from '../types/UserProfile';

/**
 * Map Firestore document to PromotionOrder
 */
function mapPromotionOrderDoc(docSnap: any): PromotionOrder {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userId: data.userId || '',
    carId: data.carId || null,
    items: data.items || [],
    totalAmount: data.totalAmount || 0,
    currency: data.currency || 'ILS',
    status: (data.status || 'DRAFT') as PromotionOrderStatus,
    paymentMethod: (data.paymentMethod || 'OFFLINE_SIMULATED') as PromotionOrderPaymentMethod,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Fetch all promotion orders from Firestore
 */
async function fetchAllPromotionOrders(): Promise<PromotionOrder[]> {
  try {
    const ordersRef = collection(db, 'promotionOrders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapPromotionOrderDoc);
  } catch (error) {
    console.error('Error fetching all promotion orders:', error);
    throw error;
  }
}

/**
 * Get month number (1-12) from a date
 */
function getMonth(date: Date): number {
  return date.getMonth() + 1;
}

/**
 * Get quarter number (1-4) from a date
 */
function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Create a bucket key string for grouping
 */
function getBucketKeyString(bucket: RevenueBucketKey): string {
  if (bucket.quarter !== undefined) {
    return `${bucket.year}-Q${bucket.quarter}`;
  }
  if (bucket.month !== undefined) {
    return `${bucket.year}-${String(bucket.month).padStart(2, '0')}`;
  }
  return String(bucket.year);
}

/**
 * Create a revenue bucket key from a date
 */
function createBucketKey(date: Date, grouping: 'MONTHLY' | 'QUARTERLY'): RevenueBucketKey {
  const year = date.getFullYear();
  
  if (grouping === 'QUARTERLY') {
    return {
      year,
      quarter: getQuarter(date),
    };
  } else {
    return {
      year,
      month: getMonth(date),
    };
  }
}

/**
 * Convert Firestore Timestamp to JavaScript Date
 */
function timestampToDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp.toDate) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date();
}

/**
 * Aggregate promotion orders into revenue line items with date tracking
 */
async function aggregatePromotionOrders(
  orders: PromotionOrder[],
  filters: RevenueFilters,
  userProfiles: Map<string, UserProfile>
): Promise<Array<RevenueLineItem & { date: Date }>> {
  const items: Array<RevenueLineItem & { date: Date }> = [];
  
  for (const order of orders) {
    // Skip non-PAID orders (only count actual revenue)
    if (order.status !== 'PAID') {
      continue;
    }

    // Filter by date range
    const orderDate = timestampToDate(order.createdAt);
    if (orderDate < filters.startDate || orderDate > filters.endDate) {
      continue;
    }

    // Filter by scope if specified
    const orderScope = order.items[0]?.scope || 'PRIVATE_SELLER_AD';
    let revenueScope: RevenueScope;
    let source: RevenueSource;
    
    if (orderScope === 'YARD_BRAND' || orderScope === 'YARD_CAR') {
      revenueScope = 'YARD';
      source = 'PROMOTION_YARD';
    } else {
      revenueScope = 'PRIVATE';
      source = 'PROMOTION_PRIVATE';
    }

    // Apply scope filter
    if (filters.scope && filters.scope !== 'ALL' && filters.scope !== revenueScope) {
      continue;
    }

    // Apply entity filter if specified
    if (filters.entityId && order.userId !== filters.entityId) {
      continue;
    }

    // Get display name from user profile
    const userProfile = userProfiles.get(order.userId);
    const displayName = userProfile?.fullName || userProfile?.email || undefined;

    // Create line item for this order
    items.push({
      source,
      scope: revenueScope,
      entityId: order.userId,
      displayName,
      count: 1, // One order
      unitPrice: order.totalAmount,
      totalAmount: order.totalAmount,
      date: orderDate,
    });
  }

  return items;
}

/**
 * Aggregate leads into revenue line items with date tracking
 * Only counts billable leads (leads that exceed free quota)
 */
async function aggregateLeads(
  leads: Lead[],
  filters: RevenueFilters,
  userProfiles: Map<string, UserProfile>
): Promise<Array<RevenueLineItem & { date: Date }>> {
  const items: Array<RevenueLineItem & { date: Date }> = [];
  
  // Group leads by seller and month
  const leadsBySellerMonth = new Map<string, {
    leads: Lead[];
    sellerType: LeadSellerType;
    monthKey: string;
  }>();

  for (const lead of leads) {
    // Filter by date range
    const leadDate = timestampToDate(lead.createdAt);
    if (leadDate < filters.startDate || leadDate > filters.endDate) {
      continue;
    }

    // Filter by scope if specified
    const leadScope: RevenueScope = lead.sellerType === 'YARD' ? 'YARD' : 'PRIVATE';
    
    if (filters.scope && filters.scope !== 'ALL' && filters.scope !== leadScope) {
      continue;
    }

    // Apply entity filter if specified
    if (filters.entityId && lead.sellerId !== filters.entityId) {
      continue;
    }

    // Create month key for grouping
      const monthKey = `${leadDate.getFullYear()}-${String(leadDate.getMonth() + 1).padStart(2, '0')}`;
      const sellerMonthKey = `${lead.sellerId}-${monthKey}`;

      if (!leadsBySellerMonth.has(sellerMonthKey)) {
        leadsBySellerMonth.set(sellerMonthKey, {
          leads: [],
          sellerType: lead.sellerType,
          monthKey,
        });
      }
      leadsBySellerMonth.get(sellerMonthKey)!.leads.push(lead);
  }

  // Calculate billable leads per seller-month
  for (const [sellerMonthKey, { leads: monthLeads, sellerType }] of leadsBySellerMonth.entries()) {
    const sellerId = sellerMonthKey.split('-')[0];
    const userProfile = userProfiles.get(sellerId);
    if (!userProfile) {
      continue; // Skip if user profile not found
    }

    const subscriptionPlan = userProfile.subscriptionPlan || 'FREE';
    const freeQuota = getFreeMonthlyLeadQuota(sellerType, subscriptionPlan);
    const leadPrice = getLeadPrice(sellerType, subscriptionPlan);
    
    const totalLeads = monthLeads.length;
    const billableLeads = Math.max(0, totalLeads - freeQuota);
    
    if (billableLeads > 0) {
      const displayName = userProfile.fullName || userProfile.email || undefined;
      const scope: RevenueScope = sellerType === 'YARD' ? 'YARD' : 'PRIVATE';
      
      // Use first lead's date as the bucket date
      const leadDate = timestampToDate(monthLeads[0].createdAt);
      
      items.push({
        source: 'LEAD',
        scope,
        entityId: sellerId,
        displayName,
        count: billableLeads,
        unitPrice: leadPrice,
        totalAmount: billableLeads * leadPrice,
        date: leadDate,
      });
    }
  }

  return items;
}

/**
 * Fetch user profiles for a list of user IDs
 */
async function fetchUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const profiles = new Map<string, UserProfile>();
  
  // Fetch profiles in parallel (limited batches if needed)
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const userDoc = await getDocFromServer(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          profiles.set(userId, {
            uid: userId,
            email: data.email || '',
            fullName: data.fullName || '',
            phone: data.phone || '',
            role: data.role || null,
            canBuy: data.canBuy || false,
            canSell: data.canSell || false,
            isAgent: data.isAgent || false,
            isYard: data.isYard || false,
            isAdmin: data.isAdmin || false,
            status: data.status || 'ACTIVE',
            primaryRole: data.primaryRole || null,
            requestedRole: data.requestedRole || null,
            roleStatus: data.roleStatus || null,
            subscriptionPlan: data.subscriptionPlan || 'FREE',
            billingDealName: data.billingDealName || null,
            billingDealValidUntil: data.billingDealValidUntil || null,
            customFreeMonthlyLeadQuota: data.customFreeMonthlyLeadQuota || null,
            customLeadPrice: data.customLeadPrice || null,
            customFixedMonthlyFee: data.customFixedMonthlyFee || null,
            customCurrency: data.customCurrency || null,
          } as UserProfile);
        }
      } catch (err) {
        console.warn(`Error fetching user profile for ${userId}:`, err);
      }
    })
  );

  return profiles;
}

/**
 * Aggregate revenue data from leads and promotion orders
 */
export async function aggregateRevenue(filters: RevenueFilters): Promise<RevenueBucketSummary[]> {
  try {
    // Fetch all relevant data
    const [allOrders, allLeads] = await Promise.all([
      fetchAllPromotionOrders(),
      fetchLeadsInRange(
        Timestamp.fromDate(filters.startDate),
        Timestamp.fromDate(filters.endDate)
      ),
    ]);

    // Collect all unique user IDs
    const userIds = new Set<string>();
    allOrders.forEach((order: PromotionOrder) => userIds.add(order.userId));
    allLeads.forEach((lead: Lead) => userIds.add(lead.sellerId));

    // Fetch user profiles
    const userProfiles = await fetchUserProfiles(Array.from(userIds));

    // Aggregate line items with dates
    const [promotionItems, leadItems] = await Promise.all([
      aggregatePromotionOrders(allOrders, filters, userProfiles),
      aggregateLeads(allLeads, filters, userProfiles),
    ]);

    const allItems = [...promotionItems, ...leadItems];

    // Group by time bucket
    const buckets = new Map<string, {
      key: RevenueBucketKey;
      items: RevenueLineItem[];
    }>();

    for (const item of allItems) {
      const bucketKey = createBucketKey(item.date, filters.grouping);
      const bucketKeyString = getBucketKeyString(bucketKey);

      if (!buckets.has(bucketKeyString)) {
        buckets.set(bucketKeyString, {
          key: bucketKey,
          items: [],
        });
      }

      // Remove date from line item before storing
      const { date, ...lineItem } = item;
      buckets.get(bucketKeyString)!.items.push(lineItem);
    }

    // Convert to bucket summaries
    const summaries: RevenueBucketSummary[] = Array.from(buckets.values()).map((bucket) => ({
      bucket: bucket.key,
      totalAmount: bucket.items.reduce((sum, item) => sum + item.totalAmount, 0),
      lineItems: bucket.items,
    }));

    // Sort by bucket (newest first)
    summaries.sort((a, b) => {
      if (a.bucket.year !== b.bucket.year) {
        return b.bucket.year - a.bucket.year;
      }
      if (a.bucket.quarter !== undefined && b.bucket.quarter !== undefined) {
        return (b.bucket.quarter || 0) - (a.bucket.quarter || 0);
      }
      if (a.bucket.month !== undefined && b.bucket.month !== undefined) {
        return (b.bucket.month || 0) - (a.bucket.month || 0);
      }
      return 0;
    });

    return summaries;
  } catch (error) {
    console.error('Error aggregating revenue:', error);
    throw error;
  }
}
