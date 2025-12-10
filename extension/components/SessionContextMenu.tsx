import React from 'react'
import { type Profile } from './SettingsModal'

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

interface SessionContextMenuProps {
  show: boolean
  x: number
  y: number
  terminal: TerminalSession | null
  onRename: () => void
  onCopyId: () => void
  onDetach: () => void
  onKill: () => void
  onClose: () => void
}

export function SessionContextMenu({
  show,
  x,
  y,
  terminal,
  onRename,
  onCopyId,
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
