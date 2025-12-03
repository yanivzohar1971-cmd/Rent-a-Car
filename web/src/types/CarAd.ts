/**
 * Car Ad Status
 */
export type CarAdStatus = 'ACTIVE' | 'PAUSED' | 'SOLD';

/**
 * Owner Type
 */
export type OwnerType = 'PRIVATE_SELLER' | 'YARD' | 'AGENT';

/**
 * Car Ad interface
 * Represents a car advertisement posted by a private seller
 * 
 * Firestore path: carAds/{adId}
 */
export interface CarAd {
  id: string;
  ownerType: OwnerType;
  ownerUserId: string; // Firebase Auth UID of the seller
  status: CarAdStatus;
  
  // Car details
  manufacturer: string; // Hebrew name
  manufacturerId?: string | null; // Catalog ID if available
  model: string; // Hebrew name
  modelId?: string | null; // Catalog ID if available
  year: number;
  mileageKm: number;
  price: number;
  city: string;
  cityId?: string | null;
  regionId?: string | null;
  
  // Additional details
  gearboxType?: string | null;
  fuelType?: string | null;
  color?: string | null;
  handCount?: number | null;
  engineDisplacementCc?: number | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  
  // Images
  imageUrls?: string[]; // Array of Storage URLs
  mainImageUrl?: string | null; // First image or selected main image
  
  // Metadata
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  viewsCount?: number; // Number of views (for stats)
}

