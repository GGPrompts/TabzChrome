import { useState, useEffect, useCallback, useRef } from 'react'
import { sendMessage } from '../shared/messaging'
import type { TerminalSession } from './useTerminalSessions'

/**
 * Queue item representing a staged command
 */
export interface QueueItem {
  id: string
  command: string
  targetId: string | null  // null = current tab, string = specific terminal ID
  mode: 'execute' | 'send'
  status: 'pending' | 'running' | 'completed' | 'error'
  createdAt: number
  error?: string
}

interface ClaudeStatus {
  tmuxPane?: string
  [key: string]: any
}

interface UseCommandQueueParams {
  sessions: TerminalSession[]
  currentSession: string | null
  claudeStatuses: Map<string, ClaudeStatus>
}

export interface UseCommandQueueReturn {
  queue: QueueItem[]
  isExpanded: boolean
  setIsExpanded: (expanded: boolean) => void
  isRunning: boolean
  runningItemId: string | null

  // Queue operations
  addToQueue: (command: string, targetId: string | null, mode: 'execute' | 'send') => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  updateItem: (id: string, updates: Partial<Pick<QueueItem, 'command' | 'targetId' | 'mode'>>) => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  moveUp: (id: string) => void
  moveDown: (id: string) => void

  // Dispatch operations
  runNext: () => Promise<void>
  runAllSequential: () => Promise<void>
  runAllParallel: () => Promise<void>
  stopExecution: () => void

  // Helpers
  getTargetName: (targetId: string | null) => string
  pendingCount: number
}

const STORAGE_KEY = 'commandQueue'
const EXPANDED_KEY = 'commandQueueExpanded'

/**
 * useCommandQueue - Command queue state management hook
 *
 * Manages a queue of staged commands that can be dispatched to terminals.
 * Supports multiple dispatch modes: single, sequential, and parallel.
 * Persists queue to Chrome storage for survival across sidebar closes.
 */
export function useCommandQueue({
  sessions,
  currentSession,
  claudeStatuses,
}: UseCommandQueueParams): UseCommandQueueReturn {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [runningItemId, setRunningItemId] = useState<string | null>(null)

  // Ref for stopping sequential execution
  const stopRequestedRef = useRef(false)
  // Ref to track if storage has been loaded
  const storageLoadedRef = useRef(false)

  // Load queue from Chrome storage on mount
  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, EXPANDED_KEY], (result) => {
      if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
        // Reset any "running" items to "pending" on load (stale state from crash/reload)
        const loadedQueue = (result[STORAGE_KEY] as QueueItem[]).map(item => ({
          ...item,
          status: item.status === 'running' ? 'pending' : item.status,
        })) as QueueItem[]
        // Filter out completed items older than 5 minutes
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
        const activeQueue = loadedQueue.filter(
          item => item.status !== 'completed' || item.createdAt > fiveMinutesAgo
        )
        setQueue(activeQueue)
      }
      if (typeof result[EXPANDED_KEY] === 'boolean') {
        setIsExpanded(result[EXPANDED_KEY])
      }
      storageLoadedRef.current = true
    })
  }, [])

  // Save queue to Chrome storage when it changes
  useEffect(() => {
    // Only save after initial load to avoid overwriting with empty array
    if (storageLoadedRef.current) {
      chrome.storage.local.set({ [STORAGE_KEY]: queue })
    }
  }, [queue])

  // Save expanded state to Chrome storage
  useEffect(() => {
    if (storageLoadedRef.current) {
      chrome.storage.local.set({ [EXPANDED_KEY]: isExpanded })
    }
  }, [isExpanded])

  // Generate unique ID for queue items
  const generateId = useCallback(() => {
    return `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }, [])

  // Add item to queue
  const addToQueue = useCallback((
    command: string,
    targetId: string | null,
    mode: 'execute' | 'send'
  ) => {
    if (!command.trim()) return

    const newItem: QueueItem = {
      id: generateId(),
      command: command.trim(),
      targetId,
      mode,
      status: 'pending',
      createdAt: Date.now(),
    }

    setQueue(prev => [...prev, newItem])

    // Auto-expand when adding first item
    setIsExpanded(true)
  }, [generateId])

  // Remove item from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id))
  }, [])

  // Clear all items from queue
  const clearQueue = useCallback(() => {
    setQueue([])
    setIsRunning(false)
    setRunningItemId(null)
    stopRequestedRef.current = true
  }, [])

  // Update item properties
  const updateItem = useCallback((
    id: string,
    updates: Partial<Pick<QueueItem, 'command' | 'targetId' | 'mode'>>
  ) => {
    setQueue(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ))
  }, [])

  // Reorder queue by moving item from one index to another
  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return

    setQueue(prev => {
      const newQueue = [...prev]
      const [removed] = newQueue.splice(fromIndex, 1)
      newQueue.splice(toIndex, 0, removed)
      return newQueue
    })
  }, [])

  // Move item up in queue
  const moveUp = useCallback((id: string) => {
    setQueue(prev => {
      const index = prev.findIndex(item => item.id === id)
      if (index <= 0) return prev
      const newQueue = [...prev]
      ;[newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]]
      return newQueue
    })
  }, [])

  // Move item down in queue
  const moveDown = useCallback((id: string) => {
    setQueue(prev => {
      const index = prev.findIndex(item => item.id === id)
      if (index === -1 || index >= prev.length - 1) return prev
      const newQueue = [...prev]
      ;[newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]]
      return newQueue
    })
  }, [])

  // Send command to a terminal (shared logic)
  const sendCommand = useCallback(async (
    command: string,
    targetId: string | null,
    mode: 'execute' | 'send'
  ): Promise<void> => {
    // Resolve target terminal
    const resolvedTargetId = targetId || currentSession
    if (!resolvedTargetId) {
      throw new Error('No target terminal available')
    }

    const session = sessions.find(s => s.id === resolvedTargetId)
    if (!session) {
      throw new Error(`Terminal ${resolvedTargetId} not found`)
    }

    const claudeStatus = claudeStatuses.get(resolvedTargetId)
    const tmuxPane = claudeStatus?.tmuxPane
    const tmuxSessionName = session.sessionName

    return new Promise((resolve, reject) => {
      try {
        if (tmuxPane) {
          // Use targeted pane send
          sendMessage({
            type: 'TARGETED_PANE_SEND',
            tmuxPane,
            text: command,
            sendEnter: mode === 'execute',
          })
          // Small delay to ensure message is sent
          setTimeout(resolve, 100)
        } else if (tmuxSessionName) {
          // Use tmux session send
          sendMessage({
            type: 'TMUX_SESSION_SEND',
            sessionName: tmuxSessionName,
            text: command,
            sendEnter: mode === 'execute',
          })
          setTimeout(resolve, 100)
        } else {
          // PTY fallback
          sendMessage({
            type: 'TERMINAL_INPUT',
            terminalId: resolvedTargetId,
            data: command,
          })

          if (mode === 'execute') {
            setTimeout(() => {
              sendMessage({
                type: 'TERMINAL_INPUT',
                terminalId: resolvedTargetId,
                data: '\r',
              })
              setTimeout(resolve, 100)
            }, 300)
          } else {
            setTimeout(resolve, 100)
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }, [sessions, currentSession, claudeStatuses])

  // Run the next pending item in queue
  const runNext = useCallback(async () => {
    const nextItem = queue.find(item => item.status === 'pending')
    if (!nextItem) return

    setIsRunning(true)
    setRunningItemId(nextItem.id)

    // Mark as running
    setQueue(prev => prev.map(item =>
      item.id === nextItem.id ? { ...item, status: 'running' as const } : item
    ))

    try {
      await sendCommand(nextItem.command, nextItem.targetId, nextItem.mode)

      // Mark as completed
      setQueue(prev => prev.map(item =>
        item.id === nextItem.id ? { ...item, status: 'completed' as const } : item
      ))
    } catch (err) {
      // Mark as error
      setQueue(prev => prev.map(item =>
        item.id === nextItem.id
          ? { ...item, status: 'error' as const, error: String(err) }
          : item
      ))
    } finally {
      setIsRunning(false)
      setRunningItemId(null)
    }
  }, [queue, sendCommand])

  // Run all items sequentially (one by one)
  const runAllSequential = useCallback(async () => {
    stopRequestedRef.current = false
    setIsRunning(true)

    const pendingItems = queue.filter(item => item.status === 'pending')

    for (const item of pendingItems) {
      if (stopRequestedRef.current) break

      setRunningItemId(item.id)

      // Mark as running
      setQueue(prev => prev.map(qItem =>
        qItem.id === item.id ? { ...qItem, status: 'running' as const } : qItem
      ))

      try {
        await sendCommand(item.command, item.targetId, item.mode)

        // Small delay between sequential commands
        await new Promise(resolve => setTimeout(resolve, 500))

        // Mark as completed
        setQueue(prev => prev.map(qItem =>
          qItem.id === item.id ? { ...qItem, status: 'completed' as const } : qItem
        ))
      } catch (err) {
        // Mark as error and continue
        setQueue(prev => prev.map(qItem =>
          qItem.id === item.id
            ? { ...qItem, status: 'error' as const, error: String(err) }
            : qItem
        ))
      }
    }

    setIsRunning(false)
    setRunningItemId(null)
  }, [queue, sendCommand])

  // Run all items in parallel (fire and forget)
  const runAllParallel = useCallback(async () => {
    setIsRunning(true)

    const pendingItems = queue.filter(item => item.status === 'pending')

    // Mark all as running
    setQueue(prev => prev.map(item =>
      item.status === 'pending' ? { ...item, status: 'running' as const } : item
    ))

    // Fire all commands with slight stagger
    const promises = pendingItems.map(async (item, index) => {
      // Stagger by 50ms each
      await new Promise(resolve => setTimeout(resolve, index * 50))

      try {
        await sendCommand(item.command, item.targetId, item.mode)

        // Mark as completed
        setQueue(prev => prev.map(qItem =>
          qItem.id === item.id ? { ...qItem, status: 'completed' as const } : qItem
        ))
      } catch (err) {
        // Mark as error
        setQueue(prev => prev.map(qItem =>
          qItem.id === item.id
            ? { ...qItem, status: 'error' as const, error: String(err) }
            : qItem
        ))
      }
    })

    await Promise.all(promises)

    setIsRunning(false)
    setRunningItemId(null)
  }, [queue, sendCommand])

  // Stop sequential execution
  const stopExecution = useCallback(() => {
    stopRequestedRef.current = true

    // Reset running items back to pending
    setQueue(prev => prev.map(item =>
      item.status === 'running' ? { ...item, status: 'pending' as const } : item
    ))

    setIsRunning(false)
    setRunningItemId(null)
  }, [])

  // Get display name for a target terminal
  const getTargetName = useCallback((targetId: string | null): string => {
    if (!targetId) return 'Current'
    const session = sessions.find(s => s.id === targetId)
    return session?.name || 'Unknown'
  }, [sessions])

  // Count pending items
  const pendingCount = queue.filter(item => item.status === 'pending').length

  return {
    queue,
    isExpanded,
    setIsExpanded,
    isRunning,
    runningItemId,
    addToQueue,
    removeFromQueue,
    clearQueue,
    updateItem,
    reorderQueue,
    moveUp,
    moveDown,
    runNext,
    runAllSequential,
    runAllParallel,
    stopExecution,
    getTargetName,
    pendingCount,
  }
}
