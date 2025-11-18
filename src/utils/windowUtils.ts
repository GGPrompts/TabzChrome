/**
 * Window Utility Functions
 *
 * Helpers for multi-window support and window ID management.
 * Used across SimpleTerminalApp for popout functionality.
 */

/**
 * Generate a unique window ID for multi-window support
 * Format: window-{timestamp}-{random}
 * Example: window-1762685234-abc123
 *
 * @returns A unique window identifier
 */
export function generateWindowId(): string {
  return `window-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get the current window ID from URL parameters or generate a new one
 * Main window uses 'main' as ID, new windows get unique IDs
 *
 * @param urlParams - URLSearchParams from current URL
 * @returns The window ID ('main' or generated ID)
 */
export function getCurrentWindowId(urlParams: URLSearchParams): string {
  // Check if window ID is already in URL
  const windowIdFromUrl = urlParams.get('window')
  if (windowIdFromUrl) {
    return windowIdFromUrl
  }

  // Main window uses 'main' as ID, new windows get unique IDs
  const isMainWindow = !urlParams.has('window')
  return isMainWindow ? 'main' : generateWindowId()
}

/**
 * Update the URL with a window ID without page reload
 *
 * @param windowId - The window ID to set in the URL
 */
export function updateUrlWithWindowId(windowId: string): void {
  if (windowId === 'main') return // Don't add 'main' to URL

  const newUrl = new URL(window.location.href)
  newUrl.searchParams.set('window', windowId)
  window.history.replaceState({}, '', newUrl)
}
