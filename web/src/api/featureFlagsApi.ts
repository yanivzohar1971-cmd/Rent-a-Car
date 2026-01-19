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
        const data = snapshot.data() as FeatureFlags;
        callback({
          enablePublicCarDebugButton: data.enablePublicCarDebugButton ?? false,
          enablePublicCarDebugOverlay: data.enablePublicCarDebugOverlay ?? false,
          lastUpdatedAt: data.lastUpdatedAt,
          updatedBy: data.updatedBy,
        });
      } else {
        // Document doesn't exist yet, return defaults
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
 */
export async function setFeatureFlag(
  partial: Partial<FeatureFlags>,
  userEmail?: string,
  userUid?: string
): Promise<void> {
  const docRef = doc(db, FEATURE_FLAGS_DOC_PATH);
  
  await setDoc(
    docRef,
    {
      ...partial,
      lastUpdatedAt: serverTimestamp(),
      updatedBy: userEmail ?? userUid ?? 'unknown',
    },
    { merge: true }
  );
}
