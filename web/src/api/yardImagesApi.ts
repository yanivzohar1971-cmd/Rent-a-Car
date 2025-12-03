import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { storage, db } from '../firebase/firebaseClient';

/**
 * Yard car image type (matches Android CarImage)
 */
export interface YardCarImage {
  id: string;
  originalUrl: string;
  thumbUrl?: string | null;
  order: number;
}

/**
 * Get storage path for a car image
 * Pattern: users/{ownerUid}/cars/{carId}/images/{imageId}.jpg
 * Note: Uses 'cars' in Storage path (matches Android), even though Firestore uses 'carSales'
 */
function getImageStoragePath(userUid: string, carId: string, imageId: string): string {
  return `users/${userUid}/cars/${carId}/images/${imageId}.jpg`;
}

/**
 * Parse imagesJson string from Firestore to list of YardCarImage
 */
function parseImagesJson(imagesJson: string | null | undefined): YardCarImage[] {
  if (!imagesJson || imagesJson.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(imagesJson);
    if (Array.isArray(parsed)) {
      return parsed.map((img: any) => ({
        id: img.id || '',
        originalUrl: img.originalUrl || '',
        thumbUrl: img.thumbUrl || null,
        order: typeof img.order === 'number' ? img.order : 0,
      }));
    }
    return [];
  } catch (error) {
    console.error('Error parsing imagesJson:', error);
    return [];
  }
}

/**
 * Serialize list of YardCarImage to JSON string
 */
function serializeImagesJson(images: YardCarImage[]): string {
  if (images.length === 0) {
    return '';
  }
  return JSON.stringify(images);
}

/**
 * List car images for a yard car
 * Reads from users/{uid}/carSales/{carId} document's imagesJson field
 */
export async function listCarImages(userUid: string, carId: string): Promise<YardCarImage[]> {
  try {
    const carDocRef = doc(db, 'users', userUid, 'carSales', carId);
    const carDoc = await getDocFromServer(carDocRef);

    if (!carDoc.exists()) {
      return [];
    }

    const data = carDoc.data();
    const imagesJson = data.imagesJson;
    return parseImagesJson(imagesJson);
  } catch (error) {
    console.error('Error listing car images:', error);
    throw error;
  }
}

/**
 * Upload a car image to Firebase Storage and update Firestore
 * @param userUid The user UID (owner of the car)
 * @param carId The car ID (Firestore document ID)
 * @param file The image file to upload
 * @returns The new YardCarImage with download URL
 */
export async function uploadCarImage(
  userUid: string,
  carId: string,
  file: File
): Promise<YardCarImage> {
  try {
    // Generate unique image ID
    const imageId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Upload to Storage
    const storagePath = getImageStoragePath(userUid, carId, imageId);
    const storageRef = ref(storage, storagePath);
    
    await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(storageRef);

    // Get current images to determine order
    const currentImages = await listCarImages(userUid, carId);
    const newOrder = currentImages.length;

    // Create new image object
    const newImage: YardCarImage = {
      id: imageId,
      originalUrl: downloadUrl,
      thumbUrl: null,
      order: newOrder,
    };

    // Update Firestore document with new image
    const carDocRef = doc(db, 'users', userUid, 'carSales', carId);
    const updatedImages = [...currentImages, newImage];
    const imagesJson = serializeImagesJson(updatedImages);

    await updateDoc(carDocRef, {
      imagesJson: imagesJson,
      imagesCount: updatedImages.length,
    });

    return newImage;
  } catch (error) {
    console.error('Error uploading car image:', error);
    throw error;
  }
}

/**
 * Delete a car image from Storage and Firestore
 * @param userUid The user UID (owner of the car)
 * @param carId The car ID (Firestore document ID)
 * @param image The image to delete
 */
export async function deleteCarImage(
  userUid: string,
  carId: string,
  image: YardCarImage
): Promise<void> {
  try {
    // Delete from Storage
    const storagePath = getImageStoragePath(userUid, carId, image.id);
    const storageRef = ref(storage, storagePath);
    
    try {
      await deleteObject(storageRef);
    } catch (storageError: any) {
      // If file doesn't exist in Storage, that's okay - continue to update Firestore
      if (storageError.code !== 'storage/object-not-found') {
        console.warn('Error deleting image from Storage (non-critical):', storageError);
      }
    }

    // Get current images and remove the deleted one
    const currentImages = await listCarImages(userUid, carId);
    const updatedImages = currentImages.filter((img) => img.id !== image.id);

    // Reorder remaining images
    const reorderedImages = updatedImages.map((img, index) => ({
      ...img,
      order: index,
    }));

    // Update Firestore document
    const carDocRef = doc(db, 'users', userUid, 'carSales', carId);
    const imagesJson = serializeImagesJson(reorderedImages);

    await updateDoc(carDocRef, {
      imagesJson: imagesJson,
      imagesCount: reorderedImages.length,
    });
  } catch (error) {
    console.error('Error deleting car image:', error);
    throw error;
  }
}

/**
 * Update the order of car images
 * Recalculates order field to be a contiguous sequence (0, 1, 2, ...) based on array order
 * @param userUid The user UID (owner of the car)
 * @param carId The car ID (Firestore document ID)
 * @param images Array of images in the desired order
 */
export async function updateCarImagesOrder(
  userUid: string,
  carId: string,
  images: YardCarImage[]
): Promise<void> {
  try {
    // Normalize order to be contiguous (0, 1, 2, ...)
    const normalized = images.map((img, index) => ({
      ...img,
      order: index,
    }));

    // Update Firestore document
    const carDocRef = doc(db, 'users', userUid, 'carSales', carId);
    const imagesJson = serializeImagesJson(normalized);

    await updateDoc(carDocRef, {
      imagesJson: imagesJson,
      imagesCount: normalized.length,
    });
  } catch (error) {
    console.error('Error updating car images order:', error);
    throw error;
  }
}

