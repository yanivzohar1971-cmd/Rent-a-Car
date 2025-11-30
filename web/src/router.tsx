import { createBrowserRouter } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage';
import CarsSearchPage from './pages/CarsSearchPage';
import CarDetailsPage from './pages/CarDetailsPage';

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
    ],
  },
]);

