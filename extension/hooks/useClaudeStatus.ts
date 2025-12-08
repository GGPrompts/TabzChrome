import { useEffect, useState, useRef } from 'react'

export interface ClaudeStatus {
  status: 'idle' | 'awaiting_input' | 'processing' | 'tool_use' | 'working' | 'unknown'
  current_tool?: string
  last_updated?: string
  tmuxPane?: string  // Pane ID (e.g., '%42') for targeted send to Claude in split layouts
  details?: {
    args?: {
      file_path?: string
      command?: string
      pattern?: string
      description?: string
      [key: string]: any
    }
    [key: string]: any
  }
}

interface TerminalInfo {
  id: string
  sessionName?: string  // tmux session name
  workingDir?: string
}

// Number of consecutive "unknown" responses before removing a terminal from the map
// At 2s polling, 3 misses = 6 seconds of grace period before tab stops showing status
const MISS_THRESHOLD = 3

/**
 * Hook to track Claude Code status for terminals
 * Polls the backend API to check if Claude is running and its current status
 *
 * Uses a "miss counter" to prevent flashing: status is only removed after
 * multiple consecutive "unknown" responses (prevents flicker during tool use)
 *
 * Returns a Map of terminal IDs to their Claude status (only for terminals where Claude is detected)
 */
export function useClaudeStatus(terminals: TerminalInfo[]): Map<string, ClaudeStatus> {
  const [statuses, setStatuses] = useState<Map<string, ClaudeStatus>>(new Map())
  // Track consecutive "unknown" responses per terminal to prevent flashing
  const missCountsRef = useRef<Map<string, number>>(new Map())

  // Memoize terminals to prevent useEffect re-running on every render
  // The parent component passes a new array reference each render (sessions.map(...))
  // which would cause the effect to re-run and flood the network with requests
  const terminalsRef = useRef<TerminalInfo[]>([])
  const terminalsKey = terminals.map(t => `${t.id}:${t.sessionName}:${t.workingDir}`).join('|')
  const prevTerminalsKeyRef = useRef<string>('')

  // Only update ref when terminals actually change (by content, not reference)
  if (terminalsKey !== prevTerminalsKeyRef.current) {
    terminalsRef.current = terminals
    prevTerminalsKeyRef.current = terminalsKey
  }

  useEffect(() => {
    // Use the stable ref instead of the prop directly
    const currentTerminals = terminalsRef.current

    // Only poll terminals that have a working directory (needed for status detection)
    const terminalsWithDir = currentTerminals.filter(t => t.workingDir)
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

    const checkStatus = async () => {
      // Collect results for all terminals
      const results = await Promise.all(
        terminalsWithDir.map(async (terminal) => {
          try {
            const encodedDir = encodeURIComponent(terminal.workingDir!)
            const sessionParam = terminal.sessionName
              ? `&sessionName=${encodeURIComponent(terminal.sessionName)}`
              : ''

            const response = await fetch(
              `http://localhost:8129/api/claude-status?dir=${encodedDir}${sessionParam}`
            )
            const result = await response.json()

            if (result.success && result.status !== 'unknown') {
              return {
                id: terminal.id,
                status: {
                  status: result.status,
                  current_tool: result.current_tool,
                  last_updated: result.last_updated,
                  tmuxPane: result.tmuxPane,
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
            }
            // Otherwise, don't add to map (terminal removed after threshold)
          }
        }

        return newStatuses
      })
    }

    // Initial check
    checkStatus()

    // Poll every 5 seconds (reduced from 2s to prevent Chrome DevTools lag)
    const interval = setInterval(checkStatus, 5000)

    return () => clearInterval(interval)
  }, [terminalsKey])  // Use stable key instead of array reference to prevent re-running on every render

  return statuses
}

/**
 * Get status emoji for display
 * Returns just the emoji, suitable for compact tab display
 */
export function getStatusEmoji(status: ClaudeStatus | undefined): string {
  if (!status) return ''

  switch (status.status) {
    case 'idle':
    case 'awaiting_input':
      return '✓'  // Ready/waiting for input
    case 'processing':
      return '⏳' // Thinking
    case 'tool_use':
      return '🔧' // Using a tool
    case 'working':
      return '💭' // Working/processing
    default:
      return ''
  }
}

/**
 * Get detailed status text for display (matches Tabz format)
 * Returns emoji + tool name + detail, e.g., "🔧 Read: settings.tsx"
 */
export function getStatusText(status: ClaudeStatus | undefined): string {
  if (!status) return ''

  switch (status.status) {
    case 'idle':
    case 'awaiting_input':
      return '✓ Ready'
    case 'processing': {
      // Show what just completed if we have the info (prevents flashing)
      if (status.current_tool && status.details?.args) {
        let detail = ''
        const args = status.details.args
        if (args.file_path) {
          const parts = args.file_path.split('/')
          detail = `: ${parts[parts.length - 1]}`
        } else if (args.description) {
          const desc = args.description
          detail = `: ${desc.length > 20 ? desc.substring(0, 20) + '…' : desc}`
        } else if (args.command) {
          const cmd = args.command
          detail = `: ${cmd.length > 20 ? cmd.substring(0, 20) + '…' : cmd}`
        }
        return `⏳ ${status.current_tool}${detail}`
      }
      return '⏳ Processing'
    }
    case 'tool_use': {
      // Extract detail from args for more informative display
      let detail = ''
      if (status.details?.args) {
        const args = status.details.args
        if (args.file_path) {
          // Show just filename for Read/Edit/Write
          const parts = args.file_path.split('/')
          detail = `: ${parts[parts.length - 1]}`
        } else if (args.description) {
          // Show task description for Task/Bash (truncate)
          const desc = args.description
          detail = `: ${desc.length > 20 ? desc.substring(0, 20) + '…' : desc}`
        } else if (args.command) {
          // Show truncated command for Bash
          const cmd = args.command
          detail = `: ${cmd.length > 20 ? cmd.substring(0, 20) + '…' : cmd}`
        } else if (args.pattern) {
          // Show search pattern for Grep/Glob
          const pattern = args.pattern
          detail = `: ${pattern.length > 15 ? pattern.substring(0, 15) + '…' : pattern}`
        }
      }
      return status.current_tool ? `🔧 ${status.current_tool}${detail}` : '🔧 Tool'
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
