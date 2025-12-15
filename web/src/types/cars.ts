/**
 * Car data model types for CarExpert web app
 * 
 * This file defines the canonical types for:
 * - YardCarMaster: The source of truth stored in users/{yardUid}/carSales/{carId}
 * - PublicCar: The public projection stored in publicCars/{carId}
 * 
 * These types enforce the MASTER + PUBLIC separation model.
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
  
  /** Sale status */
  saleStatus?: 'ACTIVE' | 'SOLD';
  
  /** Sold timestamp */
  soldAt?: number | null;
  
  /** Sold price (optional) */
  soldPrice?: number | null;
  
  /** Sold note (optional) */
  soldNote?: string | null;
  
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
  
  /** Promotion state (from MASTER) */
  promotion?: import('./Promotion').CarPromotionState;
  highlightLevel?: 'none' | 'basic' | 'plus' | 'premium' | 'platinum' | 'diamond';
  
  /** Legacy fields (for backward compatibility when reading) */
  brandId?: string | null;
  brandText?: string | null;
  modelId?: string | null;
  modelText?: string | null;
  salePrice?: number | null;
  gearboxType?: string | null; // Alias for gearType
}

/**
 * Public Car Projection (PUBLIC)
 * 
 * This is the public-facing projection derived from YardCarMaster.
 * Stored in: publicCars/{carId}
 * 
 * The carId must match the MASTER carId.
 * Contains only fields needed for listing, filtering, and basic display.
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
  highlightLevel: 'none' | 'basic' | 'plus' | 'premium' | 'platinum' | 'diamond';
  
  /** Promotion state (from PUBLIC projection) */
  promotion?: import('./Promotion').CarPromotionState;
  
  /** Search/display fields */
  brand: string | null;
  model: string | null;
  year: number | null;
  mileageKm: number | null;
  price: number | null;
  gearType: string | null;
  fuelType: string | null;
  cityNameHe: string | null;
  city?: string | null; // Buyer reads data.city in several places
  
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
 * Legacy YardCar type (for backward compatibility)
 * 
 * This type is used during the transition period.
 * New code should use YardCarMaster.
 * 
 * @deprecated Use YardCarMaster instead
 */
export interface YardCar {
  id: string;
  yardUid?: string;
  ownerType?: 'yard';
  status?: 'draft' | 'published' | 'archived';
  publicationStatus?: 'DRAFT' | 'HIDDEN' | 'PUBLISHED';
  saleStatus?: 'ACTIVE' | 'SOLD';
  soldAt?: number | null;
  soldPrice?: number | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  mileageKm?: number | null;
  price?: number | null;
  salePrice?: number | null;
  gearType?: string | null;
  gearboxType?: string | null;
  fuelType?: string | null;
  bodyType?: string | null;
  color?: string | null;
  imageUrls?: string[];
  mainImageUrl?: string | null;
  imageCount?: number;
  city?: string | null;
  notes?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  publicCarId?: string | null;
  [key: string]: any; // Allow additional legacy fields
}

