import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Key, Palette, Copy, Check, RefreshCw, ExternalLink, FileCode } from 'lucide-react'

const API_BASE = 'http://localhost:8129'

// Theme options (must match extension/styles/themes.ts)
const THEMES = [
  { id: 'high-contrast', name: 'High Contrast', desc: 'Maximum readability with vibrant colors', color: '#00ff88' },
  { id: 'dracula', name: 'Dracula', desc: 'Classic purple-accented dark theme', color: '#bd93f9' },
  { id: 'ocean', name: 'Ocean', desc: 'Gentle ocean-inspired blues', color: '#82aaff' },
  { id: 'neon', name: 'Neon', desc: 'Ultra-vibrant neon colors', color: '#ff00ff' },
  { id: 'amber', name: 'Amber', desc: 'Warm retro amber aesthetic', color: '#d79921' },
  { id: 'matrix', name: 'Matrix', desc: 'Classic green terminal', color: '#00ff88' },
]

export default function SettingsSection() {
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedTheme, setSelectedTheme] = useState('high-contrast')

  // File tree settings
  const [fileTreeMaxDepth, setFileTreeMaxDepth] = useState(5)

  // Load settings from Chrome storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load from Chrome storage (syncs with sidepanel)
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get([
            'dashboardTheme',
            'fileTreeMaxDepth'
          ], (result: {
            dashboardTheme?: string
            fileTreeMaxDepth?: number
          }) => {
            if (result.dashboardTheme) setSelectedTheme(result.dashboardTheme)
            if (result.fileTreeMaxDepth) setFileTreeMaxDepth(result.fileTreeMaxDepth)
          })
        }

        // Load auth token from file
        const tokenRes = await fetch(`${API_BASE}/api/health`)
        if (tokenRes.ok) {
          // Auth token is in a file, but we can't read it directly
          // We'll show a placeholder and instructions
          setAuthToken('*****')
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const saveTheme = (themeId: string) => {
    setSelectedTheme(themeId)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ dashboardTheme: themeId })
    }
  }

  const saveFileTreeMaxDepth = (depth: number) => {
    setFileTreeMaxDepth(depth)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ fileTreeMaxDepth: depth })
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
    try {
      await navigator.clipboard.writeText('cat /tmp/tabz-auth-token')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
          <SettingsIcon className="w-8 h-8" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure dashboard preferences and view connection info
        </p>
      </div>

      {/* File Tree Settings */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileCode className="w-5 h-5 text-primary" />
          File Browser
        </h2>
        <div className="rounded-xl bg-card border border-border p-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">File Tree Depth</label>
              <span className="text-sm text-muted-foreground">{fileTreeMaxDepth} levels</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={fileTreeMaxDepth}
              onChange={(e) => saveFileTreeMaxDepth(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1</span>
              <span>10</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Lower values load faster. Use keyboard navigation to explore deeper.
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            Font settings are available directly in the Files page header.
          </p>
        </div>
      </section>

      {/* API Token */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-primary" />
          API Authentication
        </h2>
        <div className="rounded-xl bg-card border border-border p-6">
          <p className="text-sm text-muted-foreground mb-4">
            The auth token is required for external tools to spawn terminals via the REST API.
            The token is stored in <code className="text-cyan-400">/tmp/tabz-auth-token</code> and regenerated on each backend restart.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-muted-foreground">Token location:</span>
            <code className="px-3 py-1.5 bg-muted rounded-lg font-mono text-sm">/tmp/tabz-auth-token</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyToken}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {tokenCopied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Copy Token</span>
                </>
              )}
            </button>
            <button
              onClick={copyCommand}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy read command</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-2">Example API usage:</p>
            <pre className="text-xs font-mono text-cyan-400 overflow-x-auto">
{`TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \\
  -H "Content-Type: application/json" \\
  -H "X-Auth-Token: $TOKEN" \\
  -d '{"name": "My Terminal", "command": "bash"}'`}
            </pre>
          </div>
        </div>
      </section>

      {/* Theme (Future) */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Theme
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">Coming soon</span>
        </h2>
        <div className="rounded-xl bg-card border border-border p-6 opacity-60">
          <p className="text-sm text-muted-foreground mb-4">
            Dashboard theme selection will be available in a future update.
            Terminal themes are configured per-profile in the Settings modal.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {THEMES.map(theme => (
              <div
                key={theme.id}
                className={`p-3 rounded-lg border cursor-not-allowed ${
                  selectedTheme === theme.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: theme.color }}
                  />
                  <span className="font-medium text-sm">{theme.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{theme.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Links */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="https://github.com/GGPrompts/TabzChrome"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <span>GitHub Repository</span>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
          <a
            href="http://localhost:8129/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <span>Backend Dashboard (Legacy)</span>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        </div>
      </section>
    </div>
  )
}
