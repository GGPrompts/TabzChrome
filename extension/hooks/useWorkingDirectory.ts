import { useEffect, useState, useCallback, useRef } from 'react'

export interface UseWorkingDirectoryReturn {
  globalWorkingDir: string
  setGlobalWorkingDir: (dir: string) => void
  recentDirs: string[]
  setRecentDirs: React.Dispatch<React.SetStateAction<string[]>>
  addToRecentDirs: (dir: string) => void
}

/**
 * Hook to manage global working directory and recent directories
 * - Loads from Chrome storage on mount
 * - Persists changes to Chrome storage
 * - Provides helper to add directories to recent list
 */
export function useWorkingDirectory(): UseWorkingDirectoryReturn {
  const [globalWorkingDir, setGlobalWorkingDir] = useState<string>('~')
  const [recentDirs, setRecentDirs] = useState<string[]>(['~', '~/projects'])

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)

  // Load from Chrome storage on mount
  useEffect(() => {
    isMountedRef.current = true

    chrome.storage.local.get(['globalWorkingDir', 'recentDirs'], (result) => {
      if (!isMountedRef.current) return

      if (result.globalWorkingDir && typeof result.globalWorkingDir === 'string') {
        setGlobalWorkingDir(result.globalWorkingDir)
      }
      if (result.recentDirs && Array.isArray(result.recentDirs)) {
        setRecentDirs(result.recentDirs as string[])
      }
    })

    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Save global working directory when it changes
  useEffect(() => {
    chrome.storage.local.set({ globalWorkingDir })
  }, [globalWorkingDir])

  // Save recent dirs when they change
  useEffect(() => {
    chrome.storage.local.set({ recentDirs })
  }, [recentDirs])

  // Helper to add a directory to recent list
  const addToRecentDirs = useCallback((dir: string) => {
    if (!dir || dir === '~') return // Don't add empty or home
    setRecentDirs(prev => {
      const filtered = prev.filter(d => d !== dir)
      return [dir, ...filtered].slice(0, 10) // Keep last 10
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
