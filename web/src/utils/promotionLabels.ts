import type { Timestamp } from 'firebase/firestore';
import type { CarPromotionState } from '../types/Promotion';

/**
 * Promotion Contract: User-facing labels and effects
 * 
 * This is the single source of truth for promotion naming and behavior.
 * All UI components should use these functions to ensure consistency.
 */

/**
 * Promotion type labels (Hebrew)
 */
export const PROMOTION_LABELS = {
  BOOST: 'קידום במיקום (מוקפץ)',
  HIGHLIGHT: 'קידום מובלט (מובלט)',
  EXPOSURE_PLUS: 'מודעה מודגשת',
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
  EXPOSURE_PLUS: 'מדגיש כותרת/מחיר ומוסיף סרטון קטן',
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

  if (promotion.boostUntil && isPromotionActive(promotion.boostUntil)) {
    badges.push('מוקפץ');
  }

  if (promotion.highlightUntil && isPromotionActive(promotion.highlightUntil)) {
    badges.push('מובלט');
  }

  if (promotion.exposurePlusUntil && isPromotionActive(promotion.exposurePlusUntil)) {
    badges.push('מודעה מודגשת');
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

  if (promotion.boostUntil && isPromotionActive(promotion.boostUntil)) {
    activeExpiries.push({ label: 'מוקפץ', until: promotion.boostUntil });
  }

  if (promotion.highlightUntil && isPromotionActive(promotion.highlightUntil)) {
    activeExpiries.push({ label: 'מובלט', until: promotion.highlightUntil });
  }

  if (promotion.exposurePlusUntil && isPromotionActive(promotion.exposurePlusUntil)) {
    activeExpiries.push({ label: 'מודעה מודגשת', until: promotion.exposurePlusUntil });
  }

  if (activeExpiries.length === 0) return '';

  // Find the latest expiry
  const latest = activeExpiries.reduce((latest, current) => {
    try {
      const latestDate = latest.until.toDate();
      const currentDate = current.until.toDate();
      return currentDate > latestDate ? current : latest;
    } catch {
      return latest;
    }
  });

  try {
    const date = latest.until.toDate();
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
 * Get promotion type label from product type
 */
export function getPromotionTypeLabel(productType: string): string {
  switch (productType) {
    case 'BOOST':
      return PROMOTION_LABELS.BOOST;
    case 'HIGHLIGHT':
      return PROMOTION_LABELS.HIGHLIGHT;
    case 'EXPOSURE_PLUS':
      return PROMOTION_LABELS.EXPOSURE_PLUS;
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
    case 'EXPOSURE_PLUS':
      return PROMOTION_DESCRIPTIONS.EXPOSURE_PLUS;
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
