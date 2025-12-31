import React, { useEffect, useState, useRef } from 'react'
import { PanelLeft, Unplug } from 'lucide-react'
import {
  GitBranchIcon,
  CopyIcon,
  DeleteIcon,
  EyeIcon,
  ExpandIcon,
  MaximizeIcon,
  SettingsIcon,
  AttachFileIcon,
  BotIcon,
  BotMessageSquareIcon,
} from '../../components/icons'
import { AnimatedMenuItem } from '../../components/AnimatedMenuItem'
import { compactPath } from '../../shared/utils'
import { type TerminalItem, type TerminalDisplayMode } from './ActiveTerminalsList'
import { themes } from '../../styles/themes'
import { getGradientCSS, DEFAULT_PANEL_COLOR, DEFAULT_TRANSPARENCY } from '../../styles/terminal-backgrounds'

// Helper to get media URL (matches Terminal.tsx pattern)
const getMediaUrl = (path: string | undefined): string | null => {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://')) {
    return path
  }
  return `http://localhost:8129/api/media?path=${encodeURIComponent(path)}`
}

interface StatusHistoryEntry {
  text: string
  timestamp: number
}

interface TerminalsGridProps {
  terminals: TerminalItem[]
  loading?: boolean
  onKill?: (id: string) => void
  onViewAsText?: (id: string) => void
  onSwitchTo?: (id: string, displayMode?: TerminalDisplayMode) => void
  onDetach?: (id: string) => void
  onPopOut?: (terminalId: string, sessionName: string) => void
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

// Display mode indicator component
const DisplayModeIndicator = ({ mode }: { mode?: TerminalDisplayMode }) => {
  if (!mode || mode === 'sidebar') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-gray-800 text-gray-400 border border-gray-700" title="In sidebar">
        <PanelLeft className="w-3 h-3" />
      </span>
    )
  }
  if (mode === 'popout') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400 border border-blue-500/50" title="Popped out">
        <MaximizeIcon size={12} />
      </span>
    )
  }
  if (mode === '3d') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/50" title="3D Focus">
        <ExpandIcon size={12} />
      </span>
    )
  }
  return null
}

// Get rich Claude status display
const getClaudeStatusDisplay = (claudeState: TerminalItem['claudeState'], paneTitle?: string | null) => {
  if (!claudeState) return null

  const emoji = claudeState.currentTool ? (toolEmojis[claudeState.currentTool] || '🔧') : ''
  let label = ''
  let detail = ''

  if (claudeState.status === 'awaiting_input' || claudeState.status === 'idle') {
    // Show paneTitle (current todo) instead of generic "Ready" when available
    if (paneTitle) {
      label = paneTitle
    } else {
      label = 'Ready'
    }
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

  const isWorking = claudeState.status !== 'idle' && claudeState.status !== 'awaiting_input'
  return { label, detail, emoji, isWorking }
}

export function TerminalsGrid({
  terminals,
  loading = false,
  onKill,
  onViewAsText,
  onSwitchTo,
  onDetach,
  onPopOut,
  emptyMessage = 'No active terminals',
}: TerminalsGridProps) {
  // Status history tracking (per terminal)
  const [statusHistory, setStatusHistory] = useState<Map<string, StatusHistoryEntry[]>>(new Map())
  const lastStatusTextRef = useRef<Map<string, string>>(new Map())
  const initialLoadDone = useRef(false)

  // Load initial history from Chrome storage (synced from sidebar)
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true

    chrome.storage.local.get(['claudeStatusHistory'], (result) => {
      if (result.claudeStatusHistory) {
        const historyObj = result.claudeStatusHistory as Record<string, StatusHistoryEntry[]>
        const historyMap = new Map<string, StatusHistoryEntry[]>()
        for (const [id, entries] of Object.entries(historyObj)) {
          historyMap.set(id, entries)
          // Set last status text to avoid duplicating on first poll
          if (entries.length > 0) {
            lastStatusTextRef.current.set(id, entries[0].text)
          }
        }
        setStatusHistory(historyMap)
      }
    })
  }, [])

  // Listen for history updates from sidebar
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.claudeStatusHistory?.newValue) {
        const historyObj = changes.claudeStatusHistory.newValue as Record<string, StatusHistoryEntry[]>
        const historyMap = new Map<string, StatusHistoryEntry[]>()
        for (const [id, entries] of Object.entries(historyObj)) {
          historyMap.set(id, entries)
          if (entries.length > 0) {
            lastStatusTextRef.current.set(id, entries[0].text)
          }
        }
        setStatusHistory(historyMap)
      }
    }

    chrome.storage.local.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.local.onChanged.removeListener(handleStorageChange)
  }, [])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    terminalId: string | null
  }>({ show: false, x: 0, y: 0, terminalId: null })

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

  const handleEditProfile = (terminal: TerminalItem) => {
    const profileId = terminal.profile?.id || 'default'
    // Navigate within dashboard using hash routing
    window.location.hash = `/profiles?edit=${encodeURIComponent(profileId)}`
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  const handleOpenReference = (terminal: TerminalItem) => {
    const reference = terminal.profile?.reference
    if (!reference) return
    if (reference.startsWith('http://') || reference.startsWith('https://')) {
      window.open(reference, '_blank')
    } else {
      window.location.hash = `/files?path=${encodeURIComponent(reference)}`
    }
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  const handlePopOut = (terminal: TerminalItem) => {
    if (!terminal.sessionName) return
    onPopOut?.(terminal.id, terminal.sessionName)
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  const handleDetach = (terminal: TerminalItem) => {
    onDetach?.(terminal.id)
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
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {terminals.map((terminal) => {
          const history = statusHistory.get(terminal.id) || []
          const status = getClaudeStatusDisplay(terminal.claudeState, terminal.paneTitle)
          const contextPct = terminal.claudeState?.context_pct

          // Compute themed background from profile
          const profile = terminal.profile
          const effectivePanelColor = profile?.panelColor ?? DEFAULT_PANEL_COLOR
          const effectiveGradientCSS = getGradientCSS(profile?.backgroundGradient, true) // always dark mode
          const gradientOpacity = (profile?.transparency ?? DEFAULT_TRANSPARENCY) / 100
          const themeForeground = themes[profile?.themeName || 'tokyo-night']?.dark.colors.foreground ?? '#e0e0e0'
          const themeGreen = themes[profile?.themeName || 'tokyo-night']?.dark.colors.green ?? '#00ff88'

          // Background media
          const mediaUrl = getMediaUrl(profile?.backgroundMedia)
          const mediaOpacity = (profile?.backgroundMediaOpacity ?? 50) / 100
          const showMedia = profile?.backgroundMediaType && profile.backgroundMediaType !== 'none' && mediaUrl

          return (
            <div
              key={terminal.id}
              onClick={() => onSwitchTo?.(terminal.sessionName || terminal.id, terminal.displayMode)}
              onContextMenu={(e) => handleContextMenu(e, terminal.id)}
              className="relative rounded-xl border border-border hover:border-primary/50 transition-all cursor-pointer overflow-hidden min-h-[200px] flex flex-col hover:shadow-lg"
            >
              {/* Layer 1: Panel color */}
              <div
                className="absolute inset-0"
                style={{ backgroundColor: effectivePanelColor }}
              />

              {/* Layer 2: Background media */}
              {showMedia && profile?.backgroundMediaType === 'video' && (
                <video
                  key={mediaUrl}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ opacity: mediaOpacity }}
                  src={mediaUrl!}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              )}
              {showMedia && profile?.backgroundMediaType === 'image' && (
                <img
                  key={mediaUrl}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ opacity: mediaOpacity }}
                  src={mediaUrl!}
                  alt=""
                />
              )}

              {/* Layer 3: Gradient overlay */}
              <div
                className="absolute inset-0"
                style={{ background: effectiveGradientCSS, opacity: gradientOpacity }}
              />

              {/* Content */}
              <div className="relative z-10 flex flex-col flex-1">
                {/* Header: Name + Display Mode + AI Tool */}
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium truncate" style={{ color: themeForeground }}>
                      {terminal.name || 'Unnamed'}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <DisplayModeIndicator mode={terminal.displayMode} />
                      {terminal.aiTool && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-black/40 text-orange-400 border border-orange-500/50">
                          {terminal.aiTool === 'claude-code' ? 'claude' : terminal.aiTool}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Session ID */}
                  {terminal.sessionName && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-mono text-white/40 truncate">
                        {terminal.sessionName}
                      </span>
                      <button
                        className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopySessionId(terminal.sessionName!)
                        }}
                        title="Copy session ID"
                      >
                        <CopyIcon size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Working Dir & Git */}
                <div className="px-4 py-2 border-b border-white/10 space-y-1">
                  {terminal.workingDir && (
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-sm flex-shrink-0" style={{ color: themeGreen }}>📁</span>
                      <span
                        className="text-[12px] font-mono truncate"
                        style={{ color: themeGreen }}
                        title={terminal.workingDir}
                      >
                        {compactPath(terminal.workingDir)}
                      </span>
                    </div>
                  )}
                  {terminal.gitBranch && (
                    <div className="flex items-center gap-2">
                      <GitBranchIcon size={16} className="text-purple-400 flex-shrink-0" />
                      <span className="text-[12px] text-purple-400 truncate">{terminal.gitBranch}</span>
                    </div>
                  )}
                </div>

                {/* Claude Status + Context */}
                {terminal.claudeState && (
                  <div className="px-4 py-2 border-b border-white/10">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {/* Animated bot icon - orange, loops continuously */}
                      <span className="flex-shrink-0 text-orange-400">
                        {status?.isWorking ? (
                          <BotMessageSquareIcon size={16} animate />
                        ) : (
                          <BotIcon size={16} animate />
                        )}
                      </span>
                      {/* Green checkmark when ready */}
                      {status && !status.isWorking && (
                        <span className="flex-shrink-0 text-sm" style={{ color: '#00ff88' }}>✓</span>
                      )}
                      <span className="text-sm truncate min-w-0 flex-1" style={{ color: themeForeground }}>
                        {status ? (
                          status.detail
                            ? `${status.isWorking ? status.emoji + ' ' : ''}${status.label}: ${status.detail}`
                            : `${status.label}`
                        ) : 'Unknown'}
                      </span>
                      {contextPct != null && (
                        <span
                          className="text-sm font-medium flex-shrink-0"
                          style={{ color: getContextColor(contextPct) }}
                        >
                          {contextPct}%
                        </span>
                      )}
                    </div>
                    {/* Context bar */}
                    {contextPct != null && (
                      <div className="mt-1.5 h-1.5 bg-white/10 rounded-full overflow-hidden">
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

                {/* Non-Claude terminal with paneTitle (e.g., PyRadio song, app status) */}
                {!terminal.claudeState && terminal.paneTitle && (
                  <div className="px-4 py-2 border-b border-white/10">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="flex-shrink-0 text-sm" style={{ color: themeGreen }}>▸</span>
                      <span className="text-sm truncate min-w-0 flex-1" style={{ color: themeGreen }}>
                        {terminal.paneTitle}
                      </span>
                    </div>
                  </div>
                )}

                {/* Status History */}
                {history.length > 0 && (
                  <div className="px-4 py-2 border-b border-white/10">
                    <div className="text-xs font-medium mb-1.5" style={{ color: themeGreen }}>Recent activity</div>
                    <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
                      {history.map((entry, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="flex-1 truncate" style={{ color: themeForeground }}>{entry.text}</span>
                          <span className="text-[10px] flex-shrink-0" style={{ color: `${themeGreen}cc` }}>
                            {formatRelativeTime(entry.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer: Created + Actions - mt-auto pushes to bottom */}
                <div className="px-4 py-2 flex items-center justify-between mt-auto">
                  <span className="text-[10px] text-white/40">
                    {terminal.createdAt ? `Created ${formatRelativeTime(terminal.createdAt)}` : ''}
                  </span>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {terminal.sessionName && (
                      <>
                        <button
                          onClick={() => handleEditProfile(terminal)}
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                          title="Edit Profile"
                        >
                          <SettingsIcon size={14} />
                        </button>
                        <button
                          onClick={() => handleCopySessionId(terminal.sessionName!)}
                          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                          title="Copy Session ID"
                        >
                          <CopyIcon size={14} />
                        </button>
                        {onPopOut && (
                          <button
                            onClick={() => handlePopOut(terminal)}
                            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                            title="Pop Out"
                          >
                            <MaximizeIcon size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenIn3D(terminal)}
                          className="p-1 rounded hover:bg-cyan-500/20 text-white/50 hover:text-cyan-400 transition-colors"
                          title="Open in 3D Focus"
                        >
                          <ExpandIcon size={14} />
                        </button>
                      </>
                    )}
                    {onViewAsText && terminal.sessionName && (
                      <button
                        onClick={() => onViewAsText(terminal.sessionName || terminal.id)}
                        className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
                        title="View as text"
                      >
                        <EyeIcon size={14} />
                      </button>
                    )}
                    {onKill && (
                      <button
                        onClick={() => onKill(terminal.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                        title="Kill terminal"
                      >
                        <DeleteIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>{/* Close z-10 content wrapper */}
            </div>
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenu.show && (() => {
        const terminal = terminals.find((t) => t.id === contextMenu.terminalId)
        if (!terminal) return null
        const hasReference = !!terminal.profile?.reference

        return (
          <div
            className="fixed z-[100] bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl py-1 min-w-[200px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 220),
              top: Math.min(contextMenu.y, window.innerHeight - 320),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {terminal.sessionName && (
              <>
                {/* Profile Actions */}
                <AnimatedMenuItem
                  icon={SettingsIcon}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#00ff88]/10 hover:text-[#00ff88] flex items-center gap-2 transition-colors"
                  onClick={() => handleEditProfile(terminal)}
                >
                  Edit Profile...
                </AnimatedMenuItem>
                {hasReference && (
                  <AnimatedMenuItem
                    icon={AttachFileIcon}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-blue-500/10 hover:text-blue-400 flex items-center gap-2 transition-colors"
                    onClick={() => handleOpenReference(terminal)}
                  >
                    Open Reference
                  </AnimatedMenuItem>
                )}

                <div className="h-px bg-[#333] my-1" />

                {/* Window Actions */}
                {onPopOut && (
                  <AnimatedMenuItem
                    icon={MaximizeIcon}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#00ff88]/10 hover:text-[#00ff88] flex items-center gap-2 transition-colors"
                    onClick={() => handlePopOut(terminal)}
                  >
                    Pop Out
                  </AnimatedMenuItem>
                )}
                <AnimatedMenuItem
                  icon={ExpandIcon}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-cyan-500/10 hover:text-cyan-400 flex items-center gap-2 transition-colors"
                  onClick={() => handleOpenIn3D(terminal)}
                >
                  Open in 3D Focus
                </AnimatedMenuItem>

                <div className="h-px bg-[#333] my-1" />

                {/* Session Actions */}
                <AnimatedMenuItem
                  icon={CopyIcon}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#00ff88]/10 hover:text-[#00ff88] flex items-center gap-2 transition-colors"
                  onClick={() => handleCopySessionId(terminal.sessionName!)}
                >
                  Copy Session ID
                </AnimatedMenuItem>
                {onDetach && (
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-yellow-500/10 hover:text-yellow-400 flex items-center gap-2 transition-colors"
                    onClick={() => handleDetach(terminal)}
                  >
                    <Unplug className="w-4 h-4" />
                    Detach Session
                  </button>
                )}
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
