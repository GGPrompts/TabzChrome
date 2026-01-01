/**
 * Chrome Extension Message Handlers
 * Handles messages from extension pages (sidepanel, popup, etc.)
 */

import type { ExtensionMessage } from '../shared/messaging'
import {
  ws, connectedClients, broadcastToClients,
  pendingQueueCommand, pendingPasteCommand,
  setPendingQueueCommand, setPendingPasteCommand,
  popoutWindows
} from './state'
import { sendToWebSocket, updateBadge } from './websocket'
import { addConsoleLog, getConsoleLogs, getConsoleLogCount } from './consoleCapture'
import { tryOpenSidebar } from './utils'

/**
 * Setup Chrome message listeners
 */
export function setupMessageHandlers(): void {
  // Message handler from extension pages
  chrome.runtime.onMessage.addListener(async (message: ExtensionMessage, sender, sendResponse) => {
    switch (message.type) {
      case 'OPEN_SESSION':
        // Open side panel with specific session
        await tryOpenSidebar()
        sendToWebSocket({
          type: 'attach-terminal',
          sessionName: message.sessionName,
        })
        break

      case 'SPAWN_TERMINAL':
        // Transform extension message to backend spawn format
        const requestId = `spawn-${Date.now()}`

        // Chrome extension terminals ALWAYS use tmux for persistence
        const useTmux = true

        sendToWebSocket({
          type: 'spawn',
          config: {
            terminalType: message.spawnOption || 'bash',
            command: message.command || '',
            workingDir: message.workingDir || message.cwd || message.profile?.workingDir,
            useTmux: useTmux,
            name: message.name || message.spawnOption || 'Terminal',
            profile: message.profile,
            isChrome: true,
            isDark: message.isDark,
            pasteOnly: message.pasteOnly || false,
          },
          requestId,
        })
        break

      case 'QUEUE_COMMAND':
        // Queue command to chat input (from content script "Run in Terminal" button)
        await tryOpenSidebar()
        // Broadcast to sidepanel after brief delay for sidebar to open
        setTimeout(() => {
          broadcastToClients({
            type: 'QUEUE_COMMAND',
            command: message.command,
          })
        }, 300)
        break

      case 'PASTE_COMMAND':
        // Paste command directly to active terminal
        await tryOpenSidebar()
        setTimeout(() => {
          broadcastToClients({
            type: 'PASTE_COMMAND',
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
        await tryOpenSidebar()
        setTimeout(() => {
          broadcastToClients({
            type: 'OPEN_SETTINGS_EDIT_PROFILE',
            profileId: message.profileId,
          })
        }, 300)
        break

      case 'SWITCH_TO_TERMINAL':
        // Open sidebar and switch to a specific terminal tab (from dashboard)
        await tryOpenSidebar()
        setTimeout(() => {
          broadcastToClients({
            type: 'SWITCH_TO_TERMINAL',
            terminalId: (message as any).terminalId,
          })
        }, 300)
        break

      case 'FOCUS_POPOUT_TERMINAL':
        // Focus a popped out terminal window (from dashboard click)
        {
          const terminalId = (message as any).terminalId
          // Find the window ID for this terminal from popoutWindows map
          let windowId: number | null = null
          for (const [wid, tid] of popoutWindows.entries()) {
            if (tid === terminalId) {
              windowId = wid
              break
            }
          }
          if (windowId) {
            try {
              await chrome.windows.update(windowId, { focused: true })
            } catch (err) {
              console.error('Failed to focus popout window:', err)
            }
          } else {
            console.warn('No popout window found for terminal:', terminalId)
          }
        }
        break

      case 'FOCUS_3D_TERMINAL':
        // Focus a 3D Focus tab (from dashboard click)
        {
          const terminalId = (message as any).terminalId
          // Find the Chrome tab with the 3D Focus page for this terminal
          // URL pattern: chrome-extension://[id]/3d/3d-focus.html?...&id=[terminalId]
          const tabs = await chrome.tabs.query({})
          const focusTab = tabs.find(tab =>
            tab.url?.includes('3d/3d-focus.html') && tab.url?.includes(`id=${terminalId}`)
          )
          if (focusTab?.id && focusTab.windowId) {
            try {
              // Focus the window first, then activate the tab
              await chrome.windows.update(focusTab.windowId, { focused: true })
              await chrome.tabs.update(focusTab.id, { active: true })
            } catch (err) {
              console.error('Failed to focus 3D tab:', err)
            }
          } else {
            console.warn('No 3D Focus tab found for terminal:', terminalId)
          }
        }
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

      case 'TERMINAL_RETURNED_FROM_POPOUT':
        // Popout window closing via "Return to sidebar" - broadcast to clear poppedOut state
        broadcastToClients({
          type: 'TERMINAL_RETURNED_FROM_POPOUT',
          terminalId: message.terminalId,
        })
        break

      case 'UNTRACK_POPOUT_WINDOW':
        // Stop tracking a popout window (for "Return to Sidebar" - don't detach on close)
        popoutWindows.delete((message as any).windowId)
        break

      case 'GET_POPOUT_WINDOWS':
        // Return currently tracked popout windows so clients can clean up stale flags
        const popouts = Array.from(popoutWindows.entries()).map(([windowId, terminalId]) => ({
          windowId,
          terminalId,
        }))
        sendResponse({
          type: 'POPOUT_WINDOWS_RESPONSE',
          popouts,
        })
        return true // Keep channel open for sync response

      case 'REGISTER_POPOUT_WINDOW':
        // Re-register a popout window (handles service worker restart)
        // Popout windows send this on connect to ensure they're tracked
        popoutWindows.set((message as any).windowId, (message as any).terminalId)
        console.log(`[Popout] Registered popout window ${(message as any).windowId} -> ${(message as any).terminalId}`)
        break

      case 'TERMINAL_POPPED_OUT':
        // Dashboard or other extension pages notify that a terminal is in a popout window
        // Track the window and broadcast to all clients (especially sidebar)
        if ((message as any).windowId && (message as any).terminalId) {
          popoutWindows.set((message as any).windowId, (message as any).terminalId)
        }
        broadcastToClients({
          type: 'TERMINAL_POPPED_OUT',
          terminalId: (message as any).terminalId,
          windowId: (message as any).windowId,
        })
        console.log(`[Popout] Terminal ${(message as any).terminalId} popped out to window ${(message as any).windowId}`)
        break

      case 'CLOSE_SESSION':
        sendToWebSocket({
          type: 'close-terminal',
          sessionName: message.sessionName,
        })
        break

      case 'CLOSE_TERMINAL':
        // Close specific terminal by ID (force close - kills PTY/tmux session)
        sendToWebSocket({
          type: 'close',
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

      // Browser MCP - Console Log Handling
      case 'CONSOLE_LOG':
        // Store console log from content script
        const logEntry = {
          ...message.entry,
          tabId: sender.tab?.id || -1
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
          total: getConsoleLogCount()
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
                if (code === 'document.links' || code.includes('document.links')) {
                  const links = [...document.links].map(a => ({
                    text: a.textContent?.trim() || '',
                    href: a.href
                  }))
                  return { success: true, result: links }
                }

                if (code === 'document.title') {
                  return { success: true, result: document.title }
                }

                if (code.includes('outerHTML') || code.includes('innerHTML')) {
                  return { success: true, result: document.documentElement.outerHTML.slice(0, 10000) }
                }

                if (code.includes('document.images')) {
                  const images = [...document.images].map(img => ({
                    src: img.src,
                    alt: img.alt
                  }))
                  return { success: true, result: images }
                }

                if (code.includes('textContent') || code.includes('innerText')) {
                  return { success: true, result: document.body.innerText.slice(0, 10000) }
                }

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

                const selectorAllMatch = code.match(/querySelectorAll\(['"]([^'"]+)['"]\)/)
                if (selectorAllMatch) {
                  const els = document.querySelectorAll(selectorAllMatch[1])
                  const results = [...els].slice(0, 100).map(el => ({
                    tagName: el.tagName,
                    text: el.textContent?.trim()
                  }))
                  return { success: true, result: results }
                }

                if (code.includes('localStorage')) {
                  const storage: Record<string, string> = {}
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i)
                    if (key) storage[key] = localStorage.getItem(key) || ''
                  }
                  return { success: true, result: storage }
                }

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
  chrome.runtime.onMessageExternal.addListener(async (message, _sender, sendResponse) => {
    console.log('External message received:', message.type, 'from:', _sender.url)

    switch (message.type) {
      case 'PING':
        // Health check - respond that extension is available
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version })
        break

      case 'SPAWN_TERMINAL':
        // Open sidebar first
        await tryOpenSidebar()

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
            pasteOnly: message.pasteOnly || false,
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

    // Immediately send current WebSocket state to newly connected client
    const currentState = ws?.readyState === WebSocket.OPEN
    port.postMessage({
      type: 'INITIAL_STATE',
      wsConnected: currentState,
    })

    // Send any pending commands (from context menu before sidebar was ready)
    if (pendingPasteCommand) {
      setTimeout(() => {
        port.postMessage({
          type: 'PASTE_COMMAND',
          command: pendingPasteCommand,
        })
        setPendingPasteCommand(null)
      }, 200)
    }
    if (pendingQueueCommand) {
      setTimeout(() => {
        port.postMessage({
          type: 'QUEUE_COMMAND',
          command: pendingQueueCommand,
        })
        setPendingQueueCommand(null)
      }, 200)
    }

    port.onDisconnect.addListener(() => {
      connectedClients.delete(port)
    })

    port.onMessage.addListener((message: ExtensionMessage) => {
      // Handle messages from connected ports
      chrome.runtime.sendMessage(message)
    })
  })
}
