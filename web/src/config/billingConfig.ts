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
  // Updated per billing requirements: YARD FREE=10, PLUS=50, PRO=999; PRIVATE FREE=5, PLUS=25, PRO=999
  const quotas: Record<LeadSellerType, Record<SubscriptionPlan, number>> = {
    YARD: {
      FREE: 10,   // Yards on FREE plan: 10 leads/month
      PLUS: 50,   // Yards on PLUS plan: 50 leads/month
      PRO: 999,   // Yards on PRO plan: 999 leads/month
    },
    PRIVATE: {
      FREE: 5,    // Private sellers on FREE plan: 5 leads/month
      PLUS: 25,   // Private sellers on PLUS plan: 25 leads/month
      PRO: 999,   // Private sellers on PRO plan: 999 leads/month
    },
  };

  return quotas[sellerType]?.[subscriptionPlan] ?? quotas[sellerType]?.FREE ?? 0;
}

/**
 * Get the price per lead for a seller type and subscription plan
 * @param sellerType 'YARD' or 'PRIVATE'
 * @param subscriptionPlan 'FREE' | 'PLUS' | 'PRO'
 * @returns Price per billable lead in NIS
 */
export function getLeadPrice(
  sellerType: LeadSellerType,
  subscriptionPlan?: SubscriptionPlan
): number {
  const plan = subscriptionPlan ?? 'FREE';

  if (sellerType === 'YARD') {
    switch (plan) {
      case 'PRO':
        return 0;     // PRO plan might pay via a flat fee, not per lead
      case 'PLUS':
        return 10;   // 10 NIS per billable lead
      case 'FREE':
      default:
        return 15;   // 15 NIS per billable lead
    }
  }

  // PRIVATE sellers
  switch (plan) {
    case 'PRO':
      return 0;
    case 'PLUS':
      return 8;      // 8 NIS per billable lead
    case 'FREE':
    default:
      return 12;     // 12 NIS per billable lead
  }
}

