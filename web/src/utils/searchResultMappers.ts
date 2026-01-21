import type { Car } from '../api/carsApi';
import type { CarAd } from '../types/CarAd';
import type { PublicSearchResultItem } from '../types/PublicSearchResult';

/**
 * Map a public car (from publicCars) to PublicSearchResultItem
 */
export function mapPublicCarToResultItem(car: Car): PublicSearchResultItem {
  const title = `${car.year} ${car.manufacturerHe} ${car.modelHe}`;
  
  // CRITICAL: Read identity with strict priority (snapshots first, then flat fields)
  // This ensures we use the latest snapshot data from publicCars projection
  const carAny = car as any;
  
  // Priority 1: yardSnapshot fields (nested object from projection)
  const yardSnap = carAny.yardSnapshot && typeof carAny.yardSnapshot === 'object' ? carAny.yardSnapshot : null;
  // Priority 2: sellerSnapshot fields (nested object from projection)
  const sellerSnap = carAny.sellerSnapshot && typeof carAny.sellerSnapshot === 'object' ? carAny.sellerSnapshot : null;
  // Priority 3: flat fields (backward compatibility)
  
  // Resolve seller name: snapshot first, then flat fields
  const sellerName = 
    yardSnap?.yardName || 
    sellerSnap?.sellerName || 
    carAny.sellerDisplayName || 
    car.yardDisplayName || 
    car.yardName || 
    null;
  
  // Resolve logo URL: snapshot first, then flat fields
  const sellerLogoUrl = 
    yardSnap?.yardLogoUrl || 
    sellerSnap?.sellerLogoUrl || 
    car.sellerLogoUrl || 
    car.yardLogoUrl || 
    null;
  
  // Map exposure flags from publicCars projection
  // showNameInBadge: false = hide name, undefined/null = show (default)
  const showSellerNameInBadge = carAny.showNameInBadge === false ? false : undefined;
  // showLogo: false = hide logo, undefined/null = show (default)
  const showSellerLogoInBadge = carAny.showLogo === false ? false : undefined;
  
  return {
    id: car.id,
    source: 'PUBLIC_CAR',
    title,
    manufacturerName: car.manufacturerHe,
    modelName: car.modelHe,
    year: car.year,
    mileageKm: car.km,
    price: car.price,
    city: car.city,
    mainImageUrl: car.mainImageUrl || (car.imageUrls && car.imageUrls.length > 0 ? car.imageUrls[0] : undefined),
    imageUrls: car.imageUrls,
    yardUid: car.yardUid,
    promotion: car.promotion ?? undefined, // Pass through promotion from publicCars
    yardPromotion: undefined, // Will be populated from yard profile when available
    // Advanced details
    handCount: car.handCount ?? null,
    gearboxType: car.gearboxType ?? null,
    engineDisplacementCc: car.engineDisplacementCc ?? null,
    licensePlatePartial: car.licensePlatePartial ?? null,
    // Yard info: use resolved values from snapshots/flat fields
    yardName: sellerName,
    yardDisplayName: sellerName,
    sellerDisplayName: sellerName,
    yardLogoUrl: sellerLogoUrl,
    sellerLogoUrl: sellerLogoUrl,
    // Exposure flags: mapped from publicCars projection
    showSellerNameInBadge,
    showSellerLogoInBadge,
    sellerType: car.sellerType ?? 'YARD', // Default to YARD for backward compatibility
    // View count
    viewsCount: car.viewsCount ?? null,
  };
}

/**
 * Map a CarAd to PublicSearchResultItem
 */
export function mapCarAdToResultItem(ad: CarAd): PublicSearchResultItem {
  const title = `${ad.year} ${ad.manufacturer} ${ad.model}`;
  
  return {
    id: ad.id,
    source: 'CAR_AD',
    sellerType: 'PRIVATE',
    title,
    manufacturerName: ad.manufacturer,
    modelName: ad.model,
    year: ad.year,
    mileageKm: ad.mileageKm,
    price: ad.price,
    city: ad.city,
    mainImageUrl: ad.mainImageUrl || (ad.imageUrls && ad.imageUrls.length > 0 ? ad.imageUrls[0] : undefined),
    imageUrls: ad.imageUrls,
    ownerUserId: ad.ownerUserId,
    promotion: ad.promotion, // Include promotion state for badges and sorting
    // Advanced details
    handCount: ad.handCount ?? null,
    gearboxType: ad.gearboxType ?? null,
    engineDisplacementCc: ad.engineDisplacementCc ?? null,
    licensePlatePartial: null, // CarAd doesn't have licensePlatePartial
    // View count (if available)
    viewsCount: ad.viewsCount ?? null,
  };
}

