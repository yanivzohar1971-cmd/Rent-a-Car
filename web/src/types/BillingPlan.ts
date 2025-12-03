import type { Timestamp } from 'firebase/firestore';

/**
 * Role types that can have billing plans
 */
export type BillingPlanRole = 'YARD' | 'AGENT' | 'PRIVATE_SELLER';

/**
 * Billing plan configuration stored in Firestore collection: billingPlans
 * Each document represents a plan for a specific role + plan code combination
 */
export interface BillingPlan {
  id: string; // Firestore doc id
  role: BillingPlanRole;
  planCode: 'FREE' | 'PLUS' | 'PRO'; // aligns with subscriptionPlan
  displayName: string; // e.g. "FREE YARD", "PLUS לשטח מגרש"
  description?: string;
  freeMonthlyLeadQuota: number;
  leadPrice: number; // price per billable lead
  fixedMonthlyFee: number; // e.g. 0 for FREE, >0 for others
  currency: string; // e.g. "ILS"
  isDefault: boolean; // per role only one default planCode should be true
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

