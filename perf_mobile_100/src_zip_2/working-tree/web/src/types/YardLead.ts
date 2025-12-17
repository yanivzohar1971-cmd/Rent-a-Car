/**
 * Yard Lead Status
 * Minimal schema aligned with future-compatible design
 * NOTE: This is a new schema - no existing Android model found
 */
export type YardLeadStatus = 'NEW' | 'IN_PROGRESS' | 'CLOSED';

/**
 * Yard Lead interface
 * Represents an inquiry/contact request about a yard's car
 * 
 * Firestore path: users/{yardUid}/leads/{leadId}
 * 
 * NOTE: This is a new schema. If Android/Functions implement leads later,
 * this should be updated to match their exact field names and types.
 */
export interface YardLead {
  id: string;
  carId: string; // Reference to car in users/{yardUid}/carSales/{carId}
  yardUid: string; // Owner of the car/lead
  // Buyer/contact info
  name: string;
  phone: string;
  email?: string | null;
  message?: string | null;
  // Meta
  status: YardLeadStatus;
  createdAt: any; // Firestore Timestamp (will be converted to Date or number)
  updatedAt?: any; // Firestore Timestamp (optional)
}

