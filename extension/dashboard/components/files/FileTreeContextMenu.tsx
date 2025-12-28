import React, { useRef, useEffect, useState } from 'react'
import { Copy, AtSign, Star, Pin, Terminal, Send, Volume2, Loader2, FolderOpen, Play, CheckCircle, Brain, X } from 'lucide-react'
import type { ScriptInfo } from '../../utils/claudeFileTypes'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
}

interface FileTreeContextMenuProps {
  show: boolean
  x: number
  y: number
  node: FileNode | null
  isFavorite: boolean
  onClose: () => void
  onCopy: () => void
  onCopyAtPath: () => void
  onToggleFavorite: () => void
  onPin: () => void
  onOpenInEditor: () => void
  // New actions for files
  onSendToChat?: () => void
  onPasteToTerminal?: () => void
  onReadAloud?: () => void
  isLoadingAudio?: boolean
  // New action for directories
  onSetWorkingDir?: () => void
  // Script actions
  scriptInfo?: ScriptInfo | null
  onRunScript?: () => void
  onCheckScript?: () => void
  onExplainScript?: () => void
  isExplaining?: boolean
  explainResult?: string | null
  onClearExplainResult?: () => void
}

/**
 * FileTreeContextMenu - Right-click context menu for file tree items
 *
 * Provides file/folder operations when right-clicking in the file tree.
 * Uses smart positioning to stay within window bounds.
 *
 * Available actions:
 * - **Copy**: Copy the file/folder path to clipboard
 * - **Copy @Path**: Copy path with @ prefix (for Claude references)
 * - **Favorite**: Toggle favorite status (works for files AND folders)
 * - **Pin**: Open file as pinned tab (files only)
 * - **Send to Chat**: Queue file content to sidebar chat (files only)
 * - **Paste to Terminal**: Paste file content to active terminal (files only)
 * - **Read Aloud**: TTS playback of file content (files only)
 * - **Open in Editor**: Open file in user's default editor (files only)
 * - **Set as Working Dir**: Set folder as working directory (folders only)
 *
 * Script-specific actions (for .sh, .py, .js, .ts, etc.):
 * - **Run**: Execute script in new terminal
 * - **Check**: Syntax check / dry run
 * - **Explain**: Use Claude to explain what the script does
 */
export function FileTreeContextMenu({
  show,
  x,
  y,
  node,
  isFavorite,
  onClose,
  onCopy,
  onCopyAtPath,
  onToggleFavorite,
  onPin,
  onOpenInEditor,
  onSendToChat,
  onPasteToTerminal,
  onReadAloud,
  isLoadingAudio,
  onSetWorkingDir,
  // Script actions
  scriptInfo,
  onRunScript,
  onCheckScript,
  onExplainScript,
  isExplaining,
  explainResult,
  onClearExplainResult,
}: FileTreeContextMenuProps) {
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

  if (!show || !node) return null

  const isFile = node.type === 'file'

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
          onCopy()
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

      {/* Favorite - works for both files and folders */}
      <button
        className="context-menu-item"
        onClick={() => {
          onToggleFavorite()
          onClose()
        }}
      >
        <Star className={`w-4 h-4 inline mr-2 ${isFavorite ? 'fill-current text-yellow-400' : ''}`} />
        {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
      </button>

      {/* File-only actions */}
      {isFile && (
        <>
          <button
            className="context-menu-item"
            onClick={() => {
              onPin()
              onClose()
            }}
          >
            <Pin className="w-4 h-4 inline mr-2" />
            Pin
          </button>

          <div className="context-menu-divider" />

          {/* Send actions */}
          {onSendToChat && (
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
          )}
          {onPasteToTerminal && (
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
          )}
          {onReadAloud && (
            <button
              className={`context-menu-item ${isLoadingAudio ? 'opacity-50 cursor-wait' : ''}`}
              onClick={() => {
                if (!isLoadingAudio) {
                  onReadAloud()
                  // Don't close - let user see loading state
                }
              }}
              disabled={isLoadingAudio}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
              ) : (
                <Volume2 className="w-4 h-4 inline mr-2" />
              )}
              {isLoadingAudio ? 'Loading...' : 'Read Aloud'}
            </button>
          )}

          {(onSendToChat || onPasteToTerminal || onReadAloud) && (
            <div className="context-menu-divider" />
          )}

          <button
            className="context-menu-item"
            onClick={() => {
              onOpenInEditor()
              onClose()
            }}
          >
            <Terminal className="w-4 h-4 inline mr-2" />
            Open in Editor
          </button>

          {/* Script actions */}
          {scriptInfo && (
            <>
              <div className="context-menu-divider" />
              <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                {scriptInfo.icon} Script Actions
              </div>
              <button
                className="context-menu-item text-green-400"
                onClick={() => {
                  onRunScript?.()
                  onClose()
                }}
              >
                <Play className="w-4 h-4 inline mr-2" />
                Run Script
              </button>
              {scriptInfo.syntaxCheckCommand && (
                <button
                  className="context-menu-item text-yellow-400"
                  onClick={() => {
                    onCheckScript?.()
                    onClose()
                  }}
                >
                  <CheckCircle className="w-4 h-4 inline mr-2" />
                  Check / Dry Run
                </button>
              )}
              <button
                className={`context-menu-item text-purple-400 ${isExplaining ? 'opacity-50 cursor-wait' : ''}`}
                onClick={() => {
                  if (!isExplaining) {
                    onExplainScript?.()
                    // Don't close - show result in menu
                  }
                }}
                disabled={isExplaining}
              >
                {isExplaining ? (
                  <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4 inline mr-2" />
                )}
                {isExplaining ? 'Analyzing...' : 'Explain Script'}
              </button>
            </>
          )}

          {/* Explain result display */}
          {explainResult && (
            <div className="mt-2 mx-2 p-2 bg-muted/50 rounded text-xs max-w-xs max-h-48 overflow-auto">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-purple-400">Explanation:</span>
                <button
                  onClick={() => onClearExplainResult?.()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-foreground">{explainResult}</pre>
            </div>
          )}
        </>
      )}

      {/* Directory-only actions */}
      {!isFile && onSetWorkingDir && (
        <>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={() => {
              onSetWorkingDir()
              onClose()
            }}
          >
            <FolderOpen className="w-4 h-4 inline mr-2" />
            Set as Working Dir
          </button>
        </>
      )}
    </div>
  )
}
