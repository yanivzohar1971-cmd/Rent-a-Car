/**
 * Lazy-loading Firebase Client Configuration
 * 
 * This module delays initialization of Auth and Firestore until they're actually needed,
 * preventing the auth/iframe.js from loading on the homepage.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Functions } from 'firebase/functions';

const firebaseConfig = {		   
  apiKey: "AIzaSyDvX8JE9anOMGR9wqu93FyNANr7HVim0v8",
  authDomain: "carexpert-94faa.firebaseapp.com",
  projectId: "carexpert-94faa",
  storageBucket: "carexpert-94faa.firebasestorage.app",
  messagingSenderId: "391580257900",
  appId: "1:391580257900:web:38823d005ead90986ad249",
  measurementId: "G-LYK5GKZDZT"
};

// Initialize Firebase App immediately (lightweight, no auth/firestore)
let app: FirebaseApp | null = null;

function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

// Lazy-loaded services
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _functions: Functions | null = null;

/**
 * Get Auth instance (lazy-loaded, only when needed)
 * This prevents auth/iframe.js from loading on homepage
 */
export async function getAuthAsync(): Promise<Auth> {
  if (_auth) {
    return _auth;
  }
  
  // Dynamic import to code-split auth bundle
  const { getAuth } = await import('firebase/auth');
  _auth = getAuth(getApp());
  return _auth;
}

/**
 * Get Firestore instance (lazy-loaded, only when needed)
 */
export async function getFirestoreAsync(): Promise<Firestore> {
  if (_db) {
    return _db;
  }
  
  // Dynamic import to code-split firestore bundle
  const { getFirestore } = await import('firebase/firestore');
  _db = getFirestore(getApp());
  return _db;
}

/**
 * Get Storage instance (lazy-loaded)
 */
export async function getStorageAsync(): Promise<FirebaseStorage> {
  if (_storage) {
    return _storage;
  }
  
  const { getStorage } = await import('firebase/storage');
  _storage = getStorage(getApp());
  return _storage;
}

/**
 * Get Functions instance (lazy-loaded)
 */
export async function getFunctionsAsync(): Promise<Functions> {
  if (_functions) {
    return _functions;
  }
  
  const { getFunctions } = await import('firebase/functions');
  _functions = getFunctions(getApp(), 'us-central1');
  return _functions;
}

/**
 * Synchronous getters for backward compatibility (use sparingly)
 * These will trigger immediate initialization
 */
export function getAuthSync(): Auth {
  if (!_auth) {
    // This will cause auth to load immediately - avoid on homepage
    throw new Error('getAuthSync called before lazy init. Use getAuthAsync() instead.');
  }
  return _auth;
}

export function getFirestoreSync(): Firestore {
  if (!_db) {
    throw new Error('getFirestoreSync called before lazy init. Use getFirestoreAsync() instead.');
  }
  return _db;
}
