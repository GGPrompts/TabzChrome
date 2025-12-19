import { sendMessage, type SpawnTerminalMessage } from '../../shared/messaging'
import type { Profile } from '../../components/SettingsModal'

// Backend API base URL - extension pages can access localhost directly
const API_BASE = 'http://localhost:8129'

/**
 * Spawn a terminal using Chrome messaging (no auth required from extension pages)
 */
export async function spawnTerminal(options: {
  name?: string
  command?: string
  workingDir?: string
  profile?: Profile
}) {
  const message: SpawnTerminalMessage = {
    type: 'SPAWN_TERMINAL',
    name: options.name || 'Terminal',
    command: options.command,
    workingDir: options.workingDir,
    profile: options.profile,
    useTmux: true,
  }

  return sendMessage(message)
}

/**
 * Fetch profiles from Chrome storage (extension has direct access)
 */
export async function getProfiles(): Promise<Profile[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['profiles'], (result: { profiles?: Profile[] }) => {
      resolve(result.profiles || [])
    })
  })
}

/**
 * Fetch health data from backend (extension can access localhost without auth)
 */
export async function getHealth() {
  const res = await fetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error('Backend not responding')
  return res.json()
}

/**
 * Fetch terminals list from backend
 */
export async function getTerminals() {
  const res = await fetch(`${API_BASE}/api/agents`)
  if (!res.ok) throw new Error('Failed to fetch terminals')
  return res.json()
}

/**
 * Fetch orphaned sessions from backend
 */
export async function getOrphanedSessions() {
  const res = await fetch(`${API_BASE}/api/tmux/orphaned-sessions`)
  if (!res.ok) throw new Error('Failed to fetch orphaned sessions')
  return res.json()
}

/**
 * Kill a tmux session
 */
export async function killSession(sessionName: string) {
  const res = await fetch(`${API_BASE}/api/tmux/sessions/${encodeURIComponent(sessionName)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to kill session')
  return res.json()
}

/**
 * Kill multiple tmux sessions
 */
export async function killSessions(sessionNames: string[]) {
  const res = await fetch(`${API_BASE}/api/tmux/sessions/bulk`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions: sessionNames }),
  })
  if (!res.ok) throw new Error('Failed to kill sessions')
  return res.json()
}

/**
 * Reattach orphaned sessions
 */
export async function reattachSessions(sessionNames: string[]) {
  const res = await fetch(`${API_BASE}/api/tmux/reattach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions: sessionNames }),
  })
  if (!res.ok) throw new Error('Failed to reattach sessions')
  return res.json()
}

/**
 * Fetch all tmux sessions with detailed info (AI tool detection, etc.)
 */
export async function getAllTmuxSessions() {
  const res = await fetch(`${API_BASE}/api/tmux/sessions/detailed`)
  if (!res.ok) throw new Error('Failed to fetch tmux sessions')
  return res.json()
}

/**
 * Kill a tmux session by name (for external sessions)
 */
export async function killTmuxSession(sessionName: string) {
  const res = await fetch(`${API_BASE}/api/tmux/sessions/${encodeURIComponent(sessionName)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to kill tmux session')
  return res.json()
}
