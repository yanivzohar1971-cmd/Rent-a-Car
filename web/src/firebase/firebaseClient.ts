/**
 * Firebase Client Configuration for Web
 * 
 * IMPORTANT: You must paste your real Firebase config here from Firebase Console:
 * 1. Go to https://console.firebase.google.com/
 * 2. Select your project (carexpert-94faa)
 * 3. Go to Project Settings (⚙️) > General
 * 4. Scroll to "Your apps" > Web app (or create one)
 * 5. Copy the firebaseConfig object
 * 6. Replace the TODO_FILL_ME values below
 * 
 * Example:
 * const firebaseConfig = {
 *   apiKey: "AIzaSy...",
 *   authDomain: "carexpert-94faa.firebaseapp.com",
 *   projectId: "carexpert-94faa",
 *   storageBucket: "carexpert-94faa.appspot.com",
 *   messagingSenderId: "123456789",
 *   appId: "1:123456789:web:abc123"
 * };
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDvX8JE9an0MGR9wqu93FyNANr7HVI8m0v8",
  authDomain: "carexpert-94faa.firebaseapp.com",
  projectId: "carexpert-94faa",
  storageBucket: "carexpert-94faa.firebasestorage.app",
  messagingSenderId: "391580257900",
  appId: "1:391580257900:web:38823d005ead998b6ad249",
  measurementId: "G-LYK5GKZDZT"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

