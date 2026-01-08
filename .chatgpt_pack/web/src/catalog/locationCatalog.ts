/**
 * Location catalog for web frontend
 * Mirrors the Android location structure: Country → Region → City → Neighborhood
 * 
 * This is a static catalog for now. It can be extended later to fetch from Firestore
 * or a JSON file if needed.
 */

export interface Neighborhood {
  id: string;
  labelHe: string;
}

export interface City {
  id: string;
  labelHe: string;
  neighborhoods?: Neighborhood[];
}

export interface Region {
  id: string;       // e.g. "center", "north", "south", "jerusalem"
  labelHe: string;  // e.g. "אזור המרכז"
  cities: City[];
}

export interface LocationCatalog {
  countryCode: string; // "IL"
  regions: Region[];
}

/**
 * Static location catalog with realistic Israeli regions and cities
 * IDs match Android structure where possible
 */
const LOCATION_CATALOG: LocationCatalog = {
  countryCode: "IL",
  regions: [
    {
      id: "center",
      labelHe: "אזור המרכז",
      cities: [
        {
          id: "tel_aviv",
          labelHe: "תל אביב",
          neighborhoods: [
            { id: "tel_aviv_center", labelHe: "מרכז העיר" },
            { id: "tel_aviv_north", labelHe: "צפון תל אביב" },
            { id: "tel_aviv_south", labelHe: "דרום תל אביב" },
          ],
        },
        {
          id: "ramat_gan",
          labelHe: "רמת גן",
        },
        {
          id: "givatayim",
          labelHe: "גבעתיים",
        },
        {
          id: "herzliya",
          labelHe: "הרצליה",
        },
        {
          id: "rishon_letzion",
          labelHe: "ראשון לציון",
        },
        {
          id: "petah_tikva",
          labelHe: "פתח תקווה",
        },
        {
          id: "netanya",
          labelHe: "נתניה",
        },
      ],
    },
    {
      id: "north",
      labelHe: "אזור הצפון",
      cities: [
        {
          id: "haifa",
          labelHe: "חיפה",
          neighborhoods: [
            { id: "haifa_center", labelHe: "מרכז חיפה" },
            { id: "haifa_carmel", labelHe: "הכרמל" },
          ],
        },
        {
          id: "acre",
          labelHe: "עכו",
        },
        {
          id: "nahariya",
          labelHe: "נהריה",
        },
        {
          id: "tiberias",
          labelHe: "טבריה",
        },
        {
          id: "karmiel",
          labelHe: "כרמיאל",
        },
      ],
    },
    {
      id: "south",
      labelHe: "אזור הדרום",
      cities: [
        {
          id: "beer_sheva",
          labelHe: "באר שבע",
        },
        {
          id: "ashdod",
          labelHe: "אשדוד",
        },
        {
          id: "ashkelon",
          labelHe: "אשקלון",
        },
        {
          id: "eilat",
          labelHe: "אילת",
        },
      ],
    },
    {
      id: "jerusalem",
      labelHe: "אזור ירושלים",
      cities: [
        {
          id: "jerusalem",
          labelHe: "ירושלים",
          neighborhoods: [
            { id: "jerusalem_center", labelHe: "מרכז העיר" },
            { id: "jerusalem_west", labelHe: "מערב ירושלים" },
            { id: "jerusalem_east", labelHe: "מזרח ירושלים" },
          ],
        },
        {
          id: "bethlehem",
          labelHe: "בית לחם",
        },
      ],
    },
  ],
};

/**
 * Get all regions
 */
export function getRegions(): Region[] {
  return LOCATION_CATALOG.regions;
}

/**
 * Get a region by ID
 */
export function getRegionById(regionId: string | null | undefined): Region | undefined {
  if (!regionId) return undefined;
  return LOCATION_CATALOG.regions.find((r) => r.id === regionId);
}

/**
 * Get all cities in a region
 */
export function getCitiesByRegion(regionId: string | null | undefined): City[] {
  if (!regionId) return [];
  const region = getRegionById(regionId);
  return region?.cities || [];
}

/**
 * Get a city by ID within a region
 */
export function getCityById(
  regionId: string | null | undefined,
  cityId: string | null | undefined
): City | undefined {
  if (!regionId || !cityId) return undefined;
  const cities = getCitiesByRegion(regionId);
  return cities.find((c) => c.id === cityId);
}

/**
 * Get the full location catalog
 */
export function getLocationCatalog(): LocationCatalog {
  return LOCATION_CATALOG;
}

