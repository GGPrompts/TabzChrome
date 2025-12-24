import React, { useRef, useEffect, useState } from 'react'
import { Copy, AtSign, Star, Pin, Terminal, Send, Volume2, Square, Loader2, ExternalLink } from 'lucide-react'

interface FileActionsMenuProps {
  show: boolean
  x: number
  y: number
  fileName: string
  filePath: string
  isPinned: boolean
  isFavorite: boolean
  isPlaying: boolean
  isGeneratingAudio: boolean
  onClose: () => void
  onCopyPath: () => void
  onCopyAtPath: () => void
  onToggleFavorite: () => void
  onPin: () => void
  onOpenInEditor: () => void
  onSendToChat: () => void
  onPasteToTerminal: () => void
  onReadAloud: () => void
  onStopAudio: () => void
}

/**
 * FileActionsMenu - Context/dropdown menu for file actions
 *
 * Used in two places:
 * 1. File viewer toolbar - triggered by button click
 * 2. File tabs - triggered by right-click
 *
 * Actions:
 * - Copy Path / Copy @Path
 * - Pin / Favorite
 * - Open in Editor
 * - Send to Chat / Paste to Terminal
 * - Read Aloud (with loading state for TTS generation)
 */
export function FileActionsMenu({
  show,
  x,
  y,
  fileName,
  filePath,
  isPinned,
  isFavorite,
  isPlaying,
  isGeneratingAudio,
  onClose,
  onCopyPath,
  onCopyAtPath,
  onToggleFavorite,
  onPin,
  onOpenInEditor,
  onSendToChat,
  onPasteToTerminal,
  onReadAloud,
  onStopAudio,
}: FileActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  // Smart positioning - flip menu when near window edges
  useEffect(() => {
    if (show && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect()
      const padding = 8

      let adjustedX = x
      let adjustedY = y

      // Flip horizontally if menu would overflow right edge
      if (x + menuRect.width + padding > window.innerWidth) {
        adjustedX = x - menuRect.width
      }

      // Flip vertically if menu would overflow bottom edge
      if (y + menuRect.height + padding > window.innerHeight) {
        adjustedY = y - menuRect.height
      }

      // Ensure menu doesn't go off left/top edges
      adjustedX = Math.max(padding, adjustedX)
      adjustedY = Math.max(padding, adjustedY)

      setPosition({ x: adjustedX, y: adjustedY })
    }
  }, [show, x, y])

  // Close on click outside
  useEffect(() => {
    if (!show) return

    let mounted = true

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // Use setTimeout to avoid immediately closing from the same click that opened it
    const timeoutId = setTimeout(() => {
      if (mounted) {
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)
      }
    }, 0)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <div
      ref={menuRef}
      className="tab-context-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 10000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Copy actions */}
      <button
        className="context-menu-item"
        onClick={() => {
          onCopyPath()
          onClose()
        }}
      >
        <Copy className="w-4 h-4 inline mr-2" />
        Copy Path
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          onCopyAtPath()
          onClose()
        }}
      >
        <AtSign className="w-4 h-4 inline mr-2" />
        Copy @Path
      </button>

      <div className="context-menu-divider" />

      {/* Favorite */}
      <button
        className="context-menu-item"
        onClick={() => {
          onToggleFavorite()
          onClose()
        }}
      >
        <Star className={`w-4 h-4 inline mr-2 ${isFavorite ? 'fill-current text-yellow-400' : ''}`} />
        {isFavorite ? 'Remove Favorite' : 'Add Favorite'}
      </button>

      {/* Pin (only if not already pinned) */}
      {!isPinned && (
        <button
          className="context-menu-item"
          onClick={() => {
            onPin()
            onClose()
          }}
        >
          <Pin className="w-4 h-4 inline mr-2" />
          Pin Tab
        </button>
      )}

      <div className="context-menu-divider" />

      {/* Send actions */}
      <button
        className="context-menu-item"
        onClick={() => {
          onSendToChat()
          onClose()
        }}
      >
        <Send className="w-4 h-4 inline mr-2" />
        Send to Chat
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          onPasteToTerminal()
          onClose()
        }}
      >
        <Terminal className="w-4 h-4 inline mr-2" />
        Paste to Terminal
      </button>

      <div className="context-menu-divider" />

      {/* Audio */}
      {isPlaying ? (
        <button
          className="context-menu-item text-red-400"
          onClick={() => {
            onStopAudio()
            onClose()
          }}
        >
          <Square className="w-4 h-4 inline mr-2" />
          Stop Audio
        </button>
      ) : isGeneratingAudio ? (
        <button className="context-menu-item opacity-50 cursor-wait" disabled>
          <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
          Generating Audio...
        </button>
      ) : (
        <button
          className="context-menu-item"
          onClick={() => {
            onReadAloud()
            // Don't close - let user see loading state
          }}
        >
          <Volume2 className="w-4 h-4 inline mr-2" />
          Read Aloud
        </button>
      )}

      <div className="context-menu-divider" />

      {/* Open in Editor */}
      <button
        className="context-menu-item"
        onClick={() => {
          onOpenInEditor()
          onClose()
        }}
      >
        <ExternalLink className="w-4 h-4 inline mr-2" />
        Open in Editor
      </button>
    </div>
  )
}
