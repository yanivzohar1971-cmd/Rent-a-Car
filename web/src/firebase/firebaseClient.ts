/**
 * Firebase Client Configuration for Web - UNIFIED GATEWAY
 * 
 * This is the ONLY file that should directly import from firebase/* modules.
 * All other files should import from this gateway to enable proper code-splitting.
 * 
 * ARCHITECTURE:
 * - firebaseClient.ts (THIS FILE): Eager gateway for admin/authenticated pages
 * - firebaseClientLazy.ts: Lazy gateway for public pages (homepage, etc.)
 * - All app code: Import from one of these gateways, NEVER directly from firebase/*
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {		   
  apiKey: "AIzaSyDvX8JE9anOMGR9wqu93FyNANr7HVim0v8",
  authDomain: "carexpert-94faa.firebaseapp.com",
  projectId: "carexpert-94faa",
  storageBucket: "carexpert-94faa.firebasestorage.app",
  messagingSenderId: "391580257900",
  appId: "1:391580257900:web:38823d005ead90986ad249",
  measurementId: "G-LYK5GKZDZT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// ========================================
// RE-EXPORT FIRESTORE FUNCTIONS
// ========================================
// Re-export Firestore functions
export {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  getDocFromCache,
  getDocsFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAfter,
  startAt,
  endBefore,
  endAt,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  runTransaction,
  documentId,
} from 'firebase/firestore';

// Re-export Firestore types
export type {
  QueryConstraint,
  CollectionReference,
  DocumentReference,
  QueryDocumentSnapshot,
  QuerySnapshot,
  DocumentData,
  FieldValue,
  Transaction,
  WriteBatch,
  DocumentSnapshot,
  SnapshotOptions,
} from 'firebase/firestore';

// ========================================
// RE-EXPORT AUTH FUNCTIONS
// ========================================
// Re-export Auth functions
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';

// Re-export Auth types
export type {
  User,
  UserCredential,
} from 'firebase/auth';

// ========================================
// RE-EXPORT STORAGE FUNCTIONS
// ========================================
// Re-export Storage functions
export {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage';

// Re-export Storage types
export type {
  StorageReference,
  UploadTask,
  UploadMetadata,
} from 'firebase/storage';

// ========================================
// RE-EXPORT FUNCTIONS
// ========================================
// Re-export Functions
export {
  httpsCallable,
} from 'firebase/functions';

// Re-export Functions types
export type {
  HttpsCallable,
  HttpsCallableResult,
} from 'firebase/functions';

