#!/usr/bin/env node

/**
 * PNG → AVIF/WEBP Conversion Script for Promotion Tier Backgrounds
 * 
 * Converts PNG source images to AVIF (primary) and WEBP (fallback) formats.
 * 
 * Input: web/assets-src/promo/<tier>/*.png
 * Output: web/public/promo/<tier>/bg-desktop.avif + bg-mobile.avif (+ webp)
 * 
 * Usage: npm run convert:promo-bg
 */

import { readdir, mkdir, stat } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if sharp is available
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (err) {
  console.error('❌ Error: sharp package not found.');
  console.error('   Please install it: npm install --save-dev sharp');
  process.exit(1);
}

// Material tier names (preferred for new assets)
const MATERIAL_TIERS = ['bronze', 'copper', 'gold', 'platinum', 'diamond', 'titanium'];
// Internal tier names (for backward compatibility)
const INTERNAL_TIERS = ['boost', 'highlight', 'exposure_plus', 'platinum', 'diamond'];

// Mapping: internal tier -> material tier
const TIER_TO_MATERIAL = {
  'boost': 'gold',
  'highlight': 'copper',
  'exposure_plus': 'bronze',
  'platinum': 'platinum',
  'diamond': 'diamond',
};

const INPUT_DIR = join(projectRoot, 'assets-src', 'promo');
const OUTPUT_DIR = join(projectRoot, 'public', 'promo');

/**
 * Convert PNG to AVIF and WEBP
 */
async function convertImage(inputPath, outputDir, outputName, isMobile = false) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Determine target dimensions based on mobile flag
    // Desktop: use original or max 1920px width
    // Mobile: max 768px width, maintain aspect ratio
    const targetWidth = isMobile ? 768 : 1920;
    const targetHeight = isMobile ? undefined : undefined; // Maintain aspect ratio
    
    let pipeline = image;
    
    // Resize if needed (only if larger than target)
    if (metadata.width && metadata.width > targetWidth) {
      pipeline = pipeline.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    
    // Convert to AVIF
    const avifPath = join(outputDir, `${outputName}.avif`);
    await pipeline
      .avif({
        quality: 55,
        effort: 7,
      })
      .toFile(avifPath);
    console.log(`  ✓ Created: ${avifPath}`);
    
    // Convert to WEBP (fallback)
    const webpPath = join(outputDir, `${outputName}.webp`);
    await image
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 72,
      })
      .toFile(webpPath);
    console.log(`  ✓ Created: ${webpPath}`);
    
    return { avifPath, webpPath };
  } catch (err) {
    console.error(`  ✗ Error converting ${inputPath}:`, err.message);
    throw err;
  }
}

/**
 * Process a single tier directory
 * Supports both material names (gold, copper, bronze) and internal names (boost, highlight, exposure_plus)
 * Output always uses material names
 */
async function processTier(tier, isMaterial = false) {
  const tierInputDir = join(INPUT_DIR, tier);
  
  // Determine output directory: always use material name
  const materialTier = isMaterial ? tier : (TIER_TO_MATERIAL[tier] || tier);
  const tierOutputDir = join(OUTPUT_DIR, materialTier);
  
  try {
    // Check if input directory exists
    const inputStats = await stat(tierInputDir).catch(() => null);
    if (!inputStats || !inputStats.isDirectory()) {
      console.log(`⚠️  Skipping ${tier}: input directory not found at ${tierInputDir}`);
      return;
    }
    
    // Ensure output directory exists
    await mkdir(tierOutputDir, { recursive: true });
    
    // List PNG files in input directory
    const files = await readdir(tierInputDir);
    const pngFiles = files.filter(f => extname(f).toLowerCase() === '.png');
    
    if (pngFiles.length === 0) {
      console.log(`⚠️  No PNG files found in ${tierInputDir}`);
      return;
    }
    
    console.log(`\n📦 Processing tier: ${tier}${isMaterial ? '' : ` (internal) -> ${materialTier} (material)`}`);
    console.log(`   Input: ${tierInputDir}`);
    console.log(`   Output: ${tierOutputDir}`);
    
    // Find desktop and mobile source images
    // Expected naming: bg-desktop.png, bg-mobile.png (or just bg.png for desktop)
    let desktopSource = null;
    let mobileSource = null;
    
    for (const file of pngFiles) {
      const baseName = basename(file, '.png').toLowerCase();
      if (baseName === 'bg-desktop' || baseName === 'desktop' || baseName === 'bg') {
        desktopSource = join(tierInputDir, file);
      } else if (baseName === 'bg-mobile' || baseName === 'mobile') {
        mobileSource = join(tierInputDir, file);
      }
    }
    
    // If no specific desktop/mobile files, use first PNG as desktop
    if (!desktopSource && pngFiles.length > 0) {
      desktopSource = join(tierInputDir, pngFiles[0]);
      console.log(`   Using ${pngFiles[0]} as desktop source`);
    }
    
    // Use desktop source for mobile if no mobile source found
    if (!mobileSource && desktopSource) {
      mobileSource = desktopSource;
      console.log(`   Using desktop source for mobile (will be resized)`);
    }
    
    // Convert desktop images
    if (desktopSource) {
      console.log(`\n  🖥️  Desktop:`);
      await convertImage(desktopSource, tierOutputDir, 'bg-desktop', false);
    }
    
    // Convert mobile images
    if (mobileSource) {
      console.log(`\n  📱 Mobile:`);
      await convertImage(mobileSource, tierOutputDir, 'bg-mobile', true);
    }
    
    console.log(`✅ Completed: ${tier}`);
  } catch (err) {
    console.error(`❌ Error processing tier ${tier}:`, err.message);
    throw err;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting promotion background conversion...\n');
  console.log(`   Input directory: ${INPUT_DIR}`);
  console.log(`   Output directory: ${OUTPUT_DIR}\n`);
  console.log('   Supports both material folders (gold, copper, bronze) and internal folders (boost, highlight, exposure_plus)');
  console.log('   Output always uses material names\n');
  
  let successCount = 0;
  let errorCount = 0;
  const processedMaterials = new Set();
  
  // First, process material tier folders (preferred)
  for (const tier of MATERIAL_TIERS) {
    try {
      const tierInputDir = join(INPUT_DIR, tier);
      const inputStats = await stat(tierInputDir).catch(() => null);
      if (inputStats && inputStats.isDirectory()) {
        await processTier(tier, true);
        processedMaterials.add(tier);
        successCount++;
      }
    } catch (err) {
      errorCount++;
      console.error(`Failed to process ${tier}:`, err.message);
    }
  }
  
  // Then, process internal tier folders (for backward compatibility)
  // Only process if material folder doesn't exist
  for (const tier of INTERNAL_TIERS) {
    const materialTier = TIER_TO_MATERIAL[tier] || tier;
    if (processedMaterials.has(materialTier)) {
      console.log(`\n⏭️  Skipping ${tier}: material folder ${materialTier} already processed`);
      continue;
    }
    
    try {
      await processTier(tier, false);
      successCount++;
    } catch (err) {
      // Only count as error if input directory exists
      const tierInputDir = join(INPUT_DIR, tier);
      const inputStats = await stat(tierInputDir).catch(() => null);
      if (inputStats && inputStats.isDirectory()) {
        errorCount++;
        console.error(`Failed to process ${tier}:`, err.message);
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Successfully processed: ${successCount} tiers`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount} tiers`);
  }
  console.log('='.repeat(50));
  
  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
