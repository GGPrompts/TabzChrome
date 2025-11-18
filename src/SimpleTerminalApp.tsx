import React, { useState, useEffect, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import './SimpleTerminalApp.css'
import { Terminal } from './components/Terminal'
import { SplitLayout } from './components/SplitLayout'
import { SettingsModal } from './components/SettingsModal'
import { HotkeysHelpModal } from './components/HotkeysHelpModal'
import { FontFamilyDropdown } from './components/FontFamilyDropdown'
import { BackgroundGradientDropdown } from './components/BackgroundGradientDropdown'
import { TextColorThemeDropdown } from './components/TextColorThemeDropdown'
import { Agent, TERMINAL_TYPES } from './types'
import { useSimpleTerminalStore, Terminal as StoredTerminal } from './stores/simpleTerminalStore'
import { useSettingsStore } from './stores/useSettingsStore'
import SimpleSpawnService from './services/SimpleSpawnService'
import { backgroundGradients, getBackgroundCSS } from './styles/terminal-backgrounds'
import { THEME_BACKGROUNDS, TERMINAL_TYPE_ABBREVIATIONS, COMMAND_ABBREVIATIONS } from './constants/terminalConfig'
import { generateWindowId, getCurrentWindowId, updateUrlWithWindowId } from './utils/windowUtils'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTerminalSpawning } from './hooks/useTerminalSpawning'
import { usePopout } from './hooks/usePopout'
import { useDragDrop } from './hooks/useDragDrop'
import { useWebSocketManager } from './hooks/useWebSocketManager'
import { useTerminalNameSync } from './hooks/useTerminalNameSync'
import { useClaudeCodeStatus, ClaudeCodeStatus } from './hooks/useClaudeCodeStatus'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Extend Window interface for handlePopOutTab
declare global {
  interface Window {
    handlePopOutTab?: (terminalId: string, targetWindowId?: string, popoutMode?: 'tab' | 'window') => void
  }
}

interface SpawnOption {
  label: string
  command: string
  terminalType: string
  icon: string
  description: string
  workingDir?: string
  workingDirOverride?: string // Override from spawn menu (highest priority)
  defaultTheme?: string
  defaultBackground?: string // Background gradient key
  defaultTransparency?: number
  defaultFontFamily?: string
  defaultFontSize?: number
}

// Drop zone type
type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null

// SortableTab component - makes each tab draggable with drop zones
interface SortableTabProps {
  terminal: StoredTerminal
  isActive: boolean
  isFocused: boolean
  isSplitActive: boolean
  onActivate: () => void
  onClose: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, terminalId: string) => void
  dropZone: DropZone
  isDraggedOver: boolean
  mousePosition: React.MutableRefObject<{ x: number; y: number }>
  splitPosition?: 'single' | 'left' | 'middle' | 'right'
  claudeCodeStatuses: Map<string, ClaudeCodeStatus>
}

function SortableTab({ terminal, isActive, isFocused, isSplitActive, onActivate, onClose, onContextMenu, dropZone, isDraggedOver, mousePosition, splitPosition = 'single', claudeCodeStatuses }: SortableTabProps) {
  // LOCK SPLIT PANES: Disable dragging for terminals that are part of a split (but not the container)
  const isPartOfSplit = splitPosition !== 'single'
  const isDraggable = !isPartOfSplit

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: terminal.id,
    // Disable layout animations to prevent tabs from shifting during drag
    animateLayoutChanges: () => false,
    // Disable dragging for split pane tabs (lock them together)
    disabled: !isDraggable,
  })

  const style = {
    // ONLY show transform for the item being dragged
    // Other tabs stay completely static (no shifting)
    transform: isDragging ? CSS.Transform.toString(transform) : undefined,
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Helper to get all terminals in the store (we'll pass this as a prop later)
  const { terminals: allTerminals } = useSimpleTerminalStore()

  // Check if this tab has splits (can't merge into it via any edge)
  const hasSplits = terminal.splitLayout && terminal.splitLayout.type !== 'single'

  // Determine if we're in an edge zone or center zone for visual feedback
  const [isEdgeZone, setIsEdgeZone] = React.useState(false)

  // Update edge zone continuously during drag using requestAnimationFrame
  React.useEffect(() => {
    if (isDraggedOver && dropZone) {
      let rafId: number

      const updateEdgeZone = () => {
        const tabElement = document.querySelector(`[data-tab-id="${terminal.id}"]`)
        if (tabElement) {
          const rect = tabElement.getBoundingClientRect()
          // Use current mouse position from parent
          const xPercent = (mousePosition.current.x - rect.left) / rect.width
          const yPercent = (mousePosition.current.y - rect.top) / rect.height
          const edgeThreshold = 0.15

          const inEdge =
            yPercent < edgeThreshold ||
            yPercent > 1 - edgeThreshold ||
            xPercent < edgeThreshold ||
            xPercent > 1 - edgeThreshold

          setIsEdgeZone(inEdge)
        }

        // Continue updating while dragging
        if (isDraggedOver) {
          rafId = requestAnimationFrame(updateEdgeZone)
        }
      }

      rafId = requestAnimationFrame(updateEdgeZone)

      return () => {
        if (rafId) cancelAnimationFrame(rafId)
      }
    } else {
      // Clear edge zone when not being dragged over
      setIsEdgeZone(false)
    }
  }, [isDraggedOver, dropZone, terminal.id])

  // Show blocked overlay when trying to use ANY edge zone on a split tab
  const isBlocked = isDraggedOver && hasSplits && isEdgeZone

  // Render split icon with arrow indicator
  const renderTabIcon = () => {
    if (terminal.status === 'spawning') {
      return <span className="tab-icon-single">⏳</span>
    }

    // Check if this is a split terminal
    if (terminal.splitLayout && terminal.splitLayout.type !== 'single' && terminal.splitLayout.panes.length > 0) {
      const isVertical = terminal.splitLayout.type === 'vertical'
      const splitArrow = isVertical ? '↔' : '↕'

      // Get icons from both panes
      const paneIcons = terminal.splitLayout.panes.map(pane => {
        const paneTerminal = allTerminals.find(t => t.id === pane.terminalId)
        return paneTerminal?.icon || '💻'
      })

      return (
        <span className="tab-icon-split">
          <span className="split-arrow">{splitArrow}</span>
          {paneIcons.map((icon, idx) => (
            <span key={idx} className="split-emoji">{icon}</span>
          ))}
        </span>
      )
    }

    // Regular single terminal
    return (
      <span className="tab-icon-single">
        {terminal.icon || TERMINAL_TYPES.find(t => t.value === terminal.terminalType)?.icon || '💻'}
      </span>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        cursor: isDraggable ? 'grab' : 'default', // Show non-draggable cursor for split panes
      }}
      data-tab-id={terminal.id}
      className={`tab ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''} ${isSplitActive ? 'split-active' : ''} ${terminal.status === 'spawning' ? 'spawning' : ''} ${terminal.status === 'detached' ? 'detached' : ''} ${isDraggedOver ? 'drag-over' : ''} ${isBlocked ? 'merge-blocked' : ''} ${splitPosition !== 'single' ? `split-${splitPosition}` : ''} ${isPartOfSplit ? 'locked' : ''}`}
      onClick={onActivate}
      onContextMenu={(e) => onContextMenu(e, terminal.id)}
      {...attributes}
      {...(isDraggable ? listeners : {})}
    >
      {terminal.status === 'detached' ? (
        <span className="tab-icon-single">📌</span>
      ) : (
        <span className="tab-icon-single">{terminal.icon || '💻'}</span>
      )}
      <span className="tab-label">{terminal.name}</span>

      {/* Claude Code Status Badge */}
      {terminal.terminalType === 'claude-code' && (() => {
        const status = claudeCodeStatuses.get(terminal.id)

        let statusText = ''
        let statusClass = ''

        if (!status || status.status === 'unknown') {
          // Show idle/ready when no status file exists yet
          statusText = '✓ Ready'
          statusClass = 'status-ready'
        } else {
          switch (status.status) {
            case 'idle':
            case 'awaiting_input':
              statusText = '✓ Ready'
              statusClass = 'status-ready'
              break
            case 'processing':
              statusText = '⏳ Processing'
              statusClass = 'status-processing'
              break
            case 'tool_use':
              // Extract detail from args for more informative display
              let detail = ''
              if (status.details?.args) {
                const args = status.details.args
                // Extract based on tool type
                if (args.file_path) {
                  // Show just filename for Read/Edit/Write
                  const parts = args.file_path.split('/')
                  detail = `: ${parts[parts.length - 1]}`
                } else if (args.command) {
                  // Show truncated command for Bash
                  const cmd = args.command
                  detail = `: ${cmd.length > 25 ? cmd.substring(0, 25) + '...' : cmd}`
                } else if (args.pattern) {
                  // Show search pattern for Grep/Glob
                  const pattern = args.pattern
                  detail = `: ${pattern.length > 20 ? pattern.substring(0, 20) + '...' : pattern}`
                } else if (args.description) {
                  // Show task description for Task
                  detail = `: ${args.description}`
                }
              }
              statusText = status.current_tool ? `🔧 ${status.current_tool}${detail}` : '🔧 Tool'
              statusClass = 'status-tool'
              break
            case 'working':
              statusText = '⚙️ Working'
              statusClass = 'status-working'
              break
            default:
              statusText = '✓ Ready'
              statusClass = 'status-ready'
          }
        }

        return <span className={`claude-status-badge ${statusClass}`}>{statusText}</span>
      })()}

      {/* Drop Zone Overlay - shows when dragging over this tab for splits */}
      {isDraggedOver && dropZone && !isBlocked && isEdgeZone && (
        <div className="drop-zone-overlay">
          {dropZone === 'left' && <div className="drop-zone-left"></div>}
          {dropZone === 'right' && <div className="drop-zone-right"></div>}
          {dropZone === 'top' && <div className="drop-zone-top"></div>}
          {dropZone === 'bottom' && <div className="drop-zone-bottom"></div>}
        </div>
      )}

      {/* Reorder Indicator - vertical line showing insertion point for reordering */}
      {isDraggedOver && dropZone && !isBlocked && !isEdgeZone && (
        <div className={`reorder-indicator ${dropZone}`}></div>
      )}

      {/* Blocked Overlay - shows when trying to split into/from split panes */}
      {isBlocked && (
        <div className="merge-blocked-overlay">
          <div className="blocked-icon">🔒</div>
          <div className="blocked-text">Split panes are locked<br/>(Use "Unsplit" in context menu)</div>
        </div>
      )}
    </div>
  )
}

function SimpleTerminalApp() {
  const [showSpawnMenu, setShowSpawnMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHotkeysHelp, setShowHotkeysHelp] = useState(false)

  // Initialize currentWindowId first to determine header visibility
  const [currentWindowId] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const windowId = getCurrentWindowId(urlParams)
    updateUrlWithWindowId(windowId)
    return windowId
  })

  // Collapse header by default for popout windows (not main window)
  const [headerVisible, setHeaderVisible] = useState(currentWindowId === 'main')

  // Console error tracking
  const [consoleErrors, setConsoleErrors] = useState<Array<{
    message: string
    timestamp: number
    stack?: string
  }>>([])
  const [showErrorModal, setShowErrorModal] = useState(false)

  // Expected errors to ignore (non-critical)
  const isExpectedError = (message: string): boolean => {
    const expectedPatterns = [
      /spawn not found/i,
      /after detaching/i,
      /terminal.*not found.*after detach/i,
      /websocket.*already.*closed/i,
      /connection.*already.*closed/i,
      /terminal not found for agentId/i,  // Expected during reattach
      /\[useWebSocketManager\].*not found/i,  // WebSocket manager warnings
    ]
    return expectedPatterns.some(pattern => pattern.test(message))
  }

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    terminalId: string | null
  }>({ show: false, x: 0, y: 0, terminalId: null })

  // Rename dialog state
  const [renameDialog, setRenameDialog] = useState<{
    show: boolean
    terminalId: string | null
    currentName: string
  }>({ show: false, terminalId: null, currentName: '' })

  // Detached terminals dropdown state
  const [showDetachedDropdown, setShowDetachedDropdown] = useState(false)
  const [detachedDropdownPosition, setDetachedDropdownPosition] = useState({ top: 0, left: 0 })
  const detachedDropdownRef = useRef<HTMLDivElement>(null)
  const detachedTabRef = useRef<HTMLDivElement>(null)

  // Settings
  const { useTmux, updateSettings } = useSettingsStore()
  const [showCustomizePanel, setShowCustomizePanel] = useState(false)
  const [spawnOptions, setSpawnOptions] = useState<SpawnOption[]>([])
  const spawnOptionsRef = useRef<SpawnOption[]>([]) // Ref to avoid closure issues

  // Multi-select spawn options
  const [spawnSearchText, setSpawnSearchText] = useState('')
  const [spawnWorkingDirOverride, setSpawnWorkingDirOverride] = useState('')
  const [selectedSpawnOptions, setSelectedSpawnOptions] = useState<Set<number>>(new Set())
  const [projects, setProjects] = useState<Array<{ name: string; workingDir: string }>>([])
  const [selectedProject, setSelectedProject] = useState('')

  const terminalRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null) // Needed by both spawning and WebSocket hooks
  const pendingSpawns = useRef<Map<string, StoredTerminal>>(new Map()) // Track pending spawns by requestId

  const {
    terminals: storedTerminals,
    activeTerminalId,
    focusedTerminalId,
    addTerminal,
    removeTerminal,
    updateTerminal,
    setActiveTerminal,
    clearAllTerminals,
    reorderTerminals,
    setFocusedTerminal,
  } = useSimpleTerminalStore()

  // Filter terminals by current window ID
  // Each window only shows terminals that belong to it (or have no windowId yet = default to main window)
  // EXCEPT: Detached terminals show in ALL windows so they can be re-attached anywhere
  // NEW: Split panes now show as tabs (styled to look merged)
  const visibleTerminals = useMemo(() => {
    const filtered = storedTerminals.filter(t => {
      // CHANGED: Don't show individual detached terminals as tabs
      // They'll be consolidated into one "Detached Terminals" tab
      if (t.status === 'detached') return false

      // Terminals without a windowId belong to the main window (backwards compatibility)
      const terminalWindow = t.windowId || 'main'

      // Show only terminals that belong to this window
      return terminalWindow === currentWindowId
    })

    return filtered
  }, [storedTerminals, currentWindowId])

  // Get all detached terminals (show in ALL windows)
  const detachedTerminals = useMemo(() => {
    return storedTerminals.filter(t => t.status === 'detached')
  }, [storedTerminals])

  // Detect split tab positions for merged styling
  const splitTabInfo = useMemo(() => {
    const info = new Map<string, { position: 'single' | 'left' | 'middle' | 'right', splitContainerId: string }>()

    visibleTerminals.forEach(terminal => {
      // Check if this terminal is part of a split (find container)
      const splitContainer = visibleTerminals.find(t =>
        t.splitLayout?.panes?.some(p => p.terminalId === terminal.id)
      )

      if (splitContainer?.splitLayout && splitContainer.splitLayout.type !== 'single') {
        const panes = splitContainer.splitLayout.panes
        const paneIndex = panes.findIndex(p => p.terminalId === terminal.id)

        if (paneIndex !== -1) {
          let position: 'left' | 'middle' | 'right'
          if (panes.length === 2) {
            position = paneIndex === 0 ? 'left' : 'right'
          } else {
            position = paneIndex === 0 ? 'left' : paneIndex === panes.length - 1 ? 'right' : 'middle'
          }

          info.set(terminal.id, { position, splitContainerId: splitContainer.id })
        }
      } else {
        info.set(terminal.id, { position: 'single', splitContainerId: '' })
      }
    })

    return info
  }, [visibleTerminals])

  // Drag-and-drop logic (extracted to custom hook)
  const {
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    customCollisionDetection,
    draggedTerminalId,
    dropZoneState,
    mousePosition
  } = useDragDrop(
    storedTerminals,
    visibleTerminals,
    updateTerminal,
    reorderTerminals,
    setActiveTerminal,
    setFocusedTerminal
  )

  // Expose store to window for testing (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      (window as any).terminalStore = useSimpleTerminalStore;
      console.log('[Dev] Terminal store exposed to window.terminalStore');
    }
  }, []);

  // Intercept console errors for error indicator
  useEffect(() => {
    const originalError = console.error
    const originalWarn = console.warn

    console.error = (...args: any[]) => {
      // Call original first
      originalError.apply(console, args)

      // Track error (limit to last 50)
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')

      // Skip expected/non-critical errors
      if (isExpectedError(message)) {
        return
      }

      const stack = new Error().stack

      setConsoleErrors(prev => {
        const newErrors = [...prev, { message, timestamp: Date.now(), stack }]
        return newErrors.slice(-50) // Keep only last 50 errors
      })
    }

    console.warn = (...args: any[]) => {
      // Call original first
      originalWarn.apply(console, args)

      // Track warning as error too (for debugging)
      const message = '⚠️ ' + args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')

      // Skip expected/non-critical warnings
      if (isExpectedError(message)) {
        return
      }

      setConsoleErrors(prev => {
        const newErrors = [...prev, { message, timestamp: Date.now() }]
        return newErrors.slice(-50)
      })
    }

    // Restore on cleanup
    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  // Set browser tab title based on window and active terminal
  useEffect(() => {
    if (currentWindowId === 'main') {
      document.title = 'Tabz'
    } else {
      // For popped-out windows, show active terminal name or window number
      const activeTerminal = storedTerminals.find(t => t.id === activeTerminalId)
      if (activeTerminal && visibleTerminals.length > 0) {
        document.title = `Tabz - ${activeTerminal.name}`
      } else {
        // Extract a simple number from window ID for clean display
        const windowMatch = currentWindowId.match(/window-(\d+)/)
        const windowNum = windowMatch ? Math.floor(parseInt(windowMatch[1]) / 1000000000) : '?'
        document.title = `Tabz ${windowNum}`
      }
    }
  }, [currentWindowId, activeTerminalId, storedTerminals, visibleTerminals.length])

  // Check for ?active=xxx parameter to set initial active terminal (for popout windows)
  // CRITICAL: Watch full storedTerminals array, not just length, to catch windowId changes
  const activeFromUrlRef = useRef<string | null>(null)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const activeFromUrl = urlParams.get('active')

    // Only process if we have a URL param and haven't processed it yet
    if (!activeFromUrl || activeFromUrlRef.current === activeFromUrl) {
      return
    }

    console.log(`[SimpleTerminalApp] Setting active terminal from URL: ${activeFromUrl}`)

    // Find this terminal in our stored terminals
    const terminal = storedTerminals.find(t => t.id === activeFromUrl)
    if (terminal) {
      // Check if it belongs to this window
      const terminalWindow = terminal.windowId || 'main'
      if (terminalWindow === currentWindowId) {
        setActiveTerminal(activeFromUrl)
        activeFromUrlRef.current = activeFromUrl
        // Clean up URL parameter
        const newUrl = new URL(window.location.href)
        newUrl.searchParams.delete('active')
        window.history.replaceState({}, '', newUrl)
        console.log(`[SimpleTerminalApp] ✓ Activated terminal: ${terminal.name}`)
      } else {
        console.warn(`[SimpleTerminalApp] Terminal ${activeFromUrl} belongs to different window: ${terminalWindow}, current: ${currentWindowId}`)
      }
    } else {
      console.warn(`[SimpleTerminalApp] Terminal ${activeFromUrl} not found yet, waiting for localStorage sync...`)
    }
  }, [storedTerminals, currentWindowId]) // Re-run when terminals change (not just length!)

  // Handle window closing - mark terminals as detached when popped-out window closes
  useEffect(() => {
    const handleBeforeUnload = async () => {
      // Only mark terminals as detached if this is NOT the main window
      if (currentWindowId === 'main') return

      console.log(`[SimpleTerminalApp] Window ${currentWindowId} closing, marking terminals as detached`)

      // Find all terminals belonging to this window
      const windowTerminals = storedTerminals.filter(t =>
        (t.windowId || 'main') === currentWindowId &&
        t.status === 'active' // Only detach active terminals
      )

      if (windowTerminals.length === 0) return

      console.log(`[SimpleTerminalApp] Detaching ${windowTerminals.length} terminals:`, windowTerminals.map(t => t.name))

      // Mark each terminal as detached
      // Note: BroadcastChannel middleware will automatically sync to other windows
      windowTerminals.forEach(terminal => {
        updateTerminal(terminal.id, {
          status: 'detached',
          agentId: undefined,
          windowId: undefined,
        })
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [currentWindowId, storedTerminals, updateTerminal])

  // Load spawn options from JSON file
  const loadSpawnOptions = () => {
    console.log('[SimpleTerminalApp] 📥 Loading spawn options...')
    fetch('/spawn-options.json')
      .then(res => res.json())
      .then(data => {
        if (data.spawnOptions) {
          console.log('[SimpleTerminalApp] ✅ Spawn options loaded:', data.spawnOptions.length, 'options')
          setSpawnOptions(data.spawnOptions)
          spawnOptionsRef.current = data.spawnOptions // Update ref immediately
        }

        // Load projects from file
        if (data.projects) {
          console.log('[SimpleTerminalApp] ✅ Projects loaded:', data.projects.length, 'projects')
          setProjects(data.projects)
        }

        // Load global defaults from file and apply to settings store
        if (data.globalDefaults) {
          const defaults = data.globalDefaults
          console.log('[SimpleTerminalApp] 📝 Loading global defaults from spawn-options.json:', defaults)
          updateSettings({
            workingDirectory: defaults.workingDirectory ?? settings.workingDirectory,
            terminalDefaultFontFamily: defaults.fontFamily ?? settings.terminalDefaultFontFamily,
            terminalDefaultFontSize: defaults.fontSize ?? settings.terminalDefaultFontSize,
            terminalDefaultTheme: defaults.theme ?? settings.terminalDefaultTheme,
            terminalDefaultBackground: defaults.background ?? settings.terminalDefaultBackground,
            terminalDefaultTransparency: (defaults.transparency ?? 100) / 100, // Convert % to 0-1
            useTmux: defaults.useTmux ?? settings.useTmux,
          })
        }
      })
      .catch(err => console.error('[SimpleTerminalApp] ❌ Failed to load spawn options:', err))
  }

  // Keep ref in sync with state
  useEffect(() => {
    spawnOptionsRef.current = spawnOptions
  }, [spawnOptions])

  useEffect(() => {
    loadSpawnOptions()
  }, [])

  // Terminal spawning logic (extracted to custom hook)
  const { handleSpawnTerminal: spawnTerminal, handleReconnectTerminal, generateSessionName } = useTerminalSpawning(
    currentWindowId,
    useTmux,
    wsRef,
    pendingSpawns
  )

  // WebSocket connection management (extracted to custom hook)
  // Must be called after useTerminalSpawning to use handleReconnectTerminal
  // CRITICAL: Pass wsRef so Terminal components can send input via same WebSocket!
  const { webSocketAgents, connectionStatus, setWebSocketAgents, clearProcessedAgentId } = useWebSocketManager(
    currentWindowId,
    storedTerminals,
    activeTerminalId,
    spawnOptions,
    spawnOptionsRef,
    useTmux,
    pendingSpawns,
    wsRef, // CRITICAL: Share wsRef with hook so terminals can send input!
    updateTerminal,
    removeTerminal,
    setActiveTerminal,
    handleReconnectTerminal
  )

  // Terminal name syncing from tmux pane titles (auto-update tab names)
  useTerminalNameSync(currentWindowId, useTmux)

  // Status badges - tracks Claude Code terminal status from state-tracker hook
  const claudeCodeStatuses = useClaudeCodeStatus(storedTerminals, currentWindowId)

  // Merge WebSocket agents with stored terminals
  const agents = useMemo(() => {
    const activeAgentsMap = new Map(webSocketAgents.map(a => [a.id, a]))
    const result: Agent[] = []
    const processedIds = new Set<string>()

    storedTerminals.forEach(terminal => {
      if (terminal.agentId) {
        const activeAgent = activeAgentsMap.get(terminal.agentId)
        if (activeAgent && !processedIds.has(activeAgent.id)) {
          result.push(activeAgent)
          processedIds.add(activeAgent.id)
          activeAgentsMap.delete(terminal.agentId)
        }
      }
    })

    activeAgentsMap.forEach((agent, id) => {
      if (!processedIds.has(id)) {
        result.push(agent)
        processedIds.add(id)
      }
    })

    return result
  }, [webSocketAgents, storedTerminals])

  // Wrapper to spawn terminal (optionally close menu)
  const handleSpawnTerminal = async (option: SpawnOption, closeMenu = true) => {
    if (closeMenu) {
      setShowSpawnMenu(false)
      setSpawnWorkingDirOverride('')
      setSelectedSpawnOptions(new Set())
    }
    // Pass working dir override through option
    const optionWithOverride = spawnWorkingDirOverride
      ? { ...option, workingDirOverride: spawnWorkingDirOverride }
      : option
    await spawnTerminal(optionWithOverride)
  }

  // Bulk spawn with staggered delays for better reliability
  const handleBulkSpawn = async () => {
    const selectedIndices = Array.from(selectedSpawnOptions)
    console.log(`[SimpleTerminalApp] Bulk spawning ${selectedIndices.length} terminals with 150ms stagger`)

    // Close menu and clear selections
    setShowSpawnMenu(false)
    const workingDirOverride = spawnWorkingDirOverride
    setSpawnWorkingDirOverride('')
    setSelectedSpawnOptions(new Set())

    // Spawn terminals with 150ms delay between each
    for (let i = 0; i < selectedIndices.length; i++) {
      const idx = selectedIndices[i]
      const option = spawnOptions[idx]
      console.log(`[SimpleTerminalApp] Spawning ${i + 1}/${selectedIndices.length}: ${option.label}`)

      // Apply working dir override if set
      const optionWithOverride = workingDirOverride
        ? { ...option, workingDirOverride }
        : option
      await spawnTerminal(optionWithOverride)

      // Add delay except after last terminal
      if (i < selectedIndices.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    }

    console.log(`[SimpleTerminalApp] ✅ Bulk spawn complete: ${selectedIndices.length} terminals`)
  }

  // Multi-window popout logic (extracted to custom hook)
  const { handlePopOutTab } = usePopout(
    currentWindowId,
    storedTerminals,
    activeTerminalId,
    visibleTerminals,
    useTmux,
    wsRef,
    updateTerminal,
    setActiveTerminal
  )

  // Expose handlePopOutTab to window for SortableTab to use
  useEffect(() => {
    window.handlePopOutTab = handlePopOutTab
    return () => {
      delete window.handlePopOutTab
    }
  }, [handlePopOutTab])

  // Close context menu on outside click
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

  // Close detached dropdown on outside click
  useEffect(() => {
    if (!showDetachedDropdown) return

    const handleClick = (e: MouseEvent) => {
      if (detachedDropdownRef.current && !detachedDropdownRef.current.contains(e.target as Node)) {
        setShowDetachedDropdown(false)
      }
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [showDetachedDropdown])

  // Handle right-click on tab
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

  // Handle "Unsplit" context menu option
  const handleContextUnsplit = () => {
    if (!contextMenu.terminalId) return
    const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId)
    if (!terminal) return

    // Determine which pane to pop out
    let paneToPopOut: string | null = null

    if (terminal.splitLayout && terminal.splitLayout.type !== 'single') {
      // Terminal is a container - use focusedTerminalId
      paneToPopOut = focusedTerminalId
    } else {
      // Terminal is a pane - use its own ID
      paneToPopOut = terminal.id
    }

    if (paneToPopOut) {
      handlePopOutPane(paneToPopOut)
    }
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle "Pop out to new window" context menu option
  const handleContextPopOut = (mode: 'tab' | 'window' = 'tab') => {
    if (!contextMenu.terminalId) return
    handlePopOutTab(contextMenu.terminalId, undefined, mode)
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle "Rename Tab" context menu option
  const handleContextRename = () => {
    if (!contextMenu.terminalId) return
    const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId)
    if (!terminal) return

    setRenameDialog({
      show: true,
      terminalId: terminal.id,
      currentName: terminal.customName || terminal.name
    })
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle rename dialog save
  const handleRenameSave = (newName: string, autoUpdate: boolean) => {
    if (!renameDialog.terminalId) return

    updateTerminal(renameDialog.terminalId, {
      customName: autoUpdate ? undefined : newName, // Clear customName if auto-update is on
      name: newName,
      autoUpdateName: autoUpdate
    })

    setRenameDialog({ show: false, terminalId: null, currentName: '' })
  }

  // Handle "Detach" context menu option
  const handleContextDetach = async () => {
    if (!contextMenu.terminalId) return
    const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId)
    if (!terminal) return

    // Check if this terminal IS a split container (not just part of one)
    if (terminal.splitLayout && terminal.splitLayout.type !== 'single') {
      // This is a split container - detach ALL panes and preserve layout
      console.log(`[SimpleTerminalApp] Detaching split container ${terminal.id} with ${terminal.splitLayout.panes.length} panes`)

      // Detach each pane terminal individually
      for (const pane of terminal.splitLayout.panes) {
        const paneTerminal = storedTerminals.find(t => t.id === pane.terminalId)
        if (paneTerminal && paneTerminal.sessionName) {
          console.log(`[SimpleTerminalApp] Detaching pane ${pane.terminalId} (${paneTerminal.sessionName})`)

          // Call backend to detach from tmux (keeps session alive)
          await fetch(`/api/tmux/detach/${paneTerminal.sessionName}`, {
            method: 'POST',
          })

          // Send disconnect to backend to remove this window from terminalOwners
          // CRITICAL: Use 'disconnect' not 'close' - close would kill the tmux session!
          if (paneTerminal.agentId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log(`[SimpleTerminalApp] Sending disconnect to backend for pane agentId: ${paneTerminal.agentId.slice(-8)}`)
            wsRef.current.send(JSON.stringify({
              type: 'disconnect',
              data: { terminalId: paneTerminal.agentId }
            }))
          }

          // Clear from processedAgentIds so it can reconnect
          if (paneTerminal.agentId) {
            console.log(`[SimpleTerminalApp] Clearing processedAgentId: ${paneTerminal.agentId.slice(-8)}`)
            clearProcessedAgentId(paneTerminal.agentId)
          }

          // Mark pane as detached (clear agentId so it reconnects properly)
          updateTerminal(pane.terminalId, {
            status: 'detached',
            agentId: undefined,
            windowId: undefined, // Clear window assignment
          })
        }
      }

      // Mark the container as detached too (preserves split layout)
      updateTerminal(contextMenu.terminalId, {
        status: 'detached',
        agentId: undefined,
        windowId: undefined, // Clear window assignment
      })

      console.log(`[SimpleTerminalApp] ✓ Detached split container with preserved layout`)

      // Note: BroadcastChannel middleware will automatically sync to other windows
      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
      return
    }

    // For non-split terminals, must have a sessionName
    if (!terminal.sessionName) {
      console.warn(`[SimpleTerminalApp] Cannot detach terminal without sessionName`)
      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
      return
    }

    console.log(`[SimpleTerminalApp] Detaching from tmux session: ${terminal.sessionName}`)

    // Check if this terminal is part of a split (as a pane)
    const splitContainer = storedTerminals.find(t =>
      t.splitLayout?.panes?.some(p => p.terminalId === terminal.id)
    )

    if (splitContainer && splitContainer.splitLayout) {
      // Terminal is a pane in a split - remove it from the split first
      console.log(`[SimpleTerminalApp] Detaching split pane ${terminal.id} from split ${splitContainer.id}`)

      const remainingPanes = splitContainer.splitLayout.panes.filter(
        p => p.terminalId !== terminal.id
      )

      if (remainingPanes.length === 1) {
        // Only 1 pane left - convert split container back to single terminal
        console.log(`[SimpleTerminalApp] Only 1 pane remaining, converting split to single terminal`)
        updateTerminal(splitContainer.id, {
          splitLayout: { type: 'single', panes: [] }
        })

        // Unhide the remaining pane if it was hidden (backwards compatibility)
        const remainingPaneTerminal = storedTerminals.find(t => t.id === remainingPanes[0].terminalId)
        if (remainingPaneTerminal?.isHidden) {
          updateTerminal(remainingPanes[0].terminalId, {
            isHidden: false
          })
        }

        // Set the remaining pane as active
        setActiveTerminal(remainingPanes[0].terminalId)
      } else if (remainingPanes.length > 1) {
        // Still have multiple panes
        updateTerminal(splitContainer.id, {
          splitLayout: {
            ...splitContainer.splitLayout,
            panes: remainingPanes
          }
        })

        // Keep the split active, focus the first remaining pane
        setActiveTerminal(splitContainer.id)
        setFocusedTerminal(remainingPanes[0].terminalId)
      }
    }

    try {
      const response = await fetch(`/api/tmux/detach/${terminal.sessionName}`, {
        method: 'POST',
      })
      const result = await response.json()

      if (result.success) {
        console.log(`[SimpleTerminalApp] ✓ Detached from session: ${terminal.sessionName}`)

        // Send disconnect to backend to remove this window from terminalOwners
        // CRITICAL: Use 'disconnect' not 'close' - close would kill the tmux session!
        if (terminal.agentId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log(`[SimpleTerminalApp] Sending disconnect to backend for agentId: ${terminal.agentId.slice(-8)}`)
          wsRef.current.send(JSON.stringify({
            type: 'disconnect',
            data: { terminalId: terminal.agentId }
          }))
        }

        // Clear from processedAgentIds so it can reconnect
        if (terminal.agentId) {
          console.log(`[SimpleTerminalApp] Clearing processedAgentId: ${terminal.agentId.slice(-8)}`)
          clearProcessedAgentId(terminal.agentId)
        }

        // Mark terminal as detached (keeps in localStorage, globally accessible)
        // Note: BroadcastChannel middleware will automatically sync to other windows
        updateTerminal(contextMenu.terminalId, {
          status: 'detached',
          agentId: undefined, // Clear PTY connection so it can reconnect
          windowId: undefined, // Clear window assignment so it can reattach anywhere
        })
      } else {
        console.error(`[SimpleTerminalApp] Failed to detach:`, result.error)
      }
    } catch (error) {
      console.error(`[SimpleTerminalApp] Error detaching from session:`, error)
    }

    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle re-attaching a detached terminal
  const handleReattachTerminal = async (terminalId: string) => {
    const terminal = storedTerminals.find(t => t.id === terminalId)
    if (!terminal || terminal.status !== 'detached') return

    // Check if this terminal is a PANE in a detached split (not the container)
    // If so, reattach the whole split container instead
    const detachedSplitContainer = storedTerminals.find(t =>
      t.status === 'detached' &&
      t.splitLayout &&
      t.splitLayout.type !== 'single' &&
      t.splitLayout.panes.some(p => p.terminalId === terminalId)
    )

    if (detachedSplitContainer) {
      console.log(`[SimpleTerminalApp] Pane is part of detached split, reattaching container instead:`, detachedSplitContainer.id)
      // Reattach the container, which will reattach all panes
      // This ensures clicking any pane tab restores the whole split
      return handleReattachTerminal(detachedSplitContainer.id)
    }

    // Check if this is a split container
    if (terminal.splitLayout && terminal.splitLayout.type !== 'single') {
      console.log(`[SimpleTerminalApp] Re-attaching split container ${terminal.name} with ${terminal.splitLayout.panes.length} panes`)

      // Reattach each pane
      for (const pane of terminal.splitLayout.panes) {
        const paneTerminal = storedTerminals.find(t => t.id === pane.terminalId)
        if (paneTerminal) {
          // Find matching spawn option for this pane
          const option = spawnOptions.find(opt =>
            opt.command === paneTerminal.command ||
            opt.terminalType === paneTerminal.terminalType
          )

          if (option) {
            console.log(`[SimpleTerminalApp] Re-attaching pane ${pane.terminalId} (${paneTerminal.terminalType})`)

            // Mark as spawning and assign to current window
            updateTerminal(pane.terminalId, {
              windowId: currentWindowId,
              status: 'spawning',
            })

            // Create updated pane terminal object with correct windowId
            const updatedPaneTerminal = {
              ...paneTerminal,
              windowId: currentWindowId,
              status: 'spawning' as const,
            }

            // Reconnect the pane
            await handleReconnectTerminal(updatedPaneTerminal, option)
          }
        }
      }

      // Mark container as active and assign to window
      updateTerminal(terminalId, {
        windowId: currentWindowId,
        status: 'active',
      })

      // Set as active after all panes reconnected
      setActiveTerminal(terminalId)

      console.log(`[SimpleTerminalApp] ✓ Re-attached split container with restored layout`)

      // Note: BroadcastChannel middleware will automatically sync to other windows
      return
    }

    // Single terminal reattach
    console.log(`[SimpleTerminalApp] Re-attaching terminal ${terminal.name} to session ${terminal.sessionName}`)

    // Find matching spawn option
    const option = spawnOptions.find(opt =>
      opt.command === terminal.command ||
      opt.terminalType === terminal.terminalType
    )

    if (!option) {
      console.error(`[SimpleTerminalApp] No spawn option found for terminal type: ${terminal.terminalType}`)
      return
    }

    // Assign to current window when re-attaching
    updateTerminal(terminalId, {
      windowId: currentWindowId,
      status: 'spawning',
    })

    // Create updated terminal object with correct windowId for reconnection
    const updatedTerminal = {
      ...terminal,
      windowId: currentWindowId,
      status: 'spawning' as const,
    }

    // Use existing reconnect logic with updated terminal
    await handleReconnectTerminal(updatedTerminal, option)

    // Set as active after reconnecting
    setActiveTerminal(terminalId)

    // Note: BroadcastChannel middleware will automatically sync to other windows
  }

  const handleCloseTerminal = (terminalId: string) => {
    const terminal = storedTerminals.find(t => t.id === terminalId)

    // Check if this terminal is part of a split
    const splitContainer = storedTerminals.find(t =>
      t.splitLayout?.panes?.some(p => p.terminalId === terminalId)
    )

    if (splitContainer && splitContainer.splitLayout) {
      // Terminal is part of a split - clean up the split first
      console.log(`[SimpleTerminalApp] Closing pane ${terminalId} from split ${splitContainer.id}`)

      const remainingPanes = splitContainer.splitLayout.panes.filter(
        p => p.terminalId !== terminalId
      )

      if (remainingPanes.length === 1) {
        // Only 1 pane left - convert split container back to single terminal
        console.log(`[SimpleTerminalApp] Only 1 pane remaining, converting split to single terminal`)
        updateTerminal(splitContainer.id, {
          splitLayout: { type: 'single', panes: [] }
        })

        // Unhide the remaining pane if it was hidden (backwards compatibility)
        const remainingPaneTerminal = storedTerminals.find(t => t.id === remainingPanes[0].terminalId)
        if (remainingPaneTerminal?.isHidden) {
          updateTerminal(remainingPanes[0].terminalId, {
            isHidden: false
          })
        }

        // Set the remaining pane as active
        setActiveTerminal(remainingPanes[0].terminalId)
      } else if (remainingPanes.length > 1) {
        // Still have multiple panes
        updateTerminal(splitContainer.id, {
          splitLayout: {
            ...splitContainer.splitLayout,
            panes: remainingPanes
          }
        })

        // Keep the split active, focus the first remaining pane
        setActiveTerminal(splitContainer.id)
        setFocusedTerminal(remainingPanes[0].terminalId)
      } else {
        // No panes left - close the container too
        if (splitContainer.agentId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'close',
            terminalId: splitContainer.agentId,
          }))
        }
        removeTerminal(splitContainer.id)
      }
    }

    // Close the terminal via WebSocket
    if (terminal && terminal.agentId) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'close',
          terminalId: terminal.agentId,
        }))
      }
    }

    // Remove the terminal from store
    removeTerminal(terminalId)
  }

  // Helper function to send tmux commands to active terminal
  const sendTmuxCommand = async (sessionName: string, command: string) => {
    try {
      const response = await fetch(`/api/tmux/sessions/${sessionName}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      })

      const result = await response.json()
      if (result.success) {
        console.log(`[SimpleTerminalApp] ✓ Tmux command executed: ${command}`)
      } else {
        console.error(`[SimpleTerminalApp] Failed to execute tmux command:`, result.error)
      }
    } catch (error) {
      console.error(`[SimpleTerminalApp] Failed to execute tmux command:`, error)
    }
  }

  // Keyboard shortcuts (extracted to custom hook)
  // Must be called after handleSpawnTerminal and handleCloseTerminal are defined
  useKeyboardShortcuts(
    showSpawnMenu,
    activeTerminalId,
    visibleTerminals,
    spawnOptions,
    setShowSpawnMenu,
    setActiveTerminal,
    handleSpawnTerminal,
    handleCloseTerminal,
    sendTmuxCommand
  )

  // Pop out pane to new tab (undo split)
  const handlePopOutPane = (paneTerminalId: string) => {
    // Find which split container has this pane
    const splitContainer = storedTerminals.find(t =>
      t.splitLayout?.panes?.some(p => p.terminalId === paneTerminalId)
    )

    if (!splitContainer || !splitContainer.splitLayout) {
      console.warn('[SimpleTerminalApp] No split container found for pane:', paneTerminalId)
      return
    }

    const paneTerminal = storedTerminals.find(t => t.id === paneTerminalId)
    if (!paneTerminal) {
      console.warn('[SimpleTerminalApp] Pane terminal not found:', paneTerminalId)
      return
    }

    console.log(`[SimpleTerminalApp] Popping out pane ${paneTerminalId} to new tab (unsplit)`)

    // Remove pane from split
    const remainingPanes = splitContainer.splitLayout.panes.filter(
      p => p.terminalId !== paneTerminalId
    )

    if (remainingPanes.length === 1) {
      // Only 1 pane left - convert split back to single terminal
      const remainingTerminalId = remainingPanes[0].terminalId
      console.log(`[SimpleTerminalApp] Only 1 pane remaining, clearing split layout on container: ${splitContainer.id}`)

      // Clear the split layout from the container (convert back to single terminal)
      updateTerminal(splitContainer.id, {
        splitLayout: { type: 'single', panes: [] }
      })

      // If the remaining pane is different from the container, unhide it
      if (remainingTerminalId !== splitContainer.id) {
        console.log(`[SimpleTerminalApp] Unhiding remaining pane: ${remainingTerminalId}`)
        updateTerminal(remainingTerminalId, {
          isHidden: false
        })
      }
    } else if (remainingPanes.length > 1) {
      // Still have multiple panes
      updateTerminal(splitContainer.id, {
        splitLayout: {
          ...splitContainer.splitLayout,
          panes: remainingPanes
        }
      })
    }

    // Clear isHidden flag from popped-out terminal (backwards compatibility with old splits)
    if (paneTerminal.isHidden) {
      updateTerminal(paneTerminalId, {
        isHidden: false
      })
    }

    // Set the popped-out terminal as active
    setActiveTerminal(paneTerminalId)

    console.log(`[SimpleTerminalApp] ✅ Popped out pane to new tab: ${paneTerminal.name}`)
  }

  const handleClearAllSessions = async () => {
    // Gather info about what will be cleared
    const localStorageKeys: string[] = []
    let totalSize = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        localStorageKeys.push(key)
        const value = localStorage.getItem(key) || ''
        totalSize += key.length + value.length
      }
    }

    // Get tmux session count
    let tmuxSessionCount = 0
    try {
      const response = await fetch('/api/tmux/list')
      const result = await response.json()
      if (result.success && result.sessions) {
        tmuxSessionCount = result.sessions.filter((s: string) => s.startsWith('tt-')).length
      }
    } catch (err) {
      console.warn('Could not fetch tmux sessions:', err)
    }

    // Build detailed confirmation message
    const sizeMB = (totalSize / 1024 / 1024).toFixed(2)
    const confirmMessage = `⚠️ Clear all sessions and localStorage?

📊 WHAT WILL BE CLEARED:

🗂️ localStorage (${localStorageKeys.length} keys, ${sizeMB} MB):
${localStorageKeys.map(k => `  • ${k}`).join('\n')}

🖥️ Tmux Sessions: ${tmuxSessionCount} session(s)
  • Pattern: tt-* (only Tabz sessions)

🗑️ State Files: Claude Code state files will be cleaned up

⚠️ This cannot be undone!`

    if (!confirm(confirmMessage)) {
      return
    }

    console.log('[SimpleTerminalApp] Clearing all sessions...')

    // Close all active terminals via WebSocket (including hidden pane terminals from all windows)
    const allTerminalIds = new Set<string>()

    storedTerminals.forEach(terminal => {
      if (terminal.agentId) {
        allTerminalIds.add(terminal.agentId)
      }

      // Also collect pane terminals from splits
      if (terminal.splitLayout && terminal.splitLayout.panes.length > 0) {
        terminal.splitLayout.panes.forEach(pane => {
          const paneTerminal = storedTerminals.find(t => t.id === pane.terminalId)
          if (paneTerminal?.agentId) {
            allTerminalIds.add(paneTerminal.agentId)
          }
        })
      }
    })

    // Send close messages for all terminals
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      allTerminalIds.forEach(agentId => {
        wsRef.current!.send(JSON.stringify({
          type: 'close',
          terminalId: agentId,
        }))
      })
      console.log(`[SimpleTerminalApp] Sent close messages for ${allTerminalIds.size} terminals`)
    }

    // Wait a bit for close messages to be sent
    await new Promise(resolve => setTimeout(resolve, 300))

    // Kill all terminal-tabs tmux sessions (in case some are orphaned)
    // Pattern 'tt-*' only matches sessions like: tt-bash-a3k, tt-cc-x9z, etc.
    // Safe: 'terminal-tabs', 'pyradio', 'tfe' won't match (don't start with "tt-")
    try {
      await fetch('/api/tmux/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern: 'tt-*' })
      })
      console.log('[SimpleTerminalApp] 🧹 Killed all terminal-tabs tmux sessions')
    } catch (err) {
      console.warn('[SimpleTerminalApp] Failed to cleanup tmux sessions:', err)
    }

    // Clean up Claude Code state files
    try {
      const response = await fetch('/api/claude-status/cleanup', { method: 'POST' })
      const result = await response.json()
      if (result.success) {
        console.log(`[SimpleTerminalApp] 🗑️ Cleaned up ${result.removed} state files`)
      }
    } catch (err) {
      console.warn('[SimpleTerminalApp] Failed to cleanup state files:', err)
    }

    // Close WebSocket connection gracefully
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Clear all terminals from store (will also clear localStorage via persist)
    clearAllTerminals()

    // Clear ALL localStorage keys completely for a fresh start
    // This includes: tabz-settings, simple-terminal-storage, and any other cached data
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    console.log(`[SimpleTerminalApp] 🗑️ Cleared ${keysToRemove.length} localStorage keys:`, keysToRemove)

    console.log('[SimpleTerminalApp] ✅ All sessions, settings, and localStorage cleared')

    // Broadcast to all other windows to reload
    // Create temporary channel to send reload-all (middleware listens in other windows)
    const channel = new BroadcastChannel('tabz-sync')
    channel.postMessage({
      type: 'reload-all',
      from: currentWindowId,
      at: Date.now()
    })
    console.log('[SimpleTerminalApp] 📡 Sent reload-all message to all windows')
    channel.close()

    // Wait a bit to ensure broadcast is sent and everything is cleaned up
    await new Promise(resolve => setTimeout(resolve, 300))

    // Reload this window to apply fresh defaults
    window.location.reload()
  }

  const handleClearErrors = () => {
    setConsoleErrors([])
    setShowErrorModal(false)
  }

  const handleCopyErrorsToClipboard = async () => {
    if (consoleErrors.length === 0) {
      alert('📋 No errors to copy')
      return
    }

    // Format errors for clipboard
    const errorReport = `Console Errors Report (${consoleErrors.length} total)
Generated: ${new Date().toLocaleString()}

${'='.repeat(80)}

${consoleErrors.map((err, idx) => {
  const date = new Date(err.timestamp).toLocaleTimeString()
  return `[${idx + 1}] ${date}
${err.message}
${err.stack ? `\nStack:\n${err.stack}\n` : ''}
${'-'.repeat(80)}`
}).join('\n\n')}

${'='.repeat(80)}
End of error report
`

    try {
      await navigator.clipboard.writeText(errorReport)
      alert(`✅ Copied ${consoleErrors.length} error(s) to clipboard!`)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      alert('❌ Failed to copy to clipboard')
    }
  }

  const handleCommand = (command: string, terminalId: string) => {
    const terminal = storedTerminals.find(t => t.id === terminalId)
    if (terminal && terminal.agentId) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'command',
          terminalId: terminal.agentId,
          command,
        }))
      }
    }
  }

  // Determine which terminal to display in footer
  // If a pane in split is focused, use that; otherwise use active tab
  const displayTerminal = useMemo(() => {
    const terminal = focusedTerminalId
      ? storedTerminals.find(t => t.id === focusedTerminalId)
      : storedTerminals.find(t => t.id === activeTerminalId)

    // Debug: Log active terminal display values
    if (terminal) {
      console.log('[Footer] Active terminal changed:', {
        terminalId: terminal.id,
        name: terminal.name,
        fontSize: terminal.fontSize,
        fontFamily: terminal.fontFamily,
        theme: terminal.theme,
        transparency: terminal.transparency,
        spawnType: terminal.terminalType,
      })
    }

    return terminal
  }, [focusedTerminalId, activeTerminalId, storedTerminals])

  const activeTerminal = storedTerminals.find(t => t.id === activeTerminalId)
  const displayAgent = displayTerminal?.agentId
    ? agents.find(a => a.id === displayTerminal.agentId)
    : null
  const terminalInfo = displayAgent
    ? TERMINAL_TYPES.find(t => t.value === displayAgent.terminalType)
    : null

  // Footer control handlers - Tab-specific customizations (persisted per-tab)
  // These changes are specific to the focused/active terminal and persist through refresh
  // New spawns always use defaults from spawn-options.json
  const handleFontSizeChange = (delta: number) => {
    if (!displayTerminal || !terminalRef.current) return
    const globalDefault = useSettingsStore.getState().terminalDefaultFontSize
    const currentSize = displayTerminal.fontSize || globalDefault
    const newSize = Math.max(10, Math.min(24, currentSize + delta))
    terminalRef.current.updateFontSize(newSize)
    // Save to this terminal's state (persisted in localStorage)
    updateTerminal(displayTerminal.id, { fontSize: newSize })
  }

  const handleResetToDefaults = () => {
    if (!displayTerminal || !terminalRef.current) return

    // Find the spawn option for this terminal
    // First try to match by label (exact match)
    let spawnOption = spawnOptions.find(opt => opt.label === displayTerminal.name)

    // Fallback: if no exact label match, try matching by terminalType + command
    if (!spawnOption && displayTerminal.command) {
      spawnOption = spawnOptions.find(opt =>
        opt.terminalType === displayTerminal.terminalType &&
        opt.command === displayTerminal.command
      )
    }

    // Last resort: just match by terminalType (but warn, as this might be wrong)
    if (!spawnOption) {
      spawnOption = spawnOptions.find(opt => opt.terminalType === displayTerminal.terminalType)
      if (spawnOption) {
        console.warn(`[SimpleTerminalApp] Could not find exact match for terminal "${displayTerminal.name}", using first ${displayTerminal.terminalType} option: ${spawnOption.label}`)
      }
    }

    if (!spawnOption) {
      console.warn('No spawn option found for terminal:', displayTerminal.name, displayTerminal.terminalType)
      return
    }

    // Reset to spawn option defaults
    const defaults = {
      theme: spawnOption.defaultTheme,
      background: spawnOption.defaultBackground || THEME_BACKGROUNDS[spawnOption.defaultTheme || 'default'] || 'dark-neutral',
      transparency: spawnOption.defaultTransparency,
      fontSize: spawnOption.defaultFontSize || useSettingsStore.getState().terminalDefaultFontSize,
      fontFamily: spawnOption.defaultFontFamily,
    }

    // Update terminal state
    updateTerminal(displayTerminal.id, defaults)

    // Apply to terminal component
    if (defaults.theme) terminalRef.current.updateTheme(defaults.theme)
    if (defaults.background) terminalRef.current.updateBackground(defaults.background)
    if (defaults.transparency !== undefined) terminalRef.current.updateOpacity(defaults.transparency / 100)
    if (defaults.fontSize) terminalRef.current.updateFontSize(defaults.fontSize)
    if (defaults.fontFamily) terminalRef.current.updateFontFamily(defaults.fontFamily)

    console.log(`[SimpleTerminalApp] Reset terminal "${displayTerminal.name}" to spawn-option defaults from "${spawnOption.label}"`, defaults)
  }

  const handleThemeChange = (theme: string) => {
    if (!displayTerminal || !terminalRef.current) {
      console.warn('[SimpleTerminalApp] handleThemeChange called but displayTerminal or terminalRef.current is null', { displayTerminal: displayTerminal?.id, hasRef: !!terminalRef.current })
      return
    }
    console.log('[SimpleTerminalApp] Changing theme to:', theme, 'for terminal:', displayTerminal.id)
    terminalRef.current.updateTheme(theme)
    // Save to this terminal's state (persisted in localStorage)
    updateTerminal(displayTerminal.id, { theme })
    // Note: Theme refresh is handled by useTerminalTheme hook in Terminal.tsx
    // No tmux-level refresh needed - it would interfere with running applications
  }

  const handleBackgroundChange = (background: string) => {
    if (!displayTerminal || !terminalRef.current) return
    terminalRef.current.updateBackground(background)
    // Save to this terminal's state (persisted in localStorage)
    updateTerminal(displayTerminal.id, { background })
    // No refit needed - background is a React layer, not xterm.js
  }

  const handleTransparencyChange = (transparency: number) => {
    if (!displayTerminal || !terminalRef.current) return
    const opacity = transparency / 100
    terminalRef.current.updateOpacity(opacity)
    // Save to this terminal's state (persisted in localStorage)
    updateTerminal(displayTerminal.id, { transparency })
    // No refit needed - transparency is CSS opacity on React layer, not xterm.js
  }

  const handleFontFamilyChange = (fontFamily: string) => {
    if (!displayTerminal || !terminalRef.current) {
      console.warn('[SimpleTerminalApp] handleFontFamilyChange called but displayTerminal or terminalRef.current is null', {
        displayTerminal: displayTerminal?.id,
        hasRef: !!terminalRef.current,
        focusedTerminalId,
        activeTerminalId
      })
      return
    }
    console.log('[SimpleTerminalApp] ===== FONT FAMILY CHANGE =====')
    console.log('[SimpleTerminalApp] Changing font family to:', fontFamily)
    console.log('[SimpleTerminalApp] For terminal:', displayTerminal.id, displayTerminal.name)
    console.log('[SimpleTerminalApp] Session name:', displayTerminal.sessionName)
    console.log('[SimpleTerminalApp] terminalRef exists:', !!terminalRef.current)

    // Try to update font
    try {
      terminalRef.current.updateFontFamily(fontFamily)
      console.log('[SimpleTerminalApp] ✓ updateFontFamily called successfully')
    } catch (error) {
      console.error('[SimpleTerminalApp] ✗ Error calling updateFontFamily:', error)
    }

    // Save to this terminal's state (persisted in localStorage)
    updateTerminal(displayTerminal.id, { fontFamily })
    console.log('[SimpleTerminalApp] ✓ Saved to localStorage')
    // Note: Font refresh is handled by useTerminalFont hook in Terminal.tsx
    // No tmux-level refresh needed - it would interfere with running applications
  }

  // Compute dynamic background based on active terminal's background setting
  const appBackgroundStyle: React.CSSProperties = {
    background: activeTerminal?.background
      ? getBackgroundCSS(activeTerminal.background)
      : getBackgroundCSS('dark-neutral'),
    transition: 'background 0.5s ease-in-out',
  }

  // Click handler for header reveal handle
  const handleHeaderReveal = () => {
    setHeaderVisible(true)
  }

  // Toggle header visibility
  const toggleHeader = () => {
    setHeaderVisible(!headerVisible)
  }

  // Refit terminal when header visibility changes (gains/loses 47px of vertical space)
  useEffect(() => {
    if (terminalRef.current) {
      // Wait for CSS transition to complete (300ms) then refit
      const timer = setTimeout(() => {
        terminalRef.current?.refit()
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [headerVisible])

  return (
    <div
      className={`simple-terminal-app ${!headerVisible ? 'header-hidden' : ''}`}
      style={appBackgroundStyle}
    >
      {/* Header Reveal Handle - Shows when header is hidden */}
      {!headerVisible && (
        <div className="header-reveal-handle" onClick={handleHeaderReveal}>
          <div className="handle-icon">▼</div>
        </div>
      )}

      {/* Header */}
      <div
        className={`app-header ${headerVisible ? 'visible' : 'hidden'}`}
      >
        <div className="app-title">Tab<span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>&gt;_</span></div>

        {/* Tmux Toggle */}
        <div className="tmux-toggle-container">
          <span className="tmux-toggle-label">tmux</span>
          <button
            className={`tmux-toggle ${useTmux ? 'active' : ''}`}
            onClick={() => updateSettings({ useTmux: !useTmux })}
            title={useTmux ? "Using tmux (persistent sessions)" : "Using raw PTY (no persistence)"}
          >
            <span className="tmux-toggle-slider"></span>
          </button>
        </div>

        {/* Detached Terminals Dropdown (in header) */}
        {detachedTerminals.length > 0 && (
          <div className="detached-header-container" ref={detachedDropdownRef}>
            <button
              className="detached-header-button"
              onClick={(e) => {
                e.stopPropagation()
                // Calculate dropdown position based on button position
                if (detachedDropdownRef.current) {
                  const rect = detachedDropdownRef.current.getBoundingClientRect()
                  setDetachedDropdownPosition({
                    top: rect.bottom + 4, // 4px gap
                    left: rect.left
                  })
                }
                setShowDetachedDropdown(!showDetachedDropdown)
              }}
              title={`${detachedTerminals.length} detached terminal(s)`}
            >
              📌 Detached ({detachedTerminals.length})
            </button>

          </div>
        )}

        {/* Dropdown Menu - Rendered via Portal to escape stacking context */}
        {detachedTerminals.length > 0 && showDetachedDropdown && ReactDOM.createPortal(
          <div
            className="detached-dropdown"
            style={{
              top: `${detachedDropdownPosition.top}px`,
              left: `${detachedDropdownPosition.left}px`
            }}
          >
            <div className="detached-dropdown-header">
              Select terminal to reattach:
            </div>
            {detachedTerminals.map(terminal => (
              <div
                key={terminal.id}
                className="detached-dropdown-item"
                onClick={(e) => {
                  e.stopPropagation()
                  handleReattachTerminal(terminal.id)
                  setShowDetachedDropdown(false)
                }}
              >
                <span className="detached-dropdown-icon">{terminal.icon || '💻'}</span>
                <span className="detached-dropdown-name">{terminal.name}</span>
                {terminal.sessionName && (
                  <span className="detached-dropdown-session">
                    {terminal.sessionName}
                  </span>
                )}
              </div>
            ))}
          </div>,
          document.body
        )}

        <div className="header-actions">
          <button
            className="clear-sessions-button"
            onClick={handleClearAllSessions}
            title="Clear all sessions and localStorage"
          >
            🗑️
          </button>
          {consoleErrors.length > 0 && (
            <button
              className="error-indicator-button"
              onClick={() => setShowErrorModal(true)}
              onContextMenu={(e) => {
                e.preventDefault()
                handleCopyErrorsToClipboard()
              }}
              title={`${consoleErrors.length} error(s) - Click to view, right-click to copy`}
            >
              <span className="error-badge">{consoleErrors.length}</span>
              ❗
            </button>
          )}
          <button
            className="settings-button"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            className="hotkeys-button"
            onClick={() => setShowHotkeysHelp(true)}
            title="Keyboard Shortcuts"
          >
            ⌨️
          </button>
          <div className={`connection-status ${connectionStatus}`}>
            <span className="status-dot"></span>
            {connectionStatus}
          </div>
        </div>

        {/* Header Collapse Button - absolutely centered in header */}
        <button
          className="header-collapse-button"
          onClick={toggleHeader}
          title="Hide header"
        >
          ▲
        </button>
      </div>

      {/* Tab Bar */}
      <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleTerminals
              .filter(t => {
                const isHidden = t.isHidden === true
                if (isHidden) return false

                // Include panes (even if they also have splitLayout)
                const splitInfo = splitTabInfo.get(t.id)
                if (splitInfo && splitInfo.position !== 'single') return true

                // Exclude containers that are not panes
                const hasSplitLayout = t.splitLayout && t.splitLayout.type !== 'single'
                if (hasSplitLayout) return false

                return true
              })
              .map(t => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="tab-bar">
              {visibleTerminals
                .filter(terminal => {
                  // HIDE terminals marked as hidden (backwards compatibility with old split approach)
                  const isHidden = terminal.isHidden === true
                  if (isHidden) return false

                  // SHOW terminals that are panes in a split (even if they also have splitLayout)
                  const splitInfo = splitTabInfo.get(terminal.id)
                  if (splitInfo && splitInfo.position !== 'single') {
                    return true // This is a pane - show it
                  }

                  // HIDE split containers that are NOT also panes
                  const hasSplitLayout = terminal.splitLayout && terminal.splitLayout.type !== 'single'
                  if (hasSplitLayout) {
                    return false // Container only, not a pane - hide it
                  }

                  // SHOW regular terminals
                  return true
                })
                .sort((a, b) => {
                  // Sort split panes by their position (left before right, top before bottom)
                  const aInfo = splitTabInfo.get(a.id)
                  const bInfo = splitTabInfo.get(b.id)

                  // If both are in the same split container, sort by position
                  if (aInfo && bInfo && aInfo.splitContainerId === bInfo.splitContainerId && aInfo.splitContainerId !== '') {
                    const positionOrder = { left: 0, middle: 1, right: 2 }
                    return (positionOrder[aInfo.position as keyof typeof positionOrder] || 0) -
                           (positionOrder[bInfo.position as keyof typeof positionOrder] || 0)
                  }

                  // Otherwise, maintain original order (don't swap)
                  return 0
                })
                .map(terminal => {
                  const splitInfo = splitTabInfo.get(terminal.id)
                  const isSplit = splitInfo && splitInfo.position !== 'single'

                  // Check if any sibling in the split is active
                  const isSplitActive = isSplit && visibleTerminals.some(t => {
                    const siblingInfo = splitTabInfo.get(t.id)
                    return siblingInfo?.splitContainerId === splitInfo.splitContainerId && t.id === activeTerminalId
                  })

                return (
                  <SortableTab
                    key={terminal.id}
                    terminal={terminal}
                    isActive={terminal.id === activeTerminalId}
                    isFocused={terminal.id === focusedTerminalId}
                    isSplitActive={!!isSplitActive}
                    onActivate={() => {
                      // If detached, re-attach. Otherwise, just set as active
                      if (terminal.status === 'detached') {
                        handleReattachTerminal(terminal.id)
                      } else {
                        // If this tab is part of a split, set activeTerminalId to the container
                        // (so the split view renders), and set focusedTerminalId to this pane
                        if (splitInfo && splitInfo.splitContainerId) {
                          setActiveTerminal(splitInfo.splitContainerId)
                          setFocusedTerminal(terminal.id)
                        } else {
                          // Regular tab - just set as active
                          setActiveTerminal(terminal.id)
                        }
                      }
                    }}
                    onClose={(e) => {
                      e.stopPropagation()
                      handleCloseTerminal(terminal.id)
                    }}
                    onContextMenu={handleTabContextMenu}
                    dropZone={dropZoneState?.terminalId === terminal.id ? dropZoneState.zone : null}
                    isDraggedOver={dropZoneState?.terminalId === terminal.id}
                    mousePosition={mousePosition}
                    splitPosition={splitInfo?.position}
                    claudeCodeStatuses={claudeCodeStatuses}
                  />
                )
              })}

              <button
                className="tab-add"
                onClick={() => setShowSpawnMenu(!showSpawnMenu)}
              >
                +
              </button>
            </div>
          </SortableContext>
        </DndContext>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={() => loadSpawnOptions()}
      />

      {/* Hotkeys Help Modal */}
      <HotkeysHelpModal
        show={showHotkeysHelp}
        onClose={() => setShowHotkeysHelp(false)}
      />

      {/* Error Modal */}
      {showErrorModal && (
        <div className="modal-overlay" onClick={() => setShowErrorModal(false)}>
          <div className="modal-content error-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Console Errors ({consoleErrors.length})</h2>
              <button className="modal-close" onClick={() => setShowErrorModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {consoleErrors.length === 0 ? (
                <p className="no-errors">No errors to display</p>
              ) : (
                <div className="error-list">
                  {consoleErrors.map((err, idx) => (
                    <div key={idx} className="error-item">
                      <div className="error-header">
                        <span className="error-number">#{idx + 1}</span>
                        <span className="error-time">
                          {new Date(err.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="error-message">{err.message}</div>
                      {err.stack && (
                        <details className="error-stack">
                          <summary>Stack trace</summary>
                          <pre>{err.stack}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="button-secondary" onClick={handleCopyErrorsToClipboard}>
                📋 Copy to Clipboard
              </button>
              <button className="button-danger" onClick={handleClearErrors}>
                🗑️ Clear All Errors
              </button>
              <button className="button-primary" onClick={() => setShowErrorModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spawn Menu */}
      {showSpawnMenu && (
        <div className="spawn-menu">
          <div className="spawn-menu-header">
            <span>Spawn Terminal</span>
            <button onClick={() => {
              setShowSpawnMenu(false)
              setSpawnSearchText('')
              setSpawnWorkingDirOverride('')
              setSelectedSpawnOptions(new Set())
              setSelectedProject('')
            }}>✕</button>
          </div>

          {/* Working Directory Override Input */}
          <div className="spawn-workingdir-container">
            <label className="spawn-workingdir-label">
              📁 Working Directory (optional override)
            </label>

            {/* Project dropdown - only show if projects exist */}
            {projects.length > 0 && (
              <select
                className="spawn-project-dropdown"
                value={selectedProject}
                onChange={(e) => {
                  const projectName = e.target.value
                  setSelectedProject(projectName)

                  if (projectName === '') {
                    // Manual entry - clear override to revert to defaults
                    setSpawnWorkingDirOverride('')
                  } else {
                    // Find project and set working directory
                    const project = projects.find(p => p.name === projectName)
                    if (project) {
                      setSpawnWorkingDirOverride(project.workingDir)
                    }
                  }
                }}
              >
                <option value="">Manual Entry</option>
                {projects.map((project) => (
                  <option key={project.name} value={project.name}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="text"
              className="spawn-workingdir-input"
              placeholder={useSettingsStore.getState().workingDirectory || '~'}
              value={spawnWorkingDirOverride}
              onChange={(e) => {
                setSpawnWorkingDirOverride(e.target.value)
                setSelectedProject('') // Switch to manual entry if user types
              }}
            />
            {spawnWorkingDirOverride && (
              <button
                className="spawn-workingdir-clear"
                onClick={() => {
                  setSpawnWorkingDirOverride('')
                  setSelectedProject('')
                }}
                title="Clear override"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Input */}
          <div className="spawn-search-container">
            <input
              type="text"
              className="spawn-search-input"
              placeholder="Search terminals..."
              value={spawnSearchText}
              onChange={(e) => setSpawnSearchText(e.target.value)}
              autoFocus
            />
          </div>

          {/* Select All / Deselect All */}
          {(() => {
            // Filter options based on search text
            const filteredOptions = spawnOptions
              .map((option, idx) => ({ option, idx }))
              .filter(({ option }) => {
                if (!spawnSearchText) return true
                const searchLower = spawnSearchText.toLowerCase()
                return (
                  option.label.toLowerCase().includes(searchLower) ||
                  option.description?.toLowerCase().includes(searchLower) ||
                  option.command?.toLowerCase().includes(searchLower)
                )
              })

            const filteredIndices = filteredOptions.map(({ idx }) => idx)
            const allSelected = filteredIndices.length > 0 && filteredIndices.every(idx => selectedSpawnOptions.has(idx))

            return (
              <div className="spawn-select-all">
                <label>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      const newSelected = new Set(selectedSpawnOptions)
                      if (allSelected) {
                        // Deselect all filtered
                        filteredIndices.forEach(idx => newSelected.delete(idx))
                      } else {
                        // Select all filtered
                        filteredIndices.forEach(idx => newSelected.add(idx))
                      }
                      setSelectedSpawnOptions(newSelected)
                    }}
                  />
                  <span>{allSelected ? 'Deselect All' : 'Select All'} ({filteredOptions.length})</span>
                </label>
              </div>
            )
          })()}

          <div className="spawn-menu-list">
            {spawnOptions
              .map((option, idx) => ({ option, originalIdx: idx }))
              .filter(({ option }) => {
                if (!spawnSearchText) return true
                const searchLower = spawnSearchText.toLowerCase()
                return (
                  option.label.toLowerCase().includes(searchLower) ||
                  option.description?.toLowerCase().includes(searchLower) ||
                  option.command?.toLowerCase().includes(searchLower)
                )
              })
              .map(({ option, originalIdx }) => {
              const isSelected = selectedSpawnOptions.has(originalIdx)

              // Calculate effective working directory (3-tier priority)
              // CRITICAL: Override only applies to spawn options WITHOUT custom workingDir
              const globalWorkingDir = useSettingsStore.getState().workingDirectory || '~'
              const hasCustomWorkingDir = !!option.workingDir
              const effectiveWorkingDir = hasCustomWorkingDir
                ? option.workingDir // Custom path in spawn-options.json (highest priority, ignore override)
                : (spawnWorkingDirOverride || globalWorkingDir) // Use override or global default
              const isOverride = !hasCustomWorkingDir && !!spawnWorkingDirOverride
              const isCustom = hasCustomWorkingDir
              const isDefault = !hasCustomWorkingDir && !spawnWorkingDirOverride

              return (
                <div
                  key={originalIdx}
                  className={`spawn-option ${isSelected ? 'selected' : ''}`}
                >
                  {/* Checkbox for multi-select */}
                  <input
                    type="checkbox"
                    className="spawn-checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation()
                      const newSelected = new Set(selectedSpawnOptions)
                      if (isSelected) {
                        newSelected.delete(originalIdx)
                      } else {
                        newSelected.add(originalIdx)
                      }
                      setSelectedSpawnOptions(newSelected)
                    }}
                  />
                  <div
                    className="spawn-option-content"
                    onClick={() => {
                      if (selectedSpawnOptions.size === 0) {
                        // No selections - spawn single terminal immediately
                        handleSpawnTerminal(option)
                      } else {
                        // Has selections - toggle this one
                        const newSelected = new Set(selectedSpawnOptions)
                        if (isSelected) {
                          newSelected.delete(originalIdx)
                        } else {
                          newSelected.add(originalIdx)
                        }
                        setSelectedSpawnOptions(newSelected)
                      }
                    }}
                  >
                    <span className="spawn-icon">{option.icon}</span>
                    <div className="spawn-info">
                      <div className="spawn-label">{option.label}</div>
                      <div className="spawn-description">{option.description}</div>
                      <div className="spawn-workingdir">
                        📁 {effectiveWorkingDir}
                        {isOverride && <span className="workingdir-badge workingdir-override"> (override)</span>}
                        {isCustom && <span className="workingdir-badge workingdir-custom"> (custom)</span>}
                        {isDefault && <span className="workingdir-badge workingdir-default"> (default)</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bulk Spawn Button */}
          {selectedSpawnOptions.size > 0 && (
            <div className="spawn-menu-footer">
              <button
                className="spawn-selected-btn"
                onClick={handleBulkSpawn}
              >
                Spawn {selectedSpawnOptions.size} Terminal{selectedSpawnOptions.size > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Terminal Display */}
      <div className="terminal-display">
        {visibleTerminals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📟</div>
            <div className="empty-text">No terminals open</div>
            <button className="spawn-button" onClick={() => setShowSpawnMenu(true)}>
              Spawn Terminal
            </button>
          </div>
        ) : (
          <>
            {/* Render ONLY visible terminals (exclude split containers and hidden terminals) */}
            {visibleTerminals
              .filter(terminal => {
                const isHidden = terminal.isHidden === true
                if (isHidden) return false

                // Include panes in splits (even if they also have splitLayout)
                const splitInfo = splitTabInfo.get(terminal.id)
                if (splitInfo && splitInfo.position !== 'single') return true

                // Exclude containers that are not also panes
                const hasSplitLayout = terminal.splitLayout && terminal.splitLayout.type !== 'single'
                if (hasSplitLayout) return false

                return true
              })
              .map((terminal) => {
              const agent = agents.find(a => a.id === terminal.agentId)

              // Don't render Terminal component until status is 'active' and agent exists
              if (!agent || terminal.status !== 'active') {
                return terminal.id === activeTerminalId ? (
                  <div key={terminal.id} className="loading-state">
                    {terminal.status === 'detached' ? (
                      <>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📌</div>
                        <div className="loading-text">
                          Terminal detached from session: {terminal.sessionName}
                        </div>
                        <div style={{ marginTop: '12px', fontSize: '14px', color: '#888' }}>
                          Click this tab to re-attach
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="loading-spinner"></div>
                        <div className="loading-text">
                          {terminal.status === 'spawning' ? 'Connecting to terminal...' :
                           terminal.status === 'error' ? 'Failed to connect' :
                           'Loading...'}
                        </div>
                      </>
                    )}
                  </div>
                ) : null
              }

              return (
                <div
                  key={terminal.id}
                  style={{
                    // Use absolute positioning instead of display:none
                    // This allows xterm.js to initialize properly with non-zero dimensions
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    visibility: terminal.id === activeTerminalId ? 'visible' : 'hidden',
                    zIndex: terminal.id === activeTerminalId ? 1 : 0,
                  }}
                  className="terminal-wrapper"
                >
                  <SplitLayout
                    terminal={terminal}
                    terminals={visibleTerminals}
                    agents={webSocketAgents}
                    onClose={handleCloseTerminal}
                    onPopOut={handlePopOutPane}
                    onCommand={handleCommand}
                    wsRef={wsRef}
                    terminalRef={terminalRef}
                    activeTerminalId={activeTerminalId}
                  />
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* App Footer - Shows focused/active terminal info and controls */}
      {displayTerminal && displayAgent && (
        <div className="app-footer">
          <div className="footer-terminal-info">
            <span className="footer-terminal-icon">
              {displayTerminal.icon || '💻'}
            </span>
            <span className="footer-terminal-name">{displayAgent.name}</span>
            <span className="footer-terminal-type">({displayAgent.terminalType})</span>
            {displayAgent.pid && (
              <span className="footer-terminal-pid">PID: {displayAgent.pid}</span>
            )}
          </div>

          <div className="footer-controls">
            {/* Font Size Controls */}
            <button
              className="footer-control-btn"
              onClick={() => handleFontSizeChange(-1)}
              title="Decrease font size"
              disabled={!displayTerminal.fontSize || displayTerminal.fontSize <= 10}
            >
              −
            </button>
            <span className="font-size-display">{displayTerminal.fontSize || useSettingsStore.getState().terminalDefaultFontSize}px</span>
            <button
              className="footer-control-btn"
              onClick={() => handleFontSizeChange(1)}
              title="Increase font size"
              disabled={!!displayTerminal.fontSize && displayTerminal.fontSize >= 24}
            >
              +
            </button>

            {/* Reset to Defaults Button */}
            <button
              className="footer-control-btn"
              onClick={handleResetToDefaults}
              title="Reset to spawn-option defaults (theme, font, transparency)"
            >
              ↺
            </button>

            {/* Customize Panel Toggle */}
            <button
              className="footer-control-btn"
              onClick={() => setShowCustomizePanel(!showCustomizePanel)}
              title="Customize theme, transparency, font"
            >
              🎨
            </button>
          </div>
        </div>
      )}

      {/* Floating Customize Modal */}
      {showCustomizePanel && displayTerminal && (
        <div className="customize-modal">
            <div className="customize-modal-header">
              <h3>🎨 Customize Terminal</h3>
              <button
                className="customize-close-btn"
                onClick={() => setShowCustomizePanel(false)}
              >
                ✕
              </button>
            </div>

            <div className="customize-modal-body">
              <label>
                Text Color Theme
                <TextColorThemeDropdown
                  value={displayTerminal.theme || 'default'}
                  onChange={handleThemeChange}
                  openUpward={true}
                />
              </label>

              <label>
                Background Gradient
                <BackgroundGradientDropdown
                  value={displayTerminal.background || 'dark-neutral'}
                  onChange={handleBackgroundChange}
                  openUpward={true}
                />
              </label>

              <label>
                Transparency: {displayTerminal.transparency || 100}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={displayTerminal.transparency || 100}
                  onChange={(e) => handleTransparencyChange(parseInt(e.target.value))}
                />
              </label>

              <label>
                Font Family
                <FontFamilyDropdown
                  value={displayTerminal.fontFamily || useSettingsStore.getState().terminalDefaultFontFamily || 'monospace'}
                  onChange={handleFontFamilyChange}
                  openUpward={true}
                />
              </label>
            </div>
          </div>
      )}

      {/* Context Menu */}
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
            const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId)
            const canDetach = terminal?.sessionName && terminal?.status !== 'detached'

            // Check if this terminal is part of a split (either as container or as pane)
            const isInSplit = terminal && (
              // This terminal is a split container
              (terminal.splitLayout && terminal.splitLayout.type !== 'single') ||
              // OR this terminal is a pane in another container's split
              storedTerminals.some(t => t.splitLayout?.panes?.some(p => p.terminalId === terminal.id))
            )

            return (
              <>
                <button
                  className="context-menu-item"
                  onClick={handleContextRename}
                >
                  ✏️ Update Display Name...
                </button>
                {canDetach && (
                  <button
                    className="context-menu-item"
                    onClick={handleContextDetach}
                  >
                    📌 Detach
                  </button>
                )}
                {isInSplit && (
                  <button
                    className="context-menu-item"
                    onClick={handleContextUnsplit}
                  >
                    ↔️ Unsplit
                  </button>
                )}
                <button
                  className="context-menu-item"
                  onClick={() => handleContextPopOut('tab')}
                >
                  🗂️ Open in New Tab
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => handleContextPopOut('window')}
                >
                  ↗️ Open in Separate Window
                </button>
                <button
                  className="context-menu-item"
                  onClick={() => {
                    if (contextMenu.terminalId) {
                      handleCloseTerminal(contextMenu.terminalId)
                      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
                    }
                  }}
                >
                  ❌ Kill Session
                </button>
              </>
            )
          })()}
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog.show && renameDialog.terminalId && (
        <div
          className="rename-dialog-overlay"
          onClick={() => setRenameDialog({ show: false, terminalId: null, currentName: '' })}
        >
          <div
            className="rename-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Update Display Name</h3>
            <input
              type="text"
              value={renameDialog.currentName}
              onChange={(e) => setRenameDialog({ ...renameDialog, currentName: e.target.value })}
              placeholder="Enter display name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const terminal = storedTerminals.find(t => t.id === renameDialog.terminalId)
                  handleRenameSave(renameDialog.currentName, terminal?.autoUpdateName !== false)
                } else if (e.key === 'Escape') {
                  setRenameDialog({ show: false, terminalId: null, currentName: '' })
                }
              }}
            />
            <label className="rename-auto-update">
              <input
                type="checkbox"
                checked={storedTerminals.find(t => t.id === renameDialog.terminalId)?.autoUpdateName !== false}
                onChange={(e) => {
                  if (renameDialog.terminalId) {
                    updateTerminal(renameDialog.terminalId, { autoUpdateName: e.target.checked })
                  }
                }}
              />
              Auto-update from tmux
            </label>
            <div className="rename-dialog-buttons">
              <button
                className="rename-cancel"
                onClick={() => setRenameDialog({ show: false, terminalId: null, currentName: '' })}
              >
                Cancel
              </button>
              <button
                className="rename-save"
                onClick={() => {
                  const terminal = storedTerminals.find(t => t.id === renameDialog.terminalId)
                  handleRenameSave(renameDialog.currentName, terminal?.autoUpdateName !== false)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SimpleTerminalApp
