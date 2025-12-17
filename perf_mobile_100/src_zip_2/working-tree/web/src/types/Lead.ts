import type { Timestamp } from 'firebase/firestore';

/**
 * Lead Status
 */
export type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'CLOSED' | 'LOST';

/**
 * Lead Source - where the lead came from
 */
export type LeadSource =
  | 'WEB_SEARCH'     // coming from general search results
  | 'YARD_QR'        // coming from /yard/:yardId QR mode
  | 'DIRECT_LINK'    // direct /car/:id link
  | 'OTHER';         // fallback

/**
 * Seller Type
 */
export type LeadSellerType = 'YARD' | 'PRIVATE';

/**
 * Lead interface
 * Represents a customer inquiry/lead for a car listing
 * 
 * Firestore path: leads/{leadId}
 */
export interface Lead {
  id: string;

  carId: string;
  carTitle: string; // normalized title to show in lists, e.g. "טויוטה קורולה 2018"

  sellerType: LeadSellerType;
  sellerId: string; // yardId if sellerType === 'YARD', sellerUserId if 'PRIVATE'

  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  note?: string | null;

  source: LeadSource;
  status: LeadStatus;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

