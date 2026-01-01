/**
 * JSON-LD Structured Data for Vehicle Detail Pages
 * 
 * Implements schema.org Product + Offer + Car types
 */

import type { Car } from '../../api/carsApi';

export interface VehicleJsonLdProps {
  car: Car;
  url: string;
  imageUrl?: string;
}

/**
 * Generate JSON-LD structured data for a vehicle
 * Only includes factual fields that are available
 */
export function generateVehicleJsonLd({
  car,
  url,
  imageUrl,
}: VehicleJsonLdProps): object {
  const base: any = {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Car'],
    name: `${car.manufacturerHe || ''} ${car.modelHe || ''}`.trim(),
    url,
  };

  // Brand
  if (car.manufacturerHe) {
    base.brand = {
      '@type': 'Brand',
      name: car.manufacturerHe,
    };
  }

  // Model
  if (car.modelHe) {
    base.model = car.modelHe;
  }

  // Vehicle Model Date (year)
  if (car.year && car.year > 1900 && car.year <= new Date().getFullYear() + 1) {
    base.vehicleModelDate = car.year.toString();
  }

  // Mileage
  if (car.km !== null && car.km !== undefined && car.km >= 0) {
    base.mileageFromOdometer = {
      '@type': 'QuantitativeValue',
      value: car.km,
      unitCode: 'KMT', // Kilometers
    };
  }

  // Fuel Type
  if (car.fuelType) {
    base.fuelType = car.fuelType;
    // Map common fuel types to schema.org values
    const fuelTypeMap: Record<string, string> = {
      'בנזין': 'https://schema.org/Gasoline',
      'דיזל': 'https://schema.org/DieselFuel',
      'היברידי': 'https://schema.org/HybridFuel',
      'חשמלי': 'https://schema.org/Electric',
    };
    if (fuelTypeMap[car.fuelType]) {
      base.fuelType = fuelTypeMap[car.fuelType];
    }
  }

  // Transmission
  if (car.gearboxType) {
    base.vehicleTransmission = car.gearboxType;
    // Map to schema.org values
    const transmissionMap: Record<string, string> = {
      'אוטומטית': 'https://schema.org/AutomaticTransmission',
      'ידנית': 'https://schema.org/ManualTransmission',
    };
    if (transmissionMap[car.gearboxType]) {
      base.vehicleTransmission = transmissionMap[car.gearboxType];
    }
  }

  // Body Type
  if (car.bodyType) {
    base.bodyType = car.bodyType;
  }

  // Image
  if (imageUrl) {
    base.image = imageUrl;
  } else if (car.mainImageUrl) {
    base.image = car.mainImageUrl;
  } else if (car.imageUrls && car.imageUrls.length > 0) {
    base.image = car.imageUrls[0];
  }

  // Offer (price)
  if (car.price !== null && car.price !== undefined && car.price > 0) {
    base.offers = {
      '@type': 'Offer',
      price: car.price,
      priceCurrency: 'ILS',
      availability: 'https://schema.org/InStock', // Assuming published cars are available
      url,
    };
  }

  return base;
}

/**
 * React component to inject JSON-LD script tag
 */
export function VehicleJsonLd({ car, url, imageUrl }: VehicleJsonLdProps) {
  const jsonLd = generateVehicleJsonLd({ car, url, imageUrl });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd, null, 2) }}
    />
  );
}

