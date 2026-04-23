/**
 * URL helpers for tenant public storefronts.
 * Preview URLs live under `/tenant/:tenantId/...`; custom domains keep `/cars` while tenant
 * context is resolved from the hostname.
 */
export function getTenantPublicRoutePrefix(pathname: string): string | null {
  const m = pathname.match(/^\/tenant\/([^/]+)/);
  return m ? `/tenant/${m[1]}` : null;
}

export function tenantStorefrontCarsListPath(pathname: string): string {
  const p = getTenantPublicRoutePrefix(pathname);
  return p ? `${p}/cars` : '/cars';
}

export function tenantStorefrontCarDetailPath(pathname: string, carId: string): string {
  const p = getTenantPublicRoutePrefix(pathname);
  const seg = encodeURIComponent(carId);
  return p ? `${p}/cars/${seg}` : `/cars/${seg}`;
}

/** Base path (no query) passed to `buildSearchUrl` for filter URLs. */
export function tenantStorefrontCarsListingBasePath(pathname: string): string {
  return tenantStorefrontCarsListPath(pathname);
}

/** Rewrites internal links that target global `/cars` to `/tenant/:id/cars` when in preview. */
export function remapInternalHrefFromGlobalCarsToTenantPreview(pathname: string, internalHref: string): string {
  const prefix = getTenantPublicRoutePrefix(pathname);
  if (!prefix) return internalHref;
  try {
    const u = new URL(internalHref, 'https://tenant.local');
    const path = u.pathname;
    const search = u.search;
    if (path === '/cars') return `${prefix}/cars${search}`;
    const m = path.match(/^\/cars\/([^/]+)\/?$/);
    if (m) return `${prefix}/cars/${m[1]}${search}`;
    return internalHref;
  } catch {
    return internalHref;
  }
}

/** Rewrites card/detail hrefs (e.g. from `getCarDetailsUrl`) for tenant preview. */
export function remapCarCardHrefForTenantPreview(pathname: string, carHref: string): string {
  const prefix = getTenantPublicRoutePrefix(pathname);
  if (!prefix) return carHref;
  try {
    const u = new URL(carHref, 'https://tenant.local');
    const path = u.pathname;
    const search = u.search;
    if (path === '/cars') return `${prefix}/cars${search}`;
    const m = path.match(/^\/cars\/([^/]+)\/?$/);
    if (m) return `${prefix}/cars/${m[1]}${search}`;
    return carHref;
  } catch {
    return carHref;
  }
}
