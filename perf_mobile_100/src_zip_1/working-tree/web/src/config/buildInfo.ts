// IMPORTANT (AI / Cursor / humans):
// This file is part of the permanent Build Info infrastructure.
// Do NOT remove BUILD_VERSION, BUILD_ENV, BUILD_LABEL or this file.
// All future changes must PRESERVE this feature and may only EXTEND it.
// See web/docs/AI_GLOBAL_RULES.md and the "Build Info Center – Must Always Exist" section.

/**
 * Build/Deploy information for version tracking
 *
 * NOTES:
 * - For production/staging, set VITE_DEPLOY_VERSION in the build environment,
 *   e.g. "2025.12.09-01" or a short commit hash.
 * - This value is baked at build time and shown in the footer + console.
 *
 * Environment variables:
 * - VITE_DEPLOY_VERSION: Primary version string (e.g., "2025.12.09-01")
 * - VITE_APP_VERSION: Fallback version string
 * - VITE_DEPLOY_ENV: Environment label (production, staging, dev)
 */

// Core version string – comes from Vite env var, with a safe fallback.
const rawVersion =
  import.meta.env.VITE_DEPLOY_VERSION ??
  import.meta.env.VITE_APP_VERSION ??
  'DEV';

// Normalize to string, trim whitespace
export const BUILD_VERSION: string =
  typeof rawVersion === 'string' && rawVersion.trim().length > 0
    ? rawVersion.trim()
    : 'DEV';

// Environment label (production / staging / dev) if we ever want it
const rawEnv = import.meta.env.VITE_DEPLOY_ENV ?? import.meta.env.MODE;
export const BUILD_ENV: string =
  typeof rawEnv === 'string' && rawEnv.trim().length > 0
    ? rawEnv.trim()
    : 'local';

// A human-friendly label we can show in the UI
export const BUILD_LABEL = `v${BUILD_VERSION}`;

// Legacy exports for backward compatibility with existing code
export const DEPLOY_LABEL: string = BUILD_VERSION;

/**
 * Returns a formatted string for display in the UI
 */
export function getBuildDisplayString(): string {
  return `${BUILD_LABEL} | Env: ${BUILD_ENV}`;
}
