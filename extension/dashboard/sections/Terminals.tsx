import React, { useEffect, useState } from 'react'
import { Terminal, Trash2, RefreshCw, Ghost, AlertTriangle, RotateCcw, Cpu, GitBranch, Eye } from 'lucide-react'
import { getTerminals, getOrphanedSessions, killSession, killSessions, reattachSessions, getAllTmuxSessions, killTmuxSession } from '../hooks/useDashboard'
import { ActiveTerminalsList, type TerminalItem } from '../components/ActiveTerminalsList'
import { compactPath } from '../../shared/utils'

interface TerminalSession {
  id: string
  name: string
  createdAt: string
  state?: string
  workingDir?: string
}

interface OrphanedSession {
  name: string
  created: string
  windows: number
}

interface TmuxSession {
  name: string
  windows: number
  attached: boolean
  created: string
  workingDir: string
  gitBranch?: string
  aiTool?: string | null
  tabzManaged: boolean
  claudeState?: {
    status: string
    currentTool?: string
  } | null
  paneCommand?: string
}

export default function TerminalsSection() {
  const [terminals, setTerminals] = useState<TerminalSession[]>([])
  const [orphaned, setOrphaned] = useState<OrphanedSession[]>([])
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrphans, setSelectedOrphans] = useState<Set<string>>(new Set())
  const [selectedTerminals, setSelectedTerminals] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      setRefreshing(true)

      const [terminalsRes, orphanedRes, tmuxRes] = await Promise.all([
        getTerminals(),
        getOrphanedSessions(),
        getAllTmuxSessions(),
      ])

      setTerminals(terminalsRes.data || [])
      // orphanedSessions is an array of session names (strings)
      // Convert to objects matching OrphanedSession interface
      const orphanedNames = orphanedRes.data?.orphanedSessions || []
      setOrphaned(orphanedNames.map((name: string) => ({ name, created: '', windows: 1 })))
      setTmuxSessions(tmuxRes.data?.sessions || [])
      setError(null)
    } catch (err) {
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData(true) // Initial load with spinner
    const interval = setInterval(() => fetchData(false), 5000) // Refresh every 5s without spinner
    return () => clearInterval(interval)
  }, [])

  const killOrphaned = async (sessionName: string) => {
    try {
      await killSession(sessionName)
      setOrphaned((prev) => prev.filter((s) => s.name !== sessionName))
      setSelectedOrphans((prev) => {
        const next = new Set(prev)
        next.delete(sessionName)
        return next
      })
    } catch (err) {
      console.error('Failed to kill session:', err)
    }
  }

  const killSelectedOrphans = async () => {
    for (const name of selectedOrphans) {
      await killOrphaned(name)
    }
  }

  const toggleOrphanSelect = (name: string) => {
    setSelectedOrphans((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const selectAllOrphans = () => {
    if (selectedOrphans.size === orphaned.length) {
      setSelectedOrphans(new Set())
    } else {
      setSelectedOrphans(new Set(orphaned.map((s) => s.name)))
    }
  }

  // Reattach orphaned sessions
  const reattachOrphaned = async (sessionName: string) => {
    try {
      await reattachSessions([sessionName])
      await fetchData()
    } catch (err) {
      console.error('Failed to reattach session:', err)
    }
  }

  const reattachSelectedOrphans = async () => {
    try {
      await reattachSessions(Array.from(selectedOrphans))
      setSelectedOrphans(new Set())
      await fetchData()
    } catch (err) {
      console.error('Failed to reattach sessions:', err)
    }
  }

  // Active terminal management
  const killTerminal = async (id: string) => {
    try {
      await killSession(id)
      setTerminals((prev) => prev.filter((t) => t.id !== id))
      setSelectedTerminals((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      console.error('Failed to kill terminal:', err)
    }
  }

  const killSelectedTerminals = async () => {
    const toKill = Array.from(selectedTerminals)
    try {
      await killSessions(toKill)
      setTerminals((prev) => prev.filter((t) => !selectedTerminals.has(t.id)))
      setSelectedTerminals(new Set())
    } catch (err) {
      console.error('Failed to kill terminals:', err)
    }
  }

  const toggleTerminalSelect = (id: string) => {
    setSelectedTerminals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllTerminals = () => {
    if (selectedTerminals.size === terminals.length) {
      setSelectedTerminals(new Set())
    } else {
      setSelectedTerminals(new Set(terminals.map((t) => t.id)))
    }
  }

  // Kill any tmux session (including external ones)
  const handleKillTmuxSession = async (sessionName: string) => {
    try {
      await killTmuxSession(sessionName)
      await fetchData()
    } catch (err) {
      console.error('Failed to kill tmux session:', err)
    }
  }

  // View terminal content as text
  const handleViewAsText = async (sessionName: string) => {
    try {
      const response = await fetch(`http://localhost:8129/api/tmux/sessions/${sessionName}/capture`)
      const result = await response.json()

      if (!result.success) {
        console.error('Failed to capture:', result.error)
        return
      }

      // Store in localStorage and open viewer
      const captureId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem(`tabz-capture-${captureId}`, JSON.stringify(result.data))
      window.location.search = `?capture=${captureId}`
    } catch (err) {
      console.error('Failed to view as text:', err)
    }
  }

  // Helper to get source badge styling
  // Shows origin: Tabz (ctt- prefix) vs External (other tmux sessions)
  // Uses dark bg with colored text/border for accessibility
  const getSourceBadge = (session: TmuxSession) => {
    if (session.name.startsWith('ctt-')) {
      return { label: 'Tabz', className: 'bg-black/40 text-emerald-400 border border-emerald-500/50' }
    }
    return { label: 'External', className: 'bg-black/40 text-blue-400 border border-blue-500/50' }
  }

  // Helper to format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000)
    return date.toLocaleTimeString()
  }

  // Helper to shorten path - show the end (most relevant part)
  const shortenPath = (path: string, maxLen = 35) => {
    if (!path || path.length <= maxLen) return path
    return '...' + path.slice(-maxLen + 3)
  }

  
  // Switch to a terminal tab in the sidebar
  const switchToTerminal = async (terminalId: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'SWITCH_TO_TERMINAL', terminalId })
    } catch (err) {
      console.error('Failed to switch to terminal:', err)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <Terminal className="w-8 h-8" />
            Terminals
          </h1>
          <p className="text-muted-foreground mt-1">
            {terminals.length} active, {orphaned.length} orphaned
            <span className="text-xs ml-2 opacity-60">• auto-refreshes every 5s</span>
          </p>
        </div>
        <button
          onClick={() => fetchData(false)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Orphaned Sessions Warning */}
      {orphaned.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">Orphaned Sessions</span>
              <span className="text-sm text-amber-400/70">({orphaned.length})</span>
            </div>
            {selectedOrphans.size > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={reattachSelectedOrphans}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reattach ({selectedOrphans.size})
                </button>
                <button
                  onClick={killSelectedOrphans}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Kill ({selectedOrphans.size})
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={selectedOrphans.size === orphaned.length && orphaned.length > 0}
                onChange={selectAllOrphans}
                className="w-4 h-4 rounded"
              />
              <span className="flex-1">Session Name</span>
              <span className="w-24">Windows</span>
              <span className="w-32">Created</span>
              <span className="w-32"></span>
            </div>

            {orphaned.map((session) => (
              <div
                key={session.name}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border"
              >
                <input
                  type="checkbox"
                  checked={selectedOrphans.has(session.name)}
                  onChange={() => toggleOrphanSelect(session.name)}
                  className="w-4 h-4 rounded"
                />
                <div className="flex items-center gap-2 flex-1">
                  <Ghost className="w-4 h-4 text-amber-400" />
                  <span className="font-mono text-sm">{session.name}</span>
                </div>
                <span className="w-24 text-sm text-muted-foreground">{session.windows} windows</span>
                <span className="w-32 text-sm text-muted-foreground">{session.created}</span>
                <div className="w-32 flex items-center gap-1">
                  <button
                    onClick={() => reattachOrphaned(session.name)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-sm text-primary hover:bg-primary/20"
                    title="Reattach to sidebar"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reattach
                  </button>
                  <button
                    onClick={() => killOrphaned(session.name)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-sm text-destructive hover:bg-destructive/20"
                    title="Kill session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Terminals */}
      <div className="rounded-xl bg-card border border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Active Terminals</h2>
          </div>
          {selectedTerminals.size > 0 && (
            <button
              onClick={killSelectedTerminals}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Kill Selected ({selectedTerminals.size})
            </button>
          )}
        </div>

        <ActiveTerminalsList
          terminals={tmuxSessions
            .filter(s => s.name.startsWith('ctt-'))
            .map((s): TerminalItem => ({
              id: s.name,
              name: s.name.replace(/^ctt-/, '').replace(/-[a-f0-9]+$/, ''),
              sessionName: s.name,
              workingDir: s.workingDir,
              createdAt: s.created ? new Date(parseInt(s.created) * 1000).toISOString() : undefined,
              state: 'active',
              gitBranch: s.gitBranch,
              claudeState: s.claudeState,
              aiTool: s.aiTool,
            }))}
          loading={loading}
          showCheckboxes={true}
          selectedIds={selectedTerminals}
          onToggleSelect={toggleTerminalSelect}
          onSelectAll={selectAllTerminals}
          onKill={killTerminal}
          onViewAsText={handleViewAsText}
          onSwitchTo={switchToTerminal}
        />
      </div>

      {/* All Tmux Sessions */}
      <div className="mt-6 rounded-xl bg-card border border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold">All Tmux Sessions</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
              {tmuxSessions.length}
            </span>
          </div>
        </div>
        <p className="px-4 py-2 text-sm text-muted-foreground border-b border-border">
          All tmux sessions on this system, including non-Tabz sessions
        </p>

        {tmuxSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Cpu className="w-12 h-12 mb-4 opacity-50" />
            <p>No tmux sessions found</p>
          </div>
        ) : (
          <div>
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border">
              <span className="w-40">Session</span>
              <span className="w-12 text-center">Win</span>
              <span className="w-20">AI Tool</span>
              <span className="flex-1">Working Dir</span>
              <span className="w-20">Source</span>
              <span className="w-20"></span>
            </div>

            {/* Session rows */}
            <div className="divide-y divide-border">
              {tmuxSessions.map((session) => {
                const sourceBadge = getSourceBadge(session)
                // Any session starting with ctt- is a Tabz terminal (clickable to switch)
                const isTabzSession = session.name.startsWith('ctt-')
                return (
                  <div
                    key={session.name}
                    className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors ${isTabzSession ? 'cursor-pointer' : ''}`}
                    onClick={isTabzSession ? () => switchToTerminal(session.name) : undefined}
                    title={isTabzSession ? 'Click to switch to this terminal' : undefined}
                  >
                    {/* Session name */}
                    <div className="w-40 min-w-0">
                      <div className={`font-mono text-sm truncate ${isTabzSession ? 'text-primary hover:underline' : ''}`}>{session.name}</div>
                      {session.gitBranch && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <GitBranch className="w-3 h-3" />
                          {session.gitBranch}
                        </div>
                      )}
                    </div>

                    {/* Windows */}
                    <div className="w-12 text-center text-sm text-muted-foreground">
                      {session.windows}
                    </div>

                    {/* AI Tool */}
                    <div className="w-20">
                      {session.aiTool ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-black/40 text-orange-400 border border-orange-500/50">
                          {session.aiTool}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>

                    {/* Working Dir */}
                    <div className="flex-1 min-w-0 text-sm text-muted-foreground font-mono truncate" title={session.workingDir}>
                      {compactPath(session.workingDir)}
                    </div>

                    {/* Source */}
                    <div className="w-20">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs ${sourceBadge.className}`}>
                        {sourceBadge.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="w-20 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleViewAsText(session.name)}
                        className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                        title="View as text"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleKillTmuxSession(session.name)}
                        className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        title="Kill session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
