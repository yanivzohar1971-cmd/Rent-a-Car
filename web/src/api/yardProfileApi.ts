import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseClient';
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
  // New fields
  yardLogoUrl?: string | null;
  yardDescription?: string | null;
  openingHours?: string | null; // Free text, multiline
  yardLocationLat?: number | null;
  yardLocationLng?: number | null;
  yardMapsUrl?: string | null;
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
      yardLogoUrl: data.yardLogoUrl || null,
      yardDescription: data.yardDescription || null,
      openingHours: data.openingHours || null,
      yardLocationLat: data.yardLocationLat || null,
      yardLocationLng: data.yardLocationLng || null,
      yardMapsUrl: data.yardMapsUrl || null,
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
        yardLogoUrl: profile.yardLogoUrl || null,
        yardDescription: profile.yardDescription || null,
        openingHours: profile.openingHours || null,
        yardLocationLat: profile.yardLocationLat || null,
        yardLocationLng: profile.yardLocationLng || null,
        yardMapsUrl: profile.yardMapsUrl || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error saving yard profile:', error);
    throw error;
  }
}

/**
 * Upload yard logo to Storage and update profile
 * Storage path: users/{uid}/yard/logo.jpg
 * @param file Image file to upload
 * @returns Download URL of uploaded logo
 */
export async function uploadYardLogo(file: File): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to upload logo');
  }

  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('קובץ לא תקין. יש לבחור קובץ תמונה');
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('קובץ גדול מדי. גודל מקסימלי: 5MB');
    }

    // Upload to Storage
    const storagePath = `users/${user.uid}/yard/logo.jpg`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    // Update profile with logo URL
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(
      userDocRef,
      {
        yardLogoUrl: downloadURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return downloadURL;
  } catch (error: any) {
    console.error('Error uploading yard logo:', error);
    throw new Error(error.message || 'שגיאה בהעלאת הלוגו');
  }
}

/**
 * Delete yard logo from Storage and profile
 */
export async function deleteYardLogo(): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to delete logo');
  }

  try {
    // Delete from Storage
    const storagePath = `users/${user.uid}/yard/logo.jpg`;
    const storageRef = ref(storage, storagePath);
    try {
      await deleteObject(storageRef);
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code !== 'storage/object-not-found') {
        throw error;
      }
    }

    // Remove logo URL from profile
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(
      userDocRef,
      {
        yardLogoUrl: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error: any) {
    console.error('Error deleting yard logo:', error);
    throw new Error(error.message || 'שגיאה במחיקת הלוגו');
  }
}

