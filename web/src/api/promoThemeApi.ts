import {
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

/**
 * Promo Theme Mode
 */
export type PromoThemeMode = 'AUTO' | 'AVIF' | 'PNG' | 'CSS';

/**
 * CSS Preset
 */
export type CssPreset = 'classic' | 'soft' | 'sparkle';

/**
 * Promo Theme Configuration
 */
export interface PromoThemeConfig {
  mode: PromoThemeMode;
  cssPreset: CssPreset;
  updatedAt: Timestamp;
  updatedBy: string;
}

/**
 * Default promo theme config
 */
const DEFAULT_CONFIG: Omit<PromoThemeConfig, 'updatedAt' | 'updatedBy'> = {
  mode: 'AUTO',
  cssPreset: 'classic',
};

/**
 * Fetch promo theme configuration from Firestore
 * Returns default config if document doesn't exist
 */
export async function getPromoThemeConfig(): Promise<PromoThemeConfig> {
  try {
    const configRef = doc(db, 'config', 'promoTheme');
    const configDoc = await getDocFromServer(configRef);
    
    if (!configDoc.exists()) {
      // Return default config
      return {
        ...DEFAULT_CONFIG,
        updatedAt: Timestamp.now(),
        updatedBy: '',
      };
    }
    
    const data = configDoc.data();
    return {
      mode: (data.mode || DEFAULT_CONFIG.mode) as PromoThemeMode,
      cssPreset: (data.cssPreset || DEFAULT_CONFIG.cssPreset) as CssPreset,
      updatedAt: data.updatedAt || Timestamp.now(),
      updatedBy: data.updatedBy || '',
    };
  } catch (error) {
    console.error('Error fetching promo theme config:', error);
    // Return default on error
    return {
      ...DEFAULT_CONFIG,
      updatedAt: Timestamp.now(),
      updatedBy: '',
    };
  }
}

/**
 * Update promo theme configuration (Admin-only)
 */
export async function updatePromoThemeConfig(
  updates: Partial<Pick<PromoThemeConfig, 'mode' | 'cssPreset'>>
): Promise<PromoThemeConfig> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to update promo theme config');
  }

  try {
    const configRef = doc(db, 'config', 'promoTheme');
    
    // Get current config to preserve existing fields
    const currentDoc = await getDocFromServer(configRef);
    const currentData = currentDoc.exists() ? currentDoc.data() : {};
    
    // Prepare update data
    const updateData: any = {
      ...currentData,
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };
    
    // Ensure required fields exist
    if (!updateData.mode) {
      updateData.mode = DEFAULT_CONFIG.mode;
    }
    if (!updateData.cssPreset) {
      updateData.cssPreset = DEFAULT_CONFIG.cssPreset;
    }
    
    await setDoc(configRef, updateData, { merge: true });
    
    // Fetch and return updated config
    const updatedDoc = await getDocFromServer(configRef);
    if (!updatedDoc.exists()) {
      throw new Error('Failed to update promo theme config');
    }
    
    const data = updatedDoc.data();
    return {
      mode: (data.mode || DEFAULT_CONFIG.mode) as PromoThemeMode,
      cssPreset: (data.cssPreset || DEFAULT_CONFIG.cssPreset) as CssPreset,
      updatedAt: data.updatedAt || Timestamp.now(),
      updatedBy: data.updatedBy || '',
    };
  } catch (error) {
    console.error('Error updating promo theme config:', error);
    throw error;
  }
}
