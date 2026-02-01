import type { Car } from '../api/carsApi';
import type { CarAd } from '../types/CarAd';
import type { PublicSearchResultItem } from '../types/PublicSearchResult';
import { resolvePublicCarDisplay } from './resolvePublicCarDisplay';

/**
 * Map a public car (from publicCars) to PublicSearchResultItem
 * Uses resolvePublicCarDisplay for consistency with CarDetailsPage and cards.
 */
export function mapPublicCarToResultItem(car: Car): PublicSearchResultItem {
  const title = `${car.year} ${car.manufacturerHe} ${car.modelHe}`;
  const carAny = car as any;
  const yardSnap = carAny.yardSnapshot && typeof carAny.yardSnapshot === 'object' ? carAny.yardSnapshot : null;
  const sellerSnap = carAny.sellerSnapshot && typeof carAny.sellerSnapshot === 'object' ? carAny.sellerSnapshot : null;

  // Snapshot-first: align with CarDetailsPage and resolvePublicCarDisplay
  const resolved = resolvePublicCarDisplay(car);
  const sellerName = resolved.displayName;
  const yardLogoUrl = resolved.logoUrl ?? null;
  const yardPhone = resolved.phone;
  const yardWhatsappPhone = resolved.whatsapp;
  const sellerLogoUrl = resolved.logoUrl ?? null;
  const sellerPhone = resolved.phone;
  const sellerWhatsappPhone = resolved.whatsapp;
  
  // Map exposure flags from publicCars projection
  const showLogo = carAny.showLogo;
  const showPhone = carAny.showPhone;
  const showWhatsapp = carAny.showWhatsapp;
  const showNameInBadge = carAny.showNameInBadge;
  const showCity = carAny.showCity;
  const showAddress = carAny.showAddress;
  // showNameInBadge: false = hide name, undefined/null = show (default)
  const showSellerNameInBadge = showNameInBadge === false ? false : undefined;
  // showLogo: false = hide logo, undefined/null = show (default)
  const showSellerLogoInBadge = showLogo === false ? false : undefined;
  
  // CRITICAL: Pass through nested snapshots for card debug JSON protocol
  // These are the exact objects from publicCars projection
  const yardSnapshot = yardSnap ? {
    yardName: yardSnap.yardName || null,
    yardPhone: yardSnap.yardPhone || null,
    yardWhatsapp: yardSnap.yardWhatsapp || yardSnap.yardWhatsappPhone || null,
    yardLogoUrl: yardSnap.yardLogoUrl || null,
    yardAddress: yardSnap.yardAddress || null,
    yardCity: yardSnap.yardCity || null,
  } : null;
  
  const sellerSnapshot = sellerSnap ? {
    sellerName: sellerSnap.sellerName || null,
    sellerPhone: sellerSnap.sellerPhone || null,
    sellerWhatsapp: sellerSnap.sellerWhatsapp || sellerSnap.sellerWhatsappPhone || null,
    sellerLogoUrl: sellerSnap.sellerLogoUrl || null,
    sellerAddress: sellerSnap.sellerAddress || null,
    sellerCity: sellerSnap.sellerCity || null,
  } : null;

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
    yardLogoUrl: yardLogoUrl || sellerLogoUrl,
    sellerLogoUrl,
    yardPhone,
    yardWhatsappPhone,
    sellerPhone,
    sellerWhatsappPhone,
    // CRITICAL: Pass through nested snapshots for debug JSON protocol
    yardSnapshot: yardSnapshot as any,
    sellerSnapshot: sellerSnapshot as any,
    // Exposure flags: mapped from publicCars projection
    showSellerNameInBadge,
    showSellerLogoInBadge,
    showLogo: typeof showLogo === 'boolean' ? showLogo : undefined,
    showPhone: typeof showPhone === 'boolean' ? showPhone : undefined,
    showWhatsapp: typeof showWhatsapp === 'boolean' ? showWhatsapp : undefined,
    showNameInBadge: typeof showNameInBadge === 'boolean' ? showNameInBadge : undefined,
    showCity: typeof showCity === 'boolean' ? showCity : undefined,
    showAddress: typeof showAddress === 'boolean' ? showAddress : undefined,
    sellerType: car.sellerType ?? 'YARD', // Default to YARD for backward compatibility
    // View count: pass through (null when missing)
    viewsCount: typeof car.viewsCount === 'number' ? car.viewsCount : (carAny.viewsCount ?? null),
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

