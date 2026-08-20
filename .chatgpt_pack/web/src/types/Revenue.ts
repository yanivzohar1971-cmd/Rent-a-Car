/**
 * Revenue & Billing Types
 * Used for aggregating revenue data from leads and promotion orders
 */

/**
 * Revenue bucket key for time-based grouping
 */
export interface RevenueBucketKey {
  year: number;
  month?: number;   // 1-12 for monthly grouping
  quarter?: number; // 1-4 for quarterly grouping
}

/**
 * Revenue source type
 */
export type RevenueSource = 
  | 'LEAD'              // Revenue from billable leads
  | 'PROMOTION_PRIVATE' // Revenue from private seller promotion orders
  | 'PROMOTION_YARD';   // Revenue from yard promotion orders

/**
 * Revenue scope (entity type)
 */
export type RevenueScope = 'PRIVATE' | 'YARD';

/**
 * Revenue line item representing a single revenue stream
 */
export interface RevenueLineItem {
  source: RevenueSource;
  scope: RevenueScope;
  entityId: string;       // yardId or userId, depending on scope
  displayName?: string;   // yard name, user name, etc. (optional, for display)
  count: number;          // number of billable events (leads, orders, etc.)
  unitPrice: number;      // from billing config / promotion product
  totalAmount: number;    // count * unitPrice
}

/**
 * Revenue bucket summary for a time period
 */
export interface RevenueBucketSummary {
  bucket: RevenueBucketKey;
  totalAmount: number;
  lineItems: RevenueLineItem[];
}

/**
 * Revenue aggregation filters
 */
export interface RevenueFilters {
  startDate: Date;
  endDate: Date;
  grouping: 'MONTHLY' | 'QUARTERLY';
  scope?: RevenueScope | 'ALL';  // 'ALL' means both PRIVATE and YARD
  entityId?: string;              // Optional: filter by specific yard/user
}

