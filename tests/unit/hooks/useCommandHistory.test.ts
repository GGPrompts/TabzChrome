import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCommandHistory } from '../../../extension/hooks/useCommandHistory'
import { setChromeStorageData, getChromeStorageData } from '../../setup'

describe('useCommandHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should start with empty history when storage is empty', async () => {
      const { result } = renderHook(() => useCommandHistory())

      expect(result.current.history).toEqual([])
      expect(result.current.historyIndex).toBe(-1)
    })

    it('should load history from Chrome storage on mount', async () => {
      const savedHistory = ['npm run dev', 'git status', 'claude']
      setChromeStorageData({ commandHistory: savedHistory })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toEqual(savedHistory)
      })
    })

    it('should handle invalid storage data gracefully', async () => {
      setChromeStorageData({ commandHistory: 'not-an-array' })

      const { result } = renderHook(() => useCommandHistory())

      // Should remain empty if data is invalid
      expect(result.current.history).toEqual([])
    })
  })

  describe('addToHistory', () => {
    it('should add command to front of history', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        result.current.addToHistory('npm run dev')
      })

      expect(result.current.history[0]).toBe('npm run dev')
    })

    it('should not add empty or whitespace-only commands', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        result.current.addToHistory('')
        result.current.addToHistory('   ')
        result.current.addToHistory('\t\n')
      })

      expect(result.current.history).toEqual([])
    })

    it('should not add duplicate if same as most recent', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        result.current.addToHistory('npm run dev')
        result.current.addToHistory('npm run dev')
      })

      expect(result.current.history).toHaveLength(1)
    })

    it('should deduplicate and move existing command to front', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        result.current.addToHistory('first')
        result.current.addToHistory('second')
        result.current.addToHistory('third')
        result.current.addToHistory('first') // Re-add first
      })

      expect(result.current.history).toEqual(['first', 'third', 'second'])
    })

    it('should limit history to MAX_HISTORY (30) items', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        for (let i = 0; i < 35; i++) {
          result.current.addToHistory(`command-${i}`)
        }
      })

      expect(result.current.history).toHaveLength(30)
      expect(result.current.history[0]).toBe('command-34') // Most recent
    })

    it('should reset history navigation after adding', async () => {
      setChromeStorageData({ commandHistory: ['old-command'] })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toHaveLength(1)
      })

      // Start browsing history
      act(() => {
        result.current.navigateHistory('up', 'current-input')
      })

      expect(result.current.historyIndex).toBe(0)

      // Add new command - should reset navigation
      act(() => {
        result.current.addToHistory('new-command')
      })

      expect(result.current.historyIndex).toBe(-1)
    })

    it('should persist to Chrome storage', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        result.current.addToHistory('npm run dev')
      })

      await waitFor(() => {
        const stored = getChromeStorageData()
        expect(stored.commandHistory).toContain('npm run dev')
      })
    })
  })

  describe('removeFromHistory', () => {
    it('should remove a specific command from history', async () => {
      setChromeStorageData({ commandHistory: ['first', 'second', 'third'] })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toHaveLength(3)
      })

      act(() => {
        result.current.removeFromHistory('second')
      })

      expect(result.current.history).toEqual(['first', 'third'])
    })

    it('should do nothing if command not found', async () => {
      setChromeStorageData({ commandHistory: ['first', 'second'] })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toHaveLength(2)
      })

      act(() => {
        result.current.removeFromHistory('nonexistent')
      })

      expect(result.current.history).toEqual(['first', 'second'])
    })
  })

  describe('navigateHistory', () => {
    describe('up navigation', () => {
      it('should return null if history is empty', async () => {
        const { result } = renderHook(() => useCommandHistory())

        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('up', 'current')
        })

        expect(command).toBeNull()
        expect(result.current.historyIndex).toBe(-1)
      })

      it('should save current input and return first history item on initial up', async () => {
        setChromeStorageData({ commandHistory: ['old-1', 'old-2'] })

        const { result } = renderHook(() => useCommandHistory())

        await waitFor(() => {
          expect(result.current.history).toHaveLength(2)
        })

        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('up', 'my-current-input')
        })

        expect(command).toBe('old-1')
        expect(result.current.historyIndex).toBe(0)
      })

      it('should navigate further back in history', async () => {
        setChromeStorageData({ commandHistory: ['recent', 'older', 'oldest'] })

        const { result } = renderHook(() => useCommandHistory())

        await waitFor(() => {
          expect(result.current.history).toHaveLength(3)
        })

        // Go up once
        act(() => {
          result.current.navigateHistory('up', 'current')
        })

        // Go up again
        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('up', 'current')
        })

        expect(command).toBe('older')
        expect(result.current.historyIndex).toBe(1)

        // Go up again
        act(() => {
          command = result.current.navigateHistory('up', 'current')
        })

        expect(command).toBe('oldest')
        expect(result.current.historyIndex).toBe(2)
      })

      it('should return null when already at oldest entry', async () => {
        setChromeStorageData({ commandHistory: ['only-one'] })

        const { result } = renderHook(() => useCommandHistory())

        await waitFor(() => {
          expect(result.current.history).toHaveLength(1)
        })

        // Go to oldest
        act(() => {
          result.current.navigateHistory('up', 'current')
        })

        // Try to go further - should return null
        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('up', 'current')
        })

        expect(command).toBeNull()
        expect(result.current.historyIndex).toBe(0) // Still at oldest
      })
    })

    describe('down navigation', () => {
      it('should return null if not browsing history', async () => {
        setChromeStorageData({ commandHistory: ['old-1'] })

        const { result } = renderHook(() => useCommandHistory())

        await waitFor(() => {
          expect(result.current.history).toHaveLength(1)
        })

        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('down', 'current')
        })

        expect(command).toBeNull()
      })

      it('should navigate forward to more recent commands', async () => {
        setChromeStorageData({ commandHistory: ['recent', 'older', 'oldest'] })

        const { result } = renderHook(() => useCommandHistory())

        await waitFor(() => {
          expect(result.current.history).toHaveLength(3)
        })

        // Go to oldest - separate act calls to allow state updates
        act(() => {
          result.current.navigateHistory('up', 'current')
        })
        act(() => {
          result.current.navigateHistory('up', 'current')
        })
        act(() => {
          result.current.navigateHistory('up', 'current')
        })

        expect(result.current.historyIndex).toBe(2)

        // Go down (forward)
        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('down', 'current')
        })

        expect(command).toBe('older')
        expect(result.current.historyIndex).toBe(1)
      })

      it('should restore saved input when navigating back to index -1', async () => {
        setChromeStorageData({ commandHistory: ['old-command'] })

        const { result } = renderHook(() => useCommandHistory())

        await waitFor(() => {
          expect(result.current.history).toHaveLength(1)
        })

        // Go up - saves "my-typing"
        act(() => {
          result.current.navigateHistory('up', 'my-typing')
        })

        // Go down - should restore "my-typing"
        let command: string | null = null
        act(() => {
          command = result.current.navigateHistory('down', 'ignored')
        })

        expect(command).toBe('my-typing')
        expect(result.current.historyIndex).toBe(-1)
      })
    })
  })

  describe('resetNavigation', () => {
    it('should reset historyIndex to -1', async () => {
      setChromeStorageData({ commandHistory: ['old-command'] })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toHaveLength(1)
      })

      // Navigate into history
      act(() => {
        result.current.navigateHistory('up', 'current')
      })

      expect(result.current.historyIndex).toBe(0)

      // Reset
      act(() => {
        result.current.resetNavigation()
      })

      expect(result.current.historyIndex).toBe(-1)
    })
  })

  describe('clearHistory', () => {
    it('should clear all history', async () => {
      setChromeStorageData({ commandHistory: ['cmd1', 'cmd2', 'cmd3'] })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toHaveLength(3)
      })

      act(() => {
        result.current.clearHistory()
      })

      expect(result.current.history).toEqual([])
      expect(result.current.historyIndex).toBe(-1)
    })

    it('should persist cleared history to storage', async () => {
      setChromeStorageData({ commandHistory: ['cmd1'] })

      const { result } = renderHook(() => useCommandHistory())

      await waitFor(() => {
        expect(result.current.history).toHaveLength(1)
      })

      act(() => {
        result.current.clearHistory()
      })

      await waitFor(() => {
        const stored = getChromeStorageData()
        expect(stored.commandHistory).toEqual([])
      })
    })
  })

  describe('storage synchronization', () => {
    it('should save history to storage on change', async () => {
      const { result } = renderHook(() => useCommandHistory())

      act(() => {
        result.current.addToHistory('new-command')
      })

      await waitFor(() => {
        const stored = getChromeStorageData()
        expect(stored.commandHistory).toEqual(['new-command'])
      })
    })
  })
})
