import type { TenantSiteConfig } from '../api/tenantSiteConfigsApi';

/**
 * Optional raw layout flag (not part of NormalizedTenantSiteConfig): hide blog from tenant shell nav.
 * Default: blog link is shown (shared blog content under tenant URL).
 */
export function isTenantShellBlogNavEnabled(siteConfig: TenantSiteConfig | null): boolean {
  const layout = siteConfig?.layout;
  if (!layout || typeof layout !== 'object') return true;
  const show = (layout as Record<string, unknown>).showTenantBlogInNav;
  if (show === false) return false;
  return true;
}
