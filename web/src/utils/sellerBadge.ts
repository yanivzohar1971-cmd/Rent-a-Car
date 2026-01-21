/**
 * Seller Badge Utility
 * 
 * Resolves the correct badge text for a seller based on seller type and paid exposure status.
 * Used consistently across car cards and car details pages.
 */

import type { PublicSearchResultItem } from '../types/PublicSearchResult';
import type { PublicCar } from '../types/cars';
import type { Car } from '../api/carsApi';

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
 * - YARD/AGENT: Show sellerDisplayName if available, else fallback to "מגרש"/"סוכן"
 * 
 * EXPLICIT OVERRIDE:
 * - If showSellerNameInBadge === false: Always show generic badge ("מגרש"/"סוכן")
 * 
 * Rules:
 * - PRIVATE: Always "פרטי"
 * - AGENT:
 *   - If showSellerNameInBadge === false => "סוכן"
 *   - Else if sellerDisplayName exists => sellerDisplayName
 *   - Else => "סוכן"
 * - YARD:
 *   - If showSellerNameInBadge === false => "מגרש"
 *   - Else if sellerDisplayName exists => sellerDisplayName
 *   - Else => "מגרש"
 * 
 * @param car - Car data with seller information
 * @returns Badge text in Hebrew
 */
export function resolveSellerBadgeText(car: CarWithSeller): string {
  const sellerType = car.sellerType;
  const sellerDisplayName = (car as any).sellerDisplayName || (car as any).yardName || (car as any).yardDisplayName || null;
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
 * CRITICAL: Respects showSellerLogoInBadge flag from adminSellerExposure.
 * If showSellerLogoInBadge === false, returns null even if logo URL exists.
 * 
 * @param car - Car data with seller information
 * @returns Logo URL or null (null if flag is false or URL is missing)
 */
export function getSellerLogoUrl(car: CarWithSeller): string | null {
  // Check exposure flag first: if explicitly false, hide logo
  const showLogo = (car as any).showSellerLogoInBadge;
  if (showLogo === false) {
    return null; // Admin has disabled logo display
  }
  
  // Otherwise, return logo URL if available (from snapshots or flat fields)
  // Priority: sellerLogoUrl, then yardLogoUrl, then snapshot-derived URLs
  const carAny = car as any;
  
  // Check nested snapshots first (if present)
  const yardSnap = carAny.yardSnapshot && typeof carAny.yardSnapshot === 'object' ? carAny.yardSnapshot : null;
  const sellerSnap = carAny.sellerSnapshot && typeof carAny.sellerSnapshot === 'object' ? carAny.sellerSnapshot : null;
  
  return (
    carAny.sellerLogoUrl || 
    carAny.yardLogoUrl || 
    yardSnap?.yardLogoUrl || 
    sellerSnap?.sellerLogoUrl || 
    null
  );
}

