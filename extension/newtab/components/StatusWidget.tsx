import React from 'react'
import { Terminal, Wifi, WifiOff, Check, Bot } from 'lucide-react'

interface ClaudeState {
  status: string
  currentTool?: string | null
  context_pct?: number | null
  subagent_count?: number
}

interface TerminalInfo {
  id: string
  name: string
  workingDir?: string
  profileColor?: string
  profileIcon?: string
  claudeState?: ClaudeState | null
  paneTitle?: string | null
  aiTool?: string | null
}

// Get context percentage color
const getContextColor = (pct: number | null | undefined): string => {
  if (pct == null) return 'var(--text-muted)'
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 75) return '#f97316' // orange
  if (pct >= 50) return '#eab308' // yellow
  return '#22c55e' // green
}

// Tool emojis (matching terminal tabs)
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

interface StatusWidgetProps {
  terminals: TerminalInfo[]
  connected: boolean
  onTerminalClick: (id: string) => void
}

export function StatusWidget({ terminals, connected, onTerminalClick }: StatusWidgetProps) {
  return (
    <div className="status-widget animate-slide-up stagger-1">
      <div className="status-header">
        <span className={`status-indicator ${connected ? '' : 'offline'}`} />
        {connected ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        <span>Active Terminals</span>
        {terminals.length > 0 && (
          <span className="ml-auto text-[var(--text-secondary)]">{terminals.length}</span>
        )}
      </div>

      <div className="terminal-list">
        {terminals.length === 0 ? (
          <div className="empty-terminals">
            <Terminal className="w-5 h-5 mx-auto mb-2 opacity-40" />
            <p>No active terminals</p>
            <p className="text-[0.7rem] mt-1 opacity-60">
              Click a profile to spawn one
            </p>
          </div>
        ) : (
          terminals.slice(0, 5).map((terminal) => {
            const status = terminal.claudeState?.status
            const isReady = status === 'awaiting_input' || status === 'idle'
            const isWorking = status === 'tool_use' || status === 'processing' || status === 'working'
            const contextPct = terminal.claudeState?.context_pct
            const currentTool = terminal.claudeState?.currentTool
            const toolEmoji = currentTool && isWorking ? toolEmojis[currentTool] || '🔧' : null

            return (
              <button
                key={terminal.id}
                className="terminal-item"
                onClick={() => onTerminalClick(terminal.id)}
              >
                <div
                  className="terminal-icon"
                  style={{
                    backgroundColor: terminal.profileColor
                      ? `${terminal.profileColor}20`
                      : 'var(--elevated)',
                    color: terminal.profileColor || 'var(--accent)',
                  }}
                >
                  {terminal.profileIcon || (
                    <Terminal className="w-3 h-3" />
                  )}
                </div>
                <div className="terminal-info">
                  {/* Line 1: Name + Claude status indicators + tool emoji */}
                  <div className="terminal-name-row">
                    {terminal.aiTool && isReady && (
                      <Check className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
                    )}
                    {terminal.aiTool && isWorking && (
                      <>
                        <Bot className="w-3 h-3 text-orange-400 flex-shrink-0 animate-pulse" />
                        {toolEmoji && <span className="text-xs">{toolEmoji}</span>}
                      </>
                    )}
                    <span className="terminal-name">{terminal.name}</span>
                    {contextPct != null && (
                      <span
                        className="terminal-context"
                        style={{ color: getContextColor(contextPct) }}
                      >
                        {contextPct}%
                      </span>
                    )}
                  </div>
                  {/* Line 2: Working dir or paneTitle (for non-working state) */}
                  <div className="terminal-dir">
                    {isReady && terminal.paneTitle
                      ? terminal.paneTitle
                      : terminal.workingDir || ''
                    }
                  </div>
                </div>
              </button>
            )
          })
        )}

        {terminals.length > 5 && (
          <div className="text-center text-[0.7rem] text-[var(--text-muted)] py-1">
            +{terminals.length - 5} more
          </div>
        )}
      </div>
    </div>
  )
}
