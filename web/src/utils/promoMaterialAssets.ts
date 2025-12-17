/**
 * Promo Material Asset URL Resolver
 * 
 * Centralized resolver for promo material background and button images.
 * Uses PNG files from /promo/{material}/ directory.
 */

/**
 * Promo Material Types
 * These are the 7 materials that have visual assets
 */
export type PromoMaterial = 'BRONZE' | 'COPPER' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'TITANIUM';

/**
 * Asset kind for material assets
 */
export type PromoMaterialAssetKind = 'bg-desktop' | 'bg-mobile' | 'btn';

/**
 * Resolve promo material asset URL
 * 
 * @param material - Material name (e.g., 'GOLD', 'BRONZE')
 * @param kind - Asset kind ('bg-desktop', 'bg-mobile', or 'btn')
 * @returns Public URL path to the asset
 */
export function resolvePromoMaterialUrl(
  material: PromoMaterial,
  kind: PromoMaterialAssetKind
): string {
  const base = import.meta.env.BASE_URL || '/';
  const materialLower = material.toLowerCase();
  const filename = `${kind}.png`;
  
  // Ensure base ends with / and doesn't double it
  const baseUrl = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${baseUrl}/promo/${materialLower}/${filename}`;
}

/**
 * Convert URL to CSS url() format
 * 
 * @param url - URL string
 * @returns CSS url() format string
 */
export function cssUrl(url: string): string {
  return `url("${url}")`;
}

/**
 * Map internal promotion tier to material
 * This matches the logic from promotionTierTheme.ts
 */
function mapTierToMaterial(tier: string | undefined): PromoMaterial | null {
  if (!tier) return null;
  
  const normalized = tier.toUpperCase().trim();
  
  switch (normalized) {
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
      return null;
  }
}

/**
 * Get promo material from car promotion data
 * 
 * Tries multiple fields to detect the material tier, normalizes to uppercase,
 * and validates against allowed materials. Also maps internal tiers (BOOST, HIGHLIGHT, etc.)
 * to materials.
 * 
 * @param car - Car object with promotion data
 * @returns PromoMaterial if found and valid, null otherwise
 */
export function getPromoMaterialFromCar(car: { promotion?: { tier?: string; material?: string }; promotionTier?: string; activePromotion?: { tier?: string } } | null | undefined): PromoMaterial | null {
  if (!car) return null;
  
  // Try different field paths
  let materialStr: string | undefined;
  
  if (car.promotion?.tier) {
    materialStr = car.promotion.tier;
  } else if (car.promotionTier) {
    materialStr = car.promotionTier;
  } else if (car.promotion?.material) {
    materialStr = car.promotion.material;
  } else if (car.activePromotion?.tier) {
    materialStr = car.activePromotion.tier;
  }
  
  if (!materialStr) return null;
  
  // Normalize to uppercase
  const normalized = materialStr.toUpperCase().trim();
  
  // First, try direct material match
  const allowedMaterials: PromoMaterial[] = ['BRONZE', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'TITANIUM'];
  if (allowedMaterials.includes(normalized as PromoMaterial)) {
    return normalized as PromoMaterial;
  }
  
  // If it's an internal tier (BOOST, HIGHLIGHT, EXPOSURE_PLUS), map it to material
  const mapped = mapTierToMaterial(normalized);
  if (mapped) {
    return mapped;
  }
  
  return null;
}
