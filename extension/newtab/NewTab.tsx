import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ClockWidget } from './components/ClockWidget'
import { StatusWidget } from './components/StatusWidget'
import { CommandBar } from './components/CommandBar'
import { ProfilesGrid } from './components/ProfilesGrid'
import { WebShortcuts } from './components/WebShortcuts'
import { ShortcutsHint } from './components/ShortcutsHint'
import { useProfiles } from './hooks/useNewTabProfiles'
import { useTerminals } from './hooks/useNewTabTerminals'
import { useWorkingDir } from './hooks/useNewTabWorkingDir'

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

  return (
    <>
      {/* Background effects */}
      <div className="newtab-bg" />
      <div className="noise-overlay" />

      {/* Main layout */}
      <div className={`newtab-container ${isReady ? 'animate-fade-in' : 'opacity-0'}`}>
        {/* Header: Clock + Status */}
        <header className="newtab-header">
          <ClockWidget />
          <StatusWidget
            terminals={terminals}
            connected={connected}
            onTerminalClick={focusTerminal}
          />
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
