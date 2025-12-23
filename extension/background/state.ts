/**
 * Shared state for background service worker
 * Centralized state management to avoid circular dependencies
 */

import type { ExtensionMessage } from '../shared/messaging'

// WebSocket connection to backend
export let ws: WebSocket | null = null
export let wsReconnectAttempts = 0
export const MAX_RECONNECT_ATTEMPTS = 10
export const WS_URL = 'ws://localhost:8129' // Extension loaded from WSL path, use localhost

// Alarm names
export const ALARM_WS_RECONNECT = 'ws-reconnect'
export const ALARM_SESSION_HEALTH = 'session-health'

// Track connected clients (popup, sidepanel, devtools)
export const connectedClients = new Set<chrome.runtime.Port>()

// Pending commands (for race condition when sidebar opens fresh)
export let pendingQueueCommand: string | null = null // Goes to chat bar
export let pendingPasteCommand: string | null = null // Goes directly to terminal

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
