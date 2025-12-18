/**
 * Promo Material Asset URL Resolver
 * 
 * Centralized resolver for promo material background and button images.
 * Uses PNG files from /promo/{material}/ directory, with AVIF support for better performance.
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
 * @param ext - File extension ('png' or 'avif'), defaults to 'png' for backwards compatibility
 * @returns Public URL path to the asset
 */
export function resolvePromoMaterialUrl(
  material: PromoMaterial,
  kind: PromoMaterialAssetKind,
  ext: 'png' | 'avif' = 'png'
): string {
  // Use Vite public base safely and avoid double slashes
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const materialLower = material.toLowerCase();
  
  // Map kind -> filename with extension
  const filename = `${kind}.${ext}`;
  
  return `${base}promo/${materialLower}/${filename}`;
}

/**
 * Convert URL to CSS url() format
 * Returns: url("...") (quotes included)
 * 
 * @param url - URL string
 * @returns CSS url() format string
 */
export function cssUrl(url: string): string {
  return `url("${url}")`;
}

/**
 * Generate CSS image-set() with AVIF preferred and PNG fallback
 * Returns a string suitable for CSS background-image property
 * 
 * @param avifUrl - URL to AVIF image
 * @param pngUrl - URL to PNG fallback image
 * @returns CSS image-set() string with AVIF preferred, PNG fallback
 */
export function cssImageSetAvifPng(avifUrl: string, pngUrl: string): string {
  return `image-set(
    url("${avifUrl}") type("image/avif") 1x,
    url("${pngUrl}") type("image/png") 1x
  )`;
}

/**
 * Resolve promo material image-set with AVIF preferred and PNG fallback
 * Uses resolvePromoMaterialUrl() to get both AVIF and PNG URLs, then combines them
 * into a CSS image-set() string for optimal browser support
 * 
 * Feature flag: Set VITE_PROMO_AVIF=1 in .env to enable AVIF (default: disabled for safety)
 * When disabled, returns PNG-only url() to avoid broken AVIF images
 * 
 * @param material - Material name (e.g., 'GOLD', 'BRONZE')
 * @param kind - Asset kind ('bg-desktop', 'bg-mobile', or 'btn')
 * @returns CSS image-set() string with AVIF preferred, PNG fallback, or PNG-only if AVIF disabled
 */
export function resolvePromoMaterialImageSet(
  material: PromoMaterial,
  kind: PromoMaterialAssetKind
): string {
  // Feature flag: only use AVIF if explicitly enabled (safety measure)
  const USE_AVIF = import.meta.env.VITE_PROMO_AVIF === '1';
  
  const pngUrl = resolvePromoMaterialUrl(material, kind, 'png');
  
  if (!USE_AVIF) {
    // Return PNG-only (backwards compatible, safe fallback)
    return cssUrl(pngUrl);
  }
  
  // AVIF enabled: return image-set with AVIF preferred, PNG fallback
  const avifUrl = resolvePromoMaterialUrl(material, kind, 'avif');
  return cssImageSetAvifPng(avifUrl, pngUrl);
}

/**
 * Type guard to check if a value is a valid PromoMaterial
 * Validates strictly against the 7 allowed materials (case-insensitive normalization is done outside or inside helper)
 * 
 * @param x - Value to check
 * @returns True if x is a valid PromoMaterial
 */
export function isPromoMaterial(x: unknown): x is PromoMaterial {
  if (typeof x !== 'string') return false;
  const normalized = x.toUpperCase().trim();
  const allowedMaterials: PromoMaterial[] = ['BRONZE', 'COPPER', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'TITANIUM'];
  return allowedMaterials.includes(normalized as PromoMaterial);
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
      return 'SILVER';
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
