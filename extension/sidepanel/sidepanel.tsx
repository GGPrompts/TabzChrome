import React, { useEffect, useState, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import { Terminal as TerminalIcon, Settings, Plus, X, ChevronDown, Moon, Sun, Keyboard, Volume2, VolumeX, RefreshCw, LayoutDashboard } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Terminal } from '../components/Terminal'
import { TerminalCustomizePopover } from '../components/TerminalCustomizePopover'
import { SettingsModal, type Profile } from '../components/SettingsModal'
import { ProfileDropdown } from '../components/ProfileDropdown'
import { SessionContextMenu } from '../components/SessionContextMenu'
import { GhostBadgeDropdown } from '../components/GhostBadgeDropdown'
import { WorkingDirDropdown } from '../components/WorkingDirDropdown'
import { ChatInputBar } from '../components/ChatInputBar'
import { connectToBackground, sendMessage } from '../shared/messaging'
import { setupConsoleForwarding } from '../shared/consoleForwarder'
import { getEffectiveWorkingDir } from '../shared/utils'
import { useClaudeStatus, getStatusEmoji, getStatusText, getFullStatusText, getRobotEmojis, getContextColor, getStatusColor } from '../hooks/useClaudeStatus'
import { useCommandHistory } from '../hooks/useCommandHistory'
import { useOrphanedSessions } from '../hooks/useOrphanedSessions'
import { useWorkingDirectory } from '../hooks/useWorkingDirectory'
import { useProfiles } from '../hooks/useProfiles'
import { useAudioNotifications } from '../hooks/useAudioNotifications'
import { useTerminalSessions, type TerminalSession } from '../hooks/useTerminalSessions'
import { useChatInput } from '../hooks/useChatInput'
import { useTabDragDrop } from '../hooks/useTabDragDrop'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { playWithPriority, type AudioPriority } from '../utils/audioManager'
import '../styles/globals.css'

// Setup console forwarding to backend for Claude debugging
setupConsoleForwarding()

/**
 * SidePanelTerminal - Main Chrome extension side panel component
 *
 * This is the root component for the Tabz terminal sidebar. It orchestrates:
 * - Terminal session management (spawn, close, switch tabs)
 * - WebSocket connection to backend (port 8129)
 * - Profile management and working directory inheritance
 * - Claude Code status tracking and display
 * - Audio notifications for terminal events
 * - Tab drag-and-drop reordering
 * - Keyboard shortcuts and omnibox commands
 *
 * The component uses a hybrid state management approach:
 * - Chrome storage for UI state (sessions, profiles, settings)
 * - Tmux for process persistence (terminals survive sidebar close)
 * - Backend API for shared state (working directory sync)
 *
 * @returns The complete terminal sidebar UI
 */
function SidePanelTerminal() {
  const [wsConnected, setWsConnected] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editProfileId, setEditProfileId] = useState<string | null>(null)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [profileDropdownLeft, setProfileDropdownLeft] = useState<number | null>(null)
  const profileBtnRef = useRef<HTMLDivElement>(null)
  const [showEmptyStateDropdown, setShowEmptyStateDropdown] = useState(false)
  const [pasteCommand, setPasteCommand] = useState<string | null>(null)  // Command to paste from context menu
  const [showDirDropdown, setShowDirDropdown] = useState(false)
  const [customDirInput, setCustomDirInput] = useState('')
  const [isDark, setIsDark] = useState(true)  // Global dark/light mode toggle
  const audioUnlockedRef = useRef(false)  // Track if audio has been unlocked by user interaction

  // Tab tooltip state
  const [hoveredTab, setHoveredTab] = useState<{ id: string; rect: DOMRect } | null>(null)
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Unlock audio on first user interaction (Chrome autoplay policy workaround)
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return
      audioUnlockedRef.current = true
      // Create and play a silent audio to unlock playback
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA')
      silentAudio.volume = 0
      silentAudio.play().catch(() => {})  // Ignore errors
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
    }
    document.addEventListener('click', unlockAudio)
    document.addEventListener('keydown', unlockAudio)
    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  // Command history hook
  const commandHistoryHook = useCommandHistory()

  // Orphaned sessions (Ghost Badge feature)
  const {
    orphanedSessions,
    count: orphanedCount,
    isLoading: orphanedLoading,
    refresh: refreshOrphaned,
    reattachSessions,
    killSessions,
  } = useOrphanedSessions()
  const [showGhostDropdown, setShowGhostDropdown] = useState(false)
  const [selectedOrphans, setSelectedOrphans] = useState<Set<string>>(new Set())

  // Working directory hook - manages global working dir and recent dirs
  const {
    globalWorkingDir,
    setGlobalWorkingDir,
    recentDirs,
    setRecentDirs,
    addToRecentDirs,
  } = useWorkingDirectory()

  // Profiles hook - manages terminal profiles with category support
  // Note: categorySettings is loaded inside this hook, not passed as a dependency
  const {
    profiles,
    setProfiles,
    defaultProfileId,
    setDefaultProfileId,
    dropdownCollapsedCategories,
    toggleDropdownCategory,
    getGroupedProfilesForDropdown,
    getCategoryColor,
    getSessionCategoryColor,
    categorySettings,
    setCategorySettings,
  } = useProfiles({})

  // Placeholder for getNextAvailableVoice - will be provided by audio hook below
  const getNextAvailableVoiceRef = useRef<() => string>(() => 'en-US-AndrewMultilingualNeural')

  // Terminal sessions hook - manages sessions, storage sync, and WebSocket message handling
  const {
    sessions,
    setSessions,
    currentSession,
    setCurrentSession,
    storageLoaded,
    sessionsRef,
    currentSessionRef,
    connectionCount,
    handleWebSocketMessage,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    updateTerminalAppearance,
    resetTerminalAppearance,
  } = useTerminalSessions({
    wsConnected,
    profiles,
    getNextAvailableVoice: () => getNextAvailableVoiceRef.current(),
  })

  // Claude status tracking - polls for Claude Code status in each terminal
  // Only terminals with "claude" in their profile command or API command will be polled
  const { statuses: claudeStatuses, history: statusHistory } = useClaudeStatus(
    sessions.map(s => ({
      id: s.id,
      sessionName: s.sessionName,
      workingDir: s.workingDir,
      profileCommand: s.profile?.command || s.command,  // Check both profile and API command
    }))
  )

  // Audio notifications hook - handles audio settings, category settings, and status announcements
  // IMPORTANT: This must be after useTerminalSessions and useClaudeStatus so it receives real data
  const audioNotifications = useAudioNotifications({ sessions, claudeStatuses })
  const {
    audioSettings,
    audioGlobalMute,
    setAudioGlobalMute,
    getNextAvailableVoice,
    markSessionDetached,
  } = audioNotifications

  // Update the ref so useTerminalSessions can use it
  useEffect(() => {
    getNextAvailableVoiceRef.current = getNextAvailableVoice
  }, [getNextAvailableVoice])

  // Chat input hook - manages chat bar state and handlers
  const chatInput = useChatInput({
    sessions,
    currentSession,
    claudeStatuses,
    commandHistory: commandHistoryHook,
  })

  const portRef = useRef<chrome.runtime.Port | null>(null)
  const globalWorkingDirRef = useRef<string>('~')

  // Tab drag-and-drop hook - manages drag state and reordering
  const {
    draggedTabId,
    dragOverTabId,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDragLeave,
    handleTabDrop,
    handleTabDragEnd,
    handleEndZoneDragOver,
    handleEndZoneDrop,
  } = useTabDragDrop({ sessions, setSessions })

  // Switch to session - handles both selecting the tab and focusing 3D browser tab if needed
  const switchToSession = useCallback(async (sessionId: string) => {
    setCurrentSession(sessionId)

    // Find the session to check if it's in 3D mode
    const session = sessionsRef.current?.find(s => s.id === sessionId)
    if (session?.focusedIn3D && session.sessionName) {
      try {
        const tabs = await chrome.tabs.query({ url: `chrome-extension://${chrome.runtime.id}/3d/*` })
        const targetTab = tabs.find(tab => {
          const url = new URL(tab.url || '')
          return url.searchParams.get('session') === session.sessionName
        })
        if (targetTab?.id) {
          await chrome.tabs.update(targetTab.id, { active: true })
        }
      } catch (e) {
        console.warn('[switchToSession] Could not focus 3D tab:', e)
      }
    }
  }, [setCurrentSession, sessionsRef])

  // Keyboard shortcuts hook - handles keyboard and omnibox actions
  const {
    handleKeyboardNewTab,
    handleKeyboardCloseTab,
    handleKeyboardNextTab,
    handleKeyboardPrevTab,
    handleKeyboardSwitchTab,
    handleOmniboxSpawnProfile,
    handleOmniboxRunCommand,
  } = useKeyboardShortcuts({
    sessionsRef,
    currentSessionRef,
    globalWorkingDirRef,
    profiles,
    defaultProfileId,
    setCurrentSession,
    switchToSession,
    addToRecentDirs,
  })

  // Keep globalWorkingDir ref in sync with state (for keyboard handlers)
  useEffect(() => {
    globalWorkingDirRef.current = globalWorkingDir
  }, [globalWorkingDir])

  // Tab context menu state (for session management)
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    terminalId: string | null
  }>({ show: false, x: 0, y: 0, terminalId: null })

  // Customize popover state (opened from context menu)
  const [customizePopover, setCustomizePopover] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
    sessionId: string | null
  }>({ isOpen: false, position: { x: 0, y: 0 }, sessionId: null })

  useEffect(() => {
    // Connect to background worker via port for broadcasts
    const port = connectToBackground('sidepanel', (message) => {
      // ✅ Handle initial state sent immediately on connection
      if (message.type === 'INITIAL_STATE') {
        // Initial state received
        setWsConnected(message.wsConnected)
      } else if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
        // Terminal list will be requested via the wsConnected effect
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      } else if (message.type === 'WS_MESSAGE') {
        handleWebSocketMessage(message.data)
        // Refresh orphaned sessions immediately on terminal changes
        if (message.data?.type === 'terminal-spawned' || message.data?.type === 'terminal-closed') {
          refreshOrphaned()
        }
        // Play audio from /api/audio/speak endpoint (for slash commands, etc.)
        // Uses priority system: 'high' for summaries/handoffs, 'low' for status updates
        // Regenerates audio with user settings (rate, voice, pitch) for consistency
        if (message.data?.type === 'audio-speak' && message.data?.text) {
          const audioData = message.data // Capture in closure
          // Get user audio settings and regenerate with their preferences
          chrome.storage.local.get(['audioSettings'], async (result) => {
            const settings = result.audioSettings as {
              voice?: string; rate?: string; pitch?: string; volume?: number
            } || {}
            const priority: AudioPriority = audioData.priority === 'high' ? 'high' : 'low'

            try {
              // Regenerate audio with user's configured settings
              const response = await fetch('http://localhost:8129/api/audio/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: audioData.text,
                  voice: settings.voice || 'en-US-AndrewMultilingualNeural',
                  rate: settings.rate || '+0%',
                  pitch: settings.pitch || '+0Hz'
                })
              })
              const data = await response.json()

              if (data.success && data.url) {
                const volume = settings.volume ?? audioData.volume ?? 0.7
                playWithPriority(data.url, priority, volume)
              }
            } catch (err) {
              console.warn('[Audio] Failed to generate with user settings, using fallback:', err)
              // Fallback to pre-generated URL if regeneration fails
              if (audioData.url) {
                playWithPriority(audioData.url, priority, settings.volume ?? 0.7)
              }
            }
          })
        }
      } else if (message.type === 'TERMINAL_OUTPUT') {
        // Terminal component will handle this
      } else if (message.type === 'PASTE_COMMAND') {
        setPasteCommand(message.command)
        setTimeout(() => setPasteCommand(null), 100)
      } else if (message.type === 'KEYBOARD_NEW_TAB') {
        handleKeyboardNewTab()
      } else if (message.type === 'KEYBOARD_CLOSE_TAB') {
        handleKeyboardCloseTab()
      } else if (message.type === 'KEYBOARD_NEXT_TAB') {
        handleKeyboardNextTab()
      } else if (message.type === 'KEYBOARD_PREV_TAB') {
        handleKeyboardPrevTab()
      } else if (message.type === 'KEYBOARD_SWITCH_TAB') {
        handleKeyboardSwitchTab(message.tabIndex)
      } else if (message.type === 'OMNIBOX_SPAWN_PROFILE') {
        handleOmniboxSpawnProfile(message.profile)
      } else if (message.type === 'OMNIBOX_RUN_COMMAND') {
        handleOmniboxRunCommand(message.command)
      } else if (message.type === 'QUEUE_COMMAND') {
        chatInput.setChatInputText(message.command)
        chatInput.setChatInputMode('execute')
        setTimeout(() => chatInput.chatInputRef.current?.focus(), 100)
      } else if (message.type === 'OPEN_SETTINGS_EDIT_PROFILE') {
        // Open settings modal with specific profile to edit
        setEditProfileId(message.profileId)
        setIsSettingsOpen(true)
      } else if (message.type === 'SWITCH_TO_TERMINAL') {
        // Switch to a specific terminal tab (from dashboard click)
        const terminalId = (message as any).terminalId
        // Find session by id or sessionName (dashboard sends tmux session name)
        const targetSession = sessionsRef.current?.find(s =>
          s.id === terminalId || s.sessionName === terminalId
        )
        if (targetSession) {
          switchToSession(targetSession.id)
        }
      } else if (message.type === 'FOCUS_IN_3D') {
        // 3D Focus page opened/refreshed - mark terminal as in 3D mode
        setSessions(prev => prev.map(s =>
          s.id === message.terminalId ? { ...s, focusedIn3D: true } : s
        ))
      } else if (message.type === 'RETURN_FROM_3D') {
        // 3D Focus page closed - return terminal to sidebar
        setSessions(prev => prev.map(s =>
          s.id === message.terminalId ? { ...s, focusedIn3D: false } : s
        ))
      }
    })

    portRef.current = port

    // Cleanup
    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [])

  // Auto-reconnect on visibility change (e.g., after laptop sleep/wake)
  // When sidebar becomes visible again, request terminal list to verify connection
  // This triggers background worker to reconnect WebSocket if needed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Sidepanel] Visibility changed to visible, requesting terminal list')
        // Request terminal list - this will reconnect WebSocket if disconnected
        sendMessage({ type: 'LIST_TERMINALS' })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Close tab context menu on outside click
  useEffect(() => {
    if (!contextMenu.show) return

    const handleClick = () => {
      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [contextMenu.show])

  // Load dark mode preference from Chrome storage
  useEffect(() => {
    chrome.storage.local.get(['isDark'], (result) => {
      if (typeof result.isDark === 'boolean') {
        setIsDark(result.isDark)
      }
    })
  }, [])

  // Save dark mode preference when it changes
  useEffect(() => {
    chrome.storage.local.set({ isDark })
  }, [isDark])

  // Close dir dropdown when clicking outside
  useEffect(() => {
    if (!showDirDropdown) return
    const handleClick = () => setShowDirDropdown(false)
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showDirDropdown])

  // Close ghost dropdown when clicking outside
  useEffect(() => {
    if (!showGhostDropdown) return
    const handleClick = () => {
      setShowGhostDropdown(false)
      setSelectedOrphans(new Set())
    }
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showGhostDropdown])

  // Close profile dropdown when clicking outside
  useEffect(() => {
    if (!showProfileDropdown) return

    const handleClick = () => {
      setShowProfileDropdown(false)
    }

    // Add small delay to prevent immediate closing when opening
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showProfileDropdown])

  // Close empty state dropdown when clicking outside
  useEffect(() => {
    if (!showEmptyStateDropdown) return

    const handleClick = () => {
      setShowEmptyStateDropdown(false)
    }

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showEmptyStateDropdown])

  const handleSpawnTerminal = () => {
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
      name: 'Bash',
    })
  }

  const handleSpawnDefaultProfile = () => {
    // Read profiles AND globalWorkingDir together from storage to avoid race conditions
    // This ensures we use the saved header value even if React state hasn't loaded yet
    chrome.storage.local.get(['profiles', 'defaultProfile', 'globalWorkingDir'], (result) => {
      // Use stored value, fall back to React state, then default
      const currentGlobalWorkingDir = (result.globalWorkingDir as string) || globalWorkingDir || '~'

      const profiles = (result.profiles as Profile[]) || []
      const savedDefaultId = (result.defaultProfile as string) || 'default'

      // Validate defaultProfile - ensure it matches an existing profile ID
      const profileIds = profiles.map(p => p.id)
      let defaultProfileId = savedDefaultId
      if (!profileIds.includes(savedDefaultId) && profiles.length > 0) {
        defaultProfileId = profiles[0].id
        console.warn(`[SpawnDefault] defaultProfile '${savedDefaultId}' not found, auto-fixing to '${defaultProfileId}'`)
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
        // Fallback to regular bash if no profiles exist at all
        sendMessage({
          type: 'SPAWN_TERMINAL',
          spawnOption: 'bash',
          name: 'Bash',
          workingDir: currentGlobalWorkingDir,
        })
      }
    })
  }

  const handleSpawnProfile = (profile: Profile) => {
    // Read globalWorkingDir from storage to avoid race condition where React state hasn't loaded yet
    chrome.storage.local.get(['globalWorkingDir'], (result) => {
      const currentGlobalWorkingDir = (result.globalWorkingDir as string) || globalWorkingDir || '~'

      const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, currentGlobalWorkingDir)
      sendMessage({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: profile.name,
        workingDir: effectiveWorkingDir,
        command: profile.command,
        profile: { ...profile, workingDir: effectiveWorkingDir },
        isDark, // Pass global dark/light mode to backend for COLORFGBG env var
      })
      addToRecentDirs(effectiveWorkingDir)
    })
    setShowProfileDropdown(false)
    setShowEmptyStateDropdown(false)
  }

  const handleCloseTab = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation() // Prevent tab selection when clicking X
    sendMessage({
      type: 'CLOSE_TERMINAL',
      terminalId,
    })
    // If closing current tab, switch to another one
    if (terminalId === currentSession && sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === terminalId)
      const nextSession = sessions[currentIndex === 0 ? 1 : currentIndex - 1]
      setCurrentSession(nextSession.id)
    }
  }

  // Handle right-click on tab (session-level operations)
  const handleTabContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      terminalId
    })
  }

  // Handle "Rename Tab" from tab menu
  const handleContextRename = () => {
    if (!contextMenu.terminalId) return
    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal) return

    // TODO: Add rename dialog (Phase 2)
    const newName = prompt('Enter new name:', terminal.name)
    if (newName) {
      // Update local session name
      setSessions(prev => prev.map(s =>
        s.id === terminal.id ? { ...s, name: newName } : s
      ))
    }

    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle "Detach Session" from tab menu
  // Removes from registry (so it becomes an orphan) but keeps tmux session alive
  const handleDetachSession = async () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal) return

    try {
      // Mark as detached BEFORE fetch - backend broadcasts terminal-closed immediately
      // and the audio hook needs to know it's a detach before that message arrives
      markSessionDetached(terminal.id)

      // Use DELETE /api/agents/:id?force=false to remove from registry but preserve tmux session
      // This makes the session appear as "orphaned" in the Ghost Badge
      const response = await fetch(`http://localhost:8129/api/agents/${terminal.id}?force=false`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        // Update local state immediately for responsiveness
        setSessions(prev => prev.filter(s => s.id !== terminal.id))
        if (currentSession === terminal.id) {
          const remaining = sessions.filter(s => s.id !== terminal.id)
          setCurrentSession(remaining[0]?.id || null)
        }
        // Refresh orphaned sessions so ghost badge appears immediately
        refreshOrphaned()
      } else {
        console.error('[handleDetachSession] Failed to detach:', data.error)
      }

      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    } catch (error) {
      console.error('[handleDetachSession] Error:', error)
    }
  }

  // Handle "Kill Session" from tab menu
  const handleKillSession = async () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal?.sessionName) return

    try {
      const response = await fetch(`http://localhost:8129/api/tmux/sessions/${terminal.sessionName}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        // Remove from UI and session is destroyed
        setSessions(prev => prev.filter(s => s.id !== terminal.id))
        if (currentSession === terminal.id) {
          setCurrentSession(sessions[0]?.id || null)
        }
      } else {
        console.error('[handleKillSession] Failed to kill:', data.error)
      }

      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    } catch (error) {
      console.error('[handleKillSession] Error:', error)
    }
  }

  // Handle "View as Text" from tab menu
  // Captures terminal content and opens it in the dashboard
  const handleViewAsText = async () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal?.sessionName) return

    try {
      // Capture terminal content from backend
      const response = await fetch(`http://localhost:8129/api/tmux/sessions/${terminal.sessionName}/capture`)
      const result = await response.json()

      if (!result.success) {
        console.error('[handleViewAsText] Failed to capture:', result.error)
        return
      }

      // Generate unique ID and store in localStorage
      const captureId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem(`tabz-capture-${captureId}`, JSON.stringify(result.data))

      // Open dashboard with capture parameter
      const dashboardUrl = chrome.runtime.getURL(`dashboard/index.html?capture=${captureId}`)
      window.open(dashboardUrl, '_blank')

      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    } catch (error) {
      console.error('[handleViewAsText] Error:', error)
    }
  }

  // Handle "Open in 3D Focus" from tab menu
  const handleOpenIn3D = () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal?.sessionName) return

    // Mark session as focused in 3D (sidebar will show placeholder instead of terminal)
    setSessions(prev => prev.map(s =>
      s.id === terminal.id ? { ...s, focusedIn3D: true } : s
    ))

    // Look up CURRENT profile settings (not stale snapshot from spawn time)
    // This ensures theme/font changes made after spawning are respected
    const sessionProfileId = terminal.profile?.id
    const currentProfile = sessionProfileId
      ? profiles.find(p => p.id === sessionProfileId)
      : null
    const defaultProfile = profiles.find(p => p.id === 'default') || profiles[0]
    const effectiveProfile = currentProfile || defaultProfile

    // Open new browser tab with 3D focus page
    const themeName = effectiveProfile?.themeName || 'high-contrast'
    const fontSize = effectiveProfile?.fontSize || 16
    const fontFamily = encodeURIComponent(effectiveProfile?.fontFamily || 'monospace')
    const url = chrome.runtime.getURL(`3d/3d-focus.html?session=${terminal.sessionName}&id=${terminal.id}&theme=${themeName}&fontSize=${fontSize}&fontFamily=${fontFamily}`)
    chrome.tabs.create({ url })

    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle "Return from 3D Focus" - bring terminal back to sidebar
  const handleReturnFrom3D = async (terminalId: string) => {
    // Find and close the 3D tab to prevent dual connections
    const session = sessions.find(s => s.id === terminalId)
    if (session?.sessionName) {
      try {
        const tabs = await chrome.tabs.query({ url: `chrome-extension://${chrome.runtime.id}/3d/*` })
        for (const tab of tabs) {
          if (tab.url?.includes(`session=${session.sessionName}`)) {
            chrome.tabs.remove(tab.id!)
          }
        }
      } catch (e) {
        console.warn('[handleReturnFrom3D] Could not close 3D tab:', e)
      }
    }

    setSessions(prev => prev.map(s =>
      s.id === terminalId ? { ...s, focusedIn3D: false } : s
    ))
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-foreground">
      {/* Header - Windows Terminal style */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-gradient-to-r from-[#0f0f0f] to-[#1a1a1a]">
        {/* Left: Title */}
        <div className="flex items-center gap-2">
          <img
            src="/icons/tabz-logo-light.png"
            alt="Tabz"
            className="h-8"
          />
          <h1 className="text-sm font-semibold text-white">Tabz</h1>
          {sessions.length > 0 && (
            <Badge variant="secondary" className="text-xs bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30">
              {sessions.length}
            </Badge>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Connection Status */}
          {wsConnected ? (
            <Badge variant="secondary" className="text-xs bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30">
              Connected
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="text-xs bg-red-500/20 text-red-500 border-red-500/30 cursor-pointer hover:bg-red-500/30 transition-colors"
              onClick={async () => {
                await navigator.clipboard.writeText('./scripts/dev.sh')
                // Brief visual feedback - badge text changes temporarily
                const badge = document.querySelector('[data-disconnected-badge]') as HTMLElement
                if (badge) {
                  badge.textContent = 'Copied!'
                  setTimeout(() => { badge.textContent = 'Disconnected' }, 1500)
                }
              }}
              title="Click to copy: ./scripts/dev.sh (runs backend in tmux)"
              data-disconnected-badge
            >
              Disconnected
            </Badge>
          )}

          {/* Ghost Badge - Orphaned Sessions */}
          {wsConnected && (
            <GhostBadgeDropdown
              orphanedSessions={orphanedSessions}
              orphanedCount={orphanedCount}
              isLoading={orphanedLoading}
              selectedOrphans={selectedOrphans}
              setSelectedOrphans={setSelectedOrphans}
              showDropdown={showGhostDropdown}
              setShowDropdown={setShowGhostDropdown}
              onRefresh={refreshOrphaned}
              onReattach={reattachSessions}
              onKill={killSessions}
            />
          )}

          {/* Dark/Light Mode Toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            className={`p-1.5 rounded-md transition-colors ${
              isDark
                ? 'hover:bg-[#00ff88]/10 text-gray-400 hover:text-[#00ff88]'
                : 'hover:bg-orange-500/10 text-gray-400 hover:text-orange-400'
            }`}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {/* Working Directory Dropdown */}
          <WorkingDirDropdown
            globalWorkingDir={globalWorkingDir}
            setGlobalWorkingDir={setGlobalWorkingDir}
            recentDirs={recentDirs}
            setRecentDirs={setRecentDirs}
            addToRecentDirs={addToRecentDirs}
            customDirInput={customDirInput}
            setCustomDirInput={setCustomDirInput}
            showDropdown={showDirDropdown}
            setShowDropdown={setShowDirDropdown}
          />

          {/* Dashboard Button */}
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/index.html') })}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Open Dashboard"
            aria-label="Open Dashboard"
          >
            <LayoutDashboard className="h-4 w-4" />
          </button>

          {/* Keyboard Shortcuts Button */}
          <button
            onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Keyboard Shortcuts"
            aria-label="Configure keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </button>

          {/* Audio Mute Toggle */}
          <button
            onClick={() => setAudioGlobalMute(!audioGlobalMute)}
            className={`p-1.5 rounded-md transition-colors ${
              audioGlobalMute
                ? 'text-gray-500 hover:bg-white/5 hover:text-gray-400'
                : audioSettings.enabled
                  ? 'text-[#00ff88] hover:bg-[#00ff88]/10'
                  : 'text-gray-400 hover:bg-[#00ff88]/10 hover:text-[#00ff88]'
            }`}
            title={audioGlobalMute ? 'Audio muted (click to unmute)' : 'Audio enabled (click to mute)'}
            aria-label={audioGlobalMute ? 'Unmute audio notifications' : 'Mute audio notifications'}
            aria-pressed={!audioGlobalMute}
          >
            {audioGlobalMute ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {/* Refresh Sidebar Button */}
          <button
            onClick={() => window.location.reload()}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Refresh sidebar"
            aria-label="Refresh sidebar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Settings"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Multi-window warning banner */}
      {connectionCount > 1 && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
          <span className="font-medium">⚠️ Tabz open in {connectionCount} browser windows</span>
          <span className="text-amber-500/60">— terminals may show duplicate output</span>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Terminals Panel */}
        <div className="h-full flex flex-col">
          {/* Session Tabs */}
          {sessions.length > 0 && (
            <div className="relative border-b bg-gradient-to-r from-[#0f0f0f]/50 to-[#1a1a1a]/50">
              <div className="flex items-center gap-1 p-2">
                {/* Scrollable tabs area */}
                <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
                {sessions.map(session => {
                  const categoryColor = getSessionCategoryColor(session, categorySettings)
                  const isSelected = currentSession === session.id

                  return (
                  <div
                    key={session.id}
                    draggable
                    onDragStart={(e) => handleTabDragStart(e, session.id)}
                    onDragOver={(e) => handleTabDragOver(e, session.id)}
                    onDragLeave={handleTabDragLeave}
                    onDrop={(e) => handleTabDrop(e, session.id)}
                    onDragEnd={handleTabDragEnd}
                    className={`
                      flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer group
                      min-w-[120px] max-w-[320px] flex-1
                      ${isSelected
                        ? categoryColor
                          ? 'border'  // Use inline styles for category color
                          : 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-300 border border-transparent'
                      }
                      ${draggedTabId === session.id ? 'opacity-50' : ''}
                      ${dragOverTabId === session.id ? 'border-l-2 border-l-[#00ff88]' : ''}
                    `}
                    style={isSelected && categoryColor ? {
                      backgroundColor: `${categoryColor}20`,  // 20 = ~12% opacity in hex
                      color: 'white',  // White text works on all category colors
                      borderColor: `${categoryColor}60`,  // 60 = ~37% opacity in hex
                    } : undefined}
                    onClick={() => switchToSession(session.id)}
                    onContextMenu={(e) => handleTabContextMenu(e, session.id)}
                    onMouseEnter={(e) => {
                      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
                      const rect = e.currentTarget.getBoundingClientRect()  // Capture rect immediately
                      tooltipTimeoutRef.current = setTimeout(() => {
                        setHoveredTab({ id: session.id, rect })
                      }, 400)  // Small delay before showing tooltip
                    }}
                    onMouseLeave={() => {
                      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
                      // Delay hiding so user can move mouse to tooltip
                      tooltipTimeoutRef.current = setTimeout(() => {
                        setHoveredTab(null)
                      }, 150)
                    }}
                  >
                    {/* Tab content: show Claude status if detected, otherwise session name */}
                    {/* Using consistent structure to prevent DOM thrashing */}
                    {/* Robot emojis multiply based on active subagent count: 🤖🤖🤖 */}
                    <span className="flex-1 flex items-center gap-1 text-xs min-w-0 overflow-hidden">
                      {claudeStatuses.has(session.id) && (
                        <span className="flex-shrink-0">{getRobotEmojis(claudeStatuses.get(session.id))}</span>
                      )}
                      <span className="flex-1 min-w-0 truncate flex items-center gap-0.5">
                        {claudeStatuses.has(session.id) ? (
                          <>
                            {/* Checkmark in green for ready state, other emojis in default color */}
                            {(claudeStatuses.get(session.id)?.status === 'idle' || claudeStatuses.get(session.id)?.status === 'awaiting_input') ? (
                              <>
                                <span style={{ color: '#00ff88' }}>✓</span>
                                <span>{session.profile?.name || session.name}</span>
                              </>
                            ) : (
                              <span style={{ color: getStatusColor(claudeStatuses.get(session.id)) || undefined }}>
                                {getStatusText(claudeStatuses.get(session.id), session.profile?.name || session.name)}
                              </span>
                            )}
                          </>
                        ) : (
                          session.name
                        )}
                      </span>
                      {/* Context window percentage - far right, color-coded */}
                      {claudeStatuses.get(session.id)?.context_pct != null && (
                        <span
                          className="flex-shrink-0 ml-auto text-xs font-medium"
                          style={{ color: getContextColor(claudeStatuses.get(session.id)?.context_pct) }}
                        >
                          {claudeStatuses.get(session.id)?.context_pct}%
                        </span>
                      )}
                    </span>
                    <button
                      onClick={(e) => handleCloseTab(e, session.id)}
                      className="flex-shrink-0 ml-1 p-0.5 rounded hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                      title="Close tab"
                      aria-label={`Close ${session.name} terminal`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  )
                })}
                {/* End drop zone - for dropping tab at the end */}
                {draggedTabId && (
                  <div
                    onDragOver={handleEndZoneDragOver}
                    onDragLeave={handleTabDragLeave}
                    onDrop={handleEndZoneDrop}
                    className={`
                      flex items-center justify-center px-2 py-1.5 rounded-md transition-all
                      ${dragOverTabId === '__end__' ? 'bg-[#00ff88]/20 border-2 border-dashed border-[#00ff88]' : 'bg-white/5 border-2 border-dashed border-gray-600'}
                    `}
                  >
                    <span className="text-xs text-gray-500">Drop here</span>
                  </div>
                )}
                </div>
                {/* Quick Add Button with Profile Dropdown - Fixed position outside scrollable area */}
                <div className="relative flex flex-shrink-0" ref={profileBtnRef}>
                  <button
                    onClick={handleSpawnDefaultProfile}
                    className="flex items-center justify-center px-2 py-1.5 rounded-l-md text-sm font-medium transition-all bg-white/5 hover:bg-[#00ff88]/10 text-gray-400 hover:text-[#00ff88] border border-transparent hover:border-[#00ff88]/30"
                    title="New tab (default profile)"
                    aria-label="Create new terminal tab with default profile"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Calculate button position for dropdown alignment
                      if (profileBtnRef.current) {
                        const rect = profileBtnRef.current.getBoundingClientRect()
                        setProfileDropdownLeft(rect.left)
                      }
                      setShowProfileDropdown(!showProfileDropdown)
                    }}
                    className="flex items-center justify-center px-1 py-1.5 rounded-r-md text-sm font-medium transition-all bg-white/5 hover:bg-[#00ff88]/10 text-gray-400 hover:text-[#00ff88] border-l border-gray-700"
                    title="Select profile"
                    aria-label="Select profile to spawn"
                    aria-expanded={showProfileDropdown}
                    aria-haspopup="menu"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Profile Dropdown Menu - Aligned to right edge, with collapsible categories */}
              {showProfileDropdown && profiles.length > 0 && (
                <ProfileDropdown
                  groupedProfiles={getGroupedProfilesForDropdown()}
                  collapsedCategories={dropdownCollapsedCategories}
                  onToggleCategory={toggleDropdownCategory}
                  onSpawnProfile={handleSpawnProfile}
                  getCategoryColor={getCategoryColor}
                  defaultProfileId={defaultProfileId}
                  className="absolute top-full right-2 mt-1 z-50"
                  onClose={() => setShowProfileDropdown(false)}
                />
              )}
            </div>
          )}

          {/* Terminal View */}
          <div className="flex-1 relative min-h-0">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center h-full text-gray-400 pt-8 overflow-y-auto">
                {/* Tabz Logo */}
                <img
                  src="/icons/tabz-logo-light.png"
                  alt="Tabz"
                  className="h-20 mb-3 opacity-80"
                />
                <h2 className="text-xl font-semibold text-white/80 mb-6">Tabz Terminal</h2>

                {wsConnected ? (
                  <>
                    <p className="text-sm text-gray-500 mb-4">Select a profile to get started</p>
                    <div className="relative flex">
                      <button
                        onClick={handleSpawnDefaultProfile}
                        className="px-4 py-2 bg-gradient-to-r from-[#00ff88] to-[#00c8ff] text-black rounded-l-md hover:opacity-90 transition-opacity font-medium flex items-center"
                        aria-label="Create new terminal with default profile"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Terminal
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowEmptyStateDropdown(!showEmptyStateDropdown)
                        }}
                        className="px-2 py-2 bg-gradient-to-r from-[#00c8ff] to-[#00a8ff] text-black rounded-r-md hover:opacity-90 transition-opacity font-medium border-l border-black/20"
                        title="Select profile"
                        aria-label="Select profile to spawn"
                        aria-expanded={showEmptyStateDropdown}
                        aria-haspopup="menu"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      {/* Profile Dropdown - with collapsible categories */}
                      {showEmptyStateDropdown && profiles.length > 0 && (
                        <ProfileDropdown
                          groupedProfiles={getGroupedProfilesForDropdown()}
                          collapsedCategories={dropdownCollapsedCategories}
                          onToggleCategory={toggleDropdownCategory}
                          onSpawnProfile={handleSpawnProfile}
                          getCategoryColor={getCategoryColor}
                          defaultProfileId={defaultProfileId}
                          className="absolute top-full left-0 mt-1 z-50"
                          onClose={() => setShowEmptyStateDropdown(false)}
                        />
                      )}
                    </div>

                    {/* GitHub Link */}
                    <a
                      href="https://github.com/GGPrompts/TabzChrome"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-8 text-xs text-gray-500 hover:text-[#00ff88] transition-colors flex items-center gap-1.5"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      Documentation & Source
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">Backend not running</p>
                    <p className="text-sm mb-4 text-center px-4">Start the backend server to use terminals</p>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText('./scripts/dev.sh')
                        // Visual feedback
                        const btn = document.querySelector('[data-copy-start-btn]') as HTMLElement
                        if (btn) {
                          btn.textContent = '✓ Copied!'
                          setTimeout(() => { btn.innerHTML = '<span class="inline-block mr-2">📋</span>Copy Start Command' }, 1500)
                        }
                      }}
                      data-copy-start-btn
                      className="px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-md hover:opacity-90 transition-opacity font-medium"
                    >
                      <span className="inline-block mr-2">📋</span>
                      Copy Start Command
                    </button>
                    <p className="text-xs mt-3 text-gray-500 font-mono">./scripts/dev.sh</p>
                    <p className="text-xs mt-1 text-gray-600">or: cd backend && npm start</p>

                    {/* GitHub Link */}
                    <a
                      href="https://github.com/GGPrompts/TabzChrome"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-8 text-xs text-gray-500 hover:text-[#00ff88] transition-colors flex items-center gap-1.5"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      Documentation & Source
                    </a>
                  </>
                )}
              </div>
            ) : (
              <div className="h-full relative">
                {sessions.map(session => {
                  // Get the CURRENT profile settings (not the snapshot from spawn time)
                  // This allows theme/font changes to affect existing terminals
                  const sessionProfileId = session.profile?.id
                  const currentProfile = sessionProfileId
                    ? profiles.find(p => p.id === sessionProfileId)
                    : null

                  // Fallback chain: current profile (if exists) -> default profile -> hardcoded defaults
                  const defaultProfileId = profiles.find(p => p.id === 'default') ? 'default' : profiles[0]?.id
                  const defaultProfile = profiles.find(p => p.id === defaultProfileId)
                  const effectiveProfile = currentProfile || defaultProfile

                  return (
                  <div
                    key={session.id}
                    style={{
                      // Use visibility instead of display:none so terminals always have dimensions
                      // This allows ResizeObserver to work and prevents "need to click to draw" issues
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      visibility: session.id === currentSession ? 'visible' : 'hidden',
                      zIndex: session.id === currentSession ? 1 : 0,
                    }}
                  >
                    {session.focusedIn3D ? (
                      // Show placeholder when terminal is being viewed in 3D Focus mode
                      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] to-[#1a1a2e] text-center px-8">
                        <div className="text-6xl mb-4">🧊</div>
                        <h2 className="text-xl font-semibold text-[#00ffff] mb-2">Focusing in 3D</h2>
                        <p className="text-sm text-gray-400 mb-6">
                          This terminal is currently open in 3D Focus mode
                        </p>
                        <button
                          onClick={() => handleReturnFrom3D(session.id)}
                          className="px-4 py-2 bg-[#00ffff]/20 hover:bg-[#00ffff]/30 text-[#00ffff] border border-[#00ffff]/50 rounded-md transition-colors"
                        >
                          Return to Sidebar
                        </button>
                        <p className="text-xs text-gray-500 mt-4">
                          Status and audio notifications still active
                        </p>
                      </div>
                    ) : (
                        <Terminal
                          terminalId={session.id}
                          sessionName={session.name}
                          terminalType={session.type}
                          workingDir={session.workingDir || effectiveProfile?.workingDir}
                          tmuxSession={session.sessionName}
                          fontSize={effectiveProfile?.fontSize || 16}
                          fontFamily={session.appearanceOverrides?.fontFamily || effectiveProfile?.fontFamily || 'monospace'}
                          themeName={session.appearanceOverrides?.themeName || effectiveProfile?.themeName || 'high-contrast'}
                          isDark={isDark}
                          isActive={session.id === currentSession}
                          pasteCommand={session.id === currentSession ? pasteCommand : null}
                          fontSizeOffset={session.fontSizeOffset}
                          onIncreaseFontSize={() => increaseFontSize(session.id)}
                          onDecreaseFontSize={() => decreaseFontSize(session.id)}
                          onResetFontSize={() => resetFontSize(session.id)}
                          backgroundGradient={session.appearanceOverrides?.backgroundGradient ?? effectiveProfile?.backgroundGradient}
                          panelColor={session.appearanceOverrides?.panelColor ?? effectiveProfile?.panelColor ?? '#000000'}
                          transparency={session.appearanceOverrides?.transparency ?? effectiveProfile?.transparency ?? 100}
                          onClose={() => {
                            sendMessage({
                              type: 'CLOSE_TERMINAL',
                              terminalId: session.id,
                            })
                          }}
                        />
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Chat Input Bar - Multi-send with target selection */}
          {sessions.length > 0 && (
            <ChatInputBar
              chatInput={chatInput}
              commandHistory={{
                history: commandHistoryHook.history,
                removeFromHistory: commandHistoryHook.removeFromHistory,
              }}
              sessions={sessions}
              claudeStatuses={claudeStatuses}
              getStatusEmoji={getStatusEmoji}
              getStatusText={getStatusText}
              getFullStatusText={getFullStatusText}
            />
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false)
          setEditProfileId(null)  // Clear edit profile ID on close
        }}
        editProfileId={editProfileId}
      />

      {/* Tab Context Menu */}
      <SessionContextMenu
        show={contextMenu.show}
        x={contextMenu.x}
        y={contextMenu.y}
        terminal={sessions.find(t => t.id === contextMenu.terminalId) || null}
        onCustomize={() => {
          if (contextMenu.terminalId) {
            setCustomizePopover({
              isOpen: true,
              position: { x: contextMenu.x, y: contextMenu.y },
              sessionId: contextMenu.terminalId,
            })
          }
        }}
        onEditProfile={() => {
          const terminal = sessions.find(t => t.id === contextMenu.terminalId)
          // Use terminal's profile ID, or fall back to default profile
          const profileId = terminal?.profile?.id || defaultProfileId || 'default'
          setEditProfileId(profileId)
          setIsSettingsOpen(true)
        }}
        onOpenReference={(() => {
          const terminal = sessions.find(t => t.id === contextMenu.terminalId)
          const reference = terminal?.profile?.reference
          if (!reference) return undefined
          return () => {
            if (reference.startsWith('http://') || reference.startsWith('https://')) {
              // Open URL in new Chrome tab
              chrome.tabs.create({ url: reference })
            } else {
              // Open file in dashboard Files section
              const dashboardUrl = chrome.runtime.getURL(`dashboard/index.html#/files?path=${encodeURIComponent(reference)}`)
              chrome.tabs.create({ url: dashboardUrl })
            }
          }
        })()}
        onRename={handleContextRename}
        onCopyId={() => {
          const terminal = sessions.find(t => t.id === contextMenu.terminalId)
          const sessionId = terminal?.sessionName || terminal?.id
          if (sessionId) {
            navigator.clipboard.writeText(sessionId)
          }
        }}
        onViewAsText={handleViewAsText}
        onDetach={handleDetachSession}
        onKill={handleKillSession}
        onOpenIn3D={handleOpenIn3D}
        onClose={() => setContextMenu({ show: false, x: 0, y: 0, terminalId: null })}
      />

      {/* Customize Popover (opened from context menu) */}
      {customizePopover.sessionId && (() => {
        const session = sessions.find(s => s.id === customizePopover.sessionId)
        if (!session) return null
        const effectiveProfile = session.profile || profiles.find(p => p.id === 'default') || profiles[0]
        return (
          <TerminalCustomizePopover
            sessionId={customizePopover.sessionId}
            isOpen={customizePopover.isOpen}
            position={customizePopover.position}
            currentOverrides={session.appearanceOverrides}
            profileDefaults={{
              themeName: effectiveProfile?.themeName,
              backgroundGradient: effectiveProfile?.backgroundGradient,
              panelColor: effectiveProfile?.panelColor,
              transparency: effectiveProfile?.transparency,
              fontSize: effectiveProfile?.fontSize,
              fontFamily: effectiveProfile?.fontFamily,
            }}
            isDark={isDark}
            fontSizeOffset={session.fontSizeOffset}
            onUpdate={updateTerminalAppearance}
            onReset={resetTerminalAppearance}
            onIncreaseFontSize={() => increaseFontSize(customizePopover.sessionId!)}
            onDecreaseFontSize={() => decreaseFontSize(customizePopover.sessionId!)}
            onResetFontSize={() => resetFontSize(customizePopover.sessionId!)}
            onClose={() => setCustomizePopover({ isOpen: false, position: { x: 0, y: 0 }, sessionId: null })}
          />
        )
      })()}

      {/* Tab Tooltip - styled hover info */}
      {hoveredTab && (() => {
        const session = sessions.find(s => s.id === hoveredTab.id)
        if (!session) return null
        const claudeStatus = claudeStatuses.get(session.id)
        const history = statusHistory.get(session.id) || []
        const rawWorkingDir = session.workingDir || session.profile?.workingDir || globalWorkingDir
        // Replace /home/<username> with ~ for cleaner display
        const workingDir = rawWorkingDir?.replace(/^\/home\/[^/]+/, '~')

        // Helper to format relative time
        const formatRelativeTime = (timestamp: number) => {
          const seconds = Math.floor((Date.now() - timestamp) / 1000)
          if (seconds < 60) return `${seconds}s ago`
          const minutes = Math.floor(seconds / 60)
          if (minutes < 60) return `${minutes}m ago`
          return `${Math.floor(minutes / 60)}h ago`
        }

        // Helper to replace /home/username with ~
        const shortenPath = (text: string) => text.replace(/\/home\/[^/]+/g, '~')

        return (
          <div
            className="fixed z-50 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              left: Math.min(hoveredTab.rect.left, window.innerWidth - 470),
              top: hoveredTab.rect.bottom + 8,
            }}
            onMouseEnter={() => {
              // Cancel any pending hide when mouse enters tooltip
              if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
            }}
            onMouseLeave={() => {
              // Hide tooltip when mouse leaves it
              if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
              setHoveredTab(null)
            }}
          >
            <div className="bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl px-4 py-3 min-w-[320px] max-w-[450px]">
              {/* Start Command or $ */}
              <div className="text-[14px] font-mono text-gray-300 mb-2">
                <span className="text-[#00ff88]">$</span> {session.command || session.profile?.command || 'bash'}
              </div>

              {/* Working Directory - truncate from start to show end of path */}
              {workingDir && (
                <div className="flex items-center gap-2 mb-2 overflow-hidden">
                  <span className="text-[#00ff88] text-sm flex-shrink-0">📁</span>
                  <span
                    className="text-[13px] text-[#00ff88] font-mono truncate"
                    title={rawWorkingDir}
                  >
                    {workingDir.length > 40 ? '…' + workingDir.slice(-39) : workingDir}
                  </span>
                </div>
              )}

              {/* Claude Status (if present) */}
              {claudeStatus && (
                <div className="flex items-center gap-2 pt-2 border-t border-[#333] overflow-hidden">
                  <span className="text-sm flex-shrink-0">{getRobotEmojis(claudeStatus)}</span>
                  <span className="text-[13px] text-gray-300 truncate min-w-0" title={getFullStatusText(claudeStatus)}>
                    {getFullStatusText(claudeStatus)}
                  </span>
                  {claudeStatus.context_pct != null && (
                    <span
                      className="text-[12px] font-medium ml-auto"
                      style={{ color: getContextColor(claudeStatus.context_pct) }}
                    >
                      {claudeStatus.context_pct}%
                    </span>
                  )}
                </div>
              )}

              {/* Status History */}
              {history.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#333]">
                  <div className="text-[11px] text-[#00ff88]/60 mb-1.5">Recent activity</div>
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {history.map((entry, i) => (
                      <div key={i} className="flex items-start gap-2 text-[12px]">
                        <span className="text-gray-300 flex-1 line-clamp-2">{shortenPath(entry.text)}</span>
                        <span className="text-[#00ff88]/50 text-[10px] flex-shrink-0 pt-0.5">
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// Import ErrorBoundary for graceful error handling
import { ErrorBoundary } from '../components/ErrorBoundary'

// Mount the sidepanel with error boundary wrapper
ReactDOM.createRoot(document.getElementById('sidepanel-root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[SidePanel] Uncaught error:', error.message)
        console.error('[SidePanel] Component stack:', errorInfo.componentStack)
      }}
    >
      <SidePanelTerminal />
    </ErrorBoundary>
  </React.StrictMode>
)
