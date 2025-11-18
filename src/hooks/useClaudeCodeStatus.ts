import { useEffect, useState } from 'react'
import { Terminal } from '../stores/simpleTerminalStore'

export interface ClaudeCodeStatus {
  status: 'idle' | 'awaiting_input' | 'processing' | 'tool_use' | 'working' | 'unknown'
  current_tool?: string
  last_updated?: string
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

/**
 * Hook to track Claude Code terminal status from state-tracker hook
 * Returns a Map of terminal IDs to their current status info
 */
export function useClaudeCodeStatus(
  terminals: Terminal[],
  currentWindowId: string
) {
  const [terminalStatuses, setTerminalStatuses] = useState<Map<string, ClaudeCodeStatus>>(new Map())

  useEffect(() => {
    // Only poll for Claude Code terminals in this window
    const claudeTerminals = terminals.filter(t =>
      (t.windowId || 'main') === currentWindowId &&
      t.terminalType === 'claude-code' &&
      t.workingDir &&
      t.status === 'active'
    )

    if (claudeTerminals.length === 0) {
      setTerminalStatuses(new Map())
      return
    }

    const checkStatus = async () => {
      const newStatuses = new Map<string, ClaudeCodeStatus>()

      await Promise.all(
        claudeTerminals.map(async (terminal) => {
          try {
            // Pass working directory and session name for precise matching
            // Session name allows matching specific tmux panes when multiple Claude sessions exist in same dir
            const encodedDir = encodeURIComponent(terminal.workingDir!)
            const sessionParam = terminal.sessionName ? `&sessionName=${encodeURIComponent(terminal.sessionName)}` : ''
            const response = await fetch(`/api/claude-status?dir=${encodedDir}${sessionParam}`)
            const result = await response.json()

            if (result.success && result.status !== 'unknown') {
              newStatuses.set(terminal.id, {
                status: result.status,
                current_tool: result.current_tool,
                last_updated: result.last_updated,
                details: result.details
              })
            }
          } catch (error) {
            // Silently fail - terminal might not have state file yet
          }
        })
      )

      setTerminalStatuses(newStatuses)
    }

    // Initial check
    checkStatus()

    // Poll every 2 seconds (same as name sync)
    const interval = setInterval(checkStatus, 2000)

    return () => clearInterval(interval)
  }, [terminals, currentWindowId])

  return terminalStatuses
}
