import { useState, useRef, useEffect } from 'react'
import {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Terminal as StoredTerminal } from '../stores/simpleTerminalStore'

// Drop zone type
type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null

/**
 * Custom hook for drag-and-drop functionality.
 *
 * Handles:
 * - Tab reordering via drag-and-drop (center zones)
 * - Tab merging into splits (edge zones)
 * - Drop zone detection and visual feedback
 * - Preventing splits into already-split tabs
 *
 * @param storedTerminals - Array of all stored terminals
 * @param visibleTerminals - Array of visible terminals (filtered by window)
 * @param updateTerminal - Function to update terminal properties
 * @param reorderTerminals - Function to reorder terminals array
 * @param setActiveTerminal - Function to set active terminal
 * @param setFocusedTerminal - Function to set focused terminal (for split panes)
 * @returns Object with drag handlers, sensors, and collision detection
 */
export function useDragDrop(
  storedTerminals: StoredTerminal[],
  visibleTerminals: StoredTerminal[],
  updateTerminal: (id: string, updates: Partial<StoredTerminal>) => void,
  reorderTerminals: (terminals: StoredTerminal[]) => void,
  setActiveTerminal: (id: string | null) => void,
  setFocusedTerminal: (id: string | null) => void
) {
  // Drag-and-drop state for drop zones
  const [draggedTerminalId, setDraggedTerminalId] = useState<string | null>(null)
  const [dropZoneState, setDropZoneState] = useState<{ terminalId: string; zone: DropZone } | null>(null)
  const mousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  /**
   * Check if a terminal is part of a split (as a pane, not as the container)
   * Returns true if this terminal is referenced in another terminal's splitLayout.panes
   */
  const isTerminalPartOfSplit = (terminalId: string): boolean => {
    return visibleTerminals.some(t =>
      t.splitLayout?.panes?.some(p => p.terminalId === terminalId)
    )
  }

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts (allows clicks to work)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Use pointer-only collision detection (no sortable auto-reordering)
  // We handle reordering manually in handleDragEnd
  const customCollisionDetection = pointerWithin

  // Track mouse position for drop zone detection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePosition.current = { x: e.clientX, y: e.clientY }

      // If dragging, continuously update drop zone
      if (draggedTerminalId && dropZoneState) {
        const zone = detectDropZone(dropZoneState.terminalId)

        // PREVENT MERGE INTO/FROM SPLIT PANES: Block if either source or target is part of a split
        const targetTerminal = storedTerminals.find(t => t.id === dropZoneState.terminalId)
        const isTargetSplitContainer = targetTerminal?.splitLayout && targetTerminal.splitLayout.type !== 'single'
        const isTargetSplitPane = isTerminalPartOfSplit(dropZoneState.terminalId)
        const isSourceSplitPane = isTerminalPartOfSplit(draggedTerminalId)

        if (isTargetSplitContainer || isTargetSplitPane || isSourceSplitPane) {
          // Check if we're in an edge zone (trying to split)
          const tabElement = document.querySelector(`[data-tab-id="${dropZoneState.terminalId}"]`)
          if (tabElement) {
            const rect = tabElement.getBoundingClientRect()
            const xPercent = (mousePosition.current.x - rect.left) / rect.width
            const yPercent = (mousePosition.current.y - rect.top) / rect.height
            const edgeThreshold = 0.15

            const isEdgeZone =
              yPercent < edgeThreshold ||
              yPercent > 1 - edgeThreshold ||
              xPercent < edgeThreshold ||
              xPercent > 1 - edgeThreshold

            if (isEdgeZone) {
              // In edge zone trying to split - disable drop zone completely
              if (zone !== null) {
                setDropZoneState({ terminalId: dropZoneState.terminalId, zone: null })
              }
              return
            }
          }
        }

        // Only update if zone actually changed (avoid unnecessary re-renders)
        if (zone !== dropZoneState.zone) {
          setDropZoneState({ terminalId: dropZoneState.terminalId, zone })
        }
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [draggedTerminalId, dropZoneState, storedTerminals])

  /**
   * Detect drop zone based on actual mouse position over element
   * NEW MODEL: Edge 15% on all sides = split, center 70% = reorder (easier to hit!)
   */
  const detectDropZone = (overTabId: string): DropZone => {
    // Get the DOM element for the tab being hovered over
    const tabElement = document.querySelector(`[data-tab-id="${overTabId}"]`)
    if (!tabElement) return 'center'

    const rect = tabElement.getBoundingClientRect()
    const mouseX = mousePosition.current.x
    const mouseY = mousePosition.current.y

    // Calculate relative position within the tab
    const relativeX = mouseX - rect.left
    const relativeY = mouseY - rect.top

    // Calculate percentages (0-1)
    const xPercent = relativeX / rect.width
    const yPercent = relativeY / rect.height

    // Edge zones for SPLITS (15% on all sides = easier to hit center for reordering)
    const edgeThreshold = 0.15

    // Check all 4 edges (priority: top/bottom first, then left/right)
    if (yPercent < edgeThreshold) return 'top'
    if (yPercent > 1 - edgeThreshold) return 'bottom'
    if (xPercent < edgeThreshold) return 'left'
    if (xPercent > 1 - edgeThreshold) return 'right'

    // Center area (70% x 70%) is for REORDERING (easier to hit than before!)
    // Left half of center vs right half of center
    return xPercent < 0.5 ? 'left' : 'right'
  }

  /**
   * Handle drag start
   */
  const handleDragStart = (event: DragStartEvent) => {
    setDraggedTerminalId(event.active.id as string)
  }

  /**
   * Handle drag over - update drop zone visual
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event

    if (!over || !draggedTerminalId) {
      setDropZoneState(null)
      return
    }

    // Don't show drop zone when dragging over self
    if (over.id === draggedTerminalId) {
      setDropZoneState(null)
      return
    }

    // PREVENT MERGE INTO/FROM SPLIT PANES: Block if either source or target is part of a split
    const targetTerminal = storedTerminals.find(t => t.id === over.id)
    const isTargetSplitContainer = targetTerminal?.splitLayout && targetTerminal.splitLayout.type !== 'single'
    const isTargetSplitPane = isTerminalPartOfSplit(over.id as string)
    const isSourceSplitPane = isTerminalPartOfSplit(draggedTerminalId)

    if (isTargetSplitContainer || isTargetSplitPane || isSourceSplitPane) {
      const zone = detectDropZone(over.id as string)
      // Check if detected zone is in an edge (trying to split)
      const tabElement = document.querySelector(`[data-tab-id="${over.id}"]`)
      if (tabElement) {
        const rect = tabElement.getBoundingClientRect()
        const xPercent = (mousePosition.current.x - rect.left) / rect.width
        const yPercent = (mousePosition.current.y - rect.top) / rect.height
        const edgeThreshold = 0.15

        const isEdgeZone =
          yPercent < edgeThreshold ||
          yPercent > 1 - edgeThreshold ||
          xPercent < edgeThreshold ||
          xPercent > 1 - edgeThreshold

        if (isEdgeZone) {
          // In edge zone trying to split - completely disable drop zone
          setDropZoneState({ terminalId: over.id as string, zone: null })
          return
        }
      }
    }

    const zone = detectDropZone(over.id as string)
    setDropZoneState({ terminalId: over.id as string, zone })
  }

  /**
   * Handle merge - create split layout
   */
  const handleMerge = (sourceTabId: string, targetTabId: string, dropZone: DropZone) => {
    if (!dropZone || dropZone === 'center') {
      console.error('[useDragDrop] Invalid drop zone for merge:', dropZone)
      return
    }

    // PREVENT MERGE INTO/FROM SPLIT PANES: Check if either source or target is part of a split
    const targetTerminal = storedTerminals.find(t => t.id === targetTabId)
    const isTargetSplitContainer = targetTerminal?.splitLayout && targetTerminal.splitLayout.type !== 'single'
    const isTargetSplitPane = isTerminalPartOfSplit(targetTabId)
    const isSourceSplitPane = isTerminalPartOfSplit(sourceTabId)

    if (isTargetSplitContainer) {
      console.warn('[useDragDrop] Cannot merge into tab that already has splits:', targetTabId)
      console.log('[useDragDrop] 💡 Tip: Pop out panes to new tabs first, or drag to reorder tabs instead')
      return
    }

    if (isTargetSplitPane || isSourceSplitPane) {
      console.warn('[useDragDrop] Cannot merge split panes - they are locked together')
      console.log('[useDragDrop] 💡 Tip: Use context menu "Unsplit" to convert panes to regular tabs first')
      return
    }

    const splitType = (dropZone === 'left' || dropZone === 'right') ? 'vertical' : 'horizontal'

    console.log(`[useDragDrop] Merging ${sourceTabId} into ${targetTabId} (${dropZone} → ${splitType} split)`)

    // Determine pane positions based on drop zone
    const sourcePosition = dropZone // Source goes where we dropped (left/right/top/bottom)
    const targetPosition =
      dropZone === 'left' ? 'right' :
      dropZone === 'right' ? 'left' :
      dropZone === 'top' ? 'bottom' : 'top'

    // Order panes by visual position (left before right, top before bottom)
    const panes = []
    if (splitType === 'vertical') {
      // Left pane first, right pane second
      if (sourcePosition === 'left') {
        panes.push({ id: `pane-${Date.now()}-1`, terminalId: sourceTabId, size: 50, position: 'left' })
        panes.push({ id: `pane-${Date.now()}-2`, terminalId: targetTabId, size: 50, position: 'right' })
      } else {
        panes.push({ id: `pane-${Date.now()}-1`, terminalId: targetTabId, size: 50, position: 'left' })
        panes.push({ id: `pane-${Date.now()}-2`, terminalId: sourceTabId, size: 50, position: 'right' })
      }
    } else {
      // Top pane first, bottom pane second
      if (sourcePosition === 'top') {
        panes.push({ id: `pane-${Date.now()}-1`, terminalId: sourceTabId, size: 50, position: 'top' })
        panes.push({ id: `pane-${Date.now()}-2`, terminalId: targetTabId, size: 50, position: 'bottom' })
      } else {
        panes.push({ id: `pane-${Date.now()}-1`, terminalId: targetTabId, size: 50, position: 'top' })
        panes.push({ id: `pane-${Date.now()}-2`, terminalId: sourceTabId, size: 50, position: 'bottom' })
      }
    }

    // Update target tab to have split layout
    updateTerminal(targetTabId, {
      splitLayout: {
        type: splitType,
        panes,
      },
    })

    // NEW APPROACH: Don't hide pane terminals - they show as separate tabs with merged styling
    // The container (target) is hidden via filter in SimpleTerminalApp.tsx
    // Both panes (target and source) remain visible in tab bar

    setActiveTerminal(targetTabId)
    // Focus the newly merged terminal
    setFocusedTerminal(sourceTabId)

    console.log(`[useDragDrop] ✅ Created ${splitType} split: ${targetTabId} (${targetPosition}) + ${sourceTabId} (${sourcePosition})`)
  }

  /**
   * Handle drag end - reorder tabs or merge
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    // Save current drop zone state before clearing
    const currentDropZone = dropZoneState

    // Clear drag state
    setDraggedTerminalId(null)
    setDropZoneState(null)

    if (!over || active.id === over.id) {
      return
    }

    // NEW MODEL: All 4 edges = split, center (left/right halves) = reorder
    if (currentDropZone && currentDropZone.zone) {
      // Check if this is an edge zone (split) or center zone (reorder)
      const targetElement = document.querySelector(`[data-tab-id="${over.id}"]`)
      if (targetElement) {
        const rect = targetElement.getBoundingClientRect()
        const mouseX = mousePosition.current.x
        const mouseY = mousePosition.current.y
        const xPercent = (mouseX - rect.left) / rect.width
        const yPercent = (mouseY - rect.top) / rect.height
        const edgeThreshold = 0.15

        // Determine if we're in an edge zone or center zone
        const isEdgeZone =
          yPercent < edgeThreshold ||
          yPercent > 1 - edgeThreshold ||
          xPercent < edgeThreshold ||
          xPercent > 1 - edgeThreshold

        if (isEdgeZone) {
          // Edge zone = create split
          handleMerge(active.id as string, over.id as string, currentDropZone.zone)
          return
        } else {
          // Center zone = reorder tabs
          const oldIndex = visibleTerminals.findIndex(t => t.id === active.id)
          const newIndex = visibleTerminals.findIndex(t => t.id === over.id)

          if (oldIndex !== -1 && newIndex !== -1) {
            // If dropping on right half of center, insert AFTER the target
            const insertIndex = currentDropZone.zone === 'right' ? newIndex + 1 : newIndex

            // Create new order
            const reordered = [...visibleTerminals]
            const [removed] = reordered.splice(oldIndex, 1)
            // Adjust insert index if we removed an item before it
            const adjustedInsertIndex = oldIndex < insertIndex ? insertIndex - 1 : insertIndex
            reordered.splice(adjustedInsertIndex, 0, removed)

            // Preserve hidden terminals
            const hiddenTerminals = storedTerminals.filter(t => t.isHidden)
            const newOrder = [...reordered, ...hiddenTerminals]
            reorderTerminals(newOrder)
            console.log(`[useDragDrop] Reordered tabs: ${active.id} moved from ${oldIndex} to ${adjustedInsertIndex}`)
          }
          return
        }
      }
    }
  }

  return {
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    customCollisionDetection,
    detectDropZone,
    draggedTerminalId,
    dropZoneState,
    mousePosition
  }
}
