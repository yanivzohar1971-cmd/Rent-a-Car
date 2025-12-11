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

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Storage
export const storage = getStorage(app);

// Initialize Functions
export const functions = getFunctions(app);

