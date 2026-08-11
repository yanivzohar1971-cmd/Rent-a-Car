import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary specifically for YardPublicPage to catch and display
 * render errors that would otherwise cause a blank white screen.
 */
export class YardPageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log full error details to console with clear tag
    console.error('[ErrorBoundary][YardPublicPage] Caught error:', error);
    console.error('[ErrorBoundary][YardPublicPage] Error info:', errorInfo);
    console.error('[ErrorBoundary][YardPublicPage] Component stack:', errorInfo.componentStack);
    
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
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
            אירעה שגיאה בטעינת דף המגרש
          </h2>
          <p style={{ color: '#666', marginBottom: '24px', maxWidth: '400px' }}>
            אנא נסה לרענן את הדף או לחזור לחיפוש הראשי.
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
              רענן דף
            </button>
            <Link
              to="/cars"
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
              לחיפוש הכללי
            </Link>
          </div>
          {/* Show error details in development */}
          {import.meta.env.DEV && this.state.error && (
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
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

