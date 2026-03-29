import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage'; // Keep eager - landing page
import { TenantProvider } from './context/TenantContext';
import { TenantBrandingRuntime } from './components/tenant/TenantBrandingRuntime';
import { RouteErrorBoundary, YardPromotionErrorElement, CarDetailsErrorElement } from './components/common/RouteErrorElement';
import { ChunkLoadErrorElement } from './components/common/ChunkLoadErrorElement';
import { YardPageErrorBoundary } from './components/common/YardPageErrorBoundary';
import AdminRoute from './components/common/AdminRoute';
import { RequireProfileGuard } from './components/common/RequireProfileGuard';
import { RequireAuthGuard } from './components/common/RequireAuthGuard';
import AdminLayout from './pages/admin/AdminLayout';

// Lazy-load heavy public routes
const CarsSearchPage = lazy(() => import('./pages/CarsSearchPage'));
const CarDetailsPage = lazy(() => import('./pages/CarDetailsPage'));
const PublicCarPage = lazy(() => import('./pages/PublicCarPage'));
const SellCarPage = lazy(() => import('./pages/SellCarPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const SavedSearchesPage = lazy(() => import('./pages/SavedSearchesPage'));

// Lazy-load seller routes (role-specific)
const SellerAccountPage = lazy(() => import('./pages/SellerAccountPage'));
const SellerLeadsPage = lazy(() => import('./pages/SellerLeadsPage'));

// Lazy-load yard routes (role-specific, separate flow)
const YardCarEditPage = lazy(() => import('./pages/YardCarEditPage'));
const YardProfilePage = lazy(() => import('./pages/YardProfilePage'));
const YardFleetPage = lazy(() => import('./pages/YardFleetPage'));
const YardImportPage = lazy(() => import('./pages/YardImportPage'));
const YardSmartPublishPage = lazy(() => import('./pages/YardSmartPublishPage'));
const YardLeadsPage = lazy(() => import('./pages/YardLeadsPage'));
const YardDemandPage = lazy(() => import('./pages/YardDemandPage'));
const YardStatsPage = lazy(() => import('./pages/YardStatsPage'));
const YardPromotionsPage = lazy(() => import('./pages/YardPromotionsPage'));
const YardSalesHistoryPage = lazy(() => import('./pages/YardSalesHistoryPage'));
const YardPublicPage = lazy(() => import('./pages/YardPublicPage'));
const YardAddCarImagesPage = lazy(() => import('./pages/YardAddCarImagesPage'));

// Lazy-load admin routes (role-specific, should never load for public users)
const AdminLeadsPage = lazy(() => import('./pages/AdminLeadsPage'));
const AdminPlansPage = lazy(() => import('./pages/AdminPlansPage'));
const AdminBillingPage = lazy(() => import('./pages/AdminBillingPage'));
const AdminRevenuePage = lazy(() => import('./pages/AdminRevenuePage'));
const AdminRevenueDashboardPage = lazy(() => import('./pages/AdminRevenueDashboardPage'));
const AdminCustomersPage = lazy(() => import('./pages/AdminCustomersPage'));
const AdminPromotionProductsPage = lazy(() => import('./pages/AdminPromotionProductsPage'));
const AdminPromotionOrdersPage = lazy(() => import('./pages/AdminPromotionOrdersPage'));
const AdminPromoThemePage = lazy(() => import('./pages/AdminPromoThemePage'));
const AdminRentalCompaniesPage = lazy(() => import('./pages/AdminRentalCompaniesPage'));
const AdminContentWizardPage = lazy(() => import('./pages/AdminContentWizardPage'));
const AdminSellerExposurePage = lazy(() => import('./pages/AdminSellerExposurePage'));
const DebugConsolePage = lazy(() => import('./pages/admin/DebugConsolePage'));
const FeatureFlagsPage = lazy(() => import('./pages/admin/FeatureFlagsPage'));
const AdminTenantDomainsPage = lazy(() => import('./pages/AdminTenantDomainsPage'));
const AdminTenantSiteConfigPage = lazy(() => import('./pages/AdminTenantSiteConfigPage'));
const AdminTenantSiteBuilderPage = lazy(() => import('./pages/AdminTenantSiteBuilderPage'));
const AdminTenantsPage = lazy(() => import('./pages/AdminTenantsPage'));

// Lazy-load secondary content routes
const LegalTermsPage = lazy(() => import('./pages/LegalTermsPage'));
const LegalTermsPageEn = lazy(() => import('./pages/LegalTermsPageEn'));
const LegalContentPolicyPage = lazy(() => import('./pages/LegalContentPolicyPage'));
const LegalContentPolicyPageEn = lazy(() => import('./pages/LegalContentPolicyPageEn'));
const BlogIndexPage = lazy(() => import('./pages/BlogIndexPage'));
const BlogPostPage = lazy(() => import('./pages/BlogPostPage'));
const BlogTagPage = lazy(() => import('./pages/BlogTagPage'));
const SeoTopicsIndexPage = lazy(() => import('./pages/SeoTopicsIndexPage'));
const SeoLandingPage = lazy(() => import('./pages/SeoLandingPage'));
const PartnerLandingPage = lazy(() => import('./pages/PartnerLandingPage'));

// Loading fallback component
const RouteLoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
    <div>טוען...</div>
  </div>
);

// Wrapper to add Suspense to lazy-loaded routes
const withSuspense = (Component: React.LazyExoticComponent<React.ComponentType<any>>): React.ReactElement => (
  <Suspense fallback={<RouteLoadingFallback />}>
    <Component />
  </Suspense>
);

function MainLayoutWithTenant() {
  return (
    <TenantProvider>
      <TenantBrandingRuntime />
      <MainLayout />
    </TenantProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayoutWithTenant />,
    // Root-level errorElement catches errors during route loading (chunk failures, etc.)
    errorElement: <ChunkLoadErrorElement />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'tenant/:tenantId',
        element: <HomePage />,
      },
      {
        path: 'cars',
        element: withSuspense(CarsSearchPage),
      },
      {
        path: 'cars/:id',
        element: withSuspense(CarDetailsPage),
        errorElement: <CarDetailsErrorElement />,
      },
      {
        path: 'car/:id',
        element: withSuspense(PublicCarPage),
      },
      {
        path: 'sell',
        element: (
          <RequireProfileGuard>
            {withSuspense(SellCarPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'seller/account',
        element: (
          <RequireProfileGuard>
            {withSuspense(SellerAccountPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'seller/leads',
        element: (
          <RequireProfileGuard>
            {withSuspense(SellerLeadsPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'account',
        element: withSuspense(AccountPage),
        errorElement: <ChunkLoadErrorElement />,
        // NO GUARD - /account must be accessible for login/signup
      },
      {
        path: 'complete-profile',
        element: (
          <RequireAuthGuard>
            {withSuspense(lazy(() => import('./pages/CompleteProfilePage')))}
          </RequireAuthGuard>
        ),
        errorElement: <ChunkLoadErrorElement />,
        // Auth required but NO role required - allows completing profile
      },
      // YARD routes - separate role flow (lazy-loaded, protected)
      {
        path: 'yard/cars/new',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardCarEditPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/cars/edit/:id',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardCarEditPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/profile',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardProfilePage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/fleet',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardFleetPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/add-car-images',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardAddCarImagesPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/import',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardImportPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/smart-publish',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardSmartPublishPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/leads',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardLeadsPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/demand',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardDemandPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/stats',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardStatsPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'yard/promotions',
        element: (
          <RequireProfileGuard>
            <RouteErrorBoundary fallbackRoute="/account" pageTitle="דף קידום המגרש">
              {withSuspense(YardPromotionsPage)}
            </RouteErrorBoundary>
          </RequireProfileGuard>
        ),
        errorElement: <YardPromotionErrorElement />,
      },
      {
        path: 'yard/sales-history',
        element: (
          <RequireProfileGuard>
            {withSuspense(YardSalesHistoryPage)}
          </RequireProfileGuard>
        ),
      },
      {
        path: 'account/saved-searches',
        element: (
          <RequireProfileGuard>
            {withSuspense(SavedSearchesPage)}
          </RequireProfileGuard>
        ),
      },
      // Public yard route (QR entry point)
      {
        path: 'yard/:yardId',
        element: (
          <YardPageErrorBoundary>
            {withSuspense(YardPublicPage)}
          </YardPageErrorBoundary>
        ),
      },
      // Admin routes (lazy-loaded - should never load for public users)
      // All admin routes are wrapped in AdminLayout for consistent header
      {
        path: 'admin',
        element: (
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        ),
        errorElement: <ChunkLoadErrorElement />,
        children: [
          {
            path: 'leads',
            element: withSuspense(AdminLeadsPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'plans',
            element: withSuspense(AdminPlansPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'customers',
            element: withSuspense(AdminCustomersPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'billing',
            element: withSuspense(AdminBillingPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'revenue',
            element: withSuspense(AdminRevenuePage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'revenue-dashboard',
            element: withSuspense(AdminRevenueDashboardPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'promotion-products',
            element: withSuspense(AdminPromotionProductsPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'promotion-orders',
            element: withSuspense(AdminPromotionOrdersPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'promo-theme',
            element: withSuspense(AdminPromoThemePage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'rental-companies',
            element: withSuspense(AdminRentalCompaniesPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'sellers/exposure',
            element: withSuspense(AdminSellerExposurePage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'content-wizard',
            element: withSuspense(AdminContentWizardPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'debug',
            element: withSuspense(DebugConsolePage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'feature-flags',
            element: withSuspense(FeatureFlagsPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'tenants',
            element: withSuspense(AdminTenantsPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'tenant-domains',
            element: withSuspense(AdminTenantDomainsPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'tenant-site-builder',
            element: withSuspense(AdminTenantSiteBuilderPage),
            errorElement: <ChunkLoadErrorElement />,
          },
          {
            path: 'tenant-site-config',
            element: withSuspense(AdminTenantSiteConfigPage),
            errorElement: <ChunkLoadErrorElement />,
          },
        ],
      },
      // Legal pages (lazy-loaded)
      {
        path: 'legal/terms',
        element: withSuspense(LegalTermsPage),
      },
      {
        path: 'legal/terms/en',
        element: withSuspense(LegalTermsPageEn),
      },
      {
        path: 'legal/content-policy',
        element: withSuspense(LegalContentPolicyPage),
      },
      {
        path: 'legal/content-policy/en',
        element: withSuspense(LegalContentPolicyPageEn),
      },
      // Blog pages (lazy-loaded)
      {
        path: 'blog',
        element: withSuspense(BlogIndexPage),
      },
      {
        path: 'blog/tag/:tag',
        element: withSuspense(BlogTagPage),
      },
      {
        path: 'blog/:slug',
        element: withSuspense(BlogPostPage),
      },
      // SEO pages (lazy-loaded)
      {
        path: 'topics',
        element: withSuspense(SeoTopicsIndexPage),
      },
      {
        path: 'cars-for-sale/:slug',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'cars-for-sale',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'rent/:slug',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'rent',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'yards/:slug',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'yards',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'dealers/:slug',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'dealers',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'agencies/:slug',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'agencies',
        element: withSuspense(SeoLandingPage),
      },
      {
        path: 'guides/:slug',
        element: withSuspense(SeoLandingPage),
      },
      // Partner landing pages (lazy-loaded)
      {
        path: 'partner/:slug',
        element: withSuspense(PartnerLandingPage),
      },
    ],
  },
]);

