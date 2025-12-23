/**
 * Utility functions for background service worker
 * Common helpers extracted from duplicated code
 */

/**
 * Convert Windows path to WSL path
 * e.g., "C:\Users\matt\Downloads\file.png" -> "/mnt/c/Users/matt/Downloads/file.png"
 */
export function windowsToWslPath(windowsPath: string): string {
  // Check if it's a Windows-style path (C:\, D:\, etc.)
  const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/)
  if (match) {
    const driveLetter = match[1].toLowerCase()
    const restOfPath = match[2].replace(/\\/g, '/')
    return `/mnt/${driveLetter}/${restOfPath}`
  }
  return windowsPath
}

/**
 * Get a valid window ID, with fallback to focused/first window
 * Used because tab.windowId can be -1 on chrome:// pages
 */
export async function getValidWindowId(tab?: chrome.tabs.Tab): Promise<number | undefined> {
  if (tab?.windowId && tab.windowId > 0) {
    return tab.windowId
  }
  // Fallback: get focused window
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
  const targetWindow = windows.find(w => w.focused) || windows[0]
  return targetWindow?.id
}

/**
 * Try to open the sidebar panel
 * Returns true if successful, false if failed
 */
export async function tryOpenSidebar(windowId?: number): Promise<boolean> {
  try {
    const targetWindowId = windowId || await getValidWindowId()
    if (targetWindowId) {
      await chrome.sidePanel.open({ windowId: targetWindowId })
      return true
    }
  } catch (err) {
    // Silently ignore - user gesture may not be available
    console.debug('[Background] Could not open sidebar:', err)
  }
  return false
}

/**
 * Wait for download to complete with timeout
 */
export function waitForDownload(
  downloadId: number,
  timeoutMs: number = 30000
): Promise<{
  success: boolean
  filename?: string
  windowsPath?: string
  wslPath?: string
  fileSize?: number
  error?: string
}> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        success: true,
        error: 'Download started but completion check timed out. Check chrome://downloads for status.'
      })
    }, timeoutMs)

    const checkDownload = () => {
      chrome.downloads.search({ id: downloadId }, (results) => {
        if (results.length === 0) {
          clearTimeout(timeout)
          resolve({ success: false, error: 'Download not found' })
          return
        }

        const download = results[0]

        if (download.state === 'complete') {
          clearTimeout(timeout)
          const winPath = download.filename
          resolve({
            success: true,
            filename: winPath.split(/[/\\]/).pop() || download.filename,
            windowsPath: winPath,
            wslPath: windowsToWslPath(winPath),
            fileSize: download.fileSize
          })
        } else if (download.state === 'interrupted') {
          clearTimeout(timeout)
          resolve({
            success: false,
            error: download.error || 'Download interrupted'
          })
        } else {
          // Still in progress, check again
          setTimeout(checkDownload, 500)
        }
      })
    }

    // Start checking after a brief delay
    setTimeout(checkDownload, 100)
  })
}
