/**
 * Feature Flags
 * 
 * Centralized feature flags for toggling features without code changes.
 */

/**
 * Show promotion badges to public users (not just admin/yard).
 * When true, promotion badges are visible to all users in search results and car details.
 * When false, badges are only visible to admin/yard users.
 */
export const SHOW_PROMOTION_BADGES_PUBLIC = true; // default ON for now (we can flip later)
