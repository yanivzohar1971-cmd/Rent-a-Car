import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, type UploadMetadata } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

export type DisplayType = 'NEUTRAL' | 'FEATURED' | 'SPONSORED';

export interface RentalCompany {
  id: string;
  nameHe: string;
  nameEn?: string;
  websiteUrl: string;
  logoStoragePath?: string;
  logoUrl?: string;
  logoAlt?: string;
  logoVersion?: number; // Version number updated on each logo upload/replace for cache busting
  isVisible: boolean;
  isFeatured: boolean;
  displayType: DisplayType;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedByUid?: string;
}

export interface CreateRentalCompanyInput {
  nameHe: string;
  nameEn?: string;
  websiteUrl: string;
  displayType?: DisplayType;
  sortOrder?: number;
  isVisible?: boolean;
  isFeatured?: boolean;
}

export interface UpdateRentalCompanyInput {
  nameHe?: string;
  nameEn?: string;
  websiteUrl?: string;
  displayType?: DisplayType;
  sortOrder?: number;
  isVisible?: boolean;
  isFeatured?: boolean;
  logoUrl?: string;
  logoStoragePath?: string;
  logoAlt?: string;
}

/**
 * Fetch all visible rental companies, ordered by sortOrder
 */
export async function fetchVisibleRentalCompanies(): Promise<RentalCompany[]> {
  try {
    const q = query(
      collection(db, 'rentalCompanies'),
      where('isVisible', '==', true),
      orderBy('sortOrder', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as RentalCompany[];
  } catch (error) {
    console.error('Error fetching visible rental companies:', error);
    throw error;
  }
}

/**
 * Fetch all rental companies (admin only)
 */
export async function fetchAllRentalCompanies(): Promise<RentalCompany[]> {
  try {
    const q = query(
      collection(db, 'rentalCompanies'),
      orderBy('sortOrder', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as RentalCompany[];
  } catch (error) {
    console.error('Error fetching all rental companies:', error);
    throw error;
  }
}

/**
 * Fetch a single rental company by ID
 */
export async function fetchRentalCompany(id: string): Promise<RentalCompany | null> {
  try {
    const docRef = doc(db, 'rentalCompanies', id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as RentalCompany;
  } catch (error) {
    console.error('Error fetching rental company:', error);
    throw error;
  }
}

/**
 * Upload logo file to Firebase Storage
 * Returns the download URL and storage path
 */
export async function uploadRentalCompanyLogo(
  companyId: string,
  file: File
): Promise<{ downloadURL: string; storagePath: string }> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('User must be authenticated to upload logo');
  }

  // Generate storage path: rentalCompanies/{companyId}/logo.{ext}
  // Stable naming: always use logo.* to avoid caching issues
  const fileExtension = file.name.split('.').pop() || 'bin';
  const fileName = `logo.${fileExtension}`;
  const storagePath = `rentalCompanies/${companyId}/${fileName}`;
  const storageRef = ref(storage, storagePath);

  try {
    // Upload file with cache control metadata
    // Use 1 hour cache (without immutable) to ensure logo updates propagate quickly
    // Combined with logoVersion query param, this guarantees immediate refresh after save
    const metadata: UploadMetadata = {
      cacheControl: 'public, max-age=3600', // 1 hour, no immutable flag
      contentType: file.type || undefined,
    };
    await uploadBytes(storageRef, file, metadata);
    
    // Get download URL (fresh URL after upload)
    const downloadURL = await getDownloadURL(storageRef);
    
    return { downloadURL, storagePath };
  } catch (error) {
    console.error('Error uploading rental company logo:', error);
    throw error;
  }
}

/**
 * Delete logo file from Firebase Storage
 * Best-effort deletion (ignores "not found" errors)
 */
export async function deleteRentalCompanyLogo(storagePath: string): Promise<void> {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    // Ignore "not found" errors (file may already be deleted)
    if (error?.code === 'storage/object-not-found' || error?.code === 404) {
      console.log('Logo file already deleted or not found:', storagePath);
      return;
    }
    console.error('Error deleting rental company logo:', error);
    // Don't throw - best-effort cleanup
    console.warn('Failed to delete logo file, continuing...');
  }
}

/**
 * Create a new rental company
 */
export async function createRentalCompany(
  input: CreateRentalCompanyInput,
  logoFile?: File
): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('User must be authenticated to create rental company');
  }

  try {
    // Get max sortOrder to append new item at the end
    const allCompanies = await fetchAllRentalCompanies();
    const maxSortOrder = allCompanies.length > 0 
      ? Math.max(...allCompanies.map(c => c.sortOrder))
      : 0;
    
    // Create document data
    const companyData: Omit<RentalCompany, 'id'> = {
      nameHe: input.nameHe,
      nameEn: input.nameEn || '',
      websiteUrl: input.websiteUrl,
      displayType: input.displayType || 'NEUTRAL',
      sortOrder: input.sortOrder ?? (maxSortOrder + 10),
      isVisible: input.isVisible ?? true,
      isFeatured: input.isFeatured ?? false,
      logoAlt: `לוגו ${input.nameHe}`,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      updatedByUid: user.uid,
    };

    // Create document first to get ID
    const docRef = await addDoc(collection(db, 'rentalCompanies'), companyData);
    const companyId = docRef.id;

    // Upload logo if provided
    if (logoFile) {
      const { downloadURL, storagePath } = await uploadRentalCompanyLogo(companyId, logoFile);
      const logoVersion = Date.now(); // Use timestamp as version for cache busting
      
      // Update document with logo URLs and version
      await updateDoc(docRef, {
        logoUrl: downloadURL,
        logoStoragePath: storagePath,
        logoVersion: logoVersion,
        updatedAt: serverTimestamp(),
      });
    }

    return companyId;
  } catch (error) {
    console.error('Error creating rental company:', error);
    throw error;
  }
}

/**
 * Update an existing rental company
 */
export async function updateRentalCompany(
  id: string,
  input: UpdateRentalCompanyInput,
  logoFile?: File
): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('User must be authenticated to update rental company');
  }

  try {
    const docRef = doc(db, 'rentalCompanies', id);
    
    // Prepare update data
    const updateData: Partial<RentalCompany> = {
      updatedAt: serverTimestamp() as Timestamp,
      updatedByUid: user.uid,
    };

    if (input.nameHe !== undefined) updateData.nameHe = input.nameHe;
    if (input.nameEn !== undefined) updateData.nameEn = input.nameEn;
    if (input.websiteUrl !== undefined) updateData.websiteUrl = input.websiteUrl;
    if (input.displayType !== undefined) updateData.displayType = input.displayType;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
    if (input.isVisible !== undefined) updateData.isVisible = input.isVisible;
    if (input.isFeatured !== undefined) updateData.isFeatured = input.isFeatured;
    if (input.logoAlt !== undefined) updateData.logoAlt = input.logoAlt;

    // Upload new logo if provided
    if (logoFile) {
      // Delete old logo if exists
      const existingCompany = await fetchRentalCompany(id);
      if (existingCompany?.logoStoragePath) {
        await deleteRentalCompanyLogo(existingCompany.logoStoragePath);
      }

      // Upload new logo
      const { downloadURL, storagePath } = await uploadRentalCompanyLogo(id, logoFile);
      const logoVersion = Date.now(); // Use timestamp as version for cache busting
      updateData.logoUrl = downloadURL;
      updateData.logoStoragePath = storagePath;
      updateData.logoVersion = logoVersion;
    }

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating rental company:', error);
    throw error;
  }
}

/**
 * Delete a rental company and its logo
 */
export async function deleteRentalCompany(id: string): Promise<void> {
  try {
    // Get company to delete logo
    const company = await fetchRentalCompany(id);
    
    if (company?.logoStoragePath) {
      await deleteRentalCompanyLogo(company.logoStoragePath);
    }

    // Delete document
    const docRef = doc(db, 'rentalCompanies', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting rental company:', error);
    throw error;
  }
}
