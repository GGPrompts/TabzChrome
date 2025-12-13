import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react'

/**
 * Props for the ErrorBoundary component
 */
interface ErrorBoundaryProps {
  /** Child components to wrap with error handling */
  children: ReactNode
  /** Optional fallback component to render on error */
  fallback?: ReactNode
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

/**
 * State for the ErrorBoundary component
 */
interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean
  /** The caught error object */
  error: Error | null
  /** Additional error information from React */
  errorInfo: ErrorInfo | null
}

/**
 * ErrorBoundary - React error boundary component for graceful error handling
 *
 * Catches JavaScript errors anywhere in the child component tree, logs them,
 * and displays a fallback UI instead of crashing the entire sidebar.
 *
 * This component is essential for:
 * - Preventing terminal crashes from taking down the entire sidebar
 * - Providing user-friendly error messages with recovery options
 * - Logging errors for debugging purposes
 * - Maintaining usability even when components fail
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <SidePanelTerminal />
 * </ErrorBoundary>
 * ```
 *
 * With custom error handling:
 * ```tsx
 * <ErrorBoundary
 *   onError={(error, info) => console.error('Caught:', error)}
 *   fallback={<CustomErrorUI />}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @param props - Error boundary configuration
 * @param props.children - Components to wrap with error handling
 * @param props.fallback - Optional custom fallback UI
 * @param props.onError - Optional error callback for logging/reporting
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  /**
   * Update state when an error is caught during rendering
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  /**
   * Log error details and call optional error callback
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for debugging
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)

    // Update state with error info
    this.setState({ errorInfo })

    // Call optional error callback
    this.props.onError?.(error, errorInfo)

    // Try to log to backend for debugging (fire and forget)
    try {
      fetch('http://localhost:8129/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          source: 'ErrorBoundary',
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {
        // Ignore fetch errors - backend may not be running
      })
    } catch {
      // Ignore any errors during logging
    }
  }

  /**
   * Reset the error state to attempt recovery
   */
  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  /**
   * Reload the entire sidebar
   */
  handleReload = (): void => {
    window.location.reload()
  }

  /**
   * Copy error details to clipboard for bug reporting
   */
  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state
    const errorDetails = [
      '=== Tabz Error Report ===',
      `Timestamp: ${new Date().toISOString()}`,
      `Error: ${error?.message}`,
      '',
      '--- Stack Trace ---',
      error?.stack || 'No stack trace available',
      '',
      '--- Component Stack ---',
      errorInfo?.componentStack || 'No component stack available',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(errorDetails)
      // Brief visual feedback
      const btn = document.querySelector('[data-copy-error-btn]')
      if (btn) {
        const originalText = btn.textContent
        btn.textContent = 'Copied!'
        setTimeout(() => {
          btn.textContent = originalText
        }, 1500)
      }
    } catch {
      console.error('[ErrorBoundary] Failed to copy to clipboard')
    }
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state
    const { children, fallback } = this.props

    if (hasError) {
      // Custom fallback provided
      if (fallback) {
        return fallback
      }

      // Default error UI
      return (
        <div className="h-screen flex flex-col bg-[#0a0a0a] text-white">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gradient-to-r from-[#0f0f0f] to-[#1a1a1a]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden="true" />
              <h1 className="text-sm font-semibold text-white">Something went wrong</h1>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
            </div>

            <h2 className="text-lg font-semibold mb-2">Tabz encountered an error</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-xs">
              The sidebar crashed unexpectedly. Your terminal sessions are still running in the background.
            </p>

            {/* Error message */}
            <div className="w-full max-w-sm mb-6">
              <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-left">
                <p className="text-xs text-red-400 font-mono break-all">
                  {error?.message || 'Unknown error'}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-[#00ff88]/20 border border-[#00ff88]/30 rounded-md text-[#00ff88] text-sm font-medium hover:bg-[#00ff88]/30 transition-colors flex items-center gap-2"
                aria-label="Try to recover without reloading"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-300 text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-2"
                aria-label="Reload the sidebar"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reload Sidebar
              </button>
            </div>

            {/* Copy error button */}
            <button
              onClick={this.handleCopyError}
              data-copy-error-btn
              className="text-xs text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
              aria-label="Copy error details to clipboard"
            >
              <Bug className="h-3 w-3" aria-hidden="true" />
              Copy error details for bug report
            </button>

            {/* Expandable stack trace */}
            {errorInfo?.componentStack && (
              <details className="w-full max-w-sm mt-6 text-left">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                  Show technical details
                </summary>
                <pre className="mt-2 p-2 bg-black/50 border border-gray-800 rounded text-[10px] text-gray-500 overflow-auto max-h-32 font-mono">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-500">
              Terminals running in tmux are preserved. Reload to reconnect.
            </p>
          </div>
        </div>
      )
    }

    return children
  }
}

export default ErrorBoundary
