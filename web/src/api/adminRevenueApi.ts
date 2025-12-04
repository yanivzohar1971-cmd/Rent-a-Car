/**
 * Admin Revenue API
 * Provides revenue analytics and billing data for Admin users
 */

import { Timestamp, collection, query, orderBy, getDocsFromServer, doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { fetchLeadsInRange } from './leadsApi';
import { getFreeMonthlyLeadQuota } from '../config/billingConfig';
import type { PromotionOrder, PromotionOrderStatus } from '../types/Promotion';
import type { Lead } from '../types/Lead';
import type { SubscriptionPlan, UserProfile } from '../types/UserProfile';

/**
 * Promotion Revenue Summary for a specific period
 */
export interface PromotionRevenueSummary {
  periodKey: string; // e.g. '2025-01' for month
  totalOrders: number; // count of paid orders
  totalAmountIls: number; // sum of totalAmountIls of PAID orders
  byScope: {
    CAR: number; // revenue from CAR scope promotions
    YARD: number; // revenue from YARD scope promotions
  };
  byProductCode: Record<string, number>; // code -> totalAmountIls
}

/**
 * Yard Lead Billing Row for a specific yard and month
 */
export interface YardLeadBillingRow {
  yardId: string;
  yardName?: string;
  subscriptionPlan: SubscriptionPlan;
  month: string; // 'YYYY-MM'
  totalLeads: number;
  freeLeads: number;
  billableLeads: number;
}

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
    paymentMethod: data.paymentMethod || 'OFFLINE_SIMULATED',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
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
 * Get month key string from date (YYYY-MM format)
 */
function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse month string (YYYY-MM) to date range
 */
function parseMonthToDateRange(monthStr: string): { from: Date; to: Date } {
  const [yearStr, monthStr_] = monthStr.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr_) - 1; // JS months: 0-11
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0); // First day of next month (exclusive)
  return { from, to };
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
 * Fetch user profile from Firestore
 */
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDocFromServer(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return null;
    }
    const data = userDoc.data();
    return {
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
      subscriptionPlan: (data.subscriptionPlan || 'FREE') as SubscriptionPlan,
      billingDealName: data.billingDealName || null,
      billingDealValidUntil: data.billingDealValidUntil || null,
      customFreeMonthlyLeadQuota: data.customFreeMonthlyLeadQuota || null,
      customLeadPrice: data.customLeadPrice || null,
      customFixedMonthlyFee: data.customFixedMonthlyFee || null,
      customCurrency: data.customCurrency || null,
    };
  } catch (error) {
    console.error(`Error fetching user profile for ${userId}:`, error);
    return null;
  }
}

/**
 * Get promotion revenue aggregated by month
 * 
 * @param fromMonthInclusive Start month in 'YYYY-MM' format (inclusive)
 * @param toMonthInclusive End month in 'YYYY-MM' format (inclusive)
 * @returns Array of revenue summaries, one per month
 */
export async function getPromotionRevenueByMonth(
  fromMonthInclusive: string,
  toMonthInclusive: string
): Promise<PromotionRevenueSummary[]> {
  try {
    // Parse date ranges
    const fromRange = parseMonthToDateRange(fromMonthInclusive);
    const toRange = parseMonthToDateRange(toMonthInclusive);
    
    // Fetch all promotion orders
    const allOrders = await fetchAllPromotionOrders();
    
    // Filter orders by date range and status (only PAID orders count as revenue)
    const filteredOrders = allOrders.filter((order) => {
      if (order.status !== 'PAID') {
        return false;
      }
      
      // Use createdAt or updatedAt to determine when order was paid
      // For now, we'll use createdAt as the payment date
      const orderDate = timestampToDate(order.createdAt);
      return orderDate >= fromRange.from && orderDate < toRange.to;
    });
    
    // Group orders by month
    const revenueByMonth = new Map<string, {
      orders: PromotionOrder[];
      totalAmount: number;
      byScope: { CAR: number; YARD: number };
      byProductCode: Record<string, number>;
    }>();
    
    // Fetch all active promotion products to get product codes
    // For now, we'll extract from order items or use a placeholder
    // In the future, we can fetch products and match by productId
    
    for (const order of filteredOrders) {
      const orderDate = timestampToDate(order.createdAt);
      const monthKey = getMonthKey(orderDate);
      
      if (!revenueByMonth.has(monthKey)) {
        revenueByMonth.set(monthKey, {
          orders: [],
          totalAmount: 0,
          byScope: { CAR: 0, YARD: 0 },
          byProductCode: {},
        });
      }
      
      const monthData = revenueByMonth.get(monthKey)!;
      monthData.orders.push(order);
      
      // Use totalAmount as priceIls (convert if currency differs)
      const amountIls = order.currency === 'ILS' ? order.totalAmount : order.totalAmount; // TODO: add currency conversion if needed
      monthData.totalAmount += amountIls;
      
      // Determine scope from order items
      const hasYardScope = order.items.some((item) => 
        item.scope === 'YARD_BRAND' || item.scope === 'YARD_CAR'
      );
      
      if (hasYardScope) {
        monthData.byScope.YARD += amountIls;
      } else {
        monthData.byScope.CAR += amountIls;
      }
      
      // Group by product (for now, use item name or productId as code)
      for (const item of order.items) {
        const productCode = item.productId || item.name || 'UNKNOWN';
        if (!monthData.byProductCode[productCode]) {
          monthData.byProductCode[productCode] = 0;
        }
        monthData.byProductCode[productCode] += item.pricePerUnit * item.quantity;
      }
    }
    
    // Generate summaries for all months in range (including months with no orders)
    const summaries: PromotionRevenueSummary[] = [];
    const fromDate = fromRange.from;
    const toDate = toRange.to;
    
    let currentDate = new Date(fromDate);
    while (currentDate < toDate) {
      const monthKey = getMonthKey(currentDate);
      const monthData = revenueByMonth.get(monthKey);
      
      summaries.push({
        periodKey: monthKey,
        totalOrders: monthData?.orders.length || 0,
        totalAmountIls: monthData?.totalAmount || 0,
        byScope: monthData?.byScope || { CAR: 0, YARD: 0 },
        byProductCode: monthData?.byProductCode || {},
      });
      
      // Move to next month
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    }
    
    // Sort by period key (newest first)
    summaries.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
    
    return summaries;
  } catch (error) {
    console.error('Error getting promotion revenue by month:', error);
    throw error;
  }
}

/**
 * Get yard leads billing data for a specific month
 * 
 * @param month Month in 'YYYY-MM' format
 * @returns Array of billing rows, one per yard
 */
export async function getYardLeadsBillingForMonth(
  month: string
): Promise<YardLeadBillingRow[]> {
  try {
    // Parse month to date range
    const { from, to } = parseMonthToDateRange(month);
    
    // Fetch all leads in the month
    const leads = await fetchLeadsInRange(
      Timestamp.fromDate(from),
      Timestamp.fromDate(to)
    );
    
    // Filter only YARD leads
    const yardLeads = leads.filter((lead) => lead.sellerType === 'YARD');
    
    // Group leads by yardId
    const leadsByYard = new Map<string, Lead[]>();
    for (const lead of yardLeads) {
      if (!leadsByYard.has(lead.sellerId)) {
        leadsByYard.set(lead.sellerId, []);
      }
      leadsByYard.get(lead.sellerId)!.push(lead);
    }
    
    // Fetch user profiles for all yards (in parallel)
    const yardIds = Array.from(leadsByYard.keys());
    const userProfiles = await Promise.all(
      yardIds.map((yardId) => fetchUserProfile(yardId))
    );
    
    // Create a map of yardId -> userProfile
    const profileMap = new Map<string, UserProfile>();
    for (let i = 0; i < yardIds.length; i++) {
      const profile = userProfiles[i];
      if (profile) {
        profileMap.set(yardIds[i], profile);
      }
    }
    
    // Calculate billing for each yard
    const billingRows: YardLeadBillingRow[] = [];
    
    for (const [yardId, monthLeads] of leadsByYard.entries()) {
      const userProfile = profileMap.get(yardId);
      if (!userProfile) {
        console.warn(`User profile not found for yard ${yardId}, skipping`);
        continue;
      }
      
      const subscriptionPlan = userProfile.subscriptionPlan || 'FREE';
      const freeQuota = getFreeMonthlyLeadQuota('YARD', subscriptionPlan);
      
      const totalLeads = monthLeads.length;
      const freeLeads = Math.min(totalLeads, freeQuota);
      const billableLeads = Math.max(0, totalLeads - freeQuota);
      
      billingRows.push({
        yardId,
        yardName: userProfile.fullName || undefined,
        subscriptionPlan,
        month,
        totalLeads,
        freeLeads,
        billableLeads,
      });
    }
    
    // Sort by yard name
    billingRows.sort((a, b) => {
      const nameA = a.yardName || a.yardId;
      const nameB = b.yardName || b.yardId;
      return nameA.localeCompare(nameB, 'he');
    });
    
    return billingRows;
  } catch (error) {
    console.error(`Error getting yard leads billing for month ${month}:`, error);
    throw error;
  }
}

