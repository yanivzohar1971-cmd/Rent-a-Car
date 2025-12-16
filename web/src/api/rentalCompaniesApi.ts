import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
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
import { fsAddDoc, fsUpdateDoc } from './firestoreWrite';

export type DisplayType = 'NEUTRAL' | 'FEATURED' | 'SPONSORED';
export type AdPlacement = 'HOME_TOP_STRIP' | 'CARS_SEARCH_TOP_STRIP';
export type OutboundPolicy = 'SPONSORED_NOFOLLOW' | 'NOFOLLOW' | 'FOLLOW';

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
  // Phase 1: Advertising fields
  placements?: AdPlacement[]; // default ['HOME_TOP_STRIP'] for existing docs
  slug?: string; // for SEO landing URL: /partner/:slug
  headlineHe?: string; // short title for landing + meta
  descriptionHe?: string; // longer text (SEO content)
  seoKeywordsHe?: string[]; // optional
  outboundPolicy?: OutboundPolicy; // default SPONSORED_NOFOLLOW
  activeFrom?: Timestamp | null;
  activeTo?: Timestamp | null;
  budgetMonthlyNis?: number | null; // admin-only planning
  isPaid?: boolean; // admin-only (manual for now)
  clickTrackingEnabled?: boolean; // default true for SPONSORED
  clicksTotal?: number; // maintained by function
}

export interface CreateRentalCompanyInput {
  nameHe: string;
  nameEn?: string;
  websiteUrl: string;
  displayType?: DisplayType;
  sortOrder?: number;
  isVisible?: boolean;
  isFeatured?: boolean;
  // Phase 1: Advertising fields
  placements?: AdPlacement[];
  slug?: string;
  headlineHe?: string;
  descriptionHe?: string;
  seoKeywordsHe?: string[];
  outboundPolicy?: OutboundPolicy;
  activeFrom?: Timestamp | null;
  activeTo?: Timestamp | null;
  budgetMonthlyNis?: number | null;
  isPaid?: boolean;
  clickTrackingEnabled?: boolean;
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
  // Phase 1: Advertising fields
  placements?: AdPlacement[];
  slug?: string;
  headlineHe?: string;
  descriptionHe?: string;
  seoKeywordsHe?: string[];
  outboundPolicy?: OutboundPolicy;
  activeFrom?: Timestamp | null;
  activeTo?: Timestamp | null;
  budgetMonthlyNis?: number | null;
  isPaid?: boolean;
  clickTrackingEnabled?: boolean;
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
 * Fetch visible rental companies for a specific placement
 * Filters by placement and active window (activeFrom/activeTo)
 */
export async function fetchVisibleRentalCompaniesForPlacement(
  placement: AdPlacement
): Promise<RentalCompany[]> {
  try {
    const q = query(
      collection(db, 'rentalCompanies'),
      where('isVisible', '==', true),
      orderBy('sortOrder', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const now = Date.now();
    
    return (querySnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RentalCompany[])
      .filter((company) => {
        // Check placement: if placements is missing, default to HOME_TOP_STRIP
        const placements = company.placements || ['HOME_TOP_STRIP'];
        if (!placements.includes(placement) && !(placements.length === 0 && placement === 'HOME_TOP_STRIP')) {
          return false;
        }
        
        // Check active window
        if (company.activeFrom) {
          const activeFromMs = company.activeFrom.toMillis ? company.activeFrom.toMillis() : 
            (company.activeFrom as any).seconds * 1000;
          if (now < activeFromMs) {
            return false;
          }
        }
        
        if (company.activeTo) {
          const activeToMs = company.activeTo.toMillis ? company.activeTo.toMillis() : 
            (company.activeTo as any).seconds * 1000;
          if (now > activeToMs) {
            return false;
          }
        }
        
        return true;
      }) as RentalCompany[];
  } catch (error) {
    console.error('Error fetching visible rental companies for placement:', error);
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
 * Fetch a single rental company by slug (for landing pages)
 * Uses simple query (no orderBy) to avoid composite index requirement
 */
export async function fetchRentalCompanyBySlug(slug: string): Promise<RentalCompany | null> {
  try {
    const q = query(
      collection(db, 'rentalCompanies'),
      where('slug', '==', slug),
      // Note: removed orderBy to avoid composite index requirement
      // We only need one doc, so limit(1) is implicit
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    // Get first match (slug should be unique)
    const doc = querySnapshot.docs[0];
    const data = doc.data() as Omit<RentalCompany, 'id'>;
    
    // Check isVisible after fetch (avoids composite index)
    if (data.isVisible !== true) {
      return null;
    }
    
    return {
      ...data,
      id: doc.id,
    } as RentalCompany;
  } catch (error) {
    console.error('Error fetching rental company by slug:', error);
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
    
    // Create document data (omit undefined fields)
    const companyDataRaw: Record<string, any> = {
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
      // Phase 1: Advertising fields (with defaults)
      placements: input.placements || ['HOME_TOP_STRIP'],
      outboundPolicy: input.outboundPolicy || 'SPONSORED_NOFOLLOW',
      isPaid: input.isPaid || false,
      clickTrackingEnabled: input.clickTrackingEnabled !== undefined ? input.clickTrackingEnabled : 
        (input.displayType === 'SPONSORED' ? true : false),
    };

    // Add optional fields only if they are defined (not undefined)
    if (input.slug !== undefined) companyDataRaw.slug = input.slug;
    if (input.headlineHe !== undefined) companyDataRaw.headlineHe = input.headlineHe;
    if (input.descriptionHe !== undefined) companyDataRaw.descriptionHe = input.descriptionHe;
    if (input.seoKeywordsHe !== undefined) companyDataRaw.seoKeywordsHe = input.seoKeywordsHe;
    if (input.activeFrom !== undefined) companyDataRaw.activeFrom = input.activeFrom;
    if (input.activeTo !== undefined) companyDataRaw.activeTo = input.activeTo;
    if (input.budgetMonthlyNis !== undefined) companyDataRaw.budgetMonthlyNis = input.budgetMonthlyNis;

    // Create document first to get ID (sanitization handled by fsAddDoc)
    const docRef = await fsAddDoc(collection(db, 'rentalCompanies'), companyDataRaw);
    const companyId = docRef.id;

    // Upload logo if provided
    if (logoFile) {
      const { downloadURL, storagePath } = await uploadRentalCompanyLogo(companyId, logoFile);
      const logoVersion = Date.now(); // Use timestamp as version for cache busting
      
      // Update document with logo URLs and version (sanitization handled by fsUpdateDoc)
      await fsUpdateDoc(docRef, {
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
    
    // Prepare update data (only include fields that are not undefined)
    const updateDataRaw: Record<string, any> = {
      updatedAt: serverTimestamp() as Timestamp,
      updatedByUid: user.uid,
    };

    if (input.nameHe !== undefined) updateDataRaw.nameHe = input.nameHe;
    if (input.nameEn !== undefined) updateDataRaw.nameEn = input.nameEn;
    if (input.websiteUrl !== undefined) updateDataRaw.websiteUrl = input.websiteUrl;
    if (input.displayType !== undefined) updateDataRaw.displayType = input.displayType;
    if (input.sortOrder !== undefined) updateDataRaw.sortOrder = input.sortOrder;
    if (input.isVisible !== undefined) updateDataRaw.isVisible = input.isVisible;
    if (input.isFeatured !== undefined) updateDataRaw.isFeatured = input.isFeatured;
    if (input.logoAlt !== undefined) updateDataRaw.logoAlt = input.logoAlt;
    // Phase 1: Advertising fields (only add if not undefined)
    if (input.placements !== undefined) updateDataRaw.placements = input.placements;
    if (input.slug !== undefined) updateDataRaw.slug = input.slug;
    if (input.headlineHe !== undefined) updateDataRaw.headlineHe = input.headlineHe;
    if (input.descriptionHe !== undefined) updateDataRaw.descriptionHe = input.descriptionHe;
    if (input.seoKeywordsHe !== undefined) updateDataRaw.seoKeywordsHe = input.seoKeywordsHe;
    if (input.outboundPolicy !== undefined) updateDataRaw.outboundPolicy = input.outboundPolicy;
    if (input.activeFrom !== undefined) updateDataRaw.activeFrom = input.activeFrom;
    if (input.activeTo !== undefined) updateDataRaw.activeTo = input.activeTo;
    if (input.budgetMonthlyNis !== undefined) updateDataRaw.budgetMonthlyNis = input.budgetMonthlyNis;
    if (input.isPaid !== undefined) updateDataRaw.isPaid = input.isPaid;
    if (input.clickTrackingEnabled !== undefined) updateDataRaw.clickTrackingEnabled = input.clickTrackingEnabled;

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
      // Add logo fields to updateDataRaw (they are never undefined)
      updateDataRaw.logoUrl = downloadURL;
      updateDataRaw.logoStoragePath = storagePath;
      updateDataRaw.logoVersion = logoVersion;
    }

    // Update document (sanitization handled by fsUpdateDoc)
    await fsUpdateDoc(docRef, updateDataRaw);
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
