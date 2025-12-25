import { useState, useCallback } from 'react'

export type DropPosition = 'above' | 'below' | null

export interface DragDropState<T> {
  draggedItem: T | null
  dragOverItem: T | null
  dropPosition: DropPosition
}

export interface UseDragDropReturn<T> {
  draggedItem: T | null
  dragOverItem: T | null
  dropPosition: DropPosition
  setDraggedItem: (item: T | null) => void
  setDragOverItem: (item: T | null) => void
  setDropPosition: (position: DropPosition) => void
  resetDragState: () => void
  isDragging: boolean
  isDragOver: (item: T) => boolean
}

/**
 * Hook to manage drag-and-drop state
 * - Tracks which item is being dragged
 * - Tracks which item is being hovered over
 * - Tracks drop position (above/below) for insert indicators
 *
 * @param compareFn - Optional function to compare items (defaults to strict equality)
 * @returns Drag state and setters
 */
export function useDragDrop<T>(
  compareFn?: (a: T, b: T) => boolean
): UseDragDropReturn<T> {
  const [draggedItem, setDraggedItem] = useState<T | null>(null)
  const [dragOverItem, setDragOverItem] = useState<T | null>(null)
  const [dropPosition, setDropPosition] = useState<DropPosition>(null)

  const compare = compareFn ?? ((a: T, b: T) => a === b)

  const resetDragState = useCallback(() => {
    setDraggedItem(null)
    setDragOverItem(null)
    setDropPosition(null)
  }, [])

  const isDragging = draggedItem !== null

  const isDragOver = useCallback((item: T): boolean => {
    return dragOverItem !== null && compare(dragOverItem, item)
  }, [dragOverItem, compare])

  return {
    draggedItem,
    dragOverItem,
    dropPosition,
    setDraggedItem,
    setDragOverItem,
    setDropPosition,
    resetDragState,
    isDragging,
    isDragOver,
  }
}
