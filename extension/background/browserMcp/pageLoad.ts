const DEFAULT_PAGE_LOAD_TIMEOUT_MS = 15000

/**
 * Wait for a tab to finish loading without missing a completion that lands
 * between the caller's initial status read and listener registration.
 */
export function waitForTabLoadComplete(
  tabId: number,
  timeoutMs = DEFAULT_PAGE_LOAD_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
    }

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }

    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish()
    }

    const onRemoved = (removedTabId: number) => {
      if (removedTabId === tabId) {
        finish(new Error(`Tab ${tabId} was closed before it finished loading`))
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    timeout = setTimeout(
      () => finish(new Error('Tab did not finish loading within 15 seconds')),
      timeoutMs
    )

    // Subscribe first, then close the gap after the caller's initial read.
    void chrome.tabs.get(tabId).then(
      tab => {
        if (tab.status === 'complete') finish()
      },
      error => finish(error instanceof Error ? error : new Error(String(error)))
    )
  })
}
