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
      FREE: 10,   // Yards on FREE plan: 10 leads/month
      PLUS: 50,  // Yards on PLUS plan: 50 leads/month
      PRO: 999,  // Yards on PRO plan: unlimited (999 is effectively unlimited)
    },
    PRIVATE: {
      FREE: 5,   // Private sellers on FREE plan: 5 leads/month
      PLUS: 25, // Private sellers on PLUS plan: 25 leads/month
      PRO: 999, // Private sellers on PRO plan: unlimited
    },
  };

  return quotas[sellerType]?.[subscriptionPlan] ?? quotas[sellerType]?.FREE ?? 0;
}

