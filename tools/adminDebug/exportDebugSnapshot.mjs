#!/usr/bin/env node

/**
 * Firestore -> AdminDebug JSON Snapshot Exporter
 * 
 * Exports yards and cars from Firestore to JSON snapshot files for Admin Debug UI.
 * Uses Application Default Credentials (gcloud auth application-default login).
 * 
 * Usage:
 *   npm run export:debugSnapshot
 *   # or
 *   node tools/adminDebug/exportDebugSnapshot.mjs
 * 
 * Output:
 *   - web/public/adminDebug/yards.json
 *   - web/public/adminDebug/carsByYard.json
 */

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync, renameSync, unlinkSync, readFileSync, accessSync, constants, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project configuration
const PROJECT_ID = 'carexpert-94faa';
const OUTPUT_DIR = resolve(__dirname, '../../web/public/adminDebug');
const YARDS_FILE = resolve(OUTPUT_DIR, 'yards.json');
const CARS_FILE = resolve(OUTPUT_DIR, 'carsByYard.json');
const DEFAULT_KEY_PATH = resolve(__dirname, 'keys/carexpert-94faa-sa.json');

/**
 * Initialize Firebase Admin SDK
 * 
 * Prefers Service Account key when available (GOOGLE_APPLICATION_CREDENTIALS env var or default path).
 * Falls back to Application Default Credentials only if no key is found.
 */
function initializeAdmin() {
  if (getApps().length > 0) {
    console.log('[Export] Firebase Admin already initialized');
    return;
  }

  // Determine key path: prefer env var, then default path
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const defaultPath = resolve(__dirname, 'keys/carexpert-94faa-sa.json');
  const keyPath = envPath || (existsSync(defaultPath) ? defaultPath : null);

  // If key path exists, use Service Account key
  if (keyPath) {
    // Validate key file exists and is readable
    try {
      accessSync(keyPath, constants.R_OK);
    } catch (error) {
      console.error('');
      console.error('[Export] Service Account key file not found or not readable:');
      console.error(`  ${keyPath}`);
      console.error('');
      console.error('To fix this:');
      console.error('  1. Create a Service Account in Google Cloud Console / Firebase');
      console.error('  2. Grant it "Cloud Datastore User" or "Firestore Viewer" role');
      console.error('  3. Download the JSON key file');
      console.error('  4. Save it to: tools/adminDebug/keys/carexpert-94faa-sa.json');
      console.error('  5. Or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json');
      console.error('');
      process.exit(1);
    }

    // Load and parse key file
    let serviceAccount;
    try {
      const keyFile = readFileSync(keyPath, 'utf8');
      serviceAccount = JSON.parse(keyFile);
    } catch (error) {
      console.error('[Export] Failed to read or parse Service Account key:');
      console.error(`  ${keyPath}`);
      console.error(`  Error: ${error.message}`);
      process.exit(1);
    }

    // Validate key structure
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error('[Export] Invalid Service Account key format:');
      console.error('  Key file must contain project_id, private_key, and client_email');
      process.exit(1);
    }

    // Initialize with Service Account key
    try {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: PROJECT_ID,
      });
      console.log(`[Export] Initialized Firebase Admin for project: ${PROJECT_ID}`);
      console.log('[Export] Auth: SERVICE_ACCOUNT_KEY');
      console.log(`[Export] Service Account: ${serviceAccount.client_email}`);
      return;
    } catch (error) {
      console.error('[Export] Failed to initialize Firebase Admin with Service Account key:');
      console.error(`  ${error.message}`);
      process.exit(1);
    }
  }

  // Fallback: Application Default Credentials (only if no key found)
  console.log('[Export] No Service Account key found, trying Application Default Credentials...');
  try {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    });
    console.log(`[Export] Initialized Firebase Admin for project: ${PROJECT_ID}`);
    console.log('[Export] Auth: ADC (Application Default Credentials)');
  } catch (error) {
    console.error('[Export] Failed to initialize Firebase Admin with ADC:', error.message);
    console.error('');
    console.error('To fix this:');
    console.error('  1. Use Service Account key: place key at tools/adminDebug/keys/carexpert-94faa-sa.json');
    console.error('  2. Or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json');
    console.error('  3. Or run: gcloud auth application-default login');
    console.error('');
    process.exit(1);
  }
}

/**
 * Extract phones array from yard document data
 * Checks multiple possible phone fields, normalizes and deduplicates
 */
function extractPhones(data) {
  const phones = [];
  
  // Check phones array
  if (Array.isArray(data.phones)) {
    phones.push(...data.phones.filter((p) => typeof p === 'string' && p.trim()));
  }
  
  // Check single phone field
  if (data.phone && typeof data.phone === 'string' && data.phone.trim()) {
    phones.push(data.phone.trim());
  }
  
  // Check phoneNumber field
  if (data.phoneNumber && typeof data.phoneNumber === 'string' && data.phoneNumber.trim()) {
    phones.push(data.phoneNumber.trim());
  }
  
  // Check contactPhone field
  if (data.contactPhone && typeof data.contactPhone === 'string' && data.contactPhone.trim()) {
    phones.push(data.contactPhone.trim());
  }
  
  // Check secondaryPhone field
  if (data.secondaryPhone && typeof data.secondaryPhone === 'string' && data.secondaryPhone.trim()) {
    phones.push(data.secondaryPhone.trim());
  }
  
  // Normalize: trim, filter falsy, deduplicate
  const normalized = phones
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const uniquePhones = Array.from(new Set(normalized));
  
  // Limit to max 3 (optional, but reasonable)
  const limited = uniquePhones.slice(0, 3);
  
  return limited.length > 0 ? limited : null;
}

/**
 * Export all yards from Firestore
 * Yards are stored in users collection where isYard == true
 */
async function exportYards(db) {
  console.log('[Export] Querying users collection where isYard==true...');
  
  const yardsRef = db.collection('users').where('isYard', '==', true);
  const snapshot = await yardsRef.get();
  
  if (snapshot.empty) {
    console.warn('[Export] No yards found in users collection (isYard==true)');
    return [];
  }
  
  console.log(`[Export] Yard source: users where isYard==true (count: ${snapshot.docs.length})`);
  
  const yards = [];
  
  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    const yardUid = doc.id;
    
    // Extract name (prefer displayName, fallback to yardName, else null)
    const name = data.displayName || data.yardName || null;
    
    // Extract phones (do not log phone numbers)
    const phones = extractPhones(data);
    
    yards.push({
      yardUid,
      name,
      phones,
    });
    
    // Log first 3 yards (yardUid + name only, no phones)
    if (index < 3) {
      console.log(`[Export]   Yard ${index + 1}: ${yardUid} - ${name || '(no name)'}`);
    }
  });
  
  console.log(`[Export] Exported ${yards.length} yards`);
  return yards;
}

/**
 * Export all cars for a specific yard
 * Cars are stored in subcollection: users/{yardUid}/carSales
 */
async function exportCarsForYard(db, yardUid) {
  const carsRef = db.collection('users').doc(yardUid).collection('carSales');
  const snapshot = await carsRef.get();
  
  if (snapshot.empty) {
    return [];
  }
  
  const cars = [];
  
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const carId = doc.id;
    
    // Extract fields matching adminDebugListYardCars format
    const plateNumber = data.licensePlatePartial || null;
    const make = data.brand || null;
    const model = data.model || null;
    const year = typeof data.year === 'number' ? data.year : null;
    
    // Generate title: "brand model" or null
    const title = (make && model) ? `${make} ${model}` : null;
    
    cars.push({
      carId,
      plateNumber,
      make,
      model,
      year,
      title,
    });
  });
  
  return cars;
}

/**
 * Export all cars grouped by yard
 * For each yard, queries subcollection: users/{yardUid}/carSales
 */
async function exportCarsByYard(db, yardUids) {
  console.log(`[Export] Exporting cars from: users/{yardUid}/carSales for ${yardUids.length} yards...`);
  
  const carsByYard = {};
  let totalCars = 0;
  
  // Process yards in batches to avoid overwhelming Firestore
  const BATCH_SIZE = 10;
  for (let i = 0; i < yardUids.length; i += BATCH_SIZE) {
    const batch = yardUids.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (yardUid) => {
      try {
        const cars = await exportCarsForYard(db, yardUid);
        // Always set entry, even if empty array (for yards with no cars)
        carsByYard[yardUid] = cars;
        totalCars += cars.length;
      } catch (error) {
        // If subcollection missing or error, treat as empty array
        console.warn(`[Export] Failed to export cars for yard ${yardUid}:`, error.message);
        carsByYard[yardUid] = [];
        // Continue with other yards
      }
    });
    
    await Promise.all(batchPromises);
    
    // Progress indicator
    if ((i + BATCH_SIZE) % 50 === 0 || i + BATCH_SIZE >= yardUids.length) {
      console.log(`[Export] Processed ${Math.min(i + BATCH_SIZE, yardUids.length)}/${yardUids.length} yards...`);
    }
  }
  
  const yardsWithCars = Object.values(carsByYard).filter((cars) => cars.length > 0).length;
  console.log(`[Export] Exported ${totalCars} total cars across ${yardsWithCars} yards (${yardUids.length - yardsWithCars} yards have no cars)`);
  return carsByYard;
}

/**
 * Write JSON file atomically (write to temp then rename)
 */
function writeJsonFile(filePath, data) {
  const dir = dirname(filePath);
  
  // Ensure directory exists
  mkdirSync(dir, { recursive: true });
  
  // Write to temp file first
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  
  // Atomic rename (works on Unix/WSL, Windows may need different approach)
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    // Fallback: write directly if rename fails (Windows)
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Main export function
 */
async function main() {
  console.log('[Export] Starting Admin Debug snapshot export...');
  console.log(`[Export] Project: ${PROJECT_ID}`);
  console.log(`[Export] Output directory: ${OUTPUT_DIR}`);
  console.log('');
  
  // Initialize Firebase Admin
  initializeAdmin();
  const db = getFirestore();
  
  try {
    // Export yards from users collection where isYard==true
    const yards = await exportYards(db);
    
    if (yards.length === 0) {
      console.error('[Export] No yards found. Exiting.');
      process.exit(1);
    }
    
    // Export cars for each yard from users/{yardUid}/carSales
    const yardUids = yards.map((y) => y.yardUid);
    const carsByYard = await exportCarsByYard(db, yardUids);
    
    // Write output files
    console.log('[Export] Writing output files...');
    writeJsonFile(YARDS_FILE, yards);
    writeJsonFile(CARS_FILE, carsByYard);
    
    // Print summary
    const totalCars = Object.values(carsByYard).reduce((sum, cars) => sum + cars.length, 0);
    const yardsWithCars = Object.keys(carsByYard).filter((uid) => carsByYard[uid].length > 0).length;
    
    console.log('');
    console.log('=== Export Summary ===');
    console.log(`Yards exported: ${yards.length}`);
    console.log(`Total cars exported: ${totalCars}`);
    console.log(`Yards with cars: ${yardsWithCars}`);
    console.log(`Yards without cars: ${yards.length - yardsWithCars}`);
    console.log(`carsByYard keys: ${Object.keys(carsByYard).length}`);
    console.log('');
    console.log(`Output files:`);
    console.log(`  - ${YARDS_FILE}`);
    console.log(`  - ${CARS_FILE}`);
    console.log('');
    console.log('[Export] Export completed successfully!');
    console.log('[Export] Next steps:');
    console.log('  1. Review the JSON files');
    console.log('  2. Run: npm run build (in web/)');
    console.log('  3. Deploy yardsite');
    
  } catch (error) {
    console.error('[Export] Export failed:', error);
    console.error('[Export] Error details:', error.message);
    if (error.stack) {
      console.error('[Export] Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
main().catch((error) => {
  console.error('[Export] Unhandled error:', error);
  process.exit(1);
});
