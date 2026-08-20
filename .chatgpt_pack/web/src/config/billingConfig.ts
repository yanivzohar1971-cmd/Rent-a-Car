/**
 * Centralized Billing Configuration
 * Single source of truth for all pricing, quotas, and billing rules
 * 
 * TODO: Business team - adjust prices and quotas in BILLING_CONFIG below as needed.
 */

import type { SubscriptionPlan, UserProfile } from '../types/UserProfile';
import type { LeadSellerType } from '../types/Lead';
import type { BillingPlan, BillingPlanRole } from '../types/BillingPlan';
import { fetchBillingPlansByRole } from '../api/adminBillingPlansApi';

/**
 * Pricing configuration for a plan
 */
export interface PlanPricing {
  monthlyFee: number;              // Base subscription fee (if applicable)
  leadUnitPrice: number;           // Price per billable lead beyond free quota
  privatePromotionUnitPrice?: number; // Per private promotion order (if different from product price)
  yardPromotionUnitPrice?: number;    // Per yard promotion order (if different from product price)
}

/**
 * Quota configuration for a plan
 */
export interface PlanQuotas {
  freeMonthlyLeads: number;              // Included free leads per month
  maxMonthlyLeads?: number | undefined; // Optional hard cap (undefined = unlimited)
  privatePromotionSlots?: number | undefined; // Allowed concurrent private promotions (undefined = unlimited)
  yardBrandPromotionSlots?: number | undefined; // Allowed concurrent YARD brand promotions
  yardCarPromotionSlots?: number | undefined; // Allowed concurrent per-car YARD promotions
}

/**
 * Complete plan configuration (pricing + quotas)
 */
export interface PlanConfig {
  pricing: PlanPricing;
  quotas: PlanQuotas;
}

/**
 * Central billing configuration
 * This is the single source of truth for all billing rules
 */
export interface BillingConfig {
  yard: Record<SubscriptionPlan, PlanConfig>;
  seller: Record<SubscriptionPlan, PlanConfig>;
}

/**
 * Upgrade warning thresholds
 */
export const UPGRADE_WARN_THRESHOLD = 0.8;  // Show warning at 80% usage
export const UPGRADE_INFO_THRESHOLD = 0.5;  // Info messages below 50% (currently unused)

/**
 * CANONICAL BILLING CONFIGURATION
 * 
 * This is the single source of truth for all billing rules.
 * Business team: adjust prices and quotas here as needed.
 */
export const BILLING_CONFIG: BillingConfig = {
  yard: {
    FREE: {
      pricing: {
        monthlyFee: 0,
        leadUnitPrice: 15,  // 15 NIS per billable lead
      },
      quotas: {
        freeMonthlyLeads: 10,
        // maxMonthlyLeads: undefined (unlimited)
        yardBrandPromotionSlots: 0,
        yardCarPromotionSlots: 0,
      },
    },
    PLUS: {
      pricing: {
        monthlyFee: 0,  // TODO: adjust if PLUS has monthly fee
        leadUnitPrice: 10,  // 10 NIS per billable lead
      },
      quotas: {
        freeMonthlyLeads: 50,
        // maxMonthlyLeads: undefined (unlimited)
        yardBrandPromotionSlots: 2,
        yardCarPromotionSlots: 5,
      },
    },
    PRO: {
      pricing: {
        monthlyFee: 0,  // TODO: adjust if PRO has monthly fee
        leadUnitPrice: 0,  // PRO plan: unlimited leads included (or pay via flat fee)
      },
      quotas: {
        freeMonthlyLeads: 999,  // Effectively unlimited
        // maxMonthlyLeads: undefined (unlimited)
        yardBrandPromotionSlots: 5,
        yardCarPromotionSlots: 10,
      },
    },
  },
  seller: {
    FREE: {
      pricing: {
        monthlyFee: 0,
        leadUnitPrice: 12,  // 12 NIS per billable lead
      },
      quotas: {
        freeMonthlyLeads: 5,
        // maxMonthlyLeads: undefined (unlimited)
        // privatePromotionSlots: undefined (unlimited)
      },
    },
    PLUS: {
      pricing: {
        monthlyFee: 0,  // TODO: adjust if PLUS has monthly fee
        leadUnitPrice: 8,  // 8 NIS per billable lead
      },
      quotas: {
        freeMonthlyLeads: 25,
        // maxMonthlyLeads: undefined (unlimited)
        // privatePromotionSlots: undefined (unlimited)
      },
    },
    PRO: {
      pricing: {
        monthlyFee: 0,  // TODO: adjust if PRO has monthly fee
        leadUnitPrice: 0,  // PRO plan: unlimited leads included
      },
      quotas: {
        freeMonthlyLeads: 999,  // Effectively unlimited
        // maxMonthlyLeads: undefined (unlimited)
        // privatePromotionSlots: undefined (unlimited)
      },
    },
  },
};

// ============================================================================
// BACKWARDS-COMPATIBLE HELPER FUNCTIONS
// These functions read from BILLING_CONFIG but maintain the same API
// ============================================================================

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
  const scope = sellerType === 'YARD' ? 'yard' : 'seller';
  return BILLING_CONFIG[scope][subscriptionPlan].quotas.freeMonthlyLeads;
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
  const scope = sellerType === 'YARD' ? 'yard' : 'seller';
  return BILLING_CONFIG[scope][plan].pricing.leadUnitPrice;
}

/**
 * Get monthly fee for a seller type and subscription plan
 * @param sellerType 'YARD' or 'PRIVATE'
 * @param subscriptionPlan 'FREE' | 'PLUS' | 'PRO'
 * @returns Monthly fee in NIS
 */
export function getMonthlyFee(
  sellerType: LeadSellerType,
  subscriptionPlan: SubscriptionPlan = 'FREE'
): number {
  const scope = sellerType === 'YARD' ? 'yard' : 'seller';
  return BILLING_CONFIG[scope][subscriptionPlan].pricing.monthlyFee;
}

/**
 * Get complete plan configuration
 * @param sellerType 'YARD' or 'PRIVATE'
 * @param subscriptionPlan 'FREE' | 'PLUS' | 'PRO'
 * @returns Complete plan configuration
 */
export function getPlanConfig(
  sellerType: LeadSellerType,
  subscriptionPlan: SubscriptionPlan
): PlanConfig {
  const scope = sellerType === 'YARD' ? 'yard' : 'seller';
  return BILLING_CONFIG[scope][subscriptionPlan];
}

// ============================================================================
// EXISTING HELPER FUNCTIONS (keep for backwards compatibility)
// ============================================================================

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
 * 3. Fallback to canonical BILLING_CONFIG
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
    console.warn('Error fetching billing plan from Firestore, falling back to canonical config:', error);
  }

  // 4. Fallback to canonical BILLING_CONFIG
  // Map BillingPlanRole to LeadSellerType for config lookup
  let sellerType: LeadSellerType;
  if (role === 'YARD') {
    sellerType = 'YARD';
  } else {
    // AGENT or PRIVATE_SELLER - treat as PRIVATE for config lookup
    sellerType = 'PRIVATE';
  }

  const planConfig = getPlanConfig(sellerType, planCode);
  
  // Build BillingPlan object from canonical config
  return {
    id: 'canonical',
    role,
    planCode,
    displayName: `${planCode} ${role}`,
    description: 'Canonical billing configuration',
    freeMonthlyLeadQuota: planConfig.quotas.freeMonthlyLeads,
    leadPrice: planConfig.pricing.leadUnitPrice,
    fixedMonthlyFee: planConfig.pricing.monthlyFee,
    currency: 'ILS',
    isDefault: planCode === 'FREE',
    isActive: true,
    createdAt: {} as any,
    updatedAt: {} as any,
    // Yard-specific promotion benefits
    includedBranding: role === 'YARD' && (planConfig.quotas.yardBrandPromotionSlots ?? 0) > 0,
    includedFeaturedCarSlots: role === 'YARD' ? (planConfig.quotas.yardCarPromotionSlots ?? 0) : undefined,
    includedBoostedCarSlots: role === 'YARD' ? (planConfig.quotas.yardCarPromotionSlots ?? 0) : undefined,
  };
}
