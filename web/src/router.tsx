import { createBrowserRouter } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage';
import CarsSearchPage from './pages/CarsSearchPage';
import CarDetailsPage from './pages/CarDetailsPage';
import YardCarEditPage from './pages/YardCarEditPage';
import AccountPage from './pages/AccountPage';
import YardProfilePage from './pages/YardProfilePage';
import YardFleetPage from './pages/YardFleetPage';
import YardImportPage from './pages/YardImportPage';
import YardSmartPublishPage from './pages/YardSmartPublishPage';
import YardLeadsPage from './pages/YardLeadsPage';
import SavedSearchesPage from './pages/SavedSearchesPage';
import YardDemandPage from './pages/YardDemandPage';
import YardStatsPage from './pages/YardStatsPage';
import YardPromotionsPage from './pages/YardPromotionsPage';
import YardSalesHistoryPage from './pages/YardSalesHistoryPage';
import { RouteErrorBoundary, YardPromotionErrorElement, CarDetailsErrorElement } from './components/common/RouteErrorElement';
import SellCarPage from './pages/SellCarPage';
import PublicCarPage from './pages/PublicCarPage';
import SellerAccountPage from './pages/SellerAccountPage';
import SellerLeadsPage from './pages/SellerLeadsPage';
import YardPublicPage from './pages/YardPublicPage';
import { YardPageErrorBoundary } from './components/common/YardPageErrorBoundary';
import AdminLeadsPage from './pages/AdminLeadsPage';
import AdminPlansPage from './pages/AdminPlansPage';
import AdminBillingPage from './pages/AdminBillingPage';
import AdminRevenuePage from './pages/AdminRevenuePage';
import AdminRevenueDashboardPage from './pages/AdminRevenueDashboardPage';
import AdminCustomersPage from './pages/AdminCustomersPage';
import AdminPromotionProductsPage from './pages/AdminPromotionProductsPage';
import AdminPromotionOrdersPage from './pages/AdminPromotionOrdersPage';
import AdminRentalCompaniesPage from './pages/AdminRentalCompaniesPage';
import AdminContentWizardPage from './pages/AdminContentWizardPage';
import AdminRoute from './components/common/AdminRoute';
import LegalTermsPage from './pages/LegalTermsPage';
import LegalContentPolicyPage from './pages/LegalContentPolicyPage';
import BlogIndexPage from './pages/BlogIndexPage';
import BlogPostPage from './pages/BlogPostPage';
import BlogTagPage from './pages/BlogTagPage';
import SeoTopicsIndexPage from './pages/SeoTopicsIndexPage';
import SeoLandingPage from './pages/SeoLandingPage';
import PartnerLandingPage from './pages/PartnerLandingPage';

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
        element: <CarsSearchPage />,
      },
      {
        path: 'cars/:id',
        element: <CarDetailsPage />,
        errorElement: <CarDetailsErrorElement />,
      },
      {
        path: 'car/:id',
        element: <PublicCarPage />,
      },
      {
        path: 'sell',
        element: <SellCarPage />,
      },
      {
        path: 'seller/account',
        element: <SellerAccountPage />,
      },
      {
        path: 'seller/leads',
        element: <SellerLeadsPage />,
      },
      {
        path: 'account',
        element: <AccountPage />,
      },
      // YARD routes - separate role flow
      {
        path: 'yard/cars/new',
        element: <YardCarEditPage />,
      },
      {
        path: 'yard/cars/edit/:id',
        element: <YardCarEditPage />,
      },
      {
        path: 'yard/profile',
        element: <YardProfilePage />,
      },
      {
        path: 'yard/fleet',
        element: <YardFleetPage />,
      },
      {
        path: 'yard/import',
        element: <YardImportPage />,
      },
      {
        path: 'yard/smart-publish',
        element: <YardSmartPublishPage />,
      },
      {
        path: 'yard/leads',
        element: <YardLeadsPage />,
      },
      {
        path: 'yard/demand',
        element: <YardDemandPage />,
      },
      {
        path: 'yard/stats',
        element: <YardStatsPage />,
      },
      {
        path: 'yard/promotions',
        element: (
          <RouteErrorBoundary fallbackRoute="/account" pageTitle="דף קידום המגרש">
            <YardPromotionsPage />
          </RouteErrorBoundary>
        ),
        errorElement: <YardPromotionErrorElement />,
      },
      {
        path: 'yard/sales-history',
        element: <YardSalesHistoryPage />,
      },
      {
        path: 'account/saved-searches',
        element: <SavedSearchesPage />,
      },
      // Public yard route (QR entry point)
      {
        path: 'yard/:yardId',
        element: (
          <YardPageErrorBoundary>
            <YardPublicPage />
          </YardPageErrorBoundary>
        ),
      },
      // Admin routes
      {
        path: 'admin/leads',
        element: <AdminLeadsPage />,
      },
      {
        path: 'admin/plans',
        element: <AdminPlansPage />,
      },
      {
        path: 'admin/customers',
        element: <AdminCustomersPage />,
      },
      {
        path: 'admin/billing',
        element: <AdminBillingPage />,
      },
      {
        path: 'admin/revenue',
        element: <AdminRevenuePage />,
      },
      {
        path: 'admin/revenue-dashboard',
        element: <AdminRevenueDashboardPage />,
      },
      {
        path: 'admin/promotion-products',
        element: <AdminPromotionProductsPage />,
      },
      {
        path: 'admin/promotion-orders',
        element: <AdminPromotionOrdersPage />,
      },
      {
        path: 'admin/rental-companies',
        element: (
          <AdminRoute>
            <AdminRentalCompaniesPage />
          </AdminRoute>
        ),
      },
      {
        path: 'admin/content-wizard',
        element: (
          <AdminRoute>
            <AdminContentWizardPage />
          </AdminRoute>
        ),
      },
      // Legal pages
      {
        path: 'legal/terms',
        element: <LegalTermsPage />,
      },
      {
        path: 'legal/content-policy',
        element: <LegalContentPolicyPage />,
      },
      // Blog pages
      {
        path: 'blog',
        element: <BlogIndexPage />,
      },
      {
        path: 'blog/tag/:tag',
        element: <BlogTagPage />,
      },
      {
        path: 'blog/:slug',
        element: <BlogPostPage />,
      },
      // SEO pages
      {
        path: 'topics',
        element: <SeoTopicsIndexPage />,
      },
      {
        path: 'cars-for-sale/:slug',
        element: <SeoLandingPage />,
      },
      {
        path: 'cars-for-sale',
        element: <SeoLandingPage />,
      },
      {
        path: 'rent/:slug',
        element: <SeoLandingPage />,
      },
      {
        path: 'rent',
        element: <SeoLandingPage />,
      },
      {
        path: 'yards/:slug',
        element: <SeoLandingPage />,
      },
      {
        path: 'yards',
        element: <SeoLandingPage />,
      },
      {
        path: 'dealers/:slug',
        element: <SeoLandingPage />,
      },
      {
        path: 'dealers',
        element: <SeoLandingPage />,
      },
      {
        path: 'agencies/:slug',
        element: <SeoLandingPage />,
      },
      {
        path: 'agencies',
        element: <SeoLandingPage />,
      },
      {
        path: 'guides/:slug',
        element: <SeoLandingPage />,
      },
      // Partner landing pages
      {
        path: 'partner/:slug',
        element: <PartnerLandingPage />,
      },
    ],
  },
]);

