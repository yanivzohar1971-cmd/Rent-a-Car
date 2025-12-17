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
 * Timeout constant for upload operations (30 seconds)
 * If uploadBytes or getDownloadURL take longer than this, the upload will be aborted.
 */
const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Helper: Create a timeout promise that rejects after the specified duration
 */
function createUploadTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('UPLOAD_TIMEOUT'));
    }, ms);
  });
}

/**
 * Upload yard logo to Storage and update profile
 * Storage path: users/{uid}/yard/logo.{ext}
 * 
 * FLOW EXPLANATION:
 * 1. Validates file type (must be image/*) and size (max 5MB)
 * 2. Determines file extension from filename or MIME type
 * 3. Uploads bytes to Firebase Storage (with 30s timeout via Promise.race)
 * 4. Gets the download URL from Storage (with 30s timeout via Promise.race)
 * 5. Updates Firestore user doc with the new yardLogoUrl
 * 6. Returns the download URL on success
 * 
 * TIMEOUT HANDLING:
 * - Uses Promise.race to wrap uploadBytes and getDownloadURL with a 30s timeout
 * - If timeout triggers, rejects with "Upload timeout" error
 * - Caller (handleLogoUpload) must still reach its finally block to reset isUploadingLogo
 * 
 * @param file Image file to upload
 * @returns Download URL of uploaded logo
 */
export async function uploadYardLogo(file: File): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;

  console.log('[YardLogoDebug] uploadYardLogo called with file:', {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  if (!user) {
    console.error('[YardLogoDebug] No authenticated user found');
    throw new Error('User must be authenticated to upload logo');
  }

  console.log('[YardLogoDebug] User authenticated:', user.uid);

  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('[YardLogoDebug] Invalid file type:', file.type);
      throw new Error('קובץ לא תקין. יש לבחור קובץ תמונה');
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.error('[YardLogoDebug] File too large:', file.size);
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
    
    console.log('[YardLogoDebug] Starting uploadBytes to:', storagePath);
    const uploadStartTime = Date.now();

    // Upload with timeout protection using Promise.race
    await Promise.race([
      uploadBytes(storageRef, file),
      createUploadTimeout(UPLOAD_TIMEOUT_MS),
    ]);

    const uploadDuration = Date.now() - uploadStartTime;
    console.log('[YardLogoDebug] uploadBytes completed in', uploadDuration, 'ms');

    // Get download URL with timeout protection
    console.log('[YardLogoDebug] Getting download URL...');
    const getUrlStartTime = Date.now();

    const downloadURL = await Promise.race([
      getDownloadURL(storageRef),
      createUploadTimeout(UPLOAD_TIMEOUT_MS),
    ]) as string;

    const getUrlDuration = Date.now() - getUrlStartTime;
    console.log('[YardLogoDebug] getDownloadURL completed in', getUrlDuration, 'ms, URL:', downloadURL);

    // Update profile with logo URL
    console.log('[YardLogoDebug] Updating Firestore with logo URL...');
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(
      userDocRef,
      {
        yardLogoUrl: downloadURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    console.log('[YardLogoDebug] Firestore updated successfully');

    return downloadURL;
  } catch (error: any) {
    // Log full error details for debugging
    console.error('[YardLogoDebug] Upload failed. Full error object:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack,
      serverResponse: error?.serverResponse,
    });
    
    // Handle timeout error
    if (error.message === 'UPLOAD_TIMEOUT') {
      console.error('[YardLogoDebug] Upload timed out after', UPLOAD_TIMEOUT_MS, 'ms');
      throw new Error('ההעלאה נכשלה - זמן קצוב. אנא בדוק את החיבור לרשת ונסה שוב.');
    }
    
    // Provide more specific error messages for Firebase Storage errors
    if (error.code === 'storage/unauthorized' || error.code === 'storage/permission-denied') {
      throw new Error('אין הרשאה להעלות לוגו. אנא בדוק את הגדרות האבטחה.');
    } else if (error.code === 'storage/quota-exceeded') {
      throw new Error('אין מספיק מקום אחסון. אנא נסה קובץ קטן יותר.');
    } else if (error.code === 'storage/canceled') {
      throw new Error('ההעלאה בוטלה.');
    } else if (error.code === 'storage/retry-limit-exceeded') {
      throw new Error('ההעלאה נכשלה לאחר מספר ניסיונות. אנא בדוק את החיבור לרשת.');
    } else if (error.code === 'storage/unknown') {
      throw new Error('שגיאה לא צפויה. אנא נסה שוב מאוחר יותר.');
    } else if (error.message && error.message !== 'UPLOAD_TIMEOUT') {
      // Re-throw with the existing message (could be our Hebrew validation messages)
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

