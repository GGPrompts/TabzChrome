/**
 * Background Service Worker Entry Point
 * TabzChrome Chrome Extension
 *
 * This file initializes all background worker modules and coordinates startup.
 */

import { ws, popoutWindows, removeTerminalView } from './state'
import { connectWebSocket, sendDefaultProfileSettings } from './websocket'
import { initializeAlarms, setupAlarmListener, syncClaudePromptPolling } from './alarms'
import { setupOmnibox } from './omnibox'
import { setupMessageHandlers } from './messageHandlers'
import { setupContextMenus, setupContextMenuListener } from './contextMenus'
import { setupActionHandler, setupKeyboardHandler } from './keyboard'
import { handlePopoutWindowClosed } from './browserMcp/windows'
import { registerConsoleMainWorldScript } from './consoleMainWorldScript'
import { setupConsoleCaptureLifecycle } from './consoleCapture'
import { setupDocumentLifecycle } from './browserMcp/documentProtection'
import { setupClaudePromptNotificationClickHandler } from './browserMcp/notifications'

// Initialize background service worker
console.log('Terminal Tabs background service worker starting...')

// Setup event listeners
void registerConsoleMainWorldScript()
setupDocumentLifecycle()
setupConsoleCaptureLifecycle()
setupAlarmListener()
setupOmnibox()
setupMessageHandlers()
setupClaudePromptNotificationClickHandler()
setupContextMenuListener()
setupActionHandler()
setupKeyboardHandler()
void syncClaudePromptPolling()

// Setup menus on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated')
  void registerConsoleMainWorldScript()
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

// Listen for window close to clean up popout terminals
// This is more reliable than beforeunload + sendBeacon in the popout window
chrome.windows.onRemoved.addListener((windowId) => {
  removeTerminalView(windowId)
  if (popoutWindows.has(windowId)) {
    handlePopoutWindowClosed(windowId)
  }
})

// Listen for storage changes to sync default profile settings to backend
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  // Resync when default profile or category settings change
  if (changes.defaultProfile || changes.categorySettings || changes.profiles) {
    console.log('[Background] Profile settings changed, resyncing to backend')
    sendDefaultProfileSettings()
  }
  if (changes.terminalSessions) void syncClaudePromptPolling()
})

// Initialize WebSocket connection
connectWebSocket()

// Keep service worker alive with periodic ping
setInterval(() => {
  console.log('Background service worker alive')
  if (ws?.readyState !== WebSocket.OPEN) {
    connectWebSocket()
  }
}, 25000) // Chrome service workers can idle after 30s

console.log('Terminal Tabs background service worker initialized')
