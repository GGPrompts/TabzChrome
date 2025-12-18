import React, { useEffect, useState } from 'react'
import { Activity, Terminal, Clock, HardDrive, Ghost, RefreshCw } from 'lucide-react'
import { spawnTerminal, getHealth, getOrphanedSessions } from '../hooks/useDashboard'

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
}

interface OrphanedData {
  count: number
}

export default function HomeSection() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [orphaned, setOrphaned] = useState<OrphanedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [healthRes, orphanedRes] = await Promise.all([
        getHealth(),
        getOrphanedSessions(),
      ])

      setHealth(healthRes.data)
      setOrphaned({ count: orphanedRes.data?.count || 0 })
      setError(null)
    } catch (err) {
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
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

  const handleSpawn = async (command: string) => {
    try {
      await spawnTerminal({ name: command, command })
    } catch (err) {
      console.error('Spawn error:', err)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold terminal-glow">Dashboard</h1>
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

      {/* Quick Actions */}
      <div className="rounded-xl bg-card border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <QuickActionButton
            label="New Bash Terminal"
            onClick={() => handleSpawn('bash')}
          />
          <QuickActionButton
            label="Claude Code"
            onClick={() => handleSpawn('claude')}
          />
          <QuickActionButton
            label="LazyGit"
            onClick={() => handleSpawn('lazygit')}
          />
        </div>
      </div>

      {/* Version Info */}
      {health && (
        <div className="mt-6 text-sm text-muted-foreground">
          TabzChrome Backend v{health.version}
        </div>
      )}
    </div>
  )
}

function QuickActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors font-medium"
    >
      {label}
    </button>
  )
}
