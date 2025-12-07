import { useEffect, useState } from 'react'

export interface ClaudeStatus {
  status: 'idle' | 'awaiting_input' | 'processing' | 'tool_use' | 'working' | 'unknown'
  current_tool?: string
  last_updated?: string
  tmuxPane?: string  // Pane ID (e.g., '%42') for targeted send to Claude in split layouts
}

interface TerminalInfo {
  id: string
  sessionName?: string  // tmux session name
  workingDir?: string
}

/**
 * Hook to track Claude Code status for terminals
 * Polls the backend API to check if Claude is running and its current status
 *
 * Returns a Map of terminal IDs to their Claude status (only for terminals where Claude is detected)
 */
export function useClaudeStatus(terminals: TerminalInfo[]): Map<string, ClaudeStatus> {
  const [statuses, setStatuses] = useState<Map<string, ClaudeStatus>>(new Map())

  useEffect(() => {
    // Only poll terminals that have a working directory (needed for status detection)
    const terminalsWithDir = terminals.filter(t => t.workingDir)

    if (terminalsWithDir.length === 0) {
      setStatuses(new Map())
      return
    }

    const checkStatus = async () => {
      const newStatuses = new Map<string, ClaudeStatus>()

      await Promise.all(
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

            // Only add to map if Claude is detected (status is not unknown)
            if (result.success && result.status !== 'unknown') {
              newStatuses.set(terminal.id, {
                status: result.status,
                current_tool: result.current_tool,
                last_updated: result.last_updated,
                tmuxPane: result.tmuxPane,  // Pane ID for targeted send
              })
            }
          } catch (error) {
            // Silently fail - terminal might not have Claude running
          }
        })
      )

      setStatuses(newStatuses)
    }

    // Initial check
    checkStatus()

    // Poll every 2 seconds
    const interval = setInterval(checkStatus, 2000)

    return () => clearInterval(interval)
  }, [terminals])

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
