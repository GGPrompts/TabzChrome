import React, { useState, useCallback } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Play,
  PlayCircle,
  Zap,
  Square,
  Trash2,
  ListOrdered,
} from 'lucide-react'
import { CommandQueueItem } from './CommandQueueItem'
import type { UseCommandQueueReturn } from '../hooks/useCommandQueue'
import type { TerminalSession } from '../hooks/useTerminalSessions'

interface CommandQueuePanelProps {
  queue: UseCommandQueueReturn
  sessions: TerminalSession[]
}

/**
 * CommandQueuePanel - Collapsible panel for managing queued commands
 *
 * Features:
 * - Collapsible header with queue count badge
 * - Drag-and-drop reordering
 * - Dispatch controls: Run Next, Run All Sequential, Run All Parallel
 * - Clear all button
 * - Running state with stop button
 * - Visual feedback for running/completed items
 *
 * Design aesthetic:
 * - Industrial/mission control feel
 * - Dark theme with green (#00ff88) accents
 * - Monospace typography for commands
 * - Subtle animations for status changes
 */
export function CommandQueuePanel({ queue, sessions }: CommandQueuePanelProps) {
  const {
    queue: items,
    isExpanded,
    setIsExpanded,
    isRunning,
    runningItemId,
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
  } = queue

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    setDraggedIndex(index)

    // Custom drag image (optional - use default for now)
    // const ghost = document.createElement('div')
    // ghost.textContent = items[index].command
    // e.dataTransfer.setDragImage(ghost, 0, 0)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      reorderQueue(fromIndex, toIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [reorderQueue])

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [])

  // Handle running a single item
  const handleRunSingle = useCallback(async (itemId: string) => {
    // Find and run just this item by temporarily setting it as next
    const item = items.find(i => i.id === itemId)
    if (!item || item.status !== 'pending') return

    // Update status to running
    updateItem(item.id, {} as any)

    // This is a simplified version - actually runNext handles the execution
    await runNext()
  }, [items, updateItem, runNext])

  // Filter to show only pending items in main view, completed items separate
  const pendingItems = items.filter(i => i.status === 'pending' || i.status === 'running')
  const completedItems = items.filter(i => i.status === 'completed' || i.status === 'error')
  const hasCompleted = completedItems.length > 0

  // Don't render if queue is empty and collapsed
  if (items.length === 0 && !isExpanded) {
    return null
  }

  return (
    <div className="border-t border-gray-800 bg-gradient-to-b from-[#0a0a0a] to-[#0f0f0f]">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-gray-500 group-hover:text-gray-400 transition-colors" />
          <span className="text-xs font-medium text-gray-400 group-hover:text-gray-300 transition-colors">
            Command Queue
          </span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 tabular-nums">
              {pendingCount}
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#00ff88]/10 text-[#00ff88] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-ping" />
              Running
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick actions in header */}
          {pendingCount > 0 && !isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                runNext()
              }}
              className="p-1 rounded text-[#00ff88]/70 hover:text-[#00ff88] hover:bg-[#00ff88]/10 transition-colors"
              title="Run next command"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}

          {isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                stopExecution()
              }}
              className="p-1 rounded text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Stop execution"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Expand/collapse chevron */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500 group-hover:text-gray-400 transition-colors" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-500 group-hover:text-gray-400 transition-colors" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-2 animate-in slide-in-from-top-2 duration-150">
          {/* Dispatch controls */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              {/* Run Next */}
              <button
                onClick={runNext}
                disabled={isRunning}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 border border-[#00ff88]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Run next pending command (Ctrl+Shift+Enter)"
              >
                <Play className="h-3 w-3" />
                <span>Next</span>
              </button>

              {/* Run All Sequential */}
              <button
                onClick={runAllSequential}
                disabled={isRunning}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Run all commands one by one"
              >
                <PlayCircle className="h-3 w-3" />
                <span>Sequential</span>
              </button>

              {/* Run All Parallel */}
              <button
                onClick={runAllParallel}
                disabled={isRunning}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Fire all commands at once"
              >
                <Zap className="h-3 w-3" />
                <span>Parallel</span>
              </button>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Stop button (visible when running) */}
              {isRunning && (
                <button
                  onClick={stopExecution}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                  title="Stop sequential execution"
                >
                  <Square className="h-3 w-3" />
                  <span>Stop</span>
                </button>
              )}

              {/* Clear all button */}
              <button
                onClick={clearQueue}
                className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Clear queue"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Queue items */}
          {pendingItems.length > 0 ? (
            <div className="space-y-1.5">
              {pendingItems.map((item, index) => (
                <CommandQueueItem
                  key={item.id}
                  item={item}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === pendingItems.length - 1}
                  isRunning={isRunning}
                  sessions={sessions}
                  onUpdate={updateItem}
                  onRemove={removeFromQueue}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  onRunSingle={() => handleRunSingle(item.id)}
                  getTargetName={getTargetName}
                  draggedIndex={draggedIndex}
                  dragOverIndex={dragOverIndex}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center">
              <p className="text-xs text-gray-500">
                Queue is empty
              </p>
              <p className="text-[10px] text-gray-600 mt-1">
                Use <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-400 font-mono text-[9px]">Ctrl+Q</kbd> to add commands
              </p>
            </div>
          )}

          {/* Completed items (collapsible) */}
          {hasCompleted && (
            <details className="group">
              <summary className="flex items-center gap-2 px-2 py-1 text-[10px] text-gray-500 cursor-pointer hover:text-gray-400 transition-colors list-none">
                <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                <span>Completed ({completedItems.length})</span>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // Remove all completed items
                    completedItems.forEach(item => removeFromQueue(item.id))
                  }}
                  className="ml-auto text-gray-600 hover:text-red-400 transition-colors"
                  title="Clear completed"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </summary>

              <div className="mt-1 space-y-1">
                {completedItems.map((item, index) => (
                  <CommandQueueItem
                    key={item.id}
                    item={item}
                    index={pendingItems.length + index}
                    isFirst={false}
                    isLast={false}
                    isRunning={false}
                    sessions={sessions}
                    onUpdate={() => {}} // No updates for completed
                    onRemove={removeFromQueue}
                    onMoveUp={() => {}}
                    onMoveDown={() => {}}
                    onRunSingle={() => {}}
                    getTargetName={getTargetName}
                    draggedIndex={null}
                    dragOverIndex={null}
                    onDragStart={() => {}}
                    onDragOver={() => {}}
                    onDragLeave={() => {}}
                    onDrop={() => {}}
                    onDragEnd={() => {}}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
