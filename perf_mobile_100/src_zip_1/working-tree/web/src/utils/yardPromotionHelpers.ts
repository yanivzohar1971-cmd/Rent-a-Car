import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { YardPromotionState } from '../types/Promotion';

/**
 * Fetch yard promotion state for a specific yard UID
 */
export async function fetchYardPromotionState(yardUid: string): Promise<YardPromotionState | null> {
  try {
    const userRef = doc(db, 'users', yardUid);
    const userDoc = await getDocFromServer(userRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data();
    return userData.promotion || null;
  } catch (error) {
    console.error(`Error fetching yard promotion state for ${yardUid}:`, error);
    return null;
  }
}

/**
 * Fetch multiple yard promotion states in parallel
 */
export async function fetchYardPromotionStates(yardUids: string[]): Promise<Map<string, YardPromotionState | null>> {
  const uniqueUids = [...new Set(yardUids)];
  const results = await Promise.all(
    uniqueUids.map(async (uid) => {
      const promotion = await fetchYardPromotionState(uid);
      return [uid, promotion] as [string, YardPromotionState | null];
    })
  );
  
  return new Map(results);
}

/**
 * Check if yard promotion is active (recommended, premium, etc.)
 */
export function isYardPromotionActive(promotion: YardPromotionState | null | undefined): boolean {
  if (!promotion) return false;
  
  // Check if premium status is active
  if (promotion.isPremium) {
    if (promotion.premiumUntil === null) {
      return true; // Unlimited premium
    }
    if (promotion.premiumUntil) {
      try {
        const date = promotion.premiumUntil.toDate();
        return date > new Date();
      } catch {
        return false;
      }
    }
  }
  
  return false;
}

/**
 * Check if yard shows recommended badge
 */
export function isRecommendedYard(promotion: YardPromotionState | null | undefined): boolean {
  if (!promotion) return false;
  
  if (promotion.showRecommendedBadge) {
    // Check if premiumUntil is still valid (or null for unlimited)
    if (promotion.premiumUntil === null) {
      return true;
    }
    if (promotion.premiumUntil) {
      try {
        const date = promotion.premiumUntil.toDate();
        return date > new Date();
      } catch {
        return false;
      }
    }
  }
  
  return false;
}

/**
 * Get yard promotion score for sorting
 */
export function getYardPromotionScore(promotion: YardPromotionState | null | undefined): number {
  if (!promotion) return 0;
  
  let score = 0;
  
  if (isRecommendedYard(promotion)) {
    score += 8; // Recommended yard bonus
  }
  
  if (promotion.featuredInStrips) {
    score += 5; // Featured in strips bonus
  }
  
  if (isYardPromotionActive(promotion)) {
    score += 3; // Premium status bonus
  }
  
  return score;
}

