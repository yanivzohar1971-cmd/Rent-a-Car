/**
 * RequireProfileGuard - Redirects users without profile/role to /complete-profile
 * 
 * Use this component to wrap routes that require a complete user profile.
 * 
 * Behavior:
 * - If not authenticated => redirect to /account
 * - If authenticated but missing profile/role => redirect to /complete-profile
 * - If authenticated with profile and role => render children
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RequireProfileGuardProps {
  children: React.ReactNode;
}

export function RequireProfileGuard({ children }: RequireProfileGuardProps) {
  const { firebaseUser, userProfile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Don't redirect while loading
    if (loading) return;

    // If not authenticated, redirect to /account
    if (!firebaseUser) {
      if (location.pathname !== '/account') {
        console.log('[RequireProfileGuard] Redirecting to /account - not authenticated');
        navigate('/account', { replace: true, state: { returnTo: location.pathname } });
      }
      return;
    }

    // If authenticated but missing profile or role, redirect to /complete-profile
    const hasRole = userProfile?.primaryRole && userProfile.primaryRole.trim() !== '';
    if (!userProfile || !hasRole) {
      // Only redirect if not already on complete-profile page to avoid loops
      if (location.pathname !== '/complete-profile') {
        console.log('[RequireProfileGuard] Redirecting to /complete-profile - missing profile/role');
        navigate('/complete-profile', { replace: true });
      }
    }
  }, [firebaseUser, userProfile, loading, navigate, location]);

  // Don't render children if redirecting
  if (loading) {
    return null; // Show nothing while loading
  }

  if (!firebaseUser) {
    return null; // Redirecting to /account
  }

  const hasRole = userProfile?.primaryRole && userProfile.primaryRole.trim() !== '';
  if (!userProfile || !hasRole) {
    return null; // Redirecting to /complete-profile
  }

  return <>{children}</>;
}

