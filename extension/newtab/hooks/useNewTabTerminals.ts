import { useState, useEffect, useCallback } from 'react'

const BACKEND_URL = 'http://localhost:8129'

interface ClaudeState {
  status: string
  currentTool?: string | null
  context_pct?: number | null
  subagent_count?: number
}

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
}

interface UseTerminalsReturn {
  terminals: TerminalInfo[]
  connected: boolean
  spawnTerminal: (profileId: string, workingDir?: string) => void
  focusTerminal: (terminalId: string) => void
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
          // Fall back to Chrome storage only
          const mapped: TerminalInfo[] = chromeSessions.map((t: any) => ({
            id: t.id,
            name: t.name || 'Terminal',
            workingDir: t.workingDir,
            profileColor: t.profile?.color,
            profileIcon: t.profile?.icon,
          }))
          setTerminals(mapped)
          return
        }

        const apiData = await apiRes.json()
        const apiTerminals = apiData.data || []

        // Filter to only ctt- terminals (Chrome extension managed)
        const cttTerminals = apiTerminals.filter((t: any) =>
          t.name?.startsWith('ctt-') || t.id?.startsWith('ctt-')
        )

        // Merge API data with Chrome storage profile info
        const mapped: TerminalInfo[] = cttTerminals.map((t: any) => {
          const chromeSession = chromeSessionMap.get(t.name) || chromeSessionMap.get(t.id)
          return {
            id: t.name || t.id,
            sessionName: t.name,
            name: chromeSession?.name || t.displayName || t.name || 'Terminal',
            workingDir: t.workingDir || chromeSession?.workingDir,
            profileColor: chromeSession?.profile?.color,
            profileIcon: chromeSession?.profile?.icon,
            claudeState: null as ClaudeState | null,
            paneTitle: null as string | null,
            aiTool: chromeSession?.profile?.command?.includes('claude') ? 'claude-code' : null,
          }
        })

        // Fetch Claude status for each terminal that might be running Claude
        const statusPromises = mapped.map(async (terminal) => {
          if (!terminal.workingDir) return terminal

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
                  aiTool: 'claude-code',
                  claudeState: {
                    status: status.status,
                    currentTool: status.current_tool || null,
                    context_pct: status.context_pct ?? null,
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

  // Focus an existing terminal
  const focusTerminal = useCallback((terminalId: string) => {
    // Send message to open sidebar and switch to this terminal
    chrome.runtime.sendMessage({
      type: 'OPEN_SIDEBAR',
      data: { focusTerminal: terminalId }
    })
  }, [])

  return { terminals, connected, spawnTerminal, focusTerminal }
}
