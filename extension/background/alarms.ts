/**
 * Chrome Alarms API integration
 * Handles WebSocket reconnection and session health checks
 */

import {
  ws, wsReconnectAttempts, incrementWsReconnectAttempts,
  MAX_RECONNECT_ATTEMPTS, ALARM_WS_RECONNECT, ALARM_SESSION_HEALTH,
  ALARM_CLAUDE_PROMPT_POLL
} from './state'
import { connectWebSocket, sendToWebSocket, setScheduleReconnect } from './websocket'
import {
  clearClaudePromptNotification,
  showClaudePromptNotification
} from './browserMcp/notifications'
import {
  detectClaudePromptTransition,
  isProtectedPromptTerminal,
  type ClaudePromptStatus,
  type ClaudePromptTrackerState
} from '../shared/claudePromptNotifications'

const CLAUDE_PROMPT_POLL_INTERVAL_MINUTES = 0.5
const CLAUDE_PROMPT_TRACKERS_STORAGE_KEY = 'claudePromptTrackers'

interface KnownTerminal {
  id: string
  name?: string
  sessionName?: string
  workingDir?: string
  command?: string
  profile?: { command?: string }
  secret?: boolean
}

const claudePromptTrackers = new Map<string, ClaudePromptTrackerState>()
let trackerWriteQueue = Promise.resolve()
let claudePromptPollInFlight = false
let terminalLifecycleGeneration = 0

async function loadClaudePromptTrackers(): Promise<void> {
  const storage = chrome.storage.session
  if (!storage) return
  const result = await storage.get(CLAUDE_PROMPT_TRACKERS_STORAGE_KEY)
  const stored = result[CLAUDE_PROMPT_TRACKERS_STORAGE_KEY]
  if (!stored || typeof stored !== 'object') return
  for (const [terminalId, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const value = raw as ClaudePromptTrackerState
    claudePromptTrackers.set(terminalId, {
      activeKey: typeof value.activeKey === 'string' ? value.activeKey : null,
      lastUpdated: typeof value.lastUpdated === 'string' ? value.lastUpdated : null
    })
  }
}

const claudePromptTrackersReady = loadClaudePromptTrackers().catch(() => undefined)

function persistClaudePromptTrackers(): Promise<void> {
  const storage = chrome.storage.session
  if (!storage) return Promise.resolve()
  const snapshot = Object.fromEntries(claudePromptTrackers)
  trackerWriteQueue = trackerWriteQueue
    .catch(() => undefined)
    .then(() => storage.set({ [CLAUDE_PROMPT_TRACKERS_STORAGE_KEY]: snapshot }))
  return trackerWriteQueue
}

async function getKnownTerminals(): Promise<KnownTerminal[]> {
  const stored = await chrome.storage.local.get('terminalSessions')
  return Array.isArray(stored.terminalSessions)
    ? stored.terminalSessions as KnownTerminal[]
    : []
}

function isClaudeCommand(command: string | undefined): boolean {
  return !!command && /claude/i.test(command)
}

function isEligiblePromptTerminal(terminal: KnownTerminal): boolean {
  if (!terminal.id || !terminal.workingDir || isProtectedPromptTerminal(terminal)) return false
  const profileCommand = terminal.profile?.command || terminal.command
  return isClaudeCommand(profileCommand) || !!terminal.sessionName
}

async function ensureClaudePromptPollAlarm(generation = terminalLifecycleGeneration): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_CLAUDE_PROMPT_POLL)
  if (generation !== terminalLifecycleGeneration) return
  if (existing && !existing.periodInMinutes) return
  if (existing) {
    await chrome.alarms.clear(ALARM_CLAUDE_PROMPT_POLL)
    if (generation !== terminalLifecycleGeneration) return
  }
  chrome.alarms.create(ALARM_CLAUDE_PROMPT_POLL, {
    delayInMinutes: CLAUDE_PROMPT_POLL_INTERVAL_MINUTES
  })
}

async function clearRemovedTerminalPrompts(terminalIds: Set<string>, generation: number): Promise<void> {
  await claudePromptTrackersReady
  if (generation !== terminalLifecycleGeneration) return
  let changed = false
  const clears: Promise<void>[] = []
  for (const [terminalId, tracker] of claudePromptTrackers) {
    if (terminalIds.has(terminalId)) continue
    if (tracker.activeKey) clears.push(clearClaudePromptNotification(terminalId))
    claudePromptTrackers.delete(terminalId)
    changed = true
  }
  if (changed) await persistClaudePromptTrackers()
  await Promise.all(clears)
}

async function pollTerminalClaudePrompt(terminal: KnownTerminal, generation: number): Promise<void> {
  if (!isEligiblePromptTerminal(terminal)) return
  const isCurrent = () => generation === terminalLifecycleGeneration
  const clearUnavailable = async () => {
    await claudePromptTrackersReady
    if (!isCurrent()) return
    const previous = claudePromptTrackers.get(terminal.id)
    if (!previous?.activeKey) return
    claudePromptTrackers.set(terminal.id, { ...previous, activeKey: null })
    await persistClaudePromptTrackers()
    if (isCurrent()) await clearClaudePromptNotification(terminal.id)
  }
  const profileCommand = terminal.profile?.command || terminal.command
  const effectiveSessionName = terminal.sessionName || (terminal.id.startsWith('ctt-') ? terminal.id : null)
  const sessionParam = effectiveSessionName
    ? `&sessionName=${encodeURIComponent(effectiveSessionName)}`
    : ''

  try {
    const response = await fetch(
      `http://localhost:8129/api/claude-status?dir=${encodeURIComponent(terminal.workingDir!)}${sessionParam}`,
      { signal: AbortSignal.timeout(2000) }
    )
    if (!isCurrent()) return
    if (!response.ok) { await clearUnavailable(); return }
    const status = await response.json() as ClaudePromptStatus & {
      success?: boolean
      pane_command?: string
    }
    if (!isCurrent()) return
    if (status.success !== true || status.status === 'unknown' ||
        (!isClaudeCommand(profileCommand) && !isClaudeCommand(status.pane_command))) {
      await clearUnavailable()
      return
    }

    await claudePromptTrackersReady
    if (!isCurrent()) return
    const previous = claudePromptTrackers.get(terminal.id) || { activeKey: null }
    const detected = detectClaudePromptTransition(previous, status)
    if (detected.state !== previous) {
      claudePromptTrackers.set(terminal.id, detected.state)
      await persistClaudePromptTrackers()
    }
    if (!isCurrent()) return

    if (detected.transition?.type === 'notify') {
      await showClaudePromptNotification({
        terminalId: terminal.id,
        terminalName: terminal.name || terminal.sessionName || 'Terminal',
        promptKind: detected.transition.promptKind,
        dedupeKey: detected.transition.dedupeKey
      }, isCurrent)
    } else if (detected.transition?.type === 'clear' && isCurrent()) {
      await clearClaudePromptNotification(terminal.id)
    }
  } catch {
    // The backend may be unavailable while TabzChrome is reconnecting.
    await clearUnavailable().catch(() => undefined)
  }
}

/** Poll once, then schedule the next poll only after all bounded requests settle. */
export async function pollClaudePromptNotifications(): Promise<void> {
  if (claudePromptPollInFlight) return
  claudePromptPollInFlight = true
  const generation = terminalLifecycleGeneration
  let shouldContinue = true
  try {
    const terminals = await getKnownTerminals()
    if (generation !== terminalLifecycleGeneration) return
    const eligible = terminals.filter(isEligiblePromptTerminal)
    shouldContinue = eligible.length > 0
    await clearRemovedTerminalPrompts(new Set(eligible.map(terminal => terminal.id)), generation)
    if (generation !== terminalLifecycleGeneration) return
    await Promise.all(eligible.map(terminal => pollTerminalClaudePrompt(terminal, generation)))
  } catch {
    // A later one-shot retries transient storage or backend failure.
  } finally {
    claudePromptPollInFlight = false
    if (generation === terminalLifecycleGeneration && shouldContinue) {
      await ensureClaudePromptPollAlarm(generation).catch(() => undefined)
    }
  }
}

/** Invalidate older responses and synchronize polling to the current terminal list. */
export async function syncClaudePromptPolling(): Promise<void> {
  const generation = ++terminalLifecycleGeneration
  try {
    const terminals = await getKnownTerminals()
    if (generation !== terminalLifecycleGeneration) return
    const eligible = terminals.filter(isEligiblePromptTerminal)
    await clearRemovedTerminalPrompts(new Set(eligible.map(terminal => terminal.id)), generation)
    if (generation !== terminalLifecycleGeneration) return
    if (eligible.length > 0) {
      await ensureClaudePromptPollAlarm(generation)
    } else {
      await chrome.alarms.clear(ALARM_CLAUDE_PROMPT_POLL)
    }
  } catch {
    if (generation === terminalLifecycleGeneration) await ensureClaudePromptPollAlarm(generation).catch(() => undefined)
  }
}

export function resetClaudePromptPollingForTests(): void {
  claudePromptTrackers.clear()
  claudePromptPollInFlight = false
  terminalLifecycleGeneration = 0
}

/**
 * Schedule WebSocket reconnection with exponential backoff
 */
export function scheduleReconnect(): void {
  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('Max reconnect attempts reached, stopping auto-reconnect')
    return
  }

  // Exponential backoff: 0.5s, 1s, 2s, 4s, 8s, ... up to 30s
  const attempts = incrementWsReconnectAttempts()
  const delaySeconds = Math.min(30, Math.pow(2, attempts - 1) * 0.5)

  console.log(`Scheduling WebSocket reconnect in ${delaySeconds}s (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})`)

  // Use alarms API - survives service worker going idle
  chrome.alarms.create(ALARM_WS_RECONNECT, {
    delayInMinutes: delaySeconds / 60
  })
}

/**
 * Initialize periodic health check alarm
 */
export async function initializeAlarms(): Promise<void> {
  // Clear any existing alarms first
  await chrome.alarms.clear(ALARM_SESSION_HEALTH)

  // Create session health check alarm (every 5 minutes)
  chrome.alarms.create(ALARM_SESSION_HEALTH, {
    delayInMinutes: 1, // First check after 1 minute
    periodInMinutes: 5 // Then every 5 minutes
  })

  console.log('Session health check alarm initialized (every 5 minutes)')
  await syncClaudePromptPolling()
}

/**
 * Setup alarm event listener
 */
export function setupAlarmListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('Alarm fired:', alarm.name)

    if (alarm.name === ALARM_WS_RECONNECT) {
      console.log('WebSocket reconnect alarm triggered')
      connectWebSocket()
    } else if (alarm.name === ALARM_SESSION_HEALTH) {
      console.log('Session health check alarm triggered')
      // Request terminal list to verify sessions are still alive
      if (ws?.readyState === WebSocket.OPEN) {
        console.log('[Badge] Requesting list-terminals (source: health-check-alarm)')
        sendToWebSocket({ type: 'list-terminals' })
      } else {
        console.log('WebSocket not connected during health check, attempting reconnect')
        connectWebSocket()
      }
    } else if (alarm.name === ALARM_CLAUDE_PROMPT_POLL) {
      void pollClaudePromptNotifications()
    }
  })
}

// Wire up the scheduleReconnect function to websocket module
setScheduleReconnect(scheduleReconnect)
