/**
 * SEO Landing Pages Configuration
 * 
 * Defines whitelisted landing page types that are indexable.
 * All other filter/search URLs should be noindex,follow.
 */

export type LandingPageType =
  | 'main' // /cars-for-sale
  | 'city' // /cars-for-sale/city/<city-slug>
  | 'make' // /cars-for-sale/make/<make-slug>
  | 'model' // /cars-for-sale/model/<model-slug>
  | 'budget' // /cars-for-sale/budget/<min>-<max>
  | 'type' // /cars-for-sale/type/<type>
  | 'city-make' // /cars-for-sale/city/<city>/make/<make>
  | 'city-type' // /cars-for-sale/city/<city>/type/<type>
  | 'make-model' // /cars-for-sale/make/<make>/model/<model>
  | 'model-year'; // /cars-for-sale/model/<model>/year/<year>

export interface LandingPageConfig {
  type: LandingPageType;
  pathPattern: string;
  isIndexable: boolean;
  requiresContent: boolean; // Whether this page type requires generated content
}

/**
 * Whitelist of indexable landing page patterns
 */
export const INDEXABLE_LANDING_PAGES: LandingPageConfig[] = [
  {
    type: 'main',
    pathPattern: '/cars-for-sale',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'city',
    pathPattern: '/cars-for-sale/city/:citySlug',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'make',
    pathPattern: '/cars-for-sale/make/:makeSlug',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'model',
    pathPattern: '/cars-for-sale/model/:modelSlug',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'budget',
    pathPattern: '/cars-for-sale/budget/:min-:max',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'type',
    pathPattern: '/cars-for-sale/type/:type',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'city-make',
    pathPattern: '/cars-for-sale/city/:citySlug/make/:makeSlug',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'city-type',
    pathPattern: '/cars-for-sale/city/:citySlug/type/:type',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'make-model',
    pathPattern: '/cars-for-sale/make/:makeSlug/model/:modelSlug',
    isIndexable: true,
    requiresContent: true,
  },
  {
    type: 'model-year',
    pathPattern: '/cars-for-sale/model/:modelSlug/year/:year',
    isIndexable: true,
    requiresContent: true,
  },
];

/**
 * Check if a URL path matches an indexable landing page pattern
 */
export function isIndexableLandingPage(pathname: string): boolean {
  return INDEXABLE_LANDING_PAGES.some((config) => {
    const pattern = config.pathPattern
      .replace(/:(\w+)/g, '[^/]+') // Convert :param to regex
      .replace(/\//g, '\\/'); // Escape slashes
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(pathname);
  });
}

/**
 * Get landing page config for a given pathname
 */
export function getLandingPageConfig(pathname: string): LandingPageConfig | null {
  return (
    INDEXABLE_LANDING_PAGES.find((config) => {
      const pattern = config.pathPattern
        .replace(/:(\w+)/g, '[^/]+')
        .replace(/\//g, '\\/');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(pathname);
    }) || null
  );
}

/**
 * Check if a URL should be noindex (filter pages with query params)
 */
export function shouldNoindex(pathname: string, searchParams: URLSearchParams): boolean {
  // If it's an indexable landing page, don't noindex
  if (isIndexableLandingPage(pathname)) {
    return false;
  }

  // If it's /cars with query parameters, noindex
  if (pathname === '/cars' && searchParams.toString().length > 0) {
    return true;
  }

  // Role-specific routes should be noindex (handled by robots.txt, but also meta tag)
  if (
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/yard/') ||
    pathname.startsWith('/seller/') ||
    pathname.startsWith('/account')
  ) {
    return true;
  }

  return false;
}

