import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import { connectToBackground, sendMessage } from '../shared/messaging'
import type { Profile } from '../components/settings/types'
import type { TerminalSession } from '../hooks/useTerminalSessions'
import '../styles/globals.css'

// ============================================
// Types
// ============================================

type SendMode = 'execute' | 'paste' | 'paste-focus'

interface TargetOption {
  type: 'current' | 'terminal' | 'new'
  id?: string
  name?: string
  profileId?: string
  isClaudeSession?: boolean
}

interface ClaudeStatus {
  status: string
  tmuxPane?: string
  context_pct?: number
}

// ============================================
// Main Composer Component
// ============================================

function CommandComposer() {
  // URL params for pre-filled content
  const urlParams = new URLSearchParams(window.location.search)
  const initialText = urlParams.get('text') || ''
  const initialTarget = urlParams.get('target') || ''

  // Core state
  const [command, setCommand] = useState(initialText)
  const [mode, setMode] = useState<SendMode>('execute')
  const [target, setTarget] = useState<TargetOption>({ type: 'current' })
  const [closeAfterSend, setCloseAfterSend] = useState(true)
  const [nonInteractive, setNonInteractive] = useState(false)

  // AI Enhancement state
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null)

  // Terminal data from sidebar
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [claudeStatuses, setClaudeStatuses] = useState<Map<string, ClaudeStatus>>(new Map())
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  // UI state
  const [showTargetDropdown, setShowTargetDropdown] = useState(false)
  const [showNewTerminalPanel, setShowNewTerminalPanel] = useState(false)
  const [newTerminalProfile, setNewTerminalProfile] = useState<string>('')
  const [newTerminalName, setNewTerminalName] = useState('')
  const [newTerminalDir, setNewTerminalDir] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load terminal data from Chrome storage and connect to background
  useEffect(() => {
    // Load initial data
    chrome.storage.local.get(['terminalSessions', 'currentTerminalId', 'profiles', 'globalWorkingDir'], (result: { terminalSessions?: TerminalSession[], currentTerminalId?: string, profiles?: Profile[], globalWorkingDir?: string }) => {
      if (result.terminalSessions) {
        setSessions(result.terminalSessions as TerminalSession[])
      }
      if (result.currentTerminalId) {
        setCurrentSessionId(result.currentTerminalId)
        if (initialTarget) {
          const found = (result.terminalSessions as TerminalSession[])?.find(s =>
            s.id === initialTarget || s.sessionName === initialTarget
          )
          if (found) {
            setTarget({ type: 'terminal', id: found.id, name: found.name })
          }
        }
      }
      if (result.profiles) {
        setProfiles(result.profiles as Profile[])
        if (!newTerminalProfile && (result.profiles as Profile[]).length > 0) {
          setNewTerminalProfile((result.profiles as Profile[])[0].id)
        }
      }
      if (result.globalWorkingDir) {
        setNewTerminalDir(result.globalWorkingDir as string)
      }
    })

    // Connect to background for updates
    const port = connectToBackground('composer', (message) => {
      if (message.type === 'INITIAL_STATE') {
        setWsConnected((message as any).wsConnected)
      } else if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      } else if (message.type === 'WS_MESSAGE') {
        const data = (message as any).data
        if (data?.type === 'terminals') {
          const backendTerminals = (data.data || []).filter((t: any) => t.id?.startsWith('ctt-'))
          chrome.storage.local.get(['terminalSessions'], (result) => {
            const stored = (result.terminalSessions as TerminalSession[]) || []
            const merged = backendTerminals.map((t: any) => {
              const existing = stored.find(s => s.id === t.id)
              return existing ? { ...existing, ...t } : t
            })
            setSessions(merged)
          })
        } else if (data?.type === 'terminal-spawned') {
          setSessions(prev => {
            if (prev.find(s => s.id === data.data?.id)) return prev
            return [...prev, data.data]
          })
        } else if (data?.type === 'terminal-closed') {
          const closedId = data.data?.id || data.terminalId
          setSessions(prev => prev.filter(s => s.id !== closedId))
        } else if (data?.type === 'claude-status') {
          // Update Claude status for sessions
          setClaudeStatuses(prev => {
            const next = new Map(prev)
            next.set(data.terminalId, data.status)
            return next
          })
        }
      }
    })

    // Listen for storage changes
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.terminalSessions?.newValue) {
        setSessions(changes.terminalSessions.newValue as TerminalSession[])
      }
      if (changes.currentTerminalId?.newValue) {
        setCurrentSessionId(changes.currentTerminalId.newValue as string)
      }
      if (changes.profiles?.newValue) {
        setProfiles(changes.profiles.newValue as Profile[])
      }
    }

    chrome.storage.local.onChanged.addListener(handleStorageChange)

    // Focus textarea on mount
    setTimeout(() => textareaRef.current?.focus(), 100)

    return () => {
      port.disconnect()
      chrome.storage.local.onChanged.removeListener(handleStorageChange)
    }
  }, [initialTarget, newTerminalProfile])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTargetDropdown(false)
        setShowNewTerminalPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 400)}px`
    }
  }, [command])

  // Send command to terminal(s)
  const handleSend = useCallback(async () => {
    if (!command.trim()) return

    const textToSend = enhancedPreview || command

    // Determine target terminal(s)
    let targetId: string | null = null
    let tmuxPane: string | undefined
    let tmuxSession: string | undefined

    if (target.type === 'new') {
      // Spawn new terminal first
      const profile = profiles.find(p => p.id === newTerminalProfile)
      if (profile) {
        sendMessage({
          type: 'SPAWN_TERMINAL',
          spawnOption: 'bash',
          name: newTerminalName || profile.name,
          workingDir: newTerminalDir || profile.workingDir,
          command: nonInteractive ? `${profile.command || ''} ${textToSend}`.trim() : profile.command,
          profile: { ...profile, workingDir: newTerminalDir || profile.workingDir },
        })
        // Close after spawn if non-interactive
        if (nonInteractive && closeAfterSend) {
          setTimeout(() => window.close(), 500)
        }
        return
      }
    } else if (target.type === 'terminal' && target.id) {
      targetId = target.id
      const session = sessions.find(s => s.id === target.id)
      tmuxSession = session?.sessionName
      const status = claudeStatuses.get(target.id)
      tmuxPane = status?.tmuxPane
    } else {
      // Current tab
      targetId = currentSessionId
      if (targetId) {
        const session = sessions.find(s => s.id === targetId)
        tmuxSession = session?.sessionName
        const status = claudeStatuses.get(targetId)
        tmuxPane = status?.tmuxPane
      }
    }

    if (!targetId) {
      console.warn('[Composer] No target terminal')
      return
    }

    // Send using the appropriate method
    const sendEnter = mode === 'execute'

    if (tmuxPane) {
      // Preferred: targeted pane send
      sendMessage({
        type: 'TARGETED_PANE_SEND',
        tmuxPane,
        text: textToSend,
        sendEnter,
      })
    } else if (tmuxSession) {
      // Fallback: tmux session send
      sendMessage({
        type: 'TMUX_SESSION_SEND',
        sessionName: tmuxSession,
        text: textToSend,
        sendEnter,
      })
    } else {
      // Last resort: PTY send
      sendMessage({
        type: 'TERMINAL_INPUT',
        terminalId: targetId,
        data: textToSend,
      })
      if (sendEnter) {
        setTimeout(() => {
          sendMessage({
            type: 'TERMINAL_INPUT',
            terminalId: targetId!,
            data: '\r',
          })
        }, 300)
      }
    }

    // Focus terminal if requested
    if (mode === 'paste-focus') {
      // Broadcast to sidebar to focus the terminal
      chrome.runtime.sendMessage({
        type: 'SWITCH_TO_TERMINAL',
        terminalId: targetId,
      })
    }

    // Close window if requested
    if (closeAfterSend) {
      setTimeout(() => window.close(), 200)
    } else {
      // Clear for next command
      setCommand('')
      setEnhancedPreview(null)
      textareaRef.current?.focus()
    }
  }, [command, enhancedPreview, target, mode, closeAfterSend, nonInteractive, currentSessionId, sessions, claudeStatuses, profiles, newTerminalProfile, newTerminalName, newTerminalDir])

  // AI Enhancement (calls backend)
  const handleEnhance = useCallback(async () => {
    if (!command.trim() || isEnhancing) return

    setIsEnhancing(true)
    try {
      const response = await fetch('http://localhost:8129/api/ai/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: command,
          context: 'terminal command or AI prompt',
        }),
      })
      const data = await response.json()
      if (data.success && data.enhanced) {
        setEnhancedPreview(data.enhanced)
      }
    } catch (err) {
      console.error('[Composer] Enhancement failed:', err)
    } finally {
      setIsEnhancing(false)
    }
  }, [command, isEnhancing])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
      return
    }
    // Escape to close
    if (e.key === 'Escape') {
      e.preventDefault()
      window.close()
      return
    }
    // Cmd/Ctrl+E to enhance
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault()
      handleEnhance()
      return
    }
  }, [handleSend, handleEnhance])

  // Get current target display name
  const getTargetLabel = () => {
    if (target.type === 'new') return 'New Terminal'
    if (target.type === 'terminal' && target.name) return target.name
    if (currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId)
      return session?.name || 'Current'
    }
    return 'Current'
  }

  // Check if target is a Claude session
  const isClaudeTarget = () => {
    const targetId = target.type === 'terminal' ? target.id : currentSessionId
    if (!targetId) return false
    const session = sessions.find(s => s.id === targetId)
    const cmd = session?.profile?.command || session?.command || ''
    return cmd.toLowerCase().includes('claude')
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden select-none">
      {/* Header - Draggable title bar */}
      <header
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#1f1f1f] bg-gradient-to-r from-[#0f0f0f] to-[#141414]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-[#00ff88] to-[#00cc6a] flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 17l6-6-6-6M12 19h8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-200">Command Composer</span>
          </div>
          {/* Connection status */}
          <div className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
            wsConnected
              ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {wsConnected ? 'Connected' : 'Offline'}
          </div>
        </div>
        <button
          onClick={() => window.close()}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Close (Esc)"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        {/* Target selection row */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Target</label>
          <div className="relative flex-1" ref={dropdownRef}>
            <button
              onClick={() => setShowTargetDropdown(!showTargetDropdown)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                showTargetDropdown
                  ? 'border-[#00ff88]/50 bg-[#00ff88]/5'
                  : 'border-[#2a2a2a] bg-[#141414] hover:border-[#3a3a3a]'
              }`}
            >
              <div className="flex items-center gap-2">
                {target.type === 'new' ? (
                  <svg className="w-4 h-4 text-[#00ff88]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
                  </svg>
                ) : isClaudeTarget() ? (
                  <span className="text-orange-400">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2a2 2 0 012 2v2h3a2 2 0 012 2v10a4 4 0 01-4 4H9a4 4 0 01-4-4V8a2 2 0 012-2h3V4a2 2 0 012-2zm0 6a2 2 0 100 4 2 2 0 000-4z"/>
                    </svg>
                  </span>
                ) : (
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 17l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <span className="text-sm text-white">{getTargetLabel()}</span>
              </div>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${showTargetDropdown ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Dropdown */}
            {showTargetDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-2xl z-50 overflow-hidden">
                {/* Current tab option */}
                <button
                  onClick={() => {
                    setTarget({ type: 'current' })
                    setShowTargetDropdown(false)
                    setShowNewTerminalPanel(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    target.type === 'current' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className="w-4 text-center">{target.type === 'current' ? '●' : '○'}</span>
                  <span className="text-sm">Current Tab</span>
                </button>

                {/* Separator */}
                <div className="border-t border-[#2a2a2a] my-1" />

                {/* Terminal list */}
                <div className="max-h-48 overflow-y-auto">
                  {sessions.map(session => {
                    const isSelected = target.type === 'terminal' && target.id === session.id
                    const isClaude = (session.profile?.command || session.command || '').toLowerCase().includes('claude')
                    const status = claudeStatuses.get(session.id)

                    return (
                      <button
                        key={session.id}
                        onClick={() => {
                          setTarget({ type: 'terminal', id: session.id, name: session.name })
                          setShowTargetDropdown(false)
                          setShowNewTerminalPanel(false)
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                          isSelected ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="w-4 text-center text-xs">{isSelected ? '●' : '○'}</span>
                        <span className="flex-1 text-sm truncate flex items-center gap-1.5">
                          {isClaude && <span className="text-orange-400 text-xs">AI</span>}
                          {session.name}
                        </span>
                        {status?.context_pct !== undefined && (
                          <span className={`text-[10px] font-mono ${
                            status.context_pct > 80 ? 'text-red-400' :
                            status.context_pct > 60 ? 'text-amber-400' : 'text-gray-500'
                          }`}>
                            {status.context_pct}%
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Separator */}
                <div className="border-t border-[#2a2a2a] my-1" />

                {/* New terminal option */}
                <button
                  onClick={() => {
                    setTarget({ type: 'new' })
                    setShowNewTerminalPanel(true)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    target.type === 'new' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
                  </svg>
                  <span className="text-sm">Spawn New Terminal...</span>
                </button>

                {/* New terminal configuration panel */}
                {showNewTerminalPanel && (
                  <div className="border-t border-[#2a2a2a] p-3 bg-[#141414] space-y-3">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Profile</label>
                      <select
                        value={newTerminalProfile}
                        onChange={(e) => setNewTerminalProfile(e.target.value)}
                        className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-sm text-white focus:border-[#00ff88]/50 focus:outline-none"
                      >
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Name (optional)</label>
                      <input
                        type="text"
                        value={newTerminalName}
                        onChange={(e) => setNewTerminalName(e.target.value)}
                        placeholder={profiles.find(p => p.id === newTerminalProfile)?.name || 'Terminal'}
                        className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-sm text-white placeholder-gray-600 focus:border-[#00ff88]/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">Directory</label>
                      <input
                        type="text"
                        value={newTerminalDir}
                        onChange={(e) => setNewTerminalDir(e.target.value)}
                        placeholder="~/projects"
                        className="w-full px-2 py-1.5 bg-[#0a0a0a] border border-[#2a2a2a] rounded text-sm text-white font-mono placeholder-gray-600 focus:border-[#00ff88]/50 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setShowTargetDropdown(false)}
                      className="w-full py-1.5 bg-[#00ff88]/20 border border-[#00ff88]/30 rounded text-sm text-[#00ff88] font-medium hover:bg-[#00ff88]/30 transition-colors"
                    >
                      Configure
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Command editor */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Command / Prompt</label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnhance}
                disabled={isEnhancing || !command.trim()}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isEnhancing
                    ? 'bg-purple-500/20 text-purple-300 cursor-wait'
                    : command.trim()
                      ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30'
                      : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                }`}
                title="Enhance with AI (Ctrl+E)"
              >
                {isEnhancing ? (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L9 7l-5 1 3.5 4L7 17l5-2.5L17 17l-.5-5L20 8l-5-1z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {isEnhancing ? 'Enhancing...' : 'Enhance'}
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-0">
            <textarea
              ref={textareaRef}
              value={command}
              onChange={(e) => {
                setCommand(e.target.value)
                setEnhancedPreview(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder={isClaudeTarget()
                ? "Enter your prompt for Claude..."
                : "Enter command to execute..."}
              className="w-full h-full min-h-[120px] resize-none px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-sm text-white font-mono leading-relaxed placeholder-gray-600 focus:border-[#00ff88]/50 focus:outline-none focus:ring-1 focus:ring-[#00ff88]/20"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />

            {/* Enhanced preview overlay */}
            {enhancedPreview && (
              <div className="absolute inset-0 bg-[#0f0f0f] border border-purple-500/30 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/20">
                  <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wider">Enhanced Preview</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setCommand(enhancedPreview)
                        setEnhancedPreview(null)
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setEnhancedPreview(null)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-400 hover:text-white transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <pre className="p-4 text-sm text-purple-200 font-mono leading-relaxed overflow-auto h-full" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {enhancedPreview}
                </pre>
              </div>
            )}
          </div>

          {/* Character/line count */}
          <div className="flex items-center justify-between text-[10px] text-gray-600 px-1">
            <span>{command.length} chars • {command.split('\n').length} lines</span>
            <span className="text-gray-500">Ctrl+Enter to send • Esc to close</span>
          </div>
        </div>

        {/* Options row */}
        <div className="flex items-center gap-4 py-2 border-t border-[#1f1f1f]">
          {/* Mode selection */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</span>
            <div className="flex bg-[#141414] rounded-lg p-0.5 border border-[#2a2a2a]">
              {[
                { value: 'execute', label: 'Execute', icon: '⚡' },
                { value: 'paste', label: 'Paste', icon: '📋' },
                { value: 'paste-focus', label: 'Paste + Focus', icon: '🎯' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value as SendMode)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    mode === opt.value
                      ? 'bg-[#00ff88]/20 text-[#00ff88]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title={opt.label}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-[#2a2a2a]" />

          {/* Toggles */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={closeAfterSend}
              onChange={(e) => setCloseAfterSend(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-8 h-4 rounded-full transition-colors ${closeAfterSend ? 'bg-[#00ff88]/30' : 'bg-[#2a2a2a]'}`}>
              <div className={`w-3 h-3 rounded-full transition-all mt-0.5 ${closeAfterSend ? 'bg-[#00ff88] ml-4' : 'bg-gray-500 ml-0.5'}`} />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-300">Close after</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={nonInteractive}
              onChange={(e) => setNonInteractive(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-8 h-4 rounded-full transition-colors ${nonInteractive ? 'bg-amber-500/30' : 'bg-[#2a2a2a]'}`}>
              <div className={`w-3 h-3 rounded-full transition-all mt-0.5 ${nonInteractive ? 'bg-amber-400 ml-4' : 'bg-gray-500 ml-0.5'}`} />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-300">Non-interactive</span>
          </label>
        </div>
      </main>

      {/* Footer - Send button */}
      <footer className="px-4 py-3 border-t border-[#1f1f1f] bg-gradient-to-r from-[#0f0f0f] to-[#141414]">
        <button
          onClick={handleSend}
          disabled={!command.trim() || (!wsConnected && target.type !== 'new')}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
            command.trim() && (wsConnected || target.type === 'new')
              ? 'bg-gradient-to-r from-[#00ff88] to-[#00cc6a] text-black hover:from-[#00ff88] hover:to-[#00ff88] shadow-lg shadow-[#00ff88]/20'
              : 'bg-[#2a2a2a] text-gray-500 cursor-not-allowed'
          }`}
        >
          {target.type === 'new'
            ? `Spawn & ${mode === 'execute' ? 'Execute' : 'Paste'}`
            : mode === 'execute'
              ? 'Send & Execute'
              : mode === 'paste-focus'
                ? 'Paste & Focus'
                : 'Paste Only'}
        </button>
      </footer>
    </div>
  )
}

// Mount the app
ReactDOM.createRoot(document.getElementById('composer-root')!).render(
  <React.StrictMode>
    <CommandComposer />
  </React.StrictMode>
)
