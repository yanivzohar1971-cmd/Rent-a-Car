#!/usr/bin/env node

/**
 * Sync Promo Assets Script
 * 
 * Syncs PNG files from assets-src/promo to public/promo and generates AVIF versions.
 * 
 * Source: web/assets-src/promo/<material>/*.png
 * Dest:   web/public/promo/<material>/*.png + *.avif
 * 
 * Usage: npm run promo:sync
 */

import { readdir, mkdir, stat, copyFile, unlink } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Check if sharp is available
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (err) {
  console.warn('⚠️  Warning: sharp package not found. AVIF generation will be skipped.');
  console.warn('   Install it with: npm install --save-dev sharp');
  console.warn('   PNG files will still be copied.');
}

// Material tier folders (the 7 materials that have assets)
const MATERIAL_TIERS = ['bronze', 'copper', 'silver', 'gold', 'platinum', 'diamond', 'titanium'];

// ONLY these exact filenames are allowed (hard guard against sheets/sprites)
const ALLOWED_FILES = new Set(['bg-desktop.png', 'bg-mobile.png', 'btn.png']);

// Source and destination roots (hard-coded to prevent accidental sheet usage)
const SRC_ROOT = join(projectRoot, 'assets-src', 'promo');
const DST_ROOT = join(projectRoot, 'public', 'promo');

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Check if file exists and get its stats
 */
async function fileExists(filePath) {
  try {
    const stats = await stat(filePath);
    return stats;
  } catch {
    return null;
  }
}

/**
 * Convert PNG to AVIF with NO transforms (no resize, crop, extract, composite)
 * Validates dimensions match after conversion
 */
async function convertToAvif(pngPath, avifPath, material, filename) {
  if (!sharp) {
    console.warn(`   ⚠️  Skipping AVIF generation for ${basename(pngPath)} (sharp not available)`);
    return { success: false, skipped: true };
  }

  try {
    // Read PNG metadata BEFORE conversion
    const pngMeta = await sharp(pngPath).metadata();
    const pngWidth = pngMeta.width;
    const pngHeight = pngMeta.height;

    // Generate AVIF with NO transforms - only avif() encoding
    await sharp(pngPath)
      .avif({ quality: 45, effort: 4 })
      .toFile(avifPath);

    // Validate AVIF dimensions match PNG dimensions
    const avifMeta = await sharp(avifPath).metadata();
    const avifWidth = avifMeta.width;
    const avifHeight = avifMeta.height;

    if (pngWidth !== avifWidth || pngHeight !== avifHeight) {
      // Delete the broken AVIF
      await unlink(avifPath);
      console.error(`   ❌ FAILED: ${material}/${filename} - Dimension mismatch!`);
      console.error(`      PNG: ${pngWidth}x${pngHeight}, AVIF: ${avifWidth}x${avifHeight}`);
      return { success: false, failed: true, reason: 'dimension_mismatch' };
    }

    return { success: true, width: pngWidth, height: pngHeight };
  } catch (err) {
    console.error(`   ❌ Error converting ${basename(pngPath)} to AVIF:`, err.message);
    return { success: false, failed: true, reason: err.message };
  }
}

/**
 * Process a single PNG file: copy it and generate AVIF if needed
 * Returns stats for summary
 */
async function processPngFile(material, filename) {
  const sourcePath = join(SRC_ROOT, material, filename);
  const destPngPath = join(DST_ROOT, material, filename);
  const avifFilename = filename.replace('.png', '.avif');
  const destAvifPath = join(DST_ROOT, material, avifFilename);

  // Hard guard: only process allowed filenames
  if (!ALLOWED_FILES.has(filename)) {
    console.log(`   ⊘ Ignored ${filename} (not in allowed list)`);
    return { copied: false, generated: false, skipped: false, failed: false };
  }

  // Check if source exists
  const sourceStats = await fileExists(sourcePath);
  if (!sourceStats) {
    console.log(`   ⚠️  Source not found: ${basename(sourcePath)}`);
    return { copied: false, generated: false, skipped: false, failed: false };
  }

  // Ensure dest directory exists
  await ensureDir(join(DST_ROOT, material));

  // Copy PNG (always copy to ensure sync)
  let copied = false;
  try {
    await copyFile(sourcePath, destPngPath);
    console.log(`   ✓ Copied ${filename}`);
    copied = true;
  } catch (err) {
    console.error(`   ❌ Error copying ${filename}:`, err.message);
    return { copied: false, generated: false, skipped: false, failed: false };
  }

  // Check if AVIF needs to be generated
  const avifStats = await fileExists(destAvifPath);
  const needsConversion = !avifStats || avifStats.mtimeMs < sourceStats.mtimeMs;

  if (needsConversion) {
    const result = await convertToAvif(sourcePath, destAvifPath, material, filename);
    if (result.success) {
      console.log(`   ✓ Generated ${avifFilename} (${result.width}x${result.height})`);
      return { copied, generated: true, skipped: false, failed: false };
    } else if (result.skipped) {
      return { copied, generated: false, skipped: true, failed: false };
    } else {
      return { copied, generated: false, skipped: false, failed: true, reason: result.reason };
    }
  } else {
    console.log(`   ⊘ Skipped ${avifFilename} (already up-to-date)`);
    return { copied, generated: false, skipped: true, failed: false };
  }
}

/**
 * Process a material folder
 * Returns stats for summary
 */
async function processMaterial(material) {
  const materialDir = join(SRC_ROOT, material);
  
  // Check if material directory exists
  if (!existsSync(materialDir)) {
    console.log(`⊘ Skipping ${material} (directory not found)`);
    return { processed: false };
  }

  // Check if directory has any allowed PNG files
  try {
    const entries = await readdir(materialDir);
    const hasAllowedImages = entries.some(entry => ALLOWED_FILES.has(entry));
    
    if (!hasAllowedImages) {
      console.log(`⊘ Skipping ${material} (no allowed PNG files)`);
      return { processed: false };
    }
  } catch (err) {
    console.log(`⊘ Skipping ${material} (error reading directory)`);
    return { processed: false };
  }

  console.log(`\n📦 Processing ${material}:`);

  const stats = {
    copied: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    failedItems: []
  };

  // Process each allowed asset file
  for (const filename of ALLOWED_FILES) {
    const result = await processPngFile(material, filename);
    if (result.copied) stats.copied++;
    if (result.generated) stats.generated++;
    if (result.skipped) stats.skipped++;
    if (result.failed) {
      stats.failed++;
      stats.failedItems.push(`${material}/${filename} (${result.reason || 'unknown'})`);
    }
  }

  return { processed: true, ...stats };
}

/**
 * Clean all existing AVIF files (remove broken ones)
 */
async function cleanAvifFiles() {
  console.log('🧹 Cleaning existing AVIF files...\n');
  let deletedCount = 0;

  for (const material of MATERIAL_TIERS) {
    const materialDir = join(DST_ROOT, material);
    if (!existsSync(materialDir)) continue;

    for (const filename of ALLOWED_FILES) {
      const avifFilename = filename.replace('.png', '.avif');
      const avifPath = join(materialDir, avifFilename);
      
      try {
        const stats = await fileExists(avifPath);
        if (stats) {
          await unlink(avifPath);
          deletedCount++;
        }
      } catch (err) {
        // Ignore errors (file might not exist)
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`   ✓ Deleted ${deletedCount} existing AVIF file(s)\n`);
  } else {
    console.log(`   ⊘ No AVIF files found to clean\n`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Syncing promo assets from assets-src/promo → public/promo\n');
  console.log(`Source: ${SRC_ROOT}`);
  console.log(`Dest:   ${DST_ROOT}\n`);

  if (!existsSync(SRC_ROOT)) {
    console.error(`❌ Error: Source directory not found: ${SRC_ROOT}`);
    process.exit(1);
  }

  // Clean all existing AVIF files first
  await cleanAvifFiles();

  // Ensure dest root exists
  await ensureDir(DST_ROOT);

  // Process each material and collect stats
  const totals = {
    materialsProcessed: 0,
    pngCopied: 0,
    avifGenerated: 0,
    avifSkipped: 0,
    avifFailed: 0,
    failedItems: []
  };

  for (const material of MATERIAL_TIERS) {
    const result = await processMaterial(material);
    if (result.processed) {
      totals.materialsProcessed++;
      totals.pngCopied += result.copied || 0;
      totals.avifGenerated += result.generated || 0;
      totals.avifSkipped += result.skipped || 0;
      totals.avifFailed += result.failed || 0;
      if (result.failedItems) {
        totals.failedItems.push(...result.failedItems);
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Materials processed: ${totals.materialsProcessed}`);
  console.log(`PNG files copied: ${totals.pngCopied}`);
  console.log(`AVIF files generated: ${totals.avifGenerated}`);
  console.log(`AVIF files skipped (up-to-date): ${totals.avifSkipped}`);
  console.log(`AVIF files failed: ${totals.avifFailed}`);
  
  if (totals.failedItems.length > 0) {
    console.log('\n❌ FAILED ITEMS:');
    totals.failedItems.forEach(item => console.log(`   - ${item}`));
  }
  
  console.log('='.repeat(60));
  
  if (totals.avifFailed > 0) {
    console.log('\n⚠️  Warning: Some AVIF files failed validation. Check errors above.');
    process.exit(1);
  }
  
  console.log('\n✅ Sync complete!');
  
  if (!sharp) {
    console.log('\n⚠️  Note: AVIF generation was skipped. Install sharp to enable AVIF conversion.');
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
