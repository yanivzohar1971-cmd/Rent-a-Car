/**
 * Sync script: Copy car_catalog_models_he_en.json from Android res/raw to web/public
 * This ensures both Android and Web use the same catalog source of truth
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const repoRoot = join(__dirname, '..');
const sourceFile = join(repoRoot, 'app', 'src', 'main', 'res', 'raw', 'car_catalog_models_he_en.json');
const targetFile = join(repoRoot, 'web', 'public', 'car_catalog_models_he_en.json');

try {
  console.log('Syncing car catalog from Android to Web...');
  console.log(`Source: ${sourceFile}`);
  console.log(`Target: ${targetFile}`);

  // Read the source file
  const catalogData = readFileSync(sourceFile, 'utf-8');
  
  // Parse to validate JSON
  const catalog = JSON.parse(catalogData);
  const brandsCount = catalog.length;
  const modelsCount = catalog.reduce((sum, brand) => sum + (brand.models?.length || 0), 0);
  
  console.log(`Found ${brandsCount} brands with ${modelsCount} total models`);

  // Write to target
  writeFileSync(targetFile, catalogData, 'utf-8');
  
  console.log('✅ Catalog synced successfully!');
  console.log(`   ${brandsCount} brands, ${modelsCount} models`);
} catch (error) {
  console.error('❌ Error syncing catalog:', error.message);
  process.exit(1);
}

