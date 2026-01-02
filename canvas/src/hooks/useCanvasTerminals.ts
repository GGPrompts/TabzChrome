import { useState, useEffect, useCallback, useRef } from 'react'

// Profile interface matching the Chrome extension's Profile type
export interface TerminalProfile {
  id: string
  name: string
  workingDir?: string
  command?: string
  fontSize?: number
  fontFamily?: string
  themeName?: string
  backgroundGradient?: string
  panelColor?: string
  transparency?: number
  backgroundMedia?: string
  backgroundMediaType?: 'none' | 'image' | 'video'
  backgroundMediaOpacity?: number
  color?: string
  icon?: string
}

export interface CanvasTerminal {
  id: string
  name: string
  sessionName: string
  terminalType?: string
  color?: string
  icon?: string
  workingDir?: string
  state?: string
  profile?: TerminalProfile  // Full profile object with appearance settings
  owner: 'sidebar' | 'canvas'
  canvas?: {
    x: number
    y: number
    width: number
    height: number
    zIndex?: number
    visible?: boolean
  }
  createdAt?: string
  lastActivity?: string
}

interface UseCanvasTerminalsResult {
  terminals: CanvasTerminal[]
  isLoading: boolean
  error: string | null
  updateTerminal: (id: string, updates: Partial<CanvasTerminal['canvas']>) => Promise<void>
  removeTerminal: (id: string) => void
  refetch: () => Promise<void>
}

const API_BASE = '/api'

/**
 * Hook for fetching and managing canvas terminals from backend
 * Polls the backend API and tracks terminals owned by canvas
 */
export function useCanvasTerminals(): UseCanvasTerminalsResult {
  const [terminals, setTerminals] = useState<CanvasTerminal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authTokenRef = useRef<string | null>(null)

  // Get auth token
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (authTokenRef.current) return authTokenRef.current

    try {
      const response = await fetch(`${API_BASE}/auth-token`)
      if (!response.ok) return null
      const data = await response.json()
      authTokenRef.current = data.token
      return data.token
    } catch {
      return null
    }
  }, [])

  // Fetch terminals from backend
  const fetchTerminals = useCallback(async () => {
    try {
      const token = await getAuthToken()
      const headers: HeadersInit = token ? { 'X-Auth-Token': token } : {}

      const response = await fetch(`${API_BASE}/canvas/terminals?owner=canvas`, { headers })
      if (!response.ok) {
        throw new Error(`Failed to fetch terminals: ${response.status}`)
      }

      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setTerminals(data.data)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch terminals')
    } finally {
      setIsLoading(false)
    }
  }, [getAuthToken])

  // Update terminal canvas state
  const updateTerminal = useCallback(async (id: string, updates: Partial<CanvasTerminal['canvas']>) => {
    // Optimistic update
    setTerminals(prev =>
      prev.map(t =>
        t.id === id
          ? { ...t, canvas: { ...t.canvas, ...updates } as CanvasTerminal['canvas'] }
          : t
      )
    )

    try {
      const token = await getAuthToken()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Auth-Token': token } : {}),
      }

      const response = await fetch(`${API_BASE}/canvas/terminals/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error(`Failed to update terminal: ${response.status}`)
      }
    } catch (err) {
      // Revert on error
      await fetchTerminals()
      setError(err instanceof Error ? err.message : 'Failed to update terminal')
    }
  }, [getAuthToken, fetchTerminals])

  // Remove terminal from local state (transfer back to sidebar)
  const removeTerminal = useCallback((id: string) => {
    setTerminals(prev => prev.filter(t => t.id !== id))
  }, [])

  // Initial fetch and polling
  useEffect(() => {
    fetchTerminals()

    // Poll every 2 seconds
    const interval = setInterval(fetchTerminals, 2000)
    return () => clearInterval(interval)
  }, [fetchTerminals])

  return {
    terminals,
    isLoading,
    error,
    updateTerminal,
    removeTerminal,
    refetch: fetchTerminals,
  }
}
