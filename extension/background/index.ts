/**
 * Background Service Worker Entry Point
 * TabzChrome Chrome Extension
 *
 * This file initializes all background worker modules and coordinates startup.
 */

import { ws } from './state'
import { connectWebSocket } from './websocket'
import { initializeAlarms, setupAlarmListener } from './alarms'
import { setupOmnibox } from './omnibox'
import { setupMessageHandlers } from './messageHandlers'
import { setupContextMenus, setupContextMenuListener } from './contextMenus'
import { setupActionHandler, setupKeyboardHandler } from './keyboard'

// Initialize background service worker
console.log('Terminal Tabs background service worker starting...')

// Setup event listeners
setupAlarmListener()
setupOmnibox()
setupMessageHandlers()
setupContextMenuListener()
setupActionHandler()
setupKeyboardHandler()

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
