/**
 * Script to create publicCars collection in Firestore
 * 
 * Usage:
 * 1. Make sure firebaseClient.ts has the correct config
 * 2. Run: npx tsx scripts/createPublicCarsCollection.ts
 * 
 * Or use Node.js:
 * node --loader ts-node/esm scripts/createPublicCarsCollection.ts
 */

import { collection, addDoc, getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

// Use the same config as firebaseClient.ts
const firebaseConfig = {
  apiKey: "AIzaSyDvX8JE9an0MGR9wqu93FyNANr7HVI8m0v8",
  authDomain: "carexpert-94faa.firebaseapp.com",
  projectId: "carexpert-94faa",
  storageBucket: "carexpert-94faa.firebasestorage.app",
  messagingSenderId: "391580257900",
  appId: "1:391580257900:web:38823d005ead998b6ad249",
  measurementId: "G-LYK5GKZDZT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createPublicCarsCollection() {
  try {
    console.log('Creating publicCars collection...');

    const carsCollection = collection(db, 'publicCars');

    // Add the car document
    const carData = {
      isActive: true,
      manufacturerHe: "טויוטה",
      modelHe: "קורולה",
      year: 2018,
      price: 78000,
      km: 82000,
      city: "תל אביב",
      mainImageUrl: "https://via.placeholder.com/800x450?text=Corolla+2018"
    };

    const docRef = await addDoc(carsCollection, carData);
    console.log('✅ Car document created with ID:', docRef.id);
    console.log('✅ Collection "publicCars" is ready!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating collection:', error);
    process.exit(1);
  }
}

createPublicCarsCollection();

