import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, FileText } from 'lucide-react'
import { ClockWidget } from './components/ClockWidget'
import { WeatherWidget } from './components/WeatherWidget'
import { StatusWidget } from './components/StatusWidget'
import { CommandBar } from './components/CommandBar'
import { ProfilesGrid } from './components/ProfilesGrid'
import { WebShortcuts } from './components/WebShortcuts'
import { ShortcutsHint } from './components/ShortcutsHint'
import { useProfiles } from './hooks/useNewTabProfiles'
import { useTerminals } from './hooks/useNewTabTerminals'
import { useWorkingDir } from './hooks/useNewTabWorkingDir'

const BACKEND_URL = 'http://localhost:8129'

export default function NewTab() {
  const { profiles, defaultProfileId, loading: profilesLoading } = useProfiles()
  const { terminals, connected, spawnTerminal, focusTerminal } = useTerminals()
  const { recentDirs, globalWorkingDir, setWorkingDir } = useWorkingDir()
  const [isReady, setIsReady] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Trigger ready state after initial load for animations
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return
      }

      // / - Focus search
      if (e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // 1-9 - Quick spawn profiles
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1
        if (profiles[index]) {
          e.preventDefault()
          spawnTerminal(profiles[index].id, globalWorkingDir)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [profiles, spawnTerminal, globalWorkingDir])

  // Handle profile click - spawn terminal
  const handleProfileClick = useCallback((profileId: string) => {
    spawnTerminal(profileId, globalWorkingDir)
  }, [spawnTerminal, globalWorkingDir])

  // Handle navigation
  const handleNavigate = useCallback((url: string) => {
    window.location.href = url
  }, [])

  // Open dashboard
  const openDashboard = useCallback(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/index.html') })
  }, [])

  // Open quick notes in popup terminal
  const openQuickNotes = useCallback(async () => {
    try {
      // Get auth token
      const tokenRes = await fetch(`${BACKEND_URL}/api/auth-token`)
      if (!tokenRes.ok) {
        console.error('[QuickNotes] Failed to get auth token')
        return
      }
      const { token } = await tokenRes.json()

      // Derive project name from working directory
      const workDir = globalWorkingDir || '~'
      const projectName = workDir === '~' ? 'home' : workDir.split('/').filter(Boolean).pop() || 'notes'
      const notesDir = `~/.tabz-notes/${projectName}`
      const notesFile = `${notesDir}/notes.md`

      // Spawn terminal with editor command
      // mkdir -p ensures directory exists, then opens editor
      // Try micro first (modern), fall back to nano, then vim
      const editorCommand = `mkdir -p ${notesDir} && (command -v micro >/dev/null && micro ${notesFile} || command -v nano >/dev/null && nano ${notesFile} || vim ${notesFile})`

      const response = await fetch(`${BACKEND_URL}/api/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token,
        },
        body: JSON.stringify({
          name: `Notes: ${projectName}`,
          workingDir: workDir === '~' ? undefined : workDir,
          command: editorCommand,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        console.error('[QuickNotes] Spawn failed:', err)
        return
      }

      const { terminal } = await response.json()
      const terminalId = terminal.id

      // Open as popup window
      const sidepanelUrl = chrome.runtime.getURL(
        `sidepanel/sidepanel.html?popout=true&terminal=${encodeURIComponent(terminalId)}`
      )

      const newWindow = await chrome.windows.create({
        url: sidepanelUrl,
        type: 'popup',
        width: 700,
        height: 500,
        focused: true,
      })

      // Notify that terminal is in popup
      if (newWindow?.id) {
        chrome.runtime.sendMessage({
          type: 'TERMINAL_POPPED_OUT',
          terminalId,
          windowId: newWindow.id,
        })
      }
    } catch (err) {
      console.error('[QuickNotes] Failed to open:', err)
    }
  }, [globalWorkingDir])

  return (
    <>
      {/* Background effects */}
      <div className="newtab-bg" />
      <div className="noise-overlay" />

      {/* Main layout */}
      <div className={`newtab-container ${isReady ? 'animate-fade-in' : 'opacity-0'}`}>
        {/* Header: Clock + Weather + Status */}
        <header className="newtab-header">
          <div className="header-left">
            <ClockWidget />
            <WeatherWidget />
          </div>
          <div className="header-right">
            <StatusWidget
              terminals={terminals}
              connected={connected}
              onTerminalClick={focusTerminal}
            />
            <div className="flex items-center gap-2">
              <button
                className="dashboard-button"
                onClick={openQuickNotes}
                title="Quick Notes"
              >
                <FileText className="w-4 h-4" />
                <span className="text-xs">Notes</span>
              </button>
              <button
                className="dashboard-button"
                onClick={openDashboard}
                title="Open Dashboard"
              >
                <img src="/icons/tabz-logo-light.png" alt="Tabz" className="h-5" />
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main: Command Bar + Side-by-side grids */}
        <main className="newtab-main">
          <CommandBar
            ref={searchInputRef}
            profiles={profiles}
            recentDirs={recentDirs}
            onSpawnTerminal={handleProfileClick}
            onNavigate={handleNavigate}
          />

          <div className="newtab-grids">
            <ProfilesGrid
              profiles={profiles}
              defaultProfileId={defaultProfileId}
              recentDirs={recentDirs}
              globalWorkingDir={globalWorkingDir}
              onWorkingDirChange={setWorkingDir}
              loading={profilesLoading}
              onProfileClick={handleProfileClick}
            />

            <WebShortcuts onNavigate={handleNavigate} />
          </div>
        </main>

        {/* Footer: Keyboard shortcuts hint */}
        <footer className="newtab-footer">
          <ShortcutsHint />
        </footer>
      </div>
    </>
  )
}
