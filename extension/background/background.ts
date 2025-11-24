import type { ExtensionMessage } from '../shared/messaging'
import { getLocal } from '../shared/storage'

// WebSocket connection to backend
let ws: WebSocket | null = null
let reconnectTimeout: NodeJS.Timeout | null = null
const RECONNECT_DELAY = 5000
const WS_URL = 'ws://localhost:8129'  // Extension loaded from WSL path, use localhost

// Track connected clients (popup, sidepanel, devtools)
const connectedClients = new Set<chrome.runtime.Port>()

// Initialize background service worker
console.log('Terminal Tabs background service worker starting...')

// WebSocket connection management
function connectWebSocket() {
  if (ws?.readyState === WebSocket.OPEN) {
    console.log('WebSocket already connected')
    return
  }

  console.log('Connecting to backend WebSocket:', WS_URL)
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('✅ Background WebSocket connected')
    updateBadge()
    broadcastToClients({ type: 'WS_CONNECTED' })
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      console.log('📨 WS message received:', message.type, message.type === 'terminal-spawned' ? JSON.stringify(message).slice(0, 200) : '')

      // Handle terminal output specially - broadcast directly as TERMINAL_OUTPUT
      if (message.type === 'output' || message.type === 'terminal-output') {
        console.log('📟 Terminal output received, broadcasting to clients:', message.terminalId?.slice(-8), message.data?.length, 'bytes')
        broadcastToClients({
          type: 'TERMINAL_OUTPUT',
          terminalId: message.terminalId,
          data: message.data,
        })
      } else if (message.type === 'terminals') {
        // Terminal list received on connection - restore sessions
        console.log('📋 Terminal list received:', message.data?.length, 'terminals')
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
        console.log('📤 Terminal spawned, broadcasting to clients')

        const clientMessage: ExtensionMessage = {
          type: 'WS_MESSAGE',
          data: message,
        }
        console.log('📤 Broadcasting to clients:', JSON.stringify(clientMessage).slice(0, 200))
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
        console.log('📤 Terminal closed, broadcasting to clients')

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
    console.log('WebSocket closed:', {
      code: event.code,
      reason: event.reason || '(no reason provided)',
      wasClean: event.wasClean,
      url: WS_URL,
    })

    ws = null
    broadcastToClients({ type: 'WS_DISCONNECTED' })

    // Attempt reconnection
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
    reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY)
  }
}

// Send message to WebSocket
function sendToWebSocket(data: any) {
  console.log('[Background] sendToWebSocket called, ws state:', ws?.readyState, 'data:', data)
  if (ws?.readyState === WebSocket.OPEN) {
    console.log('[Background] ✅ Sending to WebSocket:', JSON.stringify(data))
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
async function updateBadge() {
  // Request terminal list from backend
  if (ws?.readyState === WebSocket.OPEN) {
    sendToWebSocket({ type: 'list-terminals' })
    // Badge will be updated when we receive the 'terminals' response
  } else {
    // If not connected, clear the badge
    chrome.action.setBadgeText({ text: '' })
  }
}

// Message handler from extension pages
chrome.runtime.onMessage.addListener(async (message: ExtensionMessage, sender, sendResponse) => {
  console.log('📬 Message received from extension:', message.type)

  switch (message.type) {
    case 'OPEN_SESSION':
      // Open side panel with specific session
      // Get normal browser windows (not popups/devtools) to avoid "Could not create options page" error
      try {
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
        const targetWindow = windows.find(w => w.focused) || windows[0]

        if (targetWindow?.id) {
          console.log('[Background] Opening side panel in window:', targetWindow.id)
          await chrome.sidePanel.open({ windowId: targetWindow.id })
        } else {
          console.error('[Background] No normal browser window found')
        }
      } catch (err) {
        console.error('[Background] Failed to open side panel:', err)
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

      console.log('[Background] SPAWN_TERMINAL received:', {
        spawnOption: message.spawnOption,
        name: message.name,
        command: message.command,
        workingDir: message.workingDir
      })

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
        },
        requestId,
      })

      console.log('📤 Sending to backend:', {
        terminalType: message.spawnOption || 'bash',
        name: message.name,
        command: message.command || '(no command)',
        workingDir: message.workingDir || message.profile?.workingDir,
        useTmux: useTmux,
        isChrome: true,
        requestId,
      })
      // Badge will be updated when backend sends terminal-spawned message
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
      // Forward terminal input to backend
      console.log('📥 TERMINAL_INPUT:', { terminalId: message.terminalId, dataLength: message.data?.length })
      sendToWebSocket({
        type: 'command',
        terminalId: message.terminalId,
        command: message.data,
      })
      break

    case 'TERMINAL_RESIZE':
      // Forward terminal resize to backend
      console.log('📏 TERMINAL_RESIZE:', { terminalId: message.terminalId, cols: message.cols, rows: message.rows })
      sendToWebSocket({
        type: 'resize',
        terminalId: message.terminalId,
        cols: message.cols,
        rows: message.rows,
      })
      break

    case 'UPDATE_BADGE':
      updateBadge()
      break

    case 'LIST_TERMINALS':
      // Request terminal list from backend
      console.log('📋 Requesting terminal list from backend')
      sendToWebSocket({ type: 'list-terminals' })
      break

    case 'REFRESH_TERMINALS':
      // Broadcast refresh message to all terminals
      console.log('🔄 Broadcasting REFRESH_TERMINALS to all clients')
      broadcastToClients({ type: 'REFRESH_TERMINALS' })
      break

    default:
      // Forward other messages to WebSocket
      sendToWebSocket(message)
  }

  return true // Keep message channel open for async response
})

// Port connections from extension pages (persistent communication)
chrome.runtime.onConnect.addListener((port) => {
  console.log('🔌 Client connected:', port.name)
  connectedClients.add(port)

  // ✅ IMMEDIATELY send current WebSocket state to newly connected client
  // This solves the race condition where sidepanel opens after WebSocket is already connected
  const currentState = ws?.readyState === WebSocket.OPEN
  port.postMessage({
    type: 'INITIAL_STATE',
    wsConnected: currentState,
  })

  port.onDisconnect.addListener(() => {
    console.log('🔌 Client disconnected:', port.name)
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

    // Simple context menu: toggle side panel
    chrome.contextMenus.create({
      id: 'toggle-sidepanel',
      title: 'Toggle Terminal Sidebar',
      contexts: ['all'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating toggle-sidepanel menu:', chrome.runtime.lastError)
      } else {
        console.log('✅ Toggle menu created')
      }
    })

    // Context menu for selected text - paste into terminal
    chrome.contextMenus.create({
      id: 'paste-to-terminal',
      title: 'Paste "%s" to Terminal',
      contexts: ['selection'],  // Only shows when text is selected
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating paste-to-terminal menu:', chrome.runtime.lastError)
      } else {
        console.log('✅ Paste menu created')
      }
    })

    console.log('✅ Context menus setup complete')
  })
}

// Setup menus on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated')
  setupContextMenus()
})

// Setup on service worker startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Service worker started')
  setupContextMenus()
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

  if (menuId === 'toggle-sidepanel' && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId })
    return
  }

  if (menuId === 'paste-to-terminal' && info.selectionText && tab?.windowId) {
    const selectedText = info.selectionText
    console.log('📋 Pasting to terminal:', selectedText)

    // Open sidebar if not already open
    await chrome.sidePanel.open({ windowId: tab.windowId })

    // Wait a bit for sidebar to be ready
    setTimeout(() => {
      // Broadcast paste command to sidepanel
      broadcastToClients({
        type: 'PASTE_COMMAND',
        command: selectedText,
      })
    }, 500)  // Increased delay for reliability
  }
})

// Extension icon click handler - open sidebar
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ Extension icon clicked')

  if (tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId })
      console.log('[Background] Opened sidebar via icon click')
    } catch (err) {
      console.error('[Background] Failed to open sidebar:', err)
    }
  }
})

// Keyboard command handler
chrome.commands.onCommand.addListener(async (command) => {
  console.log('⌨️ Keyboard command:', command)

  // Get current window for sidebar operations
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
  const currentWindow = windows.find(w => w.focused) || windows[0]

  // Handle toggle-sidebar
  if (command === 'toggle-sidebar') {
    try {
      if (currentWindow?.id) {
        console.log('[Background] Toggling sidebar in window:', currentWindow.id)
        await chrome.sidePanel.open({ windowId: currentWindow.id })
      } else {
        console.error('[Background] No normal browser window found')
      }
    } catch (err) {
      console.error('[Background] Failed to toggle sidebar:', err)
      if (err instanceof Error && err.message.includes('user gesture')) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Terminal Sidebar',
          message: 'Please click the extension icon to open the sidebar. Chrome doesn\'t allow keyboard shortcuts to open side panels.',
          priority: 1
        })
      }
    }
    return
  }

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

  // Handle paste-selection - get selected text from active tab
  if (command === 'paste-selection') {
    console.log('[Background] Paste selection shortcut triggered')
    try {
      // Get the active tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (activeTab?.id) {
        // Execute script to get selected text
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.getSelection()?.toString() || ''
        })

        const selectedText = results[0]?.result
        if (selectedText) {
          console.log('[Background] 📋 Pasting selection to terminal:', selectedText.substring(0, 50) + '...')

          // Open sidebar if not already open
          if (currentWindow?.id) {
            try {
              await chrome.sidePanel.open({ windowId: currentWindow.id })
            } catch (e) {
              // Sidebar might already be open, that's fine
            }
          }

          // Send to sidepanel
          broadcastToClients({
            type: 'PASTE_COMMAND',
            command: selectedText,
          })
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
