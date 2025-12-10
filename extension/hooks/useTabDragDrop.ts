import { useState, useCallback } from 'react'
import type { TerminalSession } from './useTerminalSessions'

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
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }, [])

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedTabId && tabId !== draggedTabId) {
      setDragOverTabId(tabId)
    }
  }, [draggedTabId])

  const handleTabDragLeave = useCallback(() => {
    setDragOverTabId(null)
  }, [])

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null)
      setDragOverTabId(null)
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

    setDraggedTabId(null)
    setDragOverTabId(null)
  }, [draggedTabId, sessions, setSessions])

  const handleTabDragEnd = useCallback(() => {
    setDraggedTabId(null)
    setDragOverTabId(null)
  }, [])

  // Handle drag over end zone (for dropping at the end of the tab list)
  const handleEndZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTabId('__end__')
  }, [])

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

    setDraggedTabId(null)
    setDragOverTabId(null)
  }, [draggedTabId, sessions, setSessions])

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
