import React, { useState, useEffect, useRef } from 'react'
import {
  Wifi,
  WifiOff,
  Folder,
  ChevronDown,
  Trash2,
} from 'lucide-react'
// Animated icons for sidebar
import {
  HomeIcon,
  TerminalIcon,
  FolderOpenIcon,
  GitBranchIcon,
  CodeIcon,
  SettingsIcon,
  VolumeIcon,
  BellIcon,
  GridIcon,
  GithubIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '../components/icons'
import { useWorkingDirectory } from '../hooks/useWorkingDirectory'

// Sections
import HomeSection from './sections/Home'
import TerminalsSection from './sections/Terminals'
import ApiPlayground from './sections/ApiPlayground'
// SettingsGeneral removed - settings moved to Files and API Playground pages
import SettingsMcp from './sections/SettingsMcp'
import SettingsAudio from './sections/SettingsAudio'
import SettingsNotifications from './sections/SettingsNotifications'
import SettingsProfiles from './sections/SettingsProfiles'
import FilesSection from './sections/Files'
import GitSection from './sections/Git'

// Components
import CaptureViewer from './components/CaptureViewer'
import { QuickOpenModal } from './components/QuickOpenModal'

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

type Section = 'home' | 'terminals' | 'files' | 'git' | 'api' | 'profiles' | 'mcp' | 'audio' | 'notifications'

interface NavItem {
  id: Section
  label: string
  icon: React.ComponentType<{ className?: string; size?: number; isHovered?: boolean }>
  children?: NavItem[]
}

// GithubLink component with hover state for animated icon
function GithubLink({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <a
      href="https://github.com/GGPrompts/TabzChrome"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${
        sidebarCollapsed ? 'justify-center' : ''
      }`}
      title="View on GitHub"
    >
      <GithubIcon size={20} isHovered={isHovered} />
      {!sidebarCollapsed && <span className="text-sm">GitHub</span>}
    </a>
  )
}

// NavButton component to handle hover state for animated icons
function NavButton({
  item,
  isActive,
  sidebarCollapsed,
  hasChildren,
  isExpanded,
  isChildActive,
  onClick
}: {
  item: NavItem
  isActive: boolean
  sidebarCollapsed: boolean
  hasChildren: boolean
  isExpanded: boolean
  isChildActive: boolean
  onClick: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const Icon = item.icon

  return (
    <button
      data-section={item.id}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isActive || isChildActive
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      title={sidebarCollapsed ? item.label : undefined}
    >
      <Icon size={20} className="flex-shrink-0" isHovered={isHovered} />
      {!sidebarCollapsed && (
        <>
          <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
          {hasChildren && (
            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
          )}
        </>
      )}
    </button>
  )
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Dashboard', icon: HomeIcon },
  { id: 'terminals', label: 'Active Terminals', icon: TerminalIcon },
  { id: 'profiles', label: 'Profiles', icon: GridIcon },
  { id: 'files', label: 'Files', icon: FolderOpenIcon },
  { id: 'git', label: 'Source Control', icon: GitBranchIcon },
  { id: 'api', label: 'API Playground', icon: CodeIcon },
  { id: 'mcp', label: 'MCP Settings', icon: SettingsIcon },
  { id: 'audio', label: 'Audio', icon: VolumeIcon },
  { id: 'notifications', label: 'Notifications', icon: BellIcon },
]

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    // Check URL hash first (e.g., #/files?path=...) - must be synchronous
    // to prevent race condition with FilesContext clearing the hash
    const hash = window.location.hash
    if (hash.startsWith('#/')) {
      const hashPath = hash.slice(2) // Remove '#/'
      const [section] = hashPath.split('?')
      const validSections: Section[] = ['home', 'terminals', 'files', 'git', 'api', 'profiles', 'mcp', 'audio', 'notifications']
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
  const [expandedNav, setExpandedNav] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState<boolean | null>(null) // null = checking
  const [captureData, setCaptureData] = useState<CaptureData | null>(null)
  const [showDirDropdown, setShowDirDropdown] = useState(false)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Shared working directory
  const { globalWorkingDir, setGlobalWorkingDir, recentDirs, setRecentDirs, addToRecentDirs } = useWorkingDirectory()

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

  // Listen for hash changes to navigate between sections (e.g., from Profiles → Files)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash
      if (hash.startsWith('#/')) {
        const hashPath = hash.slice(2) // Remove '#/'
        const [section] = hashPath.split('?')
        const validSections: Section[] = ['home', 'terminals', 'files', 'git', 'api', 'profiles', 'mcp', 'audio', 'notifications']
        if (validSections.includes(section as Section)) {
          setActiveSection(section as Section)
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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

  // Global keyboard shortcut: Cmd+P / Ctrl+P for quick open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+P (Mac) or Ctrl+P (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        setQuickOpenOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      case 'terminals':
        return <TerminalsSection />
      case 'files':
        return <FilesSection onQuickOpen={() => setQuickOpenOpen(true)} />
      case 'git':
        return <GitSection />
      case 'api':
        return <ApiPlayground />
      case 'profiles':
        return <SettingsProfiles />
      case 'mcp':
        return <SettingsMcp />
      case 'audio':
        return <SettingsAudio />
      case 'notifications':
        return <SettingsNotifications />
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
        <div className="relative p-2 border-b border-border" ref={dropdownRef}>
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
            <div
              className="absolute bg-card border border-border rounded-lg shadow-xl z-50"
              style={{
                width: sidebarCollapsed ? '320px' : '360px',
                left: sidebarCollapsed ? '64px' : '8px',
                top: sidebarCollapsed ? '0' : '100%',
                marginTop: sidebarCollapsed ? '0' : '4px',
              }}
            >
              <div className="p-2 border-b border-border">
                <input
                  type="text"
                  placeholder="Enter path..."
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm font-mono"
                  defaultValue={globalWorkingDir}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const newPath = (e.target as HTMLInputElement).value
                      setGlobalWorkingDir(newPath)
                      addToRecentDirs(newPath)  // Save to recent dirs
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
                      title={dir}
                    >
                      <button
                        className="flex-1 text-left font-mono text-sm truncate"
                        onClick={() => {
                          setGlobalWorkingDir(dir)
                          setShowDirDropdown(false)
                        }}
                        title={dir}
                      >
                        {dir}
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded transition-opacity flex-shrink-0 ml-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRecentDirs((prev) => prev.filter((d) => d !== dir))
                          if (globalWorkingDir === dir) {
                            setGlobalWorkingDir('~')
                          }
                        }}
                        title="Remove from recent"
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
            const isActive = activeSection === item.id
            const hasChildren = item.children && item.children.length > 0
            const isExpanded = expandedNav.has(item.id)
            const isChildActive = hasChildren && item.children?.some(child => activeSection === child.id)

            return (
              <div key={item.id}>
                <NavButton
                  item={item}
                  isActive={isActive}
                  sidebarCollapsed={sidebarCollapsed}
                  hasChildren={!!hasChildren}
                  isExpanded={isExpanded}
                  isChildActive={!!isChildActive}
                  onClick={() => {
                    if (hasChildren) {
                      // Toggle expansion
                      setExpandedNav(prev => {
                        const newSet = new Set(prev)
                        if (newSet.has(item.id)) {
                          newSet.delete(item.id)
                        } else {
                          newSet.add(item.id)
                        }
                        return newSet
                      })
                      // Navigate to first child if not already on a child
                      if (!isChildActive && item.children?.[0]) {
                        setActiveSection(item.children[0].id)
                      }
                    } else {
                      setActiveSection(item.id)
                    }
                  }}
                />
                {/* Children */}
                {hasChildren && isExpanded && (
                  <div className={`mt-1 space-y-1 ${sidebarCollapsed ? '' : 'ml-4'}`}>
                    {item.children?.map(child => {
                      const ChildIcon = child.icon
                      const isChildItemActive = activeSection === child.id
                      return (
                        <button
                          key={child.id}
                          data-section={child.id}
                          onClick={() => setActiveSection(child.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            isChildItemActive
                              ? 'bg-primary/20 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          } ${sidebarCollapsed ? 'justify-center' : ''}`}
                          title={sidebarCollapsed ? child.label : undefined}
                        >
                          <ChildIcon size={16} className="flex-shrink-0" />
                          {!sidebarCollapsed && <span className="text-sm">{child.label}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border">
          <GithubLink sidebarCollapsed={sidebarCollapsed} />
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpenIcon size={20} />
            ) : (
              <>
                <PanelLeftCloseIcon size={20} />
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

      {/* Quick Open Modal (Cmd+P) */}
      <QuickOpenModal
        isOpen={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        onFileOpen={() => setActiveSection('files')}
      />
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
