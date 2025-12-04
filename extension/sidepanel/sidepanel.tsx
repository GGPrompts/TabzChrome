import React, { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { Terminal as TerminalIcon, Settings, Plus, X, ChevronDown, FolderOpen, Moon, Sun } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Terminal } from '../components/Terminal'
import { SettingsModal, type Profile } from '../components/SettingsModal'
import { connectToBackground, sendMessage } from '../shared/messaging'
import { getLocal, setLocal } from '../shared/storage'
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

  // Chat input state (paste workaround)
  const [chatInputText, setChatInputText] = useState('')
  const [chatInputMode, setChatInputMode] = useState<'execute' | 'send'>('execute')
  const chatInputRef = useRef<HTMLInputElement>(null)

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
        console.log('[Sidepanel] Initial state received, wsConnected:', message.wsConnected)
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
        // Paste command from context menu or keyboard shortcut (selected text)
        console.log('[Sidepanel] 📋 Received paste command:', message.command)
        setPasteCommand(message.command)
        // Clear after a brief moment (Terminal will have received it)
        setTimeout(() => setPasteCommand(null), 100)
      } else if (message.type === 'KEYBOARD_NEW_TAB') {
        // Alt+T - spawn new tab with default profile
        console.log('[Sidepanel] ⌨️ New tab shortcut')
        handleKeyboardNewTab()
      } else if (message.type === 'KEYBOARD_CLOSE_TAB') {
        // Alt+W - close current tab
        console.log('[Sidepanel] ⌨️ Close tab shortcut')
        handleKeyboardCloseTab()
      } else if (message.type === 'KEYBOARD_NEXT_TAB') {
        // Next tab
        console.log('[Sidepanel] ⌨️ Next tab shortcut')
        handleKeyboardNextTab()
      } else if (message.type === 'KEYBOARD_PREV_TAB') {
        // Previous tab
        console.log('[Sidepanel] ⌨️ Prev tab shortcut')
        handleKeyboardPrevTab()
      } else if (message.type === 'KEYBOARD_SWITCH_TAB') {
        // Alt+1-9 - switch to specific tab
        console.log('[Sidepanel] ⌨️ Switch to tab:', message.tabIndex)
        handleKeyboardSwitchTab(message.tabIndex)
      } else if (message.type === 'OMNIBOX_SPAWN_PROFILE') {
        // Omnibox: spawn terminal with specific profile
        console.log('[Sidepanel] 🔍 Omnibox spawn profile:', message.profile.name)
        handleOmniboxSpawnProfile(message.profile)
      } else if (message.type === 'OMNIBOX_RUN_COMMAND') {
        // Omnibox: spawn terminal and run command
        console.log('[Sidepanel] 🔍 Omnibox run command:', message.command)
        handleOmniboxRunCommand(message.command)
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
          console.log('[Sidepanel] Migrating old profiles with missing fields or old theme format')
          chrome.storage.local.set({ profiles: migratedProfiles })
        }
      } else {
        // Initialize profiles from profiles.json on first load
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()

          console.log('[Sidepanel] Initializing default profiles from profiles.json')
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

  // Load saved terminal sessions from Chrome storage on mount
  useEffect(() => {
    console.log('[Sidepanel] Checking Chrome storage for saved terminal sessions...')
    chrome.storage.local.get(['terminalSessions'], (result) => {
      console.log('[Sidepanel] Chrome storage result:', result)
      if (result.terminalSessions && Array.isArray(result.terminalSessions)) {
        console.log('📥 Restored terminal sessions from storage:', result.terminalSessions)
        setSessions(result.terminalSessions)
        // Set the first session as current if any exist
        if (result.terminalSessions.length > 0) {
          console.log('[Sidepanel] Setting current session to:', result.terminalSessions[0].id)
          setCurrentSession(result.terminalSessions[0].id)
        }
      } else {
        console.log('[Sidepanel] No saved terminal sessions found in Chrome storage')
      }
    })
  }, [])

  // Save terminal sessions to Chrome storage whenever they change
  useEffect(() => {
    console.log('[Sidepanel] Sessions changed:', sessions.length, 'sessions')
    if (sessions.length > 0) {
      chrome.storage.local.set({ terminalSessions: sessions }, () => {
        console.log('💾 Saved terminal sessions to storage:', sessions)
      })
    } else {
      // Clear storage when no sessions
      chrome.storage.local.remove('terminalSessions', () => {
        console.log('🗑️ Cleared terminal sessions from storage')
      })
    }
  }, [sessions])

  // Request terminal list when WebSocket connects
  useEffect(() => {
    if (wsConnected) {
      console.log('[Sidepanel] WebSocket connected, requesting terminal list to sync with backend...')
      sendMessage({ type: 'LIST_TERMINALS' })
    }
  }, [wsConnected])

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
    console.log('[Sidepanel] handleWebSocketMessage:', data.type, data.type === 'terminal-spawned' || data.type === 'terminals' ? JSON.stringify(data).slice(0, 300) : '')
    switch (data.type) {
      case 'terminals':
        // Terminal list received from backend - reconcile with stored sessions
        // Filter to only ctt- prefixed terminals (Chrome extension terminals)
        const backendTerminals = (data.data || []).filter((t: any) => t.id && t.id.startsWith('ctt-'))
        console.log('[Sidepanel] 🔄 Backend terminals (ctt- only):', backendTerminals.length)

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
              // Update existing session with backend data
              sessionMap.set(t.id, {
                ...existingSession,
                sessionName: t.sessionName,
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

          // Remove sessions that no longer exist in backend
          const backendIds = new Set(backendTerminals.map((t: any) => t.id))
          for (const [id, _] of sessionMap) {
            if (!backendIds.has(id)) {
              console.log(`[Sidepanel] Removing stale session: ${id}`)
              sessionMap.delete(id)
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

            // Only now fall back to first session (when current was truly removed)
            console.log('[Sidepanel] ⚠️ Current session removed, switching to first')
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
          console.log('[Sidepanel] ⏭️ Ignoring non-ctt terminal:', terminal.id)
          break
        }

        console.log('[Sidepanel] 📥 Terminal spawned:', {
          id: terminal.id,
          name: terminal.name,
          type: terminal.terminalType,
          profile: terminal.profile,
        })
        setSessions(prev => {
          // Check if terminal already exists (from restore)
          if (prev.find(s => s.id === terminal.id)) {
            console.log('[Sidepanel] Terminal already exists, skipping add')
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
        break
      case 'terminal-closed':
        // Backend sends: { type: 'terminal-closed', data: { id: terminalId } }
        const closedTerminalId = data.data?.id || data.terminalId || data.id
        console.log('[Sidepanel] 🗑️ Terminal closed:', closedTerminalId)
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
    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
      const defaultProfileId = result.defaultProfile || 'default'
      const profiles = (result.profiles as Profile[]) || []
      const profile = profiles.find((p: Profile) => p.id === defaultProfileId)

      if (profile) {
        const effectiveWorkingDir = profile.workingDir || globalWorkingDir
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
        // Fallback to regular bash if profile not found
        handleSpawnTerminal()
      }
    })
  }

  const handleSpawnProfile = (profile: Profile) => {
    const effectiveWorkingDir = profile.workingDir || globalWorkingDir
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
    if (!chatInputText.trim() || !currentSession) return

    const session = sessions.find(s => s.id === currentSession)
    if (!session) return

    // Send text to terminal via background worker
    sendMessage({
      type: 'TERMINAL_INPUT',
      terminalId: currentSession,
      data: chatInputText,
    })

    // If execute mode, send Enter after 300ms delay
    // CRITICAL: Delay prevents submit before text loads (especially for Claude Code)
    if (chatInputMode === 'execute') {
      setTimeout(() => {
        sendMessage({
          type: 'TERMINAL_INPUT',
          terminalId: currentSession,
          data: '\r',
        })
      }, 300)
    }

    // Clear input after sending
    setChatInputText('')

    // Keep focus on input for next message
    chatInputRef.current?.focus()
  }

  const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleChatInputSend()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setChatInputText('')
      chatInputRef.current?.blur()
    }
  }

  // Keyboard shortcut handlers (use refs to access current state from callbacks)
  const handleKeyboardNewTab = () => {
    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
      const defaultProfileId = result.defaultProfile || 'default'
      const profiles = (result.profiles as Profile[]) || []
      const profile = profiles.find((p: Profile) => p.id === defaultProfileId)

      if (profile) {
        const effectiveWorkingDir = profile.workingDir || globalWorkingDir
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
          workingDir: globalWorkingDir,
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
    const effectiveWorkingDir = profile.workingDir || globalWorkingDir
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
    // Get default profile settings
    chrome.storage.local.get(['profiles', 'defaultProfile'], (result) => {
      const defaultProfileId = result.defaultProfile || 'default'
      const profiles = (result.profiles as Profile[]) || []
      const profile = profiles.find((p: Profile) => p.id === defaultProfileId)

      const effectiveWorkingDir = profile?.workingDir || globalWorkingDir
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
          <TerminalIcon className="h-5 w-5 text-[#00ff88]" />
          <h1 className="text-sm font-semibold text-white">Terminal Tabs</h1>
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
                await navigator.clipboard.writeText('cd ~/projects/TabzChrome-simplified/backend && npm start')
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
              <div className="flex gap-1 p-2 overflow-x-auto">
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
                      flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all cursor-pointer group
                      ${currentSession === session.id
                        ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30'
                        : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-300 border border-transparent'
                      }
                      ${draggedTabId === session.id ? 'opacity-50' : ''}
                      ${dragOverTabId === session.id ? 'border-l-2 border-l-[#00ff88]' : ''}
                    `}
                    onClick={() => setCurrentSession(session.id)}
                    onContextMenu={(e) => handleTabContextMenu(e, session.id)}
                  >
                    <span>{session.name}</span>
                    <button
                      onClick={(e) => handleCloseTab(e, session.id)}
                      className="p-0.5 rounded hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
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
                {/* Quick Add Button with Profile Dropdown */}
                <div className="relative flex" ref={profileBtnRef}>
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

              {/* Profile Dropdown Menu - Outside overflow container */}
              {showProfileDropdown && profiles.length > 0 && (
                <div
                  className="absolute top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[180px] z-50 overflow-hidden"
                  style={{ left: profileDropdownLeft !== null ? `${profileDropdownLeft}px` : undefined }}
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
          <div className="flex-1 relative" style={{ height: sessions.length > 0 ? 'calc(100% - 50px)' : '100%' }}>
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
                        await navigator.clipboard.writeText('cd ~/projects/TabzChrome-simplified/backend && npm start')
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
              <div className="h-full">
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
                    className="h-full"
                    style={{ display: session.id === currentSession ? 'block' : 'none' }}
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

          {/* Chat Input Bar - Paste workaround */}
          {sessions.length > 0 && (
            <div className="border-t border-gray-700 bg-[#1a1a1a] flex items-center gap-2 px-2 py-1.5">
              <input
                ref={chatInputRef}
                type="text"
                className="flex-1 h-7 px-3 bg-black border border-gray-600 rounded text-sm text-white font-mono focus:border-[#00ff88]/50 focus:outline-none placeholder-gray-500"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                onKeyDown={handleChatInputKeyDown}
                placeholder={chatInputMode === 'execute' ? "Type & Enter to execute..." : "Type & Enter to send (no execute)..."}
              />
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
