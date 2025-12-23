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

// ============================================
// BROWSER MCP - Network Request Storage
// ============================================
interface StoredNetworkRequest {
  requestId: string
  url: string
  method: string
  resourceType: string
  timestamp: number
  tabId: number
  requestHeaders?: Record<string, string>
  postData?: string
  status?: number
  statusText?: string
  responseHeaders?: Record<string, string>
  mimeType?: string
  responseTime?: number
  encodedDataLength?: number
}

const MAX_NETWORK_REQUESTS = 500
const REQUEST_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes
const networkRequests: Map<string, StoredNetworkRequest> = new Map()
let networkCaptureEnabled = false
let networkCaptureTabId: number | undefined // Which tab to capture (undefined = all)

/**
 * Clean up old network requests
 */
function cleanupOldNetworkRequests(): void {
  const now = Date.now()
  const toDelete: string[] = []

  for (const [id, req] of networkRequests) {
    if (now - req.timestamp > REQUEST_MAX_AGE_MS) {
      toDelete.push(id)
    }
  }

  for (const id of toDelete) {
    networkRequests.delete(id)
  }

  // Enforce max size
  if (networkRequests.size > MAX_NETWORK_REQUESTS) {
    const sorted = [...networkRequests.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = sorted.slice(0, networkRequests.size - MAX_NETWORK_REQUESTS)
    for (const [id] of toRemove) {
      networkRequests.delete(id)
    }
  }
}

/**
 * Map chrome.webRequest.ResourceType to friendly string
 */
function mapResourceType(type: string): string {
  const typeMap: Record<string, string> = {
    'main_frame': 'Document',
    'sub_frame': 'Document',
    'stylesheet': 'Stylesheet',
    'script': 'Script',
    'image': 'Image',
    'font': 'Font',
    'object': 'Other',
    'xmlhttprequest': 'XHR',
    'ping': 'Other',
    'csp_report': 'Other',
    'media': 'Media',
    'websocket': 'WebSocket',
    'other': 'Other'
  }
  return typeMap[type] || 'Other'
}

/**
 * Convert chrome.webRequest headers array to Record
 */
function headersToRecord(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> | undefined {
  if (!headers) return undefined
  const record: Record<string, string> = {}
  for (const h of headers) {
    if (h.name && h.value) {
      record[h.name] = h.value
    }
  }
  return record
}

// WebRequest listeners (only active when capture is enabled)
function onBeforeRequest(details: chrome.webRequest.OnBeforeRequestDetails): chrome.webRequest.BlockingResponse | undefined {
  // Skip chrome:// and extension URLs
  if (details.url.startsWith('chrome://') || details.url.startsWith('chrome-extension://')) {
    return
  }

  // If capturing specific tab, filter
  if (networkCaptureTabId !== undefined && details.tabId !== networkCaptureTabId) {
    return
  }

  cleanupOldNetworkRequests()

  const req: StoredNetworkRequest = {
    requestId: details.requestId,
    url: details.url,
    method: details.method,
    resourceType: mapResourceType(details.type),
    timestamp: Date.now(),
    tabId: details.tabId
  }

  // Capture POST data if present
  if (details.requestBody) {
    if (details.requestBody.raw && details.requestBody.raw.length > 0) {
      try {
        const decoder = new TextDecoder()
        const data = details.requestBody.raw.map((r: chrome.webRequest.UploadData) => decoder.decode(r.bytes)).join('')
        req.postData = data.slice(0, 10000) // Limit size
      } catch {
        // Ignore decode errors
      }
    } else if (details.requestBody.formData) {
      req.postData = JSON.stringify(details.requestBody.formData).slice(0, 10000)
    }
  }

  networkRequests.set(details.requestId, req)
}

function onSendHeaders(details: chrome.webRequest.OnSendHeadersDetails): void {
  const req = networkRequests.get(details.requestId)
  if (req) {
    req.requestHeaders = headersToRecord(details.requestHeaders)
  }
}

function onHeadersReceived(details: chrome.webRequest.OnHeadersReceivedDetails): chrome.webRequest.BlockingResponse | undefined {
  const req = networkRequests.get(details.requestId)
  if (req) {
    req.status = details.statusCode
    req.statusText = details.statusLine?.split(' ').slice(1).join(' ') || ''
    req.responseHeaders = headersToRecord(details.responseHeaders)

    // Try to get content-type for mimeType
    const contentType = details.responseHeaders?.find((h: chrome.webRequest.HttpHeader) => h.name.toLowerCase() === 'content-type')
    if (contentType?.value) {
      req.mimeType = contentType.value.split(';')[0].trim()
    }
  }
  return undefined
}

function onCompleted(details: chrome.webRequest.OnCompletedDetails): void {
  const req = networkRequests.get(details.requestId)
  if (req) {
    req.responseTime = Date.now() - req.timestamp

    // Try to get content-length for size
    // Note: fromCache boolean and encodedDataLength are not directly available
    // We can estimate from headers if needed
  }
}

function onErrorOccurred(details: chrome.webRequest.OnErrorOccurredDetails): void {
  const req = networkRequests.get(details.requestId)
  if (req) {
    req.status = 0
    req.statusText = details.error || 'Network Error'
    req.responseTime = Date.now() - req.timestamp
  }
}

/**
 * Enable network capture using chrome.webRequest
 */
function enableNetworkCaptureExt(tabId?: number): { success: boolean; error?: string } {
  try {
    if (networkCaptureEnabled) {
      // Already enabled, just update tabId filter
      networkCaptureTabId = tabId
      return { success: true }
    }

    networkCaptureTabId = tabId

    // Add webRequest listeners
    chrome.webRequest.onBeforeRequest.addListener(
      onBeforeRequest,
      { urls: ['<all_urls>'] },
      ['requestBody']
    )

    chrome.webRequest.onSendHeaders.addListener(
      onSendHeaders,
      { urls: ['<all_urls>'] },
      ['requestHeaders']
    )

    chrome.webRequest.onHeadersReceived.addListener(
      onHeadersReceived,
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    )

    chrome.webRequest.onCompleted.addListener(
      onCompleted,
      { urls: ['<all_urls>'] }
    )

    chrome.webRequest.onErrorOccurred.addListener(
      onErrorOccurred,
      { urls: ['<all_urls>'] }
    )

    networkCaptureEnabled = true
    console.log('🌐 Network capture enabled', tabId ? `for tab ${tabId}` : 'for all tabs')
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

/**
 * Get captured network requests with filtering
 */
function getNetworkRequestsExt(options: {
  urlPattern?: string
  method?: string
  statusMin?: number
  statusMax?: number
  resourceType?: string
  limit?: number
  offset?: number
  tabId?: number
}): {
  requests: StoredNetworkRequest[]
  total: number
  hasMore: boolean
  nextOffset?: number
  captureActive: boolean
} {
  cleanupOldNetworkRequests()

  let requests = [...networkRequests.values()]

  // Apply filters
  if (options.urlPattern) {
    try {
      const regex = new RegExp(options.urlPattern, 'i')
      requests = requests.filter(r => regex.test(r.url))
    } catch {
      // Invalid regex, treat as literal
      requests = requests.filter(r => r.url.includes(options.urlPattern!))
    }
  }

  if (options.method && options.method !== 'all') {
    requests = requests.filter(r => r.method.toUpperCase() === options.method!.toUpperCase())
  }

  if (options.statusMin !== undefined) {
    requests = requests.filter(r => r.status !== undefined && r.status >= options.statusMin!)
  }

  if (options.statusMax !== undefined) {
    requests = requests.filter(r => r.status !== undefined && r.status <= options.statusMax!)
  }

  if (options.resourceType && options.resourceType !== 'all') {
    requests = requests.filter(r => r.resourceType.toLowerCase() === options.resourceType!.toLowerCase())
  }

  if (options.tabId !== undefined) {
    requests = requests.filter(r => r.tabId === options.tabId)
  }

  // Sort by timestamp (newest first)
  requests.sort((a, b) => b.timestamp - a.timestamp)

  const total = requests.length
  const offset = options.offset || 0
  const limit = options.limit || 50

  // Apply pagination
  const paginatedRequests = requests.slice(offset, offset + limit)

  return {
    requests: paginatedRequests,
    total,
    hasMore: offset + limit < total,
    nextOffset: offset + limit < total ? offset + limit : undefined,
    captureActive: networkCaptureEnabled
  }
}

/**
 * Clear all captured network requests
 */
function clearNetworkRequestsExt(): void {
  networkRequests.clear()
  console.log('🌐 Network requests cleared')
}

// ============================================
// BROWSER MCP - Network Capture Handlers
// ============================================

async function handleBrowserEnableNetworkCapture(message: { requestId: string; tabId?: number }) {
  console.log('🌐 Browser MCP: enable-network-capture request', message.requestId)
  const result = enableNetworkCaptureExt(message.tabId)
  sendToWebSocket({
    type: 'browser-enable-network-capture-result',
    requestId: message.requestId,
    success: result.success,
    error: result.error
  })
}

async function handleBrowserGetNetworkRequests(message: {
  requestId: string
  urlPattern?: string
  method?: string
  statusMin?: number
  statusMax?: number
  resourceType?: string
  limit?: number
  offset?: number
  tabId?: number
}) {
  console.log('🌐 Browser MCP: get-network-requests request', message.requestId)
  const result = getNetworkRequestsExt({
    urlPattern: message.urlPattern,
    method: message.method,
    statusMin: message.statusMin,
    statusMax: message.statusMax,
    resourceType: message.resourceType,
    limit: message.limit,
    offset: message.offset,
    tabId: message.tabId
  })
  sendToWebSocket({
    type: 'browser-get-network-requests-result',
    requestId: message.requestId,
    ...result
  })
}

async function handleBrowserClearNetworkRequests(message: { requestId: string }) {
  console.log('🌐 Browser MCP: clear-network-requests request', message.requestId)
  clearNetworkRequestsExt()
  sendToWebSocket({
    type: 'browser-clear-network-requests-result',
    requestId: message.requestId,
    success: true
  })
}

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
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
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
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })
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
    const allTabs = await chrome.tabs.query({ lastFocusedWindow: true })

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
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

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
// BROWSER MCP - Open URL Handler
// ============================================

/**
 * Open a URL in a new or existing tab
 * Replaces CDP-based URL opening with Chrome Extension API
 */
async function handleBrowserOpenUrl(message: {
  requestId: string
  url: string
  newTab: boolean
  background: boolean
  reuseExisting: boolean
}) {
  try {
    const { url, newTab, background, reuseExisting } = message

    // If reuseExisting, check if URL is already open
    if (reuseExisting) {
      const allTabs = await chrome.tabs.query({})
      const existingTab = allTabs.find(tab => {
        if (!tab.url) return false
        // Check for exact match or match without trailing slash
        return tab.url === url ||
               tab.url === url + '/' ||
               tab.url + '/' === url
      })

      if (existingTab && existingTab.id) {
        // Tab already exists - switch to it
        await chrome.tabs.update(existingTab.id, { active: true })
        if (existingTab.windowId) {
          await chrome.windows.update(existingTab.windowId, { focused: true })
        }

        sendToWebSocket({
          type: 'browser-open-url-result',
          requestId: message.requestId,
          success: true,
          tabId: existingTab.id,
          url: existingTab.url || url,
          reused: true
        })
        return
      }
    }

    let resultTabId: number
    let resultUrl: string

    if (newTab) {
      // Open in new tab
      const tab = await chrome.tabs.create({
        url,
        active: !background
      })
      resultTabId = tab.id || -1
      resultUrl = tab.url || url

      // If not background, focus the window
      if (!background && tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true })
      }
    } else {
      // Navigate current tab
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      if (activeTab && activeTab.id) {
        const tab = await chrome.tabs.update(activeTab.id, { url })
        resultTabId = tab?.id || activeTab.id
        resultUrl = url
      } else {
        // No active tab, create new one
        const tab = await chrome.tabs.create({ url, active: true })
        resultTabId = tab.id || -1
        resultUrl = tab.url || url
      }
    }

    sendToWebSocket({
      type: 'browser-open-url-result',
      requestId: message.requestId,
      success: true,
      tabId: resultTabId,
      url: resultUrl,
      reused: false
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-open-url-result',
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
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })

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

// Handle save page request from backend (MCP server)
// Uses pageCapture API to save page as MHTML
async function handleBrowserSavePage(message: {
  requestId: string
  tabId?: number
  filename?: string
}) {
  try {
    // Get target tab
    const tabs = message.tabId
      ? [{ id: message.tabId }]
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    const targetTab = tabs[0]
    if (!targetTab?.id) {
      throw new Error('No active tab found')
    }

    // Check if tab URL is capturable (not chrome://, chrome-extension://, etc.)
    const tabInfo = await chrome.tabs.get(targetTab.id)
    if (tabInfo.url?.startsWith('chrome://') || tabInfo.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture chrome:// or extension pages. Navigate to a regular webpage first.')
    }

    // Capture the page as MHTML
    const mhtmlBlob = await new Promise<Blob>((resolve, reject) => {
      chrome.pageCapture.saveAsMHTML({ tabId: targetTab.id! }, (blob) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (!blob) {
          reject(new Error('Failed to capture page - no data returned'))
        } else {
          resolve(blob)
        }
      })
    })

    // Generate filename from page title or custom name
    const pageTitle = tabInfo.title || 'page'
    const sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '-').substring(0, 100)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const baseFilename = message.filename
      ? message.filename.replace(/\.mhtml$/i, '')
      : `${sanitizedTitle}-${timestamp}`
    const filename = `${baseFilename}.mhtml`

    // Convert blob to data URL (service workers don't support URL.createObjectURL)
    const arrayBuffer = await mhtmlBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    const base64 = btoa(binary)
    const dataUrl = `data:multipart/related;base64,${base64}`

    // Download the MHTML file
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        conflictAction: 'uniquify'
      }, (id) => {
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
      filename?: string
      windowsPath?: string
      wslPath?: string
      fileSize?: number
      mimeType?: string
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Download timed out' })
      }, 30000) // 30s timeout for MHTML (can be large)

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
              filename: windowsPath.split(/[/\\]/).pop() || filename,
              windowsPath: windowsPath,
              wslPath: windowsToWslPath(windowsPath),
              fileSize: download.fileSize,
              mimeType: 'multipart/related'
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
      type: 'browser-save-page-result',
      requestId: message.requestId,
      ...downloadResult
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-save-page-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// BOOKMARK HANDLERS
// ============================================

interface BookmarkNode {
  id: string
  title: string
  url?: string
  parentId?: string
  index?: number
  dateAdded?: number
  children?: BookmarkNode[]
}

/**
 * Convert Chrome bookmark tree to simplified format, limiting depth
 */
function simplifyBookmarkTree(nodes: chrome.bookmarks.BookmarkTreeNode[], maxDepth: number, currentDepth: number = 0): BookmarkNode[] {
  return nodes.map(node => {
    const simplified: BookmarkNode = {
      id: node.id,
      title: node.title,
      parentId: node.parentId,
      index: node.index,
      dateAdded: node.dateAdded
    }

    if (node.url) {
      simplified.url = node.url
    }

    if (node.children && currentDepth < maxDepth) {
      simplified.children = simplifyBookmarkTree(node.children, maxDepth, currentDepth + 1)
    } else if (node.children) {
      // Indicate there are more children but we're not showing them
      simplified.children = []
    }

    return simplified
  })
}

// Handle bookmark tree request
async function handleBrowserBookmarksTree(message: {
  requestId: string
  folderId?: string
  maxDepth?: number
}) {
  try {
    const maxDepth = message.maxDepth || 3

    let tree: chrome.bookmarks.BookmarkTreeNode[]
    if (message.folderId) {
      tree = await chrome.bookmarks.getSubTree(message.folderId)
    } else {
      tree = await chrome.bookmarks.getTree()
    }

    // Simplify and limit depth
    const simplifiedTree = simplifyBookmarkTree(tree, maxDepth)

    sendToWebSocket({
      type: 'browser-bookmarks-tree-result',
      requestId: message.requestId,
      success: true,
      tree: simplifiedTree
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-tree-result',
      requestId: message.requestId,
      success: false,
      tree: [],
      error: (err as Error).message
    })
  }
}

// Handle bookmark search request
async function handleBrowserBookmarksSearch(message: {
  requestId: string
  query: string
  limit?: number
}) {
  try {
    const results = await chrome.bookmarks.search(message.query)
    const limit = message.limit || 20

    // Convert to simplified format
    const bookmarks: BookmarkNode[] = results.slice(0, limit).map(bm => ({
      id: bm.id,
      title: bm.title,
      url: bm.url,
      parentId: bm.parentId,
      index: bm.index,
      dateAdded: bm.dateAdded
    }))

    sendToWebSocket({
      type: 'browser-bookmarks-search-result',
      requestId: message.requestId,
      success: true,
      bookmarks
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-search-result',
      requestId: message.requestId,
      success: false,
      bookmarks: [],
      error: (err as Error).message
    })
  }
}

// Handle bookmark create request
async function handleBrowserBookmarksCreate(message: {
  requestId: string
  url: string
  title: string
  parentId?: string
  index?: number
}) {
  try {
    const createDetails: chrome.bookmarks.CreateDetails = {
      url: message.url,
      title: message.title,
      parentId: message.parentId || '1' // Default to Bookmarks Bar
    }

    if (message.index !== undefined) {
      createDetails.index = message.index
    }

    const bookmark = await chrome.bookmarks.create(createDetails)

    sendToWebSocket({
      type: 'browser-bookmarks-create-result',
      requestId: message.requestId,
      success: true,
      bookmark: {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-create-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Handle bookmark folder create request
async function handleBrowserBookmarksCreateFolder(message: {
  requestId: string
  title: string
  parentId?: string
  index?: number
}) {
  try {
    const createDetails: chrome.bookmarks.CreateDetails = {
      title: message.title,
      parentId: message.parentId || '1' // Default to Bookmarks Bar
      // No URL = folder
    }

    if (message.index !== undefined) {
      createDetails.index = message.index
    }

    const folder = await chrome.bookmarks.create(createDetails)

    sendToWebSocket({
      type: 'browser-bookmarks-create-folder-result',
      requestId: message.requestId,
      success: true,
      folder: {
        id: folder.id,
        title: folder.title,
        parentId: folder.parentId,
        index: folder.index
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-create-folder-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Handle bookmark move request
async function handleBrowserBookmarksMove(message: {
  requestId: string
  id: string
  parentId: string
  index?: number
}) {
  try {
    const destination: chrome.bookmarks.MoveDestination = {
      parentId: message.parentId
    }

    if (message.index !== undefined) {
      destination.index = message.index
    }

    const bookmark = await chrome.bookmarks.move(message.id, destination)

    sendToWebSocket({
      type: 'browser-bookmarks-move-result',
      requestId: message.requestId,
      success: true,
      bookmark: {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-move-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// Handle bookmark delete request
async function handleBrowserBookmarksDelete(message: {
  requestId: string
  id: string
}) {
  try {
    // Try to remove as a folder first (recursively deletes contents)
    // If it's a bookmark, this will still work
    try {
      await chrome.bookmarks.removeTree(message.id)
    } catch {
      // If removeTree fails (e.g., for a single bookmark), use remove
      await chrome.bookmarks.remove(message.id)
    }

    sendToWebSocket({
      type: 'browser-bookmarks-delete-result',
      requestId: message.requestId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-delete-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// INTERACTION HANDLERS (Click, Fill, Get Element)
// ============================================

/**
 * Click an element on the page using chrome.scripting.executeScript
 * Waits for element to exist, then dispatches click event
 */
async function handleBrowserClickElement(message: {
  requestId: string
  selector: string
  tabId?: number
  waitTimeout?: number
}) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-click-element-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const waitTimeout = message.waitTimeout || 5000

    // Execute click in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector: string, timeout: number) => {
        return new Promise<{ success: boolean; error?: string; tagName?: string }>((resolve) => {
          const startTime = Date.now()

          const tryClick = () => {
            const el = document.querySelector(selector)
            if (el) {
              // Check if element is visible
              const rect = el.getBoundingClientRect()
              if (rect.width === 0 && rect.height === 0) {
                resolve({ success: false, error: `Element found but has zero dimensions: ${selector}` })
                return
              }

              // Dispatch click event
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              })
              el.dispatchEvent(clickEvent)

              // For links and buttons, also try the native click
              if (el instanceof HTMLElement) {
                el.click()
              }

              resolve({ success: true, tagName: el.tagName.toLowerCase() })
            } else if (Date.now() - startTime < timeout) {
              // Element not found yet, retry
              setTimeout(tryClick, 100)
            } else {
              resolve({ success: false, error: `Element not found within ${timeout}ms: ${selector}` })
            }
          }

          tryClick()
        })
      },
      args: [message.selector, waitTimeout]
    })

    const result = results[0]?.result as { success: boolean; error?: string; tagName?: string } | undefined

    sendToWebSocket({
      type: 'browser-click-element-result',
      requestId: message.requestId,
      success: result?.success || false,
      tagName: result?.tagName,
      error: result?.error
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-click-element-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Fill an input field with text using chrome.scripting.executeScript
 * Clears existing value, sets new value, and dispatches input/change events
 */
async function handleBrowserFillInput(message: {
  requestId: string
  selector: string
  value: string
  tabId?: number
  waitTimeout?: number
}) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-fill-input-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const waitTimeout = message.waitTimeout || 5000

    // Execute fill in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector: string, value: string, timeout: number) => {
        return new Promise<{ success: boolean; error?: string; tagName?: string }>((resolve) => {
          const startTime = Date.now()

          const tryFill = () => {
            const el = document.querySelector(selector)
            if (el) {
              // Check if it's an input-like element
              if (!(el instanceof HTMLInputElement ||
                    el instanceof HTMLTextAreaElement ||
                    el instanceof HTMLSelectElement ||
                    (el as HTMLElement).isContentEditable)) {
                resolve({ success: false, error: `Element is not an input field: ${el.tagName}` })
                return
              }

              // Focus the element
              (el as HTMLElement).focus()

              // Clear and set value
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.value = ''
                el.value = value
              } else if (el instanceof HTMLSelectElement) {
                el.value = value
              } else if ((el as HTMLElement).isContentEditable) {
                (el as HTMLElement).textContent = value
              }

              // Dispatch input and change events for React/Vue compatibility
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))

              resolve({ success: true, tagName: el.tagName.toLowerCase() })
            } else if (Date.now() - startTime < timeout) {
              // Element not found yet, retry
              setTimeout(tryFill, 100)
            } else {
              resolve({ success: false, error: `Element not found within ${timeout}ms: ${selector}` })
            }
          }

          tryFill()
        })
      },
      args: [message.selector, message.value, waitTimeout]
    })

    const result = results[0]?.result as { success: boolean; error?: string; tagName?: string } | undefined

    sendToWebSocket({
      type: 'browser-fill-input-result',
      requestId: message.requestId,
      success: result?.success || false,
      tagName: result?.tagName,
      error: result?.error
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-fill-input-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Get detailed information about an element using chrome.scripting.executeScript
 * Returns HTML, text, attributes, bounds, and computed styles
 */
async function handleBrowserGetElementInfo(message: {
  requestId: string
  selector: string
  tabId?: number
  includeStyles?: boolean
  styleProperties?: string[] | null
}) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-element-info-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Default style properties to extract
    const defaultStyleProps = [
      'display', 'position', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'margin', 'padding', 'boxSizing',
      'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'color',
      'backgroundColor', 'backgroundImage',
      'border', 'borderRadius', 'boxShadow', 'opacity', 'transform', 'zIndex'
    ]

    const styleProps = message.styleProperties || defaultStyleProps
    const includeStyles = message.includeStyles !== false

    // Execute in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector: string, props: string[], getStyles: boolean) => {
        const el = document.querySelector(selector)
        if (!el) {
          return { found: false, error: `Element not found: ${selector}` }
        }

        const rect = el.getBoundingClientRect()

        // Get all attributes
        const attributes: Record<string, string> = {}
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i]
          attributes[attr.name] = attr.value
        }

        // Get computed styles
        let styles: Record<string, string> = {}
        if (getStyles) {
          const computed = window.getComputedStyle(el)
          for (const prop of props) {
            const value = computed.getPropertyValue(
              prop.replace(/([A-Z])/g, '-$1').toLowerCase()
            )
            if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
              styles[prop] = value
            }
          }
        }

        // Try to build a parent selector for context
        let parentSelector = ''
        const parent = el.parentElement
        if (parent) {
          if (parent.id) {
            parentSelector = `#${parent.id}`
          } else if (parent.className && typeof parent.className === 'string') {
            parentSelector = `.${parent.className.split(' ')[0]}`
          } else {
            parentSelector = parent.tagName.toLowerCase()
          }
        }

        return {
          found: true,
          html: el.innerHTML.slice(0, 5000),
          outerHTML: el.outerHTML.slice(0, 5000),
          innerText: (el as HTMLElement).innerText?.slice(0, 500),
          tagName: el.tagName.toLowerCase(),
          attributes,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left)
          },
          styles,
          parentSelector,
          childCount: el.children.length
        }
      },
      args: [message.selector, styleProps, includeStyles]
    })

    const result = results[0]?.result as {
      found: boolean
      error?: string
      html?: string
      outerHTML?: string
      innerText?: string
      tagName?: string
      attributes?: Record<string, string>
      bounds?: { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number }
      styles?: Record<string, string>
      parentSelector?: string
      childCount?: number
    } | undefined

    if (!result?.found) {
      sendToWebSocket({
        type: 'browser-get-element-info-result',
        requestId: message.requestId,
        success: false,
        error: result?.error || 'Element not found'
      })
      return
    }

    sendToWebSocket({
      type: 'browser-get-element-info-result',
      requestId: message.requestId,
      success: true,
      html: result.html,
      outerHTML: result.outerHTML,
      innerText: result.innerText,
      tagName: result.tagName,
      attributes: result.attributes,
      bounds: result.bounds,
      styles: result.styles,
      parentSelector: result.parentSelector,
      childCount: result.childCount
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-element-info-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// SCREENSHOT HANDLERS
// ============================================

/**
 * Take a screenshot using chrome.tabs.captureVisibleTab
 * Captures the visible viewport of the active tab
 * For full page, uses scroll+stitch approach via content script
 */
async function handleBrowserScreenshot(message: {
  requestId: string
  tabId?: number
  selector?: string
  fullPage?: boolean
}) {
  try {
    // Get target tab
    const tabs = message.tabId
      ? [await chrome.tabs.get(message.tabId)]
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    const targetTab = tabs[0]
    if (!targetTab?.id) {
      throw new Error('No active tab found')
    }

    // Check if tab URL is capturable (not chrome://, chrome-extension://, etc.)
    if (targetTab.url?.startsWith('chrome://') || targetTab.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture chrome:// or extension pages. Navigate to a regular webpage first.')
    }

    let dataUrl: string

    if (message.fullPage) {
      // Full page screenshot: scroll and stitch
      dataUrl = await captureFullPageScreenshot(targetTab.id)
    } else if (message.selector) {
      // Element screenshot: capture viewport and crop to element
      dataUrl = await captureElementScreenshot(targetTab.id, message.selector)
    } else {
      // Simple viewport screenshot
      dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId!, { format: 'png' })
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = message.fullPage
      ? `screenshot-full-${timestamp}.png`
      : `screenshot-${timestamp}.png`

    // Download using data URL directly (URL.createObjectURL not available in service workers)
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        conflictAction: 'uniquify'
      }, (id) => {
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
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Download timed out' })
      }, 30000)

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
              wslPath: windowsToWslPath(windowsPath)
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
      type: 'browser-screenshot-result',
      requestId: message.requestId,
      ...downloadResult
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-screenshot-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Capture element screenshot by capturing viewport and cropping via canvas in content script
 */
async function captureElementScreenshot(tabId: number, selector: string): Promise<string> {
  // First, scroll element into view and get its bounds
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) {
        return { error: `Element not found: ${sel}` }
      }

      // Scroll element into view
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })

      // Wait a bit for scroll to complete and get bounds
      const rect = el.getBoundingClientRect()
      return {
        x: Math.round(rect.x * window.devicePixelRatio),
        y: Math.round(rect.y * window.devicePixelRatio),
        width: Math.round(rect.width * window.devicePixelRatio),
        height: Math.round(rect.height * window.devicePixelRatio),
        devicePixelRatio: window.devicePixelRatio
      }
    },
    args: [selector]
  })

  const boundsResult = results[0]?.result as {
    error?: string
    x?: number
    y?: number
    width?: number
    height?: number
    devicePixelRatio?: number
  }

  if (boundsResult?.error) {
    throw new Error(boundsResult.error)
  }

  if (!boundsResult?.width || !boundsResult?.height) {
    throw new Error('Could not determine element bounds')
  }

  // Small delay to ensure scroll has completed
  await new Promise(resolve => setTimeout(resolve, 100))

  // Get the tab's window for capture
  const tab = await chrome.tabs.get(tabId)
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' })

  // Crop the image using OffscreenCanvas (available in service workers)
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const imageBitmap = await createImageBitmap(blob)

  const canvas = new OffscreenCanvas(boundsResult.width!, boundsResult.height!)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context')
  }

  // Draw the cropped region
  ctx.drawImage(
    imageBitmap,
    boundsResult.x!, boundsResult.y!, boundsResult.width!, boundsResult.height!,
    0, 0, boundsResult.width!, boundsResult.height!
  )

  // Convert back to data URL
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(croppedBlob)
  })
}

/**
 * Capture full page screenshot by scrolling and stitching
 * Uses chrome.tabs.captureVisibleTab for each viewport segment
 */
async function captureFullPageScreenshot(tabId: number): Promise<string> {
  // Get page dimensions
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Store original scroll position
      const originalScrollY = window.scrollY

      // Get full page dimensions
      const body = document.body
      const html = document.documentElement
      const fullHeight = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      )
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      return {
        fullHeight,
        viewportHeight,
        viewportWidth,
        originalScrollY,
        devicePixelRatio: window.devicePixelRatio
      }
    }
  })

  const pageInfo = results[0]?.result as {
    fullHeight: number
    viewportHeight: number
    viewportWidth: number
    originalScrollY: number
    devicePixelRatio: number
  }

  if (!pageInfo) {
    throw new Error('Could not get page dimensions')
  }

  const { fullHeight, viewportHeight, viewportWidth, originalScrollY, devicePixelRatio } = pageInfo

  // Calculate number of captures needed
  const numCaptures = Math.ceil(fullHeight / viewportHeight)
  const captures: { dataUrl: string; y: number; height: number }[] = []

  // Get the tab's window for capture
  const tab = await chrome.tabs.get(tabId)

  // Capture each viewport segment
  for (let i = 0; i < numCaptures; i++) {
    const scrollY = i * viewportHeight
    const isLastCapture = i === numCaptures - 1
    const captureHeight = isLastCapture
      ? fullHeight - scrollY
      : viewportHeight

    // Scroll to position
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [scrollY]
    })

    // Wait for scroll and rendering
    await new Promise(resolve => setTimeout(resolve, 150))

    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' })

    captures.push({
      dataUrl,
      y: scrollY * devicePixelRatio,
      height: captureHeight * devicePixelRatio
    })
  }

  // Restore original scroll position
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => window.scrollTo(0, y),
    args: [originalScrollY]
  })

  // Stitch images together using OffscreenCanvas
  const finalWidth = viewportWidth * devicePixelRatio
  const finalHeight = fullHeight * devicePixelRatio

  const canvas = new OffscreenCanvas(finalWidth, finalHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context')
  }

  // Draw each capture
  for (const capture of captures) {
    const response = await fetch(capture.dataUrl)
    const blob = await response.blob()
    const imageBitmap = await createImageBitmap(blob)

    // For the last capture, we need to handle partial viewport
    const sourceHeight = Math.min(imageBitmap.height, capture.height)
    ctx.drawImage(
      imageBitmap,
      0, 0, imageBitmap.width, sourceHeight,
      0, capture.y, imageBitmap.width, sourceHeight
    )
  }

  // Convert to data URL
  const finalBlob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(finalBlob)
  })
}

// ============================================
// DEBUGGER HANDLERS (DOM Tree, Performance, Coverage)
// ============================================

/**
 * Helper to attach debugger to a tab and run a command
 * Auto-detaches after operation completes
 */
async function withDebugger<T>(
  tabId: number,
  fn: (target: chrome.debugger.Debuggee) => Promise<T>
): Promise<T> {
  const target: chrome.debugger.Debuggee = { tabId }

  try {
    // Attach debugger
    await chrome.debugger.attach(target, '1.3')

    // Run the operation
    const result = await fn(target)

    // Detach debugger
    await chrome.debugger.detach(target)

    return result
  } catch (err) {
    // Always try to detach on error
    try {
      await chrome.debugger.detach(target)
    } catch {
      // Ignore detach errors
    }
    throw err
  }
}

/**
 * Send a debugger command and return the result
 */
function sendDebuggerCommand<T>(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: { [key: string]: unknown },
  timeoutMs: number = 10000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Debugger command '${method}' timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    chrome.debugger.sendCommand(target, method, params, (result) => {
      clearTimeout(timeout)
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(result as T)
      }
    })
  })
}

interface DOMNode {
  nodeId: number
  nodeName: string
  nodeType: number
  nodeValue?: string
  localName?: string
  attributes?: string[]
  children?: DOMNode[]
  childNodeCount?: number
}

interface SimplifiedDOMNode {
  tag: string
  id?: string
  classes?: string[]
  text?: string
  children?: SimplifiedDOMNode[]
  childCount?: number
}

/**
 * Simplify DOM node for output
 */
function simplifyDOMNode(node: DOMNode, maxDepth: number, currentDepth: number = 0): SimplifiedDOMNode | null {
  // Skip non-element nodes except text nodes with content
  if (node.nodeType === 3) { // Text node
    const text = node.nodeValue?.trim()
    if (text && text.length > 0) {
      return { tag: '#text', text: text.slice(0, 200) }
    }
    return null
  }

  // Handle document node (nodeType 9) - traverse to children
  if (node.nodeType === 9) { // Document node
    if (node.children && node.children.length > 0) {
      // Find the html element (skip DOCTYPE)
      for (const child of node.children) {
        if (child.nodeType === 1) { // Element
          return simplifyDOMNode(child, maxDepth, currentDepth)
        }
      }
    }
    return null
  }

  if (node.nodeType !== 1) { // Not an element
    return null
  }

  const simplified: SimplifiedDOMNode = {
    tag: node.localName || node.nodeName.toLowerCase()
  }

  // Parse attributes
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i += 2) {
      const name = node.attributes[i]
      const value = node.attributes[i + 1]
      if (name === 'id') {
        simplified.id = value
      } else if (name === 'class') {
        simplified.classes = value.split(/\s+/).filter(Boolean).slice(0, 5)
      }
    }
  }

  // Add child count for truncated branches
  if (node.childNodeCount !== undefined && node.childNodeCount > 0) {
    simplified.childCount = node.childNodeCount
  }

  // Process children if within depth limit
  if (node.children && currentDepth < maxDepth) {
    const childNodes = node.children
      .map(child => simplifyDOMNode(child, maxDepth, currentDepth + 1))
      .filter((n): n is SimplifiedDOMNode => n !== null)

    if (childNodes.length > 0) {
      simplified.children = childNodes.slice(0, 50) // Limit children per node
    }
  }

  return simplified
}

/**
 * Get DOM tree using chrome.debugger
 */
async function handleBrowserGetDomTree(message: {
  requestId: string
  tabId?: number
  maxDepth?: number
  selector?: string
}) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-dom-tree-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const maxDepth = Math.min(message.maxDepth || 4, 10) // Cap at 10 levels

    const result = await withDebugger(targetTabId, async (target) => {
      // Enable DOM domain
      await sendDebuggerCommand(target, 'DOM.enable')

      // Get document
      const docResult = await sendDebuggerCommand<{ root: DOMNode }>(target, 'DOM.getDocument', {
        depth: maxDepth,
        pierce: true // Pierce through shadow DOM
      })

      // If selector specified, find that node instead
      if (message.selector) {
        try {
          const queryResult = await sendDebuggerCommand<{ nodeId: number }>(
            target,
            'DOM.querySelector',
            { nodeId: docResult.root.nodeId, selector: message.selector }
          )

          if (queryResult.nodeId) {
            const nodeResult = await sendDebuggerCommand<{ node: DOMNode }>(
              target,
              'DOM.describeNode',
              { nodeId: queryResult.nodeId, depth: maxDepth }
            )
            return nodeResult.node
          }
        } catch {
          // Selector not found, return full document
        }
      }

      return docResult.root
    })

    // Simplify the DOM tree for output
    const simplified = simplifyDOMNode(result, maxDepth)

    sendToWebSocket({
      type: 'browser-get-dom-tree-result',
      requestId: message.requestId,
      success: true,
      tree: simplified,
      nodeCount: countNodes(simplified)
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-dom-tree-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Count nodes in simplified tree
 */
function countNodes(node: SimplifiedDOMNode | null): number {
  if (!node) return 0
  let count = 1
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}

interface PerformanceMetric {
  name: string
  value: number
}

/**
 * Profile page performance using chrome.debugger
 */
async function handleBrowserProfilePerformance(message: {
  requestId: string
  tabId?: number
}) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-profile-performance-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const result = await withDebugger(targetTabId, async (target) => {
      // Enable Performance domain
      await sendDebuggerCommand(target, 'Performance.enable')

      // Get metrics
      const metricsResult = await sendDebuggerCommand<{ metrics: PerformanceMetric[] }>(
        target,
        'Performance.getMetrics'
      )

      return metricsResult.metrics
    })

    // Format metrics into categories
    const timing: Record<string, number> = {}
    const memory: Record<string, number> = {}
    const dom: Record<string, number> = {}
    const other: Record<string, number> = {}

    for (const metric of result) {
      const name = metric.name
      const value = metric.value

      // Timing metrics (convert to ms)
      if (name.includes('Time') || name.includes('Duration') || name === 'TaskDuration') {
        timing[name] = Math.round(value * 1000 * 100) / 100 // Round to 2 decimals
      }
      // Memory metrics (convert to MB)
      else if (name.includes('Memory') || name.includes('Size') || name === 'JSHeapUsedSize' || name === 'JSHeapTotalSize') {
        memory[name] = Math.round(value / 1024 / 1024 * 100) / 100 // MB with 2 decimals
      }
      // DOM metrics
      else if (name.includes('Node') || name.includes('Document') || name.includes('Frame') || name.includes('Layout')) {
        dom[name] = Math.round(value)
      }
      // Other metrics
      else {
        other[name] = Math.round(value * 1000) / 1000
      }
    }

    sendToWebSocket({
      type: 'browser-profile-performance-result',
      requestId: message.requestId,
      success: true,
      timing,
      memory,
      dom,
      other,
      rawMetrics: result
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-profile-performance-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

interface CoverageRange {
  startOffset: number
  endOffset: number
  count: number
}

interface ScriptCoverage {
  scriptId: string
  url: string
  functions: Array<{
    functionName: string
    ranges: CoverageRange[]
  }>
}

interface CSSCoverage {
  styleSheetId: string
  sourceURL: string
  startOffset: number
  endOffset: number
  used: boolean
}

/**
 * Get JS/CSS code coverage using chrome.debugger
 */
async function handleBrowserGetCoverage(message: {
  requestId: string
  tabId?: number
  coverageType?: 'js' | 'css' | 'both'
}) {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-coverage-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const coverageType = message.coverageType || 'both'

    const result = await withDebugger(targetTabId, async (target) => {
      const coverage: {
        js?: Array<{
          url: string
          usedBytes: number
          totalBytes: number
          usedPercent: number
          unusedRanges: number
        }>
        css?: Array<{
          url: string
          usedBytes: number
          totalBytes: number
          usedPercent: number
        }>
      } = {}

      // JS Coverage
      if (coverageType === 'js' || coverageType === 'both') {
        // Enable Profiler domain for JS coverage
        await sendDebuggerCommand(target, 'Profiler.enable')
        await sendDebuggerCommand(target, 'Profiler.startPreciseCoverage', {
          callCount: true,
          detailed: true
        })

        // Small delay to collect some coverage data
        await new Promise(resolve => setTimeout(resolve, 100))

        // Get coverage
        const jsCoverageResult = await sendDebuggerCommand<{ result: ScriptCoverage[] }>(
          target,
          'Profiler.takePreciseCoverage'
        )

        await sendDebuggerCommand(target, 'Profiler.stopPreciseCoverage')
        await sendDebuggerCommand(target, 'Profiler.disable')

        // Process JS coverage
        coverage.js = jsCoverageResult.result
          .filter(script => script.url && !script.url.startsWith('chrome-extension://'))
          .map(script => {
            let totalBytes = 0
            let usedBytes = 0
            let unusedRanges = 0

            for (const func of script.functions) {
              for (const range of func.ranges) {
                const rangeSize = range.endOffset - range.startOffset
                totalBytes += rangeSize
                if (range.count > 0) {
                  usedBytes += rangeSize
                } else {
                  unusedRanges++
                }
              }
            }

            return {
              url: script.url,
              usedBytes,
              totalBytes,
              usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
              unusedRanges
            }
          })
          .filter(s => s.totalBytes > 0)
          .sort((a, b) => b.totalBytes - a.totalBytes)
          .slice(0, 50) // Top 50 scripts
      }

      // CSS Coverage
      if (coverageType === 'css' || coverageType === 'both') {
        // Enable DOM first (required for CSS)
        await sendDebuggerCommand(target, 'DOM.enable')
        // Enable CSS domain
        await sendDebuggerCommand(target, 'CSS.enable')
        await sendDebuggerCommand(target, 'CSS.startRuleUsageTracking')

        // Small delay to collect coverage
        await new Promise(resolve => setTimeout(resolve, 100))

        const cssCoverageResult = await sendDebuggerCommand<{ ruleUsage: CSSCoverage[] }>(
          target,
          'CSS.stopRuleUsageTracking'
        )

        await sendDebuggerCommand(target, 'CSS.disable')
        await sendDebuggerCommand(target, 'DOM.disable')

        // Group by stylesheet
        const styleSheets = new Map<string, { usedBytes: number; totalBytes: number }>()

        for (const rule of cssCoverageResult.ruleUsage) {
          if (!rule.sourceURL || rule.sourceURL.startsWith('chrome-extension://')) continue

          const existing = styleSheets.get(rule.sourceURL) || { usedBytes: 0, totalBytes: 0 }
          const ruleSize = rule.endOffset - rule.startOffset
          existing.totalBytes += ruleSize
          if (rule.used) {
            existing.usedBytes += ruleSize
          }
          styleSheets.set(rule.sourceURL, existing)
        }

        coverage.css = Array.from(styleSheets.entries())
          .map(([url, data]) => ({
            url,
            usedBytes: data.usedBytes,
            totalBytes: data.totalBytes,
            usedPercent: data.totalBytes > 0 ? Math.round((data.usedBytes / data.totalBytes) * 100) : 0
          }))
          .filter(s => s.totalBytes > 0)
          .sort((a, b) => b.totalBytes - a.totalBytes)
          .slice(0, 50) // Top 50 stylesheets
      }

      return coverage
    })

    // Calculate summary
    const summary = {
      js: result.js ? {
        files: result.js.length,
        totalBytes: result.js.reduce((sum, s) => sum + s.totalBytes, 0),
        usedBytes: result.js.reduce((sum, s) => sum + s.usedBytes, 0),
        usedPercent: 0
      } : undefined,
      css: result.css ? {
        files: result.css.length,
        totalBytes: result.css.reduce((sum, s) => sum + s.totalBytes, 0),
        usedBytes: result.css.reduce((sum, s) => sum + s.usedBytes, 0),
        usedPercent: 0
      } : undefined
    }

    if (summary.js && summary.js.totalBytes > 0) {
      summary.js.usedPercent = Math.round((summary.js.usedBytes / summary.js.totalBytes) * 100)
    }
    if (summary.css && summary.css.totalBytes > 0) {
      summary.css.usedPercent = Math.round((summary.css.usedBytes / summary.css.totalBytes) * 100)
    }

    sendToWebSocket({
      type: 'browser-get-coverage-result',
      requestId: message.requestId,
      success: true,
      coverage: result,
      summary
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-coverage-result',
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
      } else if (message.type === 'QUEUE_COMMAND') {
        // Queue command to chat bar (from external WebSocket clients like ggprompts)
        // Opens sidebar and populates chat input
        console.log('[WS] QUEUE_COMMAND received:', message.command?.slice(0, 50))
        ;(async () => {
          try {
            const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
            const targetWindow = windows.find(w => w.focused) || windows[0]
            if (targetWindow?.id) {
              await chrome.sidePanel.open({ windowId: targetWindow.id })
            }
          } catch {
            // Silently ignore - sidebar may already be open
          }
          // Broadcast to sidepanel after brief delay for sidebar to open
          setTimeout(() => {
            broadcastToClients({
              type: 'QUEUE_COMMAND',
              command: message.command,
            })
          }, 300)
        })()
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
      } else if (message.type === 'browser-open-url') {
        // Open a URL in new or existing tab
        console.log('📑 Browser MCP: open-url request', message.requestId, message.url)
        handleBrowserOpenUrl(message)
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
      } else if (message.type === 'browser-screenshot') {
        // Screenshot via captureVisibleTab (viewport or full page)
        console.log('📸 Browser MCP: screenshot request', message.requestId, message.fullPage ? 'full' : 'viewport')
        handleBrowserScreenshot(message)
      } else if (message.type === 'browser-save-page') {
        // Save page as MHTML using pageCapture API
        console.log('📄 Browser MCP: save-page request', message.requestId, message.tabId)
        handleBrowserSavePage(message)
      }
      // ============================================
      // BROWSER MCP - Interaction handlers (Click, Fill, Get Element)
      // ============================================
      else if (message.type === 'browser-click-element') {
        // Click an element by CSS selector
        console.log('🖱️ Browser MCP: click-element request', message.requestId, message.selector)
        handleBrowserClickElement(message)
      } else if (message.type === 'browser-fill-input') {
        // Fill an input field with text
        console.log('⌨️ Browser MCP: fill-input request', message.requestId, message.selector)
        handleBrowserFillInput(message)
      } else if (message.type === 'browser-get-element-info') {
        // Get detailed element information
        console.log('🔍 Browser MCP: get-element-info request', message.requestId, message.selector)
        handleBrowserGetElementInfo(message)
      }
      // ============================================
      // BROWSER MCP - Bookmark handlers
      // ============================================
      else if (message.type === 'browser-bookmarks-tree') {
        console.log('📚 Browser MCP: bookmarks-tree request', message.requestId)
        handleBrowserBookmarksTree(message)
      } else if (message.type === 'browser-bookmarks-search') {
        console.log('📚 Browser MCP: bookmarks-search request', message.requestId, message.query)
        handleBrowserBookmarksSearch(message)
      } else if (message.type === 'browser-bookmarks-create') {
        console.log('📚 Browser MCP: bookmarks-create request', message.requestId, message.url)
        handleBrowserBookmarksCreate(message)
      } else if (message.type === 'browser-bookmarks-create-folder') {
        console.log('📚 Browser MCP: bookmarks-create-folder request', message.requestId, message.title)
        handleBrowserBookmarksCreateFolder(message)
      } else if (message.type === 'browser-bookmarks-move') {
        console.log('📚 Browser MCP: bookmarks-move request', message.requestId, message.id)
        handleBrowserBookmarksMove(message)
      } else if (message.type === 'browser-bookmarks-delete') {
        console.log('📚 Browser MCP: bookmarks-delete request', message.requestId, message.id)
        handleBrowserBookmarksDelete(message)
      }
      // ============================================
      // BROWSER MCP - Network Capture handlers
      // ============================================
      else if (message.type === 'browser-enable-network-capture') {
        handleBrowserEnableNetworkCapture(message)
      } else if (message.type === 'browser-get-network-requests') {
        handleBrowserGetNetworkRequests(message)
      } else if (message.type === 'browser-clear-network-requests') {
        handleBrowserClearNetworkRequests(message)
      }
      // ============================================
      // BROWSER MCP - Debugger handlers (DOM, Performance, Coverage)
      // ============================================
      else if (message.type === 'browser-get-dom-tree') {
        console.log('🔍 Browser MCP: get-dom-tree request', message.requestId)
        handleBrowserGetDomTree(message)
      } else if (message.type === 'browser-profile-performance') {
        console.log('⚡ Browser MCP: profile-performance request', message.requestId)
        handleBrowserProfilePerformance(message)
      } else if (message.type === 'browser-get-coverage') {
        console.log('📊 Browser MCP: get-coverage request', message.requestId)
        handleBrowserGetCoverage(message)
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

    case 'OPEN_SETTINGS_EDIT_PROFILE':
      // Open sidebar and broadcast to sidepanel to open settings modal with specific profile
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
          type: 'OPEN_SETTINGS_EDIT_PROFILE',
          profileId: message.profileId,
        })
      }, 300)
      break

    case 'FOCUS_IN_3D':
      // 3D Focus page opened/refreshed - broadcast to sidepanel to show placeholder
      broadcastToClients({
        type: 'FOCUS_IN_3D',
        terminalId: message.terminalId,
      })
      break

    case 'RETURN_FROM_3D':
      // 3D Focus page closing - broadcast to sidepanel to restore terminal
      broadcastToClients({
        type: 'RETURN_FROM_3D',
        terminalId: message.terminalId,
      })
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
        const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
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
          : await chrome.tabs.query({ active: true, lastFocusedWindow: true })
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
      console.error('Error removing context menus:', chrome.runtime.lastError.message)
    }

    // Simple context menu: open side panel
    // Note: Chrome sidePanel API only has open(), no close() or toggle()
    chrome.contextMenus.create({
      id: 'open-sidepanel',
      title: 'Open Terminal Sidebar',
      contexts: ['all'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating open-sidepanel menu:', chrome.runtime.lastError.message)
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
        console.error('Error creating paste-to-terminal menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for selected text - queue to chat input
    chrome.contextMenus.create({
      id: 'send-to-chat',
      title: 'Send "%s" to Chat',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating send-to-chat menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for selected text - read aloud using TTS
    chrome.contextMenus.create({
      id: 'read-aloud',
      title: 'Read "%s" Aloud',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating read-aloud menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for page - save as MHTML
    chrome.contextMenus.create({
      id: 'save-page-mhtml',
      title: 'Save Page as MHTML',
      contexts: ['page'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating save-page-mhtml menu:', chrome.runtime.lastError.message)
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
    // CRITICAL: Must call sidePanel.open() synchronously - any await breaks user gesture chain
    const windowId = tab?.windowId && tab.windowId > 0 ? tab.windowId : undefined
    if (windowId) {
      chrome.sidePanel.open({ windowId }).catch(err => {
        console.warn('[Background] Sidebar open failed:', err)
      })
    } else {
      console.warn('[Background] No valid windowId from tab, cannot open sidebar')
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

  if (menuId === 'read-aloud' && info.selectionText) {
    // Read selected text aloud using TTS
    const selectedText = info.selectionText
    console.log('🔊 Reading aloud:', selectedText.substring(0, 50) + '...')

    try {
      // Load audio settings from Chrome storage
      const result = await chrome.storage.local.get(['audioSettings'])
      const audioSettings = (result.audioSettings || {}) as { voice?: string; rate?: string; volume?: number }

      // Handle random voice selection
      const TTS_VOICE_VALUES = [
        'en-US-AndrewMultilingualNeural', 'en-US-EmmaMultilingualNeural', 'en-US-BrianMultilingualNeural',
        'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural',
        'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-AU-NatashaNeural', 'en-AU-WilliamMultilingualNeural'
      ]
      let voice = audioSettings.voice || 'en-US-AndrewMultilingualNeural'
      if (voice === 'random') {
        voice = TTS_VOICE_VALUES[Math.floor(Math.random() * TTS_VOICE_VALUES.length)]
      }

      const response = await fetch('http://localhost:8129/api/audio/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: selectedText,
          voice,
          rate: audioSettings.rate || '+0%',
          volume: audioSettings.volume ?? 0.7
        })
      })
      const data = await response.json()
      if (!data.success) {
        console.error('TTS failed:', data.error)
      }
    } catch (err) {
      console.error('Failed to call TTS endpoint:', err)
    }
  }

  if (menuId === 'save-page-mhtml' && tab?.id) {
    // Save page as MHTML directly (no MCP/WebSocket needed)
    console.log('📄 Saving page as MHTML:', tab.title)

    try {
      // Check if tab URL is capturable
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        console.error('Cannot save chrome:// or extension pages')
        return
      }

      // Capture the page as MHTML
      const mhtmlBlob = await new Promise<Blob>((resolve, reject) => {
        chrome.pageCapture.saveAsMHTML({ tabId: tab.id! }, (blob) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (!blob) {
            reject(new Error('Failed to capture page'))
          } else {
            resolve(blob)
          }
        })
      })

      // Generate filename from page title
      const pageTitle = tab.title || 'page'
      const sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '-').substring(0, 100)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
      const filename = `${sanitizedTitle}-${timestamp}.mhtml`

      // Convert blob to data URL (service workers don't support URL.createObjectURL)
      const arrayBuffer = await mhtmlBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      const base64 = btoa(binary)
      const dataUrl = `data:multipart/related;base64,${base64}`

      // Download the file
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError.message)
        } else {
          console.log('✅ Page saved, download ID:', downloadId)
        }
      })
    } catch (err) {
      console.error('Failed to save page:', err)
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
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

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
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

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
