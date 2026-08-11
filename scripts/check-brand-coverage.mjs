#!/usr/bin/env node
/**
 * Brand Coverage Checker
 * 
 * Compares Yad2 manufacturers list with our car catalog to verify
 * all manufacturers are supported in our catalog.
 * 
 * Usage:
 *   node scripts/check-brand-coverage.mjs --yad2="יצרני יד 2.txt"
 *   node scripts/check-brand-coverage.mjs --yad2="יצרני יד 2.txt" --catalog="web/public/car_catalog_models_he_en.json"
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { readdirSync, existsSync } from 'fs';
import { join, dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

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
    config.yad2 = join(REPO_ROOT, 'יצרני יד 2.txt');
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
 * Read catalog JSON and extract brandHe values
 */
async function readCatalogFile(path) {
  try {
    const content = await readFile(path, 'utf-8');
    const catalog = JSON.parse(content);
    
    if (!Array.isArray(catalog)) {
      throw new Error('Catalog JSON must be an array');
    }
    
    const brands = catalog
      .map(item => item.brandHe)
      .filter(brand => brand != null);
    
    return brands;
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
 * Compare brands and generate report
 */
function compareBrands(yad2Brands, catalogBrands) {
  // Create normalized maps: normalized -> original
  const yad2Normalized = new Map();
  const catalogNormalized = new Set();
  
  for (const brand of yad2Brands) {
    const normalized = normalizeBrandName(brand);
    if (normalized) {
      // Store all original variants for the same normalized name
      if (!yad2Normalized.has(normalized)) {
        yad2Normalized.set(normalized, []);
      }
      yad2Normalized.get(normalized).push(brand);
    }
  }
  
  for (const brand of catalogBrands) {
    const normalized = normalizeBrandName(brand);
    if (normalized) {
      catalogNormalized.add(normalized);
    }
  }
  
  // Find matches and misses
  const missing = [];
  const present = [];
  
  for (const [normalized, originals] of yad2Normalized.entries()) {
    if (catalogNormalized.has(normalized)) {
      // Use the first original as representative
      present.push(originals[0]);
    } else {
      // All variants are missing
      missing.push(...originals);
    }
  }
  
  // Find extra brands (in catalog but not in Yad2)
  const yad2NormalizedSet = new Set(yad2Normalized.keys());
  const extra = catalogBrands.filter(brand => {
    const normalized = normalizeBrandName(brand);
    return normalized && !yad2NormalizedSet.has(normalized);
  });
  
  return { missing, present, extra };
}

/**
 * Generate markdown report
 */
function generateReport(yad2Brands, catalogBrands, comparison, config) {
  const timestamp = new Date().toISOString();
  const missingCount = comparison.missing.length;
  const presentCount = comparison.present.length;
  const extraCount = comparison.extra.length;
  
  let report = `# Brand Coverage Report\n\n`;
  report += `Generated: ${timestamp}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Yad2 Manufacturers**: ${yad2Brands.length}\n`;
  report += `- **Catalog Brands**: ${catalogBrands.length}\n`;
  report += `- **Present in Catalog**: ${presentCount} ✅\n`;
  report += `- **Missing from Catalog**: ${missingCount} ${missingCount > 0 ? '❌' : '✅'}\n`;
  report += `- **Extra in Catalog**: ${extraCount}\n\n`;
  
  report += `## Files\n\n`;
  report += `- **Yad2 File**: \`${config.yad2}\`\n`;
  report += `- **Catalog File**: \`${config.catalog}\`\n\n`;
  
  if (missingCount > 0) {
    report += `## Missing Manufacturers (${missingCount})\n\n`;
    report += `These manufacturers are in the Yad2 list but NOT in our catalog:\n\n`;
    for (const brand of comparison.missing) {
      report += `- ${brand}\n`;
    }
    report += `\n`;
  }
  
  if (presentCount > 0) {
    report += `## Present Manufacturers (${presentCount})\n\n`;
    report += `These manufacturers are in both lists:\n\n`;
    for (const brand of comparison.present) {
      report += `- ${brand}\n`;
    }
    report += `\n`;
  }
  
  if (extraCount > 0) {
    report += `## Extra Manufacturers (${extraCount})\n\n`;
    report += `These manufacturers are in our catalog but NOT in the Yad2 list:\n\n`;
    for (const brand of comparison.extra) {
      report += `- ${brand}\n`;
    }
    report += `\n`;
  }
  
  return report;
}

/**
 * Main function
 */
async function main() {
  try {
    const config = parseArgs();
    
    console.log('Brand Coverage Checker');
    console.log('====================');
    console.log(`Yad2 file: ${config.yad2}`);
    console.log(`Catalog file: ${config.catalog}`);
    console.log('');
    
    // Read files
    console.log('Reading Yad2 manufacturers...');
    const yad2Brands = await readYad2File(config.yad2);
    console.log(`Found ${yad2Brands.length} manufacturers in Yad2 file`);
    
    console.log('Reading catalog...');
    const catalogBrands = await readCatalogFile(config.catalog);
    console.log(`Found ${catalogBrands.length} brands in catalog`);
    console.log('');
    
    // Compare
    console.log('Comparing brands...');
    const comparison = compareBrands(yad2Brands, catalogBrands);
    
    // Print results
    console.log('Results:');
    console.log(`  Present: ${comparison.present.length}`);
    console.log(`  Missing: ${comparison.missing.length}`);
    console.log(`  Extra: ${comparison.extra.length}`);
    console.log('');
    
    if (comparison.missing.length > 0) {
      console.log('Missing manufacturers (from Yad2, not in catalog):');
      for (const brand of comparison.missing) {
        console.log(`  - ${brand}`);
      }
      console.log('');
    }
    
    // Generate and write report
    const report = generateReport(yad2Brands, catalogBrands, comparison, config);
    const reportPath = join(REPO_ROOT, 'docs', 'brand-coverage-report.md');
    
    // Ensure docs directory exists
    const reportDir = dirname(reportPath);
    if (!existsSync(reportDir)) {
      await mkdir(reportDir, { recursive: true });
    }
    
    await writeFile(reportPath, report, 'utf-8');
    console.log(`Report written to: ${reportPath}`);
    console.log('');
    
    // Exit code
    if (comparison.missing.length > 0) {
      console.log('❌ Some manufacturers are missing from the catalog');
      process.exit(2);
    } else {
      console.log('✅ All manufacturers are present in the catalog');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
