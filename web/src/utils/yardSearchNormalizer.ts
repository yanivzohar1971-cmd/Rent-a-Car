/**
 * Shared normalizer for yard-side text search (Smart Publish, Fleet, carsMasterApi).
 * Makes Hebrew and mixed query/searchable text match robustly (e.g. cars starting with "ש").
 *
 * - trim, lowercase
 * - normalize Hebrew apostrophe/geresh variants (׳, ', `)
 * - remove quotes / double quotes / Hebrew gershayim (״)
 * - normalize hyphen/maqaf (־) to spaces
 * - collapse multiple spaces
 * - preserve Hebrew letters and digits
 */
export function normalizeYardSearchText(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  let t = s.trim().toLowerCase();
  // Hebrew geresh/apostrophe variants → space (so "ש'ח" and "ש ח" both normalize)
  t = t.replace(/[\u05F3\u0027\u0060\u2018\u2019\u201B]/g, ' ');
  // Hebrew gershayim / straight double quotes
  t = t.replace(/[\u05F4\u0022\u201C\u201D]/g, ' ');
  // Maqaf (Hebrew hyphen) and common hyphens/dashes → space
  t = t.replace(/[\u05BE\u002D\u2010\u2011\u2012\u2013\u2014]/g, ' ');
  // Other common punctuation → space (optional, keeps matching deterministic)
  t = t.replace(/[,.\u0589;:!?()[\]{}]/g, ' ');
  // Collapse multiple spaces
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}
