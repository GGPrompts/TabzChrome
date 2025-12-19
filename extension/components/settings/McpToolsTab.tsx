import React, { useState, useEffect } from 'react'
import { Settings, Microscope } from 'lucide-react'
import { MCP_TOOLS, PRESETS } from './types'
import { sendMessage } from '../../shared/messaging'

const API_BASE = 'http://localhost:8129'

interface McpToolsTabProps {
  mcpEnabledTools: string[]
  setMcpEnabledTools: (tools: string[]) => void
  mcpConfigChanged: boolean
  setMcpConfigChanged: (changed: boolean) => void
  mcpConfigSaved: boolean
  setMcpConfigSaved: (saved: boolean) => void
  mcpLoading: boolean
  allowAllUrls: boolean
  setAllowAllUrls: (allow: boolean) => void
  customDomains: string
  setCustomDomains: (domains: string) => void
  onSave: () => void
}

export function McpToolsTab({
  mcpEnabledTools,
  setMcpEnabledTools,
  mcpConfigChanged,
  setMcpConfigChanged,
  mcpConfigSaved,
  mcpLoading,
  allowAllUrls,
  setAllowAllUrls,
  customDomains,
  setCustomDomains,
}: McpToolsTabProps) {
  const [urlSettingsExpanded, setUrlSettingsExpanded] = useState(false)
  const [inspectorCommand, setInspectorCommand] = useState<string>('')

  // Fetch inspector command on mount
  useEffect(() => {
    const fetchInspectorCommand = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/mcp/inspector-command`)
        if (res.ok) {
          const data = await res.json()
          setInspectorCommand(data.data?.command || '')
        }
      } catch (err) {
        console.error('Failed to fetch inspector command:', err)
      }
    }
    fetchInspectorCommand()
  }, [])

  const handleMcpToolToggle = (toolId: string) => {
    // Core tools are always required
    const tool = MCP_TOOLS.find(t => t.id === toolId)
    if (tool?.locked) return

    setMcpEnabledTools(
      mcpEnabledTools.includes(toolId)
        ? mcpEnabledTools.filter(t => t !== toolId)
        : [...mcpEnabledTools, toolId]
    )
    setMcpConfigChanged(true)
  }

  const handleMcpPreset = (preset: keyof typeof PRESETS) => {
    setMcpEnabledTools(PRESETS[preset])
    setMcpConfigChanged(true)
  }

  // Calculate token estimate from individual tools
  const estimatedTokens = mcpEnabledTools.reduce((sum, toolId) => {
    const tool = MCP_TOOLS.find(t => t.id === toolId)
    return sum + (tool?.tokens || 0)
  }, 0)

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-gray-400">
          Control which MCP tools are available to Claude Code.
          Fewer tools = less context usage = faster responses.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          <a
            href="https://gist.github.com/GGPrompts/50e82596b345557656df2fc8d2d54e2c"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00c8ff] hover:underline"
          >Save ~80% tokens with mcp-cli mode</a>
        </p>
      </div>

      {/* MCP Inspector */}
      <div className="mb-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Microscope className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-cyan-200">MCP Inspector</span>
          </div>
          <button
            onClick={() => {
              if (inspectorCommand) {
                sendMessage({
                  type: 'SPAWN_TERMINAL',
                  name: 'MCP Inspector',
                  command: inspectorCommand,
                })
              }
            }}
            disabled={!inspectorCommand}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Microscope className="w-3 h-3" />
            Launch
          </button>
        </div>
        <p className="text-xs text-cyan-200/60 mt-1">
          Test tools at localhost:6274 (installs on first use)
        </p>
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-500">Quick presets:</span>
        <button
          onClick={() => handleMcpPreset('minimal')}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Minimal
        </button>
        <button
          onClick={() => handleMcpPreset('standard')}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Standard
        </button>
        <button
          onClick={() => handleMcpPreset('full')}
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Full
        </button>
      </div>

      {/* Individual Tools */}
      {mcpLoading ? (
        <div className="text-center py-8 text-gray-500">
          Loading MCP configuration...
        </div>
      ) : (
        <div className="space-y-2">
          {/* Core tools (always enabled) */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Core Tools</span>
              <span className="text-xs text-gray-400">(always enabled)</span>
            </div>
            <div className="space-y-1">
              {MCP_TOOLS.filter(t => t.locked).map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-black/20 border border-gray-800/50 opacity-70"
                >
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="w-4 h-4 rounded border-gray-600 bg-black/50 text-[#00ff88] cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{tool.name}</span>
                    <span className="text-xs text-gray-400 truncate">{tool.desc}</span>
                    <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                      {tool.tokens.toLocaleString()} tok
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Optional tools */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Optional Tools</span>
            </div>
            <div className="space-y-1">
              {MCP_TOOLS.filter(t => !t.locked).map((tool) => {
                const isEnabled = mcpEnabledTools.includes(tool.id)
                const isOpenUrl = tool.id === 'tabz_open_url'

                return (
                  <div key={tool.id}>
                    <div
                      className={`
                        flex items-center gap-3 p-2 rounded-lg border transition-all
                        ${isEnabled
                          ? 'bg-[#00ff88]/5 border-[#00ff88]/30'
                          : 'bg-black/30 border-gray-800 hover:border-gray-700'
                        }
                        ${isOpenUrl && urlSettingsExpanded ? 'rounded-b-none' : ''}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleMcpToolToggle(tool.id)}
                        className="w-4 h-4 rounded border-gray-600 bg-black/50 text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
                      />
                      <label
                        onClick={() => handleMcpToolToggle(tool.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
                      >
                        <span className="font-medium text-white text-sm">{tool.name}</span>
                        <span className="text-xs text-gray-400 truncate">{tool.desc}</span>
                      </label>
                      {isOpenUrl && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setUrlSettingsExpanded(!urlSettingsExpanded)
                          }}
                          className={`
                            p-1 rounded transition-colors flex-shrink-0
                            ${urlSettingsExpanded
                              ? 'bg-[#00ff88]/20 text-[#00ff88]'
                              : 'hover:bg-white/10 text-gray-400 hover:text-white'
                            }
                          `}
                          title="Configure allowed URLs"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      )}
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {tool.tokens.toLocaleString()} tok
                      </span>
                    </div>

                    {/* URL Settings Panel */}
                    {isOpenUrl && urlSettingsExpanded && (
                      <div className="border border-t-0 border-[#00ff88]/30 rounded-b-lg bg-black/40 p-3 space-y-3">
                        {/* YOLO Mode */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowAllUrls}
                            onChange={(e) => {
                              setAllowAllUrls(e.target.checked)
                              setMcpConfigChanged(true)
                            }}
                            className="w-4 h-4 rounded border-gray-600 bg-black/50 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0"
                          />
                          <div>
                            <span className="text-sm text-white font-medium">Allow all URLs</span>
                            <span className="text-xs text-yellow-500 ml-2">(YOLO mode)</span>
                          </div>
                        </label>
                        {allowAllUrls && (
                          <div className="text-xs text-yellow-500/80 pl-7 space-y-1">
                            <p>Claude can open and interact with any website.</p>
                            <p className="text-yellow-600">Recommended: Use a separate Chrome profile without sensitive logins (banking, email, etc.)</p>
                          </div>
                        )}

                        {/* Custom Domains */}
                        <div className={allowAllUrls ? 'opacity-50 pointer-events-none' : ''}>
                          <label className="block text-xs text-gray-400 mb-1">
                            Custom allowed domains (one per line)
                          </label>
                          <textarea
                            value={customDomains}
                            onChange={(e) => {
                              setCustomDomains(e.target.value)
                              setMcpConfigChanged(true)
                            }}
                            placeholder="example.com&#10;*.mycompany.com&#10;internal.dev:8080"
                            rows={3}
                            className="w-full px-2 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs font-mono focus:border-[#00ff88] focus:outline-none resize-none"
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            Added to built-in domains (GitHub, localhost, Vercel, etc.)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Token Estimate & Restart Notice */}
      <div className="mt-6 pt-4 border-t border-gray-800 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Estimated context usage:</span>
          <span className="font-mono text-[#00ff88]">~{estimatedTokens.toLocaleString()} tokens</span>
        </div>

        {mcpConfigSaved ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <span className="text-green-400 flex-shrink-0">✓</span>
            <span className="text-xs text-green-200">
              Saved! Restart Claude Code to apply changes
            </span>
          </div>
        ) : mcpConfigChanged ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <span className="text-blue-400 flex-shrink-0">●</span>
            <span className="text-xs text-blue-200">
              Unsaved changes
            </span>
          </div>
        ) : null}
      </div>
    </>
  )
}
