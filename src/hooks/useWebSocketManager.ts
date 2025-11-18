import { useState, useRef, useEffect } from 'react'
import SimpleSpawnService from '../services/SimpleSpawnService'
import { Terminal as StoredTerminal, useSimpleTerminalStore } from '../stores/simpleTerminalStore'
import { Agent } from '../types'

interface SpawnOption {
  label: string
  command: string
  terminalType: string
  icon: string
  description: string
  workingDir?: string
  defaultTheme?: string
  defaultBackground?: string
  defaultTransparency?: number
  defaultFontFamily?: string
  defaultFontSize?: number
}

/**
 * Custom hook for WebSocket connection management and message handling.
 *
 * Handles:
 * - WebSocket connection setup, teardown, and auto-reconnect with exponential backoff
 * - Message routing (terminal-spawned, output, closed, tmux-sessions-list)
 * - Agent state management and lifecycle
 * - Window isolation for multi-window support (CRITICAL for popout feature)
 * - Terminal reconnection to existing tmux sessions on page refresh
 *
 * CRITICAL Window Isolation: This hook implements window filtering to prevent
 * cross-window contamination. Each window only manages terminals with matching windowId.
 * See CLAUDE.md "Critical Architecture (Popout Flow)" for details.
 *
 * @param currentWindowId - ID of current browser window
 * @param storedTerminals - Array of all stored terminals
 * @param activeTerminalId - ID of currently active terminal
 * @param spawnOptions - Array of available spawn options
 * @param spawnOptionsRef - Ref to spawn options (avoids closure issues)
 * @param useTmux - Whether tmux is enabled
 * @param pendingSpawns - Map of pending spawn requests by requestId
 * @param wsRef - CRITICAL: WebSocket ref that must be shared with Terminal components
 * @param updateTerminal - Function to update terminal properties
 * @param removeTerminal - Function to remove a terminal
 * @param setActiveTerminal - Function to set active terminal
 * @param handleReconnectTerminal - Function to reconnect to existing terminal session
 * @returns Object with webSocketAgents, connectionStatus, and setter
 */
export function useWebSocketManager(
  currentWindowId: string,
  storedTerminals: StoredTerminal[],
  activeTerminalId: string | null,
  spawnOptions: SpawnOption[],
  spawnOptionsRef: React.MutableRefObject<SpawnOption[]>,
  useTmux: boolean,
  pendingSpawns: React.MutableRefObject<Map<string, StoredTerminal>>,
  wsRef: React.MutableRefObject<WebSocket | null>, // CRITICAL: Use parent's wsRef!
  updateTerminal: (id: string, updates: Partial<StoredTerminal>) => void,
  removeTerminal: (id: string) => void,
  setActiveTerminal: (id: string | null) => void,
  handleReconnectTerminal: (terminal: StoredTerminal, option: SpawnOption) => Promise<void>
) {
  const [webSocketAgents, setWebSocketAgents] = useState<Agent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected')
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const processedAgentIds = useRef<Set<string>>(new Set())

  // Clear all agentIds on mount - they're always stale after page refresh
  const hasHydrated = useRef(false)
  useEffect(() => {
    if (!hasHydrated.current && storedTerminals.length > 0) {
      hasHydrated.current = true
      console.log('[useWebSocketManager] 🧹 Clearing stale agentIds from localStorage terminals')

      storedTerminals.forEach(terminal => {
        // Skip detached terminals - they should stay detached
        if (terminal.status === 'detached') {
          return
        }

        if (terminal.agentId || terminal.status === 'active') {
          updateTerminal(terminal.id, {
            agentId: undefined,
            status: 'spawning', // Will be updated to 'active' after reconnection
          })
        }
      })
    }
  }, [storedTerminals.length])

  // Query for tmux sessions after both spawn options load AND WebSocket connects
  const hasQueriedSessions = useRef(false)
  useEffect(() => {
    if (
      connectionStatus === 'connected' &&
      spawnOptions.length > 0 &&
      storedTerminals.length > 0 &&
      useTmux &&
      !hasQueriedSessions.current &&
      wsRef.current
    ) {
      console.log('[useWebSocketManager] ✅ Querying for active tmux sessions...')
      wsRef.current.send(JSON.stringify({ type: 'query-tmux-sessions' }))
      hasQueriedSessions.current = true
    }
  }, [connectionStatus, spawnOptions.length, storedTerminals.length, useTmux])

  // Reset query flag on disconnect
  useEffect(() => {
    if (connectionStatus === 'disconnected') {
      hasQueriedSessions.current = false
    }
  }, [connectionStatus])

  // Clean up agents for terminals that become detached (via broadcast from other windows)
  // OPTIMIZED: Only run when detachment status actually changes, not on every terminal update
  useEffect(() => {
    const detachedTerminals = storedTerminals.filter(t => t.status === 'detached' && t.agentId)

    detachedTerminals.forEach(terminal => {
      const hasAgent = webSocketAgents.some(a => a.id === terminal.agentId)

      if (hasAgent && terminal.agentId) {
        console.log('[useWebSocketManager] 🧹 Cleaning up agent for detached terminal:', terminal.name)

        // Send disconnect to backend
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'disconnect',
            data: { terminalId: terminal.agentId }
          }))
        }

        // Remove agent from local state
        setWebSocketAgents(prev => prev.filter(a => a.id !== terminal.agentId))

        // Clear agentId from terminal
        updateTerminal(terminal.id, { agentId: undefined })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only depend on terminal status changes, not all properties
    // Create stable reference that only changes when status/agentId changes
    storedTerminals.map(t => `${t.id}:${t.status}:${t.agentId || ''}`).join(','),
    webSocketAgents.length // Only care about agent count, not their properties
  ])

  /**
   * Handle WebSocket messages - routes messages to appropriate handlers
   * CRITICAL: Implements window isolation to prevent cross-window contamination
   */
  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'terminal-spawned':
        if (message.data) {
          console.log('[useWebSocketManager] 📨 Received terminal-spawned:', {
            agentId: message.data.id,
            requestId: message.requestId,
            sessionName: message.data.sessionName,
            pendingSpawnsSize: pendingSpawns.current.size
          })

          if (processedAgentIds.current.has(message.data.id)) {
            console.log('[useWebSocketManager] ⏭️ Already processed agentId:', message.data.id)
            return
          }

          // Find matching terminal - check pendingSpawns ref first (synchronous)
          let existingTerminal = pendingSpawns.current.get(message.requestId)
          console.log('[useWebSocketManager] 🔍 Checking pendingSpawns:', existingTerminal ? 'FOUND' : 'NOT FOUND')

          // Fallback: Check state by requestId
          if (!existingTerminal) {
            existingTerminal = storedTerminals.find(t => t.requestId === message.requestId)
            console.log('[useWebSocketManager] 🔍 Checking storedTerminals by requestId:', existingTerminal ? 'FOUND' : 'NOT FOUND')
          }

          // Fallback: Check by agentId (reconnection case)
          if (!existingTerminal) {
            existingTerminal = storedTerminals.find(t => t.agentId === message.data.id)
            console.log('[useWebSocketManager] 🔍 Checking storedTerminals by agentId:', existingTerminal ? 'FOUND' : 'NOT FOUND')
          }

          // Fallback: Find most recent spawning terminal of same type IN THIS WINDOW
          // CRITICAL: Filter by windowId to prevent cross-window contamination with fast-spawning terminals (bash)
          if (!existingTerminal) {
            const spawningTerminals = storedTerminals.filter(t =>
              t.status === 'spawning' &&
              t.terminalType === message.data.terminalType &&
              (t.windowId || 'main') === currentWindowId
            )
            console.log('[useWebSocketManager] 🔍 Spawning terminals of type', message.data.terminalType, ':', spawningTerminals.length)
            existingTerminal = spawningTerminals.sort((a, b) => b.createdAt - a.createdAt)[0]
            console.log('[useWebSocketManager] 🔍 Checking spawning terminals by type:', existingTerminal ? 'FOUND' : 'NOT FOUND')
          }

          // CRITICAL: Only update terminals that belong to THIS window
          // Check this BEFORE adding to webSocketAgents to prevent cross-window contamination
          if (existingTerminal) {
            const terminalWindow = existingTerminal.windowId || 'main'
            if (terminalWindow !== currentWindowId) {
              console.log('[useWebSocketManager] ⏭️ Ignoring terminal-spawned for different window')
              return
            }

            console.log('[useWebSocketManager] ✅ Matched terminal:', existingTerminal.id)

            // Add to webSocketAgents
            processedAgentIds.current.add(message.data.id)
            setWebSocketAgents(prev => {
              const existingIndex = prev.findIndex(a => a.id === message.data.id)
              if (existingIndex !== -1) {
                const updated = [...prev]
                updated[existingIndex] = {
                  ...message.data,
                  status: message.data.state || message.data.status || 'active',
                }
                return updated
              }
              return [...prev, {
                ...message.data,
                status: message.data.state || message.data.status || 'active',
              }]
            })

            // Clear from pending spawns
            if (message.requestId) {
              pendingSpawns.current.delete(message.requestId)
            }

            // Update terminal with agent info - PRESERVE critical properties
            updateTerminal(existingTerminal.id, {
              agentId: message.data.id,
              sessionName: message.data.sessionName,
              status: 'active',
              requestId: undefined,
              splitLayout: existingTerminal.splitLayout,
              isHidden: existingTerminal.isHidden,
              windowId: existingTerminal.windowId, // CRITICAL: Preserve window assignment
            })
          } else {
            // CRITICAL: Do NOT create terminal for unmatched spawns
            // Prevents cross-window contamination
            // Note: This is normal when terminals spawn in other windows (multi-window isolation)
            console.log('[useWebSocketManager] ⏭️ Ignoring terminal-spawned from another window', {
              requestId: message.requestId,
              agentId: message.data.id,
              sessionName: message.data.sessionName,
              currentWindow: currentWindowId,
            })
            return
          }
        }
        break

      case 'terminal-output':
        if (message.terminalId && message.data) {
          // Dispatch custom event for Terminal component to handle
          window.dispatchEvent(new CustomEvent('terminal-output', {
            detail: {
              terminalId: message.terminalId,
              data: message.data,
            },
          }))
        }
        break

      case 'terminal-closed':
        if (message.data && message.data.id) {
          console.log(`[useWebSocketManager] Received terminal-closed for agentId: ${message.data.id}`)

          // Get fresh terminals from store (not closure variable which might be stale)
          const freshTerminals = useSimpleTerminalStore.getState().terminals

          console.log(`[useWebSocketManager] Current terminals:`, freshTerminals.map(t => ({
            id: t.id,
            name: t.name,
            agentId: t.agentId,
            status: t.status
          })))

          setWebSocketAgents(prev => prev.filter(a => a.id !== message.data.id))

          // Find terminal with this agentId
          const terminal = freshTerminals.find(t => t.agentId === message.data.id)
          if (!terminal) {
            console.warn(`[useWebSocketManager] Terminal not found for agentId: ${message.data.id}`)
            console.warn(`[useWebSocketManager] Available agentIds:`, freshTerminals.map(t => t.agentId).filter(Boolean))
            break
          }

          console.log(`[useWebSocketManager] Terminal exited naturally (exit/Ctrl+D): ${terminal.name} (${terminal.id})`)

          // Check if this terminal is part of a split
          const splitContainer = freshTerminals.find(t =>
            t.splitLayout?.panes?.some(p => p.terminalId === terminal.id)
          )

          if (splitContainer && splitContainer.splitLayout) {
            // Terminal is part of a split - clean up the split
            console.log(`[useWebSocketManager] Cleaning up split for exited terminal: ${terminal.id}`)

            const remainingPanes = splitContainer.splitLayout.panes.filter(
              p => p.terminalId !== terminal.id
            )

            if (remainingPanes.length === 1) {
              // Only 1 pane left - convert split container back to single terminal
              console.log(`[useWebSocketManager] Only 1 pane remaining, converting split to single terminal`)
              updateTerminal(splitContainer.id, {
                splitLayout: { type: 'single', panes: [] }
              })

              // Unhide the remaining pane if it was hidden (backwards compatibility)
              const remainingPaneTerminal = freshTerminals.find(t => t.id === remainingPanes[0].terminalId)
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
              // No panes left - remove the container too
              removeTerminal(splitContainer.id)
            }
          }

          console.log(`[useWebSocketManager] Removing terminal from store: ${terminal.id}`)

          // Remove the exited terminal from store
          removeTerminal(terminal.id)

          // If this was the active terminal, we need to switch to another one
          // Do this in the next tick to allow state to update
          if (activeTerminalId === terminal.id) {
            console.log(`[useWebSocketManager] Closed terminal was active, will switch to next available`)

            // Use requestAnimationFrame to ensure state has updated
            requestAnimationFrame(() => {
              // Get fresh terminals from Zustand store instead of closure variable
              const freshTerminals = useSimpleTerminalStore.getState().terminals
              const currentVisibleTerminals = freshTerminals.filter(t => {
                const terminalWindow = t.windowId || 'main'
                if (terminalWindow !== currentWindowId) return false

                // Filter out hidden terminals and split containers
                const isHidden = t.isHidden === true
                if (isHidden) return false

                // Include panes (even if they also have splitLayout)
                const isPane = freshTerminals.some(container =>
                  container.splitLayout?.panes?.some(p => p.terminalId === t.id)
                )
                if (isPane) return true

                // Exclude containers that are not also panes
                const hasSplitLayout = t.splitLayout && t.splitLayout.type !== 'single'
                if (hasSplitLayout) return false

                return true
              })

              if (currentVisibleTerminals.length > 0) {
                console.log(`[useWebSocketManager] Switching to next terminal: ${currentVisibleTerminals[0].name}`)
                setActiveTerminal(currentVisibleTerminals[0].id)
              } else {
                console.log(`[useWebSocketManager] No more terminals, clearing active`)
                setActiveTerminal(null)
                // Close popped-out windows when empty
                if (currentWindowId !== 'main') {
                  setTimeout(() => window.close(), 1000)
                }
              }
            })
          }
        }
        break

      case 'tmux-sessions-list':
        if (message.data && message.data.sessions) {
          const activeSessions = new Set(message.data.sessions)
          const currentSpawnOptions = spawnOptionsRef.current

          console.log('[useWebSocketManager] 📋 Active tmux sessions:', Array.from(activeSessions))

          // Track which sessions we've started reconnecting (prevent duplicates)
          const reconnectingSessionsSet = new Set<string>()

          // Process stored terminals
          storedTerminals.forEach(terminal => {
            if (terminal.sessionName && activeSessions.has(terminal.sessionName)) {
              // Skip detached terminals - user explicitly detached them
              if (terminal.status === 'detached') {
                console.log(`[useWebSocketManager] 📌 Skipping detached terminal: ${terminal.sessionName}`)
                return
              }

              // Skip duplicates
              if (reconnectingSessionsSet.has(terminal.sessionName)) {
                return
              }

              // Skip terminals from other windows
              const terminalWindow = terminal.windowId || 'main'
              if (terminalWindow !== currentWindowId) {
                return
              }

              reconnectingSessionsSet.add(terminal.sessionName)
              console.log(`[useWebSocketManager] 🔄 Reconnecting to session: ${terminal.sessionName}`)

              // Find spawn option
              let option = terminal.command
                ? currentSpawnOptions.find(opt => opt.command === terminal.command)
                : null

              if (!option) {
                option = currentSpawnOptions.find(opt => opt.terminalType === terminal.terminalType)
              }

              if (option) {
                handleReconnectTerminal(terminal, option)
              } else {
                console.warn(`[useWebSocketManager] ⚠️ No spawn option found for: ${terminal.command}`)
                updateTerminal(terminal.id, { status: 'error' })
              }
            } else if (terminal.sessionName) {
              // Session is dead, remove terminal
              console.log(`[useWebSocketManager] ❌ Session ${terminal.sessionName} not found, removing`)
              removeTerminal(terminal.id)
            }
          })
        }
        break
    }
  }

  /**
   * Connect to WebSocket server with auto-reconnect
   */
  const connectWebSocket = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    setConnectionStatus('connecting')
    processedAgentIds.current.clear()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let wsUrl: string
    if (import.meta.env.DEV) {
      wsUrl = `${protocol}//${window.location.host}/ws`
    } else {
      const backendPort = import.meta.env.VITE_BACKEND_PORT || '8127'
      const host = window.location.hostname || 'localhost'
      wsUrl = `${protocol}//${host}:${backendPort}/ws`
    }

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setConnectionStatus('connected')
      setReconnectAttempts(0)
    }

    ws.onclose = (evt) => {
      setConnectionStatus('disconnected')

      // CRITICAL: Clear old agents when disconnecting
      setWebSocketAgents([])
      processedAgentIds.current.clear()

      // Clear agentIds from all terminals (will be re-assigned on reconnect)
      storedTerminals.forEach(terminal => {
        if (terminal.agentId || terminal.status === 'active') {
          updateTerminal(terminal.id, {
            agentId: undefined,
            status: 'spawning',
          })
        }
      })

      if (evt.code === 1000 || evt.code === 1001) {
        return
      }

      // Exponential backoff reconnection
      const MAX_RECONNECT_ATTEMPTS = 10
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Maximum reconnection attempts reached')
        return
      }

      const baseDelay = 1000
      const maxDelay = 30000
      const retryDelay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay)

      setReconnectAttempts(prev => prev + 1)
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, retryDelay)
    }

    ws.onerror = (error) => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.warn('WebSocket connection failed, will retry...')
      }
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        handleWebSocketMessage(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    wsRef.current = ws
  }

  // Initialize WebSocket on mount
  useEffect(() => {
    SimpleSpawnService.initialize(wsRef)
    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      if (wsRef.current) {
        wsRef.current.onerror = null
        wsRef.current.onclose = null
        wsRef.current.close(1000, 'Component unmounting')
        wsRef.current = null
      }
    }
  }, [])

  return {
    webSocketAgents,
    connectionStatus,
    setWebSocketAgents,
    clearProcessedAgentId: (agentId: string) => {
      processedAgentIds.current.delete(agentId)
    }
  }
}
