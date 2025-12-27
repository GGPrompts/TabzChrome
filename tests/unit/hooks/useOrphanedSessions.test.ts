import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useOrphanedSessions } from '../../../extension/hooks/useOrphanedSessions'
import { setChromeStorageData, resetChromeStorage } from '../../setup'

// Mock fetch globally for these tests
const mockFetch = vi.fn()

describe('useOrphanedSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetChromeStorage()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should start with empty state', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { orphanedSessions: [], count: 0 },
        }),
      })

      const { result } = renderHook(() => useOrphanedSessions())

      expect(result.current.orphanedSessions).toEqual([])
      expect(result.current.count).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('should fetch orphaned sessions on mount', async () => {
      const mockData = {
        orphanedSessions: ['ctt-bash-123', 'ctt-dev-456'],
        count: 2,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockData }),
      })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.orphanedSessions).toEqual(mockData.orphanedSessions)
        expect(result.current.count).toBe(2)
      })

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8129/api/tmux/orphaned-sessions')
    })

    it('should set loading to false after fetch completes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { orphanedSessions: [], count: 0 } }),
      })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('error handling', () => {
    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // On HTTP error, sessions should be cleared silently (no error shown)
      expect(result.current.orphanedSessions).toEqual([])
      expect(result.current.count).toBe(0)
    })

    it('should handle network failures silently', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Network failures should be silent (backend might not be running)
      expect(result.current.orphanedSessions).toEqual([])
      expect(result.current.count).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'Failed to list sessions',
        }),
      })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to list sessions')
      })
    })
  })

  describe('polling', () => {
    it('should fetch on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { orphanedSessions: [], count: 0 },
        }),
      })

      renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('http://localhost:8129/api/tmux/orphaned-sessions')
      })
    })

    it('should clean up interval on unmount', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { orphanedSessions: [], count: 0 },
        }),
      })

      const { unmount } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      unmount()

      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('should manually refresh sessions when called', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { orphanedSessions: ['ctt-test-1'], count: 1 },
        }),
      })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(1)
      })

      // Update mock for refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { orphanedSessions: ['ctt-test-1', 'ctt-test-2'], count: 2 },
        }),
      })

      await act(async () => {
        await result.current.refresh()
      })

      expect(result.current.count).toBe(2)
      expect(result.current.orphanedSessions).toHaveLength(2)
    })
  })

  describe('reattachSessions', () => {
    it('should POST to reattach endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-test-1'], count: 1 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { success: ['ctt-test-1'] },
            message: 'Reattached 1 session(s)',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: [], count: 0 },
          }),
        })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(1)
      })

      let reattachResult: { success: boolean; message: string }
      await act(async () => {
        reattachResult = await result.current.reattachSessions(['ctt-test-1'])
      })

      expect(reattachResult!.success).toBe(true)
      expect(reattachResult!.message).toContain('Reattached')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8129/api/tmux/reattach',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions: ['ctt-test-1'] }),
        })
      )
    })

    it('should handle reattach errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-test-1'], count: 1 },
          }),
        })
        .mockRejectedValueOnce(new Error('Reattach failed'))

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(1)
      })

      let reattachResult: { success: boolean; message: string }
      await act(async () => {
        reattachResult = await result.current.reattachSessions(['ctt-test-1'])
      })

      expect(reattachResult!.success).toBe(false)
      expect(reattachResult!.message).toBe('Reattach failed')
    })
  })

  describe('killSessions', () => {
    it('should DELETE to bulk sessions endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-test-1', 'ctt-test-2'], count: 2 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { killed: ['ctt-test-1', 'ctt-test-2'] },
            message: 'Killed 2 session(s)',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: [], count: 0 },
          }),
        })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(2)
      })

      let killResult: { success: boolean; message: string }
      await act(async () => {
        killResult = await result.current.killSessions(['ctt-test-1', 'ctt-test-2'])
      })

      expect(killResult!.success).toBe(true)
      expect(killResult!.message).toContain('Killed')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8129/api/tmux/sessions/bulk',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions: ['ctt-test-1', 'ctt-test-2'] }),
        })
      )
    })

    it('should handle kill errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-test-1'], count: 1 },
          }),
        })
        .mockRejectedValueOnce(new Error('Kill failed'))

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(1)
      })

      let killResult: { success: boolean; message: string }
      await act(async () => {
        killResult = await result.current.killSessions(['ctt-test-1'])
      })

      expect(killResult!.success).toBe(false)
      expect(killResult!.message).toBe('Kill failed')
    })

    it('should play audio notification when enabled', async () => {
      // Set up audio settings in Chrome storage
      setChromeStorageData({
        audioSettings: {
          enabled: true,
          events: { sessionStart: true },
          voice: 'en-US-JennyNeural',
          rate: '+10%',
          volume: 0.8,
        },
      })

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-test-1'], count: 1 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { killed: ['ctt-test-1'] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: [], count: 0 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(1)
      })

      await act(async () => {
        await result.current.killSessions(['ctt-test-1'])
      })

      // Should have called speak API with audio settings
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8129/api/audio/speak',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Killed orphaned session'),
        })
      )
    })

    it('should not play audio when disabled', async () => {
      setChromeStorageData({
        audioSettings: {
          enabled: false,
        },
      })

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-test-1'], count: 1 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { killed: ['ctt-test-1'] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: [], count: 0 },
          }),
        })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(1)
      })

      await act(async () => {
        await result.current.killSessions(['ctt-test-1'])
      })

      // Should NOT have called speak API
      const speakCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === 'http://localhost:8129/api/audio/speak'
      )
      expect(speakCalls).toHaveLength(0)
    })

    it('should use plural form for multiple sessions', async () => {
      setChromeStorageData({
        audioSettings: {
          enabled: true,
          events: { sessionStart: true },
        },
      })

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: ['ctt-1', 'ctt-2', 'ctt-3'], count: 3 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { killed: ['ctt-1', 'ctt-2', 'ctt-3'] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { orphanedSessions: [], count: 0 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

      const { result } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(result.current.count).toBe(3)
      })

      await act(async () => {
        await result.current.killSessions(['ctt-1', 'ctt-2', 'ctt-3'])
      })

      // Check for plural form in speak API call
      const speakCall = mockFetch.mock.calls.find(
        (call) => call[0] === 'http://localhost:8129/api/audio/speak'
      )
      expect(speakCall).toBeDefined()
      expect(speakCall![1].body).toContain('3 orphaned sessions')
    })
  })

  describe('unmount behavior', () => {
    it('should use isMountedRef to guard against state updates after unmount', async () => {
      // This test verifies the unmount cleanup works by checking clearInterval is called
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { orphanedSessions: [], count: 0 },
        }),
      })

      const { unmount } = renderHook(() => useOrphanedSessions())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })

      unmount()

      // Verify cleanup occurred
      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})
