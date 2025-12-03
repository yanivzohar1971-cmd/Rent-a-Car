/**
 * Usage Warning Helpers
 * Generate soft upgrade warnings based on usage vs plan quotas
 */

import type { SubscriptionPlan } from '../types/UserProfile';

export type UpgradeWarningLevel = 'INFO' | 'WARN' | 'CRITICAL';

export interface UpgradeWarning {
  level: UpgradeWarningLevel;
  message: string;
  recommendedPlan?: string;
}

/**
 * Check if usage is near or over quota
 */
export interface UsageStats {
  currentUsage: number;
  quota: number;
  subscriptionPlan: SubscriptionPlan;
  sellerType: 'YARD' | 'PRIVATE';
}

/**
 * Generate upgrade warning based on usage stats
 */
export function generateUsageWarning(stats: UsageStats): UpgradeWarning | null {
  const { currentUsage, quota, subscriptionPlan } = stats;

  // No warning if no quota or already on highest plan
  if (quota === 0 || subscriptionPlan === 'PRO') {
    return null;
  }

  const usageRatio = quota > 0 ? currentUsage / quota : 0;

  // Critical: Over quota
  if (usageRatio > 1.0) {
    return {
      level: 'CRITICAL',
      message: `עברת את מכסת הלידים החינמית שלך לחודש זה (${currentUsage} מתוך ${quota}). לידים נוספים יחויבו.`,
      recommendedPlan: 'PRO',
    };
  }

  // Warning: Near quota (80%+)
  if (usageRatio >= 0.8) {
    const recommendedPlan = subscriptionPlan === 'FREE' ? 'PLUS' : 'PRO';
    return {
      level: 'WARN',
      message: `אתה מתקרב למכסת הלידים החינמית שלך לחודש זה (${currentUsage} מתוך ${quota}). שקול לשדרג לחבילת ${recommendedPlan === 'PLUS' ? 'PLUS' : 'PRO'}.`,
      recommendedPlan,
    };
  }

  // Info: Low usage (less than 50%)
  if (usageRatio < 0.5) {
    return null; // No warning for low usage
  }

  return null;
}

/**
 * Check promotion usage vs plan limits
 * For yards: check if they're using all included promotion slots
 */
export interface PromotionUsageStats {
  usedFeaturedSlots?: number;
  usedBoostedSlots?: number;
  includedFeaturedSlots?: number;
  includedBoostedSlots?: number;
  subscriptionPlan: SubscriptionPlan;
}

/**
 * Generate promotion-related upgrade warning
 */
export function generatePromotionUsageWarning(
  stats: PromotionUsageStats
): UpgradeWarning | null {
  const {
    usedFeaturedSlots = 0,
    usedBoostedSlots = 0,
    includedFeaturedSlots = 0,
    includedBoostedSlots = 0,
    subscriptionPlan,
  } = stats;

  // No warning if already on highest plan
  if (subscriptionPlan === 'PRO') {
    return null;
  }

  // Check if using all slots
  if (
    (includedFeaturedSlots > 0 && usedFeaturedSlots >= includedFeaturedSlots) ||
    (includedBoostedSlots > 0 && usedBoostedSlots >= includedBoostedSlots)
  ) {
    return {
      level: 'INFO',
      message: 'ניצלת את כל המכסות של הקידום הכלולות בתכנית שלך. לשדרוג לחבילת PRO תקבל מכסות נוספות.',
      recommendedPlan: 'PRO',
    };
  }

  return null;
}

