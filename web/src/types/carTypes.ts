/**
 * Car-related type definitions for the web frontend
 */

/**
 * Gearbox type
 */
export const GearboxType = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL: 'MANUAL',
  ROBOTIC: 'ROBOTIC',
  CVT: 'CVT',
} as const;

export type GearboxType = typeof GearboxType[keyof typeof GearboxType];

/**
 * Fuel type
 */
export const FuelType = {
  BENZIN: 'BENZIN',
  DIESEL: 'DIESEL',
  HYBRID: 'HYBRID',
  PLUG_IN: 'PLUG_IN',
  ELECTRIC: 'ELECTRIC',
} as const;

export type FuelType = typeof FuelType[keyof typeof FuelType];

/**
 * Body type
 */
export const BodyType = {
  SEDAN: 'SEDAN',
  HATCHBACK: 'HATCHBACK',
  SUV: 'SUV',
  COUPE: 'COUPE',
  CONVERTIBLE: 'CONVERTIBLE',
  WAGON: 'WAGON',
  VAN: 'VAN',
  PICKUP: 'PICKUP',
} as const;

export type BodyType = typeof BodyType[keyof typeof BodyType];

/**
 * Helper function to get Hebrew label for gearbox type
 */
export function getGearboxTypeLabel(type: GearboxType): string {
  const labels: Record<GearboxType, string> = {
    [GearboxType.AUTOMATIC]: 'אוטומטי',
    [GearboxType.MANUAL]: 'ידני',
    [GearboxType.ROBOTIC]: 'רובוטי',
    [GearboxType.CVT]: 'CVT',
  };
  return labels[type] || type;
}

/**
 * Helper function to get Hebrew label for fuel type
 */
export function getFuelTypeLabel(type: FuelType): string {
  const labels: Record<FuelType, string> = {
    [FuelType.BENZIN]: 'בנזין',
    [FuelType.DIESEL]: 'דיזל',
    [FuelType.HYBRID]: 'היברידי',
    [FuelType.PLUG_IN]: 'היברידי נטען',
    [FuelType.ELECTRIC]: 'חשמלי',
  };
  return labels[type] || type;
}

/**
 * Helper function to get Hebrew label for body type
 */
export function getBodyTypeLabel(type: BodyType): string {
  const labels: Record<BodyType, string> = {
    [BodyType.SEDAN]: 'סדאן',
    [BodyType.HATCHBACK]: 'האצ׳בק',
    [BodyType.SUV]: 'SUV',
    [BodyType.COUPE]: 'קופה',
    [BodyType.CONVERTIBLE]: 'קבריולה',
    [BodyType.WAGON]: 'וואגון',
    [BodyType.VAN]: 'ואן',
    [BodyType.PICKUP]: 'פיקאפ',
  };
  return labels[type] || type;
}

