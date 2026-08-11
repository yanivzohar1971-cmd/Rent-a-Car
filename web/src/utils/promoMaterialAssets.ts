/**
 * Promo Material Asset URL Resolver
 * 
 * Centralized resolver for promo material background and button images.
 * Uses PNG files from /promo/{material}/ directory, with AVIF support for better performance.
 * Supports CSS-only mode with gradient backgrounds.
 */

import type { CssPreset } from '../api/promoThemeApi';

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

/**
 * CSS Gradient Color Palette
 * Maps material + preset to three gradient colors (a, b, c)
 */
interface GradientPalette {
  a: string; // Primary gradient color
  b: string; // Secondary gradient color
  c: string; // Tertiary gradient color
}

/**
 * Get CSS gradient color palette for a material and preset
 * Returns three colors that can be used in CSS gradients
 */
function getGradientPalette(material: PromoMaterial, preset: CssPreset): GradientPalette {
  const materialLower = material.toLowerCase();
  
  // Base color palettes per material
  const materialColors: Record<string, { base: string; light: string; dark: string }> = {
    bronze: { base: '#cd7f32', light: '#e6a366', dark: '#8b5a2b' },
    copper: { base: '#b87333', light: '#d4a574', dark: '#7d4f1f' },
    silver: { base: '#c0c0c0', light: '#e8e8e8', dark: '#808080' },
    gold: { base: '#ffd700', light: '#ffed4e', dark: '#b8860b' },
    platinum: { base: '#e5e4e2', light: '#f5f5f5', dark: '#a8a8a8' },
    diamond: { base: '#b9f2ff', light: '#d4f4ff', dark: '#7dd3ea' },
    titanium: { base: '#878681', light: '#a5a5a0', dark: '#5a5a55' },
  };
  
  const colors = materialColors[materialLower] || materialColors.gold;
  
  // Apply preset modifications
  switch (preset) {
    case 'classic': {
      // Classic: Rich, saturated colors
      return {
        a: colors.base,
        b: colors.light,
        c: colors.dark,
      };
    }
    case 'soft': {
      // Soft: Muted, pastel-like colors
      const soften = (hex: string, amount: number) => {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, ((num >> 16) & 0xff) + amount);
        const g = Math.min(255, ((num >> 8) & 0xff) + amount);
        const b = Math.min(255, (num & 0xff) + amount);
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
      };
      return {
        a: soften(colors.base, 40),
        b: soften(colors.light, 50),
        c: soften(colors.dark, 30),
      };
    }
    case 'sparkle': {
      // Sparkle: High contrast, vibrant colors
      const brighten = (hex: string, amount: number) => {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, ((num >> 16) & 0xff) + amount);
        const g = Math.min(255, ((num >> 8) & 0xff) + amount);
        const b = Math.min(255, (num & 0xff) + amount);
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
      };
      return {
        a: brighten(colors.base, 20),
        b: brighten(colors.light, 30),
        c: colors.dark,
      };
    }
    default:
      return {
        a: colors.base,
        b: colors.light,
        c: colors.dark,
      };
  }
}

/**
 * Resolve CSS variables for gradient palette
 * Returns an object with CSS variable names and values for gradient colors
 * 
 * @param material - Material name (e.g., 'GOLD', 'BRONZE')
 * @param preset - CSS preset ('classic', 'soft', 'sparkle')
 * @returns Object with CSS variable names and values
 */
export function resolvePromoMaterialCssVars(
  material: PromoMaterial,
  preset: CssPreset = 'classic'
): Record<string, string> {
  const palette = getGradientPalette(material, preset);
  return {
    '--promo-css-a': palette.a,
    '--promo-css-b': palette.b,
    '--promo-css-c': palette.c,
  };
}
