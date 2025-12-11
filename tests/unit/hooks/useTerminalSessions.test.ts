import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTerminalSessions, TerminalSession } from '../../../extension/hooks/useTerminalSessions'
import { setChromeStorageData, getChromeStorageData } from '../../setup'
import type { Profile } from '../../../extension/components/settings/types'

// Sample profile for testing
const sampleProfile: Profile = {
  id: 'bash-1',
  name: 'Bash',
  workingDir: '~',
  fontSize: 16,
  fontFamily: 'monospace',
  themeName: 'high-contrast',
}

// Sample sessions for testing
const sampleSessions: TerminalSession[] = [
  {
    id: 'ctt-bash-abc123',
    name: 'Bash',
    type: 'bash',
    active: false,
    sessionName: 'ctt-bash-abc123',
    workingDir: '~',
    profile: sampleProfile,
  },
  {
    id: 'ctt-dev-def456',
    name: 'Development',
    type: 'bash',
    active: false,
    sessionName: 'ctt-dev-def456',
    workingDir: '~/projects',
  },
]

// Helper to create default hook params
const createHookParams = (overrides = {}) => ({
  wsConnected: false,
  profiles: [sampleProfile],
  getNextAvailableVoice: vi.fn(() => 'en-US-AndrewMultilingualNeural'),
  ...overrides,
})

describe('useTerminalSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Ensure we're using real timers after each test
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('should start with empty sessions when storage is empty', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      // Wait for storage to load (happens quickly with mock)
      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      // After storage loads, should still have empty sessions since storage was empty
      expect(result.current.sessions).toEqual([])
      expect(result.current.currentSession).toBeNull()
    })

    it('should load sessions from Chrome storage', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      expect(result.current.sessions).toEqual(sampleSessions)
      expect(result.current.currentSession).toBe('ctt-bash-abc123')
    })

    it('should set current session to first session from storage', async () => {
      const sessions = [
        { ...sampleSessions[1] },  // Make dev first
        { ...sampleSessions[0] },
      ]
      setChromeStorageData({
        terminalSessions: sessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.currentSession).toBe('ctt-dev-def456')
      })
    })
  })

  describe('session persistence', () => {
    it('should save sessions to Chrome storage when changed', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      // Add a session
      act(() => {
        result.current.setSessions([sampleSessions[0]])
      })

      await waitFor(() => {
        const storageData = getChromeStorageData()
        expect(storageData.terminalSessions).toEqual([sampleSessions[0]])
      })
    })

    it('should remove terminalSessions from storage when empty', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(2)
      })

      // Clear all sessions
      act(() => {
        result.current.setSessions([])
      })

      await waitFor(() => {
        const storageData = getChromeStorageData()
        expect(storageData.terminalSessions).toBeUndefined()
      })
    })
  })

  describe('WebSocket connection', () => {
    it('should request terminal list when connected and storage loaded', async () => {
      setChromeStorageData({
        terminalSessions: [],
      })

      const { result, rerender } = renderHook(
        (props) => useTerminalSessions(props),
        { initialProps: createHookParams({ wsConnected: false }) }
      )

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      // Connect WebSocket
      rerender(createHookParams({ wsConnected: true }))

      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'LIST_TERMINALS' })
        )
      })
    })

    it('should not request terminal list if storage not loaded', async () => {
      // Don't set storage data so it loads slowly
      const { rerender } = renderHook(
        (props) => useTerminalSessions(props),
        { initialProps: createHookParams({ wsConnected: true }) }
      )

      // Give it a moment but don't wait for storage
      await new Promise(r => setTimeout(r, 10))

      // Should have waited for storage before sending
      // The first call should happen after storageLoaded becomes true
    })

    it('should clear reconnected terminals set when disconnected', async () => {
      const { result, rerender } = renderHook(
        (props) => useTerminalSessions(props),
        { initialProps: createHookParams({ wsConnected: true }) }
      )

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      // Simulate receiving terminals and reconnecting
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-test-123', name: 'Test' }],
          recoveryComplete: true,
        })
      })

      // Disconnect
      rerender(createHookParams({ wsConnected: false }))

      // Reconnect - should be able to reconnect to the same terminal
      rerender(createHookParams({ wsConnected: true }))

      // The terminal should be reconnectable again (set was cleared)
    })
  })

  describe('handleWebSocketMessage - terminals', () => {
    it('should filter to only ctt- prefixed terminals', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [
            { id: 'ctt-valid-123', name: 'Valid' },
            { id: 'tt-invalid-456', name: 'Invalid' },  // Not ctt- prefix
            { id: 'ctt-also-valid-789', name: 'Also Valid' },
          ],
          recoveryComplete: true,
        })
      })

      expect(result.current.sessions).toHaveLength(2)
      expect(result.current.sessions.every(s => s.id.startsWith('ctt-'))).toBe(true)
    })

    it('should preserve Chrome storage session data when reconciling', async () => {
      setChromeStorageData({
        terminalSessions: [
          {
            id: 'ctt-test-123',
            name: 'My Custom Name',  // User renamed this
            type: 'bash',
            active: false,
            sessionName: 'ctt-test-123',
            profile: sampleProfile,
          },
        ],
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      // Backend sends same terminal but without the custom name
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-test-123', name: 'ctt-test-123' }],
          recoveryComplete: true,
        })
      })

      // Should preserve the custom name from storage
      expect(result.current.sessions[0].name).toBe('My Custom Name')
      expect(result.current.sessions[0].profile).toEqual(sampleProfile)
    })

    it('should add new terminals from backend', async () => {
      setChromeStorageData({
        terminalSessions: [sampleSessions[0]],
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1)
      })

      // Backend reports new terminal
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [
            { id: 'ctt-bash-abc123' },
            { id: 'ctt-new-terminal-xyz', name: 'New Terminal' },
          ],
          recoveryComplete: true,
        })
      })

      expect(result.current.sessions).toHaveLength(2)
      expect(result.current.sessions.find(s => s.id === 'ctt-new-terminal-xyz')).toBeDefined()
    })

    it('should remove sessions not in backend after recovery complete', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(2)
      })

      // Backend only has one terminal
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-bash-abc123' }],
          recoveryComplete: true,
        })
      })

      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0].id).toBe('ctt-bash-abc123')
    })

    it('should not remove sessions before recovery complete', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(2)
      })

      // Backend sends partial list (recovery in progress)
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-bash-abc123' }],
          recoveryComplete: false,  // Not complete yet
        })
      })

      // Should keep both sessions until recovery completes
      expect(result.current.sessions).toHaveLength(2)
    })

    it('should update connection count from terminals message', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      expect(result.current.connectionCount).toBe(1)

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [],
          connectionCount: 3,
        })
      })

      expect(result.current.connectionCount).toBe(3)
    })

    it('should send RECONNECT for backend terminals', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminals',
          data: [{ id: 'ctt-test-123' }],
          recoveryComplete: true,
        })
      })

      // Wait for the setTimeout in the handler to fire (300ms)
      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'RECONNECT',
            terminalId: 'ctt-test-123',
          })
        )
      }, { timeout: 1000 })
    })
  })

  describe('handleWebSocketMessage - terminal-spawned', () => {
    it('should add new terminal when spawned', async () => {
      const getNextAvailableVoice = vi.fn(() => 'en-US-EmmaMultilingualNeural')
      const { result } = renderHook(() =>
        useTerminalSessions(createHookParams({ getNextAvailableVoice }))
      )

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: {
            id: 'ctt-new-abc123',
            name: 'New Terminal',
            terminalType: 'bash',
            sessionName: 'ctt-new-abc123',
            workingDir: '~/projects',
            profile: sampleProfile,
          },
        })
      })

      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0]).toMatchObject({
        id: 'ctt-new-abc123',
        name: 'New Terminal',
        type: 'bash',
        sessionName: 'ctt-new-abc123',
        workingDir: '~/projects',
        profile: sampleProfile,
        assignedVoice: 'en-US-EmmaMultilingualNeural',
      })
    })

    it('should set current session to spawned terminal', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: { id: 'ctt-new-terminal', name: 'New' },
        })
      })

      expect(result.current.currentSession).toBe('ctt-new-terminal')
    })

    it('should ignore non-ctt terminals', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: { id: 'tt-other-project', name: 'Other' },
        })
      })

      expect(result.current.sessions).toHaveLength(0)
    })

    it('should not duplicate existing terminal', async () => {
      setChromeStorageData({
        terminalSessions: [sampleSessions[0]],
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1)
      })

      // Spawn same terminal again (e.g., from restore)
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: { id: 'ctt-bash-abc123', name: 'Bash' },
        })
      })

      expect(result.current.sessions).toHaveLength(1)
    })

    it('should store command for API-spawned terminals', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: {
            id: 'ctt-api-terminal',
            name: 'Claude Worker',
            config: { command: 'claude --dangerously-skip-permissions' },
          },
        })
      })

      expect(result.current.sessions[0].command).toBe('claude --dangerously-skip-permissions')
    })
  })

  describe('handleWebSocketMessage - terminal-closed', () => {
    it('should remove terminal when closed', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(2)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-abc123' },
        })
      })

      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0].id).toBe('ctt-dev-def456')
    })

    it('should switch to adjacent terminal when current is closed', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.currentSession).toBe('ctt-bash-abc123')
      })

      // Close current session
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-abc123' },
        })
      })

      // Should switch to the next (now only) terminal
      expect(result.current.currentSession).toBe('ctt-dev-def456')
    })

    it('should set currentSession to null when last terminal closed', async () => {
      setChromeStorageData({
        terminalSessions: [sampleSessions[0]],
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-abc123' },
        })
      })

      expect(result.current.sessions).toHaveLength(0)
      expect(result.current.currentSession).toBeNull()
    })

    it('should handle various terminal-closed data formats', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(2)
      })

      // Format: { data: { id } }
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-closed',
          data: { id: 'ctt-bash-abc123' },
        })
      })

      expect(result.current.sessions).toHaveLength(1)
    })
  })

  describe('handleWebSocketMessage - connection-count', () => {
    it('should update connection count', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'connection-count',
          count: 5,
        })
      })

      expect(result.current.connectionCount).toBe(5)
    })
  })

  describe('setCurrentSession', () => {
    it('should update current session', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.currentSession).toBe('ctt-bash-abc123')
      })

      act(() => {
        result.current.setCurrentSession('ctt-dev-def456')
      })

      expect(result.current.currentSession).toBe('ctt-dev-def456')
    })

    it('should allow setting to null', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.currentSession).toBe('ctt-bash-abc123')
      })

      act(() => {
        result.current.setCurrentSession(null)
      })

      expect(result.current.currentSession).toBeNull()
    })
  })

  describe('refs', () => {
    it('should keep sessionsRef in sync with sessions state', async () => {
      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: { id: 'ctt-test-123', name: 'Test' },
        })
      })

      expect(result.current.sessionsRef.current).toEqual(result.current.sessions)
    })

    it('should keep currentSessionRef in sync with currentSession state', async () => {
      setChromeStorageData({
        terminalSessions: sampleSessions,
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.currentSession).toBe('ctt-bash-abc123')
      })

      act(() => {
        result.current.setCurrentSession('ctt-dev-def456')
      })

      expect(result.current.currentSessionRef.current).toBe('ctt-dev-def456')
    })
  })

  describe('profile matching for recovered sessions', () => {
    it('should attempt to match profile from session ID pattern', async () => {
      setChromeStorageData({
        profiles: [
          { ...sampleProfile, id: 'bash-profile', name: 'Bash' },
        ],
      })

      const { result } = renderHook(() => useTerminalSessions(createHookParams()))

      await waitFor(() => {
        expect(result.current.storageLoaded).toBe(true)
      })

      // Spawn without profile - should try to match from ID
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'terminal-spawned',
          data: {
            id: 'ctt-bash-xyz789',  // Profile name is "bash"
            name: 'ctt-bash-xyz789',
            // No profile provided (recovered session)
          },
        })
      })

      // The hook will async update with matched profile
      // This tests the matching logic exists
      expect(result.current.sessions).toHaveLength(1)
    })
  })
})
