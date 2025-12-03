import type { SubscriptionPlan } from '../types/UserProfile';
import type { LeadSellerType } from '../types/Lead';

/**
 * Get the free monthly lead quota for a seller type and subscription plan
 * @param sellerType 'YARD' or 'PRIVATE'
 * @param subscriptionPlan 'FREE' | 'PLUS' | 'PRO'
 * @returns Number of free leads per month
 */
export function getFreeMonthlyLeadQuota(
  sellerType: LeadSellerType,
  subscriptionPlan: SubscriptionPlan = 'FREE'
): number {
  // Quota configuration
  const quotas: Record<LeadSellerType, Record<SubscriptionPlan, number>> = {
    YARD: {
      FREE: 50,   // Yards on FREE plan: 50 leads/month
      PLUS: 150,  // Yards on PLUS plan: 150 leads/month
      PRO: 9999,  // Yards on PRO plan: practically unlimited
    },
    PRIVATE: {
      FREE: 15,   // Private sellers on FREE plan: 15 leads/month
      PLUS: 50, // Private sellers on PLUS plan: 50 leads/month
      PRO: 9999, // Private sellers on PRO plan: practically unlimited
    },
  };

  return quotas[sellerType]?.[subscriptionPlan] ?? quotas[sellerType]?.FREE ?? 0;
}

