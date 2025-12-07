import { useState, useEffect, useCallback } from 'react'

const MAX_HISTORY = 30

export function useCommandHistory() {
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1) // -1 = not browsing history
  const [tempInput, setTempInput] = useState('') // Saves current input when browsing

  // Load history from Chrome storage on mount
  useEffect(() => {
    chrome.storage.local.get(['commandHistory'], (result) => {
      if (result.commandHistory && Array.isArray(result.commandHistory)) {
        setHistory(result.commandHistory)
      }
    })
  }, [])

  // Save history to Chrome storage when it changes
  useEffect(() => {
    chrome.storage.local.set({ commandHistory: history })
  }, [history])

  // Add a command to history (deduplicates consecutive)
  const addToHistory = useCallback((command: string) => {
    if (!command.trim()) return

    setHistory(prev => {
      // Don't add if same as most recent
      if (prev[0] === command) return prev

      // Add to front, limit size
      const updated = [command, ...prev.filter(c => c !== command)].slice(0, MAX_HISTORY)
      return updated
    })

    // Reset browsing state
    setHistoryIndex(-1)
    setTempInput('')
  }, [])

  // Remove a command from history
  const removeFromHistory = useCallback((command: string) => {
    setHistory(prev => prev.filter(c => c !== command))
  }, [])

  // Navigate history (returns the command to display, or null if no change)
  const navigateHistory = useCallback((
    direction: 'up' | 'down',
    currentInput: string
  ): string | null => {
    if (history.length === 0) return null

    if (direction === 'up') {
      if (historyIndex === -1) {
        // Starting to browse - save current input
        setTempInput(currentInput)
        setHistoryIndex(0)
        return history[0]
      } else if (historyIndex < history.length - 1) {
        // Go further back in history
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        return history[newIndex]
      }
      // Already at oldest - no change
      return null
    } else {
      // direction === 'down'
      if (historyIndex > 0) {
        // Go forward (more recent)
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        return history[newIndex]
      } else if (historyIndex === 0) {
        // Back to current input
        setHistoryIndex(-1)
        return tempInput
      }
      // Not browsing history - no change
      return null
    }
  }, [history, historyIndex, tempInput])

  // Reset history navigation (call when input changes manually)
  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1)
    setTempInput('')
  }, [])

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([])
    setHistoryIndex(-1)
    setTempInput('')
  }, [])

  return {
    history,
    historyIndex,
    addToHistory,
    removeFromHistory,
    navigateHistory,
    resetNavigation,
    clearHistory,
  }
}
