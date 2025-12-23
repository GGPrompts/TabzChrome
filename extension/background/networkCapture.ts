/**
 * Network request capture using chrome.webRequest API
 * Captures and stores HTTP requests for MCP access
 */

import { sendToWebSocket } from './websocket'

// Network request storage interface
export interface StoredNetworkRequest {
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

// Storage constants
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
export function enableNetworkCapture(tabId?: number): { success: boolean; error?: string } {
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
export function getNetworkRequests(options: {
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
export function clearNetworkRequests(): void {
  networkRequests.clear()
  console.log('🌐 Network requests cleared')
}

// ============================================
// WebSocket handlers for network capture
// ============================================

export async function handleBrowserEnableNetworkCapture(message: { requestId: string; tabId?: number }): Promise<void> {
  console.log('🌐 Browser MCP: enable-network-capture request', message.requestId)
  const result = enableNetworkCapture(message.tabId)
  sendToWebSocket({
    type: 'browser-enable-network-capture-result',
    requestId: message.requestId,
    success: result.success,
    error: result.error
  })
}

export async function handleBrowserGetNetworkRequests(message: {
  requestId: string
  urlPattern?: string
  method?: string
  statusMin?: number
  statusMax?: number
  resourceType?: string
  limit?: number
  offset?: number
  tabId?: number
}): Promise<void> {
  console.log('🌐 Browser MCP: get-network-requests request', message.requestId)
  const result = getNetworkRequests({
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

export async function handleBrowserClearNetworkRequests(message: { requestId: string }): Promise<void> {
  console.log('🌐 Browser MCP: clear-network-requests request', message.requestId)
  clearNetworkRequests()
  sendToWebSocket({
    type: 'browser-clear-network-requests-result',
    requestId: message.requestId,
    success: true
  })
}
