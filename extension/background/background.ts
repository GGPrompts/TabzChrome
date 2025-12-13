import type { ExtensionMessage, ConsoleLogEntry, ConsoleLogLevel } from '../shared/messaging'
import { getLocal } from '../shared/storage'

// WebSocket connection to backend
let ws: WebSocket | null = null
let wsReconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const WS_URL = 'ws://localhost:8129'  // Extension loaded from WSL path, use localhost

// Alarm names
const ALARM_WS_RECONNECT = 'ws-reconnect'
const ALARM_SESSION_HEALTH = 'session-health'

// Track connected clients (popup, sidepanel, devtools)
const connectedClients = new Set<chrome.runtime.Port>()

// Pending commands (for race condition when sidebar opens fresh)
let pendingQueueCommand: string | null = null  // Goes to chat bar
let pendingPasteCommand: string | null = null  // Goes directly to terminal

// ============================================
// BROWSER MCP - Console Log Storage
// ============================================
const MAX_CONSOLE_LOGS = 1000
const consoleLogs: ConsoleLogEntry[] = []

function addConsoleLog(entry: ConsoleLogEntry) {
  consoleLogs.push(entry)
  // Keep buffer size limited (circular buffer)
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift()
  }
  // Forward to backend via WebSocket for MCP server access
  if (ws?.readyState === WebSocket.OPEN) {
    sendToWebSocket({
      type: 'browser-console-log',
      entry
    })
  }
}

function getConsoleLogs(options: {
  level?: ConsoleLogLevel | 'all'
  limit?: number
  since?: number
  tabId?: number
}): ConsoleLogEntry[] {
  let filtered = [...consoleLogs]

  // Filter by level
  if (options.level && options.level !== 'all') {
    filtered = filtered.filter(log => log.level === options.level)
  }

  // Filter by timestamp
  if (options.since) {
    filtered = filtered.filter(log => log.timestamp >= options.since!)
  }

  // Filter by tab
  if (options.tabId) {
    filtered = filtered.filter(log => log.tabId === options.tabId)
  }

  // Apply limit (from most recent)
  const limit = options.limit || 100
  return filtered.slice(-limit)
}

// ============================================
// BROWSER MCP - Request handlers
// ============================================

// Handle script execution request from backend (MCP server)
async function handleBrowserExecuteScript(message: { requestId: string; code: string; tabId?: number; allFrames?: boolean }) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-script-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Execute predefined operations without eval (CSP-safe)
    // For arbitrary code, we use a set of safe predefined functions
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId, allFrames: message.allFrames || false },
      func: (code: string) => {
        try {
          // Predefined safe operations that don't require eval
          // These cover common use cases for browser automation

          // Get all links
          if (code === 'document.links' || code.includes('document.links')) {
            const links = [...document.links].map(a => ({
              text: a.textContent?.trim() || '',
              href: a.href
            }))
            return { success: true, result: links }
          }

          // Get page title
          if (code === 'document.title') {
            return { success: true, result: document.title }
          }

          // Get page HTML (truncated)
          if (code.includes('outerHTML') || code.includes('innerHTML')) {
            return { success: true, result: document.documentElement.outerHTML.slice(0, 10000) }
          }

          // Get all images
          if (code.includes('document.images')) {
            const images = [...document.images].map(img => ({
              src: img.src,
              alt: img.alt
            }))
            return { success: true, result: images }
          }

          // Get text content
          if (code.includes('textContent') || code.includes('innerText')) {
            return { success: true, result: document.body.innerText.slice(0, 10000) }
          }

          // Query selector - extract selector from code
          const selectorMatch = code.match(/querySelector\(['"]([^'"]+)['"]\)/)
          if (selectorMatch) {
            const el = document.querySelector(selectorMatch[1])
            if (el) {
              return { success: true, result: {
                tagName: el.tagName,
                text: el.textContent?.trim(),
                html: el.outerHTML.slice(0, 1000)
              }}
            }
            return { success: false, error: `Element not found: ${selectorMatch[1]}` }
          }

          // Query selector all
          const selectorAllMatch = code.match(/querySelectorAll\(['"]([^'"]+)['"]\)/)
          if (selectorAllMatch) {
            const els = document.querySelectorAll(selectorAllMatch[1])
            const results = [...els].slice(0, 100).map(el => ({
              tagName: el.tagName,
              text: el.textContent?.trim()
            }))
            return { success: true, result: results }
          }

          // localStorage
          if (code.includes('localStorage')) {
            const storage: Record<string, string> = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key) storage[key] = localStorage.getItem(key) || ''
            }
            return { success: true, result: storage }
          }

          // For any other code, return an error explaining the limitation
          return {
            success: false,
            error: 'Arbitrary code execution blocked by CSP. Use predefined operations: document.links, document.title, document.images, querySelector("selector"), querySelectorAll("selector"), localStorage, textContent, outerHTML'
          }
        } catch (e) {
          return { success: false, error: (e as Error).message }
        }
      },
      args: [message.code]
    })

    const result = results[0]?.result as { success: boolean; result?: unknown; error?: string } | undefined
    sendToWebSocket({
      type: 'browser-script-result',
      requestId: message.requestId,
      success: result?.success || false,
      result: result?.result,
      error: result?.error
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-script-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Handle page info request from backend (MCP server)
async function handleBrowserGetPageInfo(message: { requestId: string; tabId?: number }) {
  try {
    const tabs = message.tabId
      ? [await chrome.tabs.get(message.tabId)]
      : await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]

    if (tab) {
      sendToWebSocket({
        type: 'browser-page-info',
        requestId: message.requestId,
        url: tab.url || '',
        title: tab.title || '',
        tabId: tab.id || -1,
        favIconUrl: tab.favIconUrl
      })
    } else {
      sendToWebSocket({
        type: 'browser-page-info',
        requestId: message.requestId,
        url: '',
        title: '',
        tabId: -1,
        error: 'No active tab found'
      })
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-page-info',
      requestId: message.requestId,
      url: '',
      title: '',
      tabId: -1,
      error: (err as Error).message
    })
  }
}

// ============================================
// BROWSER MCP - Tab Management Handlers
// ============================================

/**
 * List all browser tabs with accurate active state
 * Unlike CDP, extension API knows the REAL focused tab
 */
async function handleBrowserListTabs(message: { requestId: string }) {
  try {
    // Get all tabs in the current window
    const allTabs = await chrome.tabs.query({ currentWindow: true })

    // Filter out chrome:// and extension pages
    const tabs = allTabs.filter(tab =>
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://')
    )

    const tabList = tabs.map((tab, index) => ({
      tabId: tab.id || -1,
      index: index + 1, // 1-based for user display
      url: tab.url || '',
      title: tab.title || '',
      active: tab.active,
      favIconUrl: tab.favIconUrl
    }))

    sendToWebSocket({
      type: 'browser-list-tabs-result',
      requestId: message.requestId,
      tabs: tabList,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-list-tabs-result',
      requestId: message.requestId,
      tabs: [],
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Switch to a specific tab by Chrome tab ID
 */
async function handleBrowserSwitchTab(message: { requestId: string; tabId: number }) {
  try {
    await chrome.tabs.update(message.tabId, { active: true })

    // Also focus the window containing this tab
    const tab = await chrome.tabs.get(message.tabId)
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }

    sendToWebSocket({
      type: 'browser-switch-tab-result',
      requestId: message.requestId,
      success: true,
      tabId: message.tabId
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-switch-tab-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Get the currently active tab
 */
async function handleBrowserGetActiveTab(message: { requestId: string }) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (tab) {
      sendToWebSocket({
        type: 'browser-get-active-tab-result',
        requestId: message.requestId,
        success: true,
        tab: {
          tabId: tab.id || -1,
          url: tab.url || '',
          title: tab.title || '',
          favIconUrl: tab.favIconUrl
        }
      })
    } else {
      sendToWebSocket({
        type: 'browser-get-active-tab-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-active-tab-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// BROWSER MCP - Profile Handler
// ============================================

/**
 * Get all profiles from Chrome storage
 * Allows Claude to see available terminal profiles for spawning
 */
async function handleBrowserGetProfiles(message: { requestId: string }) {
  try {
    const result = await chrome.storage.local.get(['profiles', 'defaultProfile', 'globalWorkingDir'])
    const profiles = (result.profiles || []) as Array<{
      id: string
      name: string
      workingDir?: string
      command?: string
      category?: string
    }>
    const defaultProfileId = result.defaultProfile as string | undefined
    const globalWorkingDir = (result.globalWorkingDir as string) || '~'

    sendToWebSocket({
      type: 'browser-profiles-result',
      requestId: message.requestId,
      success: true,
      profiles: profiles.map(p => ({
        id: p.id,
        name: p.name,
        workingDir: p.workingDir || '',
        command: p.command || '',
        category: p.category || ''
      })),
      defaultProfileId,
      globalWorkingDir
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-profiles-result',
      requestId: message.requestId,
      success: false,
      profiles: [],
      error: (err as Error).message
    })
  }
}

/**
 * Get lightweight settings for external integrations (like GGPrompts)
 * Returns just globalWorkingDir and default profile name - no full profiles array
 */
async function handleBrowserGetSettings(message: { requestId: string }) {
  try {
    const result = await chrome.storage.local.get(['profiles', 'defaultProfile', 'globalWorkingDir'])
    const profiles = (result.profiles || []) as Array<{ id: string; name: string }>
    const defaultProfileId = result.defaultProfile as string | undefined
    const globalWorkingDir = (result.globalWorkingDir as string) || '~'

    // Find default profile name
    const defaultProfile = profiles.find(p => p.id === defaultProfileId)
    const defaultProfileName = defaultProfile?.name || 'Bash'

    sendToWebSocket({
      type: 'browser-settings-result',
      requestId: message.requestId,
      success: true,
      globalWorkingDir,
      defaultProfileName
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-settings-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// BROWSER MCP - Download Handlers
// ============================================

/**
 * Convert Windows path to WSL path
 * e.g., "C:\Users\matt\Downloads\file.png" -> "/mnt/c/Users/matt/Downloads/file.png"
 */
function windowsToWslPath(windowsPath: string): string {
  // Check if it's a Windows-style path (C:\, D:\, etc.)
  const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/)
  if (match) {
    const driveLetter = match[1].toLowerCase()
    const restOfPath = match[2].replace(/\\/g, '/')
    return `/mnt/${driveLetter}/${restOfPath}`
  }
  return windowsPath
}

// Handle download file request from backend (MCP server)
async function handleBrowserDownloadFile(message: {
  requestId: string
  url: string
  filename?: string
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
}) {
  try {
    const downloadOptions: chrome.downloads.DownloadOptions = {
      url: message.url,
      conflictAction: message.conflictAction || 'uniquify'
    }

    if (message.filename) {
      downloadOptions.filename = message.filename
    }

    // Start the download
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download(downloadOptions, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (id === undefined) {
          reject(new Error('Download failed to start'))
        } else {
          resolve(id)
        }
      })
    })

    // Wait for download to complete (with timeout)
    const result = await new Promise<{
      success: boolean
      filename?: string
      windowsPath?: string
      wslPath?: string
      fileSize?: number
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: true,
          error: 'Download started but completion check timed out. Check chrome://downloads for status.'
        })
      }, 30000) // 30 second timeout

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
            const windowsPath = download.filename
            resolve({
              success: true,
              filename: windowsPath.split(/[/\\]/).pop() || download.filename,
              windowsPath: windowsPath,
              wslPath: windowsToWslPath(windowsPath),
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

    sendToWebSocket({
      type: 'browser-download-result',
      requestId: message.requestId,
      ...result
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-download-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Handle get downloads request from backend (MCP server)
async function handleBrowserGetDownloads(message: {
  requestId: string
  limit?: number
  state?: 'in_progress' | 'complete' | 'interrupted' | 'all'
}) {
  try {
    const query: chrome.downloads.DownloadQuery = {
      limit: message.limit || 20,
      orderBy: ['-startTime']
    }

    if (message.state && message.state !== 'all') {
      query.state = message.state
    }

    const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve) => {
      chrome.downloads.search(query, resolve)
    })

    const formattedDownloads = downloads.map((d) => ({
      id: d.id,
      url: d.url,
      filename: d.filename.split(/[/\\]/).pop() || d.filename,
      state: d.state,
      bytesReceived: d.bytesReceived,
      totalBytes: d.totalBytes,
      startTime: d.startTime,
      endTime: d.endTime,
      error: d.error,
      mime: d.mime,
      windowsPath: d.filename,
      wslPath: windowsToWslPath(d.filename)
    }))

    sendToWebSocket({
      type: 'browser-downloads-list',
      requestId: message.requestId,
      downloads: formattedDownloads,
      total: formattedDownloads.length
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-downloads-list',
      requestId: message.requestId,
      downloads: [],
      total: 0,
      error: (err as Error).message
    })
  }
}

// Handle cancel download request from backend (MCP server)
async function handleBrowserCancelDownload(message: {
  requestId: string
  downloadId: number
}) {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.downloads.cancel(message.downloadId, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve()
        }
      })
    })

    sendToWebSocket({
      type: 'browser-cancel-download-result',
      requestId: message.requestId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cancel-download-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Handle capture image request from backend (MCP server)
// Uses canvas capture - works for blob URLs (AI-generated images) without CDP
async function handleBrowserCaptureImage(message: {
  requestId: string
  selector?: string
  tabId?: number
  outputPath?: string
}) {
  try {
    // Get target tab
    const tabs = message.tabId
      ? [{ id: message.tabId }]
      : await chrome.tabs.query({ active: true, currentWindow: true })

    const targetTab = tabs[0]
    if (!targetTab?.id) {
      throw new Error('No active tab found')
    }

    // Execute canvas capture in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (selector: string) => {
        // Find the image element
        let imgEl: HTMLImageElement | null = null

        if (selector) {
          const el = document.querySelector(selector)
          if (el?.tagName === 'IMG') {
            imgEl = el as HTMLImageElement
          } else if (el) {
            // Try to find an img inside the selected element
            imgEl = el.querySelector('img')
          }
        }

        // Fallback: find first significant image on page
        if (!imgEl) {
          const imgs = Array.from(document.querySelectorAll('img'))
          // Find largest image (likely the main content)
          imgEl = imgs.reduce((best, img) => {
            const area = img.naturalWidth * img.naturalHeight
            const bestArea = best ? best.naturalWidth * best.naturalHeight : 0
            return area > bestArea ? img : best
          }, null as HTMLImageElement | null)
        }

        if (!imgEl) {
          return { error: 'No image found on page' }
        }

        // Check if image is loaded
        if (!imgEl.complete || imgEl.naturalWidth === 0) {
          return { error: 'Image not fully loaded' }
        }

        // Capture via canvas
        try {
          const canvas = document.createElement('canvas')
          canvas.width = imgEl.naturalWidth || imgEl.width
          canvas.height = imgEl.naturalHeight || imgEl.height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            return { error: 'Could not create canvas context' }
          }
          ctx.drawImage(imgEl, 0, 0)

          // Export as PNG data URL
          const dataUrl = canvas.toDataURL('image/png')
          return {
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            src: imgEl.src.substring(0, 200) // Truncate for logging
          }
        } catch (e) {
          // Tainted canvas (cross-origin image)
          return { error: `Canvas capture failed: ${(e as Error).message}. Image may be cross-origin.` }
        }
      },
      args: [message.selector || '']
    })

    const result = results[0]?.result as {
      dataUrl?: string
      width?: number
      height?: number
      src?: string
      error?: string
    }

    if (result?.error) {
      throw new Error(result.error)
    }

    if (!result?.dataUrl) {
      throw new Error('No image data captured')
    }

    // Convert data URL to blob and download
    const base64Data = result.dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'image/png' })
    const blobUrl = URL.createObjectURL(blob)

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = message.outputPath
      ? message.outputPath.split(/[/\\]/).pop() || `captured-image-${timestamp}.png`
      : `captured-image-${timestamp}.png`

    // Download the blob
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        conflictAction: 'uniquify'
      }, (id) => {
        URL.revokeObjectURL(blobUrl) // Clean up blob URL
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (id === undefined) {
          reject(new Error('Download failed to start'))
        } else {
          resolve(id)
        }
      })
    })

    // Wait for download to complete
    const downloadResult = await new Promise<{
      success: boolean
      filePath?: string
      windowsPath?: string
      wslPath?: string
      width?: number
      height?: number
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Download timed out' })
      }, 10000)

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
            const windowsPath = download.filename
            resolve({
              success: true,
              filePath: windowsToWslPath(windowsPath),
              windowsPath: windowsPath,
              wslPath: windowsToWslPath(windowsPath),
              width: result.width,
              height: result.height
            })
          } else if (download.state === 'interrupted') {
            clearTimeout(timeout)
            resolve({ success: false, error: download.error || 'Download interrupted' })
          } else {
            setTimeout(checkDownload, 200)
          }
        })
      }
      setTimeout(checkDownload, 100)
    })

    sendToWebSocket({
      type: 'browser-capture-image-result',
      requestId: message.requestId,
      ...downloadResult
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-capture-image-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Initialize background service worker
console.log('Terminal Tabs background service worker starting...')

// WebSocket connection management
async function connectWebSocket() {
  // Already connected
  if (ws?.readyState === WebSocket.OPEN) {
    console.log('WebSocket already connected')
    return
  }

  // Already connecting - don't create duplicate connection
  if (ws?.readyState === WebSocket.CONNECTING) {
    console.log('WebSocket already connecting, waiting...')
    return
  }

  // Close any existing connection in CLOSING state before creating new one
  if (ws) {
    try {
      ws.close()
    } catch (e) {
      // Ignore errors when closing
    }
    ws = null
  }

  // Fetch auth token from backend before connecting
  let wsUrl = WS_URL
  try {
    const tokenResponse = await fetch('http://localhost:8129/api/auth/token')
    if (tokenResponse.ok) {
      const { token } = await tokenResponse.json()
      if (token) {
        wsUrl = `${WS_URL}?token=${token}`
        console.log('Got auth token for WebSocket connection')
      }
    }
  } catch (e) {
    // Backend might not require auth (older version) - continue without token
    console.log('No auth token available, connecting without authentication')
  }

  console.log('Connecting to backend WebSocket:', WS_URL)
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('✅ Background WebSocket connected')
    wsReconnectAttempts = 0 // Reset reconnect counter on successful connection
    chrome.alarms.clear(ALARM_WS_RECONNECT) // Clear any pending reconnect alarm

    // Identify as sidebar to backend so it counts us for "multiple browser windows" warning
    // Web pages connecting via WebSocket (like docs site) won't send this, so they won't
    // be counted, preventing false "duplicate output" warnings for users
    sendToWebSocket({ type: 'identify', clientType: 'sidebar' })

    updateBadge('ws.onopen')
    broadcastToClients({ type: 'WS_CONNECTED' })
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)

      // Handle terminal output specially - broadcast directly as TERMINAL_OUTPUT
      if (message.type === 'output' || message.type === 'terminal-output') {
        broadcastToClients({
          type: 'TERMINAL_OUTPUT',
          terminalId: message.terminalId,
          data: message.data,
        })
      } else if (message.type === 'terminals') {
        // Terminal list received on connection - restore sessions
        // Update badge based on terminal count
        const terminalCount = message.data?.length || 0
        chrome.action.setBadgeText({ text: terminalCount > 0 ? String(terminalCount) : '' })
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })

        broadcastToClients({
          type: 'WS_MESSAGE',
          data: message,
        })
      } else if (message.type === 'terminal-spawned') {
        // Terminal spawned - broadcast first so sidepanel can focus it
        const clientMessage: ExtensionMessage = {
          type: 'WS_MESSAGE',
          data: message,
        }
        broadcastToClients(clientMessage)

        // Update badge count without requesting full terminal list
        // (requesting list would trigger reconciliation and reset focus)
        chrome.action.getBadgeText({}, (text) => {
          const count = text ? parseInt(text) : 0
          chrome.action.setBadgeText({ text: String(count + 1) })
          chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })
        })
      } else if (message.type === 'terminal-closed') {
        // Terminal closed - broadcast first
        broadcastToClients({
          type: 'WS_MESSAGE',
          data: message,
        })

        // Update badge count without requesting full terminal list
        chrome.action.getBadgeText({}, (text) => {
          const count = text ? parseInt(text) : 0
          const newCount = Math.max(0, count - 1)
          chrome.action.setBadgeText({ text: newCount > 0 ? String(newCount) : '' })
          if (newCount > 0) {
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })
          }
        })
      } else if (message.type === 'terminal-reconnected') {
        // Terminal reconnected after backend restart - broadcast to terminals
        // Terminal component will clear content and resize
        broadcastToClients({
          type: 'TERMINAL_RECONNECTED',
          terminalId: message.data?.id,
        })
      }
      // ============================================
      // BROWSER MCP - Handle requests from backend
      // ============================================
      else if (message.type === 'browser-execute-script') {
        // Execute script in browser tab (request from MCP server via backend)
        console.log('🔧 Browser MCP: execute-script request', message.requestId)
        handleBrowserExecuteScript(message)
      } else if (message.type === 'browser-get-page-info') {
        // Get page info (request from MCP server via backend)
        console.log('🔧 Browser MCP: get-page-info request', message.requestId)
        handleBrowserGetPageInfo(message)
      }
      // ============================================
      // BROWSER MCP - Tab management handlers
      // ============================================
      else if (message.type === 'browser-list-tabs') {
        // List all tabs with accurate active state
        console.log('📑 Browser MCP: list-tabs request', message.requestId)
        handleBrowserListTabs(message)
      } else if (message.type === 'browser-switch-tab') {
        // Switch to a specific tab
        console.log('📑 Browser MCP: switch-tab request', message.requestId, message.tabId)
        handleBrowserSwitchTab(message)
      } else if (message.type === 'browser-get-active-tab') {
        // Get the currently active tab
        console.log('📑 Browser MCP: get-active-tab request', message.requestId)
        handleBrowserGetActiveTab(message)
      } else if (message.type === 'browser-get-profiles') {
        // Get all terminal profiles
        console.log('📋 Browser MCP: get-profiles request', message.requestId)
        handleBrowserGetProfiles(message)
      } else if (message.type === 'browser-get-settings') {
        // Get lightweight settings for external integrations
        console.log('⚙️ Browser MCP: get-settings request', message.requestId)
        handleBrowserGetSettings(message)
      }
      // ============================================
      // BROWSER MCP - Download handlers
      // ============================================
      else if (message.type === 'browser-download-file') {
        // Download file (request from MCP server via backend)
        console.log('📥 Browser MCP: download-file request', message.requestId, message.url)
        handleBrowserDownloadFile(message)
      } else if (message.type === 'browser-get-downloads') {
        // Get downloads list (request from MCP server via backend)
        console.log('📥 Browser MCP: get-downloads request', message.requestId)
        handleBrowserGetDownloads(message)
      } else if (message.type === 'browser-cancel-download') {
        // Cancel download (request from MCP server via backend)
        console.log('📥 Browser MCP: cancel-download request', message.requestId, message.downloadId)
        handleBrowserCancelDownload(message)
      } else if (message.type === 'browser-capture-image') {
        // Capture image via canvas (works for blob URLs / AI-generated images)
        console.log('📸 Browser MCP: capture-image request', message.requestId, message.selector)
        handleBrowserCaptureImage(message)
      } else {
        // Broadcast other messages as WS_MESSAGE
        const clientMessage: ExtensionMessage = {
          type: 'WS_MESSAGE',
          data: message,
        }
        broadcastToClients(clientMessage)
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err)
    }
  }

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', {
      url: WS_URL,
      readyState: ws?.readyState,
      readyStateText: ws?.readyState === 0 ? 'CONNECTING' : ws?.readyState === 1 ? 'OPEN' : ws?.readyState === 2 ? 'CLOSING' : ws?.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
      error: error,
    })
  }

  ws.onclose = (event) => {
    // Close codes: https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
    // 1000 = normal, 1001 = going away, 1006 = abnormal (no close frame), 1011 = server error
    const codeDescriptions: Record<number, string> = {
      1000: 'Normal closure',
      1001: 'Going away (page navigating or server shutting down)',
      1002: 'Protocol error',
      1003: 'Unsupported data',
      1005: 'No status received',
      1006: 'Abnormal closure (connection lost without close frame)',
      1007: 'Invalid frame payload data',
      1008: 'Policy violation',
      1009: 'Message too big',
      1010: 'Missing extension',
      1011: 'Internal server error',
      1012: 'Service restart',
      1013: 'Try again later',
      1014: 'Bad gateway',
      1015: 'TLS handshake failure',
    }
    console.log('WebSocket closed:', {
      code: event.code,
      codeDescription: codeDescriptions[event.code] || 'Unknown',
      reason: event.reason || '(no reason provided)',
      wasClean: event.wasClean,
      url: WS_URL,
    })

    ws = null
    broadcastToClients({ type: 'WS_DISCONNECTED' })

    // Schedule reconnection using alarms (survives service worker idle)
    scheduleReconnect()
  }
}

// Send message to WebSocket
function sendToWebSocket(data: any) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  } else {
    console.error('[Background] ❌ WebSocket not connected! State:', ws?.readyState, 'Cannot send:', data)
    // Try to reconnect if not connected
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      console.log('[Background] Attempting to reconnect WebSocket...')
      connectWebSocket()
    }
  }
}

// Broadcast message to all connected extension pages
function broadcastToClients(message: ExtensionMessage) {
  connectedClients.forEach(port => {
    try {
      port.postMessage(message)
    } catch (err) {
      console.error('Failed to send message to client:', err)
      connectedClients.delete(port)
    }
  })
}

// Update extension badge with active terminal count
// This queries the backend for the actual terminal count
async function updateBadge(source: string = 'unknown') {
  // Request terminal list from backend
  if (ws?.readyState === WebSocket.OPEN) {
    console.log(`[Badge] Requesting list-terminals (source: ${source})`)
    sendToWebSocket({ type: 'list-terminals' })
    // Badge will be updated when we receive the 'terminals' response
  } else {
    // If not connected, clear the badge
    chrome.action.setBadgeText({ text: '' })
  }
}

// ============================================
// ALARMS API - WebSocket Reliability
// ============================================

// Schedule WebSocket reconnection with exponential backoff
function scheduleReconnect() {
  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('🛑 Max reconnect attempts reached, stopping auto-reconnect')
    return
  }

  // Exponential backoff: 0.5s, 1s, 2s, 4s, 8s, ... up to 30s
  const delaySeconds = Math.min(30, Math.pow(2, wsReconnectAttempts) * 0.5)
  wsReconnectAttempts++

  console.log(`⏰ Scheduling WebSocket reconnect in ${delaySeconds}s (attempt ${wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

  // Use alarms API - survives service worker going idle
  chrome.alarms.create(ALARM_WS_RECONNECT, {
    delayInMinutes: delaySeconds / 60
  })
}

// Initialize periodic health check alarm
async function initializeAlarms() {
  // Clear any existing alarms first
  await chrome.alarms.clear(ALARM_SESSION_HEALTH)

  // Create session health check alarm (every 5 minutes)
  chrome.alarms.create(ALARM_SESSION_HEALTH, {
    delayInMinutes: 1, // First check after 1 minute
    periodInMinutes: 5 // Then every 5 minutes
  })

  console.log('⏰ Session health check alarm initialized (every 5 minutes)')
}

// Alarm event handler
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('⏰ Alarm fired:', alarm.name)

  if (alarm.name === ALARM_WS_RECONNECT) {
    console.log('⏰ WebSocket reconnect alarm triggered')
    connectWebSocket()
  } else if (alarm.name === ALARM_SESSION_HEALTH) {
    console.log('⏰ Session health check alarm triggered')
    // Request terminal list to verify sessions are still alive
    if (ws?.readyState === WebSocket.OPEN) {
      console.log('[Badge] Requesting list-terminals (source: health-check-alarm)')
      sendToWebSocket({ type: 'list-terminals' })
    } else {
      console.log('⚠️ WebSocket not connected during health check, attempting reconnect')
      connectWebSocket()
    }
  }
})

// ============================================
// OMNIBOX API - Address Bar Commands
// ============================================

// Set default suggestion when user types "term "
chrome.omnibox.setDefaultSuggestion({
  description: 'Run command in terminal: <match>%s</match> (or type "profile:name", "new", "help", or a URL)'
})

// Allowed URL patterns for omnibox navigation (path is optional)
const ALLOWED_URL_PATTERNS = [
  /^https?:\/\/(www\.)?github\.com(\/.*)?$/i,
  /^https?:\/\/(www\.)?gitlab\.com(\/.*)?$/i,
  /^https?:\/\/localhost(:\d+)?(\/.*)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/i,
  /^https?:\/\/[\w-]+\.vercel\.app(\/.*)?$/i,  // Vercel preview/production (e.g., my-app-abc123.vercel.app)
  /^https?:\/\/[\w.-]+\.vercel\.com(\/.*)?$/i, // Vercel alternative domain
]

// Check if text looks like a URL and is allowed
function isAllowedUrl(text: string): { allowed: boolean; url?: string } {
  let url = text.trim()

  // Add https:// if no protocol specified
  if (!url.match(/^https?:\/\//i)) {
    // Check if it looks like a domain (with or without www.)
    if (url.match(/^(www\.)?(github\.com|gitlab\.com|localhost|127\.0\.0\.1)/i)) {
      url = `https://${url}`
    }
    // Check for Vercel domains (e.g., my-app.vercel.app)
    else if (url.match(/^[\w-]+\.vercel\.(app|com)/i)) {
      url = `https://${url}`
    } else {
      return { allowed: false }
    }
  }

  // Check against allowed patterns
  for (const pattern of ALLOWED_URL_PATTERNS) {
    if (pattern.test(url)) {
      return { allowed: true, url }
    }
  }

  return { allowed: false }
}

// Provide suggestions as user types
chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const suggestions: chrome.omnibox.SuggestResult[] = []
  const lowerText = text.toLowerCase().trim()

  // Check if input looks like a URL
  const urlCheck = isAllowedUrl(text)
  if (urlCheck.allowed && urlCheck.url) {
    suggestions.push({
      content: `url:${urlCheck.url}`,
      description: `<match>Open URL:</match> ${urlCheck.url} <dim>(in new tab)</dim>`
    })
  }

  // Profile suggestions - show when typing "p", "pr", "profile:", or any profile name
  try {
    const result = await chrome.storage.local.get(['profiles', 'globalWorkingDir'])
    const profiles = (result.profiles || []) as Array<{ id: string; name: string; workingDir?: string }>
    const globalWorkingDir = (result.globalWorkingDir as string) || '~'

    // Extract search term: either after "profile:" or the raw input
    const profileSearch = lowerText.startsWith('profile:')
      ? lowerText.substring(8).trim()
      : lowerText

    // Filter profiles by name match (or show all if just "p"/"pr"/"profile:")
    const showAll = lowerText === 'p' || lowerText === 'pr' || lowerText === 'profile:'
    const matchingProfiles = profiles.filter(profile =>
      showAll || profile.name.toLowerCase().includes(profileSearch)
    )

    for (const profile of matchingProfiles) {
      const displayDir = profile.workingDir || globalWorkingDir
      // Escape XML special chars for omnibox description
      const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      suggestions.push({
        content: `profile:${profile.id}`,
        description: `<match>Profile:</match> ${escapeXml(profile.name)} <dim>(${escapeXml(displayDir)})</dim>`
      })
    }
  } catch (err) {
    console.error('Failed to get profiles for omnibox:', err)
  }

  // Built-in commands
  if ('new'.startsWith(lowerText) || lowerText === '') {
    suggestions.push({
      content: 'new',
      description: '<match>new</match> - Open new terminal with default profile'
    })
  }

  if ('help'.startsWith(lowerText)) {
    suggestions.push({
      content: 'help',
      description: '<match>help</match> - Show available commands'
    })
  }

  // Common commands suggestions
  const commonCommands = [
    { cmd: 'git status', desc: 'Check git repository status' },
    { cmd: 'git pull', desc: 'Pull latest changes' },
    { cmd: 'npm install', desc: 'Install npm dependencies' },
    { cmd: 'npm run dev', desc: 'Start development server' },
    { cmd: 'docker ps', desc: 'List running containers' },
  ]

  for (const { cmd, desc } of commonCommands) {
    if (cmd.toLowerCase().includes(lowerText) && lowerText.length > 1) {
      suggestions.push({
        content: cmd,
        description: `<match>${cmd}</match> <dim>- ${desc}</dim>`
      })
    }
  }

  suggest(suggestions.slice(0, 5)) // Max 5 suggestions
})

// Handle command execution when user presses Enter
chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  console.log('🔍 Omnibox command:', text, 'disposition:', disposition)

  const lowerText = text.toLowerCase().trim()

  // Handle URL opening (url:https://... format from suggestions)
  if (text.startsWith('url:')) {
    const url = text.substring(4)
    console.log('🌐 Opening URL from omnibox:', url)

    // Respect the disposition (currentTab, newForegroundTab, newBackgroundTab)
    if (disposition === 'currentTab') {
      chrome.tabs.update({ url })
    } else {
      chrome.tabs.create({
        url,
        active: disposition === 'newForegroundTab'
      })
    }
    return
  }

  // Check if direct URL input (without url: prefix)
  const urlCheck = isAllowedUrl(text)
  if (urlCheck.allowed && urlCheck.url) {
    console.log('🌐 Opening URL from omnibox (direct):', urlCheck.url)

    if (disposition === 'currentTab') {
      chrome.tabs.update({ url: urlCheck.url })
    } else {
      chrome.tabs.create({
        url: urlCheck.url,
        active: disposition === 'newForegroundTab'
      })
    }
    return
  }

  // Get current window for opening sidebar (for terminal commands)
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
  const currentWindow = windows.find(w => w.focused) || windows[0]

  // Try to open sidebar - may fail if Chrome doesn't consider omnibox a "user gesture"
  // The spawn will still work regardless
  if (currentWindow?.id) {
    try {
      await chrome.sidePanel.open({ windowId: currentWindow.id })
    } catch {
      // Chrome sometimes rejects sidePanel.open() from omnibox as "not a user gesture"
      // This is fine - the terminal spawns anyway, user can click extension icon to see it
    }
  }

  // Handle special commands
  if (lowerText === 'new') {
    // Spawn new terminal with default profile
    broadcastToClients({ type: 'KEYBOARD_NEW_TAB' })
    return
  }

  if (lowerText === 'help') {
    // Show help notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Terminal Tabs - Omnibox Commands',
      message: 'Commands: "new" (new tab), "profile:name" (spawn profile), GitHub/GitLab URLs (open in new tab), or type any bash command to run it.',
      priority: 1
    })
    return
  }

  // Handle profile:name
  if (lowerText.startsWith('profile:')) {
    const profileId = text.substring(8).trim()
    try {
      const result = await chrome.storage.local.get(['profiles'])
      const profiles = (result.profiles || []) as Array<{ id: string; name: string; workingDir?: string }>
      const profile = profiles.find((p) => p.id === profileId || p.name.toLowerCase() === profileId.toLowerCase())

      if (profile) {
        // Small delay to let sidebar open
        setTimeout(() => {
          broadcastToClients({
            type: 'OMNIBOX_SPAWN_PROFILE',
            profile: profile
          } as any)
        }, 300)
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Profile Not Found',
          message: `No profile found with name or ID: ${profileId}`,
          priority: 1
        })
      }
    } catch (err) {
      console.error('Failed to spawn profile from omnibox:', err)
    }
    return
  }

  // Otherwise, treat as a command to run in a new terminal
  // Small delay to let sidebar open
  setTimeout(() => {
    broadcastToClients({
      type: 'OMNIBOX_RUN_COMMAND',
      command: text
    } as any)
  }, 300)
})

// Message handler from extension pages
chrome.runtime.onMessage.addListener(async (message: ExtensionMessage, sender, sendResponse) => {
  // Don't log high-frequency messages (terminal I/O, resize)
  switch (message.type) {
    case 'OPEN_SESSION':
      // Open side panel with specific session
      // Get normal browser windows (not popups/devtools) to avoid "Could not create options page" error
      try {
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
        const targetWindow = windows.find(w => w.focused) || windows[0]

        if (targetWindow?.id) {
          await chrome.sidePanel.open({ windowId: targetWindow.id })
        } else {
          console.error('[Background] No normal browser window found')
        }
      } catch {
        // Silently ignore - user gesture may not be available
      }

      sendToWebSocket({
        type: 'attach-terminal',
        sessionName: message.sessionName,
      })
      break

    case 'SPAWN_TERMINAL':
      // Transform extension message to backend spawn format
      const requestId = `spawn-${Date.now()}`

      // Chrome extension terminals ALWAYS use tmux for persistence
      // This ensures terminals survive extension reloads
      const useTmux = true

      sendToWebSocket({
        type: 'spawn',
        config: {
          terminalType: message.spawnOption || 'bash',
          command: message.command || '',
          workingDir: message.workingDir || message.cwd || message.profile?.workingDir, // Support profile working dir
          useTmux: useTmux, // Always use tmux for Chrome extension terminals
          name: message.name || message.spawnOption || 'Terminal', // Friendly name
          profile: message.profile, // Pass profile to backend for storage
          isChrome: true, // Flag to indicate this is from Chrome extension (for ctt- prefix)
          isDark: message.isDark, // Pass dark/light mode for COLORFGBG env var
        },
        requestId,
      })

      // Badge will be updated when backend sends terminal-spawned message
      break

    case 'QUEUE_COMMAND':
      // Queue command to chat input (from content script "Run in Terminal" button)
      // Opens sidebar and populates chat input, letting user choose which terminal
      try {
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
        const targetWindow = windows.find(w => w.focused) || windows[0]
        if (targetWindow?.id) {
          await chrome.sidePanel.open({ windowId: targetWindow.id })
        }
      } catch {
        // Silently ignore - user gesture may not be available
      }
      // Broadcast to sidepanel after brief delay for sidebar to open
      setTimeout(() => {
        broadcastToClients({
          type: 'QUEUE_COMMAND',
          command: message.command,
        })
      }, 300)
      break

    case 'OPEN_TAB':
      // Open URL in a new tab (used by content script FAB)
      try {
        chrome.tabs.create({ url: message.url })
      } catch (err) {
        console.error('[Background] Failed to open tab:', err)
      }
      break

    case 'CLOSE_SESSION':
      sendToWebSocket({
        type: 'close-terminal',
        sessionName: message.sessionName,
      })
      // Badge will be updated when backend sends terminal-closed message
      break

    case 'CLOSE_TERMINAL':
      // Close specific terminal by ID (force close - kills PTY/tmux session)
      sendToWebSocket({
        type: 'close', // Backend expects 'close', not 'close-terminal'
        terminalId: message.terminalId,
      })
      break

    case 'TERMINAL_INPUT':
      // Forward terminal input to backend (high-frequency, no logging)
      sendToWebSocket({
        type: 'command',
        terminalId: message.terminalId,
        command: message.data,
      })
      break

    case 'TARGETED_PANE_SEND':
      // Send directly to a specific tmux pane (for split layouts with Claude + TUI tools)
      sendToWebSocket({
        type: 'targeted-pane-send',
        tmuxPane: message.tmuxPane,
        text: message.text,
        sendEnter: message.sendEnter,
      })
      break

    case 'TMUX_SESSION_SEND':
      // Send to tmux session by name (fallback when pane ID unavailable)
      // Safer than PTY for Claude terminals - prevents content going to bash
      console.log(`[Background] TMUX_SESSION_SEND: session=${message.sessionName}, textLen=${message.text?.length}`)
      sendToWebSocket({
        type: 'tmux-session-send',
        sessionName: message.sessionName,
        text: message.text,
        sendEnter: message.sendEnter,
      })
      break

    case 'RECONNECT':
      // Register this connection as owner of an API-spawned terminal
      sendToWebSocket({
        type: 'reconnect',
        terminalId: message.terminalId,
      })
      break

    case 'TERMINAL_RESIZE':
      // Forward terminal resize to backend (high-frequency, no logging)
      sendToWebSocket({
        type: 'resize',
        terminalId: message.terminalId,
        cols: message.cols,
        rows: message.rows,
      })
      break

    case 'UPDATE_BADGE':
      updateBadge('UPDATE_BADGE-message')
      break

    case 'LIST_TERMINALS':
      // Request terminal list from backend
      console.log('[Badge] Requesting list-terminals (source: sidepanel-message)')
      sendToWebSocket({ type: 'list-terminals' })
      break

    case 'REFRESH_TERMINALS':
      // Broadcast refresh message to all terminals
      broadcastToClients({ type: 'REFRESH_TERMINALS' })
      break

    // ============================================
    // BROWSER MCP - Console Log Handling
    // ============================================
    case 'CONSOLE_LOG':
      // Store console log from content script
      const logEntry = {
        ...message.entry,
        tabId: sender.tab?.id || -1 // Fill in actual tab ID
      }
      addConsoleLog(logEntry)
      break

    case 'GET_CONSOLE_LOGS':
      // Return console logs (called by MCP server via backend)
      const logs = getConsoleLogs({
        level: message.level,
        limit: message.limit,
        since: message.since,
        tabId: message.tabId
      })
      sendResponse({
        type: 'CONSOLE_LOGS_RESPONSE',
        logs,
        total: consoleLogs.length
      })
      return true // Keep channel open for async response

    case 'BROWSER_EXECUTE_SCRIPT':
      // Execute script in browser tab using safe predefined operations (no eval)
      try {
        const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
        if (!targetTabId) {
          sendResponse({ type: 'BROWSER_SCRIPT_RESULT', success: false, error: 'No active tab found' })
          return true
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: targetTabId, allFrames: message.allFrames || false },
          func: (code: string) => {
            try {
              // Safe predefined operations - NO eval() for security
              // These cover common browser automation use cases

              // Get all links
              if (code === 'document.links' || code.includes('document.links')) {
                const links = [...document.links].map(a => ({
                  text: a.textContent?.trim() || '',
                  href: a.href
                }))
                return { success: true, result: links }
              }

              // Get page title
              if (code === 'document.title') {
                return { success: true, result: document.title }
              }

              // Get page HTML (truncated)
              if (code.includes('outerHTML') || code.includes('innerHTML')) {
                return { success: true, result: document.documentElement.outerHTML.slice(0, 10000) }
              }

              // Get all images
              if (code.includes('document.images')) {
                const images = [...document.images].map(img => ({
                  src: img.src,
                  alt: img.alt
                }))
                return { success: true, result: images }
              }

              // Get text content
              if (code.includes('textContent') || code.includes('innerText')) {
                return { success: true, result: document.body.innerText.slice(0, 10000) }
              }

              // Query selector - extract selector from code
              const selectorMatch = code.match(/querySelector\(['"]([^'"]+)['"]\)/)
              if (selectorMatch) {
                const el = document.querySelector(selectorMatch[1])
                if (el) {
                  return { success: true, result: {
                    tagName: el.tagName,
                    text: el.textContent?.trim(),
                    html: el.outerHTML.slice(0, 1000)
                  }}
                }
                return { success: false, error: `Element not found: ${selectorMatch[1]}` }
              }

              // Query selector all
              const selectorAllMatch = code.match(/querySelectorAll\(['"]([^'"]+)['"]\)/)
              if (selectorAllMatch) {
                const els = document.querySelectorAll(selectorAllMatch[1])
                const results = [...els].slice(0, 100).map(el => ({
                  tagName: el.tagName,
                  text: el.textContent?.trim()
                }))
                return { success: true, result: results }
              }

              // localStorage
              if (code.includes('localStorage')) {
                const storage: Record<string, string> = {}
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i)
                  if (key) storage[key] = localStorage.getItem(key) || ''
                }
                return { success: true, result: storage }
              }

              // For any other code, return an error explaining the limitation
              return {
                success: false,
                error: 'Arbitrary code execution is disabled for security. Supported operations: document.links, document.title, document.images, querySelector("selector"), querySelectorAll("selector"), localStorage, textContent, outerHTML'
              }
            } catch (e) {
              return { success: false, error: (e as Error).message }
            }
          },
          args: [message.code]
        })

        const result = results[0]?.result as { success: boolean; result?: unknown; error?: string } | undefined
        sendResponse({
          type: 'BROWSER_SCRIPT_RESULT',
          success: result?.success || false,
          result: result?.result,
          error: result?.error
        })
      } catch (err) {
        sendResponse({
          type: 'BROWSER_SCRIPT_RESULT',
          success: false,
          error: (err as Error).message
        })
      }
      return true // Keep channel open for async response

    case 'BROWSER_GET_PAGE_INFO':
      // Get info about current page
      try {
        const tabs = message.tabId
          ? [await chrome.tabs.get(message.tabId)]
          : await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs[0]

        if (tab) {
          sendResponse({
            type: 'BROWSER_PAGE_INFO',
            url: tab.url || '',
            title: tab.title || '',
            tabId: tab.id || -1,
            favIconUrl: tab.favIconUrl
          })
        } else {
          sendResponse({
            type: 'BROWSER_PAGE_INFO',
            url: '',
            title: '',
            tabId: -1,
            error: 'No active tab found'
          })
        }
      } catch (err) {
        sendResponse({
          type: 'BROWSER_PAGE_INFO',
          url: '',
          title: '',
          tabId: -1,
          error: (err as Error).message
        })
      }
      return true // Keep channel open for async response

    default:
      // Forward other messages to WebSocket
      sendToWebSocket(message)
  }

  return true // Keep message channel open for async response
})

// External message handler for web pages (personal homepage integration)
chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  console.log('🌐 External message received:', message.type, 'from:', sender.url)

  switch (message.type) {
    case 'PING':
      // Health check - respond that extension is available
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version })
      break

    case 'SPAWN_TERMINAL':
      // Open sidebar first
      try {
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
        const targetWindow = windows.find(w => w.focused) || windows[0]
        if (targetWindow?.id) {
          await chrome.sidePanel.open({ windowId: targetWindow.id })
        }
      } catch {
        // Silently ignore - user gesture may not be available
      }

      // Spawn terminal with command
      const requestId = `spawn-external-${Date.now()}`
      sendToWebSocket({
        type: 'spawn',
        config: {
          terminalType: 'bash',
          command: message.command || '',
          workingDir: message.workingDir,
          useTmux: true,
          name: message.name || message.command?.split(' ')[0] || 'Terminal',
          isChrome: true,
        },
        requestId,
      })
      sendResponse({ ok: true, requestId })
      break

    default:
      sendResponse({ ok: false, error: 'Unknown message type' })
  }

  return true // Keep channel open for async
})

// Port connections from extension pages (persistent communication)
chrome.runtime.onConnect.addListener((port) => {
  connectedClients.add(port)

  // ✅ IMMEDIATELY send current WebSocket state to newly connected client
  // This solves the race condition where sidepanel opens after WebSocket is already connected
  const currentState = ws?.readyState === WebSocket.OPEN
  port.postMessage({
    type: 'INITIAL_STATE',
    wsConnected: currentState,
  })

  // ✅ Send any pending commands (from context menu before sidebar was ready)
  if (pendingPasteCommand) {
    setTimeout(() => {
      port.postMessage({
        type: 'PASTE_COMMAND',
        command: pendingPasteCommand,
      })
      pendingPasteCommand = null
    }, 200)  // Small delay to let React initialize
  }
  if (pendingQueueCommand) {
    setTimeout(() => {
      port.postMessage({
        type: 'QUEUE_COMMAND',
        command: pendingQueueCommand,
      })
      pendingQueueCommand = null
    }, 200)  // Small delay to let React initialize
  }

  port.onDisconnect.addListener(() => {
    connectedClients.delete(port)
  })

  port.onMessage.addListener((message: ExtensionMessage) => {
    // Handle messages from connected ports
    chrome.runtime.sendMessage(message)
  })
})

// Context menu registration helper
function setupContextMenus() {
  console.log('Setting up context menus...')

  // Remove all existing menus first (in case of reload)
  chrome.contextMenus.removeAll(() => {
    // Check for errors after removing
    if (chrome.runtime.lastError) {
      console.error('Error removing context menus:', chrome.runtime.lastError)
    }

    // Simple context menu: open side panel
    // Note: Chrome sidePanel API only has open(), no close() or toggle()
    chrome.contextMenus.create({
      id: 'open-sidepanel',
      title: 'Open Terminal Sidebar',
      contexts: ['all'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating open-sidepanel menu:', chrome.runtime.lastError)
      } else {
        console.log('✅ Open sidebar menu created')
      }
    })

    // Context menu for selected text - paste directly into terminal
    chrome.contextMenus.create({
      id: 'paste-to-terminal',
      title: 'Paste "%s" to Terminal',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating paste-to-terminal menu:', chrome.runtime.lastError)
      }
    })

    // Context menu for selected text - queue to chat input
    chrome.contextMenus.create({
      id: 'send-to-chat',
      title: 'Send "%s" to Chat',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating send-to-chat menu:', chrome.runtime.lastError)
      }
    })

    console.log('✅ Context menus setup complete')
  })
}

// Setup menus on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated')
  setupContextMenus()
  initializeAlarms()
})

// Setup on service worker startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Service worker started')
  setupContextMenus()
  initializeAlarms()
})

// IMPORTANT: Setup context menus after a small delay to ensure Chrome APIs are ready
// This handles the case when the extension is reloaded in dev mode
setTimeout(() => {
  console.log('Delayed context menu setup (for dev reload)')
  setupContextMenus()
}, 100)

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked:', info.menuItemId)

  const menuId = info.menuItemId as string

  // Helper to get a valid window ID (tab.windowId can be -1 on chrome:// pages)
  const getValidWindowId = async (): Promise<number | undefined> => {
    if (tab?.windowId && tab.windowId > 0) {
      return tab.windowId
    }
    // Fallback: get focused window
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
    const targetWindow = windows.find(w => w.focused) || windows[0]
    return targetWindow?.id
  }

  // Handle both old 'toggle-sidepanel' and new 'open-sidepanel' menu IDs
  // (old ID may be cached in Chrome until full restart)
  if (menuId === 'open-sidepanel' || menuId === 'toggle-sidepanel') {
    try {
      const windowId = await getValidWindowId()
      if (windowId) {
        await chrome.sidePanel.open({ windowId })
      }
      // Silently ignore if no window - not an error worth logging
    } catch (err) {
      // Silently ignore - sidebar might already be open, or other benign issues
      console.debug('[Background] Sidebar open attempt:', err)
    }
    return
  }

  if (menuId === 'paste-to-terminal' && info.selectionText) {
    // Paste directly into active terminal
    const selectedText = info.selectionText
    console.log('📋 Pasting to terminal:', selectedText.substring(0, 50) + '...')

    // If sidebar is already open (has connected clients), broadcast immediately
    if (connectedClients.size > 0) {
      broadcastToClients({
        type: 'PASTE_COMMAND',
        command: selectedText,
      })
    } else {
      // Store for when sidebar connects, then try to open it
      pendingPasteCommand = selectedText
      try {
        const windowId = await getValidWindowId()
        if (windowId) {
          await chrome.sidePanel.open({ windowId })
        }
      } catch (err) {
        // Sidebar may already be open but not connected yet, or gesture context lost
        console.debug('[Background] Could not open sidebar:', err)
      }
    }
  }

  if (menuId === 'send-to-chat' && info.selectionText) {
    // Queue to chat input bar
    const selectedText = info.selectionText
    console.log('📋 Sending to chat:', selectedText.substring(0, 50) + '...')

    // If sidebar is already open (has connected clients), broadcast immediately
    if (connectedClients.size > 0) {
      broadcastToClients({
        type: 'QUEUE_COMMAND',
        command: selectedText,
      })
    } else {
      // Store for when sidebar connects, then try to open it
      pendingQueueCommand = selectedText
      try {
        const windowId = await getValidWindowId()
        if (windowId) {
          await chrome.sidePanel.open({ windowId })
        }
      } catch (err) {
        // Sidebar may already be open but not connected yet, or gesture context lost
        console.debug('[Background] Could not open sidebar:', err)
      }
    }
  }
})

// Extension icon click handler - open sidebar
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ Extension icon clicked')

  if (tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    } catch {
      // Silently ignore - may fail if sidebar already open
    }
  }
})

// Keyboard command handler
chrome.commands.onCommand.addListener(async (command) => {
  console.log('⌨️ Keyboard command:', command)

  // Note: _execute_action command automatically triggers chrome.action.onClicked
  // which opens the sidebar - no handler needed here for it

  // Handle new-tab
  if (command === 'new-tab') {
    console.log('[Background] New tab shortcut triggered')
    broadcastToClients({ type: 'KEYBOARD_NEW_TAB' })
    return
  }

  // Handle close-tab
  if (command === 'close-tab') {
    console.log('[Background] Close tab shortcut triggered')
    broadcastToClients({ type: 'KEYBOARD_CLOSE_TAB' })
    return
  }

  // Handle next-tab
  if (command === 'next-tab') {
    console.log('[Background] Next tab shortcut triggered')
    broadcastToClients({ type: 'KEYBOARD_NEXT_TAB' })
    return
  }

  // Handle prev-tab
  if (command === 'prev-tab') {
    console.log('[Background] Prev tab shortcut triggered')
    broadcastToClients({ type: 'KEYBOARD_PREV_TAB' })
    return
  }

  // Handle tab-1 through tab-9
  const tabMatch = command.match(/^tab-(\d)$/)
  if (tabMatch) {
    const tabIndex = parseInt(tabMatch[1]) - 1 // Convert to 0-based index
    console.log('[Background] Switch to tab shortcut:', tabIndex)
    broadcastToClients({ type: 'KEYBOARD_SWITCH_TAB', tabIndex })
    return
  }

  // Handle paste-selection - paste directly to active terminal
  if (command === 'paste-selection') {
    console.log('[Background] Paste selection shortcut triggered')
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (activeTab?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.getSelection()?.toString() || ''
        })

        const selectedText = results[0]?.result
        if (selectedText) {
          console.log('[Background] 📋 Pasting to terminal:', selectedText.substring(0, 50) + '...')

          // If sidebar is already open, broadcast immediately
          if (connectedClients.size > 0) {
            broadcastToClients({
              type: 'PASTE_COMMAND',
              command: selectedText,
            })
          } else {
            // Store for when sidebar connects, then try to open it
            pendingPasteCommand = selectedText
            try {
              const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
              const currentWindow = windows.find(w => w.focused) || windows[0]
              if (currentWindow?.id) {
                await chrome.sidePanel.open({ windowId: currentWindow.id })
              }
            } catch (e) {
              console.debug('[Background] Could not open sidebar:', e)
            }
          }
        } else {
          console.log('[Background] No text selected')
        }
      }
    } catch (err) {
      console.error('[Background] Failed to get selection:', err)
    }
    return
  }

  // Handle send-to-chat - queue to chat input bar for review
  if (command === 'send-to-chat') {
    console.log('[Background] Send to chat shortcut triggered')
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (activeTab?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.getSelection()?.toString() || ''
        })

        const selectedText = results[0]?.result
        if (selectedText) {
          console.log('[Background] 📋 Sending to chat:', selectedText.substring(0, 50) + '...')

          // If sidebar is already open, broadcast immediately
          if (connectedClients.size > 0) {
            broadcastToClients({
              type: 'QUEUE_COMMAND',
              command: selectedText,
            })
          } else {
            // Store for when sidebar connects, then try to open it
            pendingQueueCommand = selectedText
            try {
              const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
              const currentWindow = windows.find(w => w.focused) || windows[0]
              if (currentWindow?.id) {
                await chrome.sidePanel.open({ windowId: currentWindow.id })
              }
            } catch (e) {
              console.debug('[Background] Could not open sidebar:', e)
            }
          }
        } else {
          console.log('[Background] No text selected')
        }
      }
    } catch (err) {
      console.error('[Background] Failed to get selection:', err)
    }
    return
  }
})

// Initialize WebSocket connection
connectWebSocket()

// Keep service worker alive with periodic ping
setInterval(() => {
  console.log('🏓 Background service worker alive')
  if (ws?.readyState !== WebSocket.OPEN) {
    connectWebSocket()
  }
}, 25000) // Chrome service workers can idle after 30s

console.log('✅ Terminal Tabs background service worker initialized')
