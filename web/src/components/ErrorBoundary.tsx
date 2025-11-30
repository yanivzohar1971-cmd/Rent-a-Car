import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary to catch React errors and prevent blank white screen
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log full error details to console
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
    console.error('Error stack:', error.stack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backgroundColor: '#f5f5f5',
          fontFamily: 'Heebo, Arial, sans-serif',
          direction: 'rtl'
        }}>
          <div style={{
            maxWidth: '600px',
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '16px',
              color: '#d32f2f'
            }}>
              אירעה שגיאה בטעינת האתר
            </h1>
            <p style={{
              fontSize: '16px',
              marginBottom: '24px',
              color: '#666'
            }}>
              אנא נסה לרענן את הדף או לחזור מאוחר יותר.
            </p>
            <button
              onClick={() => {
                window.location.reload();
              }}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              רענן דף
            </button>
            {import.meta.env.DEV && this.state.error && (
              <details style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#fee',
                borderRadius: '4px',
                textAlign: 'right',
                fontSize: '14px'
              }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px' }}>
                  פרטי שגיאה (פיתוח בלבד)
                </summary>
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: '#c33'
                }}>
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

