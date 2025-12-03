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
    sellerType: 'YARD',
    title,
    manufacturerName: car.manufacturerHe,
    modelName: car.modelHe,
    year: car.year,
    mileageKm: car.km,
    price: car.price,
    city: car.city,
    mainImageUrl: car.mainImageUrl,
    imageUrls: car.imageUrls,
    yardUid: car.yardUid,
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
  };
}

