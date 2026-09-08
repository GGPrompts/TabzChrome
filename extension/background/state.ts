/**
 * Shared state for background service worker
 * Centralized state management to avoid circular dependencies
 */

import type { ExtensionMessage } from '../shared/messaging'
import type { TerminalViewSnapshot } from '../shared/claudePromptNotifications'

// WebSocket connection to backend
export let ws: WebSocket | null = null
export let wsReconnectAttempts = 0
export let hadSuccessfulConnection = false  // Track if we ever connected (for reconnect notifications)
export let notifiedOffline = false  // Track if we've already notified about offline state (prevent spam)
export const MAX_RECONNECT_ATTEMPTS = 10
export const WS_URL = 'ws://localhost:8129' // Extension loaded from WSL path, use localhost

// Alarm names
export const ALARM_WS_RECONNECT = 'ws-reconnect'
export const ALARM_SESSION_HEALTH = 'session-health'
export const ALARM_CLAUDE_PROMPT_POLL = 'claude-prompt-poll'

// Track connected clients (popup, sidepanel, devtools)
export const connectedClients = new Set<chrome.runtime.Port>()

// Pending commands (for race condition when sidebar opens fresh)
export let pendingQueueCommand: string | null = null // Goes to chat bar
export let pendingPasteCommand: string | null = null // Goes directly to terminal

// Track popout windows: windowId -> terminalId
// Used to detect when popout windows close and trigger cleanup
export const popoutWindows = new Map<number, string>()

// The background owns prompt side effects, while extension surfaces only
// report which terminal is currently visible in each Chrome window.
export const terminalViews = new Map<number, TerminalViewSnapshot>()

export const handledClaudePromptKeys = new Set<string>()
const HANDLED_PROMPT_KEYS_STORAGE_KEY = 'handledClaudePromptKeys'
const MAX_HANDLED_PROMPT_KEYS = 200
let handledPromptWriteQueue = Promise.resolve()

async function loadHandledClaudePromptKeys(): Promise<void> {
  const storage = chrome.storage.session
  if (!storage) return
  const result = await storage.get(HANDLED_PROMPT_KEYS_STORAGE_KEY)
  const stored = result[HANDLED_PROMPT_KEYS_STORAGE_KEY]
  if (!Array.isArray(stored)) return
  for (const key of stored) {
    if (typeof key === 'string') handledClaudePromptKeys.add(key)
  }
  while (handledClaudePromptKeys.size > MAX_HANDLED_PROMPT_KEYS) {
    const oldest = handledClaudePromptKeys.values().next().value
    if (oldest === undefined) break
    handledClaudePromptKeys.delete(oldest)
  }
}

export const handledClaudePromptKeysReady = loadHandledClaudePromptKeys().catch(() => undefined)

export async function claimClaudePromptKey(key: string): Promise<boolean> {
  await handledClaudePromptKeysReady
  if (handledClaudePromptKeys.has(key)) return false
  handledClaudePromptKeys.add(key)
  while (handledClaudePromptKeys.size > MAX_HANDLED_PROMPT_KEYS) {
    const oldest = handledClaudePromptKeys.values().next().value
    if (oldest === undefined) break
    handledClaudePromptKeys.delete(oldest)
  }
  const storage = chrome.storage.session
  if (storage) {
    const keys = [...handledClaudePromptKeys]
    handledPromptWriteQueue = handledPromptWriteQueue
      .catch(() => undefined)
      .then(() => storage.set({ [HANDLED_PROMPT_KEYS_STORAGE_KEY]: keys }))
    await handledPromptWriteQueue
  }
  return true
}

export function updateTerminalView(view: TerminalViewSnapshot): void {
  terminalViews.set(view.windowId, view)
}

export function removeTerminalView(windowId: number): void {
  terminalViews.delete(windowId)
}

export function resetHandledClaudePromptKeysForTests(): void {
  handledClaudePromptKeys.clear()
}

// State setters (needed because we can't export let and modify from other modules)
export function setWs(newWs: WebSocket | null): void {
  ws = newWs
}

export function setWsReconnectAttempts(attempts: number): void {
  wsReconnectAttempts = attempts
}

export function incrementWsReconnectAttempts(): number {
  wsReconnectAttempts++
  return wsReconnectAttempts
}

export function setHadSuccessfulConnection(value: boolean): void {
  hadSuccessfulConnection = value
}

export function setNotifiedOffline(value: boolean): void {
  notifiedOffline = value
}

export function setPendingQueueCommand(command: string | null): void {
  pendingQueueCommand = command
}

export function setPendingPasteCommand(command: string | null): void {
  pendingPasteCommand = command
}

// Broadcast message to all connected extension pages
export function broadcastToClients(message: ExtensionMessage): void {
  connectedClients.forEach(port => {
    try {
      port.postMessage(message)
    } catch (err) {
      console.error('Failed to send message to client:', err)
      connectedClients.delete(port)
    }
  })
}
