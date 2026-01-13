/**
 * Minimal shared bootstrap module for lazy-loaded handlers
 * 
 * Provides safe, minimal initialization of Firebase Admin SDK
 * that can be shared across lazy-loaded handler modules.
 */

import * as admin from "firebase-admin";

// Initialize admin app if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "carexpert-94faa.firebasestorage.app",
  });
}

// Export shared instances
export const db = admin.firestore();
export { admin };
