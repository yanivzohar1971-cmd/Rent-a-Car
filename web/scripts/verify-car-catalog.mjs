#!/usr/bin/env node
/**
 * Verification script for car catalog
 * Validates that the catalog has exactly 47 brands with correct schema
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATALOG_PATH = join(__dirname, '../public/car_catalog_models_he_en.json');
const EXPECTED_BRAND_COUNT = 47;

const EXPECTED_BRANDS = [
  'Audi', 'Opel', 'ORA', 'Infiniti', 'Alfa Romeo', 'MG', 'BMW', 'BYD', 'Genesis',
  'Great Wall', 'GAC', 'Dacia', 'Dodge', 'DS', 'Daewoo', 'Daihatsu', 'Honda',
  'Volvo', 'Toyota', 'Hyundai', 'Lada', 'Lincoln', 'Lancia', 'Lexus', 'Mazda',
  'MINI', 'Mitsubishi', 'Mercedes-Benz', 'Nissan', 'Subaru', 'Suzuki', 'Seat',
  'Citroen', 'Skoda', 'Polestar', 'Volkswagen', 'Ford', 'Porsche', 'Fiat',
  'Peugeot', 'Cadillac', 'Cupra', 'Kia', 'Chrysler', 'Rover', 'Renault', 'Chevrolet'
];

function verifyCatalog() {
  console.log('🔍 Verifying car catalog...\n');
  
  try {
    // Load catalog
    const catalogContent = readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(catalogContent);
    
    // Verify it's an array
    if (!Array.isArray(catalog)) {
      console.error('❌ Catalog is not an array');
      process.exit(1);
    }
    
    const brandCount = catalog.length;
    console.log(`📊 Found ${brandCount} brands`);
    
    // Verify brand count
    if (brandCount !== EXPECTED_BRAND_COUNT) {
      console.error(`❌ Expected ${EXPECTED_BRAND_COUNT} brands, found ${brandCount}`);
      process.exit(1);
    }
    console.log(`✅ Brand count correct: ${brandCount}`);
    
    // Verify schema for each brand
    let schemaErrors = 0;
    const foundBrands = new Set();
    
    for (let i = 0; i < catalog.length; i++) {
      const brand = catalog[i];
      
      // Check required fields
      if (!brand.brandEn || typeof brand.brandEn !== 'string') {
        console.error(`❌ Brand at index ${i}: missing or invalid brandEn`);
        schemaErrors++;
        continue;
      }
      
      if (!brand.brandHe || typeof brand.brandHe !== 'string') {
        console.error(`❌ Brand at index ${i} (${brand.brandEn}): missing or invalid brandHe`);
        schemaErrors++;
        continue;
      }
      
      if (!Array.isArray(brand.models)) {
        console.error(`❌ Brand at index ${i} (${brand.brandEn}): models is not an array`);
        schemaErrors++;
        continue;
      }
      
      // Verify models schema
      for (let j = 0; j < brand.models.length; j++) {
        const model = brand.models[j];
        if (!model.modelEn || typeof model.modelEn !== 'string') {
          console.error(`❌ Brand ${brand.brandEn}, model at index ${j}: missing or invalid modelEn`);
          schemaErrors++;
        }
        if (!model.modelHe || typeof model.modelHe !== 'string') {
          console.error(`❌ Brand ${brand.brandEn}, model at index ${j}: missing or invalid modelHe`);
          schemaErrors++;
        }
      }
      
      foundBrands.add(brand.brandEn);
    }
    
    if (schemaErrors > 0) {
      console.error(`\n❌ Found ${schemaErrors} schema errors`);
      process.exit(1);
    }
    console.log(`✅ All brands have correct schema (brandEn, brandHe, models array)`);
    
    // Verify all expected brands are present
    const missingBrands = EXPECTED_BRANDS.filter(b => !foundBrands.has(b));
    if (missingBrands.length > 0) {
      console.error(`❌ Missing brands: ${missingBrands.join(', ')}`);
      process.exit(1);
    }
    
    // Check for unexpected brands
    const unexpectedBrands = Array.from(foundBrands).filter(b => !EXPECTED_BRANDS.includes(b));
    if (unexpectedBrands.length > 0) {
      console.warn(`⚠️  Unexpected brands found: ${unexpectedBrands.join(', ')}`);
      // Don't fail on this, just warn
    }
    
    console.log(`✅ All ${EXPECTED_BRAND_COUNT} expected brands are present`);
    
    // Summary
    const totalModels = catalog.reduce((sum, brand) => sum + brand.models.length, 0);
    console.log(`\n📈 Summary:`);
    console.log(`   Brands: ${brandCount}`);
    console.log(`   Total models: ${totalModels}`);
    console.log(`   Average models per brand: ${(totalModels / brandCount).toFixed(1)}`);
    
    console.log('\n✅ Catalog verification passed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error verifying catalog:', error.message);
    if (error.code === 'ENOENT') {
      console.error(`   File not found: ${CATALOG_PATH}`);
    }
    process.exit(1);
  }
}

verifyCatalog();
