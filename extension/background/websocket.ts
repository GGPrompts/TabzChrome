/**
 * WebSocket connection management
 * Handles connection to backend, message routing, and reconnection
 */

import type { ExtensionMessage } from '../shared/messaging'
import {
  ws, setWs, wsReconnectAttempts, setWsReconnectAttempts, incrementWsReconnectAttempts,
  MAX_RECONNECT_ATTEMPTS, WS_URL, ALARM_WS_RECONNECT,
  broadcastToClients
} from './state'
import {
  handleBrowserEnableNetworkCapture,
  handleBrowserGetNetworkRequests,
  handleBrowserClearNetworkRequests
} from './networkCapture'
import {
  handleBrowserListTabs,
  handleBrowserSwitchTab,
  handleBrowserGetActiveTab,
  handleBrowserOpenUrl,
  handleBrowserGetProfiles,
  handleBrowserGetSettings,
  handleBrowserDownloadFile,
  handleBrowserGetDownloads,
  handleBrowserCancelDownload,
  handleBrowserCaptureImage,
  handleBrowserSavePage,
  handleBrowserBookmarksTree,
  handleBrowserBookmarksSearch,
  handleBrowserBookmarksCreate,
  handleBrowserBookmarksCreateFolder,
  handleBrowserBookmarksMove,
  handleBrowserBookmarksDelete,
  handleBrowserClickElement,
  handleBrowserFillInput,
  handleBrowserGetElementInfo,
  handleBrowserScreenshot,
  handleBrowserGetDomTree,
  handleBrowserProfilePerformance,
  handleBrowserGetCoverage,
  handleBrowserExecuteScript,
  handleBrowserGetPageInfo,
  handleBrowserListTabGroups,
  handleBrowserCreateTabGroup,
  handleBrowserUpdateTabGroup,
  handleBrowserAddToTabGroup,
  handleBrowserUngroupTabs,
  handleBrowserAddToClaudeGroup,
  handleBrowserRemoveFromClaudeGroup,
  handleBrowserGetClaudeGroupStatus
} from './browserMcp'

// Forward declaration - will be set by alarms module
let scheduleReconnectFn: (() => void) | null = null

export function setScheduleReconnect(fn: () => void): void {
  scheduleReconnectFn = fn
}

/**
 * Send message to WebSocket
 */
export function sendToWebSocket(data: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  } else {
    console.error('[Background] WebSocket not connected! State:', ws?.readyState, 'Cannot send:', data)
    // Try to reconnect if not connected
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      console.log('[Background] Attempting to reconnect WebSocket...')
      connectWebSocket()
    }
  }
}

/**
 * Update extension badge with active terminal count
 * This queries the backend for the actual terminal count
 */
export async function updateBadge(source: string = 'unknown'): Promise<void> {
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

/**
 * Connect to backend WebSocket
 */
export async function connectWebSocket(): Promise<void> {
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
    } catch {
      // Ignore errors when closing
    }
    setWs(null)
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
  } catch {
    // Backend might not require auth (older version) - continue without token
    console.log('No auth token available, connecting without authentication')
  }

  console.log('Connecting to backend WebSocket:', WS_URL)
  const newWs = new WebSocket(wsUrl)
  setWs(newWs)

  newWs.onopen = () => {
    console.log('Background WebSocket connected')
    setWsReconnectAttempts(0) // Reset reconnect counter on successful connection
    chrome.alarms.clear(ALARM_WS_RECONNECT) // Clear any pending reconnect alarm

    // Identify as sidebar to backend so it counts us for "multiple browser windows" warning
    sendToWebSocket({ type: 'identify', clientType: 'sidebar' })

    updateBadge('ws.onopen')
    broadcastToClients({ type: 'WS_CONNECTED' })
  }

  newWs.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      routeWebSocketMessage(message)
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err)
    }
  }

  newWs.onerror = (error) => {
    console.error('WebSocket error:', {
      url: WS_URL,
      readyState: ws?.readyState,
      readyStateText: ws?.readyState === 0 ? 'CONNECTING' : ws?.readyState === 1 ? 'OPEN' : ws?.readyState === 2 ? 'CLOSING' : ws?.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
      error: error,
    })
  }

  newWs.onclose = (event) => {
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

    setWs(null)
    broadcastToClients({ type: 'WS_DISCONNECTED' })

    // Schedule reconnection using alarms (survives service worker idle)
    if (scheduleReconnectFn) {
      scheduleReconnectFn()
    }
  }
}

/**
 * Route incoming WebSocket messages to appropriate handlers
 * WebSocket messages are untyped JSON - we do runtime type checking
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeWebSocketMessage(message: any): void {
  // Handle terminal output specially - broadcast directly as TERMINAL_OUTPUT
  if (message.type === 'output' || message.type === 'terminal-output') {
    broadcastToClients({
      type: 'TERMINAL_OUTPUT',
      terminalId: message.terminalId as string,
      data: message.data as string,
    })
    return
  }

  if (message.type === 'terminals') {
    // Terminal list received on connection - restore sessions
    // Update badge based on terminal count
    const terminalCount = (message.data as unknown[])?.length || 0
    chrome.action.setBadgeText({ text: terminalCount > 0 ? String(terminalCount) : '' })
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })

    broadcastToClients({
      type: 'WS_MESSAGE',
      data: message,
    })
    return
  }

  if (message.type === 'terminal-spawned') {
    // Terminal spawned - broadcast first so sidepanel can focus it
    const clientMessage: ExtensionMessage = {
      type: 'WS_MESSAGE',
      data: message,
    }
    broadcastToClients(clientMessage)

    // Update badge count without requesting full terminal list
    chrome.action.getBadgeText({}, (text) => {
      const count = text ? parseInt(text) : 0
      chrome.action.setBadgeText({ text: String(count + 1) })
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })
    })
    return
  }

  if (message.type === 'terminal-closed') {
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
    return
  }

  if (message.type === 'terminal-reconnected') {
    // Terminal reconnected after backend restart - broadcast to terminals
    broadcastToClients({
      type: 'TERMINAL_RECONNECTED',
      terminalId: (message.data as { id?: string })?.id || '',
    })
    return
  }

  if (message.type === 'QUEUE_COMMAND') {
    // Queue command to chat bar (from external WebSocket clients like ggprompts)
    console.log('[WS] QUEUE_COMMAND received:', (message.command as string)?.slice(0, 50))
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
          command: message.command as string,
        })
      }, 300)
    })()
    return
  }

  // ============================================
  // BROWSER MCP - Handle requests from backend
  // ============================================

  if (message.type === 'browser-execute-script') {
    console.log('Browser MCP: execute-script request', message.requestId)
    handleBrowserExecuteScript(message)
    return
  }

  if (message.type === 'browser-get-page-info') {
    console.log('Browser MCP: get-page-info request', message.requestId)
    handleBrowserGetPageInfo(message)
    return
  }

  // Tab management handlers
  if (message.type === 'browser-list-tabs') {
    console.log('Browser MCP: list-tabs request', message.requestId)
    handleBrowserListTabs(message)
    return
  }

  if (message.type === 'browser-switch-tab') {
    console.log('Browser MCP: switch-tab request', message.requestId, message.tabId)
    handleBrowserSwitchTab(message)
    return
  }

  if (message.type === 'browser-get-active-tab') {
    console.log('Browser MCP: get-active-tab request', message.requestId)
    handleBrowserGetActiveTab(message)
    return
  }

  if (message.type === 'browser-open-url') {
    console.log('Browser MCP: open-url request', message.requestId, message.url)
    handleBrowserOpenUrl(message)
    return
  }

  if (message.type === 'browser-get-profiles') {
    console.log('Browser MCP: get-profiles request', message.requestId)
    handleBrowserGetProfiles(message)
    return
  }

  if (message.type === 'browser-get-settings') {
    console.log('Browser MCP: get-settings request', message.requestId)
    handleBrowserGetSettings(message)
    return
  }

  // Download handlers
  if (message.type === 'browser-download-file') {
    console.log('Browser MCP: download-file request', message.requestId, message.url)
    handleBrowserDownloadFile(message)
    return
  }

  if (message.type === 'browser-get-downloads') {
    console.log('Browser MCP: get-downloads request', message.requestId)
    handleBrowserGetDownloads(message)
    return
  }

  if (message.type === 'browser-cancel-download') {
    console.log('Browser MCP: cancel-download request', message.requestId, message.downloadId)
    handleBrowserCancelDownload(message)
    return
  }

  if (message.type === 'browser-capture-image') {
    console.log('Browser MCP: capture-image request', message.requestId, message.selector)
    handleBrowserCaptureImage(message)
    return
  }

  if (message.type === 'browser-screenshot') {
    console.log('Browser MCP: screenshot request', message.requestId, message.fullPage ? 'full' : 'viewport')
    handleBrowserScreenshot(message)
    return
  }

  if (message.type === 'browser-save-page') {
    console.log('Browser MCP: save-page request', message.requestId, message.tabId)
    handleBrowserSavePage(message)
    return
  }

  // Interaction handlers
  if (message.type === 'browser-click-element') {
    console.log('Browser MCP: click-element request', message.requestId, message.selector)
    handleBrowserClickElement(message)
    return
  }

  if (message.type === 'browser-fill-input') {
    console.log('Browser MCP: fill-input request', message.requestId, message.selector)
    handleBrowserFillInput(message)
    return
  }

  if (message.type === 'browser-get-element-info') {
    console.log('Browser MCP: get-element-info request', message.requestId, message.selector)
    handleBrowserGetElementInfo(message)
    return
  }

  // Bookmark handlers
  if (message.type === 'browser-bookmarks-tree') {
    console.log('Browser MCP: bookmarks-tree request', message.requestId)
    handleBrowserBookmarksTree(message)
    return
  }

  if (message.type === 'browser-bookmarks-search') {
    console.log('Browser MCP: bookmarks-search request', message.requestId, message.query)
    handleBrowserBookmarksSearch(message)
    return
  }

  if (message.type === 'browser-bookmarks-create') {
    console.log('Browser MCP: bookmarks-create request', message.requestId, message.url)
    handleBrowserBookmarksCreate(message)
    return
  }

  if (message.type === 'browser-bookmarks-create-folder') {
    console.log('Browser MCP: bookmarks-create-folder request', message.requestId, message.title)
    handleBrowserBookmarksCreateFolder(message)
    return
  }

  if (message.type === 'browser-bookmarks-move') {
    console.log('Browser MCP: bookmarks-move request', message.requestId, message.id)
    handleBrowserBookmarksMove(message)
    return
  }

  if (message.type === 'browser-bookmarks-delete') {
    console.log('Browser MCP: bookmarks-delete request', message.requestId, message.id)
    handleBrowserBookmarksDelete(message)
    return
  }

  // Network capture handlers
  if (message.type === 'browser-enable-network-capture') {
    handleBrowserEnableNetworkCapture(message)
    return
  }

  if (message.type === 'browser-get-network-requests') {
    handleBrowserGetNetworkRequests(message)
    return
  }

  if (message.type === 'browser-clear-network-requests') {
    handleBrowserClearNetworkRequests(message)
    return
  }

  // Debugger handlers
  if (message.type === 'browser-get-dom-tree') {
    console.log('Browser MCP: get-dom-tree request', message.requestId)
    handleBrowserGetDomTree(message)
    return
  }

  if (message.type === 'browser-profile-performance') {
    console.log('Browser MCP: profile-performance request', message.requestId)
    handleBrowserProfilePerformance(message)
    return
  }

  if (message.type === 'browser-get-coverage') {
    console.log('Browser MCP: get-coverage request', message.requestId)
    handleBrowserGetCoverage(message)
    return
  }

  // Tab group handlers
  if (message.type === 'browser-list-tab-groups') {
    console.log('Browser MCP: list-tab-groups request', message.requestId)
    handleBrowserListTabGroups(message)
    return
  }

  if (message.type === 'browser-create-tab-group') {
    console.log('Browser MCP: create-tab-group request', message.requestId)
    handleBrowserCreateTabGroup(message)
    return
  }

  if (message.type === 'browser-update-tab-group') {
    console.log('Browser MCP: update-tab-group request', message.requestId, message.groupId)
    handleBrowserUpdateTabGroup(message)
    return
  }

  if (message.type === 'browser-add-to-tab-group') {
    console.log('Browser MCP: add-to-tab-group request', message.requestId, message.groupId)
    handleBrowserAddToTabGroup(message)
    return
  }

  if (message.type === 'browser-ungroup-tabs') {
    console.log('Browser MCP: ungroup-tabs request', message.requestId)
    handleBrowserUngroupTabs(message)
    return
  }

  if (message.type === 'browser-add-to-claude-group') {
    console.log('Browser MCP: add-to-claude-group request', message.requestId, message.tabId)
    handleBrowserAddToClaudeGroup(message)
    return
  }

  if (message.type === 'browser-remove-from-claude-group') {
    console.log('Browser MCP: remove-from-claude-group request', message.requestId, message.tabId)
    handleBrowserRemoveFromClaudeGroup(message)
    return
  }

  if (message.type === 'browser-get-claude-group-status') {
    console.log('Browser MCP: get-claude-group-status request', message.requestId)
    handleBrowserGetClaudeGroupStatus(message)
    return
  }

  // Broadcast other messages as WS_MESSAGE
  const clientMessage: ExtensionMessage = {
    type: 'WS_MESSAGE',
    data: message,
  }
  broadcastToClients(clientMessage)
}
