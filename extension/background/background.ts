import type { ExtensionMessage } from '../shared/messaging'
import { getActiveSessionCount, addActiveSession, removeActiveSession, addRecentSession, getLocal } from '../shared/storage'

// WebSocket connection to backend
let ws: WebSocket | null = null
let reconnectTimeout: NodeJS.Timeout | null = null
const RECONNECT_DELAY = 5000
const WS_URL = 'ws://localhost:8129'

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
        broadcastToClients({
          type: 'WS_MESSAGE',
          data: message,
        })
      } else {
        // Broadcast other messages as WS_MESSAGE
        const clientMessage: ExtensionMessage = {
          type: 'WS_MESSAGE',
          data: message,
        }
        if (message.type === 'terminal-spawned') {
          console.log('📤 Broadcasting to clients:', JSON.stringify(clientMessage).slice(0, 200))
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
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  } else {
    console.warn('WebSocket not connected, cannot send:', data)
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

// Update extension badge with active session count
async function updateBadge() {
  const count = await getActiveSessionCount()
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' })
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

      // Check global tmux setting
      const { settings } = await getLocal(['settings'])
      const globalUseTmux = settings?.globalUseTmux || false

      sendToWebSocket({
        type: 'spawn',
        config: {
          terminalType: message.spawnOption || 'bash',
          command: message.command || '',
          workingDir: message.cwd, // Fixed: Backend expects workingDir, not workingDirectory
          useTmux: globalUseTmux || message.useTmux || false, // Apply global override
          name: message.name || message.spawnOption || 'Terminal', // Friendly name
        },
        requestId,
      })

      console.log('📤 Spawning terminal:', {
        terminalType: message.spawnOption,
        name: message.name,
        command: message.command,
        cwd: message.cwd,
        useTmux: globalUseTmux || message.useTmux || false,
        globalUseTmux,
        requestId,
      })

      // Track as active session
      if (message.spawnOption) {
        addActiveSession(`${message.spawnOption}-${Date.now()}`)
        updateBadge()
      }
      break

    case 'CLOSE_SESSION':
      sendToWebSocket({
        type: 'close-terminal',
        sessionName: message.sessionName,
      })
      removeActiveSession(message.sessionName)
      updateBadge()
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

// Context menu registration
chrome.runtime.onInstalled.addListener(() => {
  console.log('Installing context menus...')

  // Simple context menu: just open side panel
  chrome.contextMenus.create({
    id: 'open-sidepanel',
    title: 'Open Terminal Sidebar',
    contexts: ['all'],
  })
})

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('Context menu clicked:', info.menuItemId)

  if (info.menuItemId === 'open-sidepanel' && tab?.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId })
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

  if (command === 'toggle-sidebar') {
    try {
      // Get the current window
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
      const currentWindow = windows.find(w => w.focused) || windows[0]

      if (currentWindow?.id) {
        console.log('[Background] Toggling sidebar in window:', currentWindow.id)
        // Chrome's sidePanel API doesn't have a toggle, so we just open it
        // If it's already open, clicking Alt+S again will focus it
        await chrome.sidePanel.open({ windowId: currentWindow.id })
      } else {
        console.error('[Background] No normal browser window found')
      }
    } catch (err) {
      console.error('[Background] Failed to toggle sidebar:', err)
    }
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
