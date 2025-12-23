import React, { useEffect, useState } from 'react'
import { Terminal, Clock, HardDrive, Ghost, RefreshCw, Server, ChevronRight, Home } from 'lucide-react'
import { getHealth, getOrphanedSessions, getTerminals, getAllTmuxSessions } from '../hooks/useDashboard'
import { ActiveTerminalsList, type TerminalItem } from '../components/ActiveTerminalsList'

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

interface OrphanedData {
  count: number
}

export default function HomeSection() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [orphaned, setOrphaned] = useState<OrphanedData | null>(null)
  const [terminals, setTerminals] = useState<TerminalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [healthRes, orphanedRes, tmuxRes] = await Promise.all([
        getHealth(),
        getOrphanedSessions(),
        getAllTmuxSessions(),
      ])

      setHealth(healthRes.data)
      setOrphaned({ count: orphanedRes.data?.count || 0 })

      // Map tmux sessions to TerminalItem format, filtering to ctt- sessions
      const sessions = tmuxRes.data?.sessions || []
      const mappedTerminals: TerminalItem[] = sessions
        .filter((s: any) => s.name.startsWith('ctt-'))
        .map((s: any) => ({
          id: s.name,
          name: s.name.replace(/^ctt-/, '').replace(/-[a-f0-9]+$/, ''), // Extract profile name
          sessionName: s.name,
          workingDir: s.workingDir,
          createdAt: s.created ? new Date(parseInt(s.created) * 1000).toISOString() : undefined,
          state: 'active',
          gitBranch: s.gitBranch,
          claudeState: s.claudeState,
          aiTool: s.aiTool,
        }))
      setTerminals(mappedTerminals)
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
      value: health?.activeTerminals ?? '-',
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
      value: orphaned?.count ?? '-',
      icon: Ghost,
      color: orphaned?.count ? 'text-amber-400' : 'text-muted-foreground',
      bgColor: orphaned?.count ? 'bg-amber-400/10' : 'bg-muted/50',
    },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <Home className="w-8 h-8" />
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
