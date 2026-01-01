import React, { useState, useRef, useEffect } from 'react'
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Play,
  Check,
  AlertCircle,
  Loader2,
  Terminal,
} from 'lucide-react'
import type { QueueItem } from '../hooks/useCommandQueue'
import type { TerminalSession } from '../hooks/useTerminalSessions'

interface CommandQueueItemProps {
  item: QueueItem
  index: number
  isFirst: boolean
  isLast: boolean
  isRunning: boolean
  sessions: TerminalSession[]
  onUpdate: (id: string, updates: Partial<Pick<QueueItem, 'command' | 'targetId' | 'mode'>>) => void
  onRemove: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onRunSingle: () => void
  getTargetName: (targetId: string | null) => string

  // Drag and drop
  draggedIndex: number | null
  dragOverIndex: number | null
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
}

/**
 * CommandQueueItem - Individual queue entry with editing and controls
 *
 * Features:
 * - Drag handle for reordering
 * - Inline command editing
 * - Target terminal dropdown
 * - Send mode toggle
 * - Move up/down buttons
 * - Run single button
 * - Visual status indicators
 */
export function CommandQueueItem({
  item,
  index,
  isFirst,
  isLast,
  isRunning,
  sessions,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onRunSingle,
  getTargetName,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: CommandQueueItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(item.command)
  const [showTargetDropdown, setShowTargetDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Close target dropdown on outside click
  useEffect(() => {
    if (!showTargetDropdown) return

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTargetDropdown(false)
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showTargetDropdown])

  const handleEditSubmit = () => {
    if (editValue.trim()) {
      onUpdate(item.id, { command: editValue.trim() })
    } else {
      setEditValue(item.command) // Reset if empty
    }
    setIsEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleEditSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditValue(item.command)
      setIsEditing(false)
    }
  }

  const isPending = item.status === 'pending'
  const isItemRunning = item.status === 'running'
  const isCompleted = item.status === 'completed'
  const isError = item.status === 'error'
  const isDragged = draggedIndex === index
  const isDragOver = dragOverIndex === index

  // Status-based styling
  const statusStyles = {
    pending: 'border-gray-700 bg-[#0f0f0f]',
    running: 'border-[#00ff88]/50 bg-[#00ff88]/5 shadow-[0_0_20px_rgba(0,255,136,0.15)]',
    completed: 'border-gray-700/50 bg-[#0f0f0f]/50 opacity-60',
    error: 'border-red-500/50 bg-red-500/5',
  }

  return (
    <div
      draggable={isPending && !isEditing}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      className={`
        relative group
        border rounded-lg transition-all duration-200
        ${statusStyles[item.status]}
        ${isDragged ? 'opacity-40 scale-95' : ''}
        ${isDragOver ? 'border-[#00ff88] border-dashed' : ''}
        ${isPending ? 'hover:border-gray-600' : ''}
      `}
    >
      {/* Running pulse animation */}
      {isItemRunning && (
        <div className="absolute inset-0 rounded-lg animate-pulse bg-[#00ff88]/5 pointer-events-none" />
      )}

      <div className="flex items-start gap-2 p-2">
        {/* Drag handle + index */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          {isPending ? (
            <div
              className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          ) : isItemRunning ? (
            <Loader2 className="h-4 w-4 text-[#00ff88] animate-spin" />
          ) : isCompleted ? (
            <Check className="h-4 w-4 text-[#00ff88]" />
          ) : isError ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : null}
          <span className="text-[10px] text-gray-600 font-mono tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Command */}
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleEditSubmit}
                onKeyDown={handleEditKeyDown}
                className="flex-1 px-2 py-0.5 bg-black border border-[#00ff88]/50 rounded text-xs font-mono text-white focus:outline-none focus:border-[#00ff88]"
              />
            ) : (
              <div
                className={`flex-1 px-2 py-0.5 font-mono text-xs rounded cursor-text truncate ${
                  isPending
                    ? 'text-gray-200 hover:bg-white/5'
                    : isItemRunning
                      ? 'text-[#00ff88]'
                      : 'text-gray-500'
                }`}
                onClick={() => isPending && setIsEditing(true)}
                title={item.command}
              >
                <span className="text-[#00ff88]/70">$</span> {item.command}
              </div>
            )}

            {/* Edit button (only for pending) */}
            {isPending && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                title="Edit command"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Target and mode row */}
          <div className="flex items-center gap-2 mt-1.5">
            {/* Target dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isPending) setShowTargetDropdown(!showTargetDropdown)
                }}
                disabled={!isPending}
                className={`
                  flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors
                  ${isPending
                    ? 'bg-[#00ff88]/10 text-[#00ff88]/80 hover:bg-[#00ff88]/20 cursor-pointer'
                    : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                  }
                `}
                title="Change target terminal"
              >
                <Terminal className="h-2.5 w-2.5" />
                <span className="max-w-[80px] truncate">{getTargetName(item.targetId)}</span>
              </button>

              {showTargetDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[140px] z-50 overflow-hidden">
                  {/* Current tab option */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onUpdate(item.id, { targetId: null })
                      setShowTargetDropdown(false)
                    }}
                    className={`w-full px-2 py-1.5 text-left text-[10px] transition-colors flex items-center gap-1.5 ${
                      item.targetId === null
                        ? 'text-[#00ff88] bg-[#00ff88]/10'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-3">{item.targetId === null ? '●' : '○'}</span>
                    <span>Current Tab</span>
                  </button>

                  <div className="border-t border-gray-700 my-0.5" />

                  {/* Terminal list */}
                  <div className="max-h-[150px] overflow-y-auto">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          onUpdate(item.id, { targetId: session.id })
                          setShowTargetDropdown(false)
                        }}
                        className={`w-full px-2 py-1 text-left text-[10px] transition-colors flex items-center gap-1.5 ${
                          item.targetId === session.id
                            ? 'text-[#00ff88] bg-[#00ff88]/5'
                            : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-3 flex-shrink-0">
                          {item.targetId === session.id ? '●' : '○'}
                        </span>
                        <span className="truncate">{session.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <button
              onClick={() => isPending && onUpdate(item.id, { mode: item.mode === 'execute' ? 'send' : 'execute' })}
              disabled={!isPending}
              className={`
                px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors
                ${item.mode === 'execute'
                  ? isPending
                    ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                    : 'bg-orange-500/10 text-orange-400/50'
                  : isPending
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'bg-blue-500/10 text-blue-400/50'
                }
                ${!isPending ? 'cursor-not-allowed' : 'cursor-pointer'}
              `}
              title={item.mode === 'execute' ? 'Execute (sends Enter)' : 'Send (text only)'}
            >
              {item.mode === 'execute' ? 'EXEC' : 'SEND'}
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons (only for pending) */}
            {isPending && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Move up */}
                <button
                  onClick={() => onMoveUp(item.id)}
                  disabled={isFirst}
                  className="p-0.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>

                {/* Move down */}
                <button
                  onClick={() => onMoveDown(item.id)}
                  disabled={isLast}
                  className="p-0.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>

                {/* Run single */}
                <button
                  onClick={onRunSingle}
                  disabled={isRunning}
                  className="p-0.5 rounded text-[#00ff88]/70 hover:text-[#00ff88] hover:bg-[#00ff88]/10 disabled:opacity-30 transition-colors"
                  title="Run this command"
                >
                  <Play className="h-3 w-3" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove from queue"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Error message */}
            {isError && item.error && (
              <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={item.error}>
                {item.error}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
