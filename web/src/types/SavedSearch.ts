import type { CarFilters } from '../api/carsApi';
import type { PersonaView } from './Roles';

/**
 * Saved Search / Alert model
 * 
 * Firestore path: users/{userUid}/savedSearches/{savedSearchId}
 * 
 * Represents a user's saved car search that can trigger alerts when matching cars are published.
 */
export type SavedSearchType = 'CAR_FOR_SALE';

export interface SavedSearch {
  id: string;
  userUid: string;
  role: PersonaView; // 'BUYER' | 'SELLER' | 'AGENT' | 'YARD'
  type: SavedSearchType;
  filters: CarFilters; // JSON object with search criteria
  label: string; // Human-readable label (e.g. "טויוטה קורולה עד 2017 עד 60,000 ₪")
  active: boolean; // Whether alerts are currently active
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  lastNotifiedAt?: any; // Firestore Timestamp - last time we sent alerts for this search
}

