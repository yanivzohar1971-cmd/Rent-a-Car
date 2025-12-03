/**
 * Firebase Client Configuration for Web
 * 
 * IMPORTANT: Paste the official Firebase config from Firebase Console:
 * 1. Go to https://console.firebase.google.com/
 * 2. Select project: carexpert-94faa
 * 3. Go to Project Settings (⚙️) > General
 * 4. Scroll to "Your apps" > Web app
 * 5. Copy the firebaseConfig object from the config snippet
 * 6. Replace the placeholder values below with the exact values from Firebase Console
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_AUTH_DOMAIN_HERE",
  projectId: "PASTE_PROJECT_ID_HERE",
  storageBucket: "PASTE_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID_HERE",
  appId: "PASTE_APP_ID_HERE",
  // If present in the console snippet:
  measurementId: "PASTE_MEASUREMENT_ID_HERE",
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

