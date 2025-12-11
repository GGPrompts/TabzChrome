/**
 * Terminal Lifecycle Integration Tests
 *
 * Tests the critical user flow:
 * 1. Spawn terminal -> session saved to Chrome storage
 * 2. Close sidebar -> sessions persist in storage
 * 3. Reopen sidebar -> sessions restored from storage
 * 4. WebSocket reconnects -> terminals reconciled with backend
 *
 * These tests verify STATE FLOW, not individual functions.
 * Uses the Chrome mock from tests/setup.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTerminalSessions, type TerminalSession } from '../../extension/hooks/useTerminalSessions'
import type { Profile } from '../../extension/components/settings/types'
import { resetChromeStorage, setChromeStorageData, getChromeStorageData } from '../setup'

// ============================================
// Test Setup
// ============================================

describe('Terminal Lifecycle Integration', () => {
  // Track messages sent via chrome.runtime.sendMessage
  let sentMessages: Array<{ type: string; [key: string]: unknown }> = []

  beforeEach(() => {
    // Reset storage and message tracking
    resetChromeStorage()
    sentMessages = []

    // Mock chrome.runtime.sendMessage to capture sent messages
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg: unknown) => {
      sentMessages.push(msg as { type: string; [key: string]: unknown })
      return Promise.resolve(null)
    })

    vi.useFakeTimers()
  })

  // ============================================
  // Test: Terminal Spawn -> Storage Persistence
  // ============================================

  describe('Terminal Spawn and Persistence', () => {
    it('should save new terminal session to Chrome storage', async () => {
      const mockProfiles: Profile[] = [
        {
          id: 'profile-1',
          name: 'Bash',
          workingDir: '~/projects',
          fontSize: 16,
          fontFamily: 'monospace',
          themeName: 'high-contrast',
        },
      ]

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: mockProfiles,
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      // Wait for storage to load
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(result.current.storageLoaded).toBe(true)

      // Simulate terminal-spawned message from backend
      const spawnedTerminal = {
        id: 'ctt-bash-abc123',
        name: 'Bash',
        terminalType: 'bash',
        sessionName: 'ctt-bash-abc123',
        workingDir: '/home/user/projects',
        profile: mockProfiles[0],
      }

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: spawnedTerminal,
        })
      })

      // Verify session was added
      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0].id).toBe('ctt-bash-abc123')
      expect(result.current.sessions[0].name).toBe('Bash')
      expect(result.current.currentSession).toBe('ctt-bash-abc123')

      // Wait for storage save effect
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Verify Chrome storage was updated
      const storageData = getChromeStorageData()
      expect(storageData.terminalSessions).toBeDefined()
      expect(storageData.terminalSessions).toHaveLength(1)
      expect(storageData.terminalSessions[0].id).toBe('ctt-bash-abc123')
    })

    it('should ignore non-ctt prefixed terminals', async () => {
      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Simulate terminal from another project (web app)
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: {
            id: 'tt-some-web-terminal',
            name: 'Web Terminal',
            terminalType: 'bash',
          },
        })
      })

      // Should not add non-ctt terminal
      expect(result.current.sessions).toHaveLength(0)
    })
  })

  // ============================================
  // Test: Storage Restoration on Sidebar Reopen
  // ============================================

  describe('Session Restoration', () => {
    it('should restore sessions from Chrome storage on mount', async () => {
      // Pre-populate storage with saved sessions
      const savedSessions: TerminalSession[] = [
        {
          id: 'ctt-bash-saved1',
          name: 'Saved Terminal 1',
          type: 'bash',
          active: false,
          sessionName: 'ctt-bash-saved1',
        },
        {
          id: 'ctt-bash-saved2',
          name: 'Saved Terminal 2',
          type: 'bash',
          active: false,
          sessionName: 'ctt-bash-saved2',
        },
      ]
      setChromeStorageData({ terminalSessions: savedSessions })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: false, // Not connected yet
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      // Wait for storage load
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Sessions should be restored
      expect(result.current.sessions).toHaveLength(2)
      expect(result.current.sessions[0].id).toBe('ctt-bash-saved1')
      expect(result.current.sessions[1].id).toBe('ctt-bash-saved2')
      expect(result.current.currentSession).toBe('ctt-bash-saved1')
      expect(result.current.storageLoaded).toBe(true)
    })

    it('should set first session as current when restoring', async () => {
      setChromeStorageData({
        terminalSessions: [
          { id: 'ctt-first', name: 'First', type: 'bash', active: false },
          { id: 'ctt-second', name: 'Second', type: 'bash', active: false },
        ],
      })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: false,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(result.current.currentSession).toBe('ctt-first')
    })
  })

  // ============================================
  // Test: WebSocket Reconnect and Backend Reconciliation
  // ============================================

  describe('Backend Reconciliation', () => {
    it('should reconcile stored sessions with backend on connect', async () => {
      // Sessions in Chrome storage (from previous sidebar session)
      const storedSessions: TerminalSession[] = [
        { id: 'ctt-bash-exists', name: 'Exists', type: 'bash', active: false },
        { id: 'ctt-bash-gone', name: 'Gone', type: 'bash', active: false },
      ]
      setChromeStorageData({ terminalSessions: storedSessions })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      // Wait for storage load
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(result.current.sessions).toHaveLength(2)

      // Simulate 'terminals' message from backend (only one terminal still exists)
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [
            { id: 'ctt-bash-exists', name: 'Exists', terminalType: 'bash', sessionName: 'ctt-bash-exists' },
          ],
          recoveryComplete: true, // Backend has finished recovery
        })
      })

      // Advance timers for reconnect and refresh
      await act(async () => {
        vi.advanceTimersByTime(2000)
      })

      // Should remove the session that no longer exists in backend
      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0].id).toBe('ctt-bash-exists')
    })

    it('should preserve stored session names when reconciling', async () => {
      // Session with custom name stored
      setChromeStorageData({
        terminalSessions: [
          { id: 'ctt-bash-123', name: 'My Custom Name', type: 'bash', active: false },
        ],
      })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Backend returns same terminal but with generic name
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [
            { id: 'ctt-bash-123', name: 'Terminal', terminalType: 'bash' },
          ],
          recoveryComplete: true,
        })
      })

      await act(async () => {
        vi.advanceTimersByTime(2000)
      })

      // Name from Chrome storage should be preserved
      expect(result.current.sessions[0].name).toBe('My Custom Name')
    })

    it('should send RECONNECT for each backend terminal', async () => {
      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Clear previous messages
      sentMessages = []

      // Simulate backend terminals list
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [
            { id: 'ctt-bash-1', name: 'Terminal 1', terminalType: 'bash' },
            { id: 'ctt-bash-2', name: 'Terminal 2', terminalType: 'bash' },
          ],
          recoveryComplete: true,
        })
      })

      // Advance past the 300ms delay
      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // Should have sent RECONNECT for each terminal
      const reconnectMessages = sentMessages.filter(m => m.type === 'RECONNECT')
      expect(reconnectMessages).toHaveLength(2)
      expect(reconnectMessages.map(m => m.terminalId)).toEqual(['ctt-bash-1', 'ctt-bash-2'])
    })

    it('should not duplicate RECONNECT messages', async () => {
      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      sentMessages = []

      // First terminals message
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-bash-1', name: 'Terminal 1', terminalType: 'bash' }],
          recoveryComplete: true,
        })
      })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // Second terminals message (e.g., from badge update)
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-bash-1', name: 'Terminal 1', terminalType: 'bash' }],
          recoveryComplete: true,
        })
      })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // Should only have ONE reconnect for the terminal (deduped)
      const reconnectMessages = sentMessages.filter(m => m.type === 'RECONNECT')
      expect(reconnectMessages).toHaveLength(1)
    })
  })

  // ============================================
  // Test: Terminal Close
  // ============================================

  describe('Terminal Close', () => {
    it('should remove terminal from sessions on close', async () => {
      setChromeStorageData({
        terminalSessions: [
          { id: 'ctt-bash-1', name: 'Terminal 1', type: 'bash', active: false },
          { id: 'ctt-bash-2', name: 'Terminal 2', type: 'bash', active: false },
        ],
      })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(result.current.sessions).toHaveLength(2)

      // Close first terminal
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-1' },
        })
      })

      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0].id).toBe('ctt-bash-2')
    })

    it('should switch to next terminal when current is closed', async () => {
      setChromeStorageData({
        terminalSessions: [
          { id: 'ctt-bash-1', name: 'Terminal 1', type: 'bash', active: false },
          { id: 'ctt-bash-2', name: 'Terminal 2', type: 'bash', active: false },
          { id: 'ctt-bash-3', name: 'Terminal 3', type: 'bash', active: false },
        ],
      })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Current should be first terminal
      expect(result.current.currentSession).toBe('ctt-bash-1')

      // Close current (first) terminal
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-1' },
        })
      })

      // Should switch to next terminal (index 0 after removal = ctt-bash-2)
      expect(result.current.currentSession).toBe('ctt-bash-2')
    })

    it('should clear storage when last terminal is closed', async () => {
      setChromeStorageData({
        terminalSessions: [
          { id: 'ctt-bash-1', name: 'Last Terminal', type: 'bash', active: false },
        ],
      })

      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Close the only terminal
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-1' },
        })
      })

      expect(result.current.sessions).toHaveLength(0)
      expect(result.current.currentSession).toBeNull()

      // Storage should be cleared
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(chrome.storage.local.remove).toHaveBeenCalledWith('terminalSessions')
    })
  })

  // ============================================
  // Test: Request LIST_TERMINALS on WebSocket Connect
  // ============================================

  describe('LIST_TERMINALS Request', () => {
    it('should request terminal list when WebSocket connects and storage is loaded', async () => {
      const { rerender } = renderHook(
        ({ wsConnected }) =>
          useTerminalSessions({
            wsConnected,
            profiles: [],
            getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
          }),
        { initialProps: { wsConnected: false } }
      )

      // Wait for storage to load
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      sentMessages = []

      // WebSocket connects
      rerender({ wsConnected: true })

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Should have sent LIST_TERMINALS
      const listMessages = sentMessages.filter(m => m.type === 'LIST_TERMINALS')
      expect(listMessages).toHaveLength(1)
    })

    it('should not send duplicate LIST_TERMINALS on rapid prop changes', async () => {
      const { rerender } = renderHook(
        ({ wsConnected }) =>
          useTerminalSessions({
            wsConnected,
            profiles: [],
            getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
          }),
        { initialProps: { wsConnected: false } }
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      sentMessages = []

      // Rapid prop changes (simulates React re-renders)
      rerender({ wsConnected: true })
      rerender({ wsConnected: true })
      rerender({ wsConnected: true })

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Should only send ONE LIST_TERMINALS despite multiple renders
      const listMessages = sentMessages.filter(m => m.type === 'LIST_TERMINALS')
      expect(listMessages).toHaveLength(1)
    })
  })

  // ============================================
  // Test: Connection Count Tracking
  // ============================================

  describe('Connection Count', () => {
    it('should track connection count from terminals message', async () => {
      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Initial count should be 1
      expect(result.current.connectionCount).toBe(1)

      // Simulate terminals message with connection count
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [],
          connectionCount: 2,
        })
      })

      expect(result.current.connectionCount).toBe(2)
    })

    it('should update connection count from standalone message', async () => {
      const { result } = renderHook(() =>
        useTerminalSessions({
          wsConnected: true,
          profiles: [],
          getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
        })
      )

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'connection-count',
          count: 3,
        })
      })

      expect(result.current.connectionCount).toBe(3)
    })
  })
})
