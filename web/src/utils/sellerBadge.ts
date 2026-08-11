/**
 * Seller Badge Utility
 *
 * Resolves the correct badge text for a seller based on seller type and paid exposure status.
 * Uses resolvePublicCarDisplay for consistency with CarDetailsPage (snapshot-first).
 */

import type { PublicSearchResultItem } from '../types/PublicSearchResult';
import type { PublicCar } from '../types/cars';
import type { Car } from '../api/carsApi';
import { resolvePublicCarDisplay } from './resolvePublicCarDisplay';

/**
 * Unified type for car data that has seller information
 */
type CarWithSeller =
  | PublicSearchResultItem
  | PublicCar
  | Car
  | {
      sellerType?: 'YARD' | 'AGENT' | 'PRIVATE' | null;
      yardName?: string | null;
      sellerDisplayName?: string | null;
      showSellerNameInBadge?: boolean;
    };

/**
 * Resolve seller badge text based on seller type and paid exposure
 *
 * DEFAULT BEHAVIOR (showSellerNameInBadge is undefined/null):
 * - YARD/AGENT: Show displayName from yardSnapshot/sellerSnapshot if available, else fallback to "מגרש"/"סוכן"
 *
 * EXPLICIT OVERRIDE:
 * - If showSellerNameInBadge === false: Always show generic badge ("מגרש"/"סוכן")
 *
 * @param car - Car data with seller information (publicCar / PublicSearchResultItem)
 * @returns Badge text in Hebrew
 */
export function resolveSellerBadgeText(car: CarWithSeller): string {
  const sellerType = car.sellerType;
  const { displayName: sellerDisplayName } = resolvePublicCarDisplay(car);
  const showSellerNameInBadge = (car as any).showSellerNameInBadge;
  
  // PRIVATE: Always show "פרטי"
  if (sellerType === 'PRIVATE') {
    return 'פרטי';
  }
  
  // AGENT: Default to showing name (treat undefined/null as true)
  if (sellerType === 'AGENT') {
    // Only if explicitly false, hide name
    if (showSellerNameInBadge === false) {
      return 'סוכן';
    }
    // Default behavior: show name if available, else "סוכן"
    return sellerDisplayName || 'סוכן';
  }
  
  // YARD: Default to showing name (treat undefined/null as true)
  if (sellerType === 'YARD') {
    // Only if explicitly false, hide name
    if (showSellerNameInBadge === false) {
      return 'מגרש';
    }
    // Default behavior: show name if available, else "מגרש"
    return sellerDisplayName || 'מגרש';
  }
  
  // Unknown seller type: default to "מוכר"
  return 'מוכר';
}

/**
 * Get seller logo URL from car data
 *
 * CRITICAL: Respects showSellerLogoInBadge / showLogo flag from adminSellerExposure.
 * Uses resolvePublicCarDisplay (snapshot-first) for consistency with CarDetailsPage.
 *
 * @param car - Car data with seller information (publicCar / PublicSearchResultItem)
 * @returns Logo URL or null (null if flag is false or URL is missing)
 */
export function getSellerLogoUrl(car: CarWithSeller): string | null {
  const showLogo = (car as any).showSellerLogoInBadge ?? (car as any).showLogo;
  if (showLogo === false) {
    return null; // Admin has disabled logo display
  }
  const { logoUrl } = resolvePublicCarDisplay(car);
  return logoUrl;
}

