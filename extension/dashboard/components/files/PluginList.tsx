import React, { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Plug, RefreshCw, Search, Zap, Bot, Terminal, FileCode } from 'lucide-react'
import { useFilesContext } from '../../contexts/FilesContext'

// Component type icons and colors
const componentConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  skill: { icon: Zap, color: 'text-teal-400 bg-teal-500/20', label: 'Skill' },
  agent: { icon: Bot, color: 'text-purple-400 bg-purple-500/20', label: 'Agent' },
  command: { icon: FileCode, color: 'text-sky-400 bg-sky-500/20', label: 'Cmd' },
  hook: { icon: Terminal, color: 'text-green-400 bg-green-500/20', label: 'Hook' },
  mcp: { icon: Plug, color: 'text-cyan-400 bg-cyan-500/20', label: 'MCP' },
}

interface ComponentFile {
  name: string
  path: string
}

interface Plugin {
  id: string
  name: string
  marketplace: string
  enabled: boolean
  scope: string
  version: string
  installPath: string
  installedAt: string
  isLocal: boolean
  components: string[]  // 'skill' | 'agent' | 'command' | 'hook' | 'mcp'
  componentFiles: {
    skills?: ComponentFile[]
    agents?: ComponentFile[]
    commands?: ComponentFile[]
    hooks?: ComponentFile[]
    mcp?: ComponentFile[]
  }
}

interface PluginsData {
  marketplaces: Record<string, Plugin[]>
  totalPlugins: number
  enabledCount: number
  disabledCount: number
  componentCounts: Record<string, number>
  scopeCounts: Record<string, number>
}

// Toggle switch component
function Toggle({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-green-500' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

// Get file count for a component type
function getComponentCount(plugin: Plugin, type: string): number {
  const files = plugin.componentFiles
  switch (type) {
    case 'skill': return files?.skills?.length || 0
    case 'agent': return files?.agents?.length || 0
    case 'command': return files?.commands?.length || 0
    case 'hook': return files?.hooks?.length || 0
    case 'mcp': return files?.mcp?.length || 0
    default: return 0
  }
}

// Get the first file path for a component type
function getFirstFilePath(plugin: Plugin, type: string): string | null {
  const files = plugin.componentFiles
  switch (type) {
    case 'skill': return files?.skills?.[0]?.path || null
    case 'agent': return files?.agents?.[0]?.path || null
    case 'command': return files?.commands?.[0]?.path || null
    case 'hook': return files?.hooks?.[0]?.path || null
    case 'mcp': return files?.mcp?.[0]?.path || null
    default: return null
  }
}

// Plugin row component
function PluginRow({
  plugin,
  onToggle,
  onOpenFile,
  isToggling
}: {
  plugin: Plugin
  onToggle: (enabled: boolean) => void
  onOpenFile: (path: string) => void
  isToggling: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  // Find the first available file to open
  const handleClick = () => {
    if (!plugin.componentFiles) return
    // Try each component type in order
    for (const type of ['skill', 'agent', 'command', 'hook', 'mcp']) {
      const path = getFirstFilePath(plugin, type)
      if (path) {
        onOpenFile(path)
        return
      }
    }
    // Fallback to plugin.json
    if (plugin.installPath) {
      onOpenFile(`${plugin.installPath}/plugin.json`)
    }
  }

  // Check if plugin has multiple files that can be expanded
  const totalFiles = (plugin.componentFiles?.skills?.length || 0) +
                     (plugin.componentFiles?.agents?.length || 0) +
                     (plugin.componentFiles?.commands?.length || 0)
  const hasMultipleFiles = totalFiles > 1

  return (
    <div>
      <div className="flex items-center justify-between py-2 px-3 hover:bg-muted/30 rounded group">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Expand button for multi-file plugins */}
          {hasMultipleFiles ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-4 h-4 flex-shrink-0 text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <Plug className={`w-4 h-4 flex-shrink-0 ${plugin.enabled ? 'text-green-400' : 'text-muted-foreground'}`} />
          )}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={handleClick}
            title={`View ${plugin.name} files`}
          >
            <div className="text-sm font-medium truncate hover:text-primary transition-colors">{plugin.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              {/* Component type badges with counts */}
              {plugin.components?.map(comp => {
                const config = componentConfig[comp]
                if (!config) return null
                const Icon = config.icon
                const count = getComponentCount(plugin, comp)
                return (
                  <button
                    key={comp}
                    onClick={(e) => {
                      e.stopPropagation()
                      const path = getFirstFilePath(plugin, comp)
                      if (path) onOpenFile(path)
                    }}
                    className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] hover:opacity-80 ${config.color}`}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {config.label}{count > 1 ? ` (${count})` : ''}
                  </button>
                )
              })}
              {/* Scope badge - only show if no components */}
              {(!plugin.components || plugin.components.length === 0) && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                  plugin.scope === 'local' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {plugin.scope}
                </span>
              )}
            </div>
          </div>
        </div>
        <Toggle
          checked={plugin.enabled}
          onChange={onToggle}
          disabled={isToggling}
        />
      </div>

      {/* Expanded file list */}
      {expanded && hasMultipleFiles && (
        <div className="ml-8 mb-2">
          {/* Skills */}
          {plugin.componentFiles?.skills?.map(file => (
            <button
              key={file.path}
              onClick={() => onOpenFile(file.path)}
              className="flex items-center gap-2 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded"
            >
              <Zap className="w-3 h-3 text-teal-400" />
              {file.name}
            </button>
          ))}
          {/* Agents */}
          {plugin.componentFiles?.agents?.map(file => (
            <button
              key={file.path}
              onClick={() => onOpenFile(file.path)}
              className="flex items-center gap-2 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded"
            >
              <Bot className="w-3 h-3 text-purple-400" />
              {file.name}
            </button>
          ))}
          {/* Commands */}
          {plugin.componentFiles?.commands?.map(file => (
            <button
              key={file.path}
              onClick={() => onOpenFile(file.path)}
              className="flex items-center gap-2 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded"
            >
              <FileCode className="w-3 h-3 text-sky-400" />
              {file.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Marketplace section component
function MarketplaceSection({
  name,
  plugins,
  onToggle,
  onOpenFile,
  togglingPlugins,
  startCollapsed = false
}: {
  name: string
  plugins: Plugin[]
  onToggle: (pluginId: string, enabled: boolean) => void
  onOpenFile: (path: string) => void
  togglingPlugins: Set<string>
  startCollapsed?: boolean
}) {
  const [isCollapsed, setIsCollapsed] = useState(startCollapsed)
  const enabledCount = plugins.filter(p => p.enabled).length

  return (
    <div className="mb-3">
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/30 rounded-md bg-muted/10"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="text-muted-foreground">
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
        <span className="text-sm font-medium flex-1">{name}</span>
        <span className="text-xs text-muted-foreground">
          {enabledCount}/{plugins.length}
        </span>
      </div>

      {/* Plugins list */}
      {!isCollapsed && (
        <div className="mt-1 ml-2">
          {plugins.map(plugin => (
            <PluginRow
              key={plugin.id}
              plugin={plugin}
              onToggle={(enabled) => onToggle(plugin.id, enabled)}
              onOpenFile={onOpenFile}
              isToggling={togglingPlugins.has(plugin.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Filter tabs
type PluginFilter = 'all' | 'enabled' | 'disabled'
type ComponentFilter = 'all' | 'skill' | 'agent' | 'command' | 'hook' | 'mcp'
type ScopeFilter = 'all' | 'user' | 'local'

export function PluginList() {
  const { pluginsData, pluginsLoading, loadPlugins, togglePlugin, openFile } = useFilesContext()
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<PluginFilter>('all')
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>('all')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showRestartHint, setShowRestartHint] = useState(false)

  // Load plugins on mount
  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    setTogglingPlugins(prev => new Set(prev).add(pluginId))
    const success = await togglePlugin(pluginId, enabled)
    setTogglingPlugins(prev => {
      const newSet = new Set(prev)
      newSet.delete(pluginId)
      return newSet
    })
    if (success) {
      setShowRestartHint(true)
    }
  }

  // Filter plugins
  const filteredMarketplaces = pluginsData?.marketplaces
    ? Object.entries(pluginsData.marketplaces).reduce((acc, [name, plugins]) => {
        let filtered = plugins

        // Apply enabled/disabled filter
        if (filter === 'enabled') {
          filtered = filtered.filter(p => p.enabled)
        } else if (filter === 'disabled') {
          filtered = filtered.filter(p => !p.enabled)
        }

        // Apply component type filter
        if (componentFilter !== 'all') {
          filtered = filtered.filter(p => p.components?.includes(componentFilter))
        }

        // Apply scope filter
        if (scopeFilter !== 'all') {
          filtered = filtered.filter(p => p.scope === scopeFilter)
        }

        // Apply search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.id.toLowerCase().includes(query)
          )
        }

        if (filtered.length > 0) {
          acc[name] = filtered
        }
        return acc
      }, {} as Record<string, Plugin[]>)
    : {}

  if (pluginsLoading) {
    return (
      <div className="flex flex-col h-full bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Plugins</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      </div>
    )
  }

  if (!pluginsData || pluginsData.totalPlugins === 0) {
    return (
      <div className="flex flex-col h-full bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm">Plugins</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
          <div>
            <p>No plugins installed</p>
            <p className="text-xs mt-1">Use /plugin add &lt;url&gt; to add a marketplace</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Plugins</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {pluginsData.enabledCount}/{pluginsData.totalPlugins} enabled
            </span>
            <button
              onClick={() => loadPlugins()}
              className="p-1 hover:bg-muted rounded"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
        {(['all', 'enabled', 'disabled'] as PluginFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              filter === f
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            {f === 'all' && `All (${pluginsData.totalPlugins})`}
            {f === 'enabled' && `Enabled (${pluginsData.enabledCount})`}
            {f === 'disabled' && `Disabled (${pluginsData.disabledCount})`}
          </button>
        ))}
      </div>

      {/* Component type and scope filters */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border overflow-x-auto">
        {/* Component filters */}
        <button
          onClick={() => setComponentFilter('all')}
          className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap ${
            componentFilter === 'all'
              ? 'bg-primary/20 text-primary'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          All Types
        </button>
        {(['skill', 'agent', 'command', 'hook', 'mcp'] as ComponentFilter[]).map(comp => {
          const config = componentConfig[comp]
          const Icon = config.icon
          const count = pluginsData.componentCounts?.[comp] || 0
          if (count === 0) return null
          return (
            <button
              key={comp}
              onClick={() => setComponentFilter(comp)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap ${
                componentFilter === comp
                  ? config.color
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="w-3 h-3" />
              {config.label} ({count})
            </button>
          )
        })}

        {/* Divider */}
        <span className="text-muted-foreground/30 mx-1">|</span>

        {/* Scope filters */}
        {(['user', 'local'] as ScopeFilter[]).map(scope => {
          const count = pluginsData.scopeCounts?.[scope] || 0
          if (count === 0) return null
          return (
            <button
              key={scope}
              onClick={() => setScopeFilter(scopeFilter === scope ? 'all' : scope)}
              className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap ${
                scopeFilter === scope
                  ? scope === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {scope === 'user' ? 'Global' : 'Local'} ({count})
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        )}
      </div>

      {/* Restart hint */}
      {showRestartHint && (
        <div className="mx-3 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400 flex items-center justify-between">
          <span>Run <code className="bg-black/20 px-1 rounded">/restart</code> to apply changes</span>
          <button
            onClick={() => setShowRestartHint(false)}
            className="text-amber-400 hover:text-amber-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Plugin list */}
      <div className="flex-1 overflow-auto p-2">
        {Object.keys(filteredMarketplaces).length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No plugins match filter
          </div>
        ) : (
          Object.entries(filteredMarketplaces).map(([name, plugins]) => (
            <MarketplaceSection
              key={name}
              name={name}
              plugins={plugins}
              onToggle={handleToggle}
              onOpenFile={(path) => openFile(path, true)}
              togglingPlugins={togglingPlugins}
            />
          ))
        )}
      </div>
    </div>
  )
}
