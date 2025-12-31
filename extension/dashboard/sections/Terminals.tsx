import React, { useEffect, useState, useRef } from 'react'
import { Terminal, Trash2, RefreshCw, LayoutGrid, LayoutList } from 'lucide-react'
import { TerminalIcon, type AnimatedIconHandle } from '../../components/icons'
import { getTerminals, killSession, killSessions, getAllTmuxSessions, getProfiles } from '../hooks/useDashboard'
import { ActiveTerminalsList, type TerminalItem, type TerminalDisplayMode } from '../components/ActiveTerminalsList'
import { TerminalsGrid } from '../components/TerminalsGrid'
import type { Profile } from '../../components/settings/types'

interface TerminalSession {
  id: string
  name: string
  createdAt: string
  state?: string
  workingDir?: string
}

// Chrome storage terminal session (for display mode and profile tracking)
interface ChromeTerminalSession {
  id: string
  focusedIn3D?: boolean
  poppedOut?: boolean
  profile?: Profile
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
  const [chromeSessions, setChromeSessions] = useState<ChromeTerminalSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTerminals, setSelectedTerminals] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('tabz-terminals-view-mode')
    return (saved as ViewMode) || 'grid'
  })

  // Animated icon ref - play animation on mount
  const iconRef = useRef<AnimatedIconHandle>(null)
  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

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
    // Profile names may have emoji prefix like "🟠 Amber Claude"
    // extractedName from session ID is sanitized: "amber-claude" (spaces→hyphens, lowercase)
    // We need to normalize both sides for comparison
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    const profile = profiles.find(p => {
      // Strip emoji prefix from profile name
      const stripped = p.name.replace(/^\p{Emoji_Presentation}\s*|\p{Emoji}\uFE0F?\s*/gu, '').trim()
      return normalize(stripped) === normalize(extractedName)
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

  // Load Chrome storage terminal sessions (for display mode tracking)
  useEffect(() => {
    const loadChromeSessions = () => {
      chrome.storage.local.get(['terminalSessions'], (result) => {
        if (result.terminalSessions && Array.isArray(result.terminalSessions)) {
          setChromeSessions(result.terminalSessions as ChromeTerminalSession[])
        }
      })
    }

    loadChromeSessions()

    // Listen for changes to terminal sessions and profiles
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.terminalSessions) {
        const newValue = changes.terminalSessions.newValue
        setChromeSessions(Array.isArray(newValue) ? newValue as ChromeTerminalSession[] : [])
      }
      if (changes.profiles) {
        const newProfiles = changes.profiles.newValue
        setProfiles(Array.isArray(newProfiles) ? newProfiles as Profile[] : [])
      }
    }

    chrome.storage.local.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.local.onChanged.removeListener(handleStorageChange)
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

  // Switch to a terminal tab in the sidebar, or focus popout/3D window
  const switchToTerminal = async (terminalId: string, displayMode?: 'sidebar' | 'popout' | '3d') => {
    try {
      if (displayMode === 'popout') {
        // Focus the popout window instead of switching sidebar tabs
        await chrome.runtime.sendMessage({ type: 'FOCUS_POPOUT_TERMINAL', terminalId })
      } else if (displayMode === '3d') {
        // Focus the 3D Focus tab instead of switching sidebar tabs
        await chrome.runtime.sendMessage({ type: 'FOCUS_3D_TERMINAL', terminalId })
      } else {
        await chrome.runtime.sendMessage({ type: 'SWITCH_TO_TERMINAL', terminalId })
      }
    } catch (err) {
      console.error('Failed to switch to terminal:', err)
    }
  }

  // Detach session (keeps tmux running but removes from sidebar)
  const detachSession = async (terminalId: string) => {
    try {
      await fetch(`http://localhost:8129/api/terminals/${terminalId}/detach`, {
        method: 'POST',
      })
      // Refresh data to update UI
      fetchData(false)
    } catch (err) {
      console.error('Failed to detach session:', err)
    }
  }

  // Pop out terminal to standalone window
  const popOutTerminal = async (terminalId: string, sessionName: string) => {
    try {
      await fetch('http://localhost:8129/api/browser/popout-terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId, sessionName }),
      })
    } catch (err) {
      console.error('Failed to pop out terminal:', err)
    }
  }

  // Helper to get Chrome session data (display mode + profile)
  const getChromeSessionData = (terminalId: string): { displayMode: TerminalDisplayMode; profile?: Profile } => {
    const chromeSession = chromeSessions.find(s => s.id === terminalId)
    const displayMode: TerminalDisplayMode = chromeSession?.focusedIn3D ? '3d'
      : chromeSession?.poppedOut ? 'popout'
      : 'sidebar'
    // Look up profile from live profiles list to get latest settings
    const profileId = chromeSession?.profile?.id
    const liveProfile = profileId ? profiles.find(p => p.id === profileId) : undefined
    return { displayMode, profile: liveProfile || chromeSession?.profile }
  }

  // Filter to only registered terminals (excludes orphans)
  const registeredIds = new Set(terminals.map(t => t.id))

  // Build order map from Chrome storage sessions (sidebar order)
  const sidebarOrder = new Map(chromeSessions.map((s, index) => [s.id, index]))

  const activeTerminals: TerminalItem[] = tmuxSessions
    .filter(s => s.name.startsWith('ctt-') && registeredIds.has(s.name))
    .map((s): TerminalItem => {
      const extractedName = s.name.replace(/^ctt-/, '').replace(/-[a-f0-9]+$/, '')
      const { displayMode, profile } = getChromeSessionData(s.name)
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
        displayMode,
        profile,
      }
    })
    // Sort to match sidebar tab order (terminals not in sidebar go to end)
    .sort((a, b) => {
      const orderA = sidebarOrder.get(a.id) ?? Infinity
      const orderB = sidebarOrder.get(b.id) ?? Infinity
      return orderA - orderB
    })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <TerminalIcon ref={iconRef} size={32} />
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
          onDetach={detachSession}
          onPopOut={popOutTerminal}
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
            onDetach={detachSession}
            onPopOut={popOutTerminal}
          />
        </div>
      )}
    </div>
  )
}
