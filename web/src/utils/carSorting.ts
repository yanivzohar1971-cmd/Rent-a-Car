/**
 * Locale-aware car sorting utilities
 * 
 * Provides sorting functions for cars by manufacturer and model,
 * supporting both Hebrew (א→ת) and English (A→Z) correctly.
 */

import type { YardCar } from '../api/yardFleetApi';

/**
 * Locale-aware collator for Hebrew and English text
 */
const collator = new Intl.Collator(['he', 'en'], {
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
});

/**
 * Compare two cars by manufacturer (brand) then model
 * 
 * Uses locale-aware comparison for proper Hebrew (א→ת) and English (A→Z) sorting.
 * 
 * @param a First car
 * @param b Second car
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareCarsByMakeModel(a: YardCar, b: YardCar): number {
  // Get manufacturer (brand) - normalize to empty string if null/undefined
  const aBrand = (a.brandText || a.brand || '').trim();
  const bBrand = (b.brandText || b.brand || '').trim();
  
  // Compare by manufacturer first
  const brandCompare = collator.compare(aBrand, bBrand);
  if (brandCompare !== 0) {
    return brandCompare;
  }
  
  // If manufacturers are equal, compare by model
  const aModel = (a.modelText || a.model || '').trim();
  const bModel = (b.modelText || b.model || '').trim();
  
  const modelCompare = collator.compare(aModel, bModel);
  if (modelCompare !== 0) {
    return modelCompare;
  }
  
  // If both manufacturer and model are equal, tiebreak by car number or ID for stability
  const aCarNumber = (a.licensePlatePartial || '').trim();
  const bCarNumber = (b.licensePlatePartial || '').trim();
  
  if (aCarNumber && bCarNumber) {
    const carNumberCompare = collator.compare(aCarNumber, bCarNumber);
    if (carNumberCompare !== 0) {
      return carNumberCompare;
    }
  }
  
  // Final tiebreak: use ID for stable sort
  return collator.compare(a.id || '', b.id || '');
}

