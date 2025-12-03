import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

/**
 * Yard profile data (stored in /users/{uid})
 */
export interface YardProfileData {
  displayName?: string; // Yard name
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  companyNumber?: string; // ח.פ
  vatId?: string; // מע"מ
  website?: string;
  secondaryPhone?: string;
}

/**
 * Load yard profile from /users/{uid}
 */
export async function loadYardProfile(): Promise<YardProfileData | null> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to load yard profile');
  }

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDocFromServer(userDocRef);

    if (!userDoc.exists()) {
      return null;
    }

    const data = userDoc.data();
    return {
      displayName: data.displayName || data.fullName || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      city: data.city || '',
      companyNumber: data.companyNumber || '',
      vatId: data.vatId || '',
      website: data.website || '',
      secondaryPhone: data.secondaryPhone || '',
    };
  } catch (error) {
    console.error('Error loading yard profile:', error);
    throw error;
  }
}

/**
 * Save yard profile to /users/{uid}
 */
export async function saveYardProfile(profile: YardProfileData): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to save yard profile');
  }

  try {
    const userDocRef = doc(db, 'users', user.uid);
    
    // Update only the yard-specific fields, preserve other fields
    await setDoc(
      userDocRef,
      {
        displayName: profile.displayName || null,
        phone: profile.phone || null,
        address: profile.address || null,
        city: profile.city || null,
        companyNumber: profile.companyNumber || null,
        vatId: profile.vatId || null,
        website: profile.website || null,
        secondaryPhone: profile.secondaryPhone || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error saving yard profile:', error);
    throw error;
  }
}

