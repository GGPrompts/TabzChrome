import { useState, useEffect, useCallback } from 'react'

const BACKEND_URL = 'http://localhost:8129'

interface TerminalInfo {
  id: string
  name: string
  workingDir?: string
  profileColor?: string
  profileIcon?: string
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

  // Load terminals from Chrome storage
  useEffect(() => {
    const loadTerminals = () => {
      chrome.storage.local.get(['terminalSessions'], (result) => {
        if (result.terminalSessions && Array.isArray(result.terminalSessions)) {
          const mapped: TerminalInfo[] = result.terminalSessions.map((t: any) => ({
            id: t.id,
            name: t.name || 'Terminal',
            workingDir: t.workingDir,
            profileColor: t.profile?.color,
            profileIcon: t.profile?.icon,
          }))
          setTerminals(mapped)
        }
      })
    }

    loadTerminals()

    // Poll for updates
    const interval = setInterval(loadTerminals, 2000)

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
        chrome.storage.local.get(['profiles'], resolve)
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
