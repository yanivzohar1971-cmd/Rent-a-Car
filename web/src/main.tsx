import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import './styles.css'
import './index.css'

// Disable Service Worker for now to prevent stale cache issues
// Unregister any existing service workers on app start
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().catch(() => {
        // Ignore unregister errors
      });
    });
  }).catch(() => {
    // Ignore getRegistrations errors
  });
}

// Log build info for debugging cache issues
console.log('Rent_a_Car WEB build', {
  buildVersion: 'd8090c7', // Current git commit hash
  buildTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
  userAgent: navigator.userAgent,
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
