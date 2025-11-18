import { Terminal as StoredTerminal, useSimpleTerminalStore } from '../stores/simpleTerminalStore'
import { generateWindowId } from '../utils/windowUtils'

/**
 * Custom hook for managing terminal pop-out to new browser windows.
 *
 * Handles the multi-step process of moving a terminal (and its split panes if any)
 * to a new browser window while maintaining tmux session continuity.
 *
 * Critical 4-step popout flow:
 * 1. Update terminal windowId and clear agentId
 * 2. Switch away from terminal in current window
 * 3. Detach from tmux sessions via API
 * 4. Wait for localStorage sync (600ms), then open new window
 *
 * @param currentWindowId - ID of current browser window
 * @param storedTerminals - Array of all stored terminals
 * @param activeTerminalId - ID of currently active terminal
 * @param visibleTerminals - Array of visible terminals in current window
 * @param useTmux - Whether tmux is enabled
 * @param wsRef - WebSocket reference for non-tmux detach messages
 * @param updateTerminal - Function to update terminal properties
 * @param setActiveTerminal - Function to set active terminal
 * @returns Object with handlePopOutTab function
 */
export function usePopout(
  currentWindowId: string,
  storedTerminals: StoredTerminal[],
  activeTerminalId: string | null,
  visibleTerminals: StoredTerminal[],
  useTmux: boolean,
  wsRef: React.RefObject<WebSocket | null>,
  updateTerminal: (id: string, updates: Partial<StoredTerminal>) => void,
  setActiveTerminal: (id: string | null) => void
) {
  /**
   * Move tab to new window (or existing window if specified)
   *
   * For split containers: Opens a SEPARATE window for each pane (simplified approach)
   * For single terminals: Moves to one new window
   *
   * @param terminalId - ID of terminal to pop out
   * @param targetWindowId - Optional target window ID (generates new if not provided)
   * @param popoutMode - 'tab' opens in new browser tab, 'window' opens as separate popup window
   */
  const handlePopOutTab = async (terminalId: string, targetWindowId?: string, popoutMode: 'tab' | 'window' = 'tab') => {
    const terminal = storedTerminals.find(t => t.id === terminalId)
    if (!terminal) return

    // Check if this terminal is PART OF a split (not just IS a split container)
    const splitContainer = storedTerminals.find(t =>
      t.splitLayout?.panes?.some(p => p.terminalId === terminalId)
    )

    // If this is a pane within a split, pop out just this pane
    if (splitContainer && splitContainer.splitLayout) {
      console.log(`[usePopout] Popping out pane ${terminal.name} from split ${splitContainer.id}`)

      const paneWindowId = generateWindowId()

      // Update pane to new window and clear split-related state
      updateTerminal(terminalId, {
        agentId: undefined,
        status: 'spawning',
        windowId: paneWindowId,
        isHidden: false,  // Clear split pane hidden state
        splitLayout: { type: 'single', panes: [] },  // Clear any split layout
      })

      // Remove this pane from the split container
      const remainingPanes = splitContainer.splitLayout.panes.filter(p => p.terminalId !== terminalId)

      if (remainingPanes.length === 1) {
        // Only 1 pane left - convert split back to single terminal
        console.log(`[usePopout] Only 1 pane remaining after popout, converting to single`)
        updateTerminal(splitContainer.id, {
          splitLayout: { type: 'single', panes: [] }
        })

        // Unhide the remaining pane
        const remainingPaneTerminal = storedTerminals.find(t => t.id === remainingPanes[0].terminalId)
        if (remainingPaneTerminal?.isHidden) {
          updateTerminal(remainingPanes[0].terminalId, {
            isHidden: false
          })
        }
      } else {
        // Still have multiple panes - update the split
        updateTerminal(splitContainer.id, {
          splitLayout: {
            ...splitContainer.splitLayout,
            panes: remainingPanes
          }
        })
      }

      // Switch to remaining terminal/split if needed
      if (activeTerminalId === splitContainer.id && remainingPanes.length === 1) {
        setActiveTerminal(remainingPanes[0].terminalId)
      }

      // CRITICAL: Send disconnect WebSocket message to remove from terminalOwners map
      // This prevents the original window from receiving terminal output after popout
      if (terminal.agentId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log(`[usePopout] Sending disconnect for agentId: ${terminal.agentId}`)
        wsRef.current.send(JSON.stringify({
          type: 'disconnect',
          data: { terminalId: terminal.agentId }
        }))
      }

      // Detach from tmux session
      if (terminal.sessionName && useTmux) {
        console.log(`[usePopout] Detaching from tmux session via API`)
        try {
          const response = await fetch(`/api/tmux/detach/${terminal.sessionName}`, {
            method: 'POST',
          })
          const result = await response.json()
          if (result.success) {
            console.log(`[usePopout] ✓ Detached from tmux session: ${terminal.sessionName}`)
          }
        } catch (error) {
          console.error(`[usePopout] Error detaching:`, error)
        }
      }

      // Wait for localStorage sync, then open new window
      setTimeout(() => {
        console.log(`[usePopout] Opening new window for ${terminal.name} (mode: ${popoutMode})`)
        const url = `${window.location.origin}${window.location.pathname}?window=${paneWindowId}&active=${terminalId}`
        const windowFeatures = popoutMode === 'window' ? 'popup,width=1200,height=800' : undefined
        const newWin = window.open(url, `tabz-${paneWindowId}`, windowFeatures)

        if (!newWin) {
          console.error('[usePopout] Failed to open window (popup blocked?)')
          alert('Failed to open popup window. Please allow popups and try again.')
        }
      }, 600)

      return
    }

    // Check if this is a split container (not a pane)
    const isSplitContainer = terminal.splitLayout && terminal.splitLayout.type !== 'single'

    if (isSplitContainer && terminal.splitLayout!.panes.length > 0) {
      console.log(`[usePopout] Popping out split container - opening separate window for each of ${terminal.splitLayout!.panes.length} panes`)

      // Collect all pane terminals
      const paneTerminals = terminal.splitLayout!.panes
        .map(pane => storedTerminals.find(t => t.id === pane.terminalId))
        .filter(t => t && t.sessionName) as StoredTerminal[]

      if (paneTerminals.length === 0) {
        console.warn('[usePopout] No valid panes found in split')
        return
      }

      // Step 1: For each pane, move to a NEW window (separate window IDs)
      const paneUpdates: Array<{ terminalId: string; newWindowId: string; sessionName: string }> = []

      for (const paneTerminal of paneTerminals) {
        const paneWindowId = generateWindowId()
        paneUpdates.push({
          terminalId: paneTerminal.id,
          newWindowId: paneWindowId,
          sessionName: paneTerminal.sessionName!
        })

        // CRITICAL: Update pane to new window and clear split-related state
        // Must clear isHidden and splitLayout so it becomes a normal tab in new window
        updateTerminal(paneTerminal.id, {
          agentId: undefined,
          status: 'spawning',
          windowId: paneWindowId,
          isHidden: false,  // Clear split pane hidden state
          splitLayout: { type: 'single', panes: [] },  // Clear any split layout
        })

        console.log(`[usePopout] Pane ${paneTerminal.name} → window ${paneWindowId}`)
      }

      // Step 2: Remove the split container from current window
      // (Individual panes are now independent terminals in their own windows)
      useSimpleTerminalStore.getState().removeTerminal(terminalId)

      // Step 3: Send disconnect WebSocket messages for all panes
      // This removes them from terminalOwners map on the backend
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log(`[usePopout] Sending disconnect for ${paneTerminals.length} panes`)
        paneTerminals.forEach(paneTerminal => {
          if (paneTerminal.agentId) {
            console.log(`[usePopout] Disconnecting agentId: ${paneTerminal.agentId}`)
            wsRef.current!.send(JSON.stringify({
              type: 'disconnect',
              data: { terminalId: paneTerminal.agentId }
            }))
          }
        })
      }

      // Step 4: Switch to next available tab in current window
      if (activeTerminalId === terminalId) {
        const remainingTerminals = visibleTerminals.filter(t =>
          t.id !== terminalId &&
          !paneUpdates.find(p => p.terminalId === t.id) &&
          (t.windowId || 'main') === currentWindowId
        )
        if (remainingTerminals.length > 0) {
          setActiveTerminal(remainingTerminals[0].id)
          console.log(`[usePopout] Switched to ${remainingTerminals[0].name}`)
        } else {
          setActiveTerminal(null)
          console.log(`[usePopout] No remaining terminals`)
        }
      }

      // Step 5: Detach from tmux sessions
      if (useTmux) {
        console.log(`[usePopout] Detaching from ${paneUpdates.length} tmux sessions via API`)
        await Promise.all(
          paneUpdates.map(async ({ sessionName }) => {
            try {
              const response = await fetch(`/api/tmux/detach/${sessionName}`, {
                method: 'POST',
              })
              const result = await response.json()
              if (result.success) {
                console.log(`[usePopout] ✓ Detached from tmux session: ${sessionName}`)
              } else {
                console.warn(`[usePopout] Failed to detach from ${sessionName}:`, result.error)
              }
            } catch (error) {
              console.error(`[usePopout] Error detaching from ${sessionName}:`, error)
            }
          })
        )
      }

      // Step 6: Wait for localStorage sync, then open SEPARATE windows for each pane
      setTimeout(() => {
        console.log(`[usePopout] Opening ${paneUpdates.length} separate windows (mode: ${popoutMode})`)
        let successCount = 0
        const windowFeatures = popoutMode === 'window' ? 'popup,width=1200,height=800' : undefined

        for (const { terminalId: paneId, newWindowId, sessionName } of paneUpdates) {
          const url = `${window.location.origin}${window.location.pathname}?window=${newWindowId}&active=${paneId}`
          const newWin = window.open(url, `tabz-${newWindowId}`, windowFeatures)

          if (newWin) {
            successCount++
            console.log(`[usePopout] ✓ Opened window for ${sessionName}`)
          } else {
            console.error(`[usePopout] Failed to open window for ${sessionName} (popup blocked?)`)
          }
        }

        if (successCount === 0) {
          alert('Failed to open popup windows. Please allow popups and try again.')
        } else if (successCount < paneUpdates.length) {
          alert(`Only ${successCount} of ${paneUpdates.length} windows opened. Please allow popups.`)
        }
      }, 600)

      return
    }

    // Single terminal (not a split) - original logic
    const newWindowId = targetWindowId || generateWindowId()

    console.log(`[usePopout] Popping out ${terminal.name} to window: ${newWindowId}`)

    // Collect all session names to detach (terminal + split panes if any exist)
    const sessionsToDetach: string[] = []
    if (terminal.sessionName) {
      sessionsToDetach.push(terminal.sessionName)
    }

    // Step 1: Send disconnect WebSocket message to remove from terminalOwners map
    if (terminal.agentId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log(`[usePopout] Step 1: Sending disconnect for agentId: ${terminal.agentId}`)
      wsRef.current.send(JSON.stringify({
        type: 'disconnect',
        data: { terminalId: terminal.agentId }
      }))
    }

    // Step 2: Update state - move to new window and clear agent IDs
    console.log(`[usePopout] Step 2: Updating state (windowId=${newWindowId})`)
    updateTerminal(terminalId, {
      agentId: undefined,
      status: 'spawning',
      windowId: newWindowId,
    })

    // Step 3: Switch away from this terminal in current window
    if (activeTerminalId === terminalId) {
      const remainingTerminals = visibleTerminals.filter(t =>
        t.id !== terminalId &&
        (t.windowId || 'main') === currentWindowId
      )
      if (remainingTerminals.length > 0) {
        setActiveTerminal(remainingTerminals[0].id)
        console.log(`[usePopout] Step 3: Switched to ${remainingTerminals[0].name}`)
      } else {
        setActiveTerminal(null)
        console.log(`[usePopout] Step 3: No remaining terminals, cleared active`)
      }
    }

    // Step 4: Detach from tmux sessions using API (for tmux terminals)
    if (sessionsToDetach.length > 0 && useTmux) {
      console.log(`[usePopout] Step 4: Detaching from ${sessionsToDetach.length} tmux sessions via API`)
      // Detach from all sessions concurrently
      await Promise.all(
        sessionsToDetach.map(async (sessionName) => {
          try {
            const response = await fetch(`/api/tmux/detach/${sessionName}`, {
              method: 'POST',
            })
            const result = await response.json()
            if (result.success) {
              console.log(`[usePopout] ✓ Detached from tmux session: ${sessionName}`)
            } else {
              console.warn(`[usePopout] Failed to detach from ${sessionName}:`, result.error)
            }
          } catch (error) {
            console.error(`[usePopout] Error detaching from ${sessionName}:`, error)
          }
        })
      )
    } else {
      // For non-tmux terminals, send WebSocket detach
      const agentsToDetach: string[] = []
      if (terminal.agentId) agentsToDetach.push(terminal.agentId)
      if (terminal.splitLayout && terminal.splitLayout.panes.length > 0) {
        terminal.splitLayout.panes.forEach(pane => {
          const paneTerminal = storedTerminals.find(t => t.id === pane.terminalId)
          if (paneTerminal?.agentId) agentsToDetach.push(paneTerminal.agentId)
        })
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && agentsToDetach.length > 0) {
        console.log(`[usePopout] Step 4: Sending ${agentsToDetach.length} WebSocket detach messages`)
        agentsToDetach.forEach(agentId => {
          wsRef.current!.send(JSON.stringify({
            type: 'detach',
            terminalId: agentId,
          }))
        })
      }
    }

    // Step 5: Wait for state to sync and detaches to process, then open new window
    // New window will see updated windowId in localStorage and reconnect automatically
    // CRITICAL: Must wait for Zustand localStorage sync (debounced with 100ms delay)
    // to complete before opening new window, otherwise new window won't see updated windowId
    setTimeout(() => {
      console.log(`[usePopout] Step 5: Opening new window (mode: ${popoutMode})`)
      // Pass both windowId AND the terminalId to activate in the new window
      const url = `${window.location.origin}${window.location.pathname}?window=${newWindowId}&active=${terminalId}`
      const windowFeatures = popoutMode === 'window' ? 'popup,width=1200,height=800' : undefined
      const newWin = window.open(url, `tabz-${newWindowId}`, windowFeatures)

      if (!newWin) {
        console.error('[usePopout] Failed to open new window (popup blocked?)')
      }
    }, 600) // Increased from 400ms to ensure localStorage sync completes (100ms debounce + 500ms buffer)
  }

  return {
    handlePopOutTab
  }
}
