import { useEffect, useRef } from 'react'
import { Terminal as StoredTerminal } from '../stores/simpleTerminalStore'

/**
 * Custom hook for handling keyboard shortcuts in the terminal app.
 *
 * Manages global keyboard event listeners for:
 * - Escape: Close spawn menu
 * - Alt+T: Spawn first option (default) or toggle spawn menu
 * - Alt+W: Close active tab
 * - Alt+Tab: Next tab
 * - Alt+Shift+Tab: Previous tab
 * - Alt+]: Next tab (alternative)
 * - Alt+[: Previous tab (alternative)
 * - Alt+0: Jump to last tab
 * - Ctrl+Shift+T: Reopen last closed tab (matches browser behavior)
 * - Alt+1-9: Jump to tab N
 * - Alt+V: Split vertical (tmux)
 * - Alt+X: Close pane (tmux)
 * - Alt+Z: Zoom toggle (tmux)
 * - Alt+Arrow: Navigate between panes (tmux)
 *
 * NOTE: Uses Alt modifier instead of Ctrl to avoid conflicts with browser shortcuts
 * (Ctrl+1-9 switches browser tabs, Ctrl+T opens new browser tab, etc.)
 *
 * @param showSpawnMenu - Whether spawn menu is currently visible
 * @param activeTerminalId - ID of currently active terminal
 * @param visibleTerminals - Array of visible terminals in current window
 * @param spawnOptions - Array of available spawn options
 * @param setShowSpawnMenu - Function to toggle spawn menu visibility
 * @param setActiveTerminal - Function to set active terminal
 * @param handleSpawnTerminal - Function to spawn a new terminal
 * @param handleCloseTerminal - Function to close a terminal
 * @param sendTmuxCommand - Function to send tmux commands (optional)
 */
export function useKeyboardShortcuts(
  showSpawnMenu: boolean,
  activeTerminalId: string | null,
  visibleTerminals: StoredTerminal[],
  spawnOptions: any[],
  setShowSpawnMenu: (show: boolean) => void,
  setActiveTerminal: (id: string | null) => void,
  handleSpawnTerminal: (option: any) => void,
  handleCloseTerminal: (id: string) => void,
  sendTmuxCommand?: (sessionName: string, command: string) => Promise<void>
) {
  // Track last closed terminal for Ctrl+Shift+T
  const lastClosedTerminalRef = useRef<{ terminalType: string; icon?: string; name: string } | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key to close spawn menu
      if (e.key === 'Escape' && showSpawnMenu) {
        setShowSpawnMenu(false)
        return
      }

      // Alt+T - Spawn first option (default)
      if (e.altKey && e.key === 't') {
        e.preventDefault()
        e.stopPropagation()
        if (spawnOptions.length > 0) {
          handleSpawnTerminal(spawnOptions[0])
        } else {
          setShowSpawnMenu(!showSpawnMenu)
        }
        return
      }

      // Alt+W - Close active tab
      if (e.altKey && e.key === 'w') {
        e.preventDefault()
        e.stopPropagation()
        if (activeTerminalId) {
          const terminal = visibleTerminals.find(t => t.id === activeTerminalId)
          if (terminal) {
            lastClosedTerminalRef.current = {
              terminalType: terminal.terminalType,
              icon: terminal.icon,
              name: terminal.name,
            }
          }
          handleCloseTerminal(activeTerminalId)
        }
        return
      }

      // Alt+Tab - Next tab
      if (e.altKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        if (visibleTerminals.length > 0) {
          const currentIndex = visibleTerminals.findIndex(t => t.id === activeTerminalId)
          const nextIndex = (currentIndex + 1) % visibleTerminals.length
          setActiveTerminal(visibleTerminals[nextIndex].id)
        }
        return
      }

      // Alt+Shift+Tab - Previous tab
      if (e.altKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        if (visibleTerminals.length > 0) {
          const currentIndex = visibleTerminals.findIndex(t => t.id === activeTerminalId)
          const prevIndex = currentIndex <= 0 ? visibleTerminals.length - 1 : currentIndex - 1
          setActiveTerminal(visibleTerminals[prevIndex].id)
        }
        return
      }

      // Ctrl+Shift+T - Reopen last closed tab (matches browser "reopen closed tab" behavior)
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        e.stopPropagation()
        if (lastClosedTerminalRef.current) {
          const option = spawnOptions.find(
            opt => opt.terminalType === lastClosedTerminalRef.current!.terminalType
          )
          if (option) {
            handleSpawnTerminal(option)
          }
        }
        return
      }

      // Alt+1-9 - Jump to tab N
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        e.stopPropagation()
        const tabIndex = parseInt(e.key) - 1
        if (tabIndex < visibleTerminals.length) {
          setActiveTerminal(visibleTerminals[tabIndex].id)
        }
        return
      }

      // Alt+0 - Jump to last tab
      if (e.altKey && e.key === '0') {
        e.preventDefault()
        e.stopPropagation()
        if (visibleTerminals.length > 0) {
          setActiveTerminal(visibleTerminals[visibleTerminals.length - 1].id)
        }
        return
      }

      // Alt+] - Next tab (alternative to Alt+Tab)
      if (e.altKey && e.key === ']' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        if (visibleTerminals.length > 0) {
          const currentIndex = visibleTerminals.findIndex(t => t.id === activeTerminalId)
          const nextIndex = (currentIndex + 1) % visibleTerminals.length
          setActiveTerminal(visibleTerminals[nextIndex].id)
        }
        return
      }

      // Alt+[ - Previous tab (alternative to Alt+Shift+Tab)
      if (e.altKey && e.key === '[' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        if (visibleTerminals.length > 0) {
          const currentIndex = visibleTerminals.findIndex(t => t.id === activeTerminalId)
          const prevIndex = currentIndex <= 0 ? visibleTerminals.length - 1 : currentIndex - 1
          setActiveTerminal(visibleTerminals[prevIndex].id)
        }
        return
      }

      // Tmux commands (only if sendTmuxCommand is provided and terminal has session)
      if (sendTmuxCommand && activeTerminalId) {
        const activeTerminal = visibleTerminals.find(t => t.id === activeTerminalId)
        if (activeTerminal?.sessionName) {
          const tmuxCommands: Record<string, string> = {
            'h': 'split-window -h -c "#{pane_current_path}"',
            'H': 'split-window -h -c "#{pane_current_path}"',
            'v': 'split-window -v -c "#{pane_current_path}"',
            'V': 'split-window -v -c "#{pane_current_path}"',
            'x': 'kill-pane',
            'X': 'kill-pane',
            'z': 'resize-pane -Z',
            'Z': 'resize-pane -Z',
            'ArrowUp': 'select-pane -U',
            'ArrowDown': 'select-pane -D',
            'ArrowLeft': 'select-pane -L',
            'ArrowRight': 'select-pane -R',
          }

          const command = tmuxCommands[e.key]
          if (command && e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            e.stopPropagation()
            sendTmuxCommand(activeTerminal.sessionName, command)
            return
          }
        }
      }
    }

    // Use capture phase to intercept events BEFORE they reach the terminal
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [showSpawnMenu, activeTerminalId, visibleTerminals, spawnOptions, setShowSpawnMenu, setActiveTerminal, handleSpawnTerminal, handleCloseTerminal, sendTmuxCommand])
}
