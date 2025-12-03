import { collection, addDoc, getDocsFromServer, doc, getDocFromServer, updateDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';
import type { CarAd, CarAdStatus } from '../types/CarAd';
import type { CarPromotionState } from '../types/Promotion';

// Re-export for convenience
export type { CarAd };

/**
 * Map Firestore document to CarAd
 */
function mapCarAdDoc(docSnap: any): CarAd {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ownerType: data.ownerType || 'PRIVATE_SELLER',
    ownerUserId: data.ownerUserId || '',
    status: (data.status || 'ACTIVE') as CarAdStatus,
    manufacturer: data.manufacturer || '',
    manufacturerId: data.manufacturerId || null,
    model: data.model || '',
    modelId: data.modelId || null,
    year: typeof data.year === 'number' ? data.year : 0,
    mileageKm: typeof data.mileageKm === 'number' ? data.mileageKm : 0,
    price: typeof data.price === 'number' ? data.price : 0,
    city: data.city || '',
    cityId: data.cityId || null,
    regionId: data.regionId || null,
    gearboxType: data.gearboxType || null,
    fuelType: data.fuelType || null,
    color: data.color || null,
    handCount: data.handCount || null,
    engineDisplacementCc: data.engineDisplacementCc || null,
    description: data.description || null,
    phone: data.phone || null,
    email: data.email || null,
    imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : [],
    mainImageUrl: data.mainImageUrl || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    viewsCount: typeof data.viewsCount === 'number' ? data.viewsCount : 0,
    promotion: data.promotion ? (data.promotion as CarPromotionState) : undefined,
  };
}

/**
 * Create a new car ad
 */
export async function createCarAd(data: {
  manufacturer: string;
  manufacturerId?: string | null;
  model: string;
  modelId?: string | null;
  year: number;
  mileageKm: number;
  price: number;
  city: string;
  cityId?: string | null;
  regionId?: string | null;
  gearboxType?: string | null;
  fuelType?: string | null;
  color?: string | null;
  handCount?: number | null;
  engineDisplacementCc?: number | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  imageFiles?: File[];
}): Promise<CarAd> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to create a car ad');
  }

  try {
    // Upload images first if provided
    let imageUrls: string[] = [];
    if (data.imageFiles && data.imageFiles.length > 0) {
      const uploadPromises = data.imageFiles.map(async (file, index) => {
        const imageId = `img_${Date.now()}_${index}`;
        const storagePath = `carAds/${user.uid}/${imageId}.jpg`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        return downloadURL;
      });

      imageUrls = await Promise.all(uploadPromises);
    }

    const mainImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;

    // Create car ad document
    const now = serverTimestamp();
    const carAdsRef = collection(db, 'carAds');
    const docRef = await addDoc(carAdsRef, {
      ownerType: 'PRIVATE_SELLER',
      ownerUserId: user.uid,
      status: 'ACTIVE',
      manufacturer: data.manufacturer,
      manufacturerId: data.manufacturerId || null,
      model: data.model,
      modelId: data.modelId || null,
      year: data.year,
      mileageKm: data.mileageKm,
      price: data.price,
      city: data.city,
      cityId: data.cityId || null,
      regionId: data.regionId || null,
      gearboxType: data.gearboxType || null,
      fuelType: data.fuelType || null,
      color: data.color || null,
      handCount: data.handCount || null,
      engineDisplacementCc: data.engineDisplacementCc || null,
      description: data.description || null,
      phone: data.phone || null,
      email: data.email || null,
      imageUrls,
      mainImageUrl,
      createdAt: now,
      updatedAt: now,
      viewsCount: 0,
    });

    // Fetch the created document
    const docSnap = await getDocFromServer(docRef);
    if (docSnap.exists()) {
      return mapCarAdDoc(docSnap);
    }

    // Fallback
    return {
      id: docRef.id,
      ownerType: 'PRIVATE_SELLER',
      ownerUserId: user.uid,
      status: 'ACTIVE',
      manufacturer: data.manufacturer,
      manufacturerId: data.manufacturerId || null,
      model: data.model,
      modelId: data.modelId || null,
      year: data.year,
      mileageKm: data.mileageKm,
      price: data.price,
      city: data.city,
      cityId: data.cityId || null,
      regionId: data.regionId || null,
      gearboxType: data.gearboxType || null,
      fuelType: data.fuelType || null,
      color: data.color || null,
      handCount: data.handCount || null,
      engineDisplacementCc: data.engineDisplacementCc || null,
      description: data.description || null,
      phone: data.phone || null,
      email: data.email || null,
      imageUrls,
      mainImageUrl,
      createdAt: now,
      updatedAt: now,
      viewsCount: 0,
    };
  } catch (error) {
    console.error('Error creating car ad:', error);
    throw error;
  }
}

/**
 * Fetch a car ad by ID
 */
export async function fetchCarAdById(adId: string): Promise<CarAd | null> {
  try {
    const docRef = doc(db, 'carAds', adId);
    const docSnap = await getDocFromServer(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    return mapCarAdDoc(docSnap);
  } catch (error) {
    console.error('Error fetching car ad:', error);
    throw error;
  }
}

/**
 * Fetch all car ads for the current user (seller)
 */
export async function fetchSellerCarAds(): Promise<CarAd[]> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to fetch car ads');
  }

  try {
    const carAdsRef = collection(db, 'carAds');
    const q = query(
      carAdsRef,
      where('ownerUserId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapCarAdDoc);
  } catch (error) {
    console.error('Error fetching seller car ads:', error);
    throw error;
  }
}

/**
 * Fetch active car ads for public search
 * Only returns ads with status ACTIVE
 */
export async function fetchActiveCarAds(filters?: {
  manufacturer?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  priceFrom?: number;
  priceTo?: number;
  city?: string;
}): Promise<CarAd[]> {
  try {
    const carAdsRef = collection(db, 'carAds');
    // Only fetch ACTIVE ads
    let q = query(
      carAdsRef,
      where('status', '==', 'ACTIVE'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocsFromServer(q);
    let ads = snapshot.docs.map(mapCarAdDoc);

    // Apply client-side filters (similar to publicCars filtering)
    if (filters) {
      ads = ads.filter((ad) => {
        // Manufacturer filter
        if (filters.manufacturer) {
          const manufacturerLower = filters.manufacturer.toLowerCase();
          if (!ad.manufacturer.toLowerCase().includes(manufacturerLower)) {
            return false;
          }
        }

        // Model filter
        if (filters.model) {
          const modelLower = filters.model.toLowerCase();
          if (!ad.model.toLowerCase().includes(modelLower)) {
            return false;
          }
        }

        // Year range
        if (filters.yearFrom !== undefined && ad.year < filters.yearFrom) {
          return false;
        }
        if (filters.yearTo !== undefined && ad.year > filters.yearTo) {
          return false;
        }

        // Price range
        if (filters.priceFrom !== undefined && ad.price < filters.priceFrom) {
          return false;
        }
        if (filters.priceTo !== undefined && ad.price > filters.priceTo) {
          return false;
        }

        // City filter
        if (filters.city) {
          const cityLower = filters.city.toLowerCase();
          if (!ad.city.toLowerCase().includes(cityLower)) {
            return false;
          }
        }

        return true;
      });
    }

    return ads;
  } catch (error) {
    console.error('Error fetching active car ads:', error);
    throw error;
  }
}

/**
 * Update car ad status
 */
export async function updateCarAdStatus(adId: string, status: CarAdStatus): Promise<void> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to update car ad');
  }

  try {
    const adRef = doc(db, 'carAds', adId);
    
    // Verify ownership
    const adSnap = await getDocFromServer(adRef);
    if (!adSnap.exists()) {
      throw new Error('Car ad not found');
    }
    
    const adData = adSnap.data();
    if (adData.ownerUserId !== user.uid) {
      throw new Error('Not authorized to update this car ad');
    }

    await updateDoc(adRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating car ad status:', error);
    throw error;
  }
}

