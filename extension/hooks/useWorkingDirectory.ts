import { useEffect, useState, useCallback, useRef } from 'react'

const BACKEND_URL = 'http://localhost:8129'

export interface UseWorkingDirectoryReturn {
  globalWorkingDir: string
  setGlobalWorkingDir: (dir: string) => void
  recentDirs: string[]
  setRecentDirs: React.Dispatch<React.SetStateAction<string[]>>
  addToRecentDirs: (dir: string) => void
}

/**
 * Hook to manage global working directory and recent directories
 * - Loads from Chrome storage on mount (fast local)
 * - Syncs with backend API (shared with dashboard)
 * - Persists changes to both Chrome storage AND backend
 */
export function useWorkingDirectory(): UseWorkingDirectoryReturn {
  const [globalWorkingDir, setGlobalWorkingDir] = useState<string>('~')
  const [recentDirs, setRecentDirs] = useState<string[]>(['~', '~/projects'])

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)
  // Track if we're doing initial load (to avoid syncing back to API during load)
  const isInitialLoadRef = useRef(true)

  // Load from Chrome storage first, then sync with backend API
  useEffect(() => {
    isMountedRef.current = true
    isInitialLoadRef.current = true

    // Step 1: Load from Chrome storage (fast)
    chrome.storage.local.get(['globalWorkingDir', 'recentDirs'], async (result) => {
      if (!isMountedRef.current) return

      let localDir = result.globalWorkingDir as string || '~'
      let localRecent = (result.recentDirs as string[]) || ['~', '~/projects']

      // Step 2: Fetch from backend API and merge
      try {
        const response = await fetch(`${BACKEND_URL}/api/settings/working-dir`)
        const apiResult = await response.json()
        if (apiResult.success && apiResult.data) {
          // Use API's globalWorkingDir (source of truth)
          localDir = apiResult.data.globalWorkingDir || localDir
          // Merge recent dirs (unique, API first)
          const apiRecent = apiResult.data.recentDirs || []
          const merged = [...apiRecent, ...localRecent]
          localRecent = [...new Set(merged)].slice(0, 15)
        }
      } catch (e) {
        // API not available, use local only
      }

      if (isMountedRef.current) {
        setGlobalWorkingDir(localDir)
        setRecentDirs(localRecent)
      }

      // Allow syncing after initial load
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 500)
    })

    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Save global working directory to Chrome storage AND backend API
  useEffect(() => {
    chrome.storage.local.set({ globalWorkingDir })

    // Also sync to backend API (for dashboard)
    if (!isInitialLoadRef.current) {
      fetch(`${BACKEND_URL}/api/settings/working-dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalWorkingDir })
      }).catch(() => { /* ignore API errors */ })
    }
  }, [globalWorkingDir])

  // Save recent dirs to Chrome storage AND backend API
  useEffect(() => {
    chrome.storage.local.set({ recentDirs })

    // Also sync to backend API (for dashboard)
    if (!isInitialLoadRef.current) {
      fetch(`${BACKEND_URL}/api/settings/working-dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentDirs })
      }).catch(() => { /* ignore API errors */ })
    }
  }, [recentDirs])

  // Helper to add a directory to recent list
  const addToRecentDirs = useCallback((dir: string) => {
    if (!dir || dir === '~') return // Don't add empty or home
    setRecentDirs(prev => {
      const filtered = prev.filter(d => d !== dir)
      return [dir, ...filtered].slice(0, 15) // Keep last 15
    })
  }, [])

  return {
    globalWorkingDir,
    setGlobalWorkingDir,
    recentDirs,
    setRecentDirs,
    addToRecentDirs,
  }
}
