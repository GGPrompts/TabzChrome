import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useWebSocketManager } from '@/hooks/useWebSocketManager'
import { Terminal } from '@/stores/simpleTerminalStore'
import { MockWebSocket } from '../../mocks/MockWebSocket'

/**
 * Unit tests for useWebSocketManager - Multi-Window Terminal Filtering
 *
 * CRITICAL: These tests verify window isolation to prevent cross-window contamination.
 * See CLAUDE.md "Critical Architecture (Popout Flow)" for details.
 *
 * Test Coverage Focus:
 * - Terminal spawn events filtering by windowId
 * - Fast-spawning terminals (bash) matching correctly across windows
 * - Reconnection filtering after refresh
 * - WebSocket message routing with window isolation
 */

describe('useWebSocketManager - Multi-Window Filtering', () => {
  let mockWs: MockWebSocket
  let wsRef: React.MutableRefObject<WebSocket | null>
  let mockUpdateTerminal: ReturnType<typeof vi.fn>
  let mockRemoveTerminal: ReturnType<typeof vi.fn>
  let mockSetActiveTerminal: ReturnType<typeof vi.fn>
  let mockHandleReconnectTerminal: ReturnType<typeof vi.fn>
  let pendingSpawns: React.MutableRefObject<Map<string, Terminal>>
  let originalWebSocket: typeof WebSocket

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()

    // Save original WebSocket
    originalWebSocket = global.WebSocket

    // Create mock WebSocket instance that we can control
    mockWs = new MockWebSocket('ws://localhost:8127')

    // Mock WebSocket constructor to return our controlled instance
    // Use a function constructor to make vi.fn() happy
    global.WebSocket = function(url: string) {
      return mockWs
    } as any

    // Create wsRef (will be populated by hook)
    wsRef = { current: null }

    // Create mock functions
    mockUpdateTerminal = vi.fn()
    mockRemoveTerminal = vi.fn()
    mockSetActiveTerminal = vi.fn()
    mockHandleReconnectTerminal = vi.fn()

    // Create pending spawns ref
    pendingSpawns = { current: new Map() }

    // Mock SimpleSpawnService
    vi.mock('@/services/SimpleSpawnService', () => ({
      default: {
        initialize: vi.fn(),
      },
    }))
  })

  afterEach(() => {
    // Cleanup
    if (mockWs) {
      mockWs.close()
    }
    // Restore original WebSocket
    global.WebSocket = originalWebSocket
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  /**
   * Helper: Create a mock terminal
   */
  const createMockTerminal = (
    id: string,
    windowId: string = 'main',
    terminalType: string = 'bash',
    status: Terminal['status'] = 'spawning'
  ): Terminal => ({
    id,
    name: `Terminal ${id}`,
    terminalType,
    command: 'bash',
    icon: '💻',
    createdAt: Date.now(),
    status,
    windowId,
  })

  /**
   * Helper: Render hook with default params
   */
  const renderWebSocketManager = (
    currentWindowId: string = 'main',
    storedTerminals: Terminal[] = [],
    activeTerminalId: string | null = null,
    spawnOptions: any[] = [],
    useTmux: boolean = true
  ) => {
    const spawnOptionsRef = { current: spawnOptions }

    return renderHook(() =>
      useWebSocketManager(
        currentWindowId,
        storedTerminals,
        activeTerminalId,
        spawnOptions,
        spawnOptionsRef,
        useTmux,
        pendingSpawns,
        wsRef,
        mockUpdateTerminal,
        mockRemoveTerminal,
        mockSetActiveTerminal,
        mockHandleReconnectTerminal
      )
    )
  }

  describe('Terminal Spawned Event Filtering', () => {
    it('should accept terminal-spawned event from same window (main)', async () => {
      // SETUP: Terminal spawning in main window
      const terminal = createMockTerminal('terminal-1', 'main', 'bash', 'spawning')
      terminal.requestId = 'request-1'

      const { result } = renderWebSocketManager('main', [terminal])

      // Open WebSocket connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for WebSocket to connect
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      }, { timeout: 2000 })

      // SIMULATE: Backend sends terminal-spawned event
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'request-1',
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-xyz',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // VERIFY: Terminal is added to webSocketAgents
      await waitFor(() => {
        expect(result.current.webSocketAgents).toHaveLength(1)
      }, { timeout: 2000 })

      expect(result.current.webSocketAgents[0].id).toBe('agent-1')

      // VERIFY: updateTerminal was called with windowId preserved
      expect(mockUpdateTerminal).toHaveBeenCalledWith('terminal-1',
        expect.objectContaining({
          agentId: 'agent-1',
          windowId: 'main', // CRITICAL: Preserved
        })
      )
    })

    it('should ignore terminal-spawned event from different window', async () => {
      // SETUP: Terminal spawning in window-1, but we're viewing main
      const terminal = createMockTerminal('terminal-1', 'window-1', 'bash', 'spawning')
      terminal.requestId = 'request-1'

      const { result } = renderWebSocketManager('main', [terminal])

      // Open WebSocket connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for WebSocket to connect
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: Backend sends terminal-spawned event for terminal in window-1
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'request-1',
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-xyz',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      // VERIFY: Terminal is NOT added to webSocketAgents (window mismatch)
      expect(result.current.webSocketAgents).toHaveLength(0)

      // VERIFY: updateTerminal was NOT called (event ignored)
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })

    it('should accept terminal-spawned event in correct popout window', async () => {
      // SETUP: Terminal spawning in window-123, viewing window-123
      const terminal = createMockTerminal('terminal-1', 'window-123', 'bash', 'spawning')
      terminal.requestId = 'request-1'

      const { result } = renderWebSocketManager('window-123', [terminal])

      // Open WebSocket connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for WebSocket to connect
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: Backend sends terminal-spawned event
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'request-1',
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-xyz',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // VERIFY: Terminal is added (correct window)
      await waitFor(() => {
        expect(result.current.webSocketAgents).toHaveLength(1)
      }, { timeout: 2000 })

      // VERIFY: windowId preserved
      expect(mockUpdateTerminal).toHaveBeenCalledWith('terminal-1',
        expect.objectContaining({
          windowId: 'window-123',
        })
      )
    })
  })

  describe('Fast-Spawning Terminals (Race Condition Prevention)', () => {
    it('should NOT match terminal from different window even with same terminalType', async () => {
      // SETUP: Two bash terminals, one in main, one in window-1
      const terminal1 = createMockTerminal('terminal-1', 'main', 'bash', 'spawning')
      const terminal2 = createMockTerminal('terminal-2', 'window-1', 'bash', 'spawning')
      terminal1.createdAt = Date.now()
      terminal2.createdAt = Date.now() + 50 // terminal-2 is more recent

      // VIEWING: main window
      const { result } = renderWebSocketManager('main', [terminal1, terminal2])

      // Open WebSocket connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for WebSocket to connect
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: Backend sends terminal-spawned for bash
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: undefined,
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-1',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // VERIFY: Should match terminal-1 (main window), NOT terminal-2 (even though more recent)
      await waitFor(() => {
        expect(mockUpdateTerminal).toHaveBeenCalled()
      }, { timeout: 2000 })

      expect(mockUpdateTerminal).toHaveBeenCalledWith('terminal-1',
        expect.objectContaining({
          agentId: 'agent-1',
          windowId: 'main',
        })
      )

      // VERIFY: terminal-2 was NOT updated (wrong window)
      expect(mockUpdateTerminal).not.toHaveBeenCalledWith('terminal-2', expect.anything())
    })
  })

  describe('Pending Spawns (Synchronous Matching)', () => {
    it('should respect windowId filtering even for pendingSpawns', async () => {
      // SETUP: Terminal in pendingSpawns for window-1, but viewing main
      const terminal = createMockTerminal('terminal-1', 'window-1', 'bash', 'spawning')
      terminal.requestId = 'request-1'

      pendingSpawns.current.set('request-1', terminal)

      const { result } = renderWebSocketManager('main', [])

      // Open WebSocket connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for WebSocket to connect
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: Backend sends terminal-spawned
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'request-1',
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-xyz',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      // VERIFY: Terminal NOT added (windowId mismatch)
      expect(result.current.webSocketAgents).toHaveLength(0)
    })
  })

  describe('Tmux Session Reconnection', () => {
    it('should only reconnect to sessions in current window', async () => {
      // SETUP: Two terminals with sessions, different windows
      const terminal1 = createMockTerminal('terminal-1', 'main', 'bash', 'spawning')
      terminal1.sessionName = 'tt-bash-1'

      const terminal2 = createMockTerminal('terminal-2', 'window-1', 'bash', 'spawning')
      terminal2.sessionName = 'tt-bash-2'

      const spawnOptions = [
        {
          label: 'Bash',
          command: 'bash',
          terminalType: 'bash',
          icon: '💻',
          description: 'Bash terminal',
        },
      ]

      // VIEWING: main window
      const { result } = renderWebSocketManager('main', [terminal1, terminal2], null, spawnOptions, true)

      // Open WebSocket connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for WebSocket to connect and query to be sent
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: Backend sends tmux-sessions-list with both sessions
      await act(async () => {
        mockWs.simulateMessage({
          type: 'tmux-sessions-list',
          data: {
            sessions: ['tt-bash-1', 'tt-bash-2'],
          },
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // VERIFY: Only reconnected to terminal-1 (main window)
      await waitFor(() => {
        expect(mockHandleReconnectTerminal).toHaveBeenCalledTimes(1)
      }, { timeout: 2000 })

      expect(mockHandleReconnectTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'terminal-1' }),
        expect.anything()
      )

      // VERIFY: Did NOT reconnect to terminal-2 (wrong window)
      expect(mockHandleReconnectTerminal).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'terminal-2' }),
        expect.anything()
      )
    })
  })

  describe('WebSocket Connection Lifecycle', () => {
    it('should connect on mount and set status to connected', async () => {
      const { result } = renderWebSocketManager('main', [])

      // Initially connecting
      expect(result.current.connectionStatus).toBe('connecting')

      // Open connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for connection
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })
    })

    it('should clear agentIds from all terminals on disconnect', async () => {
      // SETUP: Terminals with agentIds
      const terminal1 = createMockTerminal('terminal-1', 'main', 'bash', 'active')
      terminal1.agentId = 'agent-1'

      const terminal2 = createMockTerminal('terminal-2', 'main', 'bash', 'active')
      terminal2.agentId = 'agent-2'

      const { result } = renderWebSocketManager('main', [terminal1, terminal2])

      // Open connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for connection
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // Clear previous updateTerminal calls (from hydration)
      mockUpdateTerminal.mockClear()

      // SIMULATE: Disconnect
      await act(async () => {
        mockWs.simulateClose(1006, 'Connection lost')
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // VERIFY: Status changed to disconnected
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('disconnected')
      })

      // VERIFY: updateTerminal called to clear agentIds
      expect(mockUpdateTerminal).toHaveBeenCalled()

      // VERIFY: webSocketAgents cleared
      expect(result.current.webSocketAgents).toHaveLength(0)
    })
  })

  describe('Hydration (Clearing Stale AgentIds)', () => {
    it('should clear stale agentIds from localStorage on mount', async () => {
      // SETUP: Terminals with stale agentIds (from previous session)
      const terminal1 = createMockTerminal('terminal-1', 'main', 'bash', 'active')
      terminal1.agentId = 'stale-agent-1'

      const terminal2 = createMockTerminal('terminal-2', 'main', 'bash', 'active')
      terminal2.agentId = 'stale-agent-2'

      renderWebSocketManager('main', [terminal1, terminal2])

      // VERIFY: updateTerminal called to clear agentIds
      await waitFor(() => {
        expect(mockUpdateTerminal).toHaveBeenCalledWith('terminal-1', {
          agentId: undefined,
          status: 'spawning',
        })
        expect(mockUpdateTerminal).toHaveBeenCalledWith('terminal-2', {
          agentId: undefined,
          status: 'spawning',
        })
      })
    })

    it('should only clear agentIds once (not on every render)', async () => {
      // SETUP: Terminals with stale agentIds
      const terminal = createMockTerminal('terminal-1', 'main', 'bash', 'active')
      terminal.agentId = 'stale-agent-1'

      const { rerender } = renderWebSocketManager('main', [terminal])

      // Wait for initial clear
      await waitFor(() => {
        expect(mockUpdateTerminal).toHaveBeenCalledTimes(1)
      })

      // Clear mock
      mockUpdateTerminal.mockClear()

      // SIMULATE: Re-render with same terminals
      rerender()

      // Wait a bit
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      // VERIFY: updateTerminal NOT called again (already hydrated)
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })
  })

  describe('No Fallback Terminal Creation (Critical)', () => {
    it('should NOT create terminal for unmatched terminal-spawned event', async () => {
      // SETUP: No matching terminal
      const { result } = renderWebSocketManager('main', [])

      // Open connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for connection
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: terminal-spawned event with no matching terminal
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'unknown-request',
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-1',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      // VERIFY: webSocketAgents remains empty (no terminal created)
      expect(result.current.webSocketAgents).toHaveLength(0)

      // VERIFY: updateTerminal NOT called (no fallback creation)
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })
  })

  describe('Duplicate Agent Prevention', () => {
    it('should not process same agent ID twice', async () => {
      // SETUP: Terminal
      const terminal = createMockTerminal('terminal-1', 'main', 'bash', 'spawning')
      terminal.requestId = 'request-1'

      const { result } = renderWebSocketManager('main', [terminal])

      // Open connection
      await act(async () => {
        mockWs.simulateOpen()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for connection
      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected')
      })

      // SIMULATE: First terminal-spawned event
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'request-1',
          data: {
            id: 'agent-1',
            terminalType: 'bash',
            sessionName: 'tt-bash-1',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Wait for processing
      await waitFor(() => {
        expect(result.current.webSocketAgents).toHaveLength(1)
      }, { timeout: 2000 })

      // Clear mock calls
      mockUpdateTerminal.mockClear()

      // SIMULATE: Duplicate terminal-spawned event (same agent ID)
      await act(async () => {
        mockWs.simulateMessage({
          type: 'terminal-spawned',
          requestId: 'request-1',
          data: {
            id: 'agent-1', // Same agent ID
            terminalType: 'bash',
            sessionName: 'tt-bash-1',
            status: 'active',
          },
        })
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      // VERIFY: Duplicate ignored (webSocketAgents still has 1 entry)
      expect(result.current.webSocketAgents).toHaveLength(1)

      // VERIFY: updateTerminal NOT called again
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })
  })
})
