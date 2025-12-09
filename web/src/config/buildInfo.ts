/**
 * Build/Deploy information for version tracking
 * 
 * These values can be set via environment variables during CI/CD:
 * - VITE_APP_DEPLOY_LABEL: A label for the current deploy (e.g., "prod-2024-01-15", "staging-v2.3")
 * - VITE_APP_BUILD_VERSION: The semantic version of the build
 * 
 * For local development, defaults are used.
 */

export const DEPLOY_LABEL: string =
  import.meta.env.VITE_APP_DEPLOY_LABEL ?? 'DEV-LOCAL';

export const BUILD_VERSION: string =
  import.meta.env.VITE_APP_BUILD_VERSION ?? '1.0.0';

/**
 * Returns a formatted string for display in the UI
 */
export function getBuildDisplayString(): string {
  return `${DEPLOY_LABEL} | v${BUILD_VERSION}`;
}

