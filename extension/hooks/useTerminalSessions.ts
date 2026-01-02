import { useEffect, useState, useRef, useCallback } from 'react'
import { sendMessage } from '../shared/messaging'
import type { Profile } from '../components/settings/types'
import type { BackgroundMediaType } from '../components/settings/types'

// Per-terminal appearance overrides (not saved to profile)
export interface TerminalAppearanceOverrides {
  themeName?: string
  backgroundGradient?: string
  panelColor?: string
  transparency?: number
  fontFamily?: string
  // Background media (video/image)
  backgroundMedia?: string
  backgroundMediaType?: BackgroundMediaType
  backgroundMediaOpacity?: number
}

// Canvas state for terminal positioning on infinite canvas
// All fields optional to support partial updates from backend
export interface CanvasState {
  x?: number
  y?: number
  width?: number
  height?: number
  zIndex?: number
  visible?: boolean
}

// Terminal owner - which view owns the terminal
export type TerminalOwner = 'sidebar' | 'canvas'

export interface TerminalSession {
  id: string
  name: string
  type: string
  active: boolean
  sessionName?: string  // Tmux session name (only for tmux-based terminals)
  workingDir?: string   // Working directory for Claude status polling
  profile?: Profile     // Profile settings for this terminal
  assignedVoice?: string  // Auto-assigned voice for audio (when no profile override)
  command?: string      // Startup command (for API-spawned terminals without profile)
  focusedIn3D?: boolean // Terminal is currently open in 3D Focus mode
  poppedOut?: boolean   // Terminal is in a standalone popup window
  popoutWindowId?: number // Chrome window ID of the popout
  fontSizeOffset?: number // Per-instance font size offset (-4 to +8), not persisted
  appearanceOverrides?: TerminalAppearanceOverrides  // Temp appearance customization (footer 🎨 button)
  // Canvas state fields - synced with backend
  canvas?: CanvasState  // Position/size on infinite canvas
  owner?: TerminalOwner // Which view owns the terminal ('sidebar' | 'canvas')
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
  // Font size offset functions (per-instance zoom, not persisted)
  increaseFontSize: (terminalId: string) => void
  decreaseFontSize: (terminalId: string) => void
  resetFontSize: (terminalId: string) => void
  // Appearance override functions (per-instance, not persisted)
  updateTerminalAppearance: (terminalId: string, overrides: Partial<TerminalAppearanceOverrides>) => void
  resetTerminalAppearance: (terminalId: string) => void
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
    chrome.storage.local.get(['terminalSessions', 'currentTerminalId'], async (result) => {
      if (result.terminalSessions && Array.isArray(result.terminalSessions)) {
        let loadedSessions = result.terminalSessions as TerminalSession[]

        // Check for stale focusedIn3D flags (3D tabs that no longer exist after extension reload)
        const focusedSessions = loadedSessions.filter(s => s.focusedIn3D)
        if (focusedSessions.length > 0) {
          try {
            // Query for any open 3D focus tabs
            const tabs = await chrome.tabs.query({ url: `chrome-extension://${chrome.runtime.id}/3d/*` })
            const openSessionNames = new Set<string>(
              tabs.map(tab => {
                const url = new URL(tab.url || '')
                return url.searchParams.get('session')
              }).filter((s): s is string => s !== null)
            )

            // Reset focusedIn3D for terminals whose 3D tabs no longer exist
            loadedSessions = loadedSessions.map(s => {
              if (s.focusedIn3D && s.sessionName && !openSessionNames.has(s.sessionName)) {
                console.log('[Sessions] Resetting stale focusedIn3D flag for:', s.sessionName)
                return { ...s, focusedIn3D: false }
              }
              return s
            })
          } catch (e) {
            // If tab query fails, reset all focusedIn3D flags to be safe
            console.warn('[Sessions] Could not query 3D tabs, resetting focusedIn3D flags:', e)
            loadedSessions = loadedSessions.map(s => ({ ...s, focusedIn3D: false }))
          }
        }

        // Check for stale poppedOut flags (popout windows that no longer exist)
        const poppedOutSessions = loadedSessions.filter(s => s.poppedOut)
        if (poppedOutSessions.length > 0) {
          try {
            // Query background for currently tracked popout windows
            const response = await chrome.runtime.sendMessage({ type: 'GET_POPOUT_WINDOWS' })
            if (response?.type === 'POPOUT_WINDOWS_RESPONSE') {
              const activePopoutTerminalIds = new Set(response.popouts.map((p: { terminalId: string }) => p.terminalId))

              // Reset poppedOut for terminals whose popout windows no longer exist
              loadedSessions = loadedSessions.map(s => {
                if (s.poppedOut && !activePopoutTerminalIds.has(s.id)) {
                  console.log('[Sessions] Resetting stale poppedOut flag for:', s.id)
                  return { ...s, poppedOut: false, popoutWindowId: undefined }
                }
                return s
              })
            }
          } catch (e) {
            // If query fails, reset all poppedOut flags to be safe
            console.warn('[Sessions] Could not query popout windows, resetting poppedOut flags:', e)
            loadedSessions = loadedSessions.map(s => ({ ...s, poppedOut: false, popoutWindowId: undefined }))
          }
        }

        setSessions(loadedSessions)
        // Restore saved current terminal, or fall back to first
        const savedCurrentId = result.currentTerminalId as string | undefined
        const sessionExists = savedCurrentId && loadedSessions.some((s: TerminalSession) => s.id === savedCurrentId)
        if (savedCurrentId && sessionExists) {
          setCurrentSession(savedCurrentId)
        } else if (loadedSessions.length > 0) {
          setCurrentSession(loadedSessions[0].id)
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

  // Listen for session changes from other contexts (e.g., sidebar updates appearance, popout receives it)
  // Only update appearance-related properties to avoid overwriting local terminal state
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.terminalSessions?.newValue) {
        const newSessions = changes.terminalSessions.newValue as TerminalSession[]
        setSessions(prev => {
          // Check if any appearance overrides actually changed
          let hasChanges = false
          const updated = prev.map(session => {
            const incoming = newSessions.find(s => s.id === session.id)
            if (!incoming) return session

            // Check if appearance-related fields changed
            const overridesChanged = JSON.stringify(session.appearanceOverrides) !== JSON.stringify(incoming.appearanceOverrides)
            const fontOffsetChanged = session.fontSizeOffset !== incoming.fontSizeOffset
            const profileChanged = session.profile?.id !== incoming.profile?.id

            if (overridesChanged || fontOffsetChanged || profileChanged) {
              hasChanges = true
              return {
                ...session,
                appearanceOverrides: incoming.appearanceOverrides,
                fontSizeOffset: incoming.fontSizeOffset,
                profile: incoming.profile,
              }
            }
            return session
          })
          return hasChanges ? updated : prev
        })
      }
    }

    chrome.storage.local.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.local.onChanged.removeListener(handleStorageChange)
  }, [])

  // Save current terminal ID to Chrome storage (persists across sidebar refresh)
  useEffect(() => {
    if (currentSession) {
      chrome.storage.local.set({ currentTerminalId: currentSession })
    }
  }, [currentSession])

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
          // Stagger reconnections to prevent race conditions when multiple terminals
          // try to attach to tmux sessions simultaneously (3rd terminal often fails)
          backendTerminals.forEach((t: any, index: number) => {
            if (!reconnectedTerminalsRef.current.has(t.id)) {
              reconnectedTerminalsRef.current.add(t.id)
              // 150ms delay between each reconnection to serialize tmux attachments
              setTimeout(() => {
                sendMessage({
                  type: 'RECONNECT',
                  terminalId: t.id,
                })
              }, index * 150)
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
                canvas: t.canvas ?? existingSession.canvas,  // Sync canvas state
                owner: t.owner ?? existingSession.owner ?? 'sidebar',  // Sync owner
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
                canvas: t.canvas,  // Include canvas state
                owner: t.owner || 'sidebar',  // Include owner
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
        // Session ID format: ctt-{sanitizedProfileName}-{shortId} (e.g., ctt-bash-a1b2c3d4)
        // The sanitizedProfileName can contain hyphens (e.g., "claude-tfe" from "Claude & TFE")
        // and shortId is always 8 hex characters at the end
        let effectiveTerminalProfile = terminal.profile
        if (!effectiveTerminalProfile) {
          // Extract the full sanitized profile name from the ID
          // ID format: ctt-{sanitizedName}-{8-char-hex}
          // We need to find everything between "ctt-" and the last "-{8chars}"
          const idMatch = terminal.id.match(/^ctt-(.+)-([a-f0-9]{8})$/)
          if (idMatch) {
            const sanitizedNameFromId = idMatch[1].toLowerCase()  // e.g., "claude-tfe" or "bash"
            // Look up profile by exact sanitized name match (not startsWith!)
            chrome.storage.local.get(['profiles'], (result) => {
              const storedProfiles = (result.profiles as Profile[]) || []
              const matchedProfile = storedProfiles.find(p => {
                const sanitizedProfileName = p.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '')
                  .substring(0, 20)
                // Exact match required to prevent false positives
                return sanitizedProfileName === sanitizedNameFromId
              })
              if (matchedProfile) {
                // Update the session with the matched profile AND restore original name
                setSessions(prev => prev.map(s =>
                  s.id === terminal.id ? { ...s, profile: matchedProfile, name: matchedProfile.name } : s
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
            command: terminal.config?.command,  // Store command for API-spawned terminals
            canvas: terminal.canvas,  // Canvas position/size state
            owner: terminal.owner || 'sidebar',  // Which view owns the terminal
          }]
        })
        // Auto-focus the new terminal
        // Note: PopoutTerminalView doesn't use currentSession (it uses sessions.find()),
        // so this only affects the main sidebar behavior
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

      // Canvas sync message handlers
      case 'terminal-canvas-updated':
        // Single terminal canvas state updated (position/size change)
        if (data.data?.id) {
          setSessions(prev => prev.map(s =>
            s.id === data.data.id
              ? { ...s, canvas: data.data.canvas }
              : s
          ))
        }
        break

      case 'terminal-ownership-transferred':
        // Terminal moved between sidebar and canvas
        if (data.data?.id) {
          // If transferred TO canvas, release sidebar's ownership on the backend
          // This prevents "2 owners" warning when canvas connects directly
          if (data.data.owner === 'canvas') {
            sendMessage({
              type: 'RELEASE_OWNERSHIP',
              terminalId: data.data.id,
            })
          }
          setSessions(prev => prev.map(s =>
            s.id === data.data.id
              ? { ...s, owner: data.data.owner, canvas: data.data.canvas }
              : s
          ))
        }
        break

      case 'terminal-canvas-batch-updated':
        // Multiple terminals updated at once (drag multiple, layout changes)
        if (Array.isArray(data.data?.updates)) {
          const updateMap = new Map<string, CanvasState>(
            data.data.updates.map((u: { id: string; canvas: CanvasState }) => [u.id, u.canvas])
          )
          setSessions(prev => prev.map(s => {
            const newCanvas = updateMap.get(s.id)
            return newCanvas ? { ...s, canvas: newCanvas } : s
          }))
        }
        break
    }
  }, [getNextAvailableVoice])

  // Font size offset functions - per-instance zoom, clamped to -4 to +8, NOT persisted
  const MIN_FONT_OFFSET = -4
  const MAX_FONT_OFFSET = 8

  const increaseFontSize = useCallback((terminalId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === terminalId
        ? { ...s, fontSizeOffset: Math.min((s.fontSizeOffset || 0) + 1, MAX_FONT_OFFSET) }
        : s
    ))
  }, [])

  const decreaseFontSize = useCallback((terminalId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === terminalId
        ? { ...s, fontSizeOffset: Math.max((s.fontSizeOffset || 0) - 1, MIN_FONT_OFFSET) }
        : s
    ))
  }, [])

  const resetFontSize = useCallback((terminalId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === terminalId
        ? { ...s, fontSizeOffset: 0 }
        : s
    ))
  }, [])

  // Appearance override functions - per-instance customization, NOT persisted
  const updateTerminalAppearance = useCallback((terminalId: string, overrides: Partial<TerminalAppearanceOverrides>) => {
    setSessions(prev => prev.map(s =>
      s.id === terminalId
        ? {
            ...s,
            appearanceOverrides: {
              ...s.appearanceOverrides,
              ...overrides,
            },
          }
        : s
    ))
  }, [])

  const resetTerminalAppearance = useCallback((terminalId: string) => {
    setSessions(prev => prev.map(s =>
      s.id === terminalId
        ? { ...s, appearanceOverrides: undefined }
        : s
    ))
  }, [])

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
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    updateTerminalAppearance,
    resetTerminalAppearance,
  }
}
