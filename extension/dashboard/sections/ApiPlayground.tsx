import React, { useState, useEffect, useCallback } from 'react'
import { Send, Copy, Check, Clock, ChevronDown, ChevronRight, Plus, Trash2, Code2, Key } from 'lucide-react'

const API_BASE = 'http://localhost:8129'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
}

interface ResponseData {
  status: number
  statusText: string
  time: number
  body: string
}

type HealthStatus = 'healthy' | 'unhealthy' | 'neutral' | 'checking'

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  POST: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  PUT: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  DELETE: 'text-red-400 bg-red-400/10 border-red-400/30',
}

interface Preset {
  method: HttpMethod
  url: string
  name: string
  body?: object
}

interface PresetCategory {
  name: string
  presets: Preset[]
}

// TabzChrome API endpoints organized by category
const PRESET_CATEGORIES: PresetCategory[] = [
  {
    name: 'Health & System',
    presets: [
      { method: 'GET', url: '/api/health', name: 'Health Check' },
      { method: 'GET', url: '/api/terminal-types', name: 'Terminal Types' },
      { method: 'GET', url: '/api/spawn-stats', name: 'Spawn Statistics' },
      { method: 'GET', url: '/api/auth-token', name: 'Get Auth Token' },
      { method: 'GET', url: '/api/mcp/inspector-command', name: 'MCP Inspector Command' },
    ],
  },
  {
    name: 'Agents/Terminals',
    presets: [
      { method: 'GET', url: '/api/agents', name: 'List All Agents' },
      { method: 'GET', url: '/api/agents/:id', name: 'Get Agent by ID' },
      { method: 'POST', url: '/api/spawn', name: 'Spawn Terminal', body: { name: 'Test Terminal', command: 'bash', workingDir: '~' } },
      { method: 'POST', url: '/api/agents/:id/command', name: 'Send Command', body: { command: 'echo hello' } },
      { method: 'POST', url: '/api/agents/:id/resize', name: 'Resize Terminal', body: { cols: 120, rows: 30 } },
      { method: 'POST', url: '/api/agents/:id/detach', name: 'Detach Agent' },
      { method: 'DELETE', url: '/api/agents/:id', name: 'Close Agent' },
    ],
  },
  {
    name: 'Tmux Sessions',
    presets: [
      { method: 'GET', url: '/api/tmux/sessions', name: 'List Sessions (Simple)' },
      { method: 'GET', url: '/api/tmux/sessions/detailed', name: 'List Sessions (Detailed)' },
      { method: 'GET', url: '/api/tmux/sessions/:name', name: 'Get Session Info' },
      { method: 'GET', url: '/api/tmux/sessions/:name/preview', name: 'Capture Pane Preview' },
      { method: 'GET', url: '/api/tmux/sessions/:name/capture', name: 'Capture Full Content' },
      { method: 'GET', url: '/api/tmux/sessions/:name/statusline', name: 'Claude Statusline' },
      { method: 'GET', url: '/api/tmux/sessions/:name/windows', name: 'List Windows' },
      { method: 'GET', url: '/api/tmux/info/:name', name: 'Tmux Info' },
      { method: 'POST', url: '/api/tmux/sessions/:name/command', name: 'Execute Tmux Command', body: { command: 'list-panes' } },
      { method: 'POST', url: '/api/tmux/refresh/:name', name: 'Refresh Session' },
      { method: 'POST', url: '/api/tmux/detach/:name', name: 'Detach Session' },
      { method: 'DELETE', url: '/api/tmux/sessions/:name', name: 'Kill Session' },
      { method: 'DELETE', url: '/api/tmux/sessions/bulk', name: 'Kill Multiple Sessions', body: { names: ['session1', 'session2'] } },
    ],
  },
  {
    name: 'Orphaned Sessions',
    presets: [
      { method: 'GET', url: '/api/tmux/orphaned-sessions', name: 'List Orphaned' },
      { method: 'POST', url: '/api/tmux/reattach', name: 'Reattach Sessions', body: { sessions: [] } },
      { method: 'POST', url: '/api/tmux/cleanup', name: 'Cleanup by Pattern', body: { pattern: 'ctt-*' } },
    ],
  },
  {
    name: 'Claude Integration',
    presets: [
      { method: 'GET', url: '/api/claude-status', name: 'Claude Status' },
      { method: 'POST', url: '/api/claude-status/cleanup', name: 'Cleanup Stale State' },
      { method: 'GET', url: '/api/plugins', name: 'List Plugins' },
      { method: 'POST', url: '/api/plugins/toggle', name: 'Toggle Plugin', body: { pluginName: 'example', enabled: true } },
    ],
  },
  {
    name: 'Configuration',
    presets: [
      { method: 'GET', url: '/api/browser/profiles', name: 'Get Profiles' },
      { method: 'GET', url: '/api/mcp-config', name: 'Get MCP Config' },
      { method: 'POST', url: '/api/mcp-config', name: 'Save MCP Config', body: { tools: {} } },
      { method: 'GET', url: '/api/settings/working-dir', name: 'Get Working Dir Settings' },
      { method: 'POST', url: '/api/settings/working-dir', name: 'Save Working Dir Settings', body: { defaultDir: '~' } },
    ],
  },
  {
    name: 'Files',
    presets: [
      { method: 'GET', url: '/api/files/tree', name: 'File Tree' },
      { method: 'GET', url: '/api/files/list', name: 'List Files' },
      { method: 'GET', url: '/api/files/read?path=README.md', name: 'Read File' },
      { method: 'GET', url: '/api/files/content?path=README.md', name: 'Get File Content' },
      { method: 'GET', url: '/api/files/list-markdown', name: 'List Markdown Files' },
      { method: 'GET', url: '/api/files/project-files', name: 'Project Files' },
      { method: 'POST', url: '/api/files/write', name: 'Write File', body: { path: 'test.txt', content: 'Hello World' } },
    ],
  },
  {
    name: 'Git',
    presets: [
      { method: 'GET', url: '/api/git/repos', name: 'List Repositories' },
      { method: 'GET', url: '/api/git/repos/:repo/status', name: 'Repo Status' },
      { method: 'GET', url: '/api/git/repos/:repo/log', name: 'Commit Log' },
      { method: 'POST', url: '/api/git/repos/:repo/stage', name: 'Stage Files', body: { files: ['.'] } },
      { method: 'POST', url: '/api/git/repos/:repo/unstage', name: 'Unstage Files', body: { files: ['.'] } },
      { method: 'POST', url: '/api/git/repos/:repo/commit', name: 'Create Commit', body: { message: 'commit message' } },
      { method: 'POST', url: '/api/git/repos/:repo/fetch', name: 'Fetch Remote' },
      { method: 'POST', url: '/api/git/repos/:repo/pull', name: 'Pull Changes' },
      { method: 'POST', url: '/api/git/repos/:repo/push', name: 'Push Changes' },
      { method: 'POST', url: '/api/git/repos/:repo/generate-message', name: 'Generate Commit Message' },
    ],
  },
  {
    name: 'AI & Utility',
    presets: [
      { method: 'POST', url: '/api/ai/explain-script', name: 'Explain Script', body: { script: 'echo "hello"' } },
      { method: 'POST', url: '/api/console-log', name: 'Send Console Log', body: { level: 'info', message: 'test' } },
    ],
  },
]

// Flatten for health checks (GET endpoints only)
const ALL_PRESETS = PRESET_CATEGORIES.flatMap((cat) => cat.presets)

export default function ApiPlayground() {
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [url, setUrl] = useState('/api/health')
  const [headers, setHeaders] = useState<KeyValue[]>([
    { id: '1', key: 'Content-Type', value: 'application/json', enabled: true },
  ])
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)
  const [showAuth, setShowAuth] = useState(true)
  const [showPresets, setShowPresets] = useState(true)
  const [healthStatus, setHealthStatus] = useState<Record<string, HealthStatus>>({})

  const checkHealth = useCallback(async () => {
    const newStatus: Record<string, HealthStatus> = {}

    // Set all GET endpoints (without params) to 'checking', others to 'neutral'
    ALL_PRESETS.forEach((preset) => {
      // Only check GET endpoints that don't have path params or query params
      const hasParams = preset.url.includes(':') || preset.url.includes('?')
      if (preset.method === 'GET' && !hasParams) {
        newStatus[preset.url] = 'checking'
      } else {
        newStatus[preset.url] = 'neutral'
      }
    })
    setHealthStatus(newStatus)

    // Check GET endpoints in parallel (only those without params)
    const getPresets = ALL_PRESETS.filter((p) => {
      const hasParams = p.url.includes(':') || p.url.includes('?')
      return p.method === 'GET' && !hasParams
    })
    const results = await Promise.allSettled(
      getPresets.map(async (preset) => {
        const res = await fetch(`${API_BASE}${preset.url}`, { method: 'GET' })
        return { url: preset.url, ok: res.ok }
      })
    )

    const finalStatus = { ...newStatus }
    results.forEach((result, i) => {
      const url = getPresets[i].url
      if (result.status === 'fulfilled') {
        finalStatus[url] = result.value.ok ? 'healthy' : 'unhealthy'
      } else {
        finalStatus[url] = 'unhealthy'
      }
    })
    setHealthStatus(finalStatus)
  }, [])

  // Check health on mount and every minute
  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 60000)
    return () => clearInterval(interval)
  }, [checkHealth])

  const sendRequest = async () => {
    try {
      setLoading(true)
      const startTime = performance.now()

      const requestHeaders: Record<string, string> = {}
      headers.filter((h) => h.enabled && h.key).forEach((h) => {
        requestHeaders[h.key] = h.value
      })

      const options: RequestInit = {
        method,
        headers: requestHeaders,
      }

      if (method !== 'GET' && body) {
        options.body = body
      }

      // Prepend API_BASE for relative URLs
      const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`
      const res = await fetch(fullUrl, options)
      const endTime = performance.now()

      let responseBody: string
      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const json = await res.json()
        responseBody = JSON.stringify(json, null, 2)
      } else {
        responseBody = await res.text()
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        time: Math.round(endTime - startTime),
        body: responseBody,
      })
    } catch (err) {
      setResponse({
        status: 0,
        statusText: 'Error',
        time: 0,
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const copyResponse = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/token`)
      const data = await res.json()
      if (data.token) {
        await navigator.clipboard.writeText(data.token)
        setTokenCopied(true)
        setTimeout(() => setTokenCopied(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy token:', err)
    }
  }

  const copyCommand = async () => {
    await navigator.clipboard.writeText('cat /tmp/tabz-auth-token')
    setCommandCopied(true)
    setTimeout(() => setCommandCopied(false), 2000)
  }

  const addHeader = () => {
    setHeaders([...headers, { id: Date.now().toString(), key: '', value: '', enabled: true }])
  }

  const updateHeader = (id: string, field: keyof KeyValue, value: string | boolean) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)))
  }

  const removeHeader = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id))
  }

  const applyPreset = (preset: Preset) => {
    setMethod(preset.method)
    setUrl(preset.url)
    if (preset.body) {
      setBody(JSON.stringify(preset.body, null, 2))
    } else {
      setBody('')
    }
  }

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-emerald-400'
    if (status >= 400 && status < 500) return 'text-amber-400'
    if (status >= 500) return 'text-red-400'
    return 'text-muted-foreground'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
          <Code2 className="w-8 h-8" />
          API Playground
        </h1>
        <p className="text-muted-foreground mt-1">Test TabzChrome REST API endpoints</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Request Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* URL Bar */}
          <div className="flex gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
              className={`px-3 py-2 rounded-lg border font-mono font-medium ${METHOD_COLORS[method]}`}
            >
              {(['GET', 'POST', 'PUT', 'DELETE'] as HttpMethod[]).map((m) => (
                <option key={m} value={m} className="bg-background text-foreground">
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/api/endpoint"
              className="flex-1 px-4 py-2 rounded-lg bg-card border border-border font-mono focus:border-primary focus:outline-none"
            />
            <button
              onClick={sendRequest}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
              Send
            </button>
          </div>

          {/* Headers */}
          <div className="rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-medium">Headers</span>
              <button onClick={addHeader} className="text-primary hover:text-primary/80">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {headers.map((header) => (
                <div key={header.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={header.enabled}
                    onChange={(e) => updateHeader(header.id, 'enabled', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <input
                    type="text"
                    value={header.key}
                    onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                    placeholder="Key"
                    className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-mono text-sm focus:border-primary focus:outline-none"
                  />
                  <input
                    type="text"
                    value={header.value}
                    onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-mono text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => removeHeader(header.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          {method !== 'GET' && (
            <div className="rounded-xl bg-card border border-border">
              <div className="px-4 py-3 border-b border-border">
                <span className="font-medium">Body</span>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full h-40 p-4 bg-transparent font-mono text-sm resize-none focus:outline-none"
              />
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="rounded-xl bg-card border border-border">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-4">
                  <span className={`font-mono font-bold ${getStatusColor(response.status)}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {response.time}ms
                  </span>
                </div>
                <button
                  onClick={copyResponse}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-4 overflow-auto max-h-[calc(100vh-400px)] font-mono text-sm">
                <code>{response.body}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Authentication */}
          <div className="rounded-xl bg-card border border-border">
            <button
              onClick={() => setShowAuth(!showAuth)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border"
            >
              <span className="font-medium flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                Authentication
              </span>
              {showAuth ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {showAuth && (
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Auth token required for spawn API. Stored at <code className="text-cyan-400">/tmp/tabz-auth-token</code>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={copyToken}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
                  >
                    {tokenCopied ? <Check className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                    {tokenCopied ? 'Copied!' : 'Copy Token'}
                  </button>
                  <button
                    onClick={copyCommand}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm"
                    title="Copy read command"
                  >
                    {commandCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Example usage</summary>
                  <pre className="mt-2 p-2 rounded bg-muted/50 font-mono text-cyan-400 overflow-x-auto">
{`TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST localhost:8129/api/spawn \\
  -H "X-Auth-Token: $TOKEN" \\
  -d '{"name": "Test"}'`}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {/* Presets */}
          <div className="rounded-xl bg-card border border-border">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10"
            >
              <span className="font-medium">TabzChrome Endpoints</span>
              {showPresets ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {showPresets && (
              <div className="p-2 space-y-3">
                {PRESET_CATEGORIES.map((category, catIndex) => (
                  <div key={catIndex}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {category.name}
                    </div>
                    <div className="space-y-0.5">
                      {category.presets.map((preset, i) => {
                        const status = healthStatus[preset.url]
                        const dotColor =
                          status === 'healthy'
                            ? 'bg-emerald-400'
                            : status === 'unhealthy'
                              ? 'bg-red-400'
                              : status === 'checking'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-gray-500'
                        return (
                          <button
                            key={i}
                            onClick={() => applyPreset(preset)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted text-left"
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${METHOD_COLORS[preset.method]}`}
                            >
                              {preset.method.slice(0, 3)}
                            </span>
                            <span className="text-sm flex-1 truncate">{preset.name}</span>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} title={status || 'unknown'} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
