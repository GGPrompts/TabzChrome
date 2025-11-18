import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDragDrop } from '@/hooks/useDragDrop'
import { Terminal, SplitLayout } from '@/stores/simpleTerminalStore'
import { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'

/**
 * Unit Tests for useDragDrop Hook - Split Creation Focus
 *
 * Focus: Testing the critical drag-and-drop split creation logic:
 * - Dragging terminal onto another creates split container
 * - Split container has correct splitLayout structure
 * - Panes are marked isHidden: true (NEW: now false in current implementation)
 * - Split orientation based on drop position
 * - Active terminal switches to split container
 * - Original terminals remain in store
 *
 * Test Coverage Target: 60%+ of useDragDrop.ts (lines 200-360 split creation)
 */

describe('useDragDrop - Split Creation', () => {
  // Mock store state
  let storedTerminals: Terminal[]
  let visibleTerminals: Terminal[]
  let mockUpdateTerminal: ReturnType<typeof vi.fn>
  let mockReorderTerminals: ReturnType<typeof vi.fn>
  let mockSetActiveTerminal: ReturnType<typeof vi.fn>
  let mockSetFocusedTerminal: ReturnType<typeof vi.fn>

  // Mock DOM elements for drop zone detection
  let mockTabElement: HTMLElement
  let mockGetBoundingClientRect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset terminals
    storedTerminals = []
    visibleTerminals = []

    // Reset mocks
    mockUpdateTerminal = vi.fn()
    mockReorderTerminals = vi.fn()
    mockSetActiveTerminal = vi.fn()
    mockSetFocusedTerminal = vi.fn()

    // Mock DOM getBoundingClientRect
    mockGetBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 200,
      height: 50,
      right: 200,
      bottom: 50,
      x: 0,
      y: 0,
      toJSON: () => {},
    }))

    mockTabElement = {
      getBoundingClientRect: mockGetBoundingClientRect,
    } as unknown as HTMLElement

    // Mock document.querySelector
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (selector.includes('[data-tab-id=')) {
        return mockTabElement
      }
      return null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper: Create a basic terminal for testing
   */
  function createTerminal(overrides?: Partial<Terminal>): Terminal {
    return {
      id: `terminal-${Date.now()}-${Math.random()}`,
      name: 'Test Terminal',
      terminalType: 'bash',
      icon: '🐚',
      createdAt: Date.now(),
      windowId: 'main',
      splitLayout: { type: 'single', panes: [] },
      ...overrides,
    }
  }

  /**
   * Helper: Create drag event
   */
  function createDragStartEvent(activeId: string): DragStartEvent {
    return {
      active: { id: activeId, data: { current: {} }, node: { current: null } },
    } as any
  }

  /**
   * Helper: Create drag over event
   */
  function createDragOverEvent(activeId: string, overId: string): DragOverEvent {
    return {
      active: { id: activeId, data: { current: {} }, node: { current: null } },
      over: { id: overId, data: { current: {} } },
      delta: { x: 0, y: 0 },
      collisions: [],
    } as any
  }

  /**
   * Helper: Create drag end event
   */
  function createDragEndEvent(activeId: string, overId: string): DragEndEvent {
    return {
      active: { id: activeId, data: { current: {} }, node: { current: null } },
      over: { id: overId, data: { current: {} }, rect: null, disabled: false },
      delta: { x: 0, y: 0 },
      collisions: [],
    } as any
  }

  /**
   * Helper: Set mouse position for drop zone detection
   * @param x - X position relative to tab element (0-200)
   * @param y - Y position relative to tab element (0-50)
   */
  function setMousePosition(x: number, y: number) {
    // Create a mouse move event to update the hook's internal mousePosition ref
    const event = new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
    })
    window.dispatchEvent(event)
  }

  describe('Basic Split Creation', () => {
    it('should create horizontal split when dropping on top edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1', name: 'Terminal 1' })
      const terminal2 = createTerminal({ id: 'term-2', name: 'Terminal 2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Set mouse position to top edge (5% from top)
      act(() => {
        setMousePosition(100, 2) // Center X, near top Y
      })

      // Start dragging terminal1
      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      // Drag over terminal2
      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      // Drop on terminal2
      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Verify updateTerminal was called with horizontal split layout
      expect(mockUpdateTerminal).toHaveBeenCalledWith(
        'term-2',
        expect.objectContaining({
          splitLayout: expect.objectContaining({
            type: 'horizontal',
            panes: expect.arrayContaining([
              expect.objectContaining({
                terminalId: expect.stringMatching(/term-[12]/),
                size: 50,
                position: expect.stringMatching(/top|bottom/),
              }),
            ]),
          }),
        })
      )

      // Verify active terminal switches to the target (split container)
      expect(mockSetActiveTerminal).toHaveBeenCalledWith('term-2')

      // Verify focused terminal is set to the dragged terminal
      expect(mockSetFocusedTerminal).toHaveBeenCalledWith('term-1')
    })

    it('should create horizontal split when dropping on bottom edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1', name: 'Terminal 1' })
      const terminal2 = createTerminal({ id: 'term-2', name: 'Terminal 2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Set mouse position to bottom edge (95% from top)
      act(() => {
        setMousePosition(100, 48) // Center X, near bottom Y
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      expect(mockUpdateTerminal).toHaveBeenCalledWith(
        'term-2',
        expect.objectContaining({
          splitLayout: expect.objectContaining({
            type: 'horizontal',
          }),
        })
      )
    })

    it('should create vertical split when dropping on left edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1', name: 'Terminal 1' })
      const terminal2 = createTerminal({ id: 'term-2', name: 'Terminal 2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Set mouse position to left edge (5% from left)
      act(() => {
        setMousePosition(10, 25) // Near left X, center Y
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      expect(mockUpdateTerminal).toHaveBeenCalledWith(
        'term-2',
        expect.objectContaining({
          splitLayout: expect.objectContaining({
            type: 'vertical',
            panes: expect.arrayContaining([
              expect.objectContaining({
                position: expect.stringMatching(/left|right/),
              }),
            ]),
          }),
        })
      )
    })

    it('should create vertical split when dropping on right edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1', name: 'Terminal 1' })
      const terminal2 = createTerminal({ id: 'term-2', name: 'Terminal 2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Set mouse position to right edge (95% from left)
      act(() => {
        setMousePosition(190, 25) // Near right X, center Y
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      expect(mockUpdateTerminal).toHaveBeenCalledWith(
        'term-2',
        expect.objectContaining({
          splitLayout: expect.objectContaining({
            type: 'vertical',
          }),
        })
      )
    })
  })

  describe('Split Container Structure', () => {
    it('should create split with correct pane structure', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Drop on left edge to create vertical split
      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Verify split layout structure
      const updateCall = mockUpdateTerminal.mock.calls[0]
      expect(updateCall).toBeDefined()
      const splitLayout = updateCall[1].splitLayout

      expect(splitLayout).toMatchObject({
        type: 'vertical',
        panes: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            terminalId: expect.stringMatching(/term-[12]/),
            size: 50,
            position: expect.stringMatching(/left|right/),
          }),
        ]),
      })

      // Verify both terminals are in panes
      expect(splitLayout.panes).toHaveLength(2)
      const terminalIds = splitLayout.panes.map((p: any) => p.terminalId)
      expect(terminalIds).toContain('term-1')
      expect(terminalIds).toContain('term-2')
    })

    it('should order panes correctly for vertical split (left before right)', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Drop term-1 on LEFT edge of term-2
      act(() => {
        setMousePosition(10, 25) // Left edge
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      const splitLayout = mockUpdateTerminal.mock.calls[0][1].splitLayout
      expect(splitLayout.panes[0].position).toBe('left')
      expect(splitLayout.panes[1].position).toBe('right')

      // Dragged terminal (term-1) should be in left position
      expect(splitLayout.panes[0].terminalId).toBe('term-1')
      expect(splitLayout.panes[1].terminalId).toBe('term-2')
    })

    it('should order panes correctly for horizontal split (top before bottom)', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Drop term-1 on TOP edge of term-2
      act(() => {
        setMousePosition(100, 2) // Top edge
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      const splitLayout = mockUpdateTerminal.mock.calls[0][1].splitLayout
      expect(splitLayout.panes[0].position).toBe('top')
      expect(splitLayout.panes[1].position).toBe('bottom')

      // Dragged terminal (term-1) should be in top position
      expect(splitLayout.panes[0].terminalId).toBe('term-1')
      expect(splitLayout.panes[1].terminalId).toBe('term-2')
    })

    it('should assign 50/50 split size to both panes', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      const splitLayout = mockUpdateTerminal.mock.calls[0][1].splitLayout
      expect(splitLayout.panes[0].size).toBe(50)
      expect(splitLayout.panes[1].size).toBe(50)
    })
  })

  describe('Pane State Management', () => {
    it('should NOT mark panes as isHidden (current implementation)', async () => {
      // NOTE: Current implementation (lines 283-285) does NOT hide pane terminals
      // Comment says: "NEW APPROACH: Don't hide pane terminals - they show as separate tabs"
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Should NOT call updateTerminal to set isHidden on panes
      const hiddenCalls = mockUpdateTerminal.mock.calls.filter(
        (call) => call[1].isHidden === true
      )
      expect(hiddenCalls.length).toBe(0)
    })

    it('should keep original terminals in store (not removed)', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Verify updateTerminal was only called to update term-2 with split layout
      // (no calls to remove terminals)
      expect(mockUpdateTerminal).toHaveBeenCalledTimes(1)
      expect(mockUpdateTerminal).toHaveBeenCalledWith('term-2', expect.any(Object))
    })
  })

  describe('Active Terminal Management', () => {
    it('should switch active terminal to split container', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Active terminal should be set to term-2 (the split container)
      expect(mockSetActiveTerminal).toHaveBeenCalledWith('term-2')
    })

    it('should set focused terminal to the dragged terminal', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Focused terminal should be set to term-1 (the newly merged terminal)
      expect(mockSetFocusedTerminal).toHaveBeenCalledWith('term-1')
    })
  })

  describe('Center Zone Reordering (Not Splitting)', () => {
    it('should reorder tabs when dropping in center zone (not split)', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Set mouse position to center zone (50% X, 50% Y)
      act(() => {
        setMousePosition(100, 25) // Center of tab
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Should call reorderTerminals, not updateTerminal (no split)
      expect(mockReorderTerminals).toHaveBeenCalled()
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })

    it('should NOT create split in center zone', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(100, 25) // Center
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Verify NO splitLayout was created
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })
  })

  describe('Split Prevention Logic', () => {
    it('should prevent merging into terminal that already has splits', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({
        id: 'term-2',
        splitLayout: {
          type: 'vertical',
          panes: [
            { id: 'pane-1', terminalId: 'term-3', size: 50, position: 'left' },
            { id: 'pane-2', terminalId: 'term-4', size: 50, position: 'right' },
          ],
        },
      })
      const terminal3 = createTerminal({ id: 'term-3', isHidden: true })
      const terminal4 = createTerminal({ id: 'term-4', isHidden: true })
      storedTerminals = [terminal1, terminal2, terminal3, terminal4]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Try to drop term-1 on term-2 (which is already a split)
      act(() => {
        setMousePosition(10, 25) // Left edge
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Should NOT create new split (no updateTerminal call for split)
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })

    it('should prevent dragging split pane terminal', async () => {
      const terminal1 = createTerminal({ id: 'term-1', isHidden: true })
      const terminal2 = createTerminal({ id: 'term-2' })
      const splitContainer = createTerminal({
        id: 'split-1',
        splitLayout: {
          type: 'vertical',
          panes: [
            { id: 'pane-1', terminalId: 'term-1', size: 50, position: 'left' },
            { id: 'pane-2', terminalId: 'term-2', size: 50, position: 'right' },
          ],
        },
      })
      storedTerminals = [terminal1, terminal2, splitContainer]
      visibleTerminals = [terminal1, terminal2, splitContainer]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Try to drag term-1 (which is part of a split)
      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      // Create a standalone terminal to drop onto
      const terminal3 = createTerminal({ id: 'term-3' })
      storedTerminals.push(terminal3)
      visibleTerminals.push(terminal3)

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-3'))
      })

      // Should NOT create split (no updateTerminal call)
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
    })
  })

  describe('Drop Zone Detection', () => {
    it('should detect "left" zone when mouse is within 15% of left edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Test 0% (far left) - should be 'left'
      act(() => {
        setMousePosition(0, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      expect(result.current.dropZoneState).toEqual({
        terminalId: 'term-2',
        zone: 'left',
      })

      // Test 14% (just inside left edge) - should be 'left'
      act(() => {
        setMousePosition(28, 25) // 14% of 200px
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      expect(result.current.dropZoneState).toEqual({
        terminalId: 'term-2',
        zone: 'left',
      })
    })

    it('should detect "right" zone when mouse is within 15% of right edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Test 86% (just inside right edge) - should be 'right'
      act(() => {
        setMousePosition(172, 25) // 86% of 200px
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      expect(result.current.dropZoneState).toEqual({
        terminalId: 'term-2',
        zone: 'right',
      })
    })

    it('should detect "top" zone when mouse is within 15% of top edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Test 5% (near top) - should be 'top'
      act(() => {
        setMousePosition(100, 2) // 5% of 50px height
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      expect(result.current.dropZoneState).toEqual({
        terminalId: 'term-2',
        zone: 'top',
      })
    })

    it('should detect "bottom" zone when mouse is within 15% of bottom edge', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      // Test 95% (near bottom) - should be 'bottom'
      act(() => {
        setMousePosition(100, 48) // 95% of 50px height
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragOver(createDragOverEvent('term-1', 'term-2'))
      })

      expect(result.current.dropZoneState).toEqual({
        terminalId: 'term-2',
        zone: 'bottom',
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle drag without drop (no over target)', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      storedTerminals = [terminal1]
      visibleTerminals = [terminal1]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      // End drag without 'over' target
      act(() => {
        result.current.handleDragEnd({
          active: { id: 'term-1', data: { current: {} }, node: { current: null } },
          over: null,
          delta: { x: 0, y: 0 },
          collisions: [],
        } as any)
      })

      // Should not crash, no updates called
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
      expect(mockReorderTerminals).not.toHaveBeenCalled()
    })

    it('should handle dragging over self (no split)', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      storedTerminals = [terminal1]
      visibleTerminals = [terminal1]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-1'))
      })

      // Should not create split or reorder
      expect(mockUpdateTerminal).not.toHaveBeenCalled()
      expect(mockReorderTerminals).not.toHaveBeenCalled()
    })

    it('should clear drag state after drag end', async () => {
      const terminal1 = createTerminal({ id: 'term-1' })
      const terminal2 = createTerminal({ id: 'term-2' })
      storedTerminals = [terminal1, terminal2]
      visibleTerminals = [terminal1, terminal2]

      const { result } = renderHook(() =>
        useDragDrop(
          storedTerminals,
          visibleTerminals,
          mockUpdateTerminal,
          mockReorderTerminals,
          mockSetActiveTerminal,
          mockSetFocusedTerminal
        )
      )

      act(() => {
        setMousePosition(10, 25)
      })

      act(() => {
        result.current.handleDragStart(createDragStartEvent('term-1'))
      })

      // Should have drag state
      expect(result.current.draggedTerminalId).toBe('term-1')

      act(() => {
        result.current.handleDragEnd(createDragEndEvent('term-1', 'term-2'))
      })

      // Should clear drag state
      expect(result.current.draggedTerminalId).toBeNull()
      expect(result.current.dropZoneState).toBeNull()
    })
  })
})
