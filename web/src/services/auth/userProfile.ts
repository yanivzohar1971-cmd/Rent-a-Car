/**
 * User Profile Service - Ensures Firestore user documents exist and match Android schema
 * 
 * This service ensures that web signup/sign-in creates Firestore documents identical to Android,
 * including all role fields, capability flags, and status fields.
 */

import type { User as FirebaseUser } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

/**
 * Role type matching Android PrimaryRole enum
 */
export type PrimaryRole = 'PRIVATE_USER' | 'AGENT' | 'YARD' | 'ADMIN';

/**
 * User profile data for writing to Firestore (matches Android UserProfile schema)
 */
export interface UserProfileWrite {
  uid: string;
  email: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  createdAt: number; // milliseconds timestamp
  lastLoginAt: number; // milliseconds timestamp
  emailVerified: boolean;
  
  // Legacy role field
  role: string; // "AGENT" | "USER"
  
  // Capability flags
  isPrivateUser: boolean;
  canBuy: boolean;
  canSell: boolean;
  isAgent: boolean;
  isYard: boolean;
  
  // Status
  status: string; // "ACTIVE" | "PENDING_APPROVAL" | etc.
  
  // Role system fields
  primaryRole: string; // "PRIVATE_USER" | "AGENT" | "YARD" | "ADMIN"
  requestedRole?: string | null; // "AGENT" | "YARD" | null
  roleStatus: string; // "NONE" | "PENDING" | "APPROVED" | "REJECTED"
}

/**
 * Build user profile payload matching Android signup logic exactly
 * 
 * @param firebaseUser - Firebase Auth user object
 * @param displayName - User's display name (from form or Google account)
 * @param phoneNumber - User's phone number (from form, optional)
 * @param selectedPrimaryRole - Selected role from UI (defaults to PRIVATE_USER if not provided)
 * @returns UserProfileWrite object ready for Firestore
 */
export function buildUserProfileForWrite(
  firebaseUser: FirebaseUser,
  displayName?: string | null,
  phoneNumber?: string | null,
  selectedPrimaryRole: PrimaryRole = 'PRIVATE_USER'
): UserProfileWrite {
  // Normalize email (trim + lowercase)
  const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase();
  
  // Determine if role requires approval (AGENT or YARD are privileged)
  const isPrivileged = selectedPrimaryRole === 'AGENT' || selectedPrimaryRole === 'YARD';
  
  // Set role fields based on Android logic
  let actualPrimaryRole: string;
  let requestedRole: string | null;
  let roleStatus: string;
  let status: string;
  
  if (isPrivileged) {
    // For privileged roles, set as request pending approval
    actualPrimaryRole = 'PRIVATE_USER'; // Default to PRIVATE_USER until approved
    requestedRole = selectedPrimaryRole;
    roleStatus = 'PENDING';
    status = 'PENDING_APPROVAL';
  } else {
    // For non-privileged roles (PRIVATE_USER), set immediately
    actualPrimaryRole = 'PRIVATE_USER';
    requestedRole = null;
    roleStatus = 'NONE';
    status = 'ACTIVE';
  }
  
  // Map primaryRole to legacy fields for backward compatibility
  const isAgent = selectedPrimaryRole === 'AGENT';
  const isYard = selectedPrimaryRole === 'YARD';
  const isPrivateUser = selectedPrimaryRole === 'PRIVATE_USER';
  
  // All users can buy and sell by default (capabilities, not roles)
  const canBuy = true;
  const canSell = true;
  
  // Legacy role field
  const role = isAgent ? 'AGENT' : 'USER';
  
  return {
    uid: firebaseUser.uid,
    email: normalizedEmail,
    displayName: displayName || firebaseUser.displayName || null,
    phoneNumber: phoneNumber || null,
    createdAt: Date.now(), // Will only be set if doc doesn't exist
    lastLoginAt: Date.now(), // Always update
    emailVerified: firebaseUser.emailVerified || false,
    role,
    isPrivateUser,
    canBuy,
    canSell,
    isAgent,
    isYard,
    status,
    primaryRole: actualPrimaryRole,
    requestedRole,
    roleStatus,
  };
}

/**
 * Ensure user document exists in Firestore /users/{uid} with merge semantics
 * 
 * This function:
 * - Reads existing doc if present
 * - If doc doesn't exist: writes full payload including createdAt
 * - If doc exists: merges only safe fields (lastLoginAt, emailVerified, displayName/phoneNumber if missing)
 * - Does NOT overwrite admin-managed fields (primaryRole, requestedRole, roleStatus, status) if already present
 * 
 * @param firestore - Firestore instance
 * @param uid - User ID
 * @param payload - User profile payload from buildUserProfileForWrite
 * @returns Promise that resolves when doc is written
 */
export async function ensureUserDocExistsOrMerge(
  firestore: Firestore,
  uid: string,
  payload: UserProfileWrite
): Promise<void> {
  const { doc, getDoc, setDoc } = await import('firebase/firestore');
  
  const userRef = doc(firestore, 'users', uid);
  
  try {
    // Read existing doc
    const existingDoc = await getDoc(userRef);
    
    if (!existingDoc.exists()) {
      // Doc doesn't exist: write full payload including createdAt
      console.log(`[userProfile] Creating new user doc: ${uid}`);
      await setDoc(userRef, payload, { merge: true });
      console.log(`[userProfile] Created user doc: ${uid}, primaryRole=${payload.primaryRole}, requestedRole=${payload.requestedRole || 'null'}`);
    } else {
      // Doc exists: merge only safe fields
      const existingData = existingDoc.data();
      
      // Build merge payload: only update safe fields, preserve admin-managed fields
      const mergePayload: Partial<UserProfileWrite> = {
        lastLoginAt: payload.lastLoginAt, // Always update
        emailVerified: payload.emailVerified, // Always update
      };
      
      // Only update displayName/phoneNumber if missing in existing doc
      if (!existingData.displayName && payload.displayName) {
        mergePayload.displayName = payload.displayName;
      }
      if (!existingData.phoneNumber && payload.phoneNumber) {
        mergePayload.phoneNumber = payload.phoneNumber;
      }
      
      // Only set role fields if they don't exist (first-time creation scenario)
      // This preserves admin-managed role changes
      if (!existingData.primaryRole) {
        mergePayload.primaryRole = payload.primaryRole;
        mergePayload.requestedRole = payload.requestedRole;
        mergePayload.roleStatus = payload.roleStatus;
        mergePayload.status = payload.status;
        mergePayload.isAgent = payload.isAgent;
        mergePayload.isYard = payload.isYard;
        mergePayload.isPrivateUser = payload.isPrivateUser;
        mergePayload.role = payload.role;
      }
      
      // Always ensure capability flags exist
      if (existingData.canBuy === undefined) {
        mergePayload.canBuy = payload.canBuy;
      }
      if (existingData.canSell === undefined) {
        mergePayload.canSell = payload.canSell;
      }
      
      console.log(`[userProfile] Merging user doc: ${uid}, fields=${Object.keys(mergePayload).join(',')}`);
      await setDoc(userRef, mergePayload, { merge: true });
      console.log(`[userProfile] Merged user doc: ${uid}`);
    }
  } catch (error: any) {
    // Log detailed error info for debugging
    const errorInfo = {
      uid,
      projectId: firestore.app.options.projectId,
      errorCode: error.code,
      errorMessage: error.message,
      stack: error.stack,
    };
    
    console.error('[userProfile] Failed to ensure user doc exists:', errorInfo);
    
    // Re-throw with context
    throw new Error(
      `Failed to create/update user document in Firestore: ${error.message} ` +
      `(uid=${uid}, projectId=${firestore.app.options.projectId})`
    );
  }
}

