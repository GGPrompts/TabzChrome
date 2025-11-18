import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App crashed with error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    // Clear localStorage if it's corrupted
    try {
      localStorage.removeItem('tabz-settings');
      localStorage.removeItem('simple-terminal-storage');
    } catch (e) {
      console.error('Failed to clear localStorage:', e);
    }

    // Reset state and reload
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#1a1a2e',
          color: '#fff',
          fontFamily: 'monospace',
          padding: '20px'
        }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>😵 Tabz Crashed</h1>
          <p style={{ fontSize: '18px', marginBottom: '30px', opacity: 0.8 }}>
            Something went wrong. This might be due to corrupted state data.
          </p>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#ff6b35',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ff8555'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff6b35'}
            >
              🔧 Reset & Reload
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#4a4a6a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5a5a7a'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4a4a6a'}
            >
              🔄 Try Again
            </button>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <details style={{
              width: '100%',
              maxWidth: '800px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              padding: '20px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}>
              <summary style={{ fontSize: '14px', marginBottom: '10px' }}>
                📋 Error Details (Development Mode)
              </summary>
              <pre style={{
                fontSize: '12px',
                overflow: 'auto',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                padding: '15px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
              }}>
                {this.state.error.toString()}
                {'\n\nStack Trace:\n'}
                {this.state.error.stack}
                {'\n\nComponent Stack:\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;