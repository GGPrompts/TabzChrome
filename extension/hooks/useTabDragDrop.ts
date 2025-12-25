import { useCallback } from 'react'
import type { TerminalSession } from './useTerminalSessions'
import { useDragDrop } from './useDragDrop'

export interface UseTabDragDropParams {
  sessions: TerminalSession[]
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>
}

export interface UseTabDragDropReturn {
  draggedTabId: string | null
  dragOverTabId: string | null
  handleTabDragStart: (e: React.DragEvent, tabId: string) => void
  handleTabDragOver: (e: React.DragEvent, tabId: string) => void
  handleTabDragLeave: () => void
  handleTabDrop: (e: React.DragEvent, targetTabId: string) => void
  handleTabDragEnd: () => void
  handleEndZoneDragOver: (e: React.DragEvent) => void
  handleEndZoneDrop: (e: React.DragEvent) => void
}

/**
 * Hook to manage tab drag-and-drop reordering
 * - Tracks drag state (which tab is being dragged, which is being hovered)
 * - Handles reordering sessions array on drop
 * - Persists new order to Chrome storage
 */
export function useTabDragDrop({
  sessions,
  setSessions,
}: UseTabDragDropParams): UseTabDragDropReturn {
  const {
    draggedItem: draggedTabId,
    dragOverItem: dragOverTabId,
    setDraggedItem: setDraggedTabId,
    setDragOverItem: setDragOverTabId,
    resetDragState,
  } = useDragDrop<string>()

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }, [setDraggedTabId])

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedTabId && tabId !== draggedTabId) {
      setDragOverTabId(tabId)
    }
  }, [draggedTabId, setDragOverTabId])

  const handleTabDragLeave = useCallback(() => {
    setDragOverTabId(null)
  }, [setDragOverTabId])

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (!draggedTabId || draggedTabId === targetTabId) {
      resetDragState()
      return
    }

    // Reorder sessions
    const draggedIndex = sessions.findIndex(s => s.id === draggedTabId)
    const targetIndex = sessions.findIndex(s => s.id === targetTabId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newSessions = [...sessions]
      const [draggedSession] = newSessions.splice(draggedIndex, 1)
      newSessions.splice(targetIndex, 0, draggedSession)
      setSessions(newSessions)

      // Persist new order to Chrome storage
      chrome.storage.local.set({ terminalSessions: newSessions })
    }

    resetDragState()
  }, [draggedTabId, sessions, setSessions, resetDragState])

  const handleTabDragEnd = useCallback(() => {
    resetDragState()
  }, [resetDragState])

  // Handle drag over end zone (for dropping at the end of the tab list)
  const handleEndZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTabId('__end__')
  }, [setDragOverTabId])

  // Handle drop on end zone (move tab to end of list)
  const handleEndZoneDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedTabId) return

    const draggedIndex = sessions.findIndex(s => s.id === draggedTabId)
    if (draggedIndex !== -1 && draggedIndex !== sessions.length - 1) {
      const newSessions = [...sessions]
      const [draggedSession] = newSessions.splice(draggedIndex, 1)
      newSessions.push(draggedSession)
      setSessions(newSessions)
      chrome.storage.local.set({ terminalSessions: newSessions })
    }

    resetDragState()
  }, [draggedTabId, sessions, setSessions, resetDragState])

  return {
    draggedTabId,
    dragOverTabId,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDragLeave,
    handleTabDrop,
    handleTabDragEnd,
    handleEndZoneDragOver,
    handleEndZoneDrop,
  }
}
