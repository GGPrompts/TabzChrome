import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FolderOpen, ChevronDown, X } from 'lucide-react'

/**
 * Props for the WorkingDirDropdown component
 */
interface WorkingDirDropdownProps {
  /** Current global working directory path */
  globalWorkingDir: string
  /** Callback to set the global working directory */
  setGlobalWorkingDir: (dir: string) => void
  /** List of recently used directories */
  recentDirs: string[]
  /** Callback to update recent directories list */
  setRecentDirs: React.Dispatch<React.SetStateAction<string[]>>
  /** Callback to add a directory to recent list */
  addToRecentDirs: (dir: string) => void
  /** Current value of the custom directory input */
  customDirInput: string
  /** Callback to update custom directory input */
  setCustomDirInput: (value: string) => void
  /** Whether the dropdown is currently visible */
  showDropdown: boolean
  /** Callback to toggle dropdown visibility */
  setShowDropdown: (show: boolean) => void
}

/**
 * WorkingDirDropdown - Working directory selector component
 *
 * Provides a dropdown interface for setting the global working directory.
 * The global working directory is inherited by profiles that don't have
 * an explicit workingDir set, enabling "tool profiles" (like lazygit)
 * that work across different projects.
 *
 * Features:
 * - Custom path input with Enter key submission
 * - Recent directories list (persisted to Chrome storage)
 * - Remove directories from recent list
 * - Tilde (~) expansion to home directory
 * - Syncs with backend API for dashboard consistency
 *
 * @param props - Dropdown state and callbacks
 * @returns Working directory dropdown component
 */
export function WorkingDirDropdown({
  globalWorkingDir,
  setGlobalWorkingDir,
  recentDirs,
  setRecentDirs,
  addToRecentDirs,
  customDirInput,
  setCustomDirInput,
  showDropdown,
  setShowDropdown,
}: WorkingDirDropdownProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  // Reset focus when dropdown opens/closes
  useEffect(() => {
    if (showDropdown) {
      setFocusedIndex(-1)
    }
  }, [showDropdown])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const element = itemRefs.current.get(focusedIndex)
      element?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const itemCount = recentDirs.length
    if (itemCount === 0 && e.key !== 'Escape') return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => (prev < itemCount - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break
      case 'Home':
        e.preventDefault()
        setFocusedIndex(0)
        break
      case 'End':
        e.preventDefault()
        setFocusedIndex(itemCount - 1)
        break
      case 'Enter':
        if (focusedIndex >= 0 && focusedIndex < itemCount) {
          e.preventDefault()
          const selectedDir = recentDirs[focusedIndex]
          setGlobalWorkingDir(selectedDir)
          setShowDropdown(false)
        }
        // If focusedIndex is -1, let the input handle Enter
        break
      case 'Escape':
        e.preventDefault()
        setShowDropdown(false)
        break
    }
  }, [recentDirs, focusedIndex, setGlobalWorkingDir, setShowDropdown])

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
          setCustomDirInput('')
        }}
        className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88] max-w-[220px]"
        title={`Working Directory: ${globalWorkingDir}`}
        aria-label={`Working directory: ${globalWorkingDir}. Click to change.`}
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      >
        <FolderOpen className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs truncate">{globalWorkingDir}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      </button>

      {showDropdown && (
        <div
          className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[220px] z-50 overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Custom input */}
          <div className="p-2 border-b border-gray-800">
            <input
              ref={inputRef}
              type="text"
              value={customDirInput}
              onChange={(e) => setCustomDirInput(e.target.value)}
              onKeyDown={(e) => {
                // Handle Enter for custom input (if no item focused)
                if (e.key === 'Enter' && customDirInput.trim() && focusedIndex < 0) {
                  setGlobalWorkingDir(customDirInput.trim())
                  addToRecentDirs(customDirInput.trim())
                  setShowDropdown(false)
                  setCustomDirInput('')
                  e.stopPropagation()
                } else if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(e.key)) {
                  // Let parent handle navigation keys
                } else {
                  e.stopPropagation()
                }
              }}
              placeholder="Type path and press Enter"
              className="w-full px-2 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs font-mono focus:border-[#00ff88] focus:outline-none"
              onClick={(e) => e.stopPropagation()}
              autoFocus
              aria-label="Enter custom directory path"
              aria-activedescendant={focusedIndex >= 0 ? `workdir-item-${focusedIndex}` : undefined}
            />
          </div>
          {/* Recent directories */}
          <div className="max-h-[200px] overflow-y-auto" role="listbox" aria-label="Recent directories">
            {recentDirs.map((dir, index) => {
              const isFocused = focusedIndex === index
              const isSelected = dir === globalWorkingDir
              return (
                <div
                  key={dir}
                  className={`flex items-center justify-between px-3 py-2 hover:bg-[#00ff88]/10 transition-colors text-xs font-mono border-b border-gray-800 last:border-b-0 group ${
                    isSelected ? 'text-[#00ff88] bg-[#00ff88]/5' : 'text-gray-300'
                  } ${isFocused ? 'bg-[#00ff88]/20 outline outline-2 outline-[#00ff88]/50' : ''}`}
                >
                  <button
                    ref={(el) => {
                      if (el) itemRefs.current.set(index, el)
                    }}
                    id={`workdir-item-${index}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setGlobalWorkingDir(dir)
                      setShowDropdown(false)
                    }}
                    className="flex-1 text-left truncate"
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`Select directory ${dir}`}
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
                    aria-label={`Remove ${dir} from recent directories`}
                    tabIndex={-1}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
