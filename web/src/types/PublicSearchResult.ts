/**
 * Seller type for public search results
 */
export type PublicSellerType = 'YARD' | 'AGENT' | 'PRIVATE';

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
  
  // Advanced details for Quick Specs
  handCount?: number | null;
  gearboxType?: string | null;
  engineDisplacementCc?: number | null;
  licensePlatePartial?: string | null;

  mainImageUrl?: string;
  imageUrls?: string[];

  // Additional metadata
  yardUid?: string; // For yard cars
  ownerUserId?: string; // For private seller ads
  yardName?: string | null; // Yard display name for badge
  yardDisplayName?: string | null; // Alias for yardName
  sellerDisplayName?: string | null; // Standard field name for seller name (YARD/AGENT)
  yardLogoUrl?: string | null; // Yard logo URL for badge
  sellerLogoUrl?: string | null; // Seller logo URL (alias for yardLogoUrl, for agents)
  // showSellerNameInBadge: undefined/null = true (default paid), false = hide name
  showSellerNameInBadge?: boolean; // Whether to show seller name in badge (false = hide, undefined/null = show)
  // showSellerLogoInBadge: undefined/null = true (default), false = hide logo
  showSellerLogoInBadge?: boolean; // Whether to show seller logo in badge (false = hide, undefined/null = show)
  
  // Flat contact + exposure (from publicCars projection; optional, backward compatible)
  yardPhone?: string | null;
  yardWhatsappPhone?: string | null;
  sellerPhone?: string | null;
  sellerWhatsappPhone?: string | null;
  showNameInBadge?: boolean;
  showLogo?: boolean;
  showPhone?: boolean;
  showWhatsapp?: boolean;
  showCity?: boolean;
  showAddress?: boolean;
  
  // Promotion state
  promotion?: import('./Promotion').CarPromotionState;
  
  // Yard promotion state (for yard cars only)
  yardPromotion?: import('./Promotion').YardPromotionState;
  
  // View count (from publicCars.viewsCount)
  viewsCount?: number | null;
  
  // Nested snapshots (from publicCars projection) - for debug JSON protocol
  yardSnapshot?: {
    yardName?: string | null;
    yardPhone?: string | null;
    yardWhatsapp?: string | null;
    yardLogoUrl?: string | null;
    yardAddress?: string | null;
    yardCity?: string | null;
  } | null;
  
  sellerSnapshot?: {
    sellerName?: string | null;
    sellerPhone?: string | null;
    sellerWhatsapp?: string | null;
    sellerLogoUrl?: string | null;
    sellerAddress?: string | null;
    sellerCity?: string | null;
  } | null;
}

