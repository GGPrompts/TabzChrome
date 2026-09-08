/**
 * Console log capture and storage
 * Stores console logs from content scripts for MCP access
 */

import type { ConsoleLogEntry, ConsoleLogLevel } from '../shared/messaging'
import { ws } from './state'
import { sendToWebSocket } from './websocket'
import { getAgentForGroup, subscribeToTabOwnershipChanges } from './browserMcp/tabGroups'
import {
  canCaptureDocumentSync, subscribeToDocumentLifecycle, subscribeToDocumentProtection
} from './browserMcp/documentProtection'

// Console log storage
const MAX_CONSOLE_LOGS = 1000
export const MAX_CONSOLE_EVENTS_PER_TAB_WINDOW = 500
const CONSOLE_CAPTURE_RATE_WINDOW_MS = 1000
const consoleLogs: ConsoleLogEntry[] = []
const captureRates = new Map<number, { startedAt: number; accepted: number }>()

function acceptConsoleEvent(tabId: number, now = Date.now()): boolean {
  let rate = captureRates.get(tabId)
  if (!rate || now < rate.startedAt || now - rate.startedAt >= CONSOLE_CAPTURE_RATE_WINDOW_MS) {
    rate = { startedAt: now, accepted: 0 }
    captureRates.set(tabId, rate)
  }
  if (rate.accepted >= MAX_CONSOLE_EVENTS_PER_TAB_WINDOW) return false
  rate.accepted += 1
  return true
}

export function removeConsoleLogsForTab(tabId: number): number {
  captureRates.delete(tabId)
  let removed = 0
  for (let index = consoleLogs.length - 1; index >= 0; index--) {
    if (consoleLogs[index].tabId !== tabId) continue
    consoleLogs.splice(index, 1)
    removed += 1
  }
  sendToWebSocket({ type: 'browser-console-logs-prune', tabId })
  return removed
}

subscribeToDocumentProtection((tabId: number) => {
  // This content-free prune precedes any subsequent credential mutation.
  removeConsoleLogsForTab(tabId)
})

let captureLifecycleSetup = false
const ownershipEpochs = new Map<number, number>()

function invalidateConsoleOwnership(tabId: number): void {
  ownershipEpochs.set(tabId, (ownershipEpochs.get(tabId) ?? 0) + 1)
  removeConsoleLogsForTab(tabId)
}

function readableSenderUrl(senderUrl: string | undefined, tabUrl: string | undefined): string | null {
  try {
    const parsed = new URL(senderUrl || tabUrl || '')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

/** Register capture invalidation hooks once during service-worker evaluation. */
export function setupConsoleCaptureLifecycle(): void {
  if (captureLifecycleSetup) return
  captureLifecycleSetup = true
  subscribeToDocumentLifecycle(event => {
    if (event.type === 'before-navigate' || event.type === 'removed') removeConsoleLogsForTab(event.tabId)
  })
  subscribeToTabOwnershipChanges(invalidateConsoleOwnership)
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    // This catches a person moving the tab through Chrome UI; internal group
    // changes are already invalidated synchronously by tabGroups.ts.
    if (changeInfo.groupId !== undefined) invalidateConsoleOwnership(tabId)
  })
}

/**
 * Add a console log entry to storage
 * Forwards to backend via WebSocket for MCP server access
 */
export function addConsoleLog(
  entry: ConsoleLogEntry,
  scope: { groupId: number | null; agent: string | null } = { groupId: null, agent: null }
): ConsoleLogEntry | undefined {
  if (!canCaptureDocumentSync(entry.tabId, entry.documentId)) return undefined
  const stampedEntry = { ...entry, ...scope }
  consoleLogs.push(stampedEntry)
  // Keep buffer size limited (circular buffer)
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift()
  }
  // Forward to backend via WebSocket for MCP server access
  if (ws?.readyState === WebSocket.OPEN) {
    sendToWebSocket({
      type: 'browser-console-log',
      entry: stampedEntry
    })
  }
  return stampedEntry
}

/** Resolve ownership from the sender tab once, when the row enters the buffer. */
export async function captureConsoleLog(
  entry: ConsoleLogEntry,
  senderTab?: chrome.tabs.Tab,
  documentId?: string,
  senderUrl?: string,
): Promise<ConsoleLogEntry | undefined> {
  const tabId = senderTab?.id
  const groupId = senderTab?.groupId
  if (tabId === undefined || !documentId) return undefined
  const url = readableSenderUrl(senderUrl, senderTab?.url)
  if (!url) return undefined
  if (!canCaptureDocumentSync(tabId, documentId)) return undefined
  if (!acceptConsoleEvent(tabId)) return undefined

  const ownershipEpoch = ownershipEpochs.get(tabId) ?? 0
  const scopedGroupId = Number.isInteger(groupId) && groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
    ? groupId as number
    : null
  const agent = scopedGroupId === null ? null : await getAgentForGroup(scopedGroupId)
  // Recheck after the only await. Chrome sender identity and URL override every
  // page-controlled field immediately before the row enters either buffer.
  if ((ownershipEpochs.get(tabId) ?? 0) !== ownershipEpoch || !canCaptureDocumentSync(tabId, documentId)) return undefined
  return addConsoleLog({
    ...entry,
    tabId,
    documentId,
    url,
  }, { groupId: scopedGroupId, agent })
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
  let filtered = consoleLogs.filter(log => canCaptureDocumentSync(log.tabId, log.documentId))

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
  return consoleLogs.filter(log => canCaptureDocumentSync(log.tabId, log.documentId)).length
}
