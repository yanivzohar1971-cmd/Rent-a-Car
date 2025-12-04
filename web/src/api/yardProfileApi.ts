import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { YardPromotionState } from '../types/Promotion';

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
  
  // Yard promotion state
  promotion?: YardPromotionState;
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
      promotion: data.promotion || undefined,
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
        promotion: profile.promotion || null,
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
 * Storage path: users/{uid}/yard/logo.{ext}
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

    // Get file extension from original filename or MIME type
    let fileExtension = 'jpg'; // default
    const fileName = file.name.toLowerCase();
    if (fileName.includes('.')) {
      const ext = fileName.split('.').pop();
      if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        fileExtension = ext === 'jpeg' ? 'jpg' : ext;
      }
    } else {
      // Fallback to MIME type
      if (file.type === 'image/png') fileExtension = 'png';
      else if (file.type === 'image/webp') fileExtension = 'webp';
      else if (file.type === 'image/gif') fileExtension = 'gif';
    }

    // Upload to Storage with proper extension
    const storagePath = `users/${user.uid}/yard/logo.${fileExtension}`;
    const storageRef = ref(storage, storagePath);
    
    console.log('[YardLogoUpload] Uploading logo to:', storagePath);
    await uploadBytes(storageRef, file);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    console.log('[YardLogoUpload] Logo uploaded successfully, URL:', downloadURL);

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
    console.log('[YardLogoUpload] Profile updated with logo URL');

    return downloadURL;
  } catch (error: any) {
    console.error('[YardLogoUpload] Failed to upload logo:', error);
    
    // Provide more specific error messages
    if (error.code === 'storage/unauthorized' || error.code === 'storage/permission-denied') {
      throw new Error('אין הרשאה להעלות לוגו. אנא בדוק את הגדרות האבטחה.');
    } else if (error.code === 'storage/quota-exceeded') {
      throw new Error('אין מספיק מקום אחסון. אנא נסה קובץ קטן יותר.');
    } else if (error.code === 'storage/canceled') {
      throw new Error('ההעלאה בוטלה.');
    } else if (error.message) {
      throw new Error(error.message);
    } else {
      throw new Error('שגיאה בהעלאת הלוגו. אנא נסה שוב.');
    }
  }
}

/**
 * Delete yard logo from Storage and profile
 * Note: Tries common image extensions since we don't store the original extension
 */
export async function deleteYardLogo(): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to delete logo');
  }

  try {
    // Try to delete from Storage with common extensions
    // Since we don't store which extension was used, try the most common ones
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    let deleted = false;
    
    for (const ext of extensions) {
      const storagePath = `users/${user.uid}/yard/logo.${ext}`;
      const storageRef = ref(storage, storagePath);
      try {
        await deleteObject(storageRef);
        console.log('[YardLogoUpload] Deleted logo from:', storagePath);
        deleted = true;
        break; // Found and deleted, no need to try others
      } catch (error: any) {
        // Ignore if file doesn't exist, continue to next extension
        if (error.code !== 'storage/object-not-found') {
          throw error;
        }
      }
    }

    if (!deleted) {
      console.log('[YardLogoUpload] No logo file found in Storage to delete');
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
    console.log('[YardLogoUpload] Logo URL removed from profile');
  } catch (error: any) {
    console.error('[YardLogoUpload] Failed to delete logo:', error);
    throw new Error(error.message || 'שגיאה במחיקת הלוגו');
  }
}

