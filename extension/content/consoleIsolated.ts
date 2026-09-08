import {
  TABZ_CONSOLE_MARKER,
  createConsoleBridgeRateLimiter,
  createConsoleReadyMessage,
  createForwardedConsoleLogMessage,
} from '../shared/consoleBridge'

export interface ConsoleBridgeRuntime {
  id?: string
  sendMessage(message: unknown): Promise<unknown> | undefined
}

/** Install in each isolated frame at document_start. */
export function installIsolatedConsoleBridge(target: Window, runtime: ConsoleBridgeRuntime): void {
  const acceptBridgeEvent = createConsoleBridgeRateLimiter()
  target.addEventListener('message', event => {
    if (event.source !== target || !event.data || typeof event.data !== 'object' ||
        (event.data as Record<string, unknown>)[TABZ_CONSOLE_MARKER] !== true || !acceptBridgeEvent()) return
    let pageUrl = ''
    try { pageUrl = target.location.href } catch { return }
    const message = createForwardedConsoleLogMessage(event, target, pageUrl, runtime.id || '')
    if (!message) return
    try {
      const sent = runtime.sendMessage(message)
      sent?.catch(() => undefined)
    } catch {
      // The extension context may have been invalidated.
    }
  })

  try { target.postMessage(createConsoleReadyMessage(), '*') } catch { /* MAIN buffer remains bounded. */ }
}

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
  installIsolatedConsoleBridge(window, chrome.runtime)
}
