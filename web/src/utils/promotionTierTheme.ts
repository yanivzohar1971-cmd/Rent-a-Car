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
export type MaterialTier = 'BRONZE' | 'COPPER' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'TITANIUM';

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
 * 
 * IMPORTANT: If tier is already a material tier (BRONZE..TITANIUM), return it directly.
 * Only map legacy tiers (BOOST/HIGHLIGHT/EXPOSURE_PLUS) when tier is not already a material.
 * 
 * Legacy mapping:
 * EXPOSURE_PLUS => BRONZE
 * HIGHLIGHT => SILVER
 * BOOST => GOLD
 * PLATINUM => PLATINUM (unchanged)
 * DIAMOND => DIAMOND (unchanged)
 */
export function resolveMaterialFromPromotionTier(tier?: PromotionTier | string | unknown): MaterialTier | undefined {
  if (!tier) return undefined;
  
  // Normalize to string and uppercase
  const tierStr = String(tier).toUpperCase().trim();
  
  // First, check if it's already a material tier (case-insensitive)
  const materialTiers: MaterialTier[] = ['BRONZE', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'TITANIUM'];
  if (materialTiers.includes(tierStr as MaterialTier)) {
    return tierStr as MaterialTier;
  }
  
  // Only apply legacy mapping if it's not already a material tier
  switch (tierStr) {
    case 'EXPOSURE_PLUS':
      return 'BRONZE';
    case 'HIGHLIGHT':
      return 'SILVER';
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
    case 'SILVER':
      return 'כסף';
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
 * 
 * Priority order: TITANIUM > DIAMOND > PLATINUM > GOLD > SILVER > COPPER > BRONZE
 * (for material tiers) OR DIAMOND > PLATINUM > EXPOSURE_PLUS > HIGHLIGHT > BOOST (for legacy tiers)
 * 
 * IMPORTANT: If promotion contains a material tier (BRONZE..TITANIUM) in a 'tier' or 'material' field,
 * prefer that over legacy tier fields when active.
 */
export function getActivePromotionTier(
  promotion: CarPromotionState | null | undefined,
  isPromotionActiveFn: (until: any) => boolean
): PromotionTier | MaterialTier | string | undefined {
  if (!promotion) return undefined;

  // First, check if promotion has a material tier field (tier or material)
  // This handles cases where the promotion object contains material tier strings directly
  const promoAny = promotion as any;
  if (promoAny.tier || promoAny.material) {
    const materialTierStr = String(promoAny.tier || promoAny.material).toUpperCase().trim();
    const materialTiers: MaterialTier[] = ['BRONZE', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'TITANIUM'];
    if (materialTiers.includes(materialTierStr as MaterialTier)) {
      // If it's a material tier and there's an active timestamp, return it
      // Check if any active promotion exists (if there's an until field, check it)
      if (promoAny.until && isPromotionActiveFn(promoAny.until)) {
        return materialTierStr as MaterialTier;
      }
      // If no until field, assume active if tier is set
      if (!promoAny.until) {
        return materialTierStr as MaterialTier;
      }
    }
  }

  // Check legacy tier fields in priority order (highest first)
  // Note: DIAMOND and PLATINUM are both legacy fields and material tiers
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
  return `/promo/${materialKey}/${filename}`;
}

/**
 * Get promotion tier theme configuration
 * Returns theme data for the given tier, or undefined if tier is not supported
 * Uses material names for UI labels and asset paths (with backward compatibility)
 * 
 * Accepts PromotionTier, MaterialTier, or string (for flexibility with getActivePromotionTier)
 */
export function getPromotionTierTheme(tier: PromotionTier | MaterialTier | string | undefined): PromotionTierTheme | undefined {
  if (!tier) return undefined;

  // Resolve material tier from internal tier (handles both material tiers and legacy tiers)
  const materialTier = resolveMaterialFromPromotionTier(tier);
  if (!materialTier) return undefined;

  // Material key for asset paths (lowercase)
  const materialKey = materialTier.toLowerCase();
  // Internal key for fallback paths (if needed) - convert tier to string first
  const tierStr = String(tier);
  const internalKey = tierStr.toLowerCase().replace(/_/g, '-');

  // Map tier to theme configuration (only for legacy PromotionTier values)
  // For material-only tiers (SILVER, TITANIUM), we'll handle them separately
  const tierAsPromotionTier = tierStr as PromotionTier;
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

  // Check if tier is a legacy PromotionTier that has a theme entry
  const theme = themes[tierAsPromotionTier];
  
  // If tier is a material-only tier (SILVER, TITANIUM) without legacy mapping,
  // return a basic theme structure (they'll use PNG assets directly)
  if (!theme) {
    // For material-only tiers, return basic theme with material-based asset paths
    return {
      tierKey: materialKey,
      materialTier,
      bgDesktop: `/promo/${materialKey}/bg-desktop.png`,
      bgMobile: `/promo/${materialKey}/bg-mobile.png`,
      fallbackDesktopWebp: `/promo/${materialKey}/bg-desktop.webp`,
      fallbackMobileWebp: `/promo/${materialKey}/bg-mobile.webp`,
      accent: `var(--promo-${materialKey}-accent)`, // Fallback CSS var (may not exist, that's OK)
      labelHe: getMaterialLabelHe(materialTier),
      labelEn: getMaterialLabelEn(materialTier),
    };
  }

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
