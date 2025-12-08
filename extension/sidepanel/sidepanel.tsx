import React, { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { Terminal as TerminalIcon, Settings, Plus, X, ChevronDown, FolderOpen, Moon, Sun, History } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Terminal } from '../components/Terminal'
import { SettingsModal, type Profile } from '../components/SettingsModal'
import { connectToBackground, sendMessage } from '../shared/messaging'
import { getLocal, setLocal } from '../shared/storage'
import { useClaudeStatus, getStatusEmoji, getStatusText, getFullStatusText } from '../hooks/useClaudeStatus'
import { useCommandHistory } from '../hooks/useCommandHistory'
import '../styles/globals.css'

interface TerminalSession {
  id: string
  name: string
  type: string
  active: boolean
  sessionName?: string  // Tmux session name (only for tmux-based terminals)
  workingDir?: string   // Working directory for Claude status polling
  profile?: Profile     // Profile settings for this terminal
}

function SidePanelTerminal() {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [profileDropdownLeft, setProfileDropdownLeft] = useState<number | null>(null)
  const profileBtnRef = useRef<HTMLDivElement>(null)
  const [showEmptyStateDropdown, setShowEmptyStateDropdown] = useState(false)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [pasteCommand, setPasteCommand] = useState<string | null>(null)  // Command to paste from context menu
  const [globalWorkingDir, setGlobalWorkingDir] = useState<string>('~')  // Global working dir for profiles without one
  const [recentDirs, setRecentDirs] = useState<string[]>(['~', '~/projects'])  // Recent directories
  const [showDirDropdown, setShowDirDropdown] = useState(false)
  const [customDirInput, setCustomDirInput] = useState('')
  const [isDark, setIsDark] = useState(true)  // Global dark/light mode toggle
  const [connectionCount, setConnectionCount] = useState(1)  // Track backend connections (for multi-window warning)
  const [storageLoaded, setStorageLoaded] = useState(false)  // Track if Chrome storage has been loaded (prevents race condition)

  // Chat input state (paste workaround)
  const [chatInputText, setChatInputText] = useState('')
  const [chatInputMode, setChatInputMode] = useState<'execute' | 'send'>('execute')
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Multi-send target state
  const [targetTabs, setTargetTabs] = useState<Set<string>>(new Set())  // Empty = current tab only
  const [showTargetDropdown, setShowTargetDropdown] = useState(false)

  // Command history
  const {
    history: commandHistory,
    addToHistory,
    removeFromHistory,
    navigateHistory,
    resetNavigation,
  } = useCommandHistory()
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)

  // Claude status tracking - polls for Claude Code status in each terminal
  const claudeStatuses = useClaudeStatus(
    sessions.map(s => ({
      id: s.id,
      sessionName: s.sessionName,
      workingDir: s.workingDir,
    }))
  )

  const portRef = useRef<chrome.runtime.Port | null>(null)

  // Refs for keyboard shortcut handlers (to access current state from callbacks)
  const sessionsRef = useRef<TerminalSession[]>([])
  const currentSessionRef = useRef<string | null>(null)

  // Keep refs in sync with state
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    currentSessionRef.current = currentSession
  }, [currentSession])

  // Tab context menu state (for session management)
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    terminalId: string | null
  }>({ show: false, x: 0, y: 0, terminalId: null })

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
        setChatInputText(message.command)
        setChatInputMode('execute')
        setTimeout(() => chatInputRef.current?.focus(), 100)
      }
    })

    portRef.current = port

    // Cleanup
    return () => {
      port.disconnect()
      portRef.current = null
    }
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

  // Load profiles from Chrome storage (or initialize from profiles.json if not present)
  useEffect(() => {
    chrome.storage.local.get(['profiles', 'defaultProfile'], async (result) => {
      if (result.profiles && Array.isArray(result.profiles) && result.profiles.length > 0) {
        // Migrate old profiles: ensure all required fields have defaults
        // Also migrate old 'theme' field to new 'themeName' field
        const migratedProfiles = (result.profiles as any[]).map(p => {
          // Convert old theme field to themeName
          let themeName = p.themeName
          if (!themeName && p.theme) {
            themeName = 'high-contrast' // Map old dark/light to high-contrast
          }
          return {
            ...p,
            fontSize: p.fontSize ?? 14,
            fontFamily: p.fontFamily ?? 'monospace',
            themeName: themeName ?? 'high-contrast',
            theme: undefined, // Remove old field
          }
        })
        setProfiles(migratedProfiles)

        // Save migrated profiles back to storage if any were updated
        const needsMigration = (result.profiles as any[]).some(
          p => p.fontSize === undefined || p.fontFamily === undefined || p.themeName === undefined || p.theme !== undefined
        )
        if (needsMigration) {
          chrome.storage.local.set({ profiles: migratedProfiles })
        }
      } else {
        // Initialize profiles from profiles.json on first load
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()
          setProfiles(data.profiles as Profile[])

          // Save to storage so they persist
          chrome.storage.local.set({
            profiles: data.profiles,
            defaultProfile: data.defaultProfile || 'default'
          })
        } catch (error) {
          console.error('[Sidepanel] Failed to load default profiles:', error)
        }
      }
    })

    // Listen for storage changes (when settings modal updates profiles)
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.profiles) {
        setProfiles((changes.profiles.newValue as Profile[]) || [])
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  // Load global working directory, recent dirs, and dark mode from Chrome storage
  useEffect(() => {
    chrome.storage.local.get(['globalWorkingDir', 'recentDirs', 'isDark'], (result) => {
      if (result.globalWorkingDir && typeof result.globalWorkingDir === 'string') {
        setGlobalWorkingDir(result.globalWorkingDir)
      }
      if (result.recentDirs && Array.isArray(result.recentDirs)) {
        setRecentDirs(result.recentDirs as string[])
      }
      if (typeof result.isDark === 'boolean') {
        setIsDark(result.isDark)
      }
    })
  }, [])

  // Save global working directory when it changes
  useEffect(() => {
    chrome.storage.local.set({ globalWorkingDir })
  }, [globalWorkingDir])

  // Save recent dirs when they change
  useEffect(() => {
    chrome.storage.local.set({ recentDirs })
  }, [recentDirs])

  // Save dark mode preference when it changes
  useEffect(() => {
    chrome.storage.local.set({ isDark })
  }, [isDark])

  // Helper to add a directory to recent list
  const addToRecentDirs = (dir: string) => {
    if (!dir || dir === '~') return // Don't add empty or home
    setRecentDirs(prev => {
      const filtered = prev.filter(d => d !== dir)
      return [dir, ...filtered].slice(0, 10) // Keep last 10
    })
  }

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

  // Close target dropdown when clicking outside
  useEffect(() => {
    if (!showTargetDropdown) return
    const handleClick = () => setShowTargetDropdown(false)
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showTargetDropdown])

  // Close history dropdown when clicking outside
  useEffect(() => {
    if (!showHistoryDropdown) return
    const handleClick = () => setShowHistoryDropdown(false)
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showHistoryDropdown])

  // Load saved terminal sessions from Chrome storage on mount
  // CRITICAL: Must complete before LIST_TERMINALS request to avoid race condition
  useEffect(() => {
    chrome.storage.local.get(['terminalSessions'], (result) => {
      if (result.terminalSessions && Array.isArray(result.terminalSessions)) {
        setSessions(result.terminalSessions)
        if (result.terminalSessions.length > 0) {
          setCurrentSession(result.terminalSessions[0].id)
        }
      }
      setStorageLoaded(true)
    })
  }, [])

  // Save terminal sessions to Chrome storage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      chrome.storage.local.set({ terminalSessions: sessions })
    } else {
      chrome.storage.local.remove('terminalSessions')
    }
  }, [sessions])

  // Request terminal list when WebSocket connects AND storage is loaded
  useEffect(() => {
    if (wsConnected && storageLoaded) {
      sendMessage({ type: 'LIST_TERMINALS' })
    }
  }, [wsConnected, storageLoaded])

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

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'terminals':
        // Terminal list received from backend - reconcile with stored sessions
        // Filter to only ctt- prefixed terminals (Chrome extension terminals)
        const backendTerminals = (data.data || []).filter((t: any) => t.id && t.id.startsWith('ctt-'))
        const recoveryComplete = data.recoveryComplete === true

        // Track connection count for multi-window warning
        if (data.connectionCount !== undefined) {
          setConnectionCount(data.connectionCount)
        }

        // Get current sessions from state (which may have been restored from Chrome storage)
        setSessions(currentSessions => {
          // Filter current sessions to only ctt- prefixed (clean up any old non-prefixed sessions)
          const filteredSessions = currentSessions.filter(s => s.id && s.id.startsWith('ctt-'))
          // Create a map of existing sessions by ID
          const sessionMap = new Map(filteredSessions.map(s => [s.id, s]))

          // Update or add backend terminals
          backendTerminals.forEach((t: any) => {
            const existingSession = sessionMap.get(t.id)
            if (existingSession) {
              // Update existing session with backend data, preserving the name from Chrome storage
              // CRITICAL: Use ?? to preserve existing sessionName if backend returns undefined
              // This prevents chat send from falling back to unreliable TERMINAL_INPUT path
              sessionMap.set(t.id, {
                ...existingSession,
                sessionName: t.sessionName ?? existingSession.sessionName,
                workingDir: t.workingDir ?? existingSession.workingDir,
                active: false,
              })
            } else {
              // Add new terminal from backend
              sessionMap.set(t.id, {
                id: t.id,
                name: t.name || t.id,
                type: t.terminalType || 'bash',
                active: false,
                sessionName: t.sessionName,
                profile: t.profile,
              })
            }
          })

          // Only remove sessions that no longer exist in backend AFTER recovery is complete
          // This prevents clearing Chrome storage before the backend has recovered tmux sessions
          if (recoveryComplete) {
            const backendIds = new Set(backendTerminals.map((t: any) => t.id))
            for (const [id, _] of sessionMap) {
              if (!backendIds.has(id)) {
                sessionMap.delete(id)
              }
            }
          }

          const updatedSessions = Array.from(sessionMap.values())

          // 🔧 FIX: Only reset current session if it was removed from backend
          // Don't reset just because currentSession state hasn't synced yet
          setCurrentSession(prevCurrent => {
            // If no sessions, clear current
            if (updatedSessions.length === 0) {
              return null
            }

            // If current session still exists in updated list, keep it
            if (prevCurrent && updatedSessions.find(s => s.id === prevCurrent)) {
              return prevCurrent
            }

            // Fall back to first session (current was removed)
            return updatedSessions[0].id
          })

          return updatedSessions
        })
        break
      case 'session-list':
        setSessions(data.sessions || [])
        break
      case 'terminal-spawned':
        // Backend sends: { type: 'terminal-spawned', data: terminalObject, requestId }
        // terminalObject has: { id, name, terminalType, profile, ... }
        const terminal = data.data || data

        // Ignore non-ctt terminals (from other projects sharing this backend)
        if (!terminal.id || !terminal.id.startsWith('ctt-')) {
          break
        }

        setSessions(prev => {
          // Check if terminal already exists (from restore)
          if (prev.find(s => s.id === terminal.id)) {
            return prev
          }
          return [...prev, {
            id: terminal.id,
            name: terminal.name || terminal.id,
            type: terminal.terminalType || 'bash',
            active: false,
            sessionName: terminal.sessionName,  // Store tmux session name
            workingDir: terminal.workingDir,    // Store working directory for Claude status
            profile: terminal.profile,          // Store profile settings
          }]
        })
        setCurrentSession(terminal.id)

        // For API-spawned terminals, send reconnect to register this connection as owner
        // This enables chat input to send commands to the terminal
        sendMessage({
          type: 'RECONNECT',
          terminalId: terminal.id,
        })
        break
      case 'terminal-closed':
        // Backend sends: { type: 'terminal-closed', data: { id: terminalId } }
        const closedTerminalId = data.data?.id || data.terminalId || data.id
        // Terminal closed
        setSessions(prev => {
          const closedIndex = prev.findIndex(s => s.id === closedTerminalId)
          const updated = prev.filter(s => s.id !== closedTerminalId)

          // If closed terminal was active, switch to adjacent terminal
          setCurrentSession(prevCurrent => {
            if (prevCurrent !== closedTerminalId) return prevCurrent
            if (updated.length === 0) return null
            // Prefer the terminal that was after the closed one, else the one before
            const newIndex = Math.min(closedIndex, updated.length - 1)
            return updated[newIndex]?.id || null
          })

          return updated
        })
        break
    }
  }

  const handleSpawnTerminal = () => {
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
      name: 'Bash',
    })
  }

  const handleSpawnDefaultProfile = () => {
    // Capture current globalWorkingDir to avoid stale closure in async callback
    const currentGlobalWorkingDir = globalWorkingDir

    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
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
        // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
        const effectiveWorkingDir = (profile.workingDir && profile.workingDir !== '~')
          ? profile.workingDir
          : currentGlobalWorkingDir
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
    // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
    const effectiveWorkingDir = (profile.workingDir && profile.workingDir !== '~')
      ? profile.workingDir
      : globalWorkingDir
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
      name: profile.name,
      workingDir: effectiveWorkingDir,
      command: profile.command,
      profile: { ...profile, workingDir: effectiveWorkingDir },
    })
    addToRecentDirs(effectiveWorkingDir)
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

  // Tab drag-and-drop reordering
  const handleTabDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }

  const handleTabDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedTabId && tabId !== draggedTabId) {
      setDragOverTabId(tabId)
    }
  }

  const handleTabDragLeave = () => {
    setDragOverTabId(null)
  }

  const handleTabDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null)
      setDragOverTabId(null)
      return
    }

    // Reorder sessions
    const draggedIndex = sessions.findIndex(s => s.id === draggedTabId)
    const targetIndex = sessions.findIndex(s => s.id === targetTabId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newSessions = [...sessions]
      const [draggedSession] = newSessions.splice(draggedIndex, 1)
      newSessions.splice(targetIndex, 0, draggedSession)
      setSessions(newSessions)

      // Persist new order to Chrome storage
      chrome.storage.local.set({ terminalSessions: newSessions })
    }

    setDraggedTabId(null)
    setDragOverTabId(null)
  }

  const handleTabDragEnd = () => {
    setDraggedTabId(null)
    setDragOverTabId(null)
  }

  // Chat input handlers - alternative to direct terminal paste
  const handleChatInputSend = () => {
    if (!chatInputText.trim()) return

    // Add to command history
    addToHistory(chatInputText.trim())

    // Determine target terminals: selected tabs or current tab
    const targets = targetTabs.size > 0
      ? Array.from(targetTabs)
      : currentSession ? [currentSession] : []

    if (targets.length === 0) return

    // Send to each target with slight stagger for multi-send
    targets.forEach((terminalId, index) => {
      const delay = index * 50 // 50ms stagger between sends

      setTimeout(() => {
        // Check if this terminal has Claude status with a pane ID
        // If so, use targeted pane send to avoid corrupting TUI tools in split layouts
        const claudeStatus = claudeStatuses.get(terminalId)
        const tmuxPane = claudeStatus?.tmuxPane

        // Get session info for tmux fallback
        const session = sessions.find(s => s.id === terminalId)
        const tmuxSessionName = session?.sessionName

        if (tmuxPane) {
          // Use targeted pane send - goes directly to Claude's pane
          // This prevents sending to TUI tools (like TFE) in other panes
          console.log(`[ChatSend] Using TARGETED_PANE_SEND to pane ${tmuxPane}`)
          sendMessage({
            type: 'TARGETED_PANE_SEND',
            tmuxPane,
            text: chatInputText,
            sendEnter: chatInputMode === 'execute',
          })
        } else if (tmuxSessionName) {
          // Fallback: Use tmux session name when pane ID isn't available
          // This is safer than PTY for Claude terminals - sends to first pane of session
          // Avoids the bug where content gets executed by bash instead of going to Claude
          console.log(`[ChatSend] Using TMUX_SESSION_SEND to session ${tmuxSessionName}`)
          sendMessage({
            type: 'TMUX_SESSION_SEND',
            sessionName: tmuxSessionName,
            text: chatInputText,
            sendEnter: chatInputMode === 'execute',
          })
        } else {
          // Last resort: PTY send (only for non-tmux terminals)
          // This path is less reliable for "execute" mode - two separate messages instead of atomic tmux send
          console.warn(`[ChatSend] Using PTY fallback for terminal ${terminalId} - sessionName missing. Session:`, session)
          sendMessage({
            type: 'TERMINAL_INPUT',
            terminalId,
            data: chatInputText,
          })

          // If execute mode, send Enter after 300ms delay
          // CRITICAL: Delay prevents submit before text loads (especially for Claude Code)
          if (chatInputMode === 'execute') {
            setTimeout(() => {
              sendMessage({
                type: 'TERMINAL_INPUT',
                terminalId,
                data: '\r',
              })
            }, 300)
          }
        }
      }, delay)
    })

    // Clear input after sending
    setChatInputText('')

    // Keep focus on input for next message
    chatInputRef.current?.focus()
  }

  // Toggle a tab in the target selection
  const toggleTargetTab = (tabId: string) => {
    setTargetTabs(prev => {
      const next = new Set(prev)
      if (next.has(tabId)) {
        next.delete(tabId)
      } else {
        next.add(tabId)
      }
      return next
    })
  }

  // Select/deselect all tabs
  const selectAllTargetTabs = () => {
    if (targetTabs.size === sessions.length) {
      setTargetTabs(new Set())
    } else {
      setTargetTabs(new Set(sessions.map(s => s.id)))
    }
  }

  // Get display label for target dropdown
  const getTargetLabel = () => {
    if (targetTabs.size === 0) return 'Current'
    if (targetTabs.size === 1) {
      const id = Array.from(targetTabs)[0]
      const session = sessions.find(s => s.id === id)
      return session?.name || 'Tab'
    }
    return `${targetTabs.size} tabs`
  }

  const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleChatInputSend()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setChatInputText('')
      resetNavigation()
      chatInputRef.current?.blur()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const historyCommand = navigateHistory('up', chatInputText)
      if (historyCommand !== null) {
        setChatInputText(historyCommand)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const historyCommand = navigateHistory('down', chatInputText)
      if (historyCommand !== null) {
        setChatInputText(historyCommand)
      }
    }
  }

  // Reset history navigation when user types manually
  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInputText(e.target.value)
    resetNavigation()
  }

  // Keyboard shortcut handlers (use refs to access current state from callbacks)
  const handleKeyboardNewTab = () => {
    // Capture current globalWorkingDir to avoid stale closure in async callback
    const currentGlobalWorkingDir = globalWorkingDir

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
        // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
        const effectiveWorkingDir = (profile.workingDir && profile.workingDir !== '~')
          ? profile.workingDir
          : currentGlobalWorkingDir
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
  }

  const handleKeyboardCloseTab = () => {
    const current = currentSessionRef.current
    const allSessions = sessionsRef.current
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
  }

  const handleKeyboardNextTab = () => {
    const current = currentSessionRef.current
    const allSessions = sessionsRef.current
    if (!current || allSessions.length <= 1) return

    const currentIndex = allSessions.findIndex(s => s.id === current)
    const nextIndex = (currentIndex + 1) % allSessions.length
    setCurrentSession(allSessions[nextIndex].id)
  }

  const handleKeyboardPrevTab = () => {
    const current = currentSessionRef.current
    const allSessions = sessionsRef.current
    if (!current || allSessions.length <= 1) return

    const currentIndex = allSessions.findIndex(s => s.id === current)
    const prevIndex = currentIndex === 0 ? allSessions.length - 1 : currentIndex - 1
    setCurrentSession(allSessions[prevIndex].id)
  }

  const handleKeyboardSwitchTab = (tabIndex: number) => {
    const allSessions = sessionsRef.current
    if (tabIndex >= 0 && tabIndex < allSessions.length) {
      setCurrentSession(allSessions[tabIndex].id)
    }
  }

  // Omnibox handler: spawn terminal with specific profile
  const handleOmniboxSpawnProfile = (profile: Profile) => {
    // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
    const effectiveWorkingDir = (profile.workingDir && profile.workingDir !== '~')
      ? profile.workingDir
      : globalWorkingDir
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
      name: profile.name,
      workingDir: effectiveWorkingDir,
      command: profile.command,
      profile: { ...profile, workingDir: effectiveWorkingDir },
    })
    addToRecentDirs(effectiveWorkingDir)
  }

  // Omnibox handler: spawn terminal and run command
  const handleOmniboxRunCommand = (command: string) => {
    // Capture current globalWorkingDir to avoid stale closure in async callback
    const currentGlobalWorkingDir = globalWorkingDir

    // Get default profile settings
    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
      const defaultProfileId = result.defaultProfile || 'default'
      const profiles = (result.profiles as Profile[]) || []
      const profile = profiles.find((p: Profile) => p.id === defaultProfileId)

      // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
      const effectiveWorkingDir = (profile?.workingDir && profile.workingDir !== '~')
        ? profile.workingDir
        : currentGlobalWorkingDir
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
  const handleDetachSession = async () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal?.sessionName) return

    console.log(`[handleDetachSession] Detaching session: ${terminal.sessionName}`)

    try {
      const response = await fetch(`http://localhost:8129/api/tmux/detach/${terminal.sessionName}`, {
        method: 'POST'
      })

      const data = await response.json()
      if (data.success) {
        console.log('[handleDetachSession] Session detached successfully')
        // Remove from UI but session stays alive in tmux
        setSessions(prev => prev.filter(s => s.id !== terminal.id))
        if (currentSession === terminal.id) {
          setCurrentSession(sessions[0]?.id || null)
        }
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

    console.log(`[handleKillSession] Killing session: ${terminal.sessionName}`)

    try {
      const response = await fetch(`http://localhost:8129/api/tmux/sessions/${terminal.sessionName}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        console.log('[handleKillSession] Session killed successfully')
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
                await navigator.clipboard.writeText('cd ~/projects/TabzChrome/backend && npm start')
                // Brief visual feedback - badge text changes temporarily
                const badge = document.querySelector('[data-disconnected-badge]') as HTMLElement
                if (badge) {
                  badge.textContent = 'Copied!'
                  setTimeout(() => { badge.textContent = 'Disconnected' }, 1500)
                }
              }}
              title="Click to copy backend start command"
              data-disconnected-badge
            >
              Disconnected
            </Badge>
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
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {/* Working Directory Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowDirDropdown(!showDirDropdown)
                setCustomDirInput('')
              }}
              className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88] max-w-[220px]"
              title={`Working Directory: ${globalWorkingDir}`}
            >
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs truncate">{globalWorkingDir}</span>
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            </button>

            {showDirDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[220px] z-50 overflow-hidden">
                {/* Custom input */}
                <div className="p-2 border-b border-gray-800">
                  <input
                    type="text"
                    value={customDirInput}
                    onChange={(e) => setCustomDirInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customDirInput.trim()) {
                        setGlobalWorkingDir(customDirInput.trim())
                        addToRecentDirs(customDirInput.trim())
                        setShowDirDropdown(false)
                        setCustomDirInput('')
                      }
                    }}
                    placeholder="Type path and press Enter"
                    className="w-full px-2 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs font-mono focus:border-[#00ff88] focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                </div>
                {/* Recent directories */}
                <div className="max-h-[200px] overflow-y-auto">
                  {recentDirs.map((dir) => (
                    <div
                      key={dir}
                      className={`flex items-center justify-between px-3 py-2 hover:bg-[#00ff88]/10 transition-colors text-xs font-mono border-b border-gray-800 last:border-b-0 group ${
                        dir === globalWorkingDir ? 'text-[#00ff88] bg-[#00ff88]/5' : 'text-gray-300'
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setGlobalWorkingDir(dir)
                          setShowDirDropdown(false)
                        }}
                        className="flex-1 text-left truncate"
                      >
                        {dir}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRecentDirs(prev => prev.filter(d => d !== dir))
                          if (globalWorkingDir === dir) {
                            setGlobalWorkingDir('~')
                          }
                        }}
                        className="ml-2 p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove from list"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Profiles"
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
                {sessions.map(session => (
                  <div
                    key={session.id}
                    draggable
                    onDragStart={(e) => handleTabDragStart(e, session.id)}
                    onDragOver={(e) => handleTabDragOver(e, session.id)}
                    onDragLeave={handleTabDragLeave}
                    onDrop={(e) => handleTabDrop(e, session.id)}
                    onDragEnd={handleTabDragEnd}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer group
                      min-w-[120px] max-w-[280px] flex-1
                      ${currentSession === session.id
                        ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-300 border border-transparent'
                      }
                      ${draggedTabId === session.id ? 'opacity-50' : ''}
                      ${dragOverTabId === session.id ? 'border-l-2 border-l-[#00ff88]' : ''}
                    `}
                    onClick={() => setCurrentSession(session.id)}
                    onContextMenu={(e) => handleTabContextMenu(e, session.id)}
                    title={claudeStatuses.has(session.id)
                      ? `${session.name}\n${getFullStatusText(claudeStatuses.get(session.id))}`
                      : session.name
                    }
                  >
                    {/* Tab content: show Claude status if detected, otherwise session name */}
                    {/* Using consistent structure to prevent DOM thrashing */}
                    <span className="flex-1 flex items-center gap-1 text-xs truncate min-w-0">
                      {claudeStatuses.has(session.id) && (
                        <span className="flex-shrink-0">🤖</span>
                      )}
                      <span className="truncate">
                        {claudeStatuses.has(session.id)
                          ? getStatusText(claudeStatuses.get(session.id))
                          : session.name
                        }
                      </span>
                    </span>
                    <button
                      onClick={(e) => handleCloseTab(e, session.id)}
                      className="flex-shrink-0 ml-auto p-0.5 rounded hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                      title="Close tab"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {/* End drop zone - for dropping tab at the end */}
                {draggedTabId && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverTabId('__end__')
                    }}
                    onDragLeave={handleTabDragLeave}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (!draggedTabId) return

                      const draggedIndex = sessions.findIndex(s => s.id === draggedTabId)
                      if (draggedIndex !== -1 && draggedIndex !== sessions.length - 1) {
                        const newSessions = [...sessions]
                        const [draggedSession] = newSessions.splice(draggedIndex, 1)
                        newSessions.push(draggedSession)
                        setSessions(newSessions)
                        chrome.storage.local.set({ terminalSessions: newSessions })
                      }

                      setDraggedTabId(null)
                      setDragOverTabId(null)
                    }}
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
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Profile Dropdown Menu - Aligned to right edge */}
              {showProfileDropdown && profiles.length > 0 && (
                <div
                  className="absolute top-full right-2 mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[180px] z-50 overflow-hidden"
                >
                  {profiles.map((profile) => {
                    // Get truncated working dir (just folder name with ./ prefix)
                    const truncatedDir = profile.workingDir
                      ? './' + profile.workingDir.split('/').filter(Boolean).pop()
                      : null
                    return (
                      <button
                        key={profile.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSpawnProfile(profile)
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-[#00ff88]/10 transition-colors text-white hover:text-[#00ff88] text-xs border-b border-gray-800 last:border-b-0"
                      >
                        <div className="font-medium flex items-center gap-2">
                          <span>{profile.name}</span>
                          {truncatedDir && (
                            <span className="text-gray-500 font-normal text-[10px]">{truncatedDir}</span>
                          )}
                        </div>
                        {profile.command && (
                          <div className="text-gray-500 mt-0.5 truncate font-mono">▶ {profile.command}</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Terminal View */}
          <div className="flex-1 relative min-h-0">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <TerminalIcon className="h-16 w-16 mb-4 opacity-20" />
                {wsConnected ? (
                  <>
                    <p className="text-lg font-medium mb-2">No active terminals</p>
                    <p className="text-sm mb-4">Spawn a terminal to get started</p>
                    <div className="relative flex">
                      <button
                        onClick={handleSpawnDefaultProfile}
                        className="px-4 py-2 bg-gradient-to-r from-[#00ff88] to-[#00c8ff] text-black rounded-l-md hover:opacity-90 transition-opacity font-medium flex items-center"
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
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      {/* Profile Dropdown */}
                      {showEmptyStateDropdown && profiles.length > 0 && (
                        <div className="absolute top-full left-0 mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[180px] z-50 overflow-hidden">
                          {profiles.map((profile) => {
                            const truncatedDir = profile.workingDir
                              ? './' + profile.workingDir.split('/').filter(Boolean).pop()
                              : null
                            return (
                              <button
                                key={profile.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSpawnProfile(profile)
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-[#00ff88]/10 transition-colors text-white hover:text-[#00ff88] text-xs border-b border-gray-800 last:border-b-0"
                              >
                                <div className="font-medium flex items-center gap-2">
                                  <span>{profile.name}</span>
                                  {truncatedDir && (
                                    <span className="text-gray-500 font-normal text-[10px]">{truncatedDir}</span>
                                  )}
                                </div>
                                {profile.command && (
                                  <div className="text-gray-500 mt-0.5 truncate font-mono">▶ {profile.command}</div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">Backend not running</p>
                    <p className="text-sm mb-4 text-center px-4">Start the backend server to use terminals</p>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText('cd ~/projects/TabzChrome/backend && npm start')
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
                    <p className="text-xs mt-3 text-gray-500 font-mono">cd backend && npm start</p>
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
                    <Terminal
                      terminalId={session.id}
                      sessionName={session.name}
                      terminalType={session.type}
                      workingDir={session.workingDir || effectiveProfile?.workingDir}
                      tmuxSession={session.sessionName}
                      fontSize={effectiveProfile?.fontSize || 14}
                      fontFamily={effectiveProfile?.fontFamily || 'monospace'}
                      themeName={effectiveProfile?.themeName || 'high-contrast'}
                      isDark={isDark}
                      isActive={session.id === currentSession}
                      pasteCommand={session.id === currentSession ? pasteCommand : null}
                      onClose={() => {
                        sendMessage({
                          type: 'CLOSE_TERMINAL',
                          terminalId: session.id,
                        })
                      }}
                    />
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Chat Input Bar - Multi-send with target selection */}
          {sessions.length > 0 && (
            <div className="border-t border-gray-700 bg-[#1a1a1a] flex items-center gap-2 px-2 py-1.5">
              {/* History dropdown button */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowHistoryDropdown(!showHistoryDropdown)
                  }}
                  className={`h-7 w-7 flex items-center justify-center bg-black border rounded transition-colors ${
                    commandHistory.length > 0
                      ? 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                      : 'border-gray-700 text-gray-600 cursor-not-allowed'
                  }`}
                  title={commandHistory.length > 0 ? `Command history (${commandHistory.length})` : 'No command history'}
                  disabled={commandHistory.length === 0}
                >
                  <History className="h-3.5 w-3.5" />
                </button>

                {showHistoryDropdown && commandHistory.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[280px] max-w-[400px] z-50 overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-gray-800 text-xs text-gray-500 flex items-center justify-between">
                      <span>Command History</span>
                      <span className="text-gray-600">↑↓ to navigate</span>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto">
                      {commandHistory.map((cmd, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between px-3 py-2 hover:bg-[#00ff88]/10 transition-colors text-xs font-mono border-b border-gray-800 last:border-b-0 group"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setChatInputText(cmd)
                              setShowHistoryDropdown(false)
                              chatInputRef.current?.focus()
                            }}
                            className="flex-1 text-left text-gray-300 hover:text-white truncate pr-2"
                            title={cmd}
                          >
                            {cmd}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFromHistory(cmd)
                            }}
                            className="ml-2 p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            title="Remove from history"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <input
                ref={chatInputRef}
                type="text"
                className="flex-1 h-7 px-3 bg-black border border-gray-600 rounded text-sm text-white font-mono focus:border-[#00ff88]/50 focus:outline-none placeholder-gray-500"
                value={chatInputText}
                onChange={handleChatInputChange}
                onKeyDown={handleChatInputKeyDown}
                placeholder={chatInputMode === 'execute' ? "↑↓ history • Enter to execute" : "↑↓ history • Enter to send"}
              />
              {/* Target tabs dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowTargetDropdown(!showTargetDropdown)
                  }}
                  className={`h-7 px-2 flex items-center gap-1 bg-black border rounded text-xs cursor-pointer transition-colors ${
                    targetTabs.size > 0
                      ? 'border-[#00ff88]/50 text-[#00ff88]'
                      : 'border-gray-600 text-gray-300 hover:border-gray-500'
                  }`}
                  title="Target terminals"
                >
                  <span className="max-w-[60px] truncate">{getTargetLabel()}</span>
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </button>

                {showTargetDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[160px] z-50 overflow-hidden">
                    {/* Current tab option */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setTargetTabs(new Set())
                        setShowTargetDropdown(false)
                      }}
                      className={`w-full px-3 py-2 text-left text-xs border-b border-gray-800 transition-colors flex items-center gap-2 ${
                        targetTabs.size === 0
                          ? 'text-[#00ff88] bg-[#00ff88]/10'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="w-4">{targetTabs.size === 0 ? '●' : '○'}</span>
                      <span>Current Tab</span>
                    </button>

                    {/* Divider */}
                    <div className="border-b border-gray-700 my-1" />

                    {/* Individual tabs with checkboxes */}
                    <div className="max-h-[200px] overflow-y-auto">
                      {sessions.map((session) => {
                        const claudeStatus = claudeStatuses.get(session.id)
                        return (
                          <button
                            key={session.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleTargetTab(session.id)
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs transition-colors flex items-center gap-2 ${
                              targetTabs.has(session.id)
                                ? 'text-[#00ff88] bg-[#00ff88]/5'
                                : 'text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="w-4 flex-shrink-0">
                              {targetTabs.has(session.id) ? '☑' : '☐'}
                            </span>
                            <span
                              className="flex items-center gap-1 truncate"
                              title={claudeStatus ? `${session.name}\n${getFullStatusText(claudeStatus)}` : session.name}
                            >
                              {claudeStatus && <span className="flex-shrink-0">🤖</span>}
                              <span className="truncate">
                                {claudeStatus ? getStatusText(claudeStatus) : session.name}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Select All / None */}
                    {sessions.length > 1 && (
                      <>
                        <div className="border-t border-gray-700 mt-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            selectAllTargetTabs()
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-gray-400 hover:bg-white/5 transition-colors"
                        >
                          {targetTabs.size === sessions.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <select
                value={chatInputMode}
                onChange={(e) => setChatInputMode(e.target.value as 'execute' | 'send')}
                className="h-7 px-2 bg-black border border-gray-600 rounded text-xs text-gray-300 focus:border-[#00ff88]/50 focus:outline-none cursor-pointer"
                title="Send mode"
              >
                <option value="execute">Execute</option>
                <option value="send">Send</option>
              </select>
              <button
                onClick={handleChatInputSend}
                disabled={!chatInputText.trim()}
                className="h-7 px-3 bg-[#00ff88]/20 border border-[#00ff88]/30 rounded text-xs text-[#00ff88] font-medium hover:bg-[#00ff88]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Tab Context Menu */}
      {contextMenu.show && contextMenu.terminalId && (
        <div
          className="tab-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const terminal = sessions.find(t => t.id === contextMenu.terminalId)
            const hasSession = terminal?.sessionName  // Only tmux sessions

            return (
              <>
                <button
                  className="context-menu-item"
                  onClick={handleContextRename}
                >
                  ✏️ Rename Tab...
                </button>
                {hasSession && (
                  <>
                    <div className="context-menu-divider" />
                    <button
                      className="context-menu-item"
                      onClick={handleDetachSession}
                    >
                      📌 Detach Session
                    </button>
                    <button
                      className="context-menu-item"
                      onClick={handleKillSession}
                    >
                      ❌ Kill Session
                    </button>
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}

    </div>
  )
}

// Mount the sidepanel
ReactDOM.createRoot(document.getElementById('sidepanel-root')!).render(
  <React.StrictMode>
    <SidePanelTerminal />
  </React.StrictMode>
)
