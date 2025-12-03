export type SubscriptionPlan = 'FREE' | 'PLUS' | 'PRO';

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
  isAdmin?: boolean; // Admin flag for platform owner

  status: string; // "ACTIVE" | "PENDING_APPROVAL" | "SUSPENDED" | etc.

  primaryRole?: string | null;      // "PRIVATE_USER" | "AGENT" | "YARD" | "ADMIN"
  requestedRole?: string | null;
  roleStatus?: string;              // "NONE" | "PENDING" | "APPROVED" | "REJECTED"
  
  subscriptionPlan?: SubscriptionPlan; // Subscription plan for billing/quota management
}

