import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { YardPublicProvider } from './context/YardPublicContext'
import { BUILD_LABEL, BUILD_ENV } from './config/buildInfo'
// Optimized Heebo fonts (Hebrew + Latin only, reduced from 30+ files to 6)
// Critical fonts preloaded in index.html for faster CLS-free rendering
import './fonts/heebo.css'
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

// Log build/version information once on startup for debugging deployments
console.info('[CarExpert] Build version:', BUILD_LABEL, '| Env:', BUILD_ENV);

// CLS Logger (dev-only) - dynamic import to prevent bundling into production
if (import.meta.env.MODE === 'development' || new URLSearchParams(window.location.search).get('debugCls') === '1') {
  import('./utils/clsLogger').then(({ initClsLogger }) => {
    initClsLogger();
  }).catch(() => {
    // Ignore import errors
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <YardPublicProvider>
          <RouterProvider router={router} />
        </YardPublicProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
