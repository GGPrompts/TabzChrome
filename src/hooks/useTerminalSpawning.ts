import { useRef } from 'react'
import SimpleSpawnService from '../services/SimpleSpawnService'
import { Terminal as StoredTerminal, useSimpleTerminalStore } from '../stores/simpleTerminalStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { TERMINAL_TYPE_ABBREVIATIONS, COMMAND_ABBREVIATIONS, THEME_BACKGROUNDS } from '../constants/terminalConfig'

/**
 * Interface for spawn option configuration
 */
interface SpawnOption {
  label: string
  command: string
  terminalType: string
  icon: string
  description: string
  workingDir?: string
  workingDirOverride?: string // Override from spawn menu (highest priority)
  defaultTheme?: string
  defaultBackground?: string
  defaultTransparency?: number
  defaultFontFamily?: string
  defaultFontSize?: number
}

/**
 * Custom hook for terminal spawning logic.
 *
 * Handles:
 * - Generating short session names (e.g., "tt-cc-a3k")
 * - Creating placeholder terminals with requestId tracking
 * - Spawning terminals via SimpleSpawnService
 * - Reconnecting to existing tmux sessions
 *
 * @param currentWindowId - ID of current browser window
 * @param useTmux - Whether to use tmux for persistent sessions
 * @param wsRef - WebSocket reference for communication
 * @param pendingSpawns - Map of pending spawn requests by requestId
 * @returns Object with handleSpawnTerminal and generateSessionName functions
 */
export function useTerminalSpawning(
  currentWindowId: string,
  useTmux: boolean,
  wsRef: React.RefObject<WebSocket | null>,
  pendingSpawns: React.MutableRefObject<Map<string, StoredTerminal>>
) {
  const { addTerminal, updateTerminal, setActiveTerminal } = useSimpleTerminalStore()

  /**
   * Generate short session name like "tt-cc-a3k" (Tabz - Claude Code - random suffix)
   *
   * @param terminalType - Type of terminal (bash, claude-code, etc.)
   * @param label - Optional label for terminal
   * @param command - Optional command to run
   * @returns Generated session name
   */
  const generateSessionName = (terminalType: string, label?: string, command?: string): string => {
    // Check command-specific abbreviations first (TFE, LazyGit, etc.)
    let abbrev: string
    if (command && COMMAND_ABBREVIATIONS[command]) {
      abbrev = COMMAND_ABBREVIATIONS[command]
    } else {
      abbrev = TERMINAL_TYPE_ABBREVIATIONS[terminalType] || terminalType.slice(0, 4)
    }

    // Use random 3-char suffix to avoid collisions (like "tt-cc-a3k")
    // This ensures unique names even if localStorage is cleared but tmux sessions remain
    const suffix = Math.random().toString(36).substring(2, 5)
    return `tt-${abbrev}-${suffix}`
  }

  /**
   * Spawn a new terminal with the given options
   *
   * @param option - Spawn option configuration
   */
  const handleSpawnTerminal = async (option: SpawnOption) => {
    try {
      // Generate requestId FIRST
      const requestId = `spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Generate short session name (e.g., "tt-cc-1", "tt-tfe-1")
      const sessionName = useTmux ? generateSessionName(option.terminalType, option.label, option.command) : undefined

      // Create placeholder terminal IMMEDIATELY (before spawn)
      // 3-tier priority: option > override > global default
      // This ensures spawn options with explicit workingDir (like Dev Logs → /tmp) are never overridden
      const globalWorkingDir = useSettingsStore.getState().workingDirectory || '~'
      const effectiveWorkingDir = option.workingDir || option.workingDirOverride || globalWorkingDir

      // Get global defaults for 3-tier priority system
      const globalSettings = useSettingsStore.getState()
      const effectiveTheme = option.defaultTheme ?? globalSettings.terminalDefaultTheme
      // Note: effectiveBackground should NOT include global default here
      // Global default is only used as final fallback after theme-based mapping
      const effectiveBackground = option.defaultBackground // Explicit background only
      const effectiveTransparency = option.defaultTransparency ?? Math.round(globalSettings.terminalDefaultTransparency * 100)

      // Debug: Log priority resolution
      console.log('[SpawnPriority] Font settings resolution:', {
        spawnOption: {
          fontSize: option.defaultFontSize,
          fontFamily: option.defaultFontFamily,
        },
        global: {
          fontSize: globalSettings.terminalDefaultFontSize,
          fontFamily: globalSettings.terminalDefaultFontFamily,
        },
        effective: {
          fontSize: option.defaultFontSize ?? globalSettings.terminalDefaultFontSize,
          fontFamily: option.defaultFontFamily ?? globalSettings.terminalDefaultFontFamily,
        },
      })

      const newTerminal: StoredTerminal = {
        id: `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: option.label,
        spawnLabel: option.label, // Preserve original label for fallback
        terminalType: option.terminalType,
        command: option.command, // Store original command for matching during reconnection
        icon: option.icon,
        workingDir: effectiveWorkingDir,
        theme: effectiveTheme,
        background: effectiveBackground ?? THEME_BACKGROUNDS[effectiveTheme] ?? globalSettings.terminalDefaultBackground ?? 'dark-neutral',
        transparency: effectiveTransparency,
        fontSize: option.defaultFontSize ?? globalSettings.terminalDefaultFontSize,
        fontFamily: option.defaultFontFamily ?? globalSettings.terminalDefaultFontFamily,
        sessionName, // Store session name for persistence
        createdAt: Date.now(),
        status: 'spawning',
        requestId, // Store requestId for matching with WebSocket response
        windowId: currentWindowId, // Assign to current window
      }

      // Store in ref FIRST (synchronous, no race condition)
      pendingSpawns.current.set(requestId, newTerminal)

      // Then add to state (async)
      addTerminal(newTerminal)
      console.log('[useTerminalSpawning] Created placeholder terminal with requestId:', requestId, 'sessionName:', sessionName)

      // Explicitly set as active in THIS window (addTerminal no longer does this automatically)
      setActiveTerminal(newTerminal.id)

      // Build config
      const config: any = {
        terminalType: option.terminalType,
        name: option.label,
        workingDir: effectiveWorkingDir,
        theme: option.defaultTheme,
        transparency: option.defaultTransparency,
        size: { width: 800, height: 600 },  // Initial size (FitAddon will resize after opening)
        useTmux,  // Pass tmux setting from store
        sessionName,  // Short session name like "tt-cc-1"
        resumable: useTmux,  // CRITICAL: Make sessions persistent when using tmux!
      }

      // Convert command to commands array (like opustrator)
      // TUI tools use toolName, others use commands array
      if (option.terminalType === 'tui-tool') {
        config.toolName = option.command
      } else if (option.command) {
        config.commands = [option.command]
        config.startCommand = option.command  // For reconnection
      }

      console.log('[useTerminalSpawning] Spawning with config (useTmux:', useTmux, '):', config)

      // Send spawn request (now we already have the placeholder in state)
      // We can await here safely because placeholder is already created
      const returnedRequestId = await SimpleSpawnService.spawn({ config, requestId })

      if (!returnedRequestId) {
        console.error('Failed to spawn terminal')
        updateTerminal(newTerminal.id, { status: 'error' })
        return
      }

      // Status will be updated to 'active' when WebSocket receives terminal-spawned
    } catch (error) {
      console.error('Error spawning terminal:', error)
    }
  }

  /**
   * Reconnect to an existing terminal session
   *
   * @param terminal - Stored terminal to reconnect
   * @param option - Spawn option for configuration
   */
  const handleReconnectTerminal = async (terminal: StoredTerminal, option: SpawnOption) => {
    try {
      // Log split layout preservation
      if (terminal.splitLayout && terminal.splitLayout.type !== 'single') {
        console.log(`[useTerminalSpawning] 🔄 Reconnecting split container:`, terminal.id, {
          splitType: terminal.splitLayout.type,
          panes: terminal.splitLayout.panes.map(p => ({
            terminalId: p.terminalId,
            position: p.position
          }))
        })
      }

      if (terminal.isHidden) {
        console.log(`[useTerminalSpawning] 🔄 Reconnecting hidden terminal (part of split):`, terminal.id)
      }

      // Generate requestId for reconnection
      const requestId = `reconnect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Create updated terminal object - PRESERVE splitLayout and isHidden!
      const updatedTerminal = {
        ...terminal,
        status: 'spawning' as const,
        requestId,
        agentId: undefined, // Clear old agentId (will get new one from backend)
        // splitLayout is preserved via spread operator
        // isHidden is preserved via spread operator
      }

      // Update terminal state - EXPLICITLY preserve splitLayout, isHidden, and windowId
      updateTerminal(terminal.id, {
        status: 'spawning',
        requestId,
        agentId: undefined,
        // Explicitly preserve these critical properties
        splitLayout: terminal.splitLayout,
        isHidden: terminal.isHidden,
        windowId: terminal.windowId, // Preserve window assignment
      })

      // Store UPDATED terminal in pending spawns ref (with requestId!)
      pendingSpawns.current.set(requestId, updatedTerminal)

      console.log(`[useTerminalSpawning] Reconnecting terminal ${terminal.id} to session ${terminal.sessionName}`)

      // Build config with EXISTING sessionName (backend will detect and reconnect)
      // 3-tier priority: per-terminal > spawn option > global default
      const globalSettings = useSettingsStore.getState()
      const config: any = {
        terminalType: option.terminalType,
        name: option.label,
        workingDir: terminal.workingDir || option.workingDir || globalSettings.workingDirectory || '~',
        theme: terminal.theme ?? option.defaultTheme ?? globalSettings.terminalDefaultTheme,
        background: terminal.background ?? option.defaultBackground ?? globalSettings.terminalDefaultBackground ?? THEME_BACKGROUNDS[terminal.theme || 'default'] ?? 'dark-neutral',
        transparency: terminal.transparency ?? option.defaultTransparency ?? Math.round(globalSettings.terminalDefaultTransparency * 100),
        fontSize: terminal.fontSize ?? option.defaultFontSize ?? globalSettings.terminalDefaultFontSize,
        fontFamily: terminal.fontFamily ?? option.defaultFontFamily ?? globalSettings.terminalDefaultFontFamily ?? 'monospace',
        size: { width: 800, height: 600 },  // Initial size (FitAddon will resize after reconnecting)
        useTmux: true, // Must be true for reconnection
        sessionName: terminal.sessionName, // CRITICAL: Use existing session name!
        resumable: true, // CRITICAL: Must be resumable for persistence!
      }

      // Add command/toolName
      if (option.terminalType === 'tui-tool') {
        config.toolName = option.command
      } else if (option.command) {
        config.commands = [option.command]
        config.startCommand = option.command
      }

      console.log('[useTerminalSpawning] Reconnecting with config:', config)

      // Send spawn request (backend will detect existing session and reconnect)
      const returnedRequestId = await SimpleSpawnService.spawn({ config, requestId })

      if (!returnedRequestId) {
        console.error('Failed to reconnect terminal')
        updateTerminal(terminal.id, { status: 'error' })
        return
      }

      // Status will be updated to 'active' when WebSocket receives terminal-spawned
    } catch (error) {
      console.error('Error reconnecting terminal:', error)
      updateTerminal(terminal.id, { status: 'error' })
    }
  }

  return {
    handleSpawnTerminal,
    handleReconnectTerminal,
    generateSessionName
  }
}
