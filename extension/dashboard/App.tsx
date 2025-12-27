import React, { useState, useEffect, useRef } from 'react'
import {
  Home,
  Grid3X3,
  Terminal,
  Code2,
  Wrench,
  Settings,
  ChevronLeft,
  ChevronRight,
  Github,
  Wifi,
  WifiOff,
  FolderOpen,
  Folder,
  ChevronDown,
  Trash2,
  GitBranch,
} from 'lucide-react'
import { useWorkingDirectory } from '../hooks/useWorkingDirectory'

// Sections
import HomeSection from './sections/Home'
import ProfilesSection from './sections/Profiles'
import TerminalsSection from './sections/Terminals'
import ApiPlayground from './sections/ApiPlayground'
import McpPlayground from './sections/McpPlayground'
import SettingsSection from './sections/Settings'
import FilesSection from './sections/Files'
import GitSection from './sections/Git'

// Components
import CaptureViewer from './components/CaptureViewer'

// Contexts
import { FilesProvider } from './contexts/FilesContext'

// Types for capture viewer
interface CaptureData {
  content: string
  lines: number
  metadata: {
    sessionName: string
    workingDir: string | null
    gitBranch: string | null
    capturedAt: string
  }
}

type Section = 'home' | 'profiles' | 'terminals' | 'files' | 'git' | 'api' | 'mcp' | 'settings'

interface NavItem {
  id: Section
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'profiles', label: 'Profiles', icon: Grid3X3 },
  { id: 'terminals', label: 'Terminals', icon: Terminal },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'git', label: 'Source Control', icon: GitBranch },
  { id: 'api', label: 'API Playground', icon: Code2 },
  { id: 'mcp', label: 'MCP Settings', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    // Check URL hash first (e.g., #/files?path=...) - must be synchronous
    // to prevent race condition with FilesContext clearing the hash
    const hash = window.location.hash
    if (hash.startsWith('#/')) {
      const hashPath = hash.slice(2) // Remove '#/'
      const [section] = hashPath.split('?')
      const validSections: Section[] = ['home', 'profiles', 'terminals', 'files', 'git', 'api', 'mcp', 'settings']
      if (validSections.includes(section as Section)) {
        return section as Section
      }
    }
    // Fall back to localStorage
    const saved = localStorage.getItem('tabz-dashboard-section')
    return (saved as Section) || 'home'
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('tabz-dashboard-sidebar-collapsed') === 'true'
  })
  const [connected, setConnected] = useState<boolean | null>(null) // null = checking
  const [captureData, setCaptureData] = useState<CaptureData | null>(null)
  const [showDirDropdown, setShowDirDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Shared working directory
  const { globalWorkingDir, setGlobalWorkingDir, recentDirs, setRecentDirs } = useWorkingDirectory()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDirDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Persist section and sidebar state
  useEffect(() => {
    localStorage.setItem('tabz-dashboard-section', activeSection)
  }, [activeSection])

  useEffect(() => {
    localStorage.setItem('tabz-dashboard-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Check for capture query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const captureId = params.get('capture')

    if (captureId) {
      // Load capture data from localStorage
      const stored = localStorage.getItem(`tabz-capture-${captureId}`)
      if (stored) {
        try {
          const data = JSON.parse(stored)
          setCaptureData(data)
        } catch (err) {
          console.error('Failed to parse capture data:', err)
        }
      }
    }
  }, [])

  // Note: Hash-based navigation (e.g., #/files?path=...) is handled synchronously
  // in the useState initializer above to prevent race condition with FilesContext

  const handleCloseCapture = () => {
    // Get capture ID from URL to clean up localStorage
    const params = new URLSearchParams(window.location.search)
    const captureId = params.get('capture')
    if (captureId) {
      localStorage.removeItem(`tabz-capture-${captureId}`)
    }

    // Clear capture data and remove query param
    setCaptureData(null)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const handleRefreshCapture = async () => {
    if (!captureData?.metadata?.sessionName) return

    try {
      const response = await fetch(
        `http://localhost:8129/api/tmux/sessions/${captureData.metadata.sessionName}/capture`
      )
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setCaptureData(result.data)
        }
      }
    } catch (err) {
      console.error('Failed to refresh capture:', err)
    }
  }

  // Check backend connection on mount and periodically
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('http://localhost:8129/api/health', {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        })
        setConnected(res.ok)
      } catch {
        setConnected(false)
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 10000) // Check every 10s
    return () => clearInterval(interval)
  }, [])

  const renderSection = () => {
    switch (activeSection) {
      case 'home':
        return <HomeSection />
      case 'profiles':
        return <ProfilesSection />
      case 'terminals':
        return <TerminalsSection />
      case 'files':
        return <FilesSection />
      case 'git':
        return <GitSection />
      case 'api':
        return <ApiPlayground />
      case 'mcp':
        return <McpPlayground />
      case 'settings':
        return <SettingsSection />
      default:
        return <HomeSection />
    }
  }

  return (
    <FilesProvider>
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card/50 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Logo/Brand */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <img
            src="../icons/icon48.png"
            alt="TabzChrome"
            className="w-8 h-8"
          />
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg font-mono text-primary terminal-glow">TabzChrome</span>
              <ConnectionStatus connected={connected} />
            </div>
          )}
        </div>

        {/* Working Directory Selector */}
        <div className="p-2 border-b border-border" ref={dropdownRef}>
          {sidebarCollapsed ? (
            <button
              onClick={() => setShowDirDropdown(!showDirDropdown)}
              className="w-full flex justify-center p-2 rounded-lg hover:bg-muted transition-colors"
              title={globalWorkingDir}
            >
              <Folder className="w-5 h-5 text-yellow-400" />
            </button>
          ) : (
            <button
              onClick={() => setShowDirDropdown(!showDirDropdown)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors text-sm"
            >
              <Folder className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="flex-1 text-left font-mono truncate text-xs">{globalWorkingDir}</span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showDirDropdown ? 'rotate-180' : ''}`} />
            </button>
          )}

          {showDirDropdown && (
            <div className={`absolute ${sidebarCollapsed ? 'left-16' : 'left-2 right-2'} mt-1 bg-card border border-border rounded-lg shadow-xl z-50`} style={sidebarCollapsed ? { width: '280px' } : {}}>
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  placeholder="Enter path..."
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm font-mono"
                  defaultValue={globalWorkingDir}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setGlobalWorkingDir((e.target as HTMLInputElement).value)
                      setShowDirDropdown(false)
                    }
                  }}
                />
              </div>
              <div className="max-h-[250px] overflow-y-auto">
                {recentDirs.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No recent directories
                  </div>
                ) : (
                  recentDirs.map((dir) => (
                    <div
                      key={dir}
                      className={`flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors group ${
                        dir === globalWorkingDir ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <button
                        className="flex-1 text-left font-mono text-sm truncate"
                        onClick={() => {
                          setGlobalWorkingDir(dir)
                          setShowDirDropdown(false)
                        }}
                      >
                        {dir}
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRecentDirs((prev) => prev.filter((d) => d !== dir))
                          if (globalWorkingDir === dir) {
                            setGlobalWorkingDir('~')
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                data-section={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border">
          <a
            href="https://github.com/GGPrompts/TabzChrome"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
            title="View on GitHub"
          >
            <Github className="w-5 h-5" />
            {!sidebarCollapsed && <span className="text-sm">GitHub</span>}
          </a>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto scrollbar-thin">
        {renderSection()}
      </main>

      {/* Capture Viewer Overlay */}
      {captureData && (
        <CaptureViewer capture={captureData} onClose={handleCloseCapture} onRefresh={handleRefreshCapture} />
      )}
    </div>
    </FilesProvider>
  )
}

function ConnectionStatus({ connected }: { connected: boolean | null }) {
  if (connected === null) {
    return (
      <span className="text-xs text-muted-foreground animate-pulse" title="Checking connection...">
        ...
      </span>
    )
  }

  return (
    <span
      className={`flex items-center gap-1 text-xs ${
        connected ? 'text-emerald-400' : 'text-red-400'
      }`}
      title={connected ? 'Backend connected' : 'Backend disconnected'}
    >
      {connected ? (
        <Wifi className="w-3 h-3" />
      ) : (
        <WifiOff className="w-3 h-3" />
      )}
    </span>
  )
}
