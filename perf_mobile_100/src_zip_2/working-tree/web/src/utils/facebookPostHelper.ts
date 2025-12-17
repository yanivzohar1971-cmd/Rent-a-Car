/**
 * Facebook Post Helper for Smart Promotion / פרסום חכם
 *
 * This module generates ready-to-use Hebrew Facebook post text for car listings.
 * It's a pure TypeScript module with no React dependencies.
 *
 * Usage:
 *   import { buildFacebookPostText, type FacebookPostContext } from './facebookPostHelper';
 *   const postText = buildFacebookPostText({ car, yard, contactPhone, websiteUrl });
 */

/**
 * Minimal car interface for Facebook post generation.
 * Compatible with YardCar, Car, CarAd, and other car types in the project.
 */
export interface CarLike {
  /** Brand/manufacturer name in Hebrew or English */
  brandText?: string;
  brand?: string;
  /** Model name */
  modelText?: string;
  model?: string;
  /** Model year */
  year?: number | null;
  /** Sale price in ILS */
  price?: number;
  salePrice?: number;
  /** Mileage in kilometers */
  mileageKm?: number | null;
  /** Gearbox type (אוטומט/ידני/etc) */
  gearboxType?: string | null;
  /** Fuel type (בנזין/דיזל/היברידי/חשמלי/etc) */
  fuelType?: string | null;
  /** Ownership count (יד 1, יד 2, etc) */
  handCount?: number | null;
  /** City location */
  city?: string | null;
  /** Color */
  color?: string | null;
  /** Engine size in CC */
  engineDisplacementCc?: number | null;
  /** Additional notes/description */
  notes?: string | null;
}

/**
 * Yard/dealer info for the post
 */
export interface YardLike {
  /** Yard display name */
  name?: string;
  displayName?: string;
  yardName?: string;
  /** Yard city */
  city?: string;
}

/**
 * Context for generating a Facebook post
 */
export interface FacebookPostContext {
  /** Car data to include in the post */
  car: CarLike;
  /** Optional yard/dealer info */
  yard?: YardLike | null;
  /** Contact phone number */
  contactPhone?: string;
  /** Public URL to the car listing page */
  websiteUrl?: string;
  /** Optional Instagram profile URL */
  instagramUrl?: string;
}

/**
 * Format a number with thousands separators for Hebrew locale
 */
function formatNumber(num: number): string {
  return num.toLocaleString('he-IL');
}

/**
 * Format price in ILS with symbol
 */
function formatPrice(price: number): string {
  return `₪${formatNumber(price)}`;
}

/**
 * Get the yard name from various possible fields
 */
function getYardName(yard?: YardLike | null): string | null {
  if (!yard) return null;
  return yard.yardName || yard.displayName || yard.name || null;
}

/**
 * Get the car brand from various possible fields
 */
function getCarBrand(car: CarLike): string {
  return car.brandText || car.brand || '';
}

/**
 * Get the car model from various possible fields
 */
function getCarModel(car: CarLike): string {
  return car.modelText || car.model || '';
}

/**
 * Get the car price from various possible fields
 */
function getCarPrice(car: CarLike): number | null {
  return car.price || car.salePrice || null;
}

/**
 * Build the hand count text (יד 1, יד 2, etc.)
 */
function getHandText(handCount: number): string {
  if (handCount === 1) return 'יד ראשונה';
  if (handCount === 2) return 'יד שנייה';
  if (handCount === 3) return 'יד שלישית';
  return `יד ${handCount}`;
}

/**
 * Builds a high-quality Hebrew Facebook post text for a car listing.
 *
 * The generated post includes:
 * - Car title (brand, model, year)
 * - Key specs (fuel, gearbox, mileage, ownership)
 * - Price
 * - Yard/seller info
 * - Contact details
 * - Website link
 *
 * @param ctx - The context containing car, yard, and contact info
 * @returns A multi-line Hebrew string ready to paste into Facebook
 */
export function buildFacebookPostText(ctx: FacebookPostContext): string {
  const { car, yard, contactPhone, websiteUrl, instagramUrl } = ctx;

  const lines: string[] = [];

  // === Title line ===
  const brand = getCarBrand(car);
  const model = getCarModel(car);
  const year = car.year;
  const titleParts = [brand, model, year].filter(Boolean);
  const titleText = titleParts.length > 0 ? titleParts.join(' ') : 'רכב';
  lines.push(`🚗 ${titleText} למכירה`);
  lines.push(''); // Empty line after title

  // === Specs section ===
  const specs: string[] = [];

  // Fuel type
  if (car.fuelType) {
    specs.push(`✔️ סוג דלק: ${car.fuelType}`);
  }

  // Gearbox
  if (car.gearboxType) {
    specs.push(`✔️ תיבת הילוכים: ${car.gearboxType}`);
  }

  // Engine size
  if (car.engineDisplacementCc && car.engineDisplacementCc > 0) {
    specs.push(`✔️ נפח מנוע: ${formatNumber(car.engineDisplacementCc)} סמ"ק`);
  }

  // Mileage
  if (car.mileageKm && car.mileageKm > 0) {
    specs.push(`✔️ ק"מ: ${formatNumber(car.mileageKm)} ק"מ`);
  }

  // Hand count
  if (car.handCount && car.handCount > 0) {
    specs.push(`✔️ בעלות: ${getHandText(car.handCount)}`);
  }

  // Color
  if (car.color) {
    specs.push(`✔️ צבע: ${car.color}`);
  }

  // City
  if (car.city) {
    specs.push(`✔️ מיקום: ${car.city}`);
  }

  if (specs.length > 0) {
    lines.push(...specs);
    lines.push(''); // Empty line after specs
  }

  // === Price ===
  const price = getCarPrice(car);
  if (price && price > 0) {
    lines.push(`💰 מחיר מבוקש: ${formatPrice(price)}`);
    lines.push('');
  }

  // === Yard info ===
  const yardName = getYardName(yard);
  if (yardName) {
    lines.push(`📍 מגרש: ${yardName}`);
  }

  // === Contact ===
  if (contactPhone) {
    lines.push(`📞 טלפון: ${contactPhone}`);
  }

  // === Links section ===
  if (websiteUrl || instagramUrl) {
    lines.push('');
    if (websiteUrl) {
      lines.push('🔗 פרטים מלאים ותמונות נוספות:');
      lines.push(websiteUrl);
    }
    if (instagramUrl) {
      lines.push('');
      lines.push(`📸 עקבו אחרינו באינסטגרם: ${instagramUrl}`);
    }
  }

  // === Call to action ===
  lines.push('');
  lines.push('📱 אפשר לפנות גם בוואטסאפ');

  return lines.join('\n');
}

