import { Component } from 'react';
import type { ReactNode } from 'react';
import { attemptChunkRetry, isChunkLoadError } from '../utils/chunkRetry';
import { JsonView } from './debug/JsonView';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  correlationId?: string;
  errorDetails?: any;
}

/**
 * Global error boundary to catch React errors and prevent blank white screen
 * Handles chunk load errors with one-time auto-retry
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Generate correlation ID for tracking
    const correlationId = Math.random().toString(36).substring(2, 15);
    
    // Log full error details to console with correlation ID
    const errorDetails = {
      correlationId,
      url: window.location.href,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      isChunkLoadError: isChunkLoadError(error),
    };
    
    console.error('[ErrorBoundary] Caught error:', errorDetails);
    console.error('[ErrorBoundary] Full error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    // Store error details for UI display
    this.setState({ 
      hasError: true, 
      error: error,
      correlationId,
      errorDetails,
    });
    
    // Attempt one-time retry for chunk load errors
    if (isChunkLoadError(error)) {
      const retried = attemptChunkRetry(error);
      if (retried) {
        // Reload will happen, don't render error UI
        return;
      }
    }
  }

  handleClearCache = () => {
    try {
      // Clear localStorage keys that might cache app shell
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('cache') || 
          key.includes('chunk') || 
          key.includes('app-shell') ||
          key.includes('sw-cache')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      // Reload page
      window.location.reload();
    } catch (err) {
      console.error('[ErrorBoundary] Failed to clear cache:', err);
      // Fallback to simple reload
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error && isChunkLoadError(this.state.error);
      const correlationId = this.state.correlationId || 'unknown';
      
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
            maxWidth: '700px',
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
              משהו השתבש בטעינה
            </h1>
            {isChunkError && (
              <p style={{
                fontSize: '16px',
                marginBottom: '16px',
                color: '#f57c00',
                fontWeight: '500'
              }}>
                ייתכן שזו גרסת קאש ישנה. נסה רענון.
              </p>
            )}
            <p style={{
              fontSize: '16px',
              marginBottom: '24px',
              color: '#666'
            }}>
              אנא נסה לרענן את הדף או לחזור מאוחר יותר.
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
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
                🔄 רענון
              </button>
              <button
                onClick={this.handleClearCache}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  backgroundColor: '#f57c00',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                🧹 נקה קאש
              </button>
            </div>
            <details style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#fafafa',
              borderRadius: '4px',
              textAlign: 'right',
              fontSize: '14px',
              direction: 'ltr' // Force LTR for technical details
            }}>
              <summary style={{ 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                marginBottom: '12px',
                direction: 'rtl',
                textAlign: 'right'
              }}>
                פרטים טכניים
              </summary>
              <div style={{ 
                marginTop: '12px',
                direction: 'ltr',
                textAlign: 'left'
              }}>
                <p style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
                  Correlation ID: <code>{correlationId}</code>
                </p>
                {this.state.errorDetails && (
                  <JsonView 
                    value={this.state.errorDetails} 
                    maxHeight={300}
                    style={{ fontSize: '12px' }}
                  />
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
