/**
 * Color canonicalization utility
 * 
 * Normalizes color values to a consistent Hebrew format for filtering and comparison.
 * This ensures that variations like "כסוף"/"כסף"/"silver" all map to the same canonical value.
 * 
 * IMPORTANT: This does NOT modify data in Firestore. It only normalizes values during
 * filtering/comparison operations.
 */

/**
 * Normalize text for comparison (trim, lowercase, remove punctuation)
 */
function normalizeComparableText(s: string): string {
  if (typeof s !== 'string') return '';
  
  let normalized = s.trim();
  
  // Convert Hebrew geresh ׳ and typographic ' to ASCII '
  normalized = normalized.replace(/['׳']/g, "'");
  
  // Remove quotes (Hebrew ״ and ASCII ")
  normalized = normalized.replace(/["״]/g, '');
  
  // Replace hyphens with space
  normalized = normalized.replace(/[־-]/g, ' ');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Remove extra punctuation (keep letters/numbers/spaces and apostrophes)
  normalized = normalized.replace(/[.,;:]/g, '').trim();
  
  return normalized.toLowerCase();
}

/**
 * Color synonym map: maps variations to canonical Hebrew values
 * Only includes the essential colors mentioned in requirements
 */
const COLOR_SYNONYMS: Record<string, string> = {
  // כסף variations
  'כסוף': 'כסף',
  'silver': 'כסף',
  
  // אפור variations
  'gray': 'אפור',
  'grey': 'אפור',
  
  // לבן variations
  'white': 'לבן',
  
  // שחור variations
  'black': 'שחור',
  
  // אדום variations
  'red': 'אדום',
  
  // כחול variations
  'blue': 'כחול',
  
  // ירוק variations
  'green': 'ירוק',
  
  // כתום variations
  'orange': 'כתום',
  
  // צהוב variations
  'yellow': 'צהוב',
  
  // סגול variations
  'purple': 'סגול',
  
  // חום variations
  'brown': 'חום',
  
  // ורוד variations
  'pink': 'ורוד',
};

/**
 * Canonicalize a color value to a consistent Hebrew format
 * 
 * @param input - Raw color value (can be Hebrew, English, or variations)
 * @returns Canonical Hebrew color value, or null if input is empty/invalid
 */
export function canonColor(input?: string | null): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  
  // Normalize for comparison
  const normalized = normalizeComparableText(trimmed);
  
  // Check if it's already a canonical value (exact match after normalization)
  const canonicalValues = Object.values(COLOR_SYNONYMS);
  for (const canon of canonicalValues) {
    if (normalizeComparableText(canon) === normalized) {
      return canon;
    }
  }
  
  // Check synonym map
  for (const [synonym, canon] of Object.entries(COLOR_SYNONYMS)) {
    if (normalizeComparableText(synonym) === normalized) {
      return canon;
    }
  }
  
  // If no match found, return the original trimmed value (fallback)
  // This allows new colors to work even if not in the synonym map
  return trimmed;
}

/**
 * Check if two color values are equivalent (after canonicalization)
 * Also handles special case: כסף <-> אפור (bidirectional)
 * 
 * @param color1 - First color value
 * @param color2 - Second color value
 * @returns true if colors match (after canonicalization and special cases)
 */
export function colorsMatch(color1?: string | null, color2?: string | null): boolean {
  const canon1 = canonColor(color1);
  const canon2 = canonColor(color2);
  
  if (!canon1 || !canon2) {
    return false;
  }
  
  // Exact match
  if (canon1 === canon2) {
    return true;
  }
  
  // Special case: כסף <-> אפור (bidirectional)
  if ((canon1 === 'כסף' && canon2 === 'אפור') || (canon1 === 'אפור' && canon2 === 'כסף')) {
    return true;
  }
  
  return false;
}
