import { createBrowserRouter } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage';
import CarsSearchPage from './pages/CarsSearchPage';
import CarDetailsPage from './pages/CarDetailsPage';
import YardCarEditPage from './pages/YardCarEditPage';
import AccountPage from './pages/AccountPage';

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
    ],
  },
]);

