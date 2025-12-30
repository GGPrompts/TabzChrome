import React, { useEffect, useState } from 'react'
import { Terminal, Trash2, RefreshCw, LayoutGrid, LayoutList } from 'lucide-react'
import { getTerminals, killSession, killSessions, getAllTmuxSessions, getProfiles } from '../hooks/useDashboard'
import { ActiveTerminalsList, type TerminalItem } from '../components/ActiveTerminalsList'
import { TerminalsGrid } from '../components/TerminalsGrid'

interface TerminalSession {
  id: string
  name: string
  createdAt: string
  state?: string
  workingDir?: string
}

interface Profile {
  name: string
  [key: string]: any
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
  paneCommand?: string
}

type ViewMode = 'table' | 'grid'

export default function TerminalsSection() {
  const [terminals, setTerminals] = useState<TerminalSession[]>([])
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTerminals, setSelectedTerminals] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('tabz-terminals-view-mode')
    return (saved as ViewMode) || 'grid'
  })

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      setRefreshing(true)

      const [terminalsRes, tmuxRes, profilesRes] = await Promise.all([
        getTerminals(),
        getAllTmuxSessions(),
        getProfiles(),
      ])

      setTerminals(terminalsRes.data || [])
      setTmuxSessions(tmuxRes.data?.sessions || [])
      setProfiles(profilesRes || [])
      setError(null)
    } catch (err) {
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Helper to find full profile name (with emoji) from extracted name
  const getProfileDisplayName = (extractedName: string): string => {
    // Profile names may have emoji prefix like "🔧 DevOps"
    // extractedName is just "DevOps" (from session ID)
    const profile = profiles.find(p => {
      const stripped = p.name.replace(/^\p{Emoji_Presentation}\s*|\p{Emoji}\uFE0F?\s*/gu, '').trim()
      return stripped.toLowerCase() === extractedName.toLowerCase()
    })
    return profile?.name || extractedName
  }

  // Persist view mode
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('tabz-terminals-view-mode', mode)
  }

  useEffect(() => {
    fetchData(true) // Initial load with spinner
    const interval = setInterval(() => fetchData(false), 5000) // Refresh every 5s without spinner
    return () => clearInterval(interval)
  }, [])

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

  // Switch to a terminal tab in the sidebar
  const switchToTerminal = async (terminalId: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'SWITCH_TO_TERMINAL', terminalId })
    } catch (err) {
      console.error('Failed to switch to terminal:', err)
    }
  }

  // Filter to only registered terminals (excludes orphans)
  const registeredIds = new Set(terminals.map(t => t.id))
  const activeTerminals: TerminalItem[] = tmuxSessions
    .filter(s => s.name.startsWith('ctt-') && registeredIds.has(s.name))
    .map((s): TerminalItem => {
      const extractedName = s.name.replace(/^ctt-/, '').replace(/-[a-f0-9]+$/, '')
      return {
        id: s.name,
        name: getProfileDisplayName(extractedName),
        sessionName: s.name,
        workingDir: s.workingDir,
        createdAt: s.created ? new Date(parseInt(s.created) * 1000).toISOString() : undefined,
        state: 'active',
        gitBranch: s.gitBranch,
        claudeState: s.claudeState,
        aiTool: s.aiTool,
      }
    })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <Terminal className="w-8 h-8" />
            Active Terminals
          </h1>
          <p className="text-muted-foreground mt-1">
            {activeTerminals.length} terminal{activeTerminals.length !== 1 ? 's' : ''} in sidebar
            <span className="text-xs ml-2 opacity-60">• auto-refreshes every 5s</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => handleViewModeChange('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewModeChange('table')}
              className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
              title="Table view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
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
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Active Terminals - Grid or Table */}
      {viewMode === 'grid' ? (
        <TerminalsGrid
          terminals={activeTerminals}
          loading={loading}
          onKill={killTerminal}
          onViewAsText={handleViewAsText}
          onSwitchTo={switchToTerminal}
          emptyMessage="No active terminals in sidebar"
        />
      ) : (
        <div className="rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              <span className="font-semibold">Terminals</span>
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
            terminals={activeTerminals}
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
      )}
    </div>
  )
}
