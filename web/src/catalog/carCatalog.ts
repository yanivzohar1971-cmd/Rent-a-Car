/**
 * Car Catalog Loader
 * Fetches and caches car catalog data (brands and models) with autocomplete support
 */

export interface CatalogBrand {
  brandId: string;
  brandEn: string;
  brandHe: string;
}

export interface CatalogModel {
  modelId: string;
  modelEn: string;
  modelHe: string;
}

interface BrandsOnlyResponse {
  version: number;
  generatedAt: string;
  brands: CatalogBrand[];
}

interface BrandModelsResponse {
  version: number;
  brandId: string;
  brandEn: string;
  brandHe: string;
  generatedAt: string;
  models: CatalogModel[];
}

interface CachedData<T> {
  data: T;
  timestamp: number;
  version: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CATALOG_BASE_URL = '/car_catalog';

// Cache keys
const CACHE_KEY_BRANDS = 'carCatalog.brands.v1';
const CACHE_KEY_MODELS_PREFIX = 'carCatalog.models.';

/**
 * Normalize search query: trim, collapse spaces, lowercase
 */
function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Check if cached data is still valid
 */
function isCacheValid<T>(cacheKey: string, requiredVersion: number): CachedData<T> | null {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    if (age > CACHE_TTL_MS || parsed.version !== requiredVersion) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return parsed;
  } catch (e) {
    localStorage.removeItem(cacheKey);
    return null;
  }
}

/**
 * Save data to cache
 */
function saveToCache<T>(cacheKey: string, data: T, version: number): void {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      version,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch (e) {
    console.warn('Failed to save to cache:', e);
  }
}

/**
 * Fetch all brands from server
 */
async function fetchBrandsFromServer(): Promise<BrandsOnlyResponse> {
  const url = `${CATALOG_BASE_URL}/brands_only.v1.json`;
  console.log('CarCatalog: fetching brands from', url);
  
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      console.error('CarCatalog: fetch failed', response.status, response.statusText);
      throw new Error(`Failed to fetch brands: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    console.log('CarCatalog: loaded brands', {
      brandsCount: json.brands?.length ?? 0,
      version: json.version,
      generatedAt: json.generatedAt
    });
    return json;
  } catch (error) {
    console.error('CarCatalog: error loading brands', error);
    throw error;
  }
}

/**
 * Fetch models for a specific brand from server
 */
async function fetchModelsFromServer(brandId: string): Promise<BrandModelsResponse> {
  const response = await fetch(`${CATALOG_BASE_URL}/brands/${brandId}.models.v1.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models for ${brandId}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get all brands (from cache or server)
 */
export async function getBrands(): Promise<CatalogBrand[]> {
  // Check cache first
  const cached = isCacheValid<BrandsOnlyResponse>(CACHE_KEY_BRANDS, 1);
  if (cached) {
    console.log('CarCatalog: using cached brands', {
      brandsCount: cached.data.brands.length,
      cacheAge: Date.now() - cached.timestamp
    });
    return cached.data.brands;
  }

  // Fetch from server
  const response = await fetchBrandsFromServer();
  saveToCache(CACHE_KEY_BRANDS, response, response.version);
  return response.brands;
}

/**
 * Get models for a specific brand (from cache or server)
 */
export async function getModels(brandId: string): Promise<CatalogModel[]> {
  const cacheKey = `${CACHE_KEY_MODELS_PREFIX}${brandId}.v1`;

  // Check cache first
  const cached = isCacheValid<BrandModelsResponse>(cacheKey, 1);
  if (cached) {
    return cached.data.models;
  }

  // Fetch from server
  const response = await fetchModelsFromServer(brandId);
  saveToCache(cacheKey, response, response.version);
  return response.models;
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

  // Return prefix matches first, then contains matches
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

