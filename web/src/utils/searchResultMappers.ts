import type { Car } from '../api/carsApi';
import type { CarAd } from '../types/CarAd';
import type { PublicSearchResultItem } from '../types/PublicSearchResult';

/**
 * Map a public car (from publicCars) to PublicSearchResultItem
 */
export function mapPublicCarToResultItem(car: Car): PublicSearchResultItem {
  const title = `${car.year} ${car.manufacturerHe} ${car.modelHe}`;
  
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
    // Yard info from seller snapshot (publicCars)
    yardName: car.yardName ?? car.yardDisplayName ?? (car as any).sellerDisplayName ?? null,
    yardDisplayName: car.yardDisplayName ?? car.yardName ?? (car as any).sellerDisplayName ?? null,
    sellerDisplayName: (car as any).sellerDisplayName ?? car.yardDisplayName ?? car.yardName ?? null,
    yardLogoUrl: car.yardLogoUrl ?? null,
    sellerLogoUrl: car.sellerLogoUrl ?? car.yardLogoUrl ?? null,
    // showSellerNameInBadge: undefined/null = true (default paid), false = hide name
    showSellerNameInBadge: car.showSellerNameInBadge === false ? false : undefined,
    sellerType: car.sellerType ?? 'YARD', // Default to YARD for backward compatibility
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
  };
}

