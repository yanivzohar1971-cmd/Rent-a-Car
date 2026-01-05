/**
 * RequireAuthGuard - Redirects unauthenticated users to /account
 * 
 * Use this component to wrap routes that require authentication (but not necessarily a role).
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RequireAuthGuardProps {
  children: React.ReactNode;
}

export function RequireAuthGuard({ children }: RequireAuthGuardProps) {
  const { firebaseUser, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Don't redirect while loading
    if (loading) return;

    // If not authenticated, redirect to /account
    if (!firebaseUser) {
      // Only redirect if not already on /account to avoid loops
      if (location.pathname !== '/account') {
        console.log('[RequireAuthGuard] Redirecting to /account - not authenticated');
        navigate('/account', { replace: true, state: { returnTo: location.pathname } });
      }
    }
  }, [firebaseUser, loading, navigate, location]);

  // Don't render children if redirecting
  if (!loading && !firebaseUser) {
    return null;
  }

  return <>{children}</>;
}

