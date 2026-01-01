import { useState, useEffect, useCallback } from 'react'

const BACKEND_URL = 'http://localhost:8129'

interface UseWorkingDirReturn {
  globalWorkingDir: string
  recentDirs: string[]
  setWorkingDir: (dir: string) => void
}

/**
 * Hook to manage working directory for the New Tab page
 * - Syncs with Chrome storage and backend API
 */
export function useWorkingDir(): UseWorkingDirReturn {
  const [globalWorkingDir, setGlobalWorkingDir] = useState('~')
  const [recentDirs, setRecentDirs] = useState<string[]>(['~'])

  // Load from Chrome storage
  useEffect(() => {
    chrome.storage.local.get(['globalWorkingDir', 'recentDirs'], async (result) => {
      let dir = result.globalWorkingDir || '~'
      let dirs = result.recentDirs || ['~']

      // Try to merge with backend
      try {
        const res = await fetch(`${BACKEND_URL}/api/settings/working-dir`)
        const data = await res.json()
        if (data.success && data.data) {
          dir = data.data.globalWorkingDir || dir
          const apiDirs = data.data.recentDirs || []
          dirs = [...new Set([...apiDirs, ...dirs])].slice(0, 15)
        }
      } catch {
        // Backend not available
      }

      setGlobalWorkingDir(dir)
      setRecentDirs(dirs)
    })

    // Listen for changes
    const handleChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.globalWorkingDir?.newValue) {
        setGlobalWorkingDir(changes.globalWorkingDir.newValue)
      }
      if (changes.recentDirs?.newValue) {
        setRecentDirs(changes.recentDirs.newValue)
      }
    }

    chrome.storage.local.onChanged.addListener(handleChange)
    return () => chrome.storage.local.onChanged.removeListener(handleChange)
  }, [])

  // Set working directory
  const setWorkingDir = useCallback((dir: string) => {
    setGlobalWorkingDir(dir)

    // Add to recent
    setRecentDirs(prev => {
      const filtered = prev.filter(d => d !== dir)
      return [dir, ...filtered].slice(0, 15)
    })

    // Save to Chrome storage
    chrome.storage.local.set({
      globalWorkingDir: dir,
      recentDirs: [dir, ...recentDirs.filter(d => d !== dir)].slice(0, 15)
    })

    // Sync to backend
    fetch(`${BACKEND_URL}/api/settings/working-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalWorkingDir: dir })
    }).catch(() => {})
  }, [recentDirs])

  return { globalWorkingDir, recentDirs, setWorkingDir }
}
