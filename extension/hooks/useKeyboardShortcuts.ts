import { useCallback } from 'react'
import { sendMessage } from '../shared/messaging'
import { getEffectiveWorkingDir } from '../shared/utils'
import type { Profile } from '../components/SettingsModal'
import type { TerminalSession } from './useTerminalSessions'

export interface UseKeyboardShortcutsParams {
  sessionsRef: React.RefObject<TerminalSession[]>
  currentSessionRef: React.RefObject<string | null>
  globalWorkingDirRef: React.RefObject<string>
  profiles: Profile[]
  defaultProfileId: string
  setCurrentSession: (id: string | null) => void
  switchToSession: (id: string) => void  // Handles both session switch and 3D tab focus
  addToRecentDirs: (dir: string) => void
}

export interface UseKeyboardShortcutsReturn {
  handleKeyboardNewTab: () => void
  handleKeyboardCloseTab: () => void
  handleKeyboardNextTab: () => void
  handleKeyboardPrevTab: () => void
  handleKeyboardSwitchTab: (tabIndex: number) => void
  handleOmniboxSpawnProfile: (profile: Profile) => void
  handleOmniboxRunCommand: (command: string) => void
}

/**
 * Hook for keyboard shortcut handlers
 * - Uses refs to access current state from callbacks registered once
 * - Handles new tab, close tab, next/prev tab navigation
 * - Handles omnibox spawn profile and run command actions
 */
export function useKeyboardShortcuts({
  sessionsRef,
  currentSessionRef,
  globalWorkingDirRef,
  setCurrentSession,
  switchToSession,
  addToRecentDirs,
}: UseKeyboardShortcutsParams): UseKeyboardShortcutsReturn {

  // Spawn new tab with default profile
  const handleKeyboardNewTab = useCallback(() => {
    // Use ref to get current globalWorkingDir (state might be stale in callback)
    const currentGlobalWorkingDir = globalWorkingDirRef.current || '~'

    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
      const profiles = (result.profiles as Profile[]) || []
      const savedDefaultId = (result.defaultProfile as string) || 'default'

      // Validate defaultProfile - ensure it matches an existing profile ID
      const profileIds = profiles.map(p => p.id)
      let defaultProfileId = savedDefaultId
      if (!profileIds.includes(savedDefaultId) && profiles.length > 0) {
        defaultProfileId = profiles[0].id
        console.warn(`[KeyboardNewTab] defaultProfile '${savedDefaultId}' not found, auto-fixing to '${defaultProfileId}'`)
        chrome.storage.local.set({ defaultProfile: defaultProfileId })
      }

      const profile = profiles.find((p: Profile) => p.id === defaultProfileId)

      if (profile) {
        const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, currentGlobalWorkingDir)
        sendMessage({
          type: 'SPAWN_TERMINAL',
          spawnOption: 'bash',
          name: profile.name,
          workingDir: effectiveWorkingDir,
          command: profile.command,
          profile: { ...profile, workingDir: effectiveWorkingDir },
        })
        addToRecentDirs(effectiveWorkingDir)
      } else {
        // Fallback to regular bash
        sendMessage({
          type: 'SPAWN_TERMINAL',
          spawnOption: 'bash',
          name: 'Bash',
          workingDir: currentGlobalWorkingDir,
        })
      }
    })
  }, [globalWorkingDirRef, addToRecentDirs])

  // Close current tab
  const handleKeyboardCloseTab = useCallback(() => {
    const current = currentSessionRef.current
    const allSessions = sessionsRef.current || []
    if (!current || allSessions.length === 0) return

    sendMessage({
      type: 'CLOSE_TERMINAL',
      terminalId: current,
    })

    // Switch to another tab
    if (allSessions.length > 1) {
      const currentIndex = allSessions.findIndex(s => s.id === current)
      const nextSession = allSessions[currentIndex === 0 ? 1 : currentIndex - 1]
      setCurrentSession(nextSession.id)
    }
  }, [sessionsRef, currentSessionRef, setCurrentSession])

  // Switch to next tab
  const handleKeyboardNextTab = useCallback(() => {
    const current = currentSessionRef.current
    const allSessions = sessionsRef.current || []
    if (!current || allSessions.length <= 1) return

    const currentIndex = allSessions.findIndex(s => s.id === current)
    const nextIndex = (currentIndex + 1) % allSessions.length
    switchToSession(allSessions[nextIndex].id)
  }, [sessionsRef, currentSessionRef, switchToSession])

  // Switch to previous tab
  const handleKeyboardPrevTab = useCallback(() => {
    const current = currentSessionRef.current
    const allSessions = sessionsRef.current || []
    if (!current || allSessions.length <= 1) return

    const currentIndex = allSessions.findIndex(s => s.id === current)
    const prevIndex = currentIndex === 0 ? allSessions.length - 1 : currentIndex - 1
    switchToSession(allSessions[prevIndex].id)
  }, [sessionsRef, currentSessionRef, switchToSession])

  // Switch to specific tab by index (1-9 keys)
  const handleKeyboardSwitchTab = useCallback((tabIndex: number) => {
    const allSessions = sessionsRef.current || []
    if (tabIndex >= 0 && tabIndex < allSessions.length) {
      switchToSession(allSessions[tabIndex].id)
    }
  }, [sessionsRef, switchToSession])

  // Spawn terminal with specific profile (from omnibox)
  const handleOmniboxSpawnProfile = useCallback((profile: Profile) => {
    const currentGlobalWorkingDir = globalWorkingDirRef.current || '~'
    const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, currentGlobalWorkingDir)
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
      name: profile.name,
      workingDir: effectiveWorkingDir,
      command: profile.command,
      profile: { ...profile, workingDir: effectiveWorkingDir },
    })
    addToRecentDirs(effectiveWorkingDir)
  }, [globalWorkingDirRef, addToRecentDirs])

  // Spawn terminal and run command (from omnibox)
  const handleOmniboxRunCommand = useCallback((command: string) => {
    // Capture current globalWorkingDir to avoid stale closure in async callback
    const currentGlobalWorkingDir = globalWorkingDirRef.current || '~'

    // Get default profile settings
    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
      const defaultProfileId = result.defaultProfile || 'default'
      const profiles = (result.profiles as Profile[]) || []
      const profile = profiles.find((p: Profile) => p.id === defaultProfileId)

      const effectiveWorkingDir = getEffectiveWorkingDir(profile?.workingDir, currentGlobalWorkingDir)
      // Spawn terminal with the command
      // The command will be typed into the terminal after spawn
      sendMessage({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: command.split(' ')[0], // Use first word as tab name (e.g., "git", "npm")
        command: command, // Pass command to execute
        workingDir: effectiveWorkingDir,
        profile: profile ? { ...profile, workingDir: effectiveWorkingDir } : undefined,
      })
      addToRecentDirs(effectiveWorkingDir)
    })
  }, [globalWorkingDirRef, addToRecentDirs])

  return {
    handleKeyboardNewTab,
    handleKeyboardCloseTab,
    handleKeyboardNextTab,
    handleKeyboardPrevTab,
    handleKeyboardSwitchTab,
    handleOmniboxSpawnProfile,
    handleOmniboxRunCommand,
  }
}
