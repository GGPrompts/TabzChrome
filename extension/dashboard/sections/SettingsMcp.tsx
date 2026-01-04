import React, { useEffect, useState, useRef } from 'react'
import { Search, RefreshCw, ChevronDown, ChevronRight, ExternalLink, CheckCircle, Circle, Settings, Zap, Terminal, Microscope } from 'lucide-react'
import { SettingsIcon, type AnimatedIconHandle } from '../../components/icons'
import { spawnTerminal } from '../hooks/useDashboard'
import { MCP_TOOLS, CORE_TOOL_IDS, ALL_TOOL_IDS, type McpTool } from '../../shared/mcpTools'

const PRESETS = {
  minimal: CORE_TOOL_IDS,
  standard: [...CORE_TOOL_IDS, 'tabz_click', 'tabz_fill', 'tabz_screenshot', 'tabz_screenshot_full', 'tabz_open_url', 'tabz_get_console_logs', 'tabz_enable_network_capture', 'tabz_get_network_requests'],
  full: ALL_TOOL_IDS,
}

const API_BASE = 'http://localhost:8129'

export default function McpPlayground() {
  const [enabledTools, setEnabledTools] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [changed, setChanged] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Core', 'Interaction', 'Screenshot']))
  const [allowAllUrls, setAllowAllUrls] = useState(false)
  const [customDomains, setCustomDomains] = useState('')
  const [inspectorCommand, setInspectorCommand] = useState<string>('')
  const [inspectorUrl, setInspectorUrl] = useState<string>('http://localhost:6274')

  // Animated icon ref - play animation on mount
  const iconRef = useRef<AnimatedIconHandle>(null)
  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Fetch config and inspector command on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [configRes, inspectorRes] = await Promise.all([
          fetch(`${API_BASE}/api/mcp-config`),
          fetch(`${API_BASE}/api/mcp/inspector-command`),
        ])

        if (configRes.ok) {
          const data = await configRes.json()
          setEnabledTools(data.enabledTools || PRESETS.standard)
          setAllowAllUrls(data.allowAllUrls || false)
          setCustomDomains(data.customDomains || '')
        }

        if (inspectorRes.ok) {
          const inspectorData = await inspectorRes.json()
          setInspectorCommand(inspectorData.data?.command || '')
          setInspectorUrl(inspectorData.data?.inspectorUrl || 'http://localhost:6274')
        }
      } catch (err) {
        console.error('Failed to fetch MCP config:', err)
        setEnabledTools(PRESETS.standard)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  // Save config
  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/mcp-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledTools, allowAllUrls, customDomains }),
      })
      if (res.ok) {
        setSaved(true)
        setChanged(false)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.error('Failed to save MCP config:', err)
    } finally {
      setSaving(false)
    }
  }

  const toggleTool = (toolId: string) => {
    const tool = MCP_TOOLS.find(t => t.id === toolId)
    if (tool?.locked) return

    setEnabledTools(prev =>
      prev.includes(toolId)
        ? prev.filter(t => t !== toolId)
        : [...prev, toolId]
    )
    setChanged(true)
    setSaved(false)
  }

  const applyPreset = (preset: keyof typeof PRESETS) => {
    setEnabledTools(PRESETS[preset])
    setChanged(true)
    setSaved(false)
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(category)) {
        newSet.delete(category)
      } else {
        newSet.add(category)
      }
      return newSet
    })
  }

  // Group tools by category
  const categories = Array.from(new Set(MCP_TOOLS.map(t => t.category || 'Other')))
  const toolsByCategory = categories.reduce((acc, cat) => {
    acc[cat] = MCP_TOOLS.filter(t => (t.category || 'Other') === cat)
    return acc
  }, {} as Record<string, McpTool[]>)

  // Filter by search
  const filteredTools = searchQuery
    ? MCP_TOOLS.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null

  // Calculate token estimate
  const estimatedTokens = enabledTools.reduce((sum, toolId) => {
    const tool = MCP_TOOLS.find(t => t.id === toolId)
    return sum + (tool?.tokens || 0)
  }, 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <SettingsIcon ref={iconRef} size={32} />
            MCP Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure which browser automation tools are available to Claude Code
          </p>
        </div>
        <div className="flex items-center gap-3">
          {changed && (
            <span className="text-sm text-amber-400">Unsaved changes</span>
          )}
          {saved && (
            <span className="text-sm text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Saved
            </span>
          )}
          <button
            onClick={saveConfig}
            disabled={saving || !changed}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Save Config
          </button>
        </div>
      </div>

      {/* MCP Inspector */}
      <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 mb-6">
        <div className="flex items-start gap-3">
          <Microscope className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-cyan-200 mb-1">MCP Inspector</h3>
            <p className="text-sm text-cyan-200/80 mb-3">
              Test and debug Tabz MCP tools interactively. Installs on first use.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  if (inspectorCommand) {
                    await spawnTerminal({
                      name: 'MCP Inspector',
                      command: inspectorCommand,
                    })
                  }
                }}
                disabled={!inspectorCommand}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Terminal className="w-4 h-4" />
                Start Server
              </button>
              <button
                onClick={() => chrome.tabs.create({ url: inspectorUrl })}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                title="Open inspector in this Chrome browser"
              >
                <Microscope className="w-4 h-4" />
                Open Inspector
              </button>
            </div>
            <p className="text-xs text-cyan-200/50 mt-2">
              Start server first, then click Open Inspector. URL: {inspectorUrl}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="text-2xl font-bold text-emerald-400">{enabledTools.length}</div>
          <div className="text-sm text-muted-foreground">Tools Enabled</div>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="text-2xl font-bold text-cyan-400">~{estimatedTokens.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Context Tokens</div>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="text-2xl font-bold text-purple-400">{MCP_TOOLS.length}</div>
          <div className="text-sm text-muted-foreground">Total Tools</div>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="text-2xl font-bold text-amber-400">{CORE_TOOL_IDS.length}</div>
          <div className="text-sm text-muted-foreground">Core (Always On)</div>
        </div>
      </div>

      {/* Presets and Search */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Presets:</span>
          <button
            onClick={() => applyPreset('minimal')}
            className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            Minimal
          </button>
          <button
            onClick={() => applyPreset('standard')}
            className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            Standard
          </button>
          <button
            onClick={() => applyPreset('full')}
            className="px-3 py-1.5 text-sm rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            Full
          </button>
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-border focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Experimental MCP CLI Mode */}
      <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30 mb-6">
        <div className="flex items-start gap-3">
          <Zap className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-purple-200 mb-1">Experimental: MCP CLI Mode</h3>
            <p className="text-sm text-purple-200/80 mb-3">
              Load MCP tools on-demand instead of upfront. Requires Claude Code restart after enabling.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  await spawnTerminal({
                    name: 'Enable MCP CLI',
                    command: `grep -q 'ENABLE_EXPERIMENTAL_MCP_CLI' ~/.bashrc 2>/dev/null || echo 'export ENABLE_EXPERIMENTAL_MCP_CLI=true' >> ~/.bashrc; echo "✓ MCP CLI mode enabled. Restart Claude Code to apply."`,
                  })
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                <Terminal className="w-4 h-4" />
                Enable
              </button>
              <button
                onClick={async () => {
                  await spawnTerminal({
                    name: 'Disable MCP CLI',
                    command: `sed -i '/ENABLE_EXPERIMENTAL_MCP_CLI/d' ~/.bashrc 2>/dev/null; echo "✓ MCP CLI mode disabled. Restart Claude Code to apply."`,
                  })
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                <Terminal className="w-4 h-4" />
                Disable
              </button>
              <a
                href="https://gist.github.com/GGPrompts/50e82596b345557656df2fc8d2d54e2c"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1"
              >
                Details <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading MCP configuration...
        </div>
      ) : filteredTools ? (
        // Search results
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Search Results ({filteredTools.length})</h2>
          </div>
          <div className="p-2">
            {filteredTools.map(tool => (
              <ToolRow
                key={tool.id}
                tool={tool}
                enabled={enabledTools.includes(tool.id)}
                onToggle={() => toggleTool(tool.id)}
              />
            ))}
            {filteredTools.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No tools found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      ) : (
        // Category view
        <div className="space-y-4">
          {categories.map(category => (
            <div key={category} className="rounded-xl bg-card border border-border overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedCategories.has(category) ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                  <h2 className="font-semibold">{category}</h2>
                  <span className="text-sm text-muted-foreground">
                    ({toolsByCategory[category].filter(t => enabledTools.includes(t.id)).length}/{toolsByCategory[category].length})
                  </span>
                </div>
                {category === 'Core' && (
                  <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded">Always enabled</span>
                )}
              </button>
              {expandedCategories.has(category) && (
                <div className="p-2 pt-0 space-y-1">
                  {toolsByCategory[category].map(tool => (
                    <ToolRow
                      key={tool.id}
                      tool={tool}
                      enabled={enabledTools.includes(tool.id)}
                      onToggle={() => toggleTool(tool.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* URL Settings */}
      {enabledTools.includes('tabz_open_url') && (
        <div className="mt-6 rounded-xl bg-card border border-border p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            URL Settings (tabz_open_url)
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAllUrls}
                onChange={(e) => {
                  setAllowAllUrls(e.target.checked)
                  setChanged(true)
                }}
                className="w-4 h-4 rounded border-border bg-background"
              />
              <div>
                <span className="font-medium">Allow all URLs</span>
                <span className="text-xs text-amber-400 ml-2">(YOLO mode)</span>
              </div>
            </label>
            {allowAllUrls && (
              <p className="text-xs text-amber-400/80 ml-7">
                Claude can open and interact with any website. Use a separate Chrome profile without sensitive logins.
              </p>
            )}
            {!allowAllUrls && (
              <div className="ml-7">
                <label className="block text-sm text-muted-foreground mb-2">
                  Custom allowed domains (one per line)
                </label>
                <textarea
                  value={customDomains}
                  onChange={(e) => {
                    setCustomDomains(e.target.value)
                    setChanged(true)
                  }}
                  placeholder="example.com&#10;*.mycompany.com&#10;internal.dev:8080"
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg font-mono text-sm focus:border-primary focus:outline-none resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Added to built-in domains (GitHub, localhost, Vercel, etc.)
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Restart Notice */}
      {saved && (
        <div className="mt-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-sm text-emerald-200 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Configuration saved! Restart Claude Code to apply changes.
          </p>
        </div>
      )}
    </div>
  )
}

function ToolRow({ tool, enabled, onToggle }: { tool: McpTool; enabled: boolean; onToggle: () => void }) {
  const isLocked = tool.locked

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer
        ${isLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/50'}
        ${enabled ? 'bg-primary/5 border border-primary/20' : 'border border-transparent'}
      `}
      onClick={isLocked ? undefined : onToggle}
    >
      <div className="flex-shrink-0">
        {enabled ? (
          <CheckCircle className={`w-5 h-5 ${isLocked ? 'text-muted-foreground' : 'text-emerald-400'}`} />
        ) : (
          <Circle className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{tool.name}</span>
          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{tool.id}</code>
        </div>
        <p className="text-sm text-muted-foreground truncate">{tool.desc}</p>
      </div>
      <div className="flex-shrink-0 text-xs text-muted-foreground">
        {tool.tokens.toLocaleString()} tokens
      </div>
    </div>
  )
}
