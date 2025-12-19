import React, { useState, useEffect, useCallback } from 'react'
import { Send, Copy, Check, Clock, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

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

// TabzChrome API endpoints for quick access
const PRESETS = [
  { method: 'GET' as HttpMethod, url: '/api/health', name: 'Health Check' },
  { method: 'GET' as HttpMethod, url: '/api/agents', name: 'List Terminals' },
  { method: 'GET' as HttpMethod, url: '/api/browser/profiles', name: 'Get Profiles' },
  { method: 'GET' as HttpMethod, url: '/api/tmux/orphaned-sessions', name: 'Orphaned Sessions' },
  { method: 'GET' as HttpMethod, url: '/api/tmux/sessions/detailed', name: 'All Tmux Sessions' },
  { method: 'POST' as HttpMethod, url: '/api/spawn', name: 'Spawn Terminal' },
  { method: 'DELETE' as HttpMethod, url: '/api/tmux/sessions/:name', name: 'Kill Session' },
]

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
  const [showPresets, setShowPresets] = useState(true)
  const [healthStatus, setHealthStatus] = useState<Record<string, HealthStatus>>({})

  const checkHealth = useCallback(async () => {
    const newStatus: Record<string, HealthStatus> = {}

    // Set all GET endpoints to 'checking', POST/DELETE to 'neutral'
    PRESETS.forEach((preset) => {
      if (preset.method === 'GET') {
        newStatus[preset.url] = 'checking'
      } else {
        newStatus[preset.url] = 'neutral'
      }
    })
    setHealthStatus(newStatus)

    // Check GET endpoints in parallel
    const getPresets = PRESETS.filter((p) => p.method === 'GET')
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

  const addHeader = () => {
    setHeaders([...headers, { id: Date.now().toString(), key: '', value: '', enabled: true }])
  }

  const updateHeader = (id: string, field: keyof KeyValue, value: string | boolean) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)))
  }

  const removeHeader = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id))
  }

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setMethod(preset.method)
    setUrl(preset.url)
    if (preset.method === 'POST' && preset.url === '/api/spawn') {
      setBody(JSON.stringify({ name: 'Test Terminal', command: 'bash', workingDir: '~' }, null, 2))
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
        <h1 className="text-3xl font-bold terminal-glow">API Playground</h1>
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
              <pre className="p-4 overflow-auto max-h-96 font-mono text-sm">
                <code>{response.body}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Presets Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl bg-card border border-border">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border"
            >
              <span className="font-medium">TabzChrome Endpoints</span>
              {showPresets ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {showPresets && (
              <div className="p-2 space-y-1">
                {PRESETS.map((preset, i) => {
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
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left"
                    >
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${METHOD_COLORS[preset.method]}`}
                      >
                        {preset.method}
                      </span>
                      <span className="text-sm flex-1">{preset.name}</span>
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} title={status || 'unknown'} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
