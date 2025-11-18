import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePopout } from '@/hooks/usePopout'
import { useSimpleTerminalStore, Terminal } from '@/stores/simpleTerminalStore'
import * as windowUtils from '@/utils/windowUtils'

/**
 * Unit Tests for usePopout Hook - Split Terminal Popout Scenarios
 *
 * Focus: Testing the critical split terminal popout logic that was fixed to prevent:
 * - Panes staying as invisible half-tabs in main window
 * - Split containers not being removed properly
 * - Pane state (isHidden) not being cleared
 *
 * Test Coverage Target: 80%+ of usePopout.ts (lines 45-338)
 */

// Mock window.open
const mockWindowOpen = vi.fn()
global.window.open = mockWindowOpen as any

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:5173',
    pathname: '/',
  },
  writable: true,
})

// Mock generateWindowId utility
vi.mock('@/utils/windowUtils', async () => {
  const actual = await vi.importActual('@/utils/windowUtils')
  return {
    ...actual,
    generateWindowId: vi.fn(() => `window-test-${Date.now()}`),
  }
})

// Mock fetch for tmux detach API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('usePopout - Split Terminal Popout', () => {
  // Test helpers
  let wsRef: React.RefObject<WebSocket | null>
  let mockWs: WebSocket

  // Helper to get fresh store state
  const getStore = () => useSimpleTerminalStore.getState()

  beforeEach(() => {
    // Reset store to initial state
    getStore().clearAllTerminals()

    // Reset mocks
    mockWindowOpen.mockClear()
    mockFetch.mockClear()
    vi.clearAllTimers()
    vi.useFakeTimers()

    // Mock WebSocket
    mockWs = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    } as any
    wsRef = { current: mockWs }

    // Mock successful fetch responses
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    })

    // Mock window.alert
    global.alert = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  /**
   * Helper: Create a split terminal container with 2 panes
   * Returns [splitContainer, leftPane, rightPane]
   */
  function createSplitTerminal(): [Terminal, Terminal, Terminal] {
    const store = getStore()

    // Create two actual terminal objects for the panes
    const leftPane: Terminal = {
      id: 'pane-left',
      name: 'Bash Left',
      terminalType: 'bash',
      icon: '🐚',
      createdAt: Date.now(),
      windowId: 'main',
      isHidden: true, // Hidden because it's part of a split
      sessionName: 'tt-bash-left',
      agentId: 'agent-left',
      splitLayout: { type: 'single', panes: [] },
    }

    const rightPane: Terminal = {
      id: 'pane-right',
      name: 'Bash Right',
      terminalType: 'bash',
      icon: '🐚',
      createdAt: Date.now(),
      windowId: 'main',
      isHidden: true, // Hidden because it's part of a split
      sessionName: 'tt-bash-right',
      agentId: 'agent-right',
      splitLayout: { type: 'single', panes: [] },
    }

    // Create split container that references these panes
    const splitContainer: Terminal = {
      id: 'split-1',
      name: 'Split',
      terminalType: 'split',
      icon: '⬌',
      createdAt: Date.now(),
      windowId: 'main',
      splitLayout: {
        type: 'vertical',
        panes: [
          { id: 'pane-slot-1', terminalId: 'pane-left', size: 50, position: 'left' },
          { id: 'pane-slot-2', terminalId: 'pane-right', size: 50, position: 'right' },
        ],
      },
    }

    // Add all terminals to store
    store.addTerminal(leftPane)
    store.addTerminal(rightPane)
    store.addTerminal(splitContainer)
    store.setActiveTerminal(splitContainer.id)

    return [splitContainer, leftPane, rightPane]
  }

  /**
   * Helper: Create a split terminal container with 3 panes
   * Returns [splitContainer, pane1, pane2, pane3]
   */
  function createSplitTerminalWith3Panes(): [Terminal, Terminal, Terminal, Terminal] {
    const store = getStore()

    const pane1: Terminal = {
      id: 'pane-1',
      name: 'Bash 1',
      terminalType: 'bash',
      icon: '🐚',
      createdAt: Date.now(),
      windowId: 'main',
      isHidden: true,
      sessionName: 'tt-bash-1',
      agentId: 'agent-1',
      splitLayout: { type: 'single', panes: [] },
    }

    const pane2: Terminal = {
      id: 'pane-2',
      name: 'Bash 2',
      terminalType: 'bash',
      icon: '🐚',
      createdAt: Date.now(),
      windowId: 'main',
      isHidden: true,
      sessionName: 'tt-bash-2',
      agentId: 'agent-2',
      splitLayout: { type: 'single', panes: [] },
    }

    const pane3: Terminal = {
      id: 'pane-3',
      name: 'Bash 3',
      terminalType: 'bash',
      icon: '🐚',
      createdAt: Date.now(),
      windowId: 'main',
      isHidden: true,
      sessionName: 'tt-bash-3',
      agentId: 'agent-3',
      splitLayout: { type: 'single', panes: [] },
    }

    const splitContainer: Terminal = {
      id: 'split-3',
      name: 'Split',
      terminalType: 'split',
      icon: '⬌',
      createdAt: Date.now(),
      windowId: 'main',
      splitLayout: {
        type: 'vertical',
        panes: [
          { id: 'slot-1', terminalId: 'pane-1', size: 33, position: 'left' },
          { id: 'slot-2', terminalId: 'pane-2', size: 33, position: 'left' },
          { id: 'slot-3', terminalId: 'pane-3', size: 34, position: 'right' },
        ],
      },
    }

    store.addTerminal(pane1)
    store.addTerminal(pane2)
    store.addTerminal(pane3)
    store.addTerminal(splitContainer)
    store.setActiveTerminal(splitContainer.id)

    return [splitContainer, pane1, pane2, pane3]
  }

  describe('Pop Out Single Pane from Split', () => {
    it('should clear isHidden state when popping out pane', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true, // useTmux
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Pop out left pane
      await result.current.handlePopOutTab(leftPane.id)

      // Check that isHidden was cleared IMMEDIATELY (before window opens)
      const updatedStore = getStore()
      const updatedPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      expect(updatedPane?.isHidden).toBe(false)
    })

    it('should clear splitLayout when popping out pane', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      // Verify split layout was cleared to single
      const updatedStore = getStore()
      const updatedPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      expect(updatedPane?.splitLayout).toEqual({
        type: 'single',
        panes: [],
      })
    })

    it('should assign new windowId to popped out pane', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()

      // Mock generateWindowId to return predictable value
      vi.mocked(windowUtils.generateWindowId).mockReturnValue('window-new-123')

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      const updatedStore = getStore()
      const updatedPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      expect(updatedPane?.windowId).toBe('window-new-123')
    })

    it('should remove pane from split container panes array', async () => {
      // Create split with 3 panes so after removing 1, we still have a split (not converted to single)
      const [splitContainer, pane1, pane2, pane3] = createSplitTerminalWith3Panes()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Before: split has 3 panes
      expect(splitContainer.splitLayout?.panes.length).toBe(3)

      await result.current.handlePopOutTab(pane1.id)

      // After: split should have 2 panes (pane2 and pane3 remain)
      const updatedStore = getStore()
      const updatedSplit = updatedStore.terminals.find(t => t.id === splitContainer.id)
      expect(updatedSplit?.splitLayout?.panes.length).toBe(2)
      expect(updatedSplit?.splitLayout?.panes.find(p => p.terminalId === pane2.id)).toBeDefined()
      expect(updatedSplit?.splitLayout?.panes.find(p => p.terminalId === pane3.id)).toBeDefined()
    })

    it('should detach from tmux session via API', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true, // useTmux = true
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      // Verify tmux detach API was called
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tmux/detach/tt-bash-left',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('should open new window after timeout with correct URL', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()
      vi.mocked(windowUtils.generateWindowId).mockReturnValue('window-new-456')

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      // Fast-forward past localStorage sync delay (600ms)
      vi.advanceTimersByTime(600)

      // Verify window.open was called with correct URL
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'http://localhost:5173/?window=window-new-456&active=pane-left',
        'tabz-window-new-456',
        undefined // Tab mode (default) passes undefined for window features
      )
    })
  })

  describe('Convert Split to Single Terminal', () => {
    it('should convert split to single terminal when only 1 pane remains', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Pop out left pane - should leave only right pane
      await result.current.handlePopOutTab(leftPane.id)

      // Split container should be converted to single
      const updatedStore = getStore()
      const updatedSplit = updatedStore.terminals.find(t => t.id === splitContainer.id)
      expect(updatedSplit?.splitLayout?.type).toBe('single')
      expect(updatedSplit?.splitLayout?.panes).toEqual([])
    })

    it('should unhide the remaining pane when converting to single', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Verify right pane is initially hidden
      expect(rightPane.isHidden).toBe(true)

      await result.current.handlePopOutTab(leftPane.id)

      // Remaining pane should be unhidden
      const finalStore = getStore()
      const updatedRightPane = finalStore.terminals.find(t => t.id === rightPane.id)
      expect(updatedRightPane?.isHidden).toBe(false)
    })

    it('should switch active terminal to remaining pane after popout', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Active terminal is split container
      const updatedStore = getStore()
      expect(updatedStore.activeTerminalId).toBe(splitContainer.id)

      await result.current.handlePopOutTab(leftPane.id)

      // Active terminal should switch to remaining pane
      const finalStore = getStore()
      expect(finalStore.activeTerminalId).toBe(rightPane.id)
    })

    it('should NOT convert split when more than 1 pane remains', async () => {
      const [splitContainer, pane1, pane2, pane3] = createSplitTerminalWith3Panes()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Pop out pane1 - should leave 2 panes (pane2, pane3)
      await result.current.handlePopOutTab(pane1.id)

      // Split should still be vertical (not converted to single)
      const updatedStore = getStore()
      const updatedSplit = updatedStore.terminals.find(t => t.id === splitContainer.id)
      expect(updatedSplit?.splitLayout?.type).toBe('vertical')
      expect(updatedSplit?.splitLayout?.panes.length).toBe(2)

      // Remaining panes should still be hidden (still part of split)
      const updatedPane2 = store.terminals.find(t => t.id === pane2.id)
      const updatedPane3 = store.terminals.find(t => t.id === pane3.id)
      expect(updatedPane2?.isHidden).toBe(true)
      expect(updatedPane3?.isHidden).toBe(true)
    })
  })

  describe('Pop Out Entire Split Container', () => {
    it('should open separate window for each pane', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()
      let windowIdCounter = 0
      vi.mocked(windowUtils.generateWindowId).mockImplementation(
        () => `window-pane-${++windowIdCounter}`
      )

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Pop out entire split container
      await result.current.handlePopOutTab(splitContainer.id)

      // Fast-forward past localStorage sync delay
      vi.advanceTimersByTime(600)

      // Should open 2 windows (one for each pane)
      expect(mockWindowOpen).toHaveBeenCalledTimes(2)
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.stringContaining('window=window-pane-1'),
        expect.stringMatching(/^tabz-window-pane-/),
        undefined // Tab mode (default) passes undefined for window features
      )
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.stringContaining('window=window-pane-2'),
        expect.stringMatching(/^tabz-window-pane-/),
        undefined // Tab mode (default) passes undefined for window features
      )
    })

    it('should clear isHidden for all panes when popping out split', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Before: both panes are hidden
      expect(leftPane.isHidden).toBe(true)
      expect(rightPane.isHidden).toBe(true)

      await result.current.handlePopOutTab(splitContainer.id)

      // After: both panes should be unhidden (becoming normal tabs)
      const updatedStore = getStore()
      const updatedLeftPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      const updatedRightPane = updatedStore.terminals.find(t => t.id === rightPane.id)
      expect(updatedLeftPane?.isHidden).toBe(false)
      expect(updatedRightPane?.isHidden).toBe(false)
    })

    it('should clear splitLayout for all panes when popping out split', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(splitContainer.id)

      // All panes should have single layout (no split)
      const updatedStore = getStore()
      const updatedLeftPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      const updatedRightPane = updatedStore.terminals.find(t => t.id === rightPane.id)
      expect(updatedLeftPane?.splitLayout).toEqual({ type: 'single', panes: [] })
      expect(updatedRightPane?.splitLayout).toEqual({ type: 'single', panes: [] })
    })

    it('should assign different windowIds to each pane', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()
      let windowIdCounter = 0
      vi.mocked(windowUtils.generateWindowId).mockImplementation(
        () => `window-unique-${++windowIdCounter}`
      )

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(splitContainer.id)

      const updatedStore = getStore()
      const updatedLeftPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      const updatedRightPane = updatedStore.terminals.find(t => t.id === rightPane.id)

      // Each pane should have a unique window ID
      expect(updatedLeftPane?.windowId).toBe('window-unique-1')
      expect(updatedRightPane?.windowId).toBe('window-unique-2')
      expect(updatedLeftPane?.windowId).not.toBe(updatedRightPane?.windowId)
    })

    it('should remove split container from store after popping out', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Before: split container exists
      expect(store.terminals.find(t => t.id === splitContainer.id)).toBeDefined()

      await result.current.handlePopOutTab(splitContainer.id)

      // After: split container should be removed
      const updatedStore = getStore()
      expect(updatedStore.terminals.find(t => t.id === splitContainer.id)).toBeUndefined()
    })

    it('should detach from all pane tmux sessions', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(splitContainer.id)

      // Should detach from both pane sessions
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tmux/detach/tt-bash-left',
        expect.objectContaining({ method: 'POST' })
      )
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tmux/detach/tt-bash-right',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('should switch to next available terminal after removing split', async () => {
      // Create split + one additional standalone terminal
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const standaloneTerminal: Terminal = {
        id: 'standalone-1',
        name: 'Standalone Bash',
        terminalType: 'bash',
        icon: '🐚',
        createdAt: Date.now(),
        windowId: 'main',
        splitLayout: { type: 'single', panes: [] },
      }
      store.addTerminal(standaloneTerminal)

      // Active terminal is split
      store.setActiveTerminal(splitContainer.id)

      // Get fresh store state AFTER adding terminal and setting active
      const freshStore = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          freshStore.terminals,
          freshStore.activeTerminalId,
          freshStore.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          freshStore.updateTerminal,
          freshStore.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(splitContainer.id)

      // Should switch to standalone terminal
      const updatedStore = getStore()
      expect(updatedStore.activeTerminalId).toBe(standaloneTerminal.id)
    })

    it('should set activeTerminal to null when no terminals remain', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(splitContainer.id)

      // No terminals left in main window - active should be null
      const updatedStore = getStore()
      expect(updatedStore.activeTerminalId).toBeNull()
    })
  })

  describe('Main Window State After Popout', () => {
    it('should not have invisible half-tabs after popout (isHidden=false)', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      // Check main window terminals - none should have isHidden=true
      const updatedStore = getStore()
      const mainWindowTerminals = updatedStore.terminals.filter(
        t => (t.windowId || 'main') === 'main'
      )
      const hiddenTerminals = mainWindowTerminals.filter(t => t.isHidden === true)

      expect(hiddenTerminals.length).toBe(0)
    })

    it('should not have split containers with empty panes arrays', async () => {
      const [splitContainer, leftPane, rightPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      // Check main window terminals - no split with type != 'single' and empty panes
      const updatedStore = getStore()
      const mainWindowTerminals = updatedStore.terminals.filter(
        t => (t.windowId || 'main') === 'main'
      )
      const brokenSplits = mainWindowTerminals.filter(
        t => t.splitLayout?.type !== 'single' && t.splitLayout?.panes.length === 0
      )

      expect(brokenSplits.length).toBe(0)
    })
  })

  describe('Popped Out Pane State', () => {
    it('should become normal tab in new window (isHidden=false, single layout)', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      const updatedStore = getStore()
      const poppedPane = updatedStore.terminals.find(t => t.id === leftPane.id)

      // Should be a normal tab (not hidden, single layout, new window)
      expect(poppedPane?.isHidden).toBe(false)
      expect(poppedPane?.splitLayout?.type).toBe('single')
      expect(poppedPane?.windowId).not.toBe('main')
    })

    it('should clear agentId for reconnection in new window', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Before: pane has agentId
      expect(leftPane.agentId).toBe('agent-left')

      await result.current.handlePopOutTab(leftPane.id)

      // After: agentId should be cleared for fresh connection
      const updatedStore = getStore()
      const poppedPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      expect(poppedPane?.agentId).toBeUndefined()
    })

    it('should set status to spawning for reconnection', async () => {
      const [splitContainer, leftPane] = createSplitTerminal()
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(leftPane.id)

      const updatedStore = getStore()
      const poppedPane = updatedStore.terminals.find(t => t.id === leftPane.id)
      expect(poppedPane?.status).toBe('spawning')
    })
  })

  describe('Single Terminal Popout (Non-Split)', () => {
    it('should handle single terminal popout correctly', async () => {
      const store = getStore()

      const singleTerminal: Terminal = {
        id: 'single-1',
        name: 'Single Bash',
        terminalType: 'bash',
        icon: '🐚',
        createdAt: Date.now(),
        windowId: 'main',
        sessionName: 'tt-single-bash',
        agentId: 'agent-single',
        splitLayout: { type: 'single', panes: [] },
      }
      store.addTerminal(singleTerminal)
      store.setActiveTerminal(singleTerminal.id)

      vi.mocked(windowUtils.generateWindowId).mockReturnValue('window-single-123')

      // Get fresh store state AFTER adding terminal
      const freshStore = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          freshStore.terminals,
          freshStore.activeTerminalId,
          freshStore.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          freshStore.updateTerminal,
          freshStore.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(singleTerminal.id)

      // Verify window was opened
      vi.advanceTimersByTime(600)
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'http://localhost:5173/?window=window-single-123&active=single-1',
        'tabz-window-single-123',
        undefined // Tab mode passes undefined for window features
      )
    })

    it('should detach from tmux for single terminal', async () => {
      const store = getStore()

      const singleTerminal: Terminal = {
        id: 'single-2',
        name: 'Single Bash',
        terminalType: 'bash',
        icon: '🐚',
        createdAt: Date.now(),
        windowId: 'main',
        sessionName: 'tt-single-bash-2',
        splitLayout: { type: 'single', panes: [] },
      }
      store.addTerminal(singleTerminal)

      // Get fresh store state AFTER adding terminal
      const freshStore = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          freshStore.terminals,
          freshStore.activeTerminalId,
          freshStore.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          freshStore.updateTerminal,
          freshStore.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(singleTerminal.id)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tmux/detach/tt-single-bash-2',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle popout when terminal does not exist', async () => {
      const store = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          [],
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Should not throw
      await expect(result.current.handlePopOutTab('nonexistent-id')).resolves.toBeUndefined()
      expect(mockWindowOpen).not.toHaveBeenCalled()
    })

    it('should handle popout when split container has no panes', async () => {
      const store = getStore()

      const emptySplit: Terminal = {
        id: 'empty-split',
        name: 'Empty Split',
        terminalType: 'split',
        icon: '⬌',
        createdAt: Date.now(),
        windowId: 'main',
        splitLayout: {
          type: 'vertical',
          panes: [], // No panes!
        },
      }
      store.addTerminal(emptySplit)

      const { result } = renderHook(() =>
        usePopout(
          'main',
          store.terminals,
          store.activeTerminalId,
          store.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          store.updateTerminal,
          store.setActiveTerminal
        )
      )

      // Should not throw
      await expect(result.current.handlePopOutTab(emptySplit.id)).resolves.toBeUndefined()
      expect(mockWindowOpen).not.toHaveBeenCalled()
    })

    it('should handle popout with targetWindowId parameter', async () => {
      const store = getStore()

      const singleTerminal: Terminal = {
        id: 'single-target',
        name: 'Single Bash',
        terminalType: 'bash',
        icon: '🐚',
        createdAt: Date.now(),
        windowId: 'main',
        sessionName: 'tt-target-bash',
        splitLayout: { type: 'single', panes: [] },
      }
      store.addTerminal(singleTerminal)

      // Get fresh store state AFTER adding terminal
      const freshStore = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          freshStore.terminals,
          freshStore.activeTerminalId,
          freshStore.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          freshStore.updateTerminal,
          freshStore.setActiveTerminal
        )
      )

      // Pass custom targetWindowId
      await result.current.handlePopOutTab(singleTerminal.id, 'custom-window-id')

      const updatedStore = getStore()
      const updated = updatedStore.terminals.find(t => t.id === singleTerminal.id)
      expect(updated?.windowId).toBe('custom-window-id')
    })

    it('should handle non-tmux terminal popout (WebSocket detach)', async () => {
      const store = getStore()

      const singleTerminal: Terminal = {
        id: 'non-tmux',
        name: 'Non-Tmux Terminal',
        terminalType: 'bash',
        icon: '🐚',
        createdAt: Date.now(),
        windowId: 'main',
        agentId: 'agent-non-tmux',
        splitLayout: { type: 'single', panes: [] },
        // No sessionName = non-tmux
      }
      store.addTerminal(singleTerminal)

      // Get fresh store state AFTER adding terminal
      const freshStore = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          freshStore.terminals,
          freshStore.activeTerminalId,
          freshStore.terminals.filter(t => (t.windowId || 'main') === 'main'),
          false, // useTmux = false
          wsRef,
          freshStore.updateTerminal,
          freshStore.setActiveTerminal
        )
      )

      await result.current.handlePopOutTab(singleTerminal.id)

      // Should send WebSocket detach (not fetch)
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'detach',
          terminalId: 'agent-non-tmux',
        })
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should handle window.open failure (popup blocked)', async () => {
      const store = getStore()

      const singleTerminal: Terminal = {
        id: 'blocked',
        name: 'Blocked Terminal',
        terminalType: 'bash',
        icon: '🐚',
        createdAt: Date.now(),
        windowId: 'main',
        sessionName: 'tt-blocked',
        splitLayout: { type: 'single', panes: [] },
      }
      store.addTerminal(singleTerminal)

      // Mock window.open to return null (blocked)
      mockWindowOpen.mockReturnValue(null)

      // Get fresh store state AFTER adding terminal
      const freshStore = getStore()

      const { result } = renderHook(() =>
        usePopout(
          'main',
          freshStore.terminals,
          freshStore.activeTerminalId,
          freshStore.terminals.filter(t => (t.windowId || 'main') === 'main'),
          true,
          wsRef,
          freshStore.updateTerminal,
          freshStore.setActiveTerminal
        )
      )

      // Should not throw
      await expect(result.current.handlePopOutTab(singleTerminal.id)).resolves.toBeUndefined()

      vi.advanceTimersByTime(600)
      expect(mockWindowOpen).toHaveBeenCalled()
      // Terminal state still updated even if window fails to open
      const updatedStore = getStore()
      const updated = updatedStore.terminals.find(t => t.id === singleTerminal.id)
      expect(updated?.windowId).not.toBe('main')
    })
  })
})
