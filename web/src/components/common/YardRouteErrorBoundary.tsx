import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallbackRoute?: string;
  pageTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Generic Error Boundary for Yard routes
 * Catches render errors and displays a friendly message instead of blank screen
 */
export class YardRouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log full error details to console with clear tag
    console.error('[ErrorBoundary][YardRoute] Caught error:', error);
    console.error('[ErrorBoundary][YardRoute] Error info:', errorInfo);
    console.error('[ErrorBoundary][YardRoute] Component stack:', errorInfo.componentStack);
    
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const fallbackRoute = this.props.fallbackRoute || '/account';
      const pageTitle = this.props.pageTitle || 'דף המגרש';
      const { error, errorInfo } = this.state;

      return (
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            fontFamily: 'Heebo, Arial, sans-serif',
            direction: 'rtl',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#d32f2f', marginBottom: '16px' }}>
            אירעה שגיאה ב{pageTitle}
          </h2>
          <p style={{ color: '#666', marginBottom: '24px', maxWidth: '400px' }}>
            אנא נסה לרענן את הדף או לחזור לדף הראשי של המגרש.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              נסה שוב
            </button>
            <Link
              to={fallbackRoute}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                borderRadius: '4px',
                textDecoration: 'none',
                fontSize: '14px',
              }}
            >
              חזרה לדף הראשי
            </Link>
          </div>
          {/* Show error details in development */}
          {import.meta.env.DEV && error && (
            <details
              style={{
                marginTop: '24px',
                padding: '12px',
                backgroundColor: '#fff3f3',
                borderRadius: '4px',
                textAlign: 'left',
                direction: 'ltr',
                fontSize: '12px',
                maxWidth: '600px',
                width: '100%',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px' }}>
                Error Details (dev only)
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c33' }}>
                {error.toString()}
                {'\n\n'}
                {error.stack}
                {errorInfo && (
                  <>
                    {'\n\n'}
                    Component Stack:
                    {'\n'}
                    {errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error element component for React Router errorElement prop
 * Used for route-level error handling
 */
export function YardPromotionErrorElement() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Heebo, Arial, sans-serif',
        direction: 'rtl',
        textAlign: 'center',
      }}
    >
      <h2 style={{ color: '#d32f2f', marginBottom: '16px' }}>
        אירעה שגיאה בדף קידום המגרש
      </h2>
      <p style={{ color: '#666', marginBottom: '24px', maxWidth: '400px' }}>
        אנא נסה לרענן את הדף או לחזור לדף הראשי של המגרש.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          נסה שוב
        </button>
        <Link
          to="/account"
          style={{
            padding: '10px 20px',
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          חזרה לדף הראשי
        </Link>
      </div>
    </div>
  );
}
