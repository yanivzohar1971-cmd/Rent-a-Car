import type { CarPromotionState } from '../types/Promotion';

/**
 * Promotion Tier Types (Internal - stored in Firestore)
 * These correspond to the promotion product types that have material backgrounds
 */
export type PromotionTier = 'BOOST' | 'HIGHLIGHT' | 'EXPOSURE_PLUS' | 'PLATINUM' | 'DIAMOND';

/**
 * Material Tier Types (UI-facing)
 * These are the material names shown to users
 */
export type MaterialTier = 'BRONZE' | 'COPPER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'TITANIUM';

/**
 * Promotion Tier Theme Configuration
 * Maps tier to background assets, colors, and labels
 */
export interface PromotionTierTheme {
  tierKey: string; // Material key e.g. "gold" (for asset paths)
  materialTier: MaterialTier; // Material tier name for UI
  bgDesktop: string; // "/promo/gold/bg-desktop.avif" (prefers material, falls back to internal)
  bgMobile: string; // "/promo/gold/bg-mobile.avif"
  fallbackDesktopWebp: string; // "/promo/gold/bg-desktop.webp"
  fallbackMobileWebp: string; // "/promo/gold/bg-mobile.webp"
  accent: string; // CSS color token (existing palette or hex)
  labelHe: string; // Material name in Hebrew (e.g. "זהב")
  labelEn: string; // Material name in English (e.g. "GOLD")
}

/**
 * Map internal promotion tier to material tier
 * EXPOSURE_PLUS => BRONZE
 * HIGHLIGHT => COPPER
 * BOOST => GOLD
 * PLATINUM => PLATINUM (unchanged)
 * DIAMOND => DIAMOND (unchanged)
 */
export function resolveMaterialFromPromotionTier(tier?: PromotionTier): MaterialTier | undefined {
  if (!tier) return undefined;
  
  switch (tier) {
    case 'EXPOSURE_PLUS':
      return 'BRONZE';
    case 'HIGHLIGHT':
      return 'COPPER';
    case 'BOOST':
      return 'GOLD';
    case 'PLATINUM':
      return 'PLATINUM';
    case 'DIAMOND':
      return 'DIAMOND';
    default:
      return undefined;
  }
}

/**
 * Get material label in Hebrew
 */
function getMaterialLabelHe(material: MaterialTier): string {
  switch (material) {
    case 'BRONZE':
      return 'ברונזה';
    case 'COPPER':
      return 'נחושת';
    case 'GOLD':
      return 'זהב';
    case 'PLATINUM':
      return 'פלטינום';
    case 'DIAMOND':
      return 'יהלום';
    case 'TITANIUM':
      return 'טיטניום';
    default:
      return '';
  }
}

/**
 * Get material label in English
 */
function getMaterialLabelEn(material: MaterialTier): string {
  return material;
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
 * Resolve asset path with fallback
 * Tries material folder first, falls back to internal tier folder if material assets don't exist
 */
function resolveAssetPath(materialKey: string, _unusedInternalKey: string, filename: string): string {
  // Prefer material folder: /promo/gold/bg-desktop.avif
  // Fallback to internal folder: /promo/boost/bg-desktop.avif (for backward compatibility)
  // Note: Actual fallback check would require runtime asset existence check,
  // so we always return material path and rely on browser fallback or CSS fallback
  // _internalKey is kept for potential future fallback logic
  return `/promo/${materialKey}/${filename}`;
}

/**
 * Get promotion tier theme configuration
 * Returns theme data for the given tier, or undefined if tier is not supported
 * Uses material names for UI labels and asset paths (with backward compatibility)
 */
export function getPromotionTierTheme(tier: PromotionTier | undefined): PromotionTierTheme | undefined {
  if (!tier) return undefined;

  // Resolve material tier from internal tier
  const materialTier = resolveMaterialFromPromotionTier(tier);
  if (!materialTier) return undefined;

  // Material key for asset paths (lowercase)
  const materialKey = materialTier.toLowerCase();
  // Internal key for fallback paths (if needed)
  const internalKey = tier.toLowerCase().replace(/_/g, '-');

  // Map tier to theme configuration
  const themes: Record<PromotionTier, Omit<PromotionTierTheme, 'tierKey' | 'materialTier' | 'labelHe' | 'labelEn'>> = {
    BOOST: {
      bgDesktop: resolveAssetPath(materialKey, internalKey, 'bg-desktop.avif'),
      bgMobile: resolveAssetPath(materialKey, internalKey, 'bg-mobile.avif'),
      fallbackDesktopWebp: resolveAssetPath(materialKey, internalKey, 'bg-desktop.webp'),
      fallbackMobileWebp: resolveAssetPath(materialKey, internalKey, 'bg-mobile.webp'),
      accent: 'var(--promo-boost-accent)',
    },
    HIGHLIGHT: {
      bgDesktop: resolveAssetPath(materialKey, internalKey, 'bg-desktop.avif'),
      bgMobile: resolveAssetPath(materialKey, internalKey, 'bg-mobile.avif'),
      fallbackDesktopWebp: resolveAssetPath(materialKey, internalKey, 'bg-desktop.webp'),
      fallbackMobileWebp: resolveAssetPath(materialKey, internalKey, 'bg-mobile.webp'),
      accent: 'var(--promo-highlight-accent)',
    },
    EXPOSURE_PLUS: {
      bgDesktop: resolveAssetPath(materialKey, internalKey, 'bg-desktop.avif'),
      bgMobile: resolveAssetPath(materialKey, internalKey, 'bg-mobile.avif'),
      fallbackDesktopWebp: resolveAssetPath(materialKey, internalKey, 'bg-desktop.webp'),
      fallbackMobileWebp: resolveAssetPath(materialKey, internalKey, 'bg-mobile.webp'),
      accent: 'var(--promo-exposure-accent)',
    },
    PLATINUM: {
      bgDesktop: resolveAssetPath(materialKey, internalKey, 'bg-desktop.avif'),
      bgMobile: resolveAssetPath(materialKey, internalKey, 'bg-mobile.avif'),
      fallbackDesktopWebp: resolveAssetPath(materialKey, internalKey, 'bg-desktop.webp'),
      fallbackMobileWebp: resolveAssetPath(materialKey, internalKey, 'bg-mobile.webp'),
      accent: 'var(--promo-platinum-accent)',
    },
    DIAMOND: {
      bgDesktop: resolveAssetPath(materialKey, internalKey, 'bg-desktop.avif'),
      bgMobile: resolveAssetPath(materialKey, internalKey, 'bg-mobile.avif'),
      fallbackDesktopWebp: resolveAssetPath(materialKey, internalKey, 'bg-desktop.webp'),
      fallbackMobileWebp: resolveAssetPath(materialKey, internalKey, 'bg-mobile.webp'),
      accent: 'var(--promo-diamond-accent)',
    },
  };

  const theme = themes[tier];
  if (!theme) return undefined;

  return {
    tierKey: materialKey, // Use material key for asset paths
    materialTier,
    labelHe: getMaterialLabelHe(materialTier), // Material name only
    labelEn: getMaterialLabelEn(materialTier),
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
