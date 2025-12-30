import React, { useEffect, useState, useRef } from 'react'
import { GitBranch, Copy, Trash2, Eye, Box } from 'lucide-react'
import { compactPath } from '../../shared/utils'
import { type TerminalItem } from './ActiveTerminalsList'

interface StatusHistoryEntry {
  text: string
  timestamp: number
}

interface TerminalsGridProps {
  terminals: TerminalItem[]
  loading?: boolean
  onKill?: (id: string) => void
  onViewAsText?: (id: string) => void
  onSwitchTo?: (id: string) => void
  emptyMessage?: string
}

const MAX_HISTORY_ENTRIES = 10

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

// Get context percentage color
const getContextColor = (pct: number | null | undefined): string => {
  if (pct == null) return '#888'
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 75) return '#f97316' // orange
  if (pct >= 50) return '#eab308' // yellow
  return '#22c55e' // green
}

// Get rich Claude status display
const getClaudeStatusDisplay = (claudeState: TerminalItem['claudeState']) => {
  if (!claudeState) return null

  const emoji = claudeState.currentTool ? (toolEmojis[claudeState.currentTool] || '🔧') : ''
  let label = ''
  let detail = ''

  if (claudeState.status === 'awaiting_input' || claudeState.status === 'idle') {
    label = 'Ready'
  } else if (claudeState.currentTool) {
    label = claudeState.currentTool

    const args = claudeState.details?.args
    if (args) {
      if (args.file_path && !args.file_path.includes('/.claude/')) {
        const parts = args.file_path.split('/')
        detail = parts[parts.length - 1]
      } else if (args.description) {
        detail = args.description.length > 30 ? args.description.slice(0, 30) + '…' : args.description
      } else if (args.command) {
        detail = args.command.length > 30 ? args.command.slice(0, 30) + '…' : args.command
      } else if (args.pattern) {
        detail = args.pattern
      }
    }
  } else {
    label = claudeState.status === 'processing' ? 'Processing' : claudeState.status
  }

  return { label, detail, emoji }
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
      const desc = args.description.length > 25 ? args.description.slice(0, 25) + '…' : args.description
      return `${emoji} ${claudeState.currentTool}: ${desc}`
    } else if (args.command) {
      const cmd = args.command.length > 25 ? args.command.slice(0, 25) + '…' : args.command
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

export function TerminalsGrid({
  terminals,
  loading = false,
  onKill,
  onViewAsText,
  onSwitchTo,
  emptyMessage = 'No active terminals',
}: TerminalsGridProps) {
  // Status history tracking (per terminal)
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

  const handleContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      terminalId,
    })
  }

  const handleCopySessionId = (sessionName: string) => {
    navigator.clipboard.writeText(sessionName)
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  const handleOpenIn3D = (terminal: TerminalItem) => {
    if (!terminal.sessionName) return
    const url = chrome.runtime.getURL(
      `3d/3d-focus.html?session=${terminal.sessionName}&id=${terminal.id}`
    )
    chrome.tabs.create({ url })
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

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
        <div className="w-12 h-12 mb-4 opacity-50">🖥️</div>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {terminals.map((terminal) => {
          const history = statusHistory.get(terminal.id) || []
          const status = getClaudeStatusDisplay(terminal.claudeState)
          const contextPct = terminal.claudeState?.context_pct

          return (
            <div
              key={terminal.id}
              onClick={() => onSwitchTo?.(terminal.sessionName || terminal.id)}
              onContextMenu={(e) => handleContextMenu(e, terminal.id)}
              className="bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-primary/50 transition-colors cursor-pointer overflow-hidden"
            >
              {/* Header: Name + AI Tool */}
              <div className="px-4 py-3 border-b border-[#333]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-white truncate">
                    {terminal.name || 'Unnamed'}
                  </span>
                  {terminal.aiTool && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-black/40 text-orange-400 border border-orange-500/50 flex-shrink-0">
                      {terminal.aiTool === 'claude-code' ? 'claude' : terminal.aiTool}
                    </span>
                  )}
                </div>
                {/* Session ID */}
                {terminal.sessionName && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-mono text-gray-500 truncate">
                      {terminal.sessionName}
                    </span>
                    <button
                      className="p-0.5 rounded hover:bg-[#00ff88]/20 text-gray-500 hover:text-[#00ff88] transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopySessionId(terminal.sessionName!)
                      }}
                      title="Copy session ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Working Dir & Git */}
              <div className="px-4 py-2 border-b border-[#333] space-y-1">
                {terminal.workingDir && (
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[#00ff88] text-sm flex-shrink-0">📁</span>
                    <span
                      className="text-[12px] text-[#00ff88] font-mono truncate"
                      title={terminal.workingDir}
                    >
                      {compactPath(terminal.workingDir)}
                    </span>
                  </div>
                )}
                {terminal.gitBranch && (
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <span className="text-[12px] text-purple-400 truncate">{terminal.gitBranch}</span>
                  </div>
                )}
              </div>

              {/* Claude Status + Context */}
              {terminal.claudeState && (
                <div className="px-4 py-2 border-b border-[#333]">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-sm flex-shrink-0">🤖</span>
                    <span className="text-[12px] text-gray-300 truncate min-w-0 flex-1">
                      {status ? (
                        status.detail
                          ? `${status.emoji} ${status.label}: ${status.detail}`
                          : `${status.label}`
                      ) : 'Unknown'}
                    </span>
                    {contextPct != null && (
                      <span
                        className="text-[11px] font-medium flex-shrink-0"
                        style={{ color: getContextColor(contextPct) }}
                      >
                        {contextPct}%
                      </span>
                    )}
                  </div>
                  {/* Context bar */}
                  {contextPct != null && (
                    <div className="mt-1.5 h-1.5 bg-[#333] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${contextPct}%`,
                          backgroundColor: getContextColor(contextPct),
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Status History */}
              {history.length > 0 && (
                <div className="px-4 py-2 border-b border-[#333]">
                  <div className="text-[10px] text-[#00ff88]/60 mb-1">Recent activity</div>
                  <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
                    {history.slice(0, 5).map((entry, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="text-gray-400 flex-1 truncate">{entry.text}</span>
                        <span className="text-[#00ff88]/50 text-[9px] flex-shrink-0">
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer: Created + Actions */}
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">
                  {terminal.createdAt ? `Created ${formatRelativeTime(terminal.createdAt)}` : ''}
                </span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {onViewAsText && (
                    <button
                      onClick={() => onViewAsText(terminal.sessionName || terminal.id)}
                      className="p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                      title="View as text"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onKill && (
                    <button
                      onClick={() => onKill(terminal.id)}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      title="Kill terminal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenu.show && (() => {
        const terminal = terminals.find((t) => t.id === contextMenu.terminalId)
        if (!terminal) return null

        return (
          <div
            className="fixed z-[100] bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 150),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {terminal.sessionName && (
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
          </div>
        )
      })()}
    </div>
  )
}
