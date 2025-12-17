import type { Timestamp } from 'firebase/firestore';
import type { CarPromotionState } from '../types/Promotion';
import { toMillisPromotion } from './promotionTime';
import type { MaterialTier } from './promotionTierTheme';

/**
 * Promotion Contract: User-facing labels and effects
 * 
 * This is the single source of truth for promotion naming and behavior.
 * All UI components should use these functions to ensure consistency.
 */

/**
 * Material labels (Hebrew) - shown to users
 */
export const MATERIAL_LABELS_HE: Record<MaterialTier, string> = {
  BRONZE: 'ברונזה',
  COPPER: 'נחושת',
  GOLD: 'זהב',
  PLATINUM: 'פלטינום',
  DIAMOND: 'יהלום',
  TITANIUM: 'טיטניום',
} as const;

/**
 * Material labels (English) - shown to users
 */
export const MATERIAL_LABELS_EN: Record<MaterialTier, string> = {
  BRONZE: 'BRONZE',
  COPPER: 'COPPER',
  GOLD: 'GOLD',
  PLATINUM: 'PLATINUM',
  DIAMOND: 'DIAMOND',
  TITANIUM: 'TITANIUM',
} as const;

/**
 * Promotion type labels (Hebrew) - Legacy/internal use
 * @deprecated Use getMaterialLabelForProductType() for UI display
 */
export const PROMOTION_LABELS = {
  BOOST: 'קידום במיקום (מוקפץ)',
  HIGHLIGHT: 'קידום מובלט (מובלט)',
  MEDIA_PLUS: 'תמונות נוספות',
  EXPOSURE_PLUS: 'מודעה מודגשת',
  BUNDLE: 'חבילה משולבת',
  ATTENTION: 'מודעה עם תשומת לב',
  PLATINUM: 'פלטינום',
  DIAMOND: 'יהלום',
} as const;

/**
 * Promotion type descriptions (what it does)
 */
export const PROMOTION_DESCRIPTIONS = {
  BOOST: 'מעלה את המודעה לראש הרשימה לפי דירוג',
  HIGHLIGHT: 'מבליט את הכרטיס בצורה ברורה',
  MEDIA_PLUS: 'מאפשר העלאת תמונות ווידאו נוספים',
  EXPOSURE_PLUS: 'מדגיש כותרת/מחיר ומוסיף סרטון קטן',
  BUNDLE: 'חבילה משולבת של מספר סוגי קידום',
  ATTENTION: 'מוסיף אפקט עדין לתשומת לב',
  PLATINUM: 'מיקום ראשון + אפקט פרימיום כחול עדין',
  DIAMOND: 'מיקום ראשון + אפקט פרימיום יהלום עדין',
} as const;

/**
 * Get active promotion badges for a car
 * Returns array of badge labels (Hebrew)
 */
export function getPromotionBadges(
  promotion: CarPromotionState | null | undefined,
  isPromotionActive: (until: Timestamp | undefined) => boolean
): string[] {
  if (!promotion) return [];

  const badges: string[] = [];

  // DIAMOND first (top tier)
  if (promotion.diamondUntil && isPromotionActive(promotion.diamondUntil)) {
    badges.push('DIAMOND');
  }

  // PLATINUM second
  if (promotion.platinumUntil && isPromotionActive(promotion.platinumUntil)) {
    badges.push('PLATINUM');
  }

  // Use material names for badges
  if (promotion.boostUntil && isPromotionActive(promotion.boostUntil)) {
    badges.push(MATERIAL_LABELS_HE.GOLD);
  }

  if (promotion.highlightUntil && isPromotionActive(promotion.highlightUntil)) {
    badges.push(MATERIAL_LABELS_HE.COPPER);
  }

  if (promotion.exposurePlusUntil && isPromotionActive(promotion.exposurePlusUntil)) {
    badges.push(MATERIAL_LABELS_HE.BRONZE);
  }

  // ATTENTION is visual-only, no badge needed

  return badges;
}

/**
 * Get promotion effects summary
 */
export function getPromotionEffects(
  promotion: CarPromotionState | null | undefined,
  isPromotionActive: (until: Timestamp | undefined) => boolean
): {
  affectsPosition: boolean;
  affectsVisual: boolean;
  activeTypes: string[];
} {
  if (!promotion) {
    return { affectsPosition: false, affectsVisual: false, activeTypes: [] };
  }

  const activeTypes: string[] = [];
  let affectsPosition = false;
  let affectsVisual = false;

  if (promotion.diamondUntil && isPromotionActive(promotion.diamondUntil)) {
    activeTypes.push('DIAMOND');
    affectsPosition = true;
    affectsVisual = true; // Badge + shimmer are visual
  }

  if (promotion.platinumUntil && isPromotionActive(promotion.platinumUntil)) {
    activeTypes.push('PLATINUM');
    affectsPosition = true;
    affectsVisual = true; // Badge + shimmer are visual
  }

  if (promotion.boostUntil && isPromotionActive(promotion.boostUntil)) {
    activeTypes.push('BOOST');
    affectsPosition = true;
    affectsVisual = true; // Badge is visual
  }

  if (promotion.highlightUntil && isPromotionActive(promotion.highlightUntil)) {
    activeTypes.push('HIGHLIGHT');
    affectsVisual = true;
  }

  if (promotion.exposurePlusUntil && isPromotionActive(promotion.exposurePlusUntil)) {
    activeTypes.push('EXPOSURE_PLUS');
    affectsVisual = true;
  }

  return { affectsPosition, affectsVisual, activeTypes };
}

/**
 * Get promotion expiry summary (Hebrew)
 * Returns formatted string like "בתוקף עד: 14/12/2025 23:59"
 */
export function getPromotionExpirySummary(
  promotion: CarPromotionState | null | undefined,
  isPromotionActive: (until: Timestamp | undefined) => boolean
): string {
  if (!promotion) return '';

  const activeExpiries: Array<{ label: string; until: Timestamp }> = [];

  if (promotion.diamondUntil && isPromotionActive(promotion.diamondUntil)) {
    activeExpiries.push({ label: 'DIAMOND', until: promotion.diamondUntil });
  }

  if (promotion.platinumUntil && isPromotionActive(promotion.platinumUntil)) {
    activeExpiries.push({ label: 'PLATINUM', until: promotion.platinumUntil });
  }

  // Use material names for expiry labels
  if (promotion.boostUntil && isPromotionActive(promotion.boostUntil)) {
    activeExpiries.push({ label: MATERIAL_LABELS_HE.GOLD, until: promotion.boostUntil });
  }

  if (promotion.highlightUntil && isPromotionActive(promotion.highlightUntil)) {
    activeExpiries.push({ label: MATERIAL_LABELS_HE.COPPER, until: promotion.highlightUntil });
  }

  if (promotion.exposurePlusUntil && isPromotionActive(promotion.exposurePlusUntil)) {
    activeExpiries.push({ label: MATERIAL_LABELS_HE.BRONZE, until: promotion.exposurePlusUntil });
  }

  if (activeExpiries.length === 0) return '';

  // Convert to milliseconds and find the latest expiry
  const expiriesWithMs = activeExpiries
    .map(entry => {
      const untilMs = toMillisPromotion(entry.until);
      return untilMs !== null ? { label: entry.label, until: entry.until, untilMs } : null;
    })
    .filter((entry): entry is { label: string; until: Timestamp; untilMs: number } => entry !== null);

  if (expiriesWithMs.length === 0) return '';

  // Find the latest expiry by milliseconds
  const latest = expiriesWithMs.reduce((latest, current) => {
    return current.untilMs > latest.untilMs ? current : latest;
  });

  // Format the latest expiry date
  try {
    const date = new Date(latest.untilMs);
    const formatted = date.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `בתוקף עד: ${formatted}`;
  } catch {
    return '';
  }
}

/**
 * Get promotion effect summary for success message
 * Returns string like "השפעה: מיקום + עיצוב"
 */
export function getPromotionEffectSummary(
  promotion: CarPromotionState | null | undefined,
  isPromotionActive: (until: Timestamp | undefined) => boolean
): string {
  const effects = getPromotionEffects(promotion, isPromotionActive);
  const parts: string[] = [];

  if (effects.affectsPosition) {
    parts.push('מיקום');
  }

  if (effects.affectsVisual) {
    parts.push('עיצוב');
  }

  if (parts.length === 0) return 'ללא השפעה';

  return `השפעה: ${parts.join(' + ')}`;
}

/**
 * Get material label for product type (UI-facing)
 * Maps internal product types to material names shown to users
 */
export function getMaterialLabelForProductType(productType: string, lang: 'he' | 'en' = 'he'): string {
  // Map internal types to material tiers
  let materialTier: MaterialTier | undefined;
  
  switch (productType) {
    case 'BOOST':
      materialTier = 'GOLD';
      break;
    case 'HIGHLIGHT':
      materialTier = 'COPPER';
      break;
    case 'EXPOSURE_PLUS':
      materialTier = 'BRONZE';
      break;
    case 'PLATINUM':
      materialTier = 'PLATINUM';
      break;
    case 'DIAMOND':
      materialTier = 'DIAMOND';
      break;
    default:
      // For non-material types, return legacy label
      return getPromotionTypeLabel(productType);
  }
  
  if (!materialTier) return 'קידום';
  
  return lang === 'he' ? MATERIAL_LABELS_HE[materialTier] : MATERIAL_LABELS_EN[materialTier];
}

/**
 * Get promotion type label from product type
 * @deprecated Use getMaterialLabelForProductType() for UI display
 * Kept for backward compatibility and non-material types (MEDIA_PLUS, BUNDLE, etc.)
 */
export function getPromotionTypeLabel(productType: string): string {
  switch (productType) {
    case 'BOOST':
      return PROMOTION_LABELS.BOOST;
    case 'HIGHLIGHT':
      return PROMOTION_LABELS.HIGHLIGHT;
    case 'MEDIA_PLUS':
      return PROMOTION_LABELS.MEDIA_PLUS;
    case 'EXPOSURE_PLUS':
      return PROMOTION_LABELS.EXPOSURE_PLUS;
    case 'BUNDLE':
      return PROMOTION_LABELS.BUNDLE;
    case 'ATTENTION':
      return PROMOTION_LABELS.ATTENTION;
    case 'PLATINUM':
      return PROMOTION_LABELS.PLATINUM;
    case 'DIAMOND':
      return PROMOTION_LABELS.DIAMOND;
    default:
      return 'קידום';
  }
}

/**
 * Get promotion type description from product type
 */
export function getPromotionTypeDescription(productType: string): string {
  switch (productType) {
    case 'BOOST':
      return PROMOTION_DESCRIPTIONS.BOOST;
    case 'HIGHLIGHT':
      return PROMOTION_DESCRIPTIONS.HIGHLIGHT;
    case 'MEDIA_PLUS':
      return PROMOTION_DESCRIPTIONS.MEDIA_PLUS;
    case 'EXPOSURE_PLUS':
      return PROMOTION_DESCRIPTIONS.EXPOSURE_PLUS;
    case 'BUNDLE':
      return PROMOTION_DESCRIPTIONS.BUNDLE;
    case 'ATTENTION':
      return PROMOTION_DESCRIPTIONS.ATTENTION;
    case 'PLATINUM':
      return PROMOTION_DESCRIPTIONS.PLATINUM;
    case 'DIAMOND':
      return PROMOTION_DESCRIPTIONS.DIAMOND;
    default:
      return 'קידום מודעה';
  }
}
