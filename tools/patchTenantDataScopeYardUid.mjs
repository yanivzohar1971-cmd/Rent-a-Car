#!/usr/bin/env node
/**
 * Sets tenantSiteConfigs/{tenantId}.dataScope.yardUid from publicCars (merge-safe dot update).
 *
 * Resolution order:
 * 1) For each id in layout.featuredCarIds (if present), read publicCars/{id} and use first non-empty yardUid.
 * 2) Else scan publicCars where isPublished==true (batched) for first doc with yardUid.
 *
 * Auth: same as tools/adminDebug/exportDebugSnapshot.mjs (SA key or ADC).
 *
 * Usage:
 *   node tools/patchTenantDataScopeYardUid.mjs
 *   node tools/patchTenantDataScopeYardUid.mjs --tenant=OTHER_ID
 */

import { initializeApp, getApps, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { accessSync, constants, existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'carexpert-94faa';
const DEFAULT_TENANT_ID = '1834GeuEGxNUKup7n4h8mdpjN813';
const SA_DEFAULT_PATH = resolve(__dirname, 'adminDebug/keys/carexpert-94faa-sa.json');

function parseArgs() {
  const a = process.argv.slice(2);
  let tenantId = DEFAULT_TENANT_ID;
  for (const x of a) {
    if (x.startsWith('--tenant=')) tenantId = x.slice('--tenant='.length).trim();
  }
  return { tenantId };
}

function initializeAdmin() {
  if (getApps().length > 0) return;

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const keyPath = envPath || (existsSync(SA_DEFAULT_PATH) ? SA_DEFAULT_PATH : null);

  if (keyPath) {
    try {
      accessSync(keyPath, constants.R_OK);
    } catch {
      console.error('[patch] Key not readable:', keyPath);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || PROJECT_ID,
    });
    console.log('[patch] Using service account:', serviceAccount.client_email);
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  console.log('[patch] Using Application Default Credentials');
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
}

async function yardUidFromFeaturedCarIds(db, tenantSnap) {
  const data = tenantSnap.data() || {};
  const layout = typeof data.layout === 'object' && data.layout ? data.layout : {};
  const ids = asStringArray(layout.featuredCarIds);
  for (const carId of ids) {
    const carSnap = await db.collection('publicCars').doc(carId).get();
    if (!carSnap.exists) continue;
    const y = carSnap.get('yardUid');
    if (typeof y === 'string' && y.trim()) return { yardUid: y.trim(), source: `publicCars/${carId} (featuredCarIds)` };
  }
  return null;
}

async function yardUidFromPublishedScan(db) {
  const qs = await db.collection('publicCars').where('isPublished', '==', true).limit(250).get();
  for (const d of qs.docs) {
    const y = d.get('yardUid');
    if (typeof y === 'string' && y.trim()) return { yardUid: y.trim(), source: `publicCars/${d.id} (published scan)` };
  }
  return null;
}

async function main() {
  const { tenantId } = parseArgs();
  initializeAdmin();
  const db = getFirestore();

  const tenantRef = db.collection('tenantSiteConfigs').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) {
    console.error('[patch] tenantSiteConfigs doc missing:', tenantId);
    process.exit(1);
  }

  let resolved = await yardUidFromFeaturedCarIds(db, tenantSnap);
  if (!resolved) resolved = await yardUidFromPublishedScan(db);

  if (!resolved) {
    console.error('[patch] No yardUid found in publicCars (featured ids + published batch).');
    process.exit(1);
  }

  console.log('[patch] Resolved yardUid:', resolved.yardUid);
  console.log('[patch] Source:', resolved.source);

  await tenantRef.update({ 'dataScope.yardUid': resolved.yardUid });
  console.log('[patch] Updated tenantSiteConfigs/', tenantId, '→ dataScope.yardUid (other fields untouched).');
}

main().catch((e) => {
  console.error('[patch] Fatal:', e);
  process.exit(1);
});
