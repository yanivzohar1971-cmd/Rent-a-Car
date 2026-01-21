/**
 * Feature Flags API
 * 
 * Admin-controlled feature flags stored in publicConfig/features.
 * Public users can read; only admins can update.
 */

import { db, doc, onSnapshot, setDoc, serverTimestamp } from '../firebase/firebaseClient';

export interface FeatureFlags {
  // DISTINCT flags: Cards vs CarDetails are separate
  enablePublicCarDebugButtonCards: boolean; // For listing cards (grid/list)
  enablePublicCarDebugButtonCarDetails: boolean; // For CarDetailsPage
  enablePublicCarDebugOverlayCards: boolean; // For listing cards overlay
  enableAdminSellerDebugger: boolean;
  enableAdminSellerDebugOverlay?: boolean; // Optional for future use
  // Legacy field (backward compatibility - maps to Cards only)
  enablePublicCarDebugButton?: boolean; // DEPRECATED: use enablePublicCarDebugButtonCards
  enablePublicCarDebugOverlay?: boolean; // DEPRECATED: use enablePublicCarDebugOverlayCards
  lastUpdatedAt?: any;
  updatedBy?: string;
}

const FEATURE_FLAGS_DOC_PATH = 'publicConfig/features';

const DEFAULT_FLAGS: FeatureFlags = {
  enablePublicCarDebugButtonCards: false,
  enablePublicCarDebugButtonCarDetails: false,
  enablePublicCarDebugOverlayCards: false,
  enableAdminSellerDebugger: false,
  enableAdminSellerDebugOverlay: false,
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
      // CRITICAL: Handle fromCache metadata to prevent stale false values
      // If snapshot is from cache and not yet from server, we still use it but log a warning
      const metadata = snapshot.metadata;
      const isFromCache = metadata.fromCache;
      
      if (snapshot.exists()) {
        const data = snapshot.data();
        // Normalize boolean values (handle string "true"/"false" edge cases from Firestore)
        const normalizeBoolean = (value: any): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') return value === 'true' || value === '1';
          if (typeof value === 'number') return value !== 0;
          return false;
        };
        
        // Backward compatibility: if legacy enablePublicCarDebugButton exists, map to Cards only
        const legacyDebugButton = data.enablePublicCarDebugButton !== undefined;
        const legacyDebugOverlay = data.enablePublicCarDebugOverlay !== undefined;
        
        const flags: FeatureFlags = {
          // New distinct flags (preferred)
          enablePublicCarDebugButtonCards: normalizeBoolean(
            data.enablePublicCarDebugButtonCards ?? 
            (legacyDebugButton ? data.enablePublicCarDebugButton : false)
          ),
          enablePublicCarDebugButtonCarDetails: normalizeBoolean(
            data.enablePublicCarDebugButtonCarDetails ?? false
          ),
          enablePublicCarDebugOverlayCards: normalizeBoolean(
            data.enablePublicCarDebugOverlayCards ?? 
            (legacyDebugOverlay ? data.enablePublicCarDebugOverlay : false)
          ),
          enableAdminSellerDebugger: normalizeBoolean(data.enableAdminSellerDebugger ?? false),
          enableAdminSellerDebugOverlay: normalizeBoolean(data.enableAdminSellerDebugOverlay ?? false),
          // Preserve legacy fields for backward compatibility (read-only)
          enablePublicCarDebugButton: legacyDebugButton ? normalizeBoolean(data.enablePublicCarDebugButton) : undefined,
          enablePublicCarDebugOverlay: legacyDebugOverlay ? normalizeBoolean(data.enablePublicCarDebugOverlay) : undefined,
          lastUpdatedAt: data.lastUpdatedAt,
          updatedBy: data.updatedBy,
        };
        
        // If from cache, still use the value but log for debugging
        if (isFromCache && import.meta.env.DEV) {
          console.log('[featureFlagsApi] Using cached flags (will update when server snapshot arrives):', flags);
        }
        
        callback(flags);
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
 * Update a single feature flag (admin only)
 * Dynamic per-flag updates to avoid full document replacement
 * CRITICAL: Ensures boolean values are written as booleans, not strings
 */
export async function setFeatureFlag(
  flagKey: keyof FeatureFlags,
  value: boolean,
  userEmail?: string,
  userUid?: string
): Promise<void> {
  const docRef = doc(db, FEATURE_FLAGS_DOC_PATH);
  
  // Normalize boolean value
  const booleanKeys = [
    'enablePublicCarDebugButtonCards',
    'enablePublicCarDebugButtonCarDetails',
    'enablePublicCarDebugOverlayCards',
    'enableAdminSellerDebugger',
    'enableAdminSellerDebugOverlay',
    'enablePublicCarDebugButton', // Legacy
    'enablePublicCarDebugOverlay', // Legacy
  ];
  
  const normalizedValue = booleanKeys.includes(flagKey)
    ? (value === true || String(value) === 'true' || Number(value) === 1)
    : value;
  
  // Dynamic update: only update the specific flag key
  await setDoc(
    docRef,
    {
      [flagKey]: normalizedValue,
      lastUpdatedAt: serverTimestamp(),
      updatedBy: userEmail ?? userUid ?? 'unknown',
    },
    { merge: true }
  );
}
