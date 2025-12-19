import React from 'react'
import { type Profile } from './SettingsModal'

/**
 * Terminal session data for context menu display
 */
interface TerminalSession {
  id: string
  name: string
  type: string
  active: boolean
  sessionName?: string
  workingDir?: string
  profile?: Profile
  assignedVoice?: string
}

/**
 * Props for the SessionContextMenu component
 */
interface SessionContextMenuProps {
  /** Whether the menu is currently visible */
  show: boolean
  /** X position for the menu */
  x: number
  /** Y position for the menu */
  y: number
  /** Terminal session to show menu for */
  terminal: TerminalSession | null
  /** Callback to rename the terminal tab */
  onRename: () => void
  /** Callback to copy the session ID to clipboard */
  onCopyId: () => void
  /** Callback to view terminal output as selectable text */
  onViewAsText?: () => void
  /** Callback to detach the session (keeps tmux running) */
  onDetach: () => void
  /** Callback to kill the session (destroys tmux) */
  onKill: () => void
  /** Callback to close the context menu */
  onClose: () => void
}

/**
 * SessionContextMenu - Right-click context menu for terminal tabs
 *
 * Provides session-level operations when right-clicking a terminal tab.
 * Tmux-backed terminals (ctt-* prefix) have additional options.
 *
 * Available actions:
 * - **Rename Tab**: Change the display name of the tab
 * - **Copy Session ID**: Copy tmux session name to clipboard (useful for tmux attach)
 * - **Detach Session**: Remove from UI but keep tmux session running (becomes orphaned)
 * - **Kill Session**: Destroy the terminal and its tmux session permanently
 *
 * @param props - Menu position and action callbacks
 * @returns Context menu component or null if not visible
 */
export function SessionContextMenu({
  show,
  x,
  y,
  terminal,
  onRename,
  onCopyId,
  onViewAsText,
  onDetach,
  onKill,
  onClose,
}: SessionContextMenuProps) {
  if (!show || !terminal) return null

  // All ctt-* terminals have tmux sessions (the ID is the session name)
  const isTmuxSession = terminal.id?.startsWith('ctt-') || terminal.sessionName

  return (
    <div
      className="tab-context-menu"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        zIndex: 10000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          onRename()
          onClose()
        }}
      >
        ✏️ Rename Tab...
      </button>
      {isTmuxSession && (
        <>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={() => {
              onCopyId()
              onClose()
            }}
          >
            📋 Copy Session ID
          </button>
          {onViewAsText && (
            <button
              className="context-menu-item"
              onClick={() => {
                onViewAsText()
                onClose()
              }}
            >
              📄 View as Text
            </button>
          )}
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={() => {
              onDetach()
              onClose()
            }}
          >
            👻 Detach Session
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              onKill()
              onClose()
            }}
          >
            ❌ Kill Session
          </button>
        </>
      )}
    </div>
  )
}
