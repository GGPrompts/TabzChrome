import { useEffect, useState, useCallback, useRef } from 'react'

interface OrphanedSessionsData {
  orphanedSessions: string[]
  count: number
  totalTmuxSessions: number
  totalCttSessions: number
  registeredTerminals: number
}

interface UseOrphanedSessionsResult {
  orphanedSessions: string[]
  count: number
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  reattachSessions: (sessions: string[]) => Promise<{ success: boolean; message: string }>
  killSessions: (sessions: string[]) => Promise<{ success: boolean; message: string }>
}

const POLL_INTERVAL = 30000 // 30 seconds
const API_BASE = 'http://localhost:8129'

/**
 * Hook to manage orphaned tmux sessions (Ghost Badge feature)
 * - Polls for orphaned ctt-* sessions every 30 seconds
 * - Provides methods to reattach or kill sessions
 */
export function useOrphanedSessions(): UseOrphanedSessionsResult {
  const [orphanedSessions, setOrphanedSessions] = useState<string[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)

  const fetchOrphanedSessions = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/api/tmux/orphaned-sessions`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (isMountedRef.current) {
        if (result.success) {
          setOrphanedSessions(result.data.orphanedSessions)
          setCount(result.data.count)
        } else {
          setError(result.error || 'Failed to fetch orphaned sessions')
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        // Don't show error for network failures (backend might not be running)
        setOrphanedSessions([])
        setCount(0)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  const reattachSessions = useCallback(async (sessions: string[]): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/tmux/reattach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions })
      })

      const result = await response.json()

      // Refresh the orphaned sessions list after reattaching
      await fetchOrphanedSessions()

      return {
        success: result.success,
        message: result.message || `Reattached ${result.data?.success?.length || 0} session(s)`
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to reattach sessions'
      }
    }
  }, [fetchOrphanedSessions])

  const killSessions = useCallback(async (sessions: string[]): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE}/api/tmux/sessions/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions })
      })

      const result = await response.json()

      // Refresh the orphaned sessions list after killing
      await fetchOrphanedSessions()

      const killedCount = result.data?.killed?.length || 0
      const message = result.message || `Killed ${killedCount} session(s)`

      // Play audio notification if enabled
      if (result.success && killedCount > 0) {
        try {
          const stored = await chrome.storage.local.get('audioSettings')
          const audioSettings = (stored.audioSettings || {}) as {
            enabled?: boolean
            events?: { sessionStart?: boolean }
            voice?: string
            rate?: string
            volume?: number
          }
          if (audioSettings.enabled && audioSettings.events?.sessionStart) {
            const text = killedCount === 1
              ? `Killed orphaned session`
              : `Killed ${killedCount} orphaned sessions`
            await fetch(`${API_BASE}/api/audio/speak`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text,
                voice: audioSettings.voice || 'en-US-AndrewMultilingualNeural',
                rate: audioSettings.rate || '+0%',
                volume: audioSettings.volume ?? 0.7
              })
            })
          }
        } catch (audioErr) {
          // Silently fail audio - not critical
          console.warn('Audio notification failed:', audioErr)
        }
      }

      return {
        success: result.success,
        message
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to kill sessions'
      }
    }
  }, [fetchOrphanedSessions])

  // Initial fetch and polling
  useEffect(() => {
    isMountedRef.current = true

    // Initial fetch
    fetchOrphanedSessions()

    // Set up polling
    const interval = setInterval(fetchOrphanedSessions, POLL_INTERVAL)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
  }, [fetchOrphanedSessions])

  return {
    orphanedSessions,
    count,
    isLoading,
    error,
    refresh: fetchOrphanedSessions,
    reattachSessions,
    killSessions
  }
}
