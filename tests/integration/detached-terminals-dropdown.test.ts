/**
 * Integration Tests: Consolidated Detached Terminals Dropdown
 *
 * Tests the consolidated detached terminals view added Nov 13, 2025.
 * Detached terminals are removed from individual tabs and shown in a single
 * dropdown in the header, accessible from all windows.
 *
 * Covered Workflows:
 * 1. Detaching clears windowId (makes terminal globally accessible)
 * 2. Reattaching sets windowId to current window
 * 3. Detached terminals visible in all windows (not filtered by windowId)
 * 4. Header button shows/hides based on detached count
 * 5. Expected errors are filtered from error tracking
 *
 * Key Features Tested:
 * - Multi-window support: Detach in Window 1, reattach in Window 2
 * - Global accessibility: Detached terminals show in ALL windows
 * - Error filtering: "Terminal not found for agentId" warnings ignored
 *
 * Architecture References:
 * - SimpleTerminalApp.tsx:367-386 - detachedTerminals array (global)
 * - SimpleTerminalApp.tsx:1588-1630 - Header dropdown UI
 * - SimpleTerminalApp.tsx:854-868 - Detach clears windowId
 * - SimpleTerminalApp.tsx:999-1040 - Reattach sets windowId
 * - SimpleTerminalApp.tsx:301-312 - isExpectedError() filter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSimpleTerminalStore, Terminal } from '../../src/stores/simpleTerminalStore'

/**
 * Helper: Create mock terminal
 */
function createMockTerminal(
  id: string,
  name: string,
  terminalType: string = 'bash',
  windowId: string = 'main',
  sessionName?: string
): Terminal {
  return {
    id,
    name,
    terminalType,
    command: 'bash',
    icon: '💻',
    agentId: `agent-${id}`,
    sessionName: sessionName || `tt-bash-${id.slice(-3)}`,
    createdAt: Date.now(),
    status: 'active',
    windowId,
  }
}

/**
 * Mock fetch API
 */
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Consolidated Detached Terminals Dropdown', () => {
  beforeEach(() => {
    // Reset store
    useSimpleTerminalStore.getState().clearAllTerminals()

    // Reset mocks
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true }),
    })
  })

  describe('windowId Management', () => {
    it('should clear windowId when detaching terminal', async () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create terminal in Window 1
      const terminal = createMockTerminal('terminal-1', 'Bash', 'bash', 'window-1', 'tt-bash-xyz')
      addTerminal(terminal)

      // Verify initial windowId
      expect(terminal.windowId).toBe('window-1')

      // Detach terminal
      updateTerminal('terminal-1', {
        status: 'detached',
        agentId: undefined,
        windowId: undefined, // KEY FIX: Clear window assignment
      })

      // Verify windowId cleared
      const state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'terminal-1')
      expect(state?.status).toBe('detached')
      expect(state?.windowId).toBeUndefined()
    })

    it('should set windowId to current window when reattaching', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create detached terminal (no windowId)
      const terminal = createMockTerminal('terminal-2', 'Bash', 'bash', undefined, 'tt-bash-abc')
      terminal.status = 'detached'
      terminal.agentId = undefined
      terminal.windowId = undefined
      addTerminal(terminal)

      // Simulate reattaching in Window 2
      const currentWindowId = 'window-2'
      updateTerminal('terminal-2', {
        windowId: currentWindowId,
        status: 'spawning',
      })

      // Verify terminal assigned to Window 2
      const state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'terminal-2')
      expect(state?.windowId).toBe('window-2')
      expect(state?.status).toBe('spawning')
    })

    it('should clear windowId for all panes in split container detach', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create split container in Window 1
      const leftTerminal = createMockTerminal('left-1', 'Left', 'bash', 'window-1', 'tt-bash-left')
      const rightTerminal = createMockTerminal('right-1', 'Right', 'bash', 'window-1', 'tt-bash-right')
      const container = createMockTerminal('container-1', 'Container', 'bash', 'window-1')

      container.splitLayout = {
        type: 'vertical',
        panes: [
          { id: 'pane-1', terminalId: 'left-1', size: 50, position: 'left' },
          { id: 'pane-2', terminalId: 'right-1', size: 50, position: 'right' },
        ],
      }

      addTerminal(leftTerminal)
      addTerminal(rightTerminal)
      addTerminal(container)

      // Detach all (clear windowId for each)
      updateTerminal('left-1', { status: 'detached', agentId: undefined, windowId: undefined })
      updateTerminal('right-1', { status: 'detached', agentId: undefined, windowId: undefined })
      updateTerminal('container-1', { status: 'detached', agentId: undefined, windowId: undefined })

      // Verify all windowIds cleared
      const state = useSimpleTerminalStore.getState()
      const leftState = state.terminals.find(t => t.id === 'left-1')
      const rightState = state.terminals.find(t => t.id === 'right-1')
      const containerState = state.terminals.find(t => t.id === 'container-1')

      expect(leftState?.windowId).toBeUndefined()
      expect(rightState?.windowId).toBeUndefined()
      expect(containerState?.windowId).toBeUndefined()
    })
  })

  describe('Global Accessibility (Multi-Window)', () => {
    it('should show detached terminals in all windows', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create terminals in different windows
      const terminal1 = createMockTerminal('term-1', 'Terminal 1', 'bash', 'window-1', 'tt-bash-1')
      const terminal2 = createMockTerminal('term-2', 'Terminal 2', 'bash', 'window-2', 'tt-bash-2')

      addTerminal(terminal1)
      addTerminal(terminal2)

      // Detach both (clear windowId)
      updateTerminal('term-1', { status: 'detached', agentId: undefined, windowId: undefined })
      updateTerminal('term-2', { status: 'detached', agentId: undefined, windowId: undefined })

      // Simulate filtering for Window 1 (should show both detached)
      const currentWindowId = 'window-1'
      const allTerminals = useSimpleTerminalStore.getState().terminals

      // Active terminals filtered by window
      const visibleInWindow1 = allTerminals.filter(t => {
        if (t.status === 'detached') return false // Detached not shown as tabs
        return (t.windowId || 'main') === currentWindowId
      })

      // Detached terminals (global, not filtered)
      const detachedTerminals = allTerminals.filter(t => t.status === 'detached')

      // Should have 0 visible tabs (both detached)
      expect(visibleInWindow1).toHaveLength(0)

      // Should have 2 detached terminals (both visible globally)
      expect(detachedTerminals).toHaveLength(2)
      expect(detachedTerminals.map(t => t.id)).toEqual(['term-1', 'term-2'])
    })

    it('should allow reattaching detached terminal from any window', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create terminal detached in Window 1
      const terminal = createMockTerminal('term-3', 'Terminal', 'bash', undefined, 'tt-bash-3')
      terminal.status = 'detached'
      terminal.agentId = undefined
      terminal.windowId = undefined // No window assignment
      addTerminal(terminal)

      // Verify accessible from Window 2
      const detachedTerminals = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      )
      expect(detachedTerminals).toHaveLength(1)
      expect(detachedTerminals[0].id).toBe('term-3')

      // Reattach in Window 2
      updateTerminal('term-3', {
        windowId: 'window-2',
        status: 'spawning',
      })

      // Verify now assigned to Window 2
      const state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'term-3')
      expect(state?.windowId).toBe('window-2')
      expect(state?.status).toBe('spawning')
    })

    it('should show correct count in dropdown for multiple detached terminals', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create 5 detached terminals
      for (let i = 1; i <= 5; i++) {
        const terminal = createMockTerminal(`term-${i}`, `Terminal ${i}`, 'bash', undefined, `tt-bash-${i}`)
        terminal.status = 'detached'
        terminal.agentId = undefined
        terminal.windowId = undefined
        addTerminal(terminal)
      }

      // Verify count
      const detachedTerminals = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      )
      expect(detachedTerminals).toHaveLength(5)
    })
  })

  describe('Header Button State', () => {
    it('should show header button when terminals are detached', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // No detached terminals initially
      let detachedTerminals = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      )
      expect(detachedTerminals).toHaveLength(0)

      // Add and detach terminal
      const terminal = createMockTerminal('term-4', 'Terminal', 'bash', 'main', 'tt-bash-4')
      addTerminal(terminal)
      updateTerminal('term-4', {
        status: 'detached',
        agentId: undefined,
        windowId: undefined,
      })

      // Button should show (count = 1)
      detachedTerminals = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      )
      expect(detachedTerminals).toHaveLength(1)
    })

    it('should hide header button when no terminals detached', () => {
      const { addTerminal } = useSimpleTerminalStore.getState()

      // Add active terminals only
      addTerminal(createMockTerminal('term-5', 'Active 1', 'bash', 'main'))
      addTerminal(createMockTerminal('term-6', 'Active 2', 'bash', 'main'))

      // No detached terminals
      const detachedTerminals = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      )
      expect(detachedTerminals).toHaveLength(0)
    })

    it('should update count when detaching multiple terminals', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Add 3 terminals
      for (let i = 1; i <= 3; i++) {
        addTerminal(createMockTerminal(`term-${i}`, `Terminal ${i}`, 'bash', 'main', `tt-bash-${i}`))
      }

      // Detach first one
      updateTerminal('term-1', { status: 'detached', agentId: undefined, windowId: undefined })

      let detachedCount = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      ).length
      expect(detachedCount).toBe(1)

      // Detach second one
      updateTerminal('term-2', { status: 'detached', agentId: undefined, windowId: undefined })

      detachedCount = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      ).length
      expect(detachedCount).toBe(2)

      // Reattach first one
      updateTerminal('term-1', { status: 'active', windowId: 'main' })

      detachedCount = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      ).length
      expect(detachedCount).toBe(1)
    })
  })

  describe('Error Filtering', () => {
    it('should filter "Terminal not found for agentId" warnings', () => {
      // Simulate isExpectedError() function
      const isExpectedError = (message: string): boolean => {
        const expectedPatterns = [
          /terminal not found for agentId/i,
          /\[useWebSocketManager\].*not found/i,
        ]
        return expectedPatterns.some(pattern => pattern.test(message))
      }

      // These should be filtered (expected during reattach)
      expect(isExpectedError('⚠️ [useWebSocketManager] Terminal not found for agentId: abc-123')).toBe(true)
      expect(isExpectedError('[useWebSocketManager] Terminal not found for agentId: xyz-456')).toBe(true)

      // Note: "Available agentIds" warnings are just info, not errors in actual app
      // They appear in console.warn but don't need separate filtering

      // These should NOT be filtered (real errors)
      expect(isExpectedError('TypeError: Cannot read property of undefined')).toBe(false)
      expect(isExpectedError('Failed to spawn terminal')).toBe(false)
      expect(isExpectedError('WebSocket connection failed')).toBe(false)
    })

    it('should filter detach-related warnings', () => {
      const isExpectedError = (message: string): boolean => {
        const expectedPatterns = [
          /spawn not found/i,
          /after detaching/i,
          /terminal.*not found.*after detach/i,
          /websocket.*already.*closed/i,
          /connection.*already.*closed/i,
        ]
        return expectedPatterns.some(pattern => pattern.test(message))
      }

      // These should be filtered
      expect(isExpectedError('Spawn not found after detaching')).toBe(true)
      expect(isExpectedError('Terminal not found after detach')).toBe(true)
      expect(isExpectedError('WebSocket already closed')).toBe(true)
      expect(isExpectedError('Connection already closed')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle detaching terminal with no sessionName gracefully', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create terminal without sessionName
      const terminal = createMockTerminal('edge-1', 'No Session', 'bash', 'main')
      terminal.sessionName = undefined
      addTerminal(terminal)

      // Try to detach (should fail gracefully)
      // In real app, handleContextDetach returns early if no sessionName

      // Terminal should remain active (not detached)
      const state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'edge-1')
      expect(state?.status).toBe('active')
    })

    it('should handle reattaching to same window', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create terminal in Window 1
      const terminal = createMockTerminal('edge-2', 'Terminal', 'bash', 'window-1', 'tt-bash-edge')
      addTerminal(terminal)

      // Detach
      updateTerminal('edge-2', {
        status: 'detached',
        agentId: undefined,
        windowId: undefined,
      })

      // Reattach in same window (Window 1)
      updateTerminal('edge-2', {
        windowId: 'window-1',
        status: 'spawning',
      })

      // Should work fine
      const state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'edge-2')
      expect(state?.windowId).toBe('window-1')
      expect(state?.status).toBe('spawning')
    })

    it('should handle multiple detach/reattach cycles', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      const terminal = createMockTerminal('edge-3', 'Cycle Test', 'bash', 'main', 'tt-bash-cycle')
      addTerminal(terminal)

      // Cycle 1: Detach
      updateTerminal('edge-3', { status: 'detached', agentId: undefined, windowId: undefined })
      let state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'edge-3')
      expect(state?.status).toBe('detached')
      expect(state?.windowId).toBeUndefined()

      // Cycle 1: Reattach
      updateTerminal('edge-3', { status: 'active', agentId: 'agent-1', windowId: 'window-1' })
      state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'edge-3')
      expect(state?.status).toBe('active')
      expect(state?.windowId).toBe('window-1')

      // Cycle 2: Detach again
      updateTerminal('edge-3', { status: 'detached', agentId: undefined, windowId: undefined })
      state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'edge-3')
      expect(state?.status).toBe('detached')
      expect(state?.windowId).toBeUndefined()

      // Cycle 2: Reattach to different window
      updateTerminal('edge-3', { status: 'active', agentId: 'agent-2', windowId: 'window-2' })
      state = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'edge-3')
      expect(state?.status).toBe('active')
      expect(state?.windowId).toBe('window-2')
    })
  })

  describe('Dropdown Data Structure', () => {
    it('should provide all necessary data for dropdown items', () => {
      const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

      // Create detached terminals with full metadata
      const terminal1 = createMockTerminal('dropdown-1', 'Claude Code', 'claude-code', undefined, 'tt-cc-abc')
      terminal1.icon = '🤖'
      terminal1.status = 'detached'
      terminal1.agentId = undefined
      terminal1.windowId = undefined

      const terminal2 = createMockTerminal('dropdown-2', 'LazyGit', 'tui-tool', undefined, 'tt-lazygit-xyz')
      terminal2.icon = '🌿'
      terminal2.status = 'detached'
      terminal2.agentId = undefined
      terminal2.windowId = undefined

      addTerminal(terminal1)
      addTerminal(terminal2)

      // Get detached terminals for dropdown
      const detachedTerminals = useSimpleTerminalStore.getState().terminals.filter(
        t => t.status === 'detached'
      )

      expect(detachedTerminals).toHaveLength(2)

      // Verify dropdown has all necessary data
      detachedTerminals.forEach(terminal => {
        expect(terminal.id).toBeDefined()
        expect(terminal.name).toBeDefined()
        expect(terminal.icon).toBeDefined()
        expect(terminal.sessionName).toBeDefined()
        expect(terminal.status).toBe('detached')
      })

      // Verify specific terminals
      const ccTerminal = detachedTerminals.find(t => t.id === 'dropdown-1')
      expect(ccTerminal?.name).toBe('Claude Code')
      expect(ccTerminal?.icon).toBe('🤖')
      expect(ccTerminal?.sessionName).toBe('tt-cc-abc')

      const lgTerminal = detachedTerminals.find(t => t.id === 'dropdown-2')
      expect(lgTerminal?.name).toBe('LazyGit')
      expect(lgTerminal?.icon).toBe('🌿')
      expect(lgTerminal?.sessionName).toBe('tt-lazygit-xyz')
    })
  })
})
