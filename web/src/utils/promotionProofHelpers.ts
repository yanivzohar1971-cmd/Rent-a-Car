import type { Timestamp } from 'firebase/firestore';

/**
 * Format remaining time until a timestamp
 * Returns human-readable string like "2d 4h left" or "expired"
 */
export function formatTimeRemaining(until: Timestamp | undefined | null): string {
  if (!until) return 'לא פעיל';
  
  try {
    const date = until.toDate();
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return 'פג תוקף';
    }
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days} ימים ${hours} שעות`;
    } else if (hours > 0) {
      return `${hours} שעות ${minutes} דקות`;
    } else {
      return `${minutes} דקות`;
    }
  } catch {
    return 'שגיאה';
  }
}

/**
 * Calculate promotion tier/score for display
 */
export function getPromotionTier(promotion: any): string {
  if (!promotion) return 'ללא';
  
  const parts: string[] = [];
  
  if (promotion.boostUntil) {
    try {
      const date = promotion.boostUntil.toDate();
      if (date > new Date()) {
        parts.push('BOOST');
      }
    } catch {}
  }
  
  if (promotion.highlightUntil) {
    try {
      const date = promotion.highlightUntil.toDate();
      if (date > new Date()) {
        parts.push('HIGHLIGHT');
      }
    } catch {}
  }
  
  if (promotion.mediaPlusEnabled) {
    parts.push('MEDIA+');
  }
  
  if (promotion.exposurePlusUntil) {
    try {
      const date = promotion.exposurePlusUntil.toDate();
      if (date > new Date()) {
        parts.push('EXPOSURE+');
      }
    } catch {}
  }
  
  return parts.length > 0 ? parts.join('+') : 'ללא';
}

/**
 * Calculate promotion score (same logic as sorting)
 */
export function calculatePromotionScore(promotion: any): number {
  if (!promotion) return 0;
  
  let score = 0;
  
  if (promotion.boostUntil) {
    try {
      const date = promotion.boostUntil.toDate();
      if (date > new Date()) {
        score += 10;
      }
    } catch {}
  }
  
  if (promotion.highlightUntil) {
    try {
      const date = promotion.highlightUntil.toDate();
      if (date > new Date()) {
        score += 5;
      }
    } catch {}
  }
  
  return score;
}
