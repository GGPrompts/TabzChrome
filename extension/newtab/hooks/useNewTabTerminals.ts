import { useState, useEffect, useCallback } from 'react'

const BACKEND_URL = 'http://localhost:8129'

interface ClaudeState {
  status: string
  currentTool?: string | null
  context_pct?: number | null
  subagent_count?: number
}

type DisplayMode = 'sidebar' | 'popout' | '3d'

interface TerminalInfo {
  id: string
  sessionName?: string
  name: string
  workingDir?: string
  profileColor?: string
  profileIcon?: string
  claudeState?: ClaudeState | null
  paneTitle?: string | null
  aiTool?: string | null
  displayMode?: DisplayMode
}

interface UseTerminalsReturn {
  terminals: TerminalInfo[]
  connected: boolean
  spawnTerminal: (profileId: string, workingDir?: string) => void
  focusTerminal: (terminalId: string, displayMode?: DisplayMode) => void
}

/**
 * Hook to manage terminals for the New Tab page
 * - Polls for active terminals from Chrome storage
 * - Spawns terminals via the backend API
 * - Opens sidebar and focuses terminal
 */
export function useTerminals(): UseTerminalsReturn {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [connected, setConnected] = useState(false)

  // Check backend connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`, {
          signal: AbortSignal.timeout(3000)
        })
        setConnected(res.ok)
      } catch {
        setConnected(false)
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 10000)
    return () => clearInterval(interval)
  }, [])

  // Load terminals from API (for rich status) and Chrome storage (for profile info)
  useEffect(() => {
    const loadTerminals = async () => {
      try {
        // Get Chrome storage for profile info
        const storageResult = await new Promise<{ terminalSessions?: any[] }>((resolve) =>
          chrome.storage.local.get(['terminalSessions'], (result) => resolve(result as { terminalSessions?: any[] }))
        )
        const chromeSessions = storageResult.terminalSessions || []
        const chromeSessionMap = new Map(chromeSessions.map((s: any) => [s.id, s]))

        // Fetch from API for rich status data
        const apiRes = await fetch(`${BACKEND_URL}/api/agents`, {
          signal: AbortSignal.timeout(3000)
        })

        if (!apiRes.ok) {
          // Fall back to Chrome storage only (no backend = no resolved colors)
          const mapped: TerminalInfo[] = chromeSessions.map((t: any) => ({
            id: t.id,
            name: t.name || 'Terminal',
            workingDir: t.workingDir,
            profileColor: undefined,  // Colors come from backend, use CSS fallback
            profileIcon: undefined,
          }))
          setTerminals(mapped)
          return
        }

        const apiData = await apiRes.json()
        const apiTerminals = apiData.data || []

        // Filter to only ctt- terminals (Chrome extension managed)
        const cttTerminals = apiTerminals.filter((t: any) =>
          t.id?.startsWith('ctt-')
        )

        // Merge API data with Chrome storage profile info
        const mapped: TerminalInfo[] = cttTerminals.map((t: any) => {
          const chromeSession = chromeSessionMap.get(t.id)
          // Determine display mode from Chrome storage flags
          const displayMode: DisplayMode = chromeSession?.focusedIn3D ? '3d'
            : chromeSession?.poppedOut ? 'popout'
            : 'sidebar'
          return {
            id: t.id,                    // tmux session name (ctt-xxx)
            sessionName: t.id,           // same as id for sidebar matching
            name: chromeSession?.name || t.name || 'Terminal',  // display name
            workingDir: t.workingDir || chromeSession?.workingDir,
            profileColor: t.color,       // Backend stores resolved category color
            profileIcon: t.icon,         // Backend stores icon
            claudeState: null as ClaudeState | null,
            paneTitle: null as string | null,
            aiTool: chromeSession?.profile?.command?.includes('claude') ? 'claude-code' : null,
            displayMode,
          }
        })

        // Fetch Claude status only for terminals running Claude (has 'claude' in profile command)
        const statusPromises = mapped.map(async (terminal) => {
          // Only poll Claude status for terminals with Claude in their profile command
          if (!terminal.workingDir || !terminal.aiTool) return terminal

          try {
            const encodedDir = encodeURIComponent(terminal.workingDir)
            const sessionParam = terminal.sessionName ? `&session=${encodeURIComponent(terminal.sessionName)}` : ''
            const statusRes = await fetch(
              `${BACKEND_URL}/api/claude-status?dir=${encodedDir}${sessionParam}`,
              { signal: AbortSignal.timeout(2000) }
            )

            if (statusRes.ok) {
              const status = await statusRes.json()
              if (status.status && status.status !== 'unknown') {
                return {
                  ...terminal,
                  claudeState: {
                    status: status.status,
                    currentTool: status.current_tool || null,
                    context_pct: status.context_window?.context_pct ?? null,
                    subagent_count: status.subagent_count,
                  },
                  paneTitle: status.pane_title || null,
                }
              }
            }
          } catch {
            // Ignore errors for individual status fetches
          }
          return terminal
        })

        const terminalsWithStatus = await Promise.all(statusPromises)

        // Sort to match sidebar tab order (use Chrome storage order)
        const sidebarOrder = new Map(chromeSessions.map((s: any, index: number) => [s.id, index]))
        terminalsWithStatus.sort((a, b) => {
          const orderA = sidebarOrder.get(a.id) ?? Infinity
          const orderB = sidebarOrder.get(b.id) ?? Infinity
          return orderA - orderB
        })

        setTerminals(terminalsWithStatus)
      } catch (e) {
        // Silently fail - just use existing state
        console.debug('[useTerminals] Failed to load terminals:', e)
      }
    }

    loadTerminals()

    // Poll for updates (faster than before for status updates)
    const interval = setInterval(loadTerminals, 1500)

    // Also listen for storage changes
    const handleChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.terminalSessions) {
        loadTerminals()
      }
    }
    chrome.storage.local.onChanged.addListener(handleChange)

    return () => {
      clearInterval(interval)
      chrome.storage.local.onChanged.removeListener(handleChange)
    }
  }, [])

  // Spawn a new terminal
  const spawnTerminal = useCallback(async (profileId: string, workingDir?: string) => {
    try {
      // Get auth token
      const tokenRes = await fetch(`${BACKEND_URL}/api/auth-token`)
      const tokenData = await tokenRes.json()
      const token = tokenData.token

      // Load profile details
      const result = await new Promise<{ profiles?: any[] }>((resolve) =>
        chrome.storage.local.get(['profiles'], (r: { profiles?: any[] }) => resolve(r))
      )
      const profile = result.profiles?.find(p => p.id === profileId)

      // Spawn via API
      const response = await fetch(`${BACKEND_URL}/api/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token,
        },
        body: JSON.stringify({
          name: profile?.name || 'Terminal',
          profileId,
          workingDir: workingDir || profile?.workingDir || '~',
          command: profile?.command,
        }),
      })

      if (response.ok) {
        // Open sidebar to show the new terminal
        chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' })
      }
    } catch (e) {
      console.error('[spawnTerminal] Failed:', e)
    }
  }, [])

  // Focus an existing terminal (handles sidebar, popout, and 3D modes)
  const focusTerminal = useCallback((terminalId: string, displayMode?: DisplayMode) => {
    console.log('[NewTab] focusTerminal called:', { terminalId, displayMode })
    if (displayMode === 'popout') {
      // Focus the popout window
      chrome.runtime.sendMessage({ type: 'FOCUS_POPOUT_TERMINAL', terminalId })
    } else if (displayMode === '3d') {
      // Focus the 3D Focus tab
      chrome.runtime.sendMessage({ type: 'FOCUS_3D_TERMINAL', terminalId })
    } else {
      // Default: switch to terminal in sidebar
      console.log('[NewTab] Sending SWITCH_TO_TERMINAL message')
      chrome.runtime.sendMessage({ type: 'SWITCH_TO_TERMINAL', terminalId })
    }
  }, [])

  return { terminals, connected, spawnTerminal, focusTerminal }
}
