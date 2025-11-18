import { useEffect, useRef } from 'react'
import { useSimpleTerminalStore, Terminal } from '../stores/simpleTerminalStore'

/**
 * Hook to automatically sync terminal names from tmux pane titles
 * Polls tmux sessions every 2 seconds and updates tab names
 */
export function useTerminalNameSync(
  currentWindowId: string,
  useTmux: boolean
) {
  const { terminals, updateTerminal } = useSimpleTerminalStore()
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Only poll if tmux is enabled
    if (!useTmux) return

    // Filter terminals that belong to this window and have tmux sessions
    const syncTerminals = async () => {
      const terminalsToSync = terminals.filter(t =>
        (t.windowId || 'main') === currentWindowId &&
        t.sessionName &&
        t.status === 'active' && // Don't sync detached terminals!
        t.autoUpdateName !== false // Default to true if undefined
      )

      if (terminalsToSync.length === 0) return

      // Batch fetch all terminal info
      await Promise.all(
        terminalsToSync.map(async (terminal) => {
          try {
            const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
            const result = await response.json()

            if (result.success) {
              let newName = result.paneTitle || terminal.name

              // Check if pane title is generic (hostname or common shell names)
              // We want to KEEP names like "tfe", "lazygit", "htop", "vim" - these are useful!
              const isGenericTitle =
                // Common shell names only (not TUI app names!)
                ['bash', 'zsh', 'sh', 'fish', 'ksh', 'tcsh'].includes(newName.toLowerCase()) ||
                // Session name itself (e.g., 'tt-bash-abc')
                newName === terminal.sessionName ||
                // Hostname patterns (MattDesktop, localhost, ip-xxx)
                /^(localhost|[\w]+-desktop|[\w]+-laptop|ip-[\d-]+)$/i.test(newName)

              // For generic titles on non-Claude Code terminals, use spawn label
              if (isGenericTitle && terminal.terminalType !== 'claude-code') {
                // Fall back to original spawn label (e.g., "Bash", "TFE", "LazyGit")
                newName = terminal.spawnLabel || terminal.name
              }

              // Add window/pane count if multiple exist
              const counts = []
              if (result.windowCount > 1) {
                counts.push(`${result.windowCount}w`)
              }
              if (result.paneCount > 1) {
                counts.push(`${result.paneCount}p`)
              }
              if (counts.length > 0) {
                newName = `${newName} (${counts.join(', ')})`
              }

              // Only update if name actually changed to avoid unnecessary re-renders
              if (newName !== terminal.name) {
                // Use setTimeout to ensure update happens after current render cycle completes
                // This prevents "Cannot update component while rendering" React warnings
                setTimeout(() => {
                  updateTerminal(terminal.id, { name: newName })
                }, 0)
              }
            }
          } catch (error) {
            // Silently fail - don't spam console for disconnected terminals
            if (error instanceof Error && !error.message.includes('404')) {
              console.warn(`[NameSync] Failed to sync ${terminal.sessionName}:`, error.message)
            }
          }
        })
      )
    }

    // Initial sync
    syncTerminals()

    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(syncTerminals, 2000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [terminals, currentWindowId, useTmux, updateTerminal])
}
