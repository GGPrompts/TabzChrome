import React, { useState } from 'react'
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
} from 'lucide-react'

// Sections
import HomeSection from './sections/Home'
import ProfilesSection from './sections/Profiles'
import TerminalsSection from './sections/Terminals'
import ApiPlayground from './sections/ApiPlayground'
// import McpPlayground from './sections/McpPlayground'

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
        return <div className="p-6"><h1 className="text-2xl font-bold">MCP Playground</h1><p className="text-muted-foreground mt-2">Coming soon...</p></div>
      case 'settings':
        return <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground mt-2">Coming soon...</p></div>
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
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-semibold text-lg terminal-glow">TabzChrome</span>
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
