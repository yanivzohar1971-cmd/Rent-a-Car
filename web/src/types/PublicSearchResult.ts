/**
 * Seller type for public search results
 */
export type PublicSellerType = 'YARD' | 'PRIVATE';

/**
 * Source of the search result
 */
export type SearchResultSource = 'PUBLIC_CAR' | 'CAR_AD';

/**
 * Unified search result item that can represent both yard cars and private seller ads
 */
export interface PublicSearchResultItem {
  id: string;
  source: SearchResultSource;
  sellerType: PublicSellerType;

  // Common fields used in the UI
  title: string; // e.g. "טויוטה קורולה 2018"
  manufacturerName: string;
  modelName: string;
  year?: number;
  mileageKm?: number;
  price?: number;
  city?: string;

  mainImageUrl?: string;
  imageUrls?: string[];

  // Additional metadata
  yardUid?: string; // For yard cars
  ownerUserId?: string; // For private seller ads
  
  // Promotion state
  promotion?: import('./Promotion').CarPromotionState;
  
  // Yard promotion state (for yard cars only)
  yardPromotion?: import('./Promotion').YardPromotionState;
}

