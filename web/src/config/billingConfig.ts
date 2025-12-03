import type { SubscriptionPlan, UserProfile } from '../types/UserProfile';
import type { LeadSellerType } from '../types/Lead';
import type { BillingPlan, BillingPlanRole } from '../types/BillingPlan';
import { fetchBillingPlansByRole } from '../api/adminBillingPlansApi';

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

/**
 * Determine the billing role from a UserProfile
 * @param user The user profile
 * @returns The billing role, or null if role cannot be determined
 */
export function getUserBillingRole(user: UserProfile): BillingPlanRole | null {
  if (user.isYard) {
    return 'YARD';
  }
  if (user.isAgent) {
    return 'AGENT';
  }
  if (user.canSell) {
    return 'PRIVATE_SELLER';
  }
  return null;
}

/**
 * Get the effective billing plan for a user, considering:
 * 1. User's subscriptionPlan
 * 2. BillingPlan from Firestore (billingPlans collection)
 * 3. Fallback to legacy static config
 * 
 * This function does NOT consider per-user deal overrides (those are handled in closeBillingPeriod)
 * @param user The user profile
 * @returns The effective BillingPlan, or null if role/plan cannot be determined
 */
export async function getEffectivePlanForUser(user: UserProfile): Promise<BillingPlan | null> {
  // 1. Determine role
  const role = getUserBillingRole(user);
  if (!role) {
    return null;
  }

  // 2. Determine planCode from user.subscriptionPlan
  const planCode = user.subscriptionPlan || 'FREE';

  // 3. Try to fetch matching BillingPlan from Firestore
  try {
    const plans = await fetchBillingPlansByRole(role);
    const matchingPlan = plans.find(
      (p) => p.planCode === planCode && p.isActive
    );
    
    if (matchingPlan) {
      return matchingPlan;
    }
  } catch (error) {
    console.warn('Error fetching billing plan from Firestore, falling back to legacy config:', error);
  }

  // 4. Fallback to legacy static config
  // Map LeadSellerType to BillingPlanRole for legacy functions
  let sellerType: LeadSellerType;
  if (role === 'YARD') {
    sellerType = 'YARD';
  } else if (role === 'PRIVATE_SELLER') {
    sellerType = 'PRIVATE';
  } else {
    // AGENT - treat as PRIVATE for legacy compatibility
    sellerType = 'PRIVATE';
  }

  const freeQuota = getFreeMonthlyLeadQuota(sellerType, planCode);
  const leadPrice = getLeadPrice(sellerType, planCode);
  
  // Legacy config doesn't have fixedMonthlyFee, default to 0
  return {
    id: 'legacy',
    role,
    planCode,
    displayName: `${planCode} ${role}`,
    description: 'Legacy static configuration',
    freeMonthlyLeadQuota: freeQuota,
    leadPrice,
    fixedMonthlyFee: 0,
    currency: 'ILS',
    isDefault: false,
    isActive: true,
    createdAt: {} as any,
    updatedAt: {} as any,
  };
}

