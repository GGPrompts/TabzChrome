import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Terminal, Trash2, Eye, GitBranch, Folder, GripVertical, Copy, Box } from 'lucide-react'
import { compactPath } from '../../shared/utils'

export interface TerminalItem {
  id: string
  name: string
  sessionName?: string
  workingDir?: string
  createdAt?: string
  state?: string
  gitBranch?: string
  claudeState?: {
    status: string
    currentTool?: string | null
    context_pct?: number | null
    details?: {
      args?: {
        file_path?: string
        command?: string
        description?: string
        pattern?: string
        [key: string]: any
      }
      [key: string]: any
    } | null
  } | null
  aiTool?: string | null
}

interface StatusHistoryEntry {
  text: string
  timestamp: number
}

interface ActiveTerminalsListProps {
  terminals: TerminalItem[]
  loading?: boolean
  maxItems?: number
  showCheckboxes?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onSelectAll?: () => void
  onKill?: (id: string) => void
  onViewAsText?: (id: string) => void
  onSwitchTo?: (id: string) => void
  emptyMessage?: string
}


// Format relative time
const formatRelativeTime = (dateStr: string | number) => {
  const date = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

// Tool emojis for rich display
const toolEmojis: Record<string, string> = {
  'Read': '📖',
  'Write': '📝',
  'Edit': '✏️',
  'Bash': '🔺',
  'Glob': '🔍',
  'Grep': '🔎',
  'Task': '🤖',
  'WebFetch': '🌐',
  'WebSearch': '🔍',
  'TodoWrite': '📋',
  'NotebookEdit': '📓',
  'AskUserQuestion': '❓',
}

// Get rich Claude status display with file/command details
const getClaudeStatusDisplay = (claudeState: TerminalItem['claudeState']) => {
  if (!claudeState) return null

  const statusColors: Record<string, string> = {
    'tool_use': 'text-blue-400',
    'awaiting_input': 'text-green-400',
    'thinking': 'text-purple-400',
    'processing': 'text-yellow-400',
    'idle': 'text-green-400',
  }

  const color = statusColors[claudeState.status] || 'text-gray-400'
  const emoji = claudeState.currentTool ? (toolEmojis[claudeState.currentTool] || '🔧') : ''

  // Build rich status with tool details
  let label = ''
  let detail = ''
  let fullDetail = ''

  if (claudeState.status === 'awaiting_input' || claudeState.status === 'idle') {
    label = 'Ready'
  } else if (claudeState.currentTool) {
    label = claudeState.currentTool

    // Extract detail from args
    const args = claudeState.details?.args
    if (args) {
      if (args.file_path) {
        // Skip internal Claude files
        if (!args.file_path.includes('/.claude/')) {
          const parts = args.file_path.split('/')
          detail = parts[parts.length - 1]
          fullDetail = args.file_path
        }
      } else if (args.description) {
        detail = args.description.length > 40 ? args.description.slice(0, 40) + '…' : args.description
        fullDetail = args.description
      } else if (args.command) {
        detail = args.command.length > 40 ? args.command.slice(0, 40) + '…' : args.command
        fullDetail = args.command
      } else if (args.pattern) {
        detail = args.pattern
        fullDetail = args.pattern
      }
    }
  } else {
    label = claudeState.status === 'processing' ? 'Processing' : claudeState.status
  }

  return { color, label, detail, fullDetail, emoji }
}

// Generate status text for history
const getStatusTextForHistory = (claudeState: TerminalItem['claudeState']): string => {
  if (!claudeState) return ''
  if (claudeState.status === 'idle' || claudeState.status === 'awaiting_input') return ''

  const emoji = claudeState.currentTool ? (toolEmojis[claudeState.currentTool] || '🔧') : '⏳'

  if (claudeState.currentTool && claudeState.details?.args) {
    const args = claudeState.details.args
    if (args.file_path?.includes('/.claude/')) return ''

    if (args.file_path) {
      const parts = args.file_path.split('/')
      return `${emoji} ${claudeState.currentTool}: ${parts[parts.length - 1]}`
    } else if (args.description) {
      const desc = args.description.length > 35 ? args.description.slice(0, 35) + '…' : args.description
      return `${emoji} ${claudeState.currentTool}: ${desc}`
    } else if (args.command) {
      const cmd = args.command.length > 35 ? args.command.slice(0, 35) + '…' : args.command
      return `${emoji} ${claudeState.currentTool}: ${cmd}`
    } else if (args.pattern) {
      return `${emoji} ${claudeState.currentTool}: ${args.pattern}`
    }
    return `${emoji} ${claudeState.currentTool}`
  }

  if (claudeState.status === 'processing') return '⏳ Processing'
  if (claudeState.status === 'working') return '⚙️ Working'

  return ''
}

// Get context percentage color
const getContextColor = (pct: number | null | undefined): string => {
  if (pct == null) return '#888'
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 75) return '#f97316' // orange
  if (pct >= 50) return '#eab308' // yellow
  return '#22c55e' // green
}

// Default column widths (in pixels)
const DEFAULT_COLUMNS = {
  status: 24,
  name: 180,
  activity: 200,
  context: 60,
  path: 180,
  git: 100,
  created: 70,
  actions: 60,
}

const MAX_HISTORY_ENTRIES = 12

export function ActiveTerminalsList({
  terminals,
  loading = false,
  maxItems,
  showCheckboxes = false,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onKill,
  onViewAsText,
  onSwitchTo,
  emptyMessage = 'No active terminals',
}: ActiveTerminalsListProps) {
  const displayTerminals = maxItems ? terminals.slice(0, maxItems) : terminals
  const hasMore = maxItems && terminals.length > maxItems

  // Column widths state for resizing
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMNS)
  const resizingColumn = useRef<string | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // Hover tooltip state
  const [hoveredTerminal, setHoveredTerminal] = useState<{ id: string; rect: DOMRect } | null>(null)
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Status history tracking
  const [statusHistory, setStatusHistory] = useState<Map<string, StatusHistoryEntry[]>>(new Map())
  const lastStatusTextRef = useRef<Map<string, string>>(new Map())

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    terminalId: string | null
  }>({ show: false, x: 0, y: 0, terminalId: null })

  // Track status changes and build history
  useEffect(() => {
    terminals.forEach((terminal) => {
      if (terminal.claudeState) {
        const statusText = getStatusTextForHistory(terminal.claudeState)
        const lastText = lastStatusTextRef.current.get(terminal.id)

        if (statusText && statusText !== lastText) {
          lastStatusTextRef.current.set(terminal.id, statusText)
          setStatusHistory((prev) => {
            const newHistory = new Map(prev)
            const terminalHistory = newHistory.get(terminal.id) || []
            const newEntry: StatusHistoryEntry = {
              text: statusText,
              timestamp: Date.now(),
            }
            const updatedHistory = [newEntry, ...terminalHistory].slice(0, MAX_HISTORY_ENTRIES)
            newHistory.set(terminal.id, updatedHistory)
            return newHistory
          })
        }
      }
    })
  }, [terminals])

  // Handle mouse down on resize handle
  const handleResizeStart = (e: React.MouseEvent, column: string) => {
    e.preventDefault()
    resizingColumn.current = column
    startX.current = e.clientX
    startWidth.current = columnWidths[column as keyof typeof columnWidths]
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
  }

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumn.current) return
    const diff = e.clientX - startX.current
    const newWidth = Math.max(40, startWidth.current + diff)
    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumn.current!]: newWidth,
    }))
  }, [])

  const handleResizeEnd = useCallback(() => {
    resizingColumn.current = null
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
  }, [handleResizeMove])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    }
  }, [handleResizeMove, handleResizeEnd])

  // Row hover handlers
  const handleRowMouseEnter = (e: React.MouseEvent, terminalId: string) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredTerminal({ id: terminalId, rect })
    }, 400)
  }

  const handleRowMouseLeave = () => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredTerminal(null)
    }, 150)
  }

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      terminalId,
    })
    // Hide hover tooltip when context menu opens
    setHoveredTerminal(null)
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
  }

  const handleCopySessionId = (sessionName: string) => {
    navigator.clipboard.writeText(sessionName)
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  const handleOpenIn3D = (terminal: TerminalItem) => {
    if (!terminal.sessionName) return
    // Open 3D focus page with session info
    const url = chrome.runtime.getURL(
      `3d/3d-focus.html?session=${terminal.sessionName}&id=${terminal.id}`
    )
    chrome.tabs.create({ url })
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.show) {
        setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [contextMenu.show])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (terminals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Terminal className="w-12 h-12 mb-4 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    )
  }

  // Resizable column header component
  const ResizableHeader = ({
    column,
    children = null,
    className = '',
  }: {
    column: string
    children?: React.ReactNode
    className?: string
  }) => (
    <th
      className={`relative text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-2 select-none ${className}`}
      style={{ width: columnWidths[column as keyof typeof columnWidths] }}
    >
      <div className="flex items-center gap-1">{children}</div>
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/30 group"
        onMouseDown={(e) => handleResizeStart(e, column)}
      >
        <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-50 absolute right-0 top-1/2 -translate-y-1/2" />
      </div>
    </th>
  )

  // Find hovered terminal data
  const hoveredTerminalData = hoveredTerminal
    ? displayTerminals.find((t) => t.id === hoveredTerminal.id)
    : null
  const hoveredHistory = hoveredTerminal ? statusHistory.get(hoveredTerminal.id) || [] : []

  return (
    <div className="overflow-x-auto relative">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            {showCheckboxes && (
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds?.size === terminals.length && terminals.length > 0}
                  onChange={onSelectAll}
                  className="w-4 h-4 rounded"
                />
              </th>
            )}
            <ResizableHeader column="status" className="w-6"></ResizableHeader>
            <ResizableHeader column="name">Name</ResizableHeader>
            <ResizableHeader column="activity">Activity</ResizableHeader>
            <ResizableHeader column="context">Context</ResizableHeader>
            <ResizableHeader column="path">Path</ResizableHeader>
            <ResizableHeader column="git">Branch</ResizableHeader>
            <ResizableHeader column="created">Created</ResizableHeader>
            {(onViewAsText || onKill) && (
              <th className="w-16 px-2 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {displayTerminals.map((terminal) => {
            const isClickable =
              terminal.id.startsWith('ctt-') || terminal.sessionName?.startsWith('ctt-')
            const claudeStatus = getClaudeStatusDisplay(terminal.claudeState)

            return (
              <tr
                key={terminal.id}
                className={`
                  hover:bg-muted/30 transition-colors
                  ${isClickable ? 'cursor-pointer' : ''}
                  ${selectedIds?.has(terminal.id) ? 'bg-primary/5' : ''}
                `}
                onClick={
                  isClickable && onSwitchTo
                    ? () => onSwitchTo(terminal.sessionName || terminal.id)
                    : undefined
                }
                title={isClickable ? 'Click to switch to this terminal' : undefined}
                onMouseEnter={(e) => handleRowMouseEnter(e, terminal.id)}
                onMouseLeave={handleRowMouseLeave}
                onContextMenu={(e) => handleContextMenu(e, terminal.id)}
              >
                {/* Checkbox */}
                {showCheckboxes && (
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(terminal.id)}
                      onChange={() => onToggleSelect?.(terminal.id)}
                      className="w-4 h-4 rounded"
                    />
                  </td>
                )}

                {/* Status dot */}
                <td className="px-2 py-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      terminal.state === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                </td>

                {/* Name + AI badge */}
                <td className="px-2 py-3" style={{ width: columnWidths.name }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-medium truncate ${isClickable ? 'text-primary' : ''}`}>
                      {terminal.name || 'Unnamed'}
                    </span>
                    {terminal.aiTool && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-xs rounded bg-black/40 text-orange-400 border border-orange-500/50">
                        {terminal.aiTool === 'claude-code' ? 'claude' : terminal.aiTool}
                      </span>
                    )}
                  </div>
                </td>

                {/* Claude Activity - rich status */}
                <td className="px-2 py-3" style={{ width: columnWidths.activity }}>
                  {claudeStatus ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      {claudeStatus.emoji && (
                        <span className="flex-shrink-0 text-sm">{claudeStatus.emoji}</span>
                      )}
                      <span className={`text-sm ${claudeStatus.color}`}>{claudeStatus.label}</span>
                      {claudeStatus.detail && (
                        <span
                          className="text-xs text-muted-foreground truncate"
                          title={claudeStatus.fullDetail || claudeStatus.detail}
                        >
                          : {claudeStatus.detail}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Context % */}
                <td className="px-2 py-3 text-center" style={{ width: columnWidths.context }}>
                  {terminal.claudeState?.context_pct != null ? (
                    <span
                      className="text-sm font-medium tabular-nums"
                      style={{ color: getContextColor(terminal.claudeState.context_pct) }}
                    >
                      {terminal.claudeState.context_pct}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Path */}
                <td className="px-2 py-3" style={{ width: columnWidths.path }}>
                  {terminal.workingDir ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                      <Folder className="w-3 h-3 flex-shrink-0" />
                      <span className="font-mono truncate" title={terminal.workingDir}>
                        {compactPath(terminal.workingDir)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Git Branch */}
                <td className="px-2 py-3" style={{ width: columnWidths.git }}>
                  {terminal.gitBranch ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <GitBranch className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{terminal.gitBranch}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Created */}
                <td
                  className="px-2 py-3 text-xs text-muted-foreground whitespace-nowrap"
                  style={{ width: columnWidths.created }}
                >
                  {terminal.createdAt ? formatRelativeTime(terminal.createdAt) : '—'}
                </td>

                {/* Actions */}
                {(onViewAsText || onKill) && (
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {terminal.sessionName && (
                        <button
                          onClick={() => handleOpenIn3D(terminal)}
                          className="p-1.5 rounded hover:bg-cyan-500/20 text-muted-foreground hover:text-cyan-400 transition-colors"
                          title="Open in 3D Focus"
                        >
                          <Box className="w-4 h-4" />
                        </button>
                      )}
                      {onViewAsText && terminal.sessionName && (
                        <button
                          onClick={() => onViewAsText(terminal.sessionName || terminal.id)}
                          className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                          title="View as text"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {onKill && (
                        <button
                          onClick={() => onKill(terminal.id)}
                          className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                          title="Kill terminal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {hasMore && (
        <p className="text-center text-sm text-muted-foreground pt-3 border-t border-border/50">
          +{terminals.length - maxItems!} more terminals
        </p>
      )}

      {/* Hover Tooltip */}
      {hoveredTerminal && hoveredTerminalData && (
        <div
          className="fixed z-50 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: Math.min(hoveredTerminal.rect.left, window.innerWidth - 470),
            top: hoveredTerminal.rect.bottom + 8,
          }}
          onMouseEnter={() => {
            if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
          }}
          onMouseLeave={() => {
            if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
            setHoveredTerminal(null)
          }}
        >
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl px-4 py-3 min-w-[320px] max-w-[450px]">
            {/* Terminal Name + Session ID */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[14px] font-medium text-white">
                {hoveredTerminalData.name || 'Unnamed'}
              </span>
              {hoveredTerminalData.aiTool && (
                <span className="px-1.5 py-0.5 text-xs rounded bg-black/40 text-orange-400 border border-orange-500/50">
                  {hoveredTerminalData.aiTool === 'claude-code' ? 'claude' : hoveredTerminalData.aiTool}
                </span>
              )}
            </div>

            {/* Session Name with Copy button */}
            {hoveredTerminalData.sessionName && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-mono text-gray-500">
                  {hoveredTerminalData.sessionName}
                </span>
                <button
                  className="p-1 rounded hover:bg-[#00ff88]/20 text-gray-500 hover:text-[#00ff88] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopySessionId(hoveredTerminalData.sessionName!)
                  }}
                  title="Copy session ID"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Working Directory */}
            {hoveredTerminalData.workingDir && (
              <div className="flex items-center gap-2 mb-2 overflow-hidden">
                <span className="text-[#00ff88] text-sm flex-shrink-0">📁</span>
                <span
                  className="text-[13px] text-[#00ff88] font-mono truncate"
                  title={hoveredTerminalData.workingDir}
                >
                  {compactPath(hoveredTerminalData.workingDir)}
                </span>
              </div>
            )}

            {/* Git Branch */}
            {hoveredTerminalData.gitBranch && (
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="w-4 h-4 text-purple-400" />
                <span className="text-[13px] text-purple-400">{hoveredTerminalData.gitBranch}</span>
              </div>
            )}

            {/* Claude Status */}
            {hoveredTerminalData.claudeState && (
              <div className="flex items-center gap-2 pt-2 border-t border-[#333] overflow-hidden">
                <span className="text-sm flex-shrink-0">🤖</span>
                <span className="text-[13px] text-gray-300 truncate min-w-0">
                  {(() => {
                    const status = getClaudeStatusDisplay(hoveredTerminalData.claudeState)
                    if (!status) return 'Unknown'
                    return status.detail
                      ? `${status.emoji} ${status.label}: ${status.fullDetail || status.detail}`
                      : `${status.label}`
                  })()}
                </span>
                {hoveredTerminalData.claudeState.context_pct != null && (
                  <span
                    className="text-[12px] font-medium ml-auto"
                    style={{ color: getContextColor(hoveredTerminalData.claudeState.context_pct) }}
                  >
                    {hoveredTerminalData.claudeState.context_pct}%
                  </span>
                )}
              </div>
            )}

            {/* Status History */}
            {hoveredHistory.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#333]">
                <div className="text-[11px] text-[#00ff88]/60 mb-1.5">Recent activity</div>
                <div className="space-y-1 max-h-[180px] overflow-y-auto">
                  {hoveredHistory.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px]">
                      <span className="text-gray-300 flex-1 line-clamp-2">{entry.text}</span>
                      <span className="text-[#00ff88]/50 text-[10px] flex-shrink-0 pt-0.5">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Created Time */}
            {hoveredTerminalData.createdAt && (
              <div className="mt-2 pt-2 border-t border-[#333] text-[11px] text-gray-500">
                Created {formatRelativeTime(hoveredTerminalData.createdAt)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.show && (() => {
        const terminal = displayTerminals.find((t) => t.id === contextMenu.terminalId)
        if (!terminal) return null
        const isTmuxSession = terminal.sessionName?.startsWith('ctt-') || terminal.id.startsWith('ctt-')

        return (
          <div
            className="fixed z-[100] bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 150),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isTmuxSession && terminal.sessionName && (
              <>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#00ff88]/10 hover:text-[#00ff88] flex items-center gap-2 transition-colors"
                  onClick={() => handleCopySessionId(terminal.sessionName!)}
                >
                  <Copy className="w-4 h-4" />
                  Copy Session ID
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#00ff88]/10 hover:text-[#00ff88] flex items-center gap-2 transition-colors"
                  onClick={() => handleOpenIn3D(terminal)}
                >
                  <Box className="w-4 h-4" />
                  Open in 3D Focus
                </button>
              </>
            )}
            {!isTmuxSession && (
              <div className="px-3 py-2 text-sm text-gray-500">
                No actions available
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
