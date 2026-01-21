/**
 * Feature Flags API
 * 
 * Admin-controlled feature flags stored in publicConfig/features.
 * Public users can read; only admins can update.
 */

import { db, doc, onSnapshot, setDoc, serverTimestamp } from '../firebase/firebaseClient';

export interface FeatureFlags {
  enablePublicCarDebugButton: boolean;
  enablePublicCarDebugOverlay: boolean;
  lastUpdatedAt?: any;
  updatedBy?: string;
}

const FEATURE_FLAGS_DOC_PATH = 'publicConfig/features';

const DEFAULT_FLAGS: FeatureFlags = {
  enablePublicCarDebugButton: false,
  enablePublicCarDebugOverlay: false,
};

/**
 * Subscribe to feature flags (real-time)
 * Returns unsubscribe function
 */
export function subscribeFeatureFlags(
  callback: (flags: FeatureFlags) => void
): () => void {
  const docRef = doc(db, FEATURE_FLAGS_DOC_PATH);
  
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        // Normalize boolean values (handle string "true"/"false" edge cases from Firestore)
        const normalizeBoolean = (value: any): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') return value === 'true' || value === '1';
          if (typeof value === 'number') return value !== 0;
          return false;
        };
        
        callback({
          enablePublicCarDebugButton: normalizeBoolean(data.enablePublicCarDebugButton),
          enablePublicCarDebugOverlay: normalizeBoolean(data.enablePublicCarDebugOverlay),
          lastUpdatedAt: data.lastUpdatedAt,
          updatedBy: data.updatedBy,
        });
      } else {
        // Document doesn't exist yet, return defaults
        if (import.meta.env.DEV) {
          console.warn('[featureFlagsApi] Document publicConfig/features does not exist, using defaults');
        }
        callback(DEFAULT_FLAGS);
      }
    },
    (error) => {
      console.error('[featureFlagsApi] Error subscribing to feature flags:', error);
      callback(DEFAULT_FLAGS);
    }
  );
}

/**
 * Update feature flags (admin only)
 * Merges partial updates and adds metadata
 * CRITICAL: Ensures boolean values are written as booleans, not strings
 */
export async function setFeatureFlag(
  partial: Partial<FeatureFlags>,
  userEmail?: string,
  userUid?: string
): Promise<void> {
  const docRef = doc(db, FEATURE_FLAGS_DOC_PATH);
  
  // Normalize boolean values to ensure they're actual booleans, not strings
  const normalized: any = {};
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'enablePublicCarDebugButton' || key === 'enablePublicCarDebugOverlay') {
      // Force boolean conversion (handle string "true"/"false" edge cases)
      normalized[key] = value === true || value === 'true' || value === 1;
    } else {
      normalized[key] = value;
    }
  }
  
  await setDoc(
    docRef,
    {
      ...normalized,
      lastUpdatedAt: serverTimestamp(),
      updatedBy: userEmail ?? userUid ?? 'unknown',
    },
    { merge: true }
  );
}
