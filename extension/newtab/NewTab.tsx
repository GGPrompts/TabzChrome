import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ClockWidget } from './components/ClockWidget'
import { StatusWidget } from './components/StatusWidget'
import { CommandBar } from './components/CommandBar'
import { ProfilesGrid } from './components/ProfilesGrid'
import { RecentDirs } from './components/RecentDirs'
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

  // Handle directory click - set as working dir
  const handleDirClick = useCallback((dir: string) => {
    setWorkingDir(dir)
  }, [setWorkingDir])

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

        {/* Main: Command Bar + Profiles */}
        <main className="newtab-main">
          <CommandBar
            ref={searchInputRef}
            profiles={profiles}
            recentDirs={recentDirs}
            onSpawnTerminal={handleProfileClick}
            onNavigate={(url) => window.location.href = url}
          />

          <ProfilesGrid
            profiles={profiles}
            defaultProfileId={defaultProfileId}
            loading={profilesLoading}
            onProfileClick={handleProfileClick}
          />

          <RecentDirs
            dirs={recentDirs}
            currentDir={globalWorkingDir}
            onDirClick={handleDirClick}
          />
        </main>

        {/* Footer: Keyboard shortcuts hint */}
        <footer className="newtab-footer">
          <ShortcutsHint />
        </footer>
      </div>
    </>
  )
}
