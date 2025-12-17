import { getPromotionTypeLabel } from './promotionLabels';
import type { CarPromotionState } from '../types/Promotion';

/**
 * Promotion Tier Types
 * These correspond to the promotion product types that have material backgrounds
 */
export type PromotionTier = 'BOOST' | 'HIGHLIGHT' | 'EXPOSURE_PLUS' | 'PLATINUM' | 'DIAMOND';

/**
 * Promotion Tier Theme Configuration
 * Maps tier to background assets, colors, and labels
 */
export interface PromotionTierTheme {
  tierKey: string; // e.g. "boost"
  bgDesktop: string; // "/promo/boost/bg-desktop.avif"
  bgMobile: string; // "/promo/boost/bg-mobile.avif"
  fallbackDesktopWebp: string; // "/promo/boost/bg-desktop.webp"
  fallbackMobileWebp: string; // "/promo/boost/bg-mobile.webp"
  accent: string; // CSS color token (existing palette or hex)
  labelHe: string; // Hebrew name + (color/material) in parentheses
}

/**
 * Get the active promotion tier from a car's promotion state
 * Returns the highest priority tier that is currently active
 * Priority order: DIAMOND > PLATINUM > EXPOSURE_PLUS > HIGHLIGHT > BOOST
 */
export function getActivePromotionTier(
  promotion: CarPromotionState | null | undefined,
  isPromotionActiveFn: (until: any) => boolean
): PromotionTier | undefined {
  if (!promotion) return undefined;

  // Check in priority order (highest first)
  if (promotion.diamondUntil && isPromotionActiveFn(promotion.diamondUntil)) {
    return 'DIAMOND';
  }
  if (promotion.platinumUntil && isPromotionActiveFn(promotion.platinumUntil)) {
    return 'PLATINUM';
  }
  if (promotion.exposurePlusUntil && isPromotionActiveFn(promotion.exposurePlusUntil)) {
    return 'EXPOSURE_PLUS';
  }
  if (promotion.highlightUntil && isPromotionActiveFn(promotion.highlightUntil)) {
    return 'HIGHLIGHT';
  }
  if (promotion.boostUntil && isPromotionActiveFn(promotion.boostUntil)) {
    return 'BOOST';
  }

  return undefined;
}

/**
 * Get promotion tier theme configuration
 * Returns theme data for the given tier, or undefined if tier is not supported
 */
export function getPromotionTierTheme(tier: PromotionTier | undefined): PromotionTierTheme | undefined {
  if (!tier) return undefined;

  const tierKey = tier.toLowerCase().replace(/_/g, '-');
  const basePath = `/promo/${tierKey}`;

  // Map tier to theme configuration
  const themes: Record<PromotionTier, Omit<PromotionTierTheme, 'tierKey'>> = {
    BOOST: {
      bgDesktop: `${basePath}/bg-desktop.avif`,
      bgMobile: `${basePath}/bg-mobile.avif`,
      fallbackDesktopWebp: `${basePath}/bg-desktop.webp`,
      fallbackMobileWebp: `${basePath}/bg-mobile.webp`,
      accent: 'var(--promo-boost-accent)',
      labelHe: `${getPromotionTypeLabel('BOOST')} (זהב)`,
    },
    HIGHLIGHT: {
      bgDesktop: `${basePath}/bg-desktop.avif`,
      bgMobile: `${basePath}/bg-mobile.avif`,
      fallbackDesktopWebp: `${basePath}/bg-desktop.webp`,
      fallbackMobileWebp: `${basePath}/bg-mobile.webp`,
      accent: 'var(--promo-highlight-accent)',
      labelHe: `${getPromotionTypeLabel('HIGHLIGHT')} (ירוק)`,
    },
    EXPOSURE_PLUS: {
      bgDesktop: `${basePath}/bg-desktop.avif`,
      bgMobile: `${basePath}/bg-mobile.avif`,
      fallbackDesktopWebp: `${basePath}/bg-desktop.webp`,
      fallbackMobileWebp: `${basePath}/bg-mobile.webp`,
      accent: 'var(--promo-exposure-accent)',
      labelHe: `${getPromotionTypeLabel('EXPOSURE_PLUS')} (סגול)`,
    },
    PLATINUM: {
      bgDesktop: `${basePath}/bg-desktop.avif`,
      bgMobile: `${basePath}/bg-mobile.avif`,
      fallbackDesktopWebp: `${basePath}/bg-desktop.webp`,
      fallbackMobileWebp: `${basePath}/bg-mobile.webp`,
      accent: 'var(--promo-platinum-accent)',
      labelHe: `${getPromotionTypeLabel('PLATINUM')} (פלטינום)`,
    },
    DIAMOND: {
      bgDesktop: `${basePath}/bg-desktop.avif`,
      bgMobile: `${basePath}/bg-mobile.avif`,
      fallbackDesktopWebp: `${basePath}/bg-desktop.webp`,
      fallbackMobileWebp: `${basePath}/bg-mobile.webp`,
      accent: 'var(--promo-diamond-accent)',
      labelHe: `${getPromotionTypeLabel('DIAMOND')} (יהלום)`,
    },
  };

  const theme = themes[tier];
  if (!theme) return undefined;

  return {
    tierKey,
    ...theme,
  };
}

/**
 * Get promotion tier from product type
 * Maps PromotionProductType to PromotionTier (if applicable)
 */
export function getTierFromProductType(productType: string): PromotionTier | undefined {
  switch (productType) {
    case 'BOOST':
      return 'BOOST';
    case 'HIGHLIGHT':
      return 'HIGHLIGHT';
    case 'EXPOSURE_PLUS':
      return 'EXPOSURE_PLUS';
    case 'PLATINUM':
      return 'PLATINUM';
    case 'DIAMOND':
      return 'DIAMOND';
    default:
      return undefined;
  }
}
