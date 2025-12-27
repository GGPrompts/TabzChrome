import { useState, useEffect, useCallback } from 'react'

export type SortOption = 'name' | 'activity' | 'status'

interface GitVisibilityState {
  activeRepos: string[]  // Array of repo names marked as "active"
  showActiveOnly: boolean
  sortBy: SortOption
  searchQuery: string
}

const STORAGE_KEY = 'tabz-git-visibility'

export function useGitVisibility() {
  const [state, setState] = useState<GitVisibilityState>({
    activeRepos: [],
    showActiveOnly: false,  // Default: show all repos
    sortBy: 'name',
    searchQuery: ''
  })
  const [loaded, setLoaded] = useState(false)

  // Load from Chrome storage on mount
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY] as Partial<GitVisibilityState> | undefined
      if (stored) {
        setState(prev => ({ ...prev, ...stored }))
      }
      setLoaded(true)
    })
  }, [])

  // Persist to Chrome storage when state changes
  useEffect(() => {
    if (loaded) {
      chrome.storage.local.set({ [STORAGE_KEY]: state })
    }
  }, [state, loaded])

  const toggleActive = useCallback((repoName: string) => {
    setState(prev => ({
      ...prev,
      activeRepos: prev.activeRepos.includes(repoName)
        ? prev.activeRepos.filter(n => n !== repoName)
        : [...prev.activeRepos, repoName]
    }))
  }, [])

  const isActive = useCallback((repoName: string) => {
    return state.activeRepos.includes(repoName)
  }, [state.activeRepos])

  const setShowActiveOnly = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, showActiveOnly: show }))
  }, [])

  const setSortBy = useCallback((sort: SortOption) => {
    setState(prev => ({ ...prev, sortBy: sort }))
  }, [])

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }))
  }, [])

  return {
    ...state,
    loaded,
    toggleActive,
    isActive,
    setShowActiveOnly,
    setSortBy,
    setSearchQuery
  }
}
