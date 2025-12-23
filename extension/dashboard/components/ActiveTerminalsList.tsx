import React from 'react'
import { Terminal, Trash2, Eye, GitBranch, Folder } from 'lucide-react'

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
  } | null
  aiTool?: string | null
}

interface ActiveTerminalsListProps {
  terminals: TerminalItem[]
  loading?: boolean
  maxItems?: number // Limit display for preview mode
  showCheckboxes?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onSelectAll?: () => void
  onKill?: (id: string) => void
  onViewAsText?: (id: string) => void
  onSwitchTo?: (id: string) => void
  emptyMessage?: string
}

// Helper to replace home directory with ~
const compactPath = (path: string) => {
  if (!path) return path
  return path.replace(/^\/home\/[^/]+/, '~').replace(/^\/Users\/[^/]+/, '~')
}

// Format relative time
const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

// Get Claude status display
const getClaudeStatusDisplay = (claudeState: TerminalItem['claudeState']) => {
  if (!claudeState) return null

  const statusColors: Record<string, string> = {
    'tool_use': 'text-blue-400',
    'awaiting_input': 'text-green-400',
    'thinking': 'text-purple-400',
    'processing': 'text-yellow-400',
  }

  const statusLabels: Record<string, string> = {
    'tool_use': claudeState.currentTool ? `Using ${claudeState.currentTool}` : 'Using tool',
    'awaiting_input': 'Ready',
    'thinking': 'Thinking',
    'processing': 'Processing',
  }

  const color = statusColors[claudeState.status] || 'text-gray-400'
  const label = statusLabels[claudeState.status] || claudeState.status

  return { color, label }
}

// Get context percentage color (matches sidebar styling)
const getContextColor = (pct: number | null | undefined): string => {
  if (pct == null) return '#888'
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 75) return '#f97316' // orange
  if (pct >= 50) return '#eab308' // yellow
  return '#22c55e' // green
}

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

  return (
    <div>
      {/* Header row */}
      {showCheckboxes && (
        <div className="flex items-center gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border">
          <input
            type="checkbox"
            checked={selectedIds?.size === terminals.length && terminals.length > 0}
            onChange={onSelectAll}
            className="w-4 h-4 rounded"
          />
          <span className="flex-1">Terminal</span>
          <span className="w-24 text-right">Created</span>
          <span className="w-20"></span>
        </div>
      )}

      {/* Terminal rows */}
      <div className={showCheckboxes ? 'divide-y divide-border' : 'space-y-2'}>
        {displayTerminals.map((terminal) => {
          const isClickable = terminal.id.startsWith('ctt-') || terminal.sessionName?.startsWith('ctt-')
          const claudeStatus = getClaudeStatusDisplay(terminal.claudeState)

          return (
            <div
              key={terminal.id}
              className={`
                flex items-center gap-4 px-4 py-3
                ${showCheckboxes ? 'hover:bg-muted/50' : 'rounded-lg bg-muted/30 hover:bg-muted/50'}
                transition-colors
                ${isClickable ? 'cursor-pointer' : ''}
                ${selectedIds?.has(terminal.id) ? 'bg-primary/5' : ''}
              `}
              onClick={isClickable && onSwitchTo ? () => onSwitchTo(terminal.sessionName || terminal.id) : undefined}
              title={isClickable ? 'Click to switch to this terminal' : undefined}
            >
              {showCheckboxes && (
                <input
                  type="checkbox"
                  checked={selectedIds?.has(terminal.id)}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleSelect?.(terminal.id)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded"
                />
              )}

              {/* Status indicator */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                terminal.state === 'active' ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium truncate ${isClickable ? 'text-primary' : ''}`}>
                    {terminal.name || 'Unnamed'}
                  </span>
                  {terminal.aiTool && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-black/40 text-orange-400 border border-orange-500/50">
                      {terminal.aiTool}
                    </span>
                  )}
                  {claudeStatus && (
                    <span className={`text-xs ${claudeStatus.color}`}>
                      • {claudeStatus.label}
                    </span>
                  )}
                  {terminal.claudeState?.context_pct != null && (
                    <span
                      className="text-xs font-medium ml-auto"
                      style={{ color: getContextColor(terminal.claudeState.context_pct) }}
                    >
                      {terminal.claudeState.context_pct}%
                    </span>
                  )}
                </div>

                {/* Secondary info row */}
                <div className="flex items-center gap-3 mt-0.5">
                  {terminal.workingDir && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Folder className="w-3 h-3" />
                      <span className="font-mono truncate max-w-[200px]" title={terminal.workingDir}>
                        {compactPath(terminal.workingDir)}
                      </span>
                    </div>
                  )}
                  {terminal.gitBranch && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <GitBranch className="w-3 h-3" />
                      <span>{terminal.gitBranch}</span>
                    </div>
                  )}
                  {!showCheckboxes && (
                    <span className="text-xs text-muted-foreground font-mono truncate opacity-60">
                      {terminal.sessionName || terminal.id}
                    </span>
                  )}
                </div>
              </div>

              {/* Created time */}
              {terminal.createdAt && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(terminal.createdAt)}
                </span>
              )}

              {/* Actions */}
              {(onViewAsText || onKill) && (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
              )}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <p className="text-center text-sm text-muted-foreground pt-3">
          +{terminals.length - maxItems!} more terminals
        </p>
      )}
    </div>
  )
}
