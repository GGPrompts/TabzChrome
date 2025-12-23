/**
 * Console log capture and storage
 * Stores console logs from content scripts for MCP access
 */

import type { ConsoleLogEntry, ConsoleLogLevel } from '../shared/messaging'
import { ws } from './state'
import { sendToWebSocket } from './websocket'

// Console log storage
const MAX_CONSOLE_LOGS = 1000
const consoleLogs: ConsoleLogEntry[] = []

/**
 * Add a console log entry to storage
 * Forwards to backend via WebSocket for MCP server access
 */
export function addConsoleLog(entry: ConsoleLogEntry): void {
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

/**
 * Get console logs with optional filtering
 */
export function getConsoleLogs(options: {
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

/**
 * Get total console log count
 */
export function getConsoleLogCount(): number {
  return consoleLogs.length
}
