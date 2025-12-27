import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDragDrop } from '../../../extension/hooks/useDragDrop'

describe('useDragDrop', () => {
  describe('initial state', () => {
    it('should start with null draggedItem', () => {
      const { result } = renderHook(() => useDragDrop<string>())
      expect(result.current.draggedItem).toBeNull()
    })

    it('should start with null dragOverItem', () => {
      const { result } = renderHook(() => useDragDrop<string>())
      expect(result.current.dragOverItem).toBeNull()
    })

    it('should start with null dropPosition', () => {
      const { result } = renderHook(() => useDragDrop<string>())
      expect(result.current.dropPosition).toBeNull()
    })

    it('should start with isDragging as false', () => {
      const { result } = renderHook(() => useDragDrop<string>())
      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('setDraggedItem', () => {
    it('should set draggedItem', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDraggedItem('item-1')
      })

      expect(result.current.draggedItem).toBe('item-1')
    })

    it('should set isDragging to true when item is set', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDraggedItem('item-1')
      })

      expect(result.current.isDragging).toBe(true)
    })

    it('should set isDragging to false when item is cleared', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDraggedItem('item-1')
      })

      act(() => {
        result.current.setDraggedItem(null)
      })

      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('setDragOverItem', () => {
    it('should set dragOverItem', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDragOverItem('item-2')
      })

      expect(result.current.dragOverItem).toBe('item-2')
    })

    it('should clear dragOverItem when set to null', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDragOverItem('item-2')
      })

      act(() => {
        result.current.setDragOverItem(null)
      })

      expect(result.current.dragOverItem).toBeNull()
    })
  })

  describe('setDropPosition', () => {
    it('should set dropPosition to above', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDropPosition('above')
      })

      expect(result.current.dropPosition).toBe('above')
    })

    it('should set dropPosition to below', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDropPosition('below')
      })

      expect(result.current.dropPosition).toBe('below')
    })

    it('should clear dropPosition when set to null', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDropPosition('above')
      })

      act(() => {
        result.current.setDropPosition(null)
      })

      expect(result.current.dropPosition).toBeNull()
    })
  })

  describe('resetDragState', () => {
    it('should reset all drag state to initial values', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      // Set up some state
      act(() => {
        result.current.setDraggedItem('item-1')
        result.current.setDragOverItem('item-2')
        result.current.setDropPosition('above')
      })

      // Verify state is set
      expect(result.current.draggedItem).toBe('item-1')
      expect(result.current.dragOverItem).toBe('item-2')
      expect(result.current.dropPosition).toBe('above')

      // Reset
      act(() => {
        result.current.resetDragState()
      })

      // Verify all reset
      expect(result.current.draggedItem).toBeNull()
      expect(result.current.dragOverItem).toBeNull()
      expect(result.current.dropPosition).toBeNull()
      expect(result.current.isDragging).toBe(false)
    })
  })

  describe('isDragOver', () => {
    it('should return true when item matches dragOverItem', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDragOverItem('item-2')
      })

      expect(result.current.isDragOver('item-2')).toBe(true)
    })

    it('should return false when item does not match dragOverItem', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      act(() => {
        result.current.setDragOverItem('item-2')
      })

      expect(result.current.isDragOver('item-1')).toBe(false)
    })

    it('should return false when dragOverItem is null', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      expect(result.current.isDragOver('item-1')).toBe(false)
    })
  })

  describe('custom compareFn', () => {
    interface Item {
      id: string
      name: string
    }

    it('should use custom compare function for isDragOver', () => {
      const compareFn = (a: Item, b: Item) => a.id === b.id

      const { result } = renderHook(() => useDragDrop<Item>(compareFn))

      const item1 = { id: '1', name: 'Item 1' }
      const item2 = { id: '1', name: 'Different Name' }

      act(() => {
        result.current.setDragOverItem(item1)
      })

      // Same ID but different object reference - should match with custom compareFn
      expect(result.current.isDragOver(item2)).toBe(true)
    })

    it('should use strict equality without custom compare function', () => {
      const { result } = renderHook(() => useDragDrop<Item>())

      const item1 = { id: '1', name: 'Item 1' }
      const item2 = { id: '1', name: 'Item 1' }

      act(() => {
        result.current.setDragOverItem(item1)
      })

      // Same values but different reference - should not match with default compareFn
      expect(result.current.isDragOver(item2)).toBe(false)
      // Same reference - should match
      expect(result.current.isDragOver(item1)).toBe(true)
    })
  })

  describe('with number type', () => {
    it('should work with number type', () => {
      const { result } = renderHook(() => useDragDrop<number>())

      act(() => {
        result.current.setDraggedItem(42)
        result.current.setDragOverItem(100)
      })

      expect(result.current.draggedItem).toBe(42)
      expect(result.current.dragOverItem).toBe(100)
      expect(result.current.isDragOver(100)).toBe(true)
      expect(result.current.isDragOver(42)).toBe(false)
    })
  })

  describe('typical drag workflow', () => {
    it('should handle complete drag and drop workflow', () => {
      const { result } = renderHook(() => useDragDrop<string>())

      // Start dragging item-1
      act(() => {
        result.current.setDraggedItem('item-1')
      })
      expect(result.current.isDragging).toBe(true)
      expect(result.current.draggedItem).toBe('item-1')

      // Drag over item-2
      act(() => {
        result.current.setDragOverItem('item-2')
        result.current.setDropPosition('above')
      })
      expect(result.current.isDragOver('item-2')).toBe(true)
      expect(result.current.dropPosition).toBe('above')

      // Leave item-2, enter item-3
      act(() => {
        result.current.setDragOverItem('item-3')
        result.current.setDropPosition('below')
      })
      expect(result.current.isDragOver('item-2')).toBe(false)
      expect(result.current.isDragOver('item-3')).toBe(true)
      expect(result.current.dropPosition).toBe('below')

      // Drop - reset all state
      act(() => {
        result.current.resetDragState()
      })
      expect(result.current.isDragging).toBe(false)
      expect(result.current.draggedItem).toBeNull()
      expect(result.current.dragOverItem).toBeNull()
      expect(result.current.dropPosition).toBeNull()
    })
  })
})
