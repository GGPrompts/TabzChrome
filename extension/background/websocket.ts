/**
 * WebSocket connection management
 * Handles connection to backend, message routing, and reconnection
 */

import type { ExtensionMessage } from '../shared/messaging'
import {
  ws, setWs, wsReconnectAttempts, setWsReconnectAttempts, incrementWsReconnectAttempts,
  hadSuccessfulConnection, setHadSuccessfulConnection,
  notifiedOffline, setNotifiedOffline,
  MAX_RECONNECT_ATTEMPTS, WS_URL, ALARM_WS_RECONNECT,
  broadcastToClients
} from './state'
import {
  NotificationSettings,
  NotificationEventType,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../components/settings/types'
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
  handleBrowserCreateProfile,
  handleBrowserUpdateProfile,
  handleBrowserDeleteProfile,
  handleBrowserImportProfiles,
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
  handleBrowserGetClaudeGroupStatus,
  handleBrowserListWindows,
  handleBrowserCreateWindow,
  handleBrowserUpdateWindow,
  handleBrowserCloseWindow,
  handleBrowserGetDisplays,
  handleBrowserTileWindows,
  handleBrowserPopoutTerminal,
  handleBrowserHistorySearch,
  handleBrowserHistoryVisits,
  handleBrowserHistoryRecent,
  handleBrowserHistoryDeleteUrl,
  handleBrowserHistoryDeleteRange,
  handleBrowserSessionsRecent,
  handleBrowserSessionsRestore,
  handleBrowserSessionsDevices,
  handleBrowserCookiesGet,
  handleBrowserCookiesList,
  handleBrowserCookiesSet,
  handleBrowserCookiesDelete,
  handleBrowserCookiesAudit,
  handleBrowserEmulateDevice,
  handleBrowserEmulateClear,
  handleBrowserEmulateGeolocation,
  handleBrowserEmulateNetwork,
  handleBrowserEmulateMedia,
  handleBrowserEmulateVision,
  handleBrowserNotificationShow,
  handleBrowserNotificationUpdate,
  handleBrowserNotificationClear,
  handleBrowserNotificationList
} from './browserMcp'

// Handler registry to prevent tree-shaking of notification handlers
// Attaching to globalThis has side-effects that bundlers can't eliminate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NOTIFICATION_HANDLERS: Record<string, (message: any) => Promise<void>> = {
  'browser-notification-show': handleBrowserNotificationShow,
  'browser-notification-update': handleBrowserNotificationUpdate,
  'browser-notification-clear': handleBrowserNotificationClear,
  'browser-notification-list': handleBrowserNotificationList,
}
// Force inclusion by attaching to globalThis - can't be tree-shaken
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__NOTIFICATION_HANDLERS__ = NOTIFICATION_HANDLERS

// Forward declaration - will be set by alarms module
let scheduleReconnectFn: (() => void) | null = null

export function setScheduleReconnect(fn: () => void): void {
  scheduleReconnectFn = fn
}

/**
 * Check if currently within quiet hours
 */
function isQuietHours(settings: NotificationSettings): boolean {
  if (!settings.quietHours.enabled) return false

  const now = new Date()
  const currentHour = now.getHours()
  const { startHour, endHour } = settings.quietHours

  if (startHour < endHour) {
    // Simple case: e.g., 9 AM to 5 PM
    return currentHour >= startHour && currentHour < endHour
  } else {
    // Overnight case: e.g., 10 PM to 8 AM
    return currentHour >= startHour || currentHour < endHour
  }
}

/**
 * Show a desktop notification if enabled and not in quiet hours.
 * Used for connection events in the background service worker.
 */
async function showConnectionNotification(
  eventType: NotificationEventType,
  title: string,
  message: string
): Promise<void> {
  try {
    // Load notification settings from Chrome storage
    const storage = await chrome.storage.local.get('notificationSettings')
    const stored = storage.notificationSettings as Partial<NotificationSettings> | undefined
    const settings: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...stored,
      quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours, ...stored?.quietHours },
      events: { ...DEFAULT_NOTIFICATION_SETTINGS.events, ...stored?.events },
    }

    // Check master toggle
    if (!settings.enabled) return

    // Check per-event toggle
    if (!settings.events[eventType]) return

    // Check quiet hours
    if (isQuietHours(settings)) return

    // Show the notification
    const notificationId = `tabz-${eventType}-${Date.now()}`
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title,
      message,
      priority: eventType === 'backendDisconnect' ? 2 : 0,
      requireInteraction: false,
    })
  } catch (err) {
    console.error('[Background] Failed to show notification:', err)
  }
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
 * Send default profile settings to backend
 * Called on WebSocket connect so backend can use these for API spawns
 */
export async function sendDefaultProfileSettings(): Promise<void> {
  try {
    const storage = await chrome.storage.local.get(['profiles', 'defaultProfile', 'categorySettings'])
    const profiles = (storage.profiles || []) as Array<{ id: string; category?: string; [key: string]: unknown }>
    const defaultProfileId = (storage.defaultProfile as string) || 'default'
    const categorySettings = (storage.categorySettings || {}) as Record<string, { color?: string }>

    // Find the default profile
    const defaultProfile = profiles.find(p => p.id === defaultProfileId) || profiles[0]
    if (!defaultProfile) {
      console.log('[Background] No default profile found, skipping default settings sync')
      return
    }

    // Resolve category color
    const category = defaultProfile.category
    const color = category ? categorySettings[category]?.color : undefined

    // Send to backend
    sendToWebSocket({
      type: 'set-default-profile',
      settings: {
        color,
        profile: defaultProfile
      }
    })
    console.log('[Background] Sent default profile settings to backend:', { color, profileId: defaultProfile.id })
  } catch (err) {
    console.error('[Background] Failed to send default profile settings:', err)
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

    // Show reconnect notification if we previously had a connection and were reconnecting
    if (hadSuccessfulConnection && wsReconnectAttempts > 0) {
      showConnectionNotification(
        'backendReconnect',
        'TabzChrome Reconnected',
        'Backend connection restored'
      )
    }

    setWsReconnectAttempts(0) // Reset reconnect counter on successful connection
    setHadSuccessfulConnection(true) // Mark that we've had at least one successful connection
    setNotifiedOffline(false) // Reset offline notification flag (ready to notify on next disconnect)
    chrome.alarms.clear(ALARM_WS_RECONNECT) // Clear any pending reconnect alarm

    // Identify as sidebar to backend so it counts us for "multiple browser windows" warning
    sendToWebSocket({ type: 'identify', clientType: 'sidebar' })

    // Send default profile settings to backend for API spawns
    sendDefaultProfileSettings()

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

    // Show disconnect notification for abnormal closures (only once per disconnect)
    if ((!event.wasClean || event.code === 1006) && !notifiedOffline) {
      setNotifiedOffline(true) // Prevent repeated notifications during reconnection attempts
      showConnectionNotification(
        'backendDisconnect',
        'TabzChrome Disconnected',
        'Backend connection lost. Reconnecting...'
      )
    }

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

  if (message.type === 'spawn-error') {
    // Terminal spawn failed (e.g., invalid working directory)
    // Broadcast to sidepanel so it can show a notification
    console.log('[WS] Spawn error:', message.error)
    broadcastToClients({
      type: 'WS_MESSAGE',
      data: message,
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

  if (message.type === 'browser-create-profile') {
    console.log('Browser MCP: create-profile request', message.requestId, message.profile?.name)
    handleBrowserCreateProfile(message)
    return
  }

  if (message.type === 'browser-update-profile') {
    console.log('Browser MCP: update-profile request', message.requestId, message.id)
    handleBrowserUpdateProfile(message)
    return
  }

  if (message.type === 'browser-delete-profile') {
    console.log('Browser MCP: delete-profile request', message.requestId, message.id)
    handleBrowserDeleteProfile(message)
    return
  }

  if (message.type === 'browser-import-profiles') {
    console.log('Browser MCP: import-profiles request', message.requestId, message.profiles?.length, 'profiles')
    handleBrowserImportProfiles(message)
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

  // Window management handlers
  if (message.type === 'browser-list-windows') {
    console.log('Browser MCP: list-windows request', message.requestId)
    handleBrowserListWindows(message)
    return
  }

  if (message.type === 'browser-create-window') {
    console.log('Browser MCP: create-window request', message.requestId, message.url)
    handleBrowserCreateWindow(message)
    return
  }

  if (message.type === 'browser-update-window') {
    console.log('Browser MCP: update-window request', message.requestId, message.windowId)
    handleBrowserUpdateWindow(message)
    return
  }

  if (message.type === 'browser-close-window') {
    console.log('Browser MCP: close-window request', message.requestId, message.windowId)
    handleBrowserCloseWindow(message)
    return
  }

  if (message.type === 'browser-get-displays') {
    console.log('Browser MCP: get-displays request', message.requestId)
    handleBrowserGetDisplays(message)
    return
  }

  if (message.type === 'browser-tile-windows') {
    console.log('Browser MCP: tile-windows request', message.requestId, message.windowIds)
    handleBrowserTileWindows(message)
    return
  }

  if (message.type === 'browser-popout-terminal') {
    console.log('Browser MCP: popout-terminal request', message.requestId, message.terminalId)
    handleBrowserPopoutTerminal(message)
    return
  }

  // History handlers
  if (message.type === 'browser-history-search') {
    console.log('Browser MCP: history-search request', message.requestId, message.query)
    handleBrowserHistorySearch(message)
    return
  }

  if (message.type === 'browser-history-visits') {
    console.log('Browser MCP: history-visits request', message.requestId, message.url)
    handleBrowserHistoryVisits(message)
    return
  }

  if (message.type === 'browser-history-recent') {
    console.log('Browser MCP: history-recent request', message.requestId)
    handleBrowserHistoryRecent(message)
    return
  }

  if (message.type === 'browser-history-delete-url') {
    console.log('Browser MCP: history-delete-url request', message.requestId, message.url)
    handleBrowserHistoryDeleteUrl(message)
    return
  }

  if (message.type === 'browser-history-delete-range') {
    console.log('Browser MCP: history-delete-range request', message.requestId)
    handleBrowserHistoryDeleteRange(message)
    return
  }

  // Sessions handlers (recently closed, synced devices)
  if (message.type === 'browser-sessions-recent') {
    console.log('Browser MCP: sessions-recent request', message.requestId)
    handleBrowserSessionsRecent(message)
    return
  }

  if (message.type === 'browser-sessions-restore') {
    console.log('Browser MCP: sessions-restore request', message.requestId, message.sessionId)
    handleBrowserSessionsRestore(message)
    return
  }

  if (message.type === 'browser-sessions-devices') {
    console.log('Browser MCP: sessions-devices request', message.requestId)
    handleBrowserSessionsDevices(message)
    return
  }

  // Cookie handlers
  if (message.type === 'browser-cookies-get') {
    console.log('Browser MCP: cookies-get request', message.requestId, message.name)
    handleBrowserCookiesGet(message)
    return
  }

  if (message.type === 'browser-cookies-list') {
    console.log('Browser MCP: cookies-list request', message.requestId, message.domain || message.url)
    handleBrowserCookiesList(message)
    return
  }

  if (message.type === 'browser-cookies-set') {
    console.log('Browser MCP: cookies-set request', message.requestId, message.name)
    handleBrowserCookiesSet(message)
    return
  }

  if (message.type === 'browser-cookies-delete') {
    console.log('Browser MCP: cookies-delete request', message.requestId, message.name)
    handleBrowserCookiesDelete(message)
    return
  }

  if (message.type === 'browser-cookies-audit') {
    console.log('Browser MCP: cookies-audit request', message.requestId, message.tabId)
    handleBrowserCookiesAudit(message)
    return
  }

  // Emulation handlers (CDP Emulation domain)
  if (message.type === 'browser-emulate-device') {
    console.log('Browser MCP: emulate-device request', message.requestId, message.device)
    handleBrowserEmulateDevice(message)
    return
  }

  if (message.type === 'browser-emulate-clear') {
    console.log('Browser MCP: emulate-clear request', message.requestId)
    handleBrowserEmulateClear(message)
    return
  }

  if (message.type === 'browser-emulate-geolocation') {
    console.log('Browser MCP: emulate-geolocation request', message.requestId)
    handleBrowserEmulateGeolocation(message)
    return
  }

  if (message.type === 'browser-emulate-network') {
    console.log('Browser MCP: emulate-network request', message.requestId, message.preset)
    handleBrowserEmulateNetwork(message)
    return
  }

  if (message.type === 'browser-emulate-media') {
    console.log('Browser MCP: emulate-media request', message.requestId)
    handleBrowserEmulateMedia(message)
    return
  }

  if (message.type === 'browser-emulate-vision') {
    console.log('Browser MCP: emulate-vision request', message.requestId, message.type)
    handleBrowserEmulateVision(message)
    return
  }

  // Notification handlers - use registry to prevent tree-shaking
  const notificationHandler = NOTIFICATION_HANDLERS[message.type as string]
  if (notificationHandler) {
    console.log(`Browser MCP: ${message.type} request`, message.requestId, message.title || message.notificationId || '')
    notificationHandler(message)
    return
  }

  // Broadcast other messages as WS_MESSAGE
  const clientMessage: ExtensionMessage = {
    type: 'WS_MESSAGE',
    data: message,
  }
  broadcastToClients(clientMessage)
}
