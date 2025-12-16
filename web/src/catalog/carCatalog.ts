/**
 * Car Catalog Loader
 * Fetches and caches car catalog data (brands and models) with autocomplete support
 * Uses the simple JSON format from /car_catalog_models_he_en.json
 */

interface CatalogItem {
  brandEn: string;
  brandHe: string;
  models: Array<{
    modelEn: string;
    modelHe: string;
  }>;
}

export interface CatalogBrand {
  brandId: string;
  brandEn: string;
  brandHe: string;
}

export interface CatalogModel {
  modelId: string;
  brandId: string;
  brandEn: string;
  brandHe: string;
  modelEn: string;
  modelHe: string;
}

interface CachedData {
  data: CatalogItem[];
  timestamp: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CATALOG_URL = '/car_catalog_models_he_en.json';
const CACHE_KEY = 'carCatalog.full.v2';

// In-memory cache
let catalogCache: CatalogItem[] | null = null;
let catalogLoadPromise: Promise<CatalogItem[]> | null = null;

/**
 * Generate brandId from brandEn (simple slug)
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalize search query: trim, collapse spaces, lowercase
 */
function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(): CachedData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedData = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (e) {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

/**
 * Save data to cache
 */
function saveToCache(data: CatalogItem[]): void {
  try {
    const cached: CachedData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch (e) {
    console.warn('Failed to save catalog to cache:', e);
  }
}

/**
 * Fetch catalog from server
 */
async function fetchCatalogFromServer(): Promise<CatalogItem[]> {
  console.log('CarCatalog: fetching from', CATALOG_URL);
  
  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!response.ok) {
      console.error('CarCatalog: fetch failed', response.status, response.statusText);
      throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    console.log('CarCatalog: loaded catalog', {
      brandsCount: json.length ?? 0,
    });
    return json;
  } catch (error) {
    console.error('CarCatalog: error loading catalog', error);
    throw error;
  }
}

/**
 * Load catalog (from cache or server)
 */
async function loadCatalog(): Promise<CatalogItem[]> {
  // Return cached if available
  if (catalogCache) {
    return catalogCache;
  }

  // If already loading, return the same promise
  if (catalogLoadPromise) {
    return catalogLoadPromise;
  }

  // Check localStorage cache
  const cached = isCacheValid();
  if (cached) {
    console.log('CarCatalog: using cached catalog', {
      brandsCount: cached.data.length,
      cacheAge: Date.now() - cached.timestamp
    });
    catalogCache = cached.data;
    return cached.data;
  }

  // Fetch from server
  catalogLoadPromise = fetchCatalogFromServer().then((data) => {
    catalogCache = data;
    saveToCache(data);
    catalogLoadPromise = null;
    return data;
  });

  return catalogLoadPromise;
}

/**
 * Get all brands
 */
export async function getBrands(): Promise<CatalogBrand[]> {
  const catalog = await loadCatalog();
  
  return catalog.map((item) => ({
    brandId: slugify(item.brandEn),
    brandEn: item.brandEn,
    brandHe: item.brandHe,
  }));
}

/**
 * Get models for a specific brand
 */
export async function getModels(brandId: string): Promise<CatalogModel[]> {
  const catalog = await loadCatalog();
  const brand = catalog.find((item) => slugify(item.brandEn) === brandId);
  
  if (!brand) {
    return [];
  }

  return (brand.models || []).map((model) => ({
    modelId: `${brandId}:${slugify(model.modelEn)}`,
    brandId,
    brandEn: brand.brandEn,
    brandHe: brand.brandHe,
    modelEn: model.modelEn,
    modelHe: model.modelHe,
  }));
}

/**
 * Search brands by query (matches brandEn or brandHe)
 * Returns top N results
 */
export async function searchBrands(
  query: string,
  limit: number = 10
): Promise<CatalogBrand[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const normalized = normalizeQuery(query);
  console.log('CarCatalog: searching brands', { query, normalized });
  
  let brands: CatalogBrand[];
  try {
    brands = await getBrands();
    console.log('CarCatalog: got brands for search', { allBrandsCount: brands.length });
  } catch (error) {
    console.error('CarCatalog: failed to get brands for search', error);
    return [];
  }

  const matches = brands.filter((brand) => {
    const enMatch = normalizeQuery(brand.brandEn).includes(normalized);
    const heMatch = normalizeQuery(brand.brandHe).includes(normalized);
    return enMatch || heMatch;
  });

  // Prioritize prefix matches
  const prefixMatches: CatalogBrand[] = [];
  const containsMatches: CatalogBrand[] = [];

  matches.forEach((brand) => {
    const en = normalizeQuery(brand.brandEn);
    const he = normalizeQuery(brand.brandHe);
    const isPrefixMatch = en.startsWith(normalized) || he.startsWith(normalized);

    if (isPrefixMatch) {
      prefixMatches.push(brand);
    } else {
      containsMatches.push(brand);
    }
  });

  const results = [...prefixMatches, ...containsMatches].slice(0, limit);
  console.log('CarCatalog: search results', {
    query,
    allBrandsCount: brands.length,
    filteredCount: matches.length,
    resultsCount: results.length
  });

  return results;
}

/**
 * Search models within a brand by query (matches modelEn or modelHe)
 * Returns top N results
 */
export async function searchModels(
  brandId: string,
  query: string,
  limit: number = 10
): Promise<CatalogModel[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const normalized = normalizeQuery(query);
  const models = await getModels(brandId);

  const matches = models.filter((model) => {
    const enMatch = normalizeQuery(model.modelEn).includes(normalized);
    const heMatch = normalizeQuery(model.modelHe).includes(normalized);
    return enMatch || heMatch;
  });

  // Prioritize prefix matches
  const prefixMatches: CatalogModel[] = [];
  const containsMatches: CatalogModel[] = [];

  matches.forEach((model) => {
    const en = normalizeQuery(model.modelEn);
    const he = normalizeQuery(model.modelHe);
    const isPrefixMatch = en.startsWith(normalized) || he.startsWith(normalized);

    if (isPrefixMatch) {
      prefixMatches.push(model);
    } else {
      containsMatches.push(model);
    }
  });

  // Return prefix matches first, then contains matches
  return [...prefixMatches, ...containsMatches].slice(0, limit);
}

/**
 * Find brand by ID
 */
export async function getBrandById(brandId: string): Promise<CatalogBrand | null> {
  const brands = await getBrands();
  return brands.find((b) => b.brandId === brandId) || null;
}

/**
 * Find model by brandId and modelId
 */
export async function getModelById(
  brandId: string,
  modelId: string
): Promise<CatalogModel | null> {
  const models = await getModels(brandId);
  return models.find((m) => m.modelId === modelId) || null;
}
