#!/usr/bin/env node
/**
 * Brand Coverage Patcher
 * 
 * Adds missing car manufacturers from Yad2 list to our car catalog.
 * 
 * Usage:
 *   node scripts/patch-brand-coverage.mjs
 *   node scripts/patch-brand-coverage.mjs --yad2="docs/yad2-manufacturers.he.txt" --catalog="web/public/car_catalog_models_he_en.json"
 */

import { readFile, writeFile } from 'fs/promises';
import { readdirSync, existsSync } from 'fs';
import { join, dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Brand Hebrew -> English mapping (EXACT)
 */
const BRAND_MAPPING = {
  'אאודי': 'Audi',
  'אופל': 'Opel',
  'אורה': 'ORA',
  'אינפיניטי': 'Infiniti',
  'אלפא רומיאו': 'Alfa Romeo',
  'אם ג\'י': 'MG',
  'ב מ וו': 'BMW',
  'בי.ווי.די': 'BYD',
  'ג\'נסיס': 'Genesis',
  'גרייט וול': 'Great Wall',
  'ג׳יי.איי.סי': 'GAC',
  'דאצ\'יה': 'Dacia',
  'דודג\'': 'Dodge',
  'די.אס': 'DS',
  'דייהו': 'Daewoo',
  'דייהטסו': 'Daihatsu',
  'הונדה': 'Honda',
  'וולוו': 'Volvo',
  'טויוטה': 'Toyota',
  'יונדאי': 'Hyundai',
  'לאדה': 'Lada',
  'לינקולן': 'Lincoln',
  'לנצ\'יה': 'Lancia',
  'לקסוס': 'Lexus',
  'מאזדה': 'Mazda',
  'מיני': 'MINI',
  'מיצובישי': 'Mitsubishi',
  'מרצדס-בנץ': 'Mercedes-Benz',
  'ניסאן': 'Nissan',
  'סובארו': 'Subaru',
  'סוזוקי': 'Suzuki',
  'סיאט': 'SEAT',
  'סיטרואן': 'Citroen',
  'סקודה': 'Skoda',
  'פולסטאר': 'Polestar',
  'פולקסווגן': 'Volkswagen',
  'פורד': 'Ford',
  'פורשה': 'Porsche',
  'פיאט': 'Fiat',
  'פיג\'ו': 'Peugeot',
  'קאדילק': 'Cadillac',
  'קופרה': 'Cupra',
  'קיה': 'Kia',
  'קרייזלר': 'Chrysler',
  'רובר': 'Rover',
  'רנו': 'Renault',
  'שברולט': 'Chevrolet',
};

/**
 * Normalize brand name for comparison
 * - trim
 * - lowercase (only affects latin)
 * - replace Hebrew quotes (׳ ״) and ascii quotes (', ") with nothing
 * - remove dots, hyphens, en/em-dash, slashes
 * - collapse whitespace
 * - finally remove ALL spaces
 */
function normalizeBrandName(name) {
  if (!name) return '';
  
  return name
    .trim()
    .toLowerCase() // Only affects latin characters
    .replace(/['"׳״]/g, '') // Remove quotes (Hebrew and ASCII)
    .replace(/[.\-–—\/\\]/g, '') // Remove dots, hyphens, dashes, slashes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/\s/g, ''); // Remove all spaces
}

/**
 * Find catalog file by searching from repo root
 * Prefers web/public/car_catalog_models_he_en.json (source of truth for web UI)
 * Falls back to recursive search if not found there
 * Ignores: node_modules, .git, dist, build, coverage, .firebase, .cache
 */
function findCatalogFile() {
  const catalogName = 'car_catalog_models_he_en.json';
  
  // First, check the preferred location (web/public - source of truth for web UI)
  const preferredPath = join(REPO_ROOT, 'web', 'public', catalogName);
  if (existsSync(preferredPath)) {
    return preferredPath;
  }
  
  // If not found, search recursively
  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.firebase', '.cache']);
  
  function searchDir(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          const found = searchDir(fullPath);
          if (found) return found;
        }
      } else if (entry.isFile() && entry.name === catalogName) {
        return fullPath;
      }
    }
    
    return null;
  }
  
  return searchDir(REPO_ROOT);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    yad2: null,
    catalog: null,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--yad2=')) {
      config.yad2 = arg.substring('--yad2='.length).replace(/^["']|["']$/g, '');
    } else if (arg.startsWith('--catalog=')) {
      config.catalog = arg.substring('--catalog='.length).replace(/^["']|["']$/g, '');
    }
  }
  
  // Defaults
  if (!config.yad2) {
    config.yad2 = join(REPO_ROOT, 'docs', 'yad2-manufacturers.he.txt');
  } else if (!isAbsolute(config.yad2)) {
    config.yad2 = join(REPO_ROOT, config.yad2);
  }
  
  if (!config.catalog) {
    const found = findCatalogFile();
    if (!found) {
      throw new Error('Catalog file not found. Please specify --catalog path or ensure car_catalog_models_he_en.json exists in the repo.');
    }
    config.catalog = found;
  } else if (!isAbsolute(config.catalog)) {
    config.catalog = join(REPO_ROOT, config.catalog);
  }
  
  return config;
}

/**
 * Read Yad2 manufacturers file
 */
async function readYad2File(path) {
  try {
    const content = await readFile(path, 'utf-8');
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    return lines;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Yad2 file not found: ${path}`);
    }
    throw error;
  }
}

/**
 * Read catalog JSON file
 */
async function readCatalogFile(path) {
  try {
    const content = await readFile(path, 'utf-8');
    const catalog = JSON.parse(content);
    
    if (!Array.isArray(catalog)) {
      throw new Error('Catalog JSON must be an array');
    }
    
    return catalog;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Catalog file not found: ${path}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in catalog file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Find missing brands and add them to catalog
 */
function patchCatalog(yad2Brands, catalog) {
  // Build set of existing catalog brandHe normalized
  const existingNormalized = new Set();
  for (const item of catalog) {
    if (item.brandHe) {
      const normalized = normalizeBrandName(item.brandHe);
      if (normalized) {
        existingNormalized.add(normalized);
      }
    }
  }
  
  // Find missing brands
  const missing = [];
  const added = [];
  
  for (const brandHe of yad2Brands) {
    const normalized = normalizeBrandName(brandHe);
    if (!normalized) continue;
    
    if (!existingNormalized.has(normalized)) {
      // Check if we have a mapping for this brand
      if (!BRAND_MAPPING[brandHe]) {
        throw new Error(`Missing brandEn mapping for brandHe: "${brandHe}". Please add it to BRAND_MAPPING in the script.`);
      }
      
      const brandEn = BRAND_MAPPING[brandHe];
      missing.push({ brandHe, brandEn });
    }
  }
  
  // Add missing brands to catalog
  if (missing.length > 0) {
    for (const { brandHe, brandEn } of missing) {
      catalog.push({
        brandEn,
        brandHe,
        models: [],
      });
      added.push(brandHe);
    }
  }
  
  return { added, missingCount: missing.length };
}

/**
 * Write catalog JSON prettified
 */
async function writeCatalogFile(path, catalog) {
  const json = JSON.stringify(catalog, null, 2) + '\n';
  await writeFile(path, json, 'utf-8');
}

/**
 * Main function
 */
async function main() {
  try {
    const config = parseArgs();
    
    console.log('Brand Coverage Patcher');
    console.log('=====================');
    console.log(`Yad2 file: ${config.yad2}`);
    console.log(`Catalog file: ${config.catalog}`);
    console.log('');
    
    // Read files
    console.log('Reading Yad2 manufacturers...');
    const yad2Brands = await readYad2File(config.yad2);
    console.log(`Found ${yad2Brands.length} manufacturers in Yad2 file`);
    
    console.log('Reading catalog...');
    const catalog = await readCatalogFile(config.catalog);
    console.log(`Found ${catalog.length} brands in catalog`);
    console.log('');
    
    // Patch catalog
    console.log('Checking for missing brands...');
    const result = patchCatalog(yad2Brands, catalog);
    
    if (result.missingCount === 0) {
      console.log('✅ All manufacturers are already in the catalog');
      process.exit(0);
    }
    
    // Write updated catalog
    console.log(`Adding ${result.missingCount} missing brand(s)...`);
    await writeCatalogFile(config.catalog, catalog);
    console.log(`Catalog updated: ${config.catalog}`);
    console.log('');
    
    // Print summary
    console.log(`Missing added: ${result.missingCount}`);
    for (const brandHe of result.added) {
      console.log(`  - ${brandHe}`);
    }
    console.log('');
    
    console.log('✅ Catalog patched successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
