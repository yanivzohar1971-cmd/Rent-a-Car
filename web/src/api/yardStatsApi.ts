import { collection, getDocsFromServer, query } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { fetchYardCarsForUser } from './yardFleetApi';
import { fetchLeadsForYard } from './leadsApi';
import type { CarPublicationStatus } from './yardPublishApi';

/**
 * Car status type (reused from existing types)
 */
export type CarStatus = CarPublicationStatus;

/**
 * Yard car statistics
 */
export interface YardCarStats {
  carId: string;
  yardUid: string;
  modelLabel: string; // e.g., "סקודה אוקטביה 2018"
  status: CarStatus;
  createdAt?: Date;
  publishedAt?: Date;
  mileage?: number;
  price?: number;
  viewsCount: number;
  leadsCount: number;
  daysLive?: number;
}

/**
 * Yard statistics summary
 */
export interface YardStatsSummary {
  totalCars: number;
  publishedCars: number;
  hiddenCars: number;
  soldCars: number;
  totalViews: number;
  totalLeads: number;
  avgViewsPerPublishedCar: number;
  avgLeadsPerPublishedCar: number;
}

/**
 * Yard statistics result
 */
export interface YardStatsResult {
  summary: YardStatsSummary;
  cars: YardCarStats[];
}

/**
 * Convert Firestore timestamp to Date
 */
function convertTimestamp(timestamp: any): Date | undefined {
  if (!timestamp) return undefined;
  try {
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Fetch yard statistics
 * Combines data from carSales, leads, and view counts
 */
export async function fetchYardStats(yardUid: string): Promise<YardStatsResult> {
  try {
    // Fetch cars
    const cars = await fetchYardCarsForUser();

    // Fetch leads from canonical leads collection
    const leads = await fetchLeadsForYard(yardUid);

    // Build leads count map (use lead.carId)
    const leadsCountByCarId: Record<string, number> = {};
    leads.forEach((lead) => {
      const carId = lead.carId;
      if (carId) {
        leadsCountByCarId[carId] = (leadsCountByCarId[carId] || 0) + 1;
      }
    });

    // Map cars to stats (createdAt, publishedAt, daysLive will be set after fetching Firestore docs)
    const carStats: YardCarStats[] = cars.map((car) => {

      // Build model label
      const brand = car.brandText || car.brand || '';
      const model = car.modelText || car.model || '';
      const year = car.year ? car.year.toString() : '';
      const modelLabel = [brand, model, year].filter(Boolean).join(' ') || 'רכב ללא פרטים';

      return {
        carId: car.id,
        yardUid,
        modelLabel,
        status: (car.publicationStatus || 'DRAFT') as CarStatus,
        createdAt: undefined, // Will be set from Firestore doc
        publishedAt: undefined, // Will be set from Firestore doc if available
        mileage: car.mileageKm || undefined,
        price: car.price || car.salePrice || undefined,
        viewsCount: 0, // Will be updated from Firestore doc
        leadsCount: leadsCountByCarId[car.id] || 0,
        daysLive: undefined, // Will be calculated after fetching Firestore docs
      };
    });

    // Fetch viewsCount, createdAt, publishedAt for each car from Firestore
    const carSalesRef = collection(db, 'users', yardUid, 'carSales');
    const carSalesSnapshot = await getDocsFromServer(query(carSalesRef));

    // Build maps for viewsCount, createdAt, publishedAt
    const viewsCountByCarId: Record<string, number> = {};
    const createdAtByCarId: Record<string, Date | undefined> = {};
    const publishedAtByCarId: Record<string, Date | undefined> = {};

    carSalesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const viewsCount = typeof data.viewsCount === 'number' ? data.viewsCount : 0;
      viewsCountByCarId[doc.id] = viewsCount;

      // Extract createdAt and publishedAt
      const createdAt = convertTimestamp(data.createdAt);
      const publishedAt = data.publishedAt ? convertTimestamp(data.publishedAt) : undefined;
      createdAtByCarId[doc.id] = createdAt;
      publishedAtByCarId[doc.id] = publishedAt;
    });

    // Update carStats with viewsCount, createdAt, publishedAt, and calculate daysLive
    const now = new Date();
    carStats.forEach((stat) => {
      stat.viewsCount = viewsCountByCarId[stat.carId] || 0;
      stat.createdAt = createdAtByCarId[stat.carId];
      stat.publishedAt = publishedAtByCarId[stat.carId];

      // Calculate daysLive
      if (stat.publishedAt) {
        stat.daysLive = daysBetween(stat.publishedAt, now);
      } else if (stat.createdAt) {
        // Fallback to createdAt if publishedAt is not available
        stat.daysLive = daysBetween(stat.createdAt, now);
      }
    });

    // Calculate summary
    const totalCars = carStats.length;
    const publishedCars = carStats.filter((c) => c.status === 'PUBLISHED').length;
    const hiddenCars = carStats.filter((c) => c.status === 'HIDDEN').length;
    const soldCars = 0; // SOLD status not in current enum
    const totalViews = carStats.reduce((sum, c) => sum + c.viewsCount, 0);
    const totalLeads = carStats.reduce((sum, c) => sum + c.leadsCount, 0);

    const avgViewsPerPublishedCar =
      publishedCars > 0 ? Math.round((totalViews / publishedCars) * 10) / 10 : 0;
    const avgLeadsPerPublishedCar =
      publishedCars > 0 ? Math.round((totalLeads / publishedCars) * 10) / 10 : 0;

    const summary: YardStatsSummary = {
      totalCars,
      publishedCars,
      hiddenCars,
      soldCars,
      totalViews,
      totalLeads,
      avgViewsPerPublishedCar,
      avgLeadsPerPublishedCar,
    };

    return {
      summary,
      cars: carStats,
    };
  } catch (error) {
    console.error('Error fetching yard stats:', error);
    throw error;
  }
}

