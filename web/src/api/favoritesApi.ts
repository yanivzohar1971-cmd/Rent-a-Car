import { collection, doc, getDocsFromServer, setDoc, deleteDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

/**
 * Favorite car document structure
 */
export interface FavoriteCar {
  carId: string;
  createdAt: Timestamp;
}

/**
 * Load all favorite car IDs for the current user
 * Returns a Set of car IDs for fast lookup
 */
export async function loadFavoriteCarIds(): Promise<Set<string>> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    return new Set<string>();
  }

  try {
    const favoritesRef = collection(db, 'users', user.uid, 'favorites');
    const snapshot = await getDocsFromServer(favoritesRef);
    
    const carIds = new Set<string>();
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.carId) {
        carIds.add(data.carId);
      }
    });

    return carIds;
  } catch (error) {
    console.error('Error loading favorites:', error);
    return new Set<string>();
  }
}

/**
 * Add a car to favorites
 */
export async function addFavorite(carId: string): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to add favorites');
  }

  try {
    const favoriteRef = doc(db, 'users', user.uid, 'favorites', carId);
    await setDoc(favoriteRef, {
      carId,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    throw error;
  }
}

/**
 * Remove a car from favorites
 */
export async function removeFavorite(carId: string): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to remove favorites');
  }

  try {
    const favoriteRef = doc(db, 'users', user.uid, 'favorites', carId);
    await deleteDoc(favoriteRef);
  } catch (error) {
    console.error('Error removing favorite:', error);
    throw error;
  }
}

/**
 * Check if a car is favorited
 */
export async function isFavorite(carId: string): Promise<boolean> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    return false;
  }

  try {
    const favoriteRef = doc(db, 'users', user.uid, 'favorites', carId);
    const docSnap = await getDocFromServer(favoriteRef);
    return docSnap.exists();
  } catch (error) {
    console.error('Error checking favorite:', error);
    return false;
  }
}

