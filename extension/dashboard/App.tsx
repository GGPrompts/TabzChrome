import React, { useState, useEffect } from 'react'
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
} from 'lucide-react'

// Sections
import HomeSection from './sections/Home'
import ProfilesSection from './sections/Profiles'
import TerminalsSection from './sections/Terminals'
import ApiPlayground from './sections/ApiPlayground'
import McpPlayground from './sections/McpPlayground'
import SettingsSection from './sections/Settings'

type Section = 'home' | 'profiles' | 'terminals' | 'api' | 'mcp' | 'settings'

interface NavItem {
  id: Section
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'profiles', label: 'Profiles', icon: Grid3X3 },
  { id: 'terminals', label: 'Terminals', icon: Terminal },
  { id: 'api', label: 'API Playground', icon: Code2 },
  { id: 'mcp', label: 'MCP Playground', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>('home')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null) // null = checking

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
              <span className="font-semibold text-lg terminal-glow">TabzChrome</span>
              <ConnectionStatus connected={connected} />
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
            href="https://github.com/anthropics/claude-code"
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
    </div>
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
