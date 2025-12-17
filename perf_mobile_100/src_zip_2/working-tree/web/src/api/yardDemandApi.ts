import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';

/**
 * Car demand entry (aggregated from saved searches)
 */
export interface CarDemandEntry {
  manufacturerId?: string;
  manufacturer?: string;
  modelId?: string;
  model?: string;
  searchCount: number;
  minYearFrom?: number;
  maxYearTo?: number;
  minPriceFrom?: number;
  maxPriceTo?: number;
}

/**
 * Fetch global demand data (aggregated from all active saved searches)
 * Returns demand by manufacturer/model
 */
export async function fetchGlobalDemand(): Promise<CarDemandEntry[]> {
  try {
    const getYardDemand = httpsCallable(functions, 'getYardDemand');
    const result = await getYardDemand();
    const data = result.data as { success: boolean; entries: CarDemandEntry[] };
    
    if (data.success && Array.isArray(data.entries)) {
      return data.entries;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching global demand:', error);
    throw error;
  }
}

