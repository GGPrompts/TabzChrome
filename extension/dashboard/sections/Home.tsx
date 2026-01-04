import React, { useEffect, useState, useRef } from 'react'
import { Terminal, Clock, HardDrive, Ghost, RefreshCw, Server, ChevronRight, AlertTriangle, RotateCcw, Trash2, Cpu, Eye, GitBranch } from 'lucide-react'
import { HomeIcon, type AnimatedIconHandle } from '../../components/icons'
import { getHealth, getOrphanedSessions, getTerminals, getAllTmuxSessions, reattachSessions, killSession, killTmuxSession, getProfiles } from '../hooks/useDashboard'
import { ActiveTerminalsList, type TerminalItem } from '../components/ActiveTerminalsList'
import { compactPath } from '../../shared/utils'

interface Profile {
  name: string
  [key: string]: any
}

interface HealthData {
  uptime: number
  activeTerminals: number
  totalTerminals: number
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    rss: number
    unit: string
  }
  version: string
  nodeVersion: string
  platform: string
}

interface OrphanedSession {
  name: string
}

interface ExternalTmuxSession {
  name: string
  windows: number
  workingDir: string
  gitBranch?: string
  aiTool?: string | null
}

export default function HomeSection() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [orphanedSessions, setOrphanedSessions] = useState<OrphanedSession[]>([])
  const [externalSessions, setExternalSessions] = useState<ExternalTmuxSession[]>([])
  const [terminals, setTerminals] = useState<TerminalItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Animated icon ref - play animation on mount
  const iconRef = useRef<AnimatedIconHandle>(null)
  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Helper to find full profile name (with emoji) from extracted name
  const getProfileDisplayName = (extractedName: string, profilesList: Profile[]): string => {
    // Normalize both sides for comparison (handles space→hyphen conversion in session IDs)
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    const profile = profilesList.find(p => {
      // Strip emoji prefix from profile name
      const stripped = p.name.replace(/^\p{Emoji_Presentation}\s*|\p{Emoji}\uFE0F?\s*/gu, '').trim()
      return normalize(stripped) === normalize(extractedName)
    })
    return profile?.name || extractedName
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const [healthRes, orphanedRes, tmuxRes, terminalsRes, profilesRes] = await Promise.all([
        getHealth(),
        getOrphanedSessions(),
        getAllTmuxSessions(),
        getTerminals(),
        getProfiles(),
      ])

      // Get Chrome storage sessions for sidebar order
      const storageResult = await new Promise<{ terminalSessions?: any[] }>((resolve) =>
        chrome.storage.local.get(['terminalSessions'], (result) => resolve(result as { terminalSessions?: any[] }))
      )
      const chromeSessions = storageResult.terminalSessions || []
      const sidebarOrder = new Map(chromeSessions.map((s: any, index: number) => [s.id, index]))

      setHealth(healthRes.data)
      setProfiles(profilesRes || [])

      // Get orphaned sessions list
      const orphanedNames = orphanedRes.data?.orphanedSessions || []
      setOrphanedSessions(orphanedNames.map((name: string) => ({ name })))

      // Get registered terminal IDs
      const registeredIds = new Set((terminalsRes.data || []).map((t: any) => t.id))

      // Map tmux sessions
      const sessions = tmuxRes.data?.sessions || []

      // Active terminals (ctt-* AND registered)
      const mappedTerminals: TerminalItem[] = sessions
        .filter((s: any) => s.name.startsWith('ctt-') && registeredIds.has(s.name))
        .map((s: any) => {
          const extractedName = s.name.replace(/^ctt-/, '').replace(/-[a-f0-9]+$/, '')
          // Get display mode from Chrome session
          const chromeSession = chromeSessions.find((cs: any) => cs.id === s.name)
          const displayMode = chromeSession?.focusedIn3D ? '3d'
            : chromeSession?.poppedOut ? 'popout'
            : 'sidebar'
          return {
            id: s.name,
            name: getProfileDisplayName(extractedName, profilesRes || []),
            sessionName: s.name,
            workingDir: s.workingDir,
            createdAt: s.created ? new Date(parseInt(s.created) * 1000).toISOString() : undefined,
            state: 'active',
            gitBranch: s.gitBranch,
            claudeState: s.claudeState,
            aiTool: s.aiTool,
            displayMode,
          }
        })
        // Sort to match sidebar tab order (terminals not in sidebar go to end)
        .sort((a: TerminalItem, b: TerminalItem) => {
          const orderA = sidebarOrder.get(a.id) ?? Infinity
          const orderB = sidebarOrder.get(b.id) ?? Infinity
          return orderA - orderB
        })
      setTerminals(mappedTerminals)

      // External sessions (non-ctt)
      const external: ExternalTmuxSession[] = sessions
        .filter((s: any) => !s.name.startsWith('ctt-'))
        .map((s: any) => ({
          name: s.name,
          windows: s.windows,
          workingDir: s.workingDir,
          gitBranch: s.gitBranch,
          aiTool: s.aiTool,
        }))
      setExternalSessions(external)

      setError(null)
    } catch (err) {
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  // Switch to terminal in sidebar
  const switchToTerminal = async (terminalId: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'SWITCH_TO_TERMINAL', terminalId })
    } catch (err) {
      console.error('Failed to switch to terminal:', err)
    }
  }

  // Orphan session handlers
  const handleReattachOrphan = async (sessionName: string) => {
    try {
      await reattachSessions([sessionName])
      await fetchData()
    } catch (err) {
      console.error('Failed to reattach session:', err)
    }
  }

  const handleKillOrphan = async (sessionName: string) => {
    try {
      await killSession(sessionName)
      setOrphanedSessions(prev => prev.filter(s => s.name !== sessionName))
    } catch (err) {
      console.error('Failed to kill orphan:', err)
    }
  }

  // External session handlers
  const handleKillExternal = async (sessionName: string) => {
    try {
      await killTmuxSession(sessionName)
      setExternalSessions(prev => prev.filter(s => s.name !== sessionName))
    } catch (err) {
      console.error('Failed to kill external session:', err)
    }
  }

  const handleViewAsText = async (sessionName: string) => {
    try {
      const response = await fetch(`http://localhost:8129/api/tmux/sessions/${sessionName}/capture`)
      const result = await response.json()
      if (!result.success) return
      const captureId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem(`tabz-capture-${captureId}`, JSON.stringify(result.data))
      window.location.search = `?capture=${captureId}`
    } catch (err) {
      console.error('Failed to view as text:', err)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const stats = [
    {
      label: 'Active Terminals',
      value: terminals.length,
      icon: Terminal,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
    },
    {
      label: 'Uptime',
      value: health ? formatUptime(health.uptime) : '-',
      icon: Clock,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-400/10',
    },
    {
      label: 'Memory',
      value: health ? `${health.memoryUsage.heapUsed}MB` : '-',
      icon: HardDrive,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      label: 'Orphaned',
      value: orphanedSessions.length,
      icon: Ghost,
      color: orphanedSessions.length ? 'text-amber-400' : 'text-muted-foreground',
      bgColor: orphanedSessions.length ? 'bg-amber-400/10' : 'bg-muted/50',
    },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <HomeIcon ref={iconRef} size={32} />
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            TabzChrome backend status and quick stats
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Active Terminals Preview */}
      <div className="rounded-xl bg-card border border-border p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            Active Terminals
          </h2>
          <a
            href="#terminals"
            onClick={(e) => {
              e.preventDefault()
              // Navigate to Terminals section via parent
              const terminalsBtn = document.querySelector('[data-section="terminals"]') as HTMLButtonElement
              terminalsBtn?.click()
            }}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
          </a>
        </div>

        <ActiveTerminalsList
          terminals={terminals}
          loading={loading}
          maxItems={5}
          onSwitchTo={switchToTerminal}
          emptyMessage="No active Tabz terminals"
        />
      </div>

      {/* Orphaned Sessions Alert */}
      {orphanedSessions.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-amber-400">Orphaned Sessions</span>
            <span className="text-sm text-amber-400/70">({orphanedSessions.length})</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            These terminals are detached from the sidebar. Reattach to restore or kill to clean up.
          </p>
          <div className="space-y-2">
            {orphanedSessions.slice(0, 5).map((session) => (
              <div
                key={session.name}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-card border border-border"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Ghost className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="font-mono text-sm truncate">{session.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleReattachOrphan(session.name)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-sm text-primary hover:bg-primary/20"
                    title="Reattach to sidebar"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reattach
                  </button>
                  <button
                    onClick={() => handleKillOrphan(session.name)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-sm text-destructive hover:bg-destructive/20"
                    title="Kill session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {orphanedSessions.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{orphanedSessions.length - 5} more orphaned sessions
              </p>
            )}
          </div>
        </div>
      )}

      {/* External Tmux Sessions */}
      {externalSessions.length > 0 && (
        <div className="rounded-xl bg-card border border-border p-4 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-5 h-5 text-blue-400" />
            <span className="font-semibold">External Tmux Sessions</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
              {externalSessions.length}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Non-Tabz tmux sessions on this system
          </p>
          <div className="space-y-2">
            {externalSessions.slice(0, 5).map((session) => (
              <div
                key={session.name}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0">
                    <div className="font-mono text-sm truncate">{session.name}</div>
                    {session.gitBranch && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="w-3 h-3" />
                        {session.gitBranch}
                      </div>
                    )}
                  </div>
                  {session.aiTool && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-black/40 text-orange-400 border border-orange-500/50 flex-shrink-0">
                      {session.aiTool}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-mono truncate hidden sm:block" title={session.workingDir}>
                    {compactPath(session.workingDir)}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleViewAsText(session.name)}
                    className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    title="View as text"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleKillExternal(session.name)}
                    className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    title="Kill session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {externalSessions.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{externalSessions.length - 5} more external sessions
              </p>
            )}
          </div>
        </div>
      )}

      {/* System Info Panel */}
      {health && (
        <div className="rounded-xl bg-card border border-border p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            System Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Backend URL" value="http://localhost:8129" mono />
            <InfoRow label="WebSocket URL" value="ws://localhost:8129" mono />
            <InfoRow label="Version" value={health.version} />
            <InfoRow label="Node.js" value={health.nodeVersion} />
            <InfoRow label="Platform" value={health.platform} />
            <InfoRow
              label="Memory (Heap)"
              value={`${health.memoryUsage.heapUsed} / ${health.memoryUsage.heapTotal} MB`}
            />
            <InfoRow
              label="Memory (RSS)"
              value={`${health.memoryUsage.rss} MB`}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-cyan-400' : ''}`}>{value}</span>
    </div>
  )
}
