import React, { useRef, useEffect, useState } from 'react'
import { Copy, AtSign, Star, Pin, Terminal } from 'lucide-react'

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
 * - **Open in Editor**: Open file in user's default editor (files only)
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
        </>
      )}
    </div>
  )
}
