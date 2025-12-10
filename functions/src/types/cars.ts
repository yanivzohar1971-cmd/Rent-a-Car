/**
 * Car data model types for Cloud Functions backend
 * 
 * These types align with the web-side types in web/src/types/cars.ts
 * to ensure consistency between frontend and backend.
 */

/**
 * Yard Car Master (MASTER)
 * 
 * This is the single source of truth for yard inventory.
 * Stored in: users/{yardUid}/carSales/{carId}
 * 
 * The document ID (carId) must match the id field.
 */
export interface YardCarMaster {
  /** Document ID (carId) - must match Firestore doc.id */
  id: string;
  
  /** Yard owner's Firebase Auth UID */
  yardUid: string;
  
  /** Owner type - always 'yard' for yard cars */
  ownerType: 'yard';
  
  /** Publication status */
  status: 'draft' | 'published' | 'archived';
  
  /** Car identity fields */
  brand: string | null;
  model: string | null;
  year: number | null;
  mileageKm: number | null;
  
  /** Pricing */
  price: number | null;
  currency?: string | null;
  
  /** Technical details */
  gearType: string | null;
  fuelType: string | null;
  bodyType: string | null;
  color: string | null;
  engineDisplacementCc?: number | null;
  horsepower?: number | null;
  numberOfGears?: number | null;
  handCount?: number | null;
  
  /** Images - canonical format */
  imageUrls: string[];
  mainImageUrl: string | null;
  
  /** Location */
  city?: string | null;
  cityNameHe?: string | null;
  cityId?: string | null;
  regionId?: string | null;
  regionNameHe?: string | null;
  
  /** Additional fields */
  notes?: string | null;
  licensePlatePartial?: string | null;
  
  /** Timestamps */
  createdAt?: number | null;
  updatedAt?: number | null;
  
  /** Legacy fields (for backward compatibility when reading) */
  brandId?: string | null;
  brandText?: string | null;
  modelId?: string | null;
  modelText?: string | null;
  salePrice?: number | null;
  gearboxType?: string | null; // Alias for gearType
  publicationStatus?: string | null; // Legacy: 'DRAFT' | 'HIDDEN' | 'PUBLISHED'
}

/**
 * Public Car Projection (PUBLIC)
 * 
 * This is the public-facing projection derived from YardCarMaster.
 * Stored in: publicCars/{carId}
 * 
 * The carId must match the MASTER carId.
 */
export interface PublicCar {
  /** Car ID (must match MASTER carId) */
  carId: string;
  
  /** Yard owner's Firebase Auth UID */
  yardUid: string;
  
  /** Owner type - always 'yard' for yard cars */
  ownerType: 'yard';
  
  /** Publication flags */
  isPublished: boolean;
  publishedAt: number | null;
  
  /** Highlight level for promotions */
  highlightLevel: 'none' | 'basic' | 'plus' | 'premium';
  
  /** Search/display fields */
  brand: string | null;
  model: string | null;
  year: number | null;
  mileageKm: number | null;
  price: number | null;
  gearType: string | null;
  fuelType: string | null;
  cityNameHe: string | null;
  
  /** Images - minimal subset for listing */
  mainImageUrl: string | null;
  imageUrls?: string[]; // Optional, small subset for listing if needed
  
  /** Additional listing fields */
  bodyType?: string | null;
  color?: string | null;
  
  /** Timestamps */
  createdAt?: number | null;
  updatedAt?: number | null;
}

/**
 * Import row normalized data (from Excel parsing)
 */
export interface ImportRowNormalized {
  license?: string | null;
  licenseClean?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  year?: number | null;
  mileage?: number | null;
  gear?: string | null;
  color?: string | null;
  engineCc?: number | null;
  ownership?: string | null;
  testUntil?: string | null;
  hand?: number | null;
  trim?: string | null;
  askPrice?: number | null;
  listPrice?: number | null;
}

