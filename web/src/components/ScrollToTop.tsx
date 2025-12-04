import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop component - Scrolls window to top on route change
 * 
 * This component ensures that when navigating between routes in the SPA,
 * the browser scrolls to the top of the page instead of maintaining the
 * previous scroll position.
 * 
 * Uses 'auto' behavior (no animation) to avoid jarring mid-animations
 * while content is still loading.
 */
export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Scroll to top on route change (pathname or search params change)
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto', // No animation - instant scroll
    });
  }, [pathname, search]);

  // This component doesn't render anything
  return null;
}

