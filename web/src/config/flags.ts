/**
 * Feature flags for the application
 * 
 * These flags control experimental or debug features.
 * Production-safe: flags default to false if not set.
 */

/**
 * Promotion Proof Mode
 * 
 * When enabled (and user is yard/admin), shows:
 * - Debug info on car cards (promotion tier, remaining time, Firestore fields)
 * - Rank position in search results
 * - "Verify promotion" button to inspect Firestore docs
 * 
 * Set via environment variable: VITE_PROMO_PROOF_MODE=true
 * Additionally gated by role: only yard/admin users see proof mode UI
 */
export const PROMO_PROOF_MODE = import.meta.env.VITE_PROMO_PROOF_MODE === 'true';
