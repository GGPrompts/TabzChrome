import { useEffect, useState, useRef, useCallback } from 'react'
import { sendMessage } from '../shared/messaging'
import type { Profile } from '../components/SettingsModal'

export interface TerminalSession {
  id: string
  name: string
  type: string
  active: boolean
  sessionName?: string  // Tmux session name (only for tmux-based terminals)
  workingDir?: string   // Working directory for Claude status polling
  profile?: Profile     // Profile settings for this terminal
  assignedVoice?: string  // Auto-assigned voice for audio (when no profile override)
}

interface UseTerminalSessionsParams {
  wsConnected: boolean
  profiles: Profile[]
  getNextAvailableVoice: () => string
}

interface UseTerminalSessionsReturn {
  sessions: TerminalSession[]
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>
  currentSession: string | null
  setCurrentSession: (id: string | null) => void
  storageLoaded: boolean
  sessionsRef: React.MutableRefObject<TerminalSession[]>
  currentSessionRef: React.MutableRefObject<string | null>
  connectionCount: number
  handleWebSocketMessage: (data: any) => void
}

export function useTerminalSessions({
  wsConnected,
  profiles,
  getNextAvailableVoice,
}: UseTerminalSessionsParams): UseTerminalSessionsReturn {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [connectionCount, setConnectionCount] = useState(1)

  // Refs for keyboard shortcut handlers (to access current state from callbacks)
  const sessionsRef = useRef<TerminalSession[]>([])
  const currentSessionRef = useRef<string | null>(null)
  // Track terminals we've already sent RECONNECT for to prevent duplicates
  const reconnectedTerminalsRef = useRef<Set<string>>(new Set())
  // Track if we've received first terminals message after connect (Codex fix)
  const hasReceivedTerminalsRef = useRef(false)
  // Track if we've sent LIST_TERMINALS for this connection (prevent duplicate requests)
  const hasSentListTerminalsRef = useRef(false)
  // Track if we've already scheduled REFRESH_TERMINALS (prevent redraw storms)
  const hasScheduledRefreshRef = useRef(false)

  // Keep refs in sync with state
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    currentSessionRef.current = currentSession
  }, [currentSession])

  // Load saved terminal sessions from Chrome storage on mount
  // CRITICAL: Must complete before LIST_TERMINALS request to avoid race condition
  useEffect(() => {
    chrome.storage.local.get(['terminalSessions'], (result) => {
      if (result.terminalSessions && Array.isArray(result.terminalSessions)) {
        setSessions(result.terminalSessions)
        if (result.terminalSessions.length > 0) {
          setCurrentSession(result.terminalSessions[0].id)
        }
      }
      setStorageLoaded(true)
    })
  }, [])

  // Save terminal sessions to Chrome storage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      chrome.storage.local.set({ terminalSessions: sessions })
    } else {
      chrome.storage.local.remove('terminalSessions')
    }
  }, [sessions])

  // Request terminal list when WebSocket connects AND storage is loaded
  useEffect(() => {
    if (wsConnected && storageLoaded) {
      // Prevent duplicate LIST_TERMINALS requests (can happen if both deps change near-simultaneously)
      if (!hasSentListTerminalsRef.current) {
        hasSentListTerminalsRef.current = true
        sendMessage({ type: 'LIST_TERMINALS' })
      }
    } else if (!wsConnected) {
      // Clear reconnected terminals set when WebSocket disconnects
      // so we reconnect fresh when it reconnects
      reconnectedTerminalsRef.current.clear()
      hasReceivedTerminalsRef.current = false // Reset for next connect (Codex fix)
      hasSentListTerminalsRef.current = false // Reset for next connect
      hasScheduledRefreshRef.current = false // Reset refresh dedup for next connect
    }
  }, [wsConnected, storageLoaded])

  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'terminals':
        // Terminal list received from backend - reconcile with stored sessions
        // Filter to only ctt- prefixed terminals (Chrome extension terminals)
        const backendTerminals = (data.data || []).filter((t: any) => t.id && t.id.startsWith('ctt-'))
        const recoveryComplete = data.recoveryComplete === true

        // Track connection count for multi-window warning
        if (data.connectionCount !== undefined) {
          setConnectionCount(data.connectionCount)
        }

        // Codex fix: Clear reconnected set on FIRST terminals message after connect
        // This handles silent WS reconnects where wsConnected never went false
        if (!hasReceivedTerminalsRef.current) {
          hasReceivedTerminalsRef.current = true
          reconnectedTerminalsRef.current.clear()
          console.log('[Sessions] First terminals message after connect - cleared reconnect dedup set')
        }

        // Send RECONNECT for each backend terminal to register this connection as owner
        // This is critical after backend restart - without it, terminals freeze because
        // the backend doesn't know to route output to this connection
        // Skip terminals we've already reconnected to (prevents duplicate reconnects from multiple terminals messages)
        // Add small delay to let backend fully initialize after recovery broadcast
        setTimeout(() => {
          backendTerminals.forEach((t: any) => {
            if (!reconnectedTerminalsRef.current.has(t.id)) {
              reconnectedTerminalsRef.current.add(t.id)
              sendMessage({
                type: 'RECONNECT',
                terminalId: t.id,
              })
            }
          })
          // Trigger terminal refresh after reconnects to fix terminal dimensions
          // This forces terminals to refit after backend restart
          // REFRESH_TERMINALS is broadcast to all terminal components and triggers
          // triggerResizeTrick() which properly handles resize with locks
          // NOTE: Only send ONCE - sending multiple times caused resize oscillation and tmux
          // redraw storms that corrupted the terminal output (same line repeated many times)
          // CRITICAL: Use hasScheduledRefreshRef to prevent multiple REFRESH_TERMINALS
          // when multiple 'terminals' messages arrive (e.g., from updateBadge + LIST_TERMINALS)
          if (!hasScheduledRefreshRef.current) {
            hasScheduledRefreshRef.current = true
            // Delay 1500ms to ensure all terminals have initialized (init guard is 1000ms)
            setTimeout(() => sendMessage({ type: 'REFRESH_TERMINALS' }), 1500)
          }
        }, 300)

        // Get current sessions from state (which may have been restored from Chrome storage)
        setSessions(currentSessions => {
          // Filter current sessions to only ctt- prefixed (clean up any old non-prefixed sessions)
          const filteredSessions = currentSessions.filter(s => s.id && s.id.startsWith('ctt-'))
          // Create a map of existing sessions by ID
          const sessionMap = new Map(filteredSessions.map(s => [s.id, s]))

          // Update or add backend terminals
          backendTerminals.forEach((t: any) => {
            const existingSession = sessionMap.get(t.id)
            if (existingSession) {
              // Update existing session with backend data, preserving the name from Chrome storage
              // CRITICAL: Use ?? to preserve existing sessionName if backend returns undefined
              // This prevents chat send from falling back to unreliable TERMINAL_INPUT path
              sessionMap.set(t.id, {
                ...existingSession,
                sessionName: t.sessionName ?? existingSession.sessionName,
                workingDir: t.workingDir ?? existingSession.workingDir,
                active: false,
              })
            } else {
              // Add new terminal from backend
              sessionMap.set(t.id, {
                id: t.id,
                name: t.name || t.id,
                type: t.terminalType || 'bash',
                active: false,
                sessionName: t.sessionName,
                profile: t.profile,
              })
            }
          })

          // Only remove sessions that no longer exist in backend AFTER recovery is complete
          // This prevents clearing Chrome storage before the backend has recovered tmux sessions
          if (recoveryComplete) {
            const backendIds = new Set(backendTerminals.map((t: any) => t.id))
            for (const [id, _] of sessionMap) {
              if (!backendIds.has(id)) {
                sessionMap.delete(id)
              }
            }
          }

          const updatedSessions = Array.from(sessionMap.values())

          // 🔧 FIX: Only reset current session if it was removed from backend
          // Don't reset just because currentSession state hasn't synced yet
          setCurrentSession(prevCurrent => {
            // If no sessions, clear current
            if (updatedSessions.length === 0) {
              return null
            }

            // If current session still exists in updated list, keep it
            if (prevCurrent && updatedSessions.find(s => s.id === prevCurrent)) {
              return prevCurrent
            }

            // Fall back to first session (current was removed)
            return updatedSessions[0].id
          })

          return updatedSessions
        })
        break
      case 'session-list':
        setSessions(data.sessions || [])
        break
      case 'terminal-spawned':
        // Backend sends: { type: 'terminal-spawned', data: terminalObject, requestId }
        // terminalObject has: { id, name, terminalType, profile, ... }
        const terminal = data.data || data

        // Ignore non-ctt terminals (from other projects sharing this backend)
        if (!terminal.id || !terminal.id.startsWith('ctt-')) {
          break
        }

        // For recovered sessions (no profile), try to find matching profile from session ID
        // Session ID format: ctt-ProfileName-shortId (e.g., ctt-bash-a1b2c3d4)
        let effectiveTerminalProfile = terminal.profile
        if (!effectiveTerminalProfile) {
          const parts = terminal.id.split('-')
          if (parts.length >= 2) {
            const profileNameFromId = parts[1].toLowerCase()
            // Look up profile by name (case-insensitive match)
            chrome.storage.local.get(['profiles'], (result) => {
              const storedProfiles = (result.profiles as Profile[]) || []
              const matchedProfile = storedProfiles.find(p =>
                p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').startsWith(profileNameFromId)
              )
              if (matchedProfile) {
                // Update the session with the matched profile
                setSessions(prev => prev.map(s =>
                  s.id === terminal.id ? { ...s, profile: matchedProfile } : s
                ))
              }
            })
          }
        }

        setSessions(prev => {
          // Check if terminal already exists (from restore)
          if (prev.find(s => s.id === terminal.id)) {
            return prev
          }

          // Auto-assign a voice from the pool (uses getNextAvailableVoice from hook)
          const assignedVoice = getNextAvailableVoice()

          return [...prev, {
            id: terminal.id,
            name: terminal.name || terminal.id,
            type: terminal.terminalType || 'bash',
            active: false,
            sessionName: terminal.sessionName,  // Store tmux session name
            workingDir: terminal.workingDir,    // Store working directory for Claude status
            profile: effectiveTerminalProfile,  // Store profile settings (may be updated async)
            assignedVoice,  // Auto-assigned voice for audio notifications
          }]
        })
        setCurrentSession(terminal.id)

        // For API-spawned terminals, send reconnect to register this connection as owner
        // This enables chat input to send commands to the terminal
        // Codex fix: Also add to dedup set to prevent duplicate RECONNECT from next terminals list
        if (!reconnectedTerminalsRef.current.has(terminal.id)) {
          reconnectedTerminalsRef.current.add(terminal.id)
          sendMessage({
            type: 'RECONNECT',
            terminalId: terminal.id,
          })
        }
        break
      case 'terminal-closed':
        // Backend sends: { type: 'terminal-closed', data: { id: terminalId } }
        const closedTerminalId = data.data?.id || data.terminalId || data.id
        // Terminal closed
        setSessions(prev => {
          const closedIndex = prev.findIndex(s => s.id === closedTerminalId)
          const updated = prev.filter(s => s.id !== closedTerminalId)

          // If closed terminal was active, switch to adjacent terminal
          setCurrentSession(prevCurrent => {
            if (prevCurrent !== closedTerminalId) return prevCurrent
            if (updated.length === 0) return null
            // Prefer the terminal that was after the closed one, else the one before
            const newIndex = Math.min(closedIndex, updated.length - 1)
            return updated[newIndex]?.id || null
          })

          return updated
        })
        break
      case 'connection-count':
        // Handle standalone connection count updates
        if (data.count !== undefined) {
          setConnectionCount(data.count)
        }
        break
    }
  }, [getNextAvailableVoice])

  return {
    sessions,
    setSessions,
    currentSession,
    setCurrentSession,
    storageLoaded,
    sessionsRef,
    currentSessionRef,
    connectionCount,
    handleWebSocketMessage,
  }
}
