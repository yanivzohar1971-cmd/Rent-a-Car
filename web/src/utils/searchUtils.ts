import type { CarFilters } from '../api/carsApi';
import { getGearboxTypeLabel, getFuelTypeLabel, getBodyTypeLabel } from '../types/carTypes';

/**
 * Saved search entry stored in localStorage
 */
export type SavedSearch = {
  id: string;
  timestamp: number;
  filters: CarFilters;
  label: string;
};

const RECENT_SEARCHES_KEY = 'carSearch_recent';
const MAX_RECENT_SEARCHES = 8;

/**
 * Normalize filters by removing empty/undefined/null fields
 */
export function normalizeFilters(filters: CarFilters): CarFilters {
  const normalized: CarFilters = {};
  
  // Only include fields that have meaningful values
  if (filters.manufacturer?.trim()) normalized.manufacturer = filters.manufacturer.trim();
  if (filters.model?.trim()) normalized.model = filters.model.trim();
  if (filters.minYear !== undefined) normalized.minYear = filters.minYear;
  if (filters.maxPrice !== undefined) normalized.maxPrice = filters.maxPrice;
  
  if (filters.yearFrom !== undefined) normalized.yearFrom = filters.yearFrom;
  if (filters.yearTo !== undefined) normalized.yearTo = filters.yearTo;
  if (filters.kmFrom !== undefined) normalized.kmFrom = filters.kmFrom;
  if (filters.kmTo !== undefined) normalized.kmTo = filters.kmTo;
  if (filters.priceFrom !== undefined) normalized.priceFrom = filters.priceFrom;
  if (filters.priceTo !== undefined) normalized.priceTo = filters.priceTo;
  
  if (filters.handFrom !== undefined) normalized.handFrom = filters.handFrom;
  if (filters.handTo !== undefined) normalized.handTo = filters.handTo;
  if (filters.engineCcFrom !== undefined) normalized.engineCcFrom = filters.engineCcFrom;
  if (filters.engineCcTo !== undefined) normalized.engineCcTo = filters.engineCcTo;
  if (filters.hpFrom !== undefined) normalized.hpFrom = filters.hpFrom;
  if (filters.hpTo !== undefined) normalized.hpTo = filters.hpTo;
  if (filters.gearsFrom !== undefined) normalized.gearsFrom = filters.gearsFrom;
  if (filters.gearsTo !== undefined) normalized.gearsTo = filters.gearsTo;
  
  if (filters.gearboxTypes && filters.gearboxTypes.length > 0) {
    normalized.gearboxTypes = filters.gearboxTypes;
  }
  if (filters.fuelTypes && filters.fuelTypes.length > 0) {
    normalized.fuelTypes = filters.fuelTypes;
  }
  if (filters.bodyTypes && filters.bodyTypes.length > 0) {
    normalized.bodyTypes = filters.bodyTypes;
  }
  
  if (filters.acRequired !== null && filters.acRequired !== undefined) {
    normalized.acRequired = filters.acRequired;
  }
  if (filters.color?.trim()) {
    normalized.color = filters.color.trim();
  }
  
  return normalized;
}

/**
 * Check if filters are empty (no meaningful search criteria)
 */
export function isEmptyFilters(filters: CarFilters): boolean {
  const normalized = normalizeFilters(filters);
  return Object.keys(normalized).length === 0;
}

/**
 * Generate a human-readable label for a search
 */
export function generateSearchLabel(filters: CarFilters): string {
  const parts: string[] = [];
  
  if (filters.manufacturer) {
    parts.push(filters.manufacturer);
  }
  if (filters.model) {
    parts.push(filters.model);
  }
  
  // Year range
  if (filters.yearFrom || filters.yearTo) {
    if (filters.yearFrom && filters.yearTo) {
      parts.push(`${filters.yearFrom}–${filters.yearTo}`);
    } else if (filters.yearFrom) {
      parts.push(`מ-${filters.yearFrom}`);
    } else if (filters.yearTo) {
      parts.push(`עד ${filters.yearTo}`);
    }
  }
  
  // KM range
  if (filters.kmTo) {
    const km = filters.kmTo >= 1000 ? `${(filters.kmTo / 1000).toFixed(0)}K` : filters.kmTo.toString();
    parts.push(`עד ${km} ק״מ`);
  } else if (filters.kmFrom) {
    const km = filters.kmFrom >= 1000 ? `${(filters.kmFrom / 1000).toFixed(0)}K` : filters.kmFrom.toString();
    parts.push(`מ-${km} ק״מ`);
  }
  
  // Price range
  if (filters.priceTo) {
    const price = filters.priceTo >= 1000 ? `${(filters.priceTo / 1000).toFixed(0)}K` : filters.priceTo.toString();
    parts.push(`עד ${price} ₪`);
  } else if (filters.priceFrom) {
    const price = filters.priceFrom >= 1000 ? `${(filters.priceFrom / 1000).toFixed(0)}K` : filters.priceFrom.toString();
    parts.push(`מ-${price} ₪`);
  }
  
  // Advanced filters summary
  const advancedParts: string[] = [];
  if (filters.gearboxTypes && filters.gearboxTypes.length > 0) {
    advancedParts.push(filters.gearboxTypes.map(t => getGearboxTypeLabel(t)).join(', '));
  }
  if (filters.fuelTypes && filters.fuelTypes.length > 0) {
    advancedParts.push(filters.fuelTypes.map(t => getFuelTypeLabel(t)).join(', '));
  }
  if (filters.bodyTypes && filters.bodyTypes.length > 0) {
    advancedParts.push(filters.bodyTypes.map(t => getBodyTypeLabel(t)).join(', '));
  }
  
  if (advancedParts.length > 0) {
    parts.push(`(${advancedParts.join(', ')})`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'חיפוש כללי';
}

/**
 * Load recent searches from localStorage
 */
export function loadRecentSearches(): SavedSearch[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.warn('Failed to load recent searches:', error);
    return [];
  }
}

/**
 * Save a search to recent searches
 */
export function saveRecentSearch(filters: CarFilters): void {
  if (isEmptyFilters(filters)) {
    return; // Don't save empty searches
  }
  
  try {
    const normalized = normalizeFilters(filters);
    const existing = loadRecentSearches();
    
    // Remove exact duplicates (same normalized filters)
    const normalizedStr = JSON.stringify(normalized);
    const deduped = existing.filter(search => {
      const searchStr = JSON.stringify(normalizeFilters(search.filters));
      return searchStr !== normalizedStr;
    });
    
    // Create new entry
    const newSearch: SavedSearch = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      filters: normalized,
      label: generateSearchLabel(normalized),
    };
    
    // Prepend and limit
    const updated = [newSearch, ...deduped].slice(0, MAX_RECENT_SEARCHES);
    
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save recent search:', error);
  }
}

/**
 * Clear all recent searches
 */
export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch (error) {
    console.warn('Failed to clear recent searches:', error);
  }
}

/**
 * Count active advanced filters
 */
export function countActiveAdvancedFilters(filters: CarFilters): number {
  let count = 0;
  
  // Numeric ranges - count as active if at least one edge is set
  if (filters.handFrom !== undefined || filters.handTo !== undefined) count++;
  if (filters.engineCcFrom !== undefined || filters.engineCcTo !== undefined) count++;
  if (filters.hpFrom !== undefined || filters.hpTo !== undefined) count++;
  if (filters.gearsFrom !== undefined || filters.gearsTo !== undefined) count++;
  
  // Arrays - count if non-empty
  if (filters.gearboxTypes && filters.gearboxTypes.length > 0) count++;
  if (filters.fuelTypes && filters.fuelTypes.length > 0) count++;
  if (filters.bodyTypes && filters.bodyTypes.length > 0) count++;
  
  // AC - count if not null/undefined (i.e., user has a preference)
  if (filters.acRequired !== null && filters.acRequired !== undefined) count++;
  
  // Color - count if non-empty string
  if (filters.color && filters.color.trim()) count++;
  
  return count;
}

/**
 * Build search URL from filters
 * @param filters - The filter object
 * @param basePath - Base path (default: '/cars')
 * @param includeOrigin - Whether to include full origin (default: true for sharing, false for navigation)
 */
export function buildSearchUrl(filters: CarFilters, basePath: string = '/cars', includeOrigin: boolean = true): string {
  const normalized = normalizeFilters(filters);
  const params = new URLSearchParams();
  
  if (normalized.manufacturer) params.set('manufacturer', normalized.manufacturer);
  if (normalized.model) params.set('model', normalized.model);
  
  // Legacy fields (backward compatibility)
  if (normalized.minYear !== undefined) params.set('minYear', String(normalized.minYear));
  if (normalized.maxPrice !== undefined) params.set('maxPrice', String(normalized.maxPrice));
  
  // Basic filters
  if (normalized.yearFrom !== undefined) params.set('yearFrom', String(normalized.yearFrom));
  if (normalized.yearTo !== undefined) params.set('yearTo', String(normalized.yearTo));
  if (normalized.kmFrom !== undefined) params.set('kmFrom', String(normalized.kmFrom));
  if (normalized.kmTo !== undefined) params.set('kmTo', String(normalized.kmTo));
  if (normalized.priceFrom !== undefined) params.set('priceFrom', String(normalized.priceFrom));
  if (normalized.priceTo !== undefined) params.set('priceTo', String(normalized.priceTo));
  
  // Advanced filters - numeric ranges
  if (normalized.handFrom !== undefined) params.set('handFrom', String(normalized.handFrom));
  if (normalized.handTo !== undefined) params.set('handTo', String(normalized.handTo));
  if (normalized.engineCcFrom !== undefined) params.set('engineCcFrom', String(normalized.engineCcFrom));
  if (normalized.engineCcTo !== undefined) params.set('engineCcTo', String(normalized.engineCcTo));
  if (normalized.hpFrom !== undefined) params.set('hpFrom', String(normalized.hpFrom));
  if (normalized.hpTo !== undefined) params.set('hpTo', String(normalized.hpTo));
  if (normalized.gearsFrom !== undefined) params.set('gearsFrom', String(normalized.gearsFrom));
  if (normalized.gearsTo !== undefined) params.set('gearsTo', String(normalized.gearsTo));
  
  // Advanced filters - arrays (comma-separated)
  if (normalized.gearboxTypes && normalized.gearboxTypes.length > 0) {
    params.set('gearboxTypes', normalized.gearboxTypes.join(','));
  }
  if (normalized.fuelTypes && normalized.fuelTypes.length > 0) {
    params.set('fuelTypes', normalized.fuelTypes.join(','));
  }
  if (normalized.bodyTypes && normalized.bodyTypes.length > 0) {
    params.set('bodyTypes', normalized.bodyTypes.join(','));
  }
  
  // AC filter
  if (normalized.acRequired !== null && normalized.acRequired !== undefined) {
    params.set('acRequired', String(normalized.acRequired));
  }
  
  // Color filter
  if (normalized.color) {
    params.set('color', normalized.color);
  }
  
  const queryString = params.toString();
  const pathWithQuery = `${basePath}${queryString ? `?${queryString}` : ''}`;
  
  return includeOrigin ? `${window.location.origin}${pathWithQuery}` : pathWithQuery;
}

