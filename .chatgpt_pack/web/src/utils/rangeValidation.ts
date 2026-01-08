import type { CarFilters } from '../api/carsApi';

/**
 * ============================================================================
 * RANGE VALIDATION REGISTRY
 * ============================================================================
 * 
 * When adding a new min/max filter:
 * 1. Add it to RANGE_FIELDS below (minKey, maxKey, labelHe)
 * 2. That's it! No other changes needed.
 * 
 * Normalization is automatically applied in:
 * - UI layer (CarSearchFilterBar)
 * - URL parse/serialize (CarsSearchPage, buildSearchUrl)
 * - Query builders (fetchPublicCars, fetchCarsFromFirestore)
 * - Saved searches (createSavedSearch, updateSavedSearch, mapSavedSearchDoc)
 * 
 * ============================================================================
 */

/**
 * Configuration for a range field pair (min/max)
 */
export type RangeField = {
  minKey: keyof CarFilters;
  maxKey: keyof CarFilters;
  labelHe: string;
};

/**
 * Normalization mode
 * - "swap": Swap min/max values when reversed (default, for external/unsafe inputs)
 * - "clamp": Clamp max to min when reversed (for interactive dialogs)
 */
export type NormalizationMode = 'swap' | 'clamp';

/**
 * Options for range normalization
 */
export type NormalizeRangesOptions = {
  mode?: NormalizationMode;
};

/**
 * Result of range normalization
 */
export type RangeNormalizationResult<T extends Record<string, any>> = {
  normalized: T;
  fixes: Array<{ labelHe: string; from: any; to: any; mode: NormalizationMode }>;
  errors: Array<{ labelHe: string; message: string }>;
};

/**
 * Single source of truth: All range field pairs that need validation
 * 
 * Type-safe: keys must exist in CarFilters type
 * Exported: used by UI feedback to display labels
 */
export const RANGE_FIELDS: ReadonlyArray<RangeField> = [
  { minKey: 'yearFrom', maxKey: 'yearTo', labelHe: 'שנה' },
  { minKey: 'kmFrom', maxKey: 'kmTo', labelHe: 'קילומטראז׳' },
  { minKey: 'priceFrom', maxKey: 'priceTo', labelHe: 'מחיר' },
  { minKey: 'handFrom', maxKey: 'handTo', labelHe: 'ידיים' },
  { minKey: 'engineCcFrom', maxKey: 'engineCcTo', labelHe: 'נפח מנוע' },
  { minKey: 'hpFrom', maxKey: 'hpTo', labelHe: 'כוח סוס' },
  { minKey: 'gearsFrom', maxKey: 'gearsTo', labelHe: 'הילוכים' },
] as const;

/**
 * Parse a value to a number, handling strings, numbers, null, undefined, and empty strings
 * 
 * Rules:
 * - Numeric 0 is valid and must be preserved
 * - Empty strings, null, undefined -> undefined
 * - Strings with commas/spaces are cleaned (e.g., "200,000" -> 200000)
 * - NaN or invalid -> undefined (do not swap)
 */
function parseNumericValue(value: any): number | undefined {
  // Handle 0 explicitly (0 is falsy but valid)
  if (value === 0 || value === '0') {
    return 0;
  }
  
  // Handle null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  
  // Handle numbers
  if (typeof value === 'number') {
    // Check if finite (excludes NaN, Infinity, -Infinity)
    return Number.isFinite(value) ? value : undefined;
  }
  
  // Handle strings
  if (typeof value === 'string') {
    // Trim whitespace
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    
    // Remove commas and spaces for number parsing
    const cleaned = trimmed.replace(/[,\s]/g, '');
    if (!cleaned) return undefined;
    
    // Parse as number
    const parsed = Number(cleaned);
    
    // Return only if finite (excludes NaN, Infinity)
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  
  return undefined;
}

/**
 * Normalize all range pairs in a filters object
 * 
 * For each min/max pair:
 * - If both exist and min > max:
 *   - mode="swap" (default): Swap the values
 *   - mode="clamp": Set max = min (clamp, for interactive dialogs)
 * - Return a cloned object only when changes are needed
 * - Track all fixes in the fixes array
 * 
 * @param filters - The filter object to normalize
 * @param options - Normalization options (mode: "swap" | "clamp", default: "swap")
 * @returns Normalized filters, list of fixes applied, and any errors
 */
export function normalizeRanges<T extends Record<string, any>>(
  filters: T,
  options: NormalizeRangesOptions = {}
): RangeNormalizationResult<T> {
  const mode: NormalizationMode = options.mode || 'swap';
  const fixes: Array<{ labelHe: string; from: any; to: any; mode: NormalizationMode }> = [];
  const errors: Array<{ labelHe: string; message: string }> = [];
  let needsClone = false;
  const normalized: T = { ...filters };

  for (const rangeField of RANGE_FIELDS) {
    const minKey = rangeField.minKey as string;
    const maxKey = rangeField.maxKey as string;
    
    const minValue = filters[minKey];
    const maxValue = filters[maxKey];
    
    // Parse both values
    const minParsed = parseNumericValue(minValue);
    const maxParsed = parseNumericValue(maxValue);
    
    // If both are missing, skip
    if (minParsed === undefined && maxParsed === undefined) {
      continue;
    }
    
    // If only one is missing, accept as-is (partial range)
    if (minParsed === undefined || maxParsed === undefined) {
      continue;
    }
    
    // Both exist - check if reversed
    if (minParsed > maxParsed) {
      needsClone = true;
      
      if (mode === 'clamp') {
        // Clamp: set max = min (for interactive dialogs)
        (normalized as any)[maxKey] = minParsed;
        fixes.push({
          labelHe: rangeField.labelHe,
          from: minParsed,
          to: maxParsed,
          mode: 'clamp',
        });
      } else {
        // Swap: exchange values (default, for external/unsafe inputs)
        (normalized as any)[minKey] = maxParsed;
        (normalized as any)[maxKey] = minParsed;
        fixes.push({
          labelHe: rangeField.labelHe,
          from: minParsed,
          to: maxParsed,
          mode: 'swap',
        });
      }
    }
  }

  // Only return cloned object if changes were made
  const result: RangeNormalizationResult<T> = {
    normalized: needsClone ? normalized : filters,
    fixes,
    errors,
  };

  return result;
}
