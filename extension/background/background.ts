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

// Initialize background service worker
console.log('Terminal Tabs background service worker starting...')

// WebSocket connection management
function connectWebSocket() {
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

  console.log('Connecting to backend WebSocket:', WS_URL)
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('✅ Background WebSocket connected')
    wsReconnectAttempts = 0 // Reset reconnect counter on successful connection
    chrome.alarms.clear(ALARM_WS_RECONNECT) // Clear any pending reconnect alarm
    updateBadge()
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

    // Schedule reconnection using alarms (survives service worker idle)
    scheduleReconnect()
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

  // Profile suggestions
  if (lowerText.startsWith('profile:') || lowerText === 'p' || lowerText === 'pr') {
    try {
      const result = await chrome.storage.local.get(['profiles'])
      const profiles = (result.profiles || []) as Array<{ id: string; name: string; workingDir?: string }>
      for (const profile of profiles) {
        suggestions.push({
          content: `profile:${profile.id}`,
          description: `<match>Profile:</match> ${profile.name} <dim>(${profile.workingDir || '~'})</dim>`
        })
      }
    } catch (err) {
      console.error('Failed to get profiles for omnibox:', err)
    }
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

  // Open sidebar first (for terminal-related commands)
  if (currentWindow?.id) {
    try {
      await chrome.sidePanel.open({ windowId: currentWindow.id })
    } catch (err) {
      console.error('Failed to open sidebar from omnibox:', err)
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
        profile: message.profile, // Log profile to debug theme/font issues
      })
      // Badge will be updated when backend sends terminal-spawned message
      break

    case 'QUEUE_COMMAND':
      // Queue command to chat input (from content script "Run in Terminal" button)
      // Opens sidebar and populates chat input, letting user choose which terminal
      console.log('[Background] QUEUE_COMMAND received:', message.command)
      try {
        const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
        const targetWindow = windows.find(w => w.focused) || windows[0]
        if (targetWindow?.id) {
          await chrome.sidePanel.open({ windowId: targetWindow.id })
        }
      } catch (err) {
        console.error('[Background] Failed to open side panel:', err)
      }
      // Broadcast to sidepanel after brief delay for sidebar to open
      setTimeout(() => {
        broadcastToClients({
          type: 'QUEUE_COMMAND',
          command: message.command,
        })
      }, 300)
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

    case 'TARGETED_PANE_SEND':
      // Send directly to a specific tmux pane (for split layouts with Claude + TUI tools)
      // This bypasses the PTY and goes straight to the pane, preventing TUI corruption
      console.log('🎯 TARGETED_PANE_SEND:', { tmuxPane: message.tmuxPane, textLength: message.text?.length, sendEnter: message.sendEnter })
      sendToWebSocket({
        type: 'targeted-pane-send',
        tmuxPane: message.tmuxPane,
        text: message.text,
        sendEnter: message.sendEnter,
      })
      break

    case 'RECONNECT':
      // Register this connection as owner of an API-spawned terminal
      console.log('🔄 RECONNECT:', { terminalId: message.terminalId })
      sendToWebSocket({
        type: 'reconnect',
        terminalId: message.terminalId,
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
      // Execute script in browser tab
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
              // eslint-disable-next-line no-eval
              return { success: true, result: eval(code) }
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
      } catch (err) {
        console.error('[Background] Failed to open side panel:', err)
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
    const selectedText = info.selectionText
    console.log('📋 Pasting to terminal:', selectedText)

    try {
      const windowId = await getValidWindowId()
      if (windowId) {
        // Open sidebar if not already open
        await chrome.sidePanel.open({ windowId })

        // Wait a bit for sidebar to be ready
        setTimeout(() => {
          // Broadcast paste command to sidepanel
          broadcastToClients({
            type: 'PASTE_COMMAND',
            command: selectedText,
          })
        }, 500)  // Increased delay for reliability
      }
    } catch (err) {
      console.error('[Background] Failed to open sidebar for paste:', err)
    }
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
