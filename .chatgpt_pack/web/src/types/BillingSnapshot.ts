import type { Timestamp } from 'firebase/firestore';
import type { LeadSellerType } from './Lead';
import type { SubscriptionPlan } from './UserProfile';

/**
 * Billing snapshot for a closed billing period
 * Represents a snapshot of billing data for a specific entity (Yard or Seller) in a specific period
 * 
 * Firestore path: billingPeriods/{periodId}/entities/{sellerId}
 */
export interface BillingSnapshot {
  periodId: string;               // 'YYYY-MM' format, e.g. '2025-01'
  sellerId: string;               // user/yard uid
  sellerType: LeadSellerType;     // 'YARD' | 'PRIVATE'
  name: string;                   // Yard name or seller displayName/email
  subscriptionPlan: SubscriptionPlan;

  monthlyTotal: number;           // total leads in that period
  freeQuota: number;              // free monthly quota at the time (effectiveFreeMonthlyLeadQuota)
  billableLeads: number;          // max(0, monthlyTotal - freeQuota)
  leadPrice: number;              // effective lead price (from plan or deal override)
  fixedMonthlyFee: number;        // fixed monthly fee (from plan or deal override)
  amountToCharge: number;         // (billableLeads * leadPrice) + fixedMonthlyFee

  currency: string;               // e.g. 'ILS'

  status: 'OPEN' | 'INVOICED' | 'PAID' | 'CANCELLED';

  createdAt: Timestamp;
  closedAt?: Timestamp;           // optional - when period was closed
  externalInvoiceId?: string | null;
  externalInvoiceNumber?: string | null;
  externalInvoiceUrl?: string | null;

  // Deal/Override information (optional, for tracking)
  billingDealName?: string | null;
  billingDealValidUntil?: Timestamp | null;
  hasCustomDeal?: boolean;       // true if any custom* fields were used
  freeLeadsUsed?: number;         // actual free leads used (min(monthlyTotal, freeQuota))
}

