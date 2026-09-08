import { useEffect, useState, useRef } from 'react'
import { isProtectedPromptTerminal } from '../shared/claudePromptNotifications'

export interface ClaudeStatus {
  status: 'idle' | 'awaiting_input' | 'processing' | 'tool_use' | 'working' | 'unknown'
  current_tool?: string
  last_updated?: string
  tmuxPane?: string  // Pane ID (e.g., '%42') for targeted send to Claude in split layouts
  subagent_count?: number  // Number of active subagents (for 🤖🤖🤖 display)
  context_pct?: number  // Context window usage percentage (0-100)
  permission_mode?: string  // 'plan' when in plan mode, null otherwise
  pane_title?: string  // Tmux pane title - set by Claude Code when there's an in_progress todo
  pane_command?: string
  details?: {
    args?: {
      file_path?: string
      command?: string
      pattern?: string
      description?: string
      questions?: Array<{
        question: string
        options: Array<{ label: string; description?: string }>
        multiSelect?: boolean
      }>
      [key: string]: any
    }
    [key: string]: any
  }
}

export interface StatusHistoryEntry {
  text: string          // Display text (e.g., "📖 Read: settings.tsx")
  timestamp: number     // When this status was recorded
}

interface TerminalInfo {
  id: string
  sessionName?: string  // tmux session name
  workingDir?: string
  profileCommand?: string  // Profile's startup command (to filter for claude terminals)
  secret?: boolean
}

export const isClaudeProfile = (command?: string): boolean => !!command && /claude/i.test(command)
export const isClaudePaneCommand = isClaudeProfile

// Number of consecutive "unknown" responses before removing a terminal from the map
// At 3s polling, 3 misses = 9 seconds of grace period before tab stops showing status
const MISS_THRESHOLD = 3

// Maximum number of history entries to keep per terminal
const MAX_HISTORY_ENTRIES = 12

/**
 * Generate concise status text for history display
 * Similar to getStatusText but optimized for history entries
 */
function getStatusTextForHistory(status: ClaudeStatus): string {
  // Skip idle/awaiting_input as they're not interesting for history
  if (status.status === 'idle' || status.status === 'awaiting_input') {
    return ''
  }

  const toolEmojis: Record<string, string> = {
    'Read': '📖', 'Write': '📝', 'Edit': '✏️', 'Bash': '🔺',
    'Glob': '🔍', 'Grep': '🔎', 'Task': '🤖', 'WebFetch': '🌐',
    'WebSearch': '🔍', 'TodoWrite': '📋', 'NotebookEdit': '📓',
    'AskUserQuestion': '❓'
  }

  const emoji = status.current_tool ? (toolEmojis[status.current_tool] || '🔧') : '⏳'

  if (status.current_tool && status.details?.args) {
    const args = status.details.args
    // Skip internal Claude files
    if (args.file_path?.includes('/.claude/')) return ''

    if (args.file_path) {
      const parts = args.file_path.split('/')
      return `${emoji} ${status.current_tool}: ${parts[parts.length - 1]}`
    } else if (args.description) {
      // Truncate long descriptions
      const desc = args.description.length > 30 ? args.description.slice(0, 30) + '…' : args.description
      return `${emoji} ${status.current_tool}: ${desc}`
    } else if (args.command) {
      const cmd = args.command.length > 30 ? args.command.slice(0, 30) + '…' : args.command
      return `${emoji} ${status.current_tool}: ${cmd}`
    } else if (args.pattern) {
      return `${emoji} ${status.current_tool}: ${args.pattern}`
    }
    return `${emoji} ${status.current_tool}`
  }

  if (status.status === 'processing') return '⏳ Processing'
  if (status.status === 'working') return '⚙️ Working'

  return ''
}

export interface ClaudeStatusResult {
  statuses: Map<string, ClaudeStatus>
  history: Map<string, StatusHistoryEntry[]>
}

/**
 * Hook to track Claude Code status for terminals
 * Polls the backend API to check if Claude is running and its current status
 *
 * Uses a "miss counter" to prevent flashing: status is only removed after
 * multiple consecutive "unknown" responses (prevents flicker during tool use)
 *
 * Returns a Map of terminal IDs to their Claude status (only for terminals where Claude is detected)
 * Also returns a history of recent status changes per terminal
 */
export function useClaudeStatus(terminals: TerminalInfo[]): ClaudeStatusResult {
  const [statuses, setStatuses] = useState<Map<string, ClaudeStatus>>(new Map())
  const [history, setHistory] = useState<Map<string, StatusHistoryEntry[]>>(new Map())
  // Track consecutive "unknown" responses per terminal to prevent flashing
  const missCountsRef = useRef<Map<string, number>>(new Map())
  // Track last status text to avoid duplicate history entries
  const lastStatusTextRef = useRef<Map<string, string>>(new Map())

  // Memoize terminals to prevent useEffect re-running on every render
  // The parent component passes a new array reference each render (sessions.map(...))
  // which would cause the effect to re-run and flood the network with requests
  const terminalsRef = useRef<TerminalInfo[]>([])
  const terminalsKey = terminals.map(t => `${t.id}:${t.sessionName}:${t.workingDir}:${t.profileCommand}:${t.secret}`).join('|')
  const prevTerminalsKeyRef = useRef<string>('')

  // Only update ref when terminals actually change (by content, not reference)
  if (terminalsKey !== prevTerminalsKeyRef.current) {
    terminalsRef.current = terminals
    prevTerminalsKeyRef.current = terminalsKey
  }

  useEffect(() => {
    // Use the stable ref instead of the prop directly
    const currentTerminals = terminalsRef.current

    // Only poll terminals that:
    // 1. Have a working directory (needed for status detection)
    // 2. Have a Claude profile or exact tmux session; the latter requires a
    // Claude foreground command in the result, rather than borrowing cwd state.
    const terminalsWithDir = currentTerminals.filter(t =>
      !isProtectedPromptTerminal(t) && t.workingDir &&
      (isClaudeProfile(t.profileCommand) || !!t.sessionName)
    )
    const terminalIds = new Set(terminalsWithDir.map(t => t.id))

    // Clean up miss counts for terminals that no longer exist
    for (const id of missCountsRef.current.keys()) {
      if (!terminalIds.has(id)) {
        missCountsRef.current.delete(id)
      }
    }

    if (terminalsWithDir.length === 0) {
      setStatuses(new Map())
      return
    }

    let cancelled = false
    let inFlight = false
    const checkStatus = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      // Collect results for all terminals
      const results = await Promise.all(
        terminalsWithDir.map(async (terminal) => {
          try {
            const encodedDir = encodeURIComponent(terminal.workingDir!)
            // Use sessionName if available, otherwise fall back to terminal ID for ctt- terminals
            // This fixes status confusion when multiple terminals share the same working directory
            const effectiveSessionName = terminal.sessionName || (terminal.id?.startsWith('ctt-') ? terminal.id : null)
            const sessionParam = effectiveSessionName
              ? `&sessionName=${encodeURIComponent(effectiveSessionName)}`
              : ''

            const response = await fetch(
              `http://localhost:8129/api/claude-status?dir=${encodedDir}${sessionParam}`,
              { signal: AbortSignal.timeout(2000) }
            )
            const result = await response.json()

            // Debug: log status fetches
            // Debug log removed to reduce console spam

            if (result.success && result.status !== 'unknown' &&
                (isClaudeProfile(terminal.profileCommand) || isClaudePaneCommand(result.pane_command))) {
              return {
                id: terminal.id,
                status: {
                  status: result.status,
                  current_tool: result.current_tool,
                  last_updated: result.last_updated,
                  tmuxPane: result.tmuxPane,
                  subagent_count: result.subagent_count || 0,
                  context_pct: result.context_window?.context_pct,
                  pane_title: result.pane_title,
                  pane_command: result.pane_command,
                  details: result.details,
                } as ClaudeStatus,
                success: true,
              }
            }
            return { id: terminal.id, success: false }
          } catch (error) {
            return { id: terminal.id, success: false }
          }
        })
      )
      inFlight = false
      if (cancelled) return

      // Update statuses with debounce logic to prevent flashing
      setStatuses(prevStatuses => {
        const newStatuses = new Map<string, ClaudeStatus>()

        for (const result of results) {
          if (result.success && result.status) {
            // Got valid status - reset miss count and update
            missCountsRef.current.set(result.id, 0)
            newStatuses.set(result.id, result.status)
          } else {
            // Got unknown/error - increment miss count
            const currentMisses = missCountsRef.current.get(result.id) || 0
            const newMisses = currentMisses + 1
            missCountsRef.current.set(result.id, newMisses)

            // Keep previous status if we haven't exceeded threshold
            if (newMisses < MISS_THRESHOLD && prevStatuses.has(result.id)) {
              newStatuses.set(result.id, prevStatuses.get(result.id)!)
            } else if (prevStatuses.has(result.id)) {
              // Even after threshold, preserve context_pct if we had it
              // This keeps the percentage visible even when Claude is idle
              const prevStatus = prevStatuses.get(result.id)!
              if (prevStatus.context_pct != null) {
                newStatuses.set(result.id, {
                  status: 'idle',
                  context_pct: prevStatus.context_pct
                })
              }
            }
          }
        }

        return newStatuses
      })

      // Update history for terminals with new status changes
      setHistory(prevHistory => {
        const newHistory = new Map(prevHistory)
        let changed = false

        for (const result of results) {
          if (result.success && result.status) {
            // Generate status text for history
            const statusText = getStatusTextForHistory(result.status)
            const lastText = lastStatusTextRef.current.get(result.id)

            // Only add to history if status text changed (avoid duplicates)
            if (statusText && statusText !== lastText) {
              lastStatusTextRef.current.set(result.id, statusText)

              const terminalHistory = newHistory.get(result.id) || []
              const newEntry: StatusHistoryEntry = {
                text: statusText,
                timestamp: Date.now()
              }

              // Add to front, keep max entries
              const updatedHistory = [newEntry, ...terminalHistory].slice(0, MAX_HISTORY_ENTRIES)
              newHistory.set(result.id, updatedHistory)
              changed = true
            }
          }
        }

        // Persist to Chrome storage so dashboard can read it
        if (changed) {
          const historyObj: Record<string, StatusHistoryEntry[]> = {}
          newHistory.forEach((entries, id) => {
            historyObj[id] = entries
          })
          chrome.storage.local.set({ claudeStatusHistory: historyObj })
        }

        return newHistory
      })
    }

    // Initial check
    checkStatus()

    // Poll every 1 second (more responsive for tool announcements)
    const interval = setInterval(checkStatus, 1000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [terminalsKey])  // Use stable key instead of array reference to prevent re-running on every render

  return { statuses, history }
}

/**
 * Get robot emoji(s) for display
 * Returns 🤖 plus extra 🤖 for each active subagent
 * e.g., 1 subagent = 🤖🤖, 2 subagents = 🤖🤖🤖
 */
export function getRobotEmojis(status: ClaudeStatus | undefined): string {
  if (!status) return ''
  const count = status.subagent_count || 0
  // Always show at least one robot, plus one for each subagent
  return '🤖'.repeat(1 + count)
}

/**
 * Get tool-specific emoji for display
 * Maps tool names to intuitive emojis
 */
export function getToolEmoji(toolName: string | undefined): string {
  if (!toolName) return '🔧'

  switch (toolName) {
    case 'Read': return '📖'
    case 'Write': return '📝'
    case 'Edit': return '✏️'
    case 'Bash': return '🔺'
    case 'Glob': return '🔍'
    case 'Grep': return '🔎'
    case 'Task': return '🤖'
    case 'WebFetch': return '🌐'
    case 'WebSearch': return '🔍'
    case 'TodoWrite': return '📋'
    case 'NotebookEdit': return '📓'
    case 'AskUserQuestion': return '❓'
    default: return '🔧'
  }
}

/**
 * Check if a file path is an internal Claude file (session memory, etc.)
 * These should not be shown in status updates as they're not user-relevant
 */
function isInternalClaudeFile(filePath: string | undefined): boolean {
  if (!filePath) return false
  return filePath.includes('/.claude/') || filePath.includes('/session-memory/')
}

/**
 * Get status emoji for display
 * Returns tool-specific emoji when using a tool, otherwise status emoji
 */
export function getStatusEmoji(status: ClaudeStatus | undefined): string {
  if (!status) return ''

  switch (status.status) {
    case 'idle':
    case 'awaiting_input':
      return '✓'  // Ready/waiting for input
    case 'processing':
      // Show tool emoji if we know the tool, otherwise hourglass
      return status.current_tool ? getToolEmoji(status.current_tool) : '⏳'
    case 'tool_use':
      return getToolEmoji(status.current_tool)
    case 'working':
      return '💭' // Working/processing
    default:
      return ''
  }
}

/**
 * Get detailed status text for display (matches Tabz format)
 * Returns emoji + tool name + detail, e.g., "📖 Read: settings.tsx"
 * When idle/ready, shows profile name if provided, otherwise "Ready"
 */
export function getStatusText(status: ClaudeStatus | undefined, profileName?: string): string {
  if (!status) return ''

  // Skip displaying internal Claude file operations
  const filePath = status.details?.args?.file_path
  if (isInternalClaudeFile(filePath)) {
    // Show generic processing status instead of internal file details
    if (status.status === 'processing') return '⏳ Processing'
    if (status.status === 'tool_use') return '🔧 Working'
  }

  switch (status.status) {
    case 'idle':
    case 'awaiting_input':
      return profileName ? `✓ ${profileName}` : '✓ Ready'
    case 'processing': {
      // Show what just completed if we have the info (prevents flashing)
      if (status.current_tool && status.details?.args) {
        let detail = ''
        const args = status.details.args
        if (args.file_path) {
          const parts = args.file_path.split('/')
          detail = `: ${parts[parts.length - 1]}`
        } else if (args.description) {
          // Let CSS truncate - tabs can be up to 320px wide
          detail = `: ${args.description}`
        } else if (args.command) {
          // Let CSS truncate - tabs can be up to 320px wide
          detail = `: ${args.command}`
        }
        const emoji = getToolEmoji(status.current_tool)
        return `${emoji} ${status.current_tool}${detail}`
      }
      return '⏳ Processing'
    }
    case 'tool_use': {
      // Extract detail from args for more informative display
      // Let CSS truncate - tabs can be up to 320px wide
      let detail = ''
      if (status.details?.args) {
        const args = status.details.args
        if (args.file_path) {
          // Show just filename for Read/Edit/Write
          const parts = args.file_path.split('/')
          detail = `: ${parts[parts.length - 1]}`
        } else if (args.description) {
          detail = `: ${args.description}`
        } else if (args.command) {
          detail = `: ${args.command}`
        } else if (args.pattern) {
          detail = `: ${args.pattern}`
        }
      }
      const emoji = getToolEmoji(status.current_tool)
      return status.current_tool ? `${emoji} ${status.current_tool}${detail}` : '🔧 Tool'
    }
    case 'working':
      return '⚙️ Working'
    default:
      return ''
  }
}

/**
 * Get full status text for hover tooltip (no truncation)
 * Returns complete details for file paths, commands, descriptions
 */
export function getFullStatusText(status: ClaudeStatus | undefined): string {
  if (!status) return ''

  // Skip displaying internal Claude file operations
  const filePath = status.details?.args?.file_path
  if (isInternalClaudeFile(filePath)) {
    if (status.status === 'processing') return 'Processing...'
    if (status.status === 'tool_use') return 'Working...'
  }

  switch (status.status) {
    case 'idle':
    case 'awaiting_input':
      return 'Ready for input'
    case 'processing': {
      if (status.current_tool && status.details?.args) {
        const args = status.details.args
        if (args.file_path) {
          return `Processing ${status.current_tool}: ${args.file_path}`
        } else if (args.description) {
          return `Processing ${status.current_tool}: ${args.description}`
        } else if (args.command) {
          return `Processing ${status.current_tool}: ${args.command}`
        }
        return `Processing ${status.current_tool}`
      }
      return 'Processing...'
    }
    case 'tool_use': {
      if (status.details?.args) {
        const args = status.details.args
        if (args.file_path) {
          return `${status.current_tool}: ${args.file_path}`
        } else if (args.description) {
          return `${status.current_tool}: ${args.description}`
        } else if (args.command) {
          return `${status.current_tool}: ${args.command}`
        } else if (args.pattern) {
          return `${status.current_tool}: ${args.pattern}`
        }
      }
      return status.current_tool || 'Using tool'
    }
    case 'working':
      return 'Working...'
    default:
      return ''
  }
}

/**
 * Get color for context window percentage display
 * Matches the statusline thresholds: green < 50%, yellow < 75%, red >= 75%
 */
export function getContextColor(contextPct: number | undefined): string {
  if (contextPct === undefined || contextPct === null) return ''
  if (contextPct < 50) return '#00ff88'  // Tabz green
  if (contextPct < 75) return '#fbbf24'  // Amber/yellow
  return '#ef4444'  // Red
}

/**
 * Get color for status text
 * Green checkmark when ready/idle, default otherwise
 */
export function getStatusColor(status: ClaudeStatus | undefined): string {
  if (!status) return ''
  if (status.status === 'idle' || status.status === 'awaiting_input') {
    return '#00ff88'  // Tabz green for ready state
  }
  return ''  // Default color for other states
}
