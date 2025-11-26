import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          backgroundColor: '#1e293b',
          color: '#f1f5f9',
          borderRadius: '8px',
          margin: '2rem',
          maxWidth: '800px'
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem' }}>⚠️ Something went wrong</h2>
          <p style={{ marginBottom: '1rem' }}>
            The application encountered an error. Please try refreshing the page.
          </p>
          {this.state.error && (
            <details style={{ marginTop: '1rem', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Error Details
              </summary>
              <pre style={{
                backgroundColor: '#0f1419',
                padding: '1rem',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '0.875rem'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
