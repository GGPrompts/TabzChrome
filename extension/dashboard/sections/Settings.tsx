import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, FolderOpen, Key, Palette, Copy, Check, Eye, EyeOff, RefreshCw, ExternalLink } from 'lucide-react'

const API_BASE = 'http://localhost:8129'

// Theme options
const THEMES = [
  { id: 'high-contrast', name: 'High Contrast', desc: 'Default theme with bright colors', color: '#00ff88' },
  { id: 'dracula', name: 'Dracula', desc: 'Purple-tinted dark theme', color: '#bd93f9' },
  { id: 'monokai', name: 'Monokai', desc: 'Classic warm dark theme', color: '#f92672' },
  { id: 'ocean', name: 'Ocean', desc: 'Blue-tinted dark theme', color: '#82aaff' },
  { id: 'nord', name: 'Nord', desc: 'Arctic, north-bluish theme', color: '#88c0d0' },
  { id: 'gruvbox', name: 'Gruvbox', desc: 'Retro groove color scheme', color: '#d79921' },
]

export default function SettingsSection() {
  const [globalWorkingDir, setGlobalWorkingDir] = useState('~')
  const [recentDirs, setRecentDirs] = useState<string[]>(['~', '~/projects'])
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newDir, setNewDir] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('high-contrast')

  // Load settings from Chrome storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load from Chrome storage (syncs with sidepanel)
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['globalWorkingDir', 'recentDirs', 'dashboardTheme'], (result: {
            globalWorkingDir?: string
            recentDirs?: string[]
            dashboardTheme?: string
          }) => {
            if (result.globalWorkingDir) setGlobalWorkingDir(result.globalWorkingDir)
            if (result.recentDirs) setRecentDirs(result.recentDirs)
            if (result.dashboardTheme) setSelectedTheme(result.dashboardTheme)
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

  // Save working directory to Chrome storage and backend
  const saveWorkingDir = async (dir: string) => {
    setGlobalWorkingDir(dir)

    // Update recent dirs
    const newRecent = [dir, ...recentDirs.filter(d => d !== dir)].slice(0, 15)
    setRecentDirs(newRecent)

    // Save to Chrome storage (syncs with sidepanel)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ globalWorkingDir: dir, recentDirs: newRecent })
    }

    // Also save to backend API
    try {
      await fetch(`${API_BASE}/api/settings/working-dir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalWorkingDir: dir, recentDirs: newRecent }),
      })
    } catch (err) {
      console.error('Failed to save to backend:', err)
    }
  }

  const saveTheme = (themeId: string) => {
    setSelectedTheme(themeId)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ dashboardTheme: themeId })
    }
  }

  const addCustomDir = () => {
    if (newDir.trim()) {
      saveWorkingDir(newDir.trim())
      setNewDir('')
    }
  }

  const copyToken = async () => {
    try {
      // Instruction to copy from file
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
        <h1 className="text-3xl font-bold terminal-glow flex items-center gap-3">
          <SettingsIcon className="w-8 h-8" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure dashboard preferences and view connection info
        </p>
      </div>

      {/* Working Directory */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          Default Working Directory
        </h2>
        <div className="rounded-xl bg-card border border-border p-6">
          <p className="text-sm text-muted-foreground mb-4">
            The default directory for new terminals. Profiles with empty workingDir will inherit this value.
          </p>

          {/* Current directory */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-muted-foreground">Current:</span>
            <code className="px-3 py-1.5 bg-muted rounded-lg font-mono text-sm">{globalWorkingDir}</code>
          </div>

          {/* Recent directories */}
          <div className="mb-4">
            <span className="text-sm text-muted-foreground block mb-2">Recent directories:</span>
            <div className="flex flex-wrap gap-2">
              {recentDirs.map(dir => (
                <button
                  key={dir}
                  onClick={() => saveWorkingDir(dir)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    dir === globalWorkingDir
                      ? 'bg-primary/20 border border-primary/50 text-primary'
                      : 'bg-muted hover:bg-muted/80 border border-border'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>

          {/* Add custom directory */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newDir}
              onChange={(e) => setNewDir(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomDir()}
              placeholder="Enter custom path..."
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg focus:border-primary focus:outline-none"
            />
            <button
              onClick={addCustomDir}
              disabled={!newDir.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied command!</span>
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
