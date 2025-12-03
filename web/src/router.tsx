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
import SellCarPage from './pages/SellCarPage';
import PublicCarPage from './pages/PublicCarPage';
import SellerAccountPage from './pages/SellerAccountPage';
import SellerLeadsPage from './pages/SellerLeadsPage';
import YardPublicPage from './pages/YardPublicPage';
import AdminLeadsPage from './pages/AdminLeadsPage';
import AdminPlansPage from './pages/AdminPlansPage';
import AdminBillingPage from './pages/AdminBillingPage';
import AdminRevenuePage from './pages/AdminRevenuePage';
import LegalTermsPage from './pages/LegalTermsPage';
import LegalContentPolicyPage from './pages/LegalContentPolicyPage';

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
        path: 'account/saved-searches',
        element: <SavedSearchesPage />,
      },
      // Public yard route (QR entry point)
      {
        path: 'yard/:yardId',
        element: <YardPublicPage />,
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
        path: 'admin/billing',
        element: <AdminBillingPage />,
      },
      {
        path: 'admin/revenue',
        element: <AdminRevenuePage />,
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
    ],
  },
]);

