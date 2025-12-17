#!/usr/bin/env node

/**
 * Bootstrap script to set admin custom claims for Firebase Auth users.
 * 
 * This script uses Firebase Admin SDK to set { admin: true } custom claim
 * on a user account, which is required for Storage and Firestore rules
 * that check request.auth.token.admin.
 * 
 * Usage:
 *   node tools/setAdminClaims.mjs <email-or-uid> [path-to-service-account-key.json]
 * 
 * Example:
 *   node tools/setAdminClaims.mjs admin@example.com ./service-account-key.json
 *   node tools/setAdminClaims.mjs abc123xyz ./service-account-key.json
 * 
 * Security:
 *   - Never commit service account keys to git
 *   - Store keys in a secure location outside the repo
 *   - Only run this script from a trusted environment
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: node setAdminClaims.mjs <email-or-uid> [path-to-service-account-key.json]');
  console.error('');
  console.error('Example:');
  console.error('  node setAdminClaims.mjs admin@example.com ./service-account-key.json');
  console.error('  node setAdminClaims.mjs abc123xyz ./service-account-key.json');
  process.exit(1);
}

const emailOrUid = args[0];
const serviceAccountPath = args[1] || resolve(__dirname, '../service-account-key.json');

// Load service account key
let serviceAccount;
try {
  const keyFile = readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(keyFile);
} catch (error) {
  console.error(`Error loading service account key from ${serviceAccountPath}:`);
  console.error(error.message);
  console.error('');
  console.error('Please provide a valid Firebase service account key JSON file.');
  console.error('You can download it from:');
  console.error('  Firebase Console → Project Settings → Service Accounts → Generate New Private Key');
  process.exit(1);
}

// Initialize Firebase Admin (only if not already initialized)
if (getApps().length === 0) {
  try {
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('✓ Firebase Admin initialized');
  } catch (error) {
    console.error('Error initializing Firebase Admin:');
    console.error(error.message);
    process.exit(1);
  }
}

// Get user by email or UID
const auth = getAuth();
let user;

try {
  // Try as UID first
  try {
    user = await auth.getUser(emailOrUid);
    console.log(`✓ Found user by UID: ${user.email || user.uid}`);
  } catch (uidError) {
    // If not found by UID, try as email
    try {
      user = await auth.getUserByEmail(emailOrUid);
      console.log(`✓ Found user by email: ${user.email}`);
    } catch (emailError) {
      console.error(`User not found: ${emailOrUid}`);
      console.error('Please provide either a valid email address or UID.');
      process.exit(1);
    }
  }
} catch (error) {
  console.error('Error fetching user:');
  console.error(error.message);
  process.exit(1);
}

// Set admin custom claim
try {
  const currentClaims = user.customClaims || {};
  const newClaims = {
    ...currentClaims,
    admin: true,
    isAdmin: true, // Support both naming conventions
  };

  await auth.setCustomUserClaims(user.uid, newClaims);
  
  console.log('');
  console.log('✓ Admin custom claims set successfully!');
  console.log('');
  console.log('User details:');
  console.log(`  UID: ${user.uid}`);
  console.log(`  Email: ${user.email || '(no email)'}`);
  console.log(`  Custom Claims: ${JSON.stringify(newClaims, null, 2)}`);
  console.log('');
  console.log('⚠️  IMPORTANT: The user must sign out and sign in again for the');
  console.log('   custom claims to take effect in their current session.');
  console.log('');
} catch (error) {
  console.error('Error setting custom claims:');
  console.error(error.message);
  process.exit(1);
}
