import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage'; // Keep eager - landing page
import { RouteErrorBoundary, YardPromotionErrorElement, CarDetailsErrorElement } from './components/common/RouteErrorElement';
import { YardPageErrorBoundary } from './components/common/YardPageErrorBoundary';
import AdminRoute from './components/common/AdminRoute';

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

// Lazy-load admin routes (role-specific, should never load for public users)
const AdminLeadsPage = lazy(() => import('./pages/AdminLeadsPage'));
const AdminPlansPage = lazy(() => import('./pages/AdminPlansPage'));
const AdminBillingPage = lazy(() => import('./pages/AdminBillingPage'));
const AdminRevenuePage = lazy(() => import('./pages/AdminRevenuePage'));
const AdminRevenueDashboardPage = lazy(() => import('./pages/AdminRevenueDashboardPage'));
const AdminCustomersPage = lazy(() => import('./pages/AdminCustomersPage'));
const AdminPromotionProductsPage = lazy(() => import('./pages/AdminPromotionProductsPage'));
const AdminPromotionOrdersPage = lazy(() => import('./pages/AdminPromotionOrdersPage'));
const AdminRentalCompaniesPage = lazy(() => import('./pages/AdminRentalCompaniesPage'));
const AdminContentWizardPage = lazy(() => import('./pages/AdminContentWizardPage'));

// Lazy-load secondary content routes
const LegalTermsPage = lazy(() => import('./pages/LegalTermsPage'));
const LegalContentPolicyPage = lazy(() => import('./pages/LegalContentPolicyPage'));
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
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
        element: withSuspense(SellCarPage),
      },
      {
        path: 'seller/account',
        element: withSuspense(SellerAccountPage),
      },
      {
        path: 'seller/leads',
        element: withSuspense(SellerLeadsPage),
      },
      {
        path: 'account',
        element: withSuspense(AccountPage),
      },
      // YARD routes - separate role flow (lazy-loaded)
      {
        path: 'yard/cars/new',
        element: withSuspense(YardCarEditPage),
      },
      {
        path: 'yard/cars/edit/:id',
        element: withSuspense(YardCarEditPage),
      },
      {
        path: 'yard/profile',
        element: withSuspense(YardProfilePage),
      },
      {
        path: 'yard/fleet',
        element: withSuspense(YardFleetPage),
      },
      {
        path: 'yard/import',
        element: withSuspense(YardImportPage),
      },
      {
        path: 'yard/smart-publish',
        element: withSuspense(YardSmartPublishPage),
      },
      {
        path: 'yard/leads',
        element: withSuspense(YardLeadsPage),
      },
      {
        path: 'yard/demand',
        element: withSuspense(YardDemandPage),
      },
      {
        path: 'yard/stats',
        element: withSuspense(YardStatsPage),
      },
      {
        path: 'yard/promotions',
        element: (
          <RouteErrorBoundary fallbackRoute="/account" pageTitle="דף קידום המגרש">
            {withSuspense(YardPromotionsPage)}
          </RouteErrorBoundary>
        ),
        errorElement: <YardPromotionErrorElement />,
      },
      {
        path: 'yard/sales-history',
        element: withSuspense(YardSalesHistoryPage),
      },
      {
        path: 'account/saved-searches',
        element: withSuspense(SavedSearchesPage),
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
      {
        path: 'admin/leads',
        element: withSuspense(AdminLeadsPage),
      },
      {
        path: 'admin/plans',
        element: withSuspense(AdminPlansPage),
      },
      {
        path: 'admin/customers',
        element: withSuspense(AdminCustomersPage),
      },
      {
        path: 'admin/billing',
        element: withSuspense(AdminBillingPage),
      },
      {
        path: 'admin/revenue',
        element: withSuspense(AdminRevenuePage),
      },
      {
        path: 'admin/revenue-dashboard',
        element: withSuspense(AdminRevenueDashboardPage),
      },
      {
        path: 'admin/promotion-products',
        element: withSuspense(AdminPromotionProductsPage),
      },
      {
        path: 'admin/promotion-orders',
        element: withSuspense(AdminPromotionOrdersPage),
      },
      {
        path: 'admin/rental-companies',
        element: (
          <AdminRoute>
            {withSuspense(AdminRentalCompaniesPage)}
          </AdminRoute>
        ),
      },
      {
        path: 'admin/content-wizard',
        element: (
          <AdminRoute>
            {withSuspense(AdminContentWizardPage)}
          </AdminRoute>
        ),
      },
      // Legal pages (lazy-loaded)
      {
        path: 'legal/terms',
        element: withSuspense(LegalTermsPage),
      },
      {
        path: 'legal/content-policy',
        element: withSuspense(LegalContentPolicyPage),
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

