#!/usr/bin/env node
/**
 * Sync Car Catalog - Single Source of Truth
 * 
 * Reads from canonical source: web/src/assets/make_models_tree.he_en.v1.json
 * Extracts the brands array and writes to:
 *   - web/public/car_catalog_models_he_en.json (Web)
 *   - app/src/main/res/raw/car_catalog_models_he_en.json (Android)
 * 
 * This ensures both platforms stay in sync from one source.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = join(__dirname, '..');
const canonicalSource = join(repoRoot, 'web', 'src', 'assets', 'make_models_tree.he_en.v1.json');
const webTarget = join(repoRoot, 'web', 'public', 'car_catalog_models_he_en.json');
const androidTarget = join(repoRoot, 'app', 'src', 'main', 'res', 'raw', 'car_catalog_models_he_en.json');

const MIN_BRAND_COUNT = 40; // Should be 47, but allow some flexibility

function validateBrand(brand, index) {
  const errors = [];
  
  if (!brand.brandHe || typeof brand.brandHe !== 'string') {
    errors.push(`Brand at index ${index}: missing or invalid brandHe`);
  }
  
  if (!brand.brandEn || typeof brand.brandEn !== 'string') {
    errors.push(`Brand at index ${index} (${brand.brandEn || 'unknown'}): missing or invalid brandEn`);
  }
  
  if (!Array.isArray(brand.models)) {
    errors.push(`Brand at index ${index} (${brand.brandEn || 'unknown'}): models is not an array`);
  } else {
    // Validate models
    for (let i = 0; i < brand.models.length; i++) {
      const model = brand.models[i];
      if (!model.modelEn || typeof model.modelEn !== 'string') {
        errors.push(`Brand ${brand.brandEn || 'unknown'}, model at index ${i}: missing or invalid modelEn`);
      }
      if (!model.modelHe || typeof model.modelHe !== 'string') {
        errors.push(`Brand ${brand.brandEn || 'unknown'}, model at index ${i}: missing or invalid modelHe`);
      }
    }
  }
  
  return errors;
}

function syncCatalog() {
  console.log('🔄 Syncing car catalog from canonical source...\n');
  console.log(`📖 Source: ${canonicalSource}`);
  
  try {
    // Read canonical source
    const sourceContent = readFileSync(canonicalSource, 'utf-8');
    const sourceData = JSON.parse(sourceContent);
    
    // Extract brands array
    if (!sourceData.brands || !Array.isArray(sourceData.brands)) {
      console.error('❌ Error: Canonical source must have a "brands" array');
      console.error(`   Found: ${typeof sourceData.brands}`);
      process.exit(1);
    }
    
    const brands = sourceData.brands;
    const brandCount = brands.length;
    
    // Validate brand count
    if (brandCount < MIN_BRAND_COUNT) {
      console.error(`❌ Error: Expected at least ${MIN_BRAND_COUNT} brands, found ${brandCount}`);
      process.exit(1);
    }
    
    console.log(`✅ Found ${brandCount} brands in canonical source`);
    
    // Validate schema for all brands
    const validationErrors = [];
    for (let i = 0; i < brands.length; i++) {
      const errors = validateBrand(brands[i], i);
      validationErrors.push(...errors);
    }
    
    if (validationErrors.length > 0) {
      console.error('❌ Schema validation failed:');
      validationErrors.forEach(err => console.error(`   ${err}`));
      process.exit(1);
    }
    
    // Calculate total models
    const totalModels = brands.reduce((sum, brand) => sum + brand.models.length, 0);
    
    // Convert to pretty JSON (2 spaces, UTF-8)
    const outputJson = JSON.stringify(brands, null, 2);
    
    // Write to Web target
    console.log(`\n📝 Writing to Web: ${webTarget}`);
    writeFileSync(webTarget, outputJson, 'utf-8');
    console.log('   ✅ Web catalog updated');
    
    // Write to Android target
    console.log(`\n📝 Writing to Android: ${androidTarget}`);
    writeFileSync(androidTarget, outputJson, 'utf-8');
    console.log('   ✅ Android catalog updated');
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Brands: ${brandCount}`);
    console.log(`   Total models: ${totalModels}`);
    console.log(`   Average models per brand: ${(totalModels / brandCount).toFixed(1)}`);
    console.log(`\n✅ Catalog synced successfully to both platforms!`);
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: Canonical source file not found: ${canonicalSource}`);
      console.error('   Make sure the file exists and the path is correct.');
    } else if (error instanceof SyntaxError) {
      console.error(`❌ Error: Invalid JSON in canonical source: ${error.message}`);
    } else {
      console.error(`❌ Error syncing catalog: ${error.message}`);
    }
    process.exit(1);
  }
}

syncCatalog();
