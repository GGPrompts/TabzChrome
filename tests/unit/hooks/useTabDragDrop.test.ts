import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabDragDrop } from '../../../extension/hooks/useTabDragDrop'
import type { TerminalSession } from '../../../extension/hooks/useTerminalSessions'

// Helper to create mock sessions
function createMockSessions(count: number): TerminalSession[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tab-${i + 1}`,
    name: `Tab ${i + 1}`,
    profile: {
      id: `profile-${i + 1}`,
      name: `Profile ${i + 1}`,
      workingDir: '~',
      fontSize: 16,
      fontFamily: 'monospace',
      themeName: 'high-contrast',
    },
  }))
}

// Helper to create mock DragEvent
function createMockDragEvent(overrides: Partial<React.DragEvent> = {}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      setData: vi.fn(),
      getData: vi.fn(),
      clearData: vi.fn(),
    },
    ...overrides,
  } as unknown as React.DragEvent
}

describe('useTabDragDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should start with null draggedTabId', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      expect(result.current.draggedTabId).toBeNull()
    })

    it('should start with null dragOverTabId', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      expect(result.current.dragOverTabId).toBeNull()
    })
  })

  describe('handleTabDragStart', () => {
    it('should set draggedTabId on drag start', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleTabDragStart(event, 'tab-1')
      })

      expect(result.current.draggedTabId).toBe('tab-1')
    })

    it('should set effectAllowed to move', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleTabDragStart(event, 'tab-1')
      })

      expect(event.dataTransfer.effectAllowed).toBe('move')
    })

    it('should set data transfer data with tab id', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleTabDragStart(event, 'tab-2')
      })

      expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'tab-2')
    })
  })

  describe('handleTabDragOver', () => {
    it('should prevent default event behavior', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      // First start dragging
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(event, 'tab-2')
      })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should set dropEffect to move', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(event, 'tab-2')
      })

      expect(event.dataTransfer.dropEffect).toBe('move')
    })

    it('should set dragOverTabId when hovering over different tab', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-2')
      })

      expect(result.current.dragOverTabId).toBe('tab-2')
    })

    it('should not set dragOverTabId when hovering over same tab being dragged', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-1')
      })

      expect(result.current.dragOverTabId).toBeNull()
    })

    it('should not set dragOverTabId when no tab is being dragged', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-2')
      })

      expect(result.current.dragOverTabId).toBeNull()
    })
  })

  describe('handleTabDragLeave', () => {
    it('should clear dragOverTabId', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Start drag and hover over a tab
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-2')
      })

      expect(result.current.dragOverTabId).toBe('tab-2')

      // Leave the tab
      act(() => {
        result.current.handleTabDragLeave()
      })

      expect(result.current.dragOverTabId).toBeNull()
    })
  })

  describe('handleTabDrop', () => {
    it('should prevent default event behavior', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDrop(event, 'tab-2')
      })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should reorder sessions when dropping on different tab', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-3')
      })

      expect(setSessions).toHaveBeenCalled()
      const newSessions = setSessions.mock.calls[0][0]

      // Tab 1 should now be at position 2 (0-indexed)
      expect(newSessions[0].id).toBe('tab-2')
      expect(newSessions[1].id).toBe('tab-3')
      expect(newSessions[2].id).toBe('tab-1')
    })

    it('should persist new order to Chrome storage', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-2')
      })

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        terminalSessions: expect.any(Array),
      })
    })

    it('should reset drag state after drop', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-2')
      })

      expect(result.current.draggedTabId).toBeNull()
      expect(result.current.dragOverTabId).toBeNull()
    })

    it('should not reorder when dropping on same tab', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-1')
      })

      expect(setSessions).not.toHaveBeenCalled()
    })

    it('should not reorder when no tab is being dragged', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-2')
      })

      expect(setSessions).not.toHaveBeenCalled()
    })

    it('should handle reordering tabs forward', () => {
      const sessions = createMockSessions(4)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Drag tab-1 to position of tab-4
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-4')
      })

      const newSessions = setSessions.mock.calls[0][0]
      expect(newSessions.map((s: TerminalSession) => s.id)).toEqual([
        'tab-2', 'tab-3', 'tab-4', 'tab-1'
      ])
    })

    it('should handle reordering tabs backward', () => {
      const sessions = createMockSessions(4)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Drag tab-4 to position of tab-1
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-4')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-1')
      })

      const newSessions = setSessions.mock.calls[0][0]
      expect(newSessions.map((s: TerminalSession) => s.id)).toEqual([
        'tab-4', 'tab-1', 'tab-2', 'tab-3'
      ])
    })

    it('should not call setSessions when dragged tab not found', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Start drag, then update hook with different sessions (simulating stale state)
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'non-existent-tab')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-2')
      })

      expect(setSessions).not.toHaveBeenCalled()
    })
  })

  describe('handleTabDragEnd', () => {
    it('should reset all drag state', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Set up drag state
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-2')
      })

      expect(result.current.draggedTabId).toBe('tab-1')
      expect(result.current.dragOverTabId).toBe('tab-2')

      // End drag
      act(() => {
        result.current.handleTabDragEnd()
      })

      expect(result.current.draggedTabId).toBeNull()
      expect(result.current.dragOverTabId).toBeNull()
    })
  })

  describe('handleEndZoneDragOver', () => {
    it('should prevent default event behavior', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleEndZoneDragOver(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should set dropEffect to move', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleEndZoneDragOver(event)
      })

      expect(event.dataTransfer.dropEffect).toBe('move')
    })

    it('should set dragOverTabId to __end__', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleEndZoneDragOver(createMockDragEvent())
      })

      expect(result.current.dragOverTabId).toBe('__end__')
    })
  })

  describe('handleEndZoneDrop', () => {
    it('should prevent default event behavior', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      const event = createMockDragEvent()

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleEndZoneDrop(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should move dragged tab to end of list', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleEndZoneDrop(createMockDragEvent())
      })

      const newSessions = setSessions.mock.calls[0][0]
      expect(newSessions.map((s: TerminalSession) => s.id)).toEqual([
        'tab-2', 'tab-3', 'tab-1'
      ])
    })

    it('should persist new order to Chrome storage', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleEndZoneDrop(createMockDragEvent())
      })

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        terminalSessions: expect.any(Array),
      })
    })

    it('should reset drag state after drop', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleEndZoneDrop(createMockDragEvent())
      })

      expect(result.current.draggedTabId).toBeNull()
      expect(result.current.dragOverTabId).toBeNull()
    })

    it('should not move tab already at end of list', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Drag the last tab
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-3')
      })

      act(() => {
        result.current.handleEndZoneDrop(createMockDragEvent())
      })

      // Should not call setSessions since tab is already at end
      expect(setSessions).not.toHaveBeenCalled()
    })

    it('should do nothing when no tab is being dragged', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      act(() => {
        result.current.handleEndZoneDrop(createMockDragEvent())
      })

      expect(setSessions).not.toHaveBeenCalled()
    })
  })

  describe('complete drag workflow', () => {
    it('should handle full drag and drop to reorder', () => {
      const sessions = createMockSessions(4)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Start dragging tab-2
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-2')
      })
      expect(result.current.draggedTabId).toBe('tab-2')

      // Drag over tab-3
      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-3')
      })
      expect(result.current.dragOverTabId).toBe('tab-3')

      // Leave tab-3
      act(() => {
        result.current.handleTabDragLeave()
      })
      expect(result.current.dragOverTabId).toBeNull()

      // Drag over tab-4
      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-4')
      })
      expect(result.current.dragOverTabId).toBe('tab-4')

      // Drop on tab-4
      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-4')
      })

      // Verify reorder: tab-2 moved to tab-4's position
      const newSessions = setSessions.mock.calls[0][0]
      expect(newSessions.map((s: TerminalSession) => s.id)).toEqual([
        'tab-1', 'tab-3', 'tab-4', 'tab-2'
      ])

      // Verify state reset
      expect(result.current.draggedTabId).toBeNull()
      expect(result.current.dragOverTabId).toBeNull()
    })

    it('should handle cancelled drag (drag end without drop)', () => {
      const sessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result } = renderHook(() =>
        useTabDragDrop({ sessions, setSessions })
      )

      // Start dragging
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-1')
      })

      act(() => {
        result.current.handleTabDragOver(createMockDragEvent(), 'tab-2')
      })

      // Cancel drag (drag end without drop)
      act(() => {
        result.current.handleTabDragEnd()
      })

      // Should not reorder
      expect(setSessions).not.toHaveBeenCalled()

      // State should be reset
      expect(result.current.draggedTabId).toBeNull()
      expect(result.current.dragOverTabId).toBeNull()
    })
  })

  describe('sessions update handling', () => {
    it('should work with updated sessions prop', () => {
      const initialSessions = createMockSessions(3)
      const setSessions = vi.fn()

      const { result, rerender } = renderHook(
        ({ sessions }) => useTabDragDrop({ sessions, setSessions }),
        { initialProps: { sessions: initialSessions } }
      )

      // Add a new session
      const updatedSessions = [...initialSessions, {
        id: 'tab-4',
        name: 'Tab 4',
        profile: {
          id: 'profile-4',
          name: 'Profile 4',
          workingDir: '~',
          fontSize: 16,
          fontFamily: 'monospace',
          themeName: 'high-contrast',
        },
      }]

      rerender({ sessions: updatedSessions })

      // Drag new tab to beginning
      act(() => {
        result.current.handleTabDragStart(createMockDragEvent(), 'tab-4')
      })

      act(() => {
        result.current.handleTabDrop(createMockDragEvent(), 'tab-1')
      })

      const newSessions = setSessions.mock.calls[0][0]
      expect(newSessions.map((s: TerminalSession) => s.id)).toEqual([
        'tab-4', 'tab-1', 'tab-2', 'tab-3'
      ])
    })
  })
})
