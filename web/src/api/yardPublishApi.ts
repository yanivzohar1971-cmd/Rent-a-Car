import { collection, getDocsFromServer, query, writeBatch, doc, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';

/**
 * Car publication status (matches Android CarPublicationStatus enum)
 */
export type CarPublicationStatus = 'DRAFT' | 'HIDDEN' | 'PUBLISHED';

/**
 * Update publication status for a single car
 */
export async function updateCarPublicationStatus(
  carId: string,
  status: CarPublicationStatus
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to update car status');
  }

  try {
    const carRef = doc(db, 'users', user.uid, 'carSales', carId);
    await carRef.update({
      publicationStatus: status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating car publication status:', error);
    throw error;
  }
}

/**
 * Batch update publication status for multiple cars
 */
export async function batchUpdateCarPublicationStatus(
  carIds: string[],
  status: CarPublicationStatus
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to batch update car status');
  }

  if (carIds.length === 0) {
    return; // Nothing to update
  }

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    carIds.forEach((carId) => {
      const carRef = doc(db, 'users', user.uid, 'carSales', carId);
      batch.update(carRef, {
        publicationStatus: status,
        updatedAt: now,
      });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error batch updating car publication status:', error);
    throw error;
  }
}

/**
 * Get cars by publication status
 */
export async function fetchCarsByStatus(
  status: CarPublicationStatus | null
): Promise<string[]> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to fetch cars by status');
  }

  try {
    const carSalesRef = collection(db, 'users', user.uid, 'carSales');
    
    let q;
    if (status) {
      q = query(carSalesRef, where('publicationStatus', '==', status));
    } else {
      q = query(carSalesRef);
    }

    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map((docSnap) => docSnap.id);
  } catch (error) {
    console.error('Error fetching cars by status:', error);
    throw error;
  }
}

