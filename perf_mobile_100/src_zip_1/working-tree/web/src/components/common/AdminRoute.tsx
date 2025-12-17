import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface AdminRouteProps {
  children: React.ReactElement;
}

/**
 * Route guard component that ensures only admin users can access the route.
 * Non-admin users are redirected to /account before the page renders.
 * 
 * Usage in router.tsx:
 *   {
 *     path: 'admin/rental-companies',
 *     element: <AdminRoute><AdminRentalCompaniesPage /></AdminRoute>,
 *   }
 */
export default function AdminRoute({ children }: AdminRouteProps) {
  const { firebaseUser, userProfile, loading } = useAuth();

  // Show nothing while checking auth (prevents flash of content)
  if (loading) {
    return null;
  }

  // Redirect if not authenticated or not admin
  if (!firebaseUser || !userProfile || userProfile.isAdmin !== true) {
    return <Navigate to="/account" replace />;
  }

  // User is admin - render the protected content
  return children;
}
