export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  phone: string;

  // Legacy role fields (optional on web)
  role?: string | null;

  // Capability flags
  canBuy: boolean;
  canSell: boolean;
  isAgent: boolean;
  isYard: boolean;

  status: string; // "ACTIVE" | "PENDING_APPROVAL" | "SUSPENDED" | etc.

  primaryRole?: string | null;      // "PRIVATE_USER" | "AGENT" | "YARD" | "ADMIN"
  requestedRole?: string | null;
  roleStatus?: string;              // "NONE" | "PENDING" | "APPROVED" | "REJECTED"
}

