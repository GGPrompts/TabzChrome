/**
 * Utility functions for background service worker
 * Common helpers extracted from duplicated code
 */

import { broadcastToClients } from './state'

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
 * Profile interface for type safety
 */
interface Profile {
  id: string
  name: string
  workingDir?: string
  command?: string
  color?: string
  icon?: string
}

/**
 * Spawn a quick popout terminal using the default profile
 * This is used for keyboard shortcuts and context menu actions
 * Returns the terminal ID if successful
 */
export async function spawnQuickTerminal(): Promise<{ success: boolean; terminalId?: string; error?: string }> {
  try {
    // Get auth token from backend
    const tokenResponse = await fetch('http://localhost:8129/api/auth/token')
    if (!tokenResponse.ok) {
      return { success: false, error: 'Failed to get auth token - is the backend running?' }
    }
    const { token } = await tokenResponse.json()

    // Get default profile and global working directory from Chrome storage
    const result = await chrome.storage.local.get(['profiles', 'defaultProfile', 'globalWorkingDir'])
    const profiles = (result.profiles || []) as Profile[]
    const defaultProfileId = (result.defaultProfile as string) || 'default'
    const globalWorkingDir = (result.globalWorkingDir as string) || '~'

    // Find the default profile
    const profile = profiles.find(p => p.id === defaultProfileId) || profiles[0]
    if (!profile) {
      return { success: false, error: 'No profiles found' }
    }

    // Determine working directory (profile overrides global)
    const workingDir = profile.workingDir || globalWorkingDir

    // Spawn the terminal via API
    const spawnResponse = await fetch('http://localhost:8129/api/spawn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': token
      },
      body: JSON.stringify({
        name: profile.name || 'Quick Terminal',
        workingDir,
        command: profile.command || null
      })
    })

    if (!spawnResponse.ok) {
      const err = await spawnResponse.json()
      return { success: false, error: err.error || 'Failed to spawn terminal' }
    }

    const { terminal } = await spawnResponse.json()
    const terminalId = terminal.id

    // Open popout window with the new terminal
    const sidepanelUrl = chrome.runtime.getURL(`sidepanel/sidepanel.html?popout=true&terminal=${encodeURIComponent(terminalId)}`)

    const newWindow = await chrome.windows.create({
      url: sidepanelUrl,
      type: 'popup',
      width: 800,
      height: 600,
      focused: true,
    })

    // Notify sidebar that this terminal is in a popout window
    // This prevents it from rendering the terminal (shows placeholder instead)
    if (newWindow?.id) {
      broadcastToClients({
        type: 'TERMINAL_POPPED_OUT',
        terminalId,
        windowId: newWindow.id,
      })
    }

    console.log('[Background] Quick terminal spawned:', terminalId)
    return { success: true, terminalId }
  } catch (err) {
    console.error('[Background] Failed to spawn quick terminal:', err)
    return { success: false, error: (err as Error).message }
  }
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
