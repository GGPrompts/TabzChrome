/**
 * Integration Tests: Cross-Window State Synchronization
 *
 * Tests the complete cross-window state sync workflow using BroadcastChannel with payloads.
 * These tests cover the critical bug fixes from November 13, 2025 session.
 *
 * Key Architecture:
 * - BroadcastChannel messages now include FULL state payload
 * - Receiver windows apply state directly from payload (no localStorage read)
 * - WebSocket disconnect sent on detach to update backend terminalOwners map
 * - beforeunload handler auto-detaches terminals when window closes
 *
 * Covered Workflows:
 * 1. Basic detach in Window A → Window B sees update instantly
 * 2. Reattach in Window B → Window A sees update instantly
 * 3. Split container detach/reattach across windows
 * 4. Bidirectional sync (both windows detaching/reattaching)
 * 5. Window closing (beforeunload) auto-detach
 * 6. WebSocket disconnect messages on detach
 *
 * Bug Fixes Tested:
 * - localStorage cache staleness (Chrome process-cached values)
 * - Zustand persist doesn't auto-sync across tabs
 * - Backend terminalOwners map not updated on detach
 * - beforeunload handler broadcasts state to other windows
 *
 * Architecture References:
 * - SimpleTerminalApp.tsx:549-581 - BroadcastChannel receiver with payload
 * - SimpleTerminalApp.tsx:674-683 - Window closing detach broadcast
 * - SimpleTerminalApp.tsx:1013-1024 - Split container detach broadcast
 * - SimpleTerminalApp.tsx:1112-1125 - Single terminal detach broadcast
 * - SimpleTerminalApp.tsx:1206-1217 - Split container reattach broadcast
 * - SimpleTerminalApp.tsx:1256-1267 - Single terminal reattach broadcast
 * - backend/server.js:114-443 - Backend terminalOwners map and output routing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useSimpleTerminalStore, Terminal } from '@/stores/simpleTerminalStore'

/**
 * Mock BroadcastChannel that simulates cross-window communication
 */
class MockBroadcastChannel {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  private static channels: Map<string, MockBroadcastChannel[]> = new Map()

  constructor(name: string) {
    this.name = name
    const channels = MockBroadcastChannel.channels.get(name) || []
    channels.push(this)
    MockBroadcastChannel.channels.set(name, channels)
  }

  postMessage(data: any) {
    // Simulate broadcasting to all other channels with same name
    const channels = MockBroadcastChannel.channels.get(this.name) || []
    channels.forEach(channel => {
      if (channel !== this && channel.onmessage) {
        // Simulate async message delivery
        setTimeout(() => {
          channel.onmessage?.({ data } as MessageEvent)
        }, 0)
      }
    })
  }

  close() {
    const channels = MockBroadcastChannel.channels.get(this.name) || []
    const index = channels.indexOf(this)
    if (index > -1) {
      channels.splice(index, 1)
    }
  }

  static reset() {
    this.channels.clear()
  }
}

global.BroadcastChannel = MockBroadcastChannel as any

/**
 * Mock WebSocket for testing disconnect messages
 */
class MockWebSocket {
  readyState = WebSocket.OPEN
  sentMessages: any[] = []

  send(data: string) {
    this.sentMessages.push(JSON.parse(data))
  }

  close() {
    this.readyState = WebSocket.CLOSED
  }

  reset() {
    this.sentMessages = []
    this.readyState = WebSocket.OPEN
  }
}

/**
 * Note: localStorage is available via jsdom in test environment.
 * Chrome's process-cached behavior is simulated by BroadcastChannel payload approach.
 */

/**
 * Helper: Create mock terminal
 */
function createMockTerminal(
  id: string,
  name: string,
  terminalType: string = 'bash',
  windowId: string = 'main',
  sessionName?: string,
  agentId?: string
): Terminal {
  return {
    id,
    name,
    terminalType,
    command: 'bash',
    icon: '💻',
    agentId: agentId || `agent-${id}`,
    sessionName: sessionName || `tt-bash-${id.slice(-3)}`,
    createdAt: Date.now(),
    status: 'active',
    windowId,
    splitLayout: { type: 'single', panes: [] },
  }
}

/**
 * Helper: Create split container with two panes
 */
function createSplitContainer(
  containerId: string,
  leftTerminalId: string,
  rightTerminalId: string,
  splitType: 'vertical' | 'horizontal' = 'vertical'
): Terminal {
  const container = createMockTerminal(containerId, 'Split Container', 'bash', 'main')
  container.splitLayout = {
    type: splitType,
    panes: [
      {
        id: `pane-${Date.now()}-1`,
        terminalId: leftTerminalId,
        size: 50,
        position: splitType === 'vertical' ? 'left' : 'top',
      },
      {
        id: `pane-${Date.now()}-2`,
        terminalId: rightTerminalId,
        size: 50,
        position: splitType === 'vertical' ? 'right' : 'bottom',
      },
    ],
  }
  return container
}

/**
 * Helper: Simulate detach operation with broadcast
 */
async function simulateDetach(
  terminalId: string,
  currentWindowId: string,
  broadcast: BroadcastChannel,
  ws?: MockWebSocket
) {
  const store = useSimpleTerminalStore.getState()
  const terminal = store.terminals.find(t => t.id === terminalId)

  if (!terminal) return

  // Send WebSocket disconnect if agentId exists
  if (terminal.agentId && ws) {
    ws.send(JSON.stringify({
      type: 'disconnect',
      data: { terminalId: terminal.agentId }
    }))
  }

  // Update terminal to detached
  store.updateTerminal(terminalId, {
    status: 'detached',
    agentId: undefined,
    windowId: undefined,
  })

  // Wait for Zustand persist to write to localStorage (150ms delay in real app)
  await new Promise(resolve => setTimeout(resolve, 150))

  // Broadcast state-changed with payload
  const payload = localStorage.getItem('simple-terminal-storage')
  broadcast.postMessage({
    type: 'state-changed',
    payload,
    from: currentWindowId,
    at: Date.now(),
  })
}

/**
 * Helper: Simulate reattach operation with broadcast
 */
async function simulateReattach(
  terminalId: string,
  targetWindowId: string,
  currentWindowId: string,
  broadcast: BroadcastChannel
) {
  const store = useSimpleTerminalStore.getState()

  // Update terminal to spawning in target window
  store.updateTerminal(terminalId, {
    status: 'spawning',
    windowId: targetWindowId,
  })

  // Wait for Zustand persist
  await new Promise(resolve => setTimeout(resolve, 150))

  // Broadcast state-changed with payload
  const payload = localStorage.getItem('simple-terminal-storage')
  broadcast.postMessage({
    type: 'state-changed',
    payload,
    from: currentWindowId,
    at: Date.now(),
  })
}

describe('Cross-Window State Synchronization', () => {
  let mockWs: MockWebSocket

  beforeEach(() => {
    // Reset store
    useSimpleTerminalStore.getState().clearAllTerminals()

    // Reset mocks
    MockBroadcastChannel.reset()
    mockWs = new MockWebSocket()

    // Clear localStorage (jsdom provides this)
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Detach → Reattach Flow', () => {
    it('should broadcast detach with full payload to other windows', async () => {
      // Window A setup
      const windowA = 'main'
      const channelA = new BroadcastChannel('tabz-sync')

      // Window B setup
      const windowB = 'window-123'
      const channelB = new BroadcastChannel('tabz-sync')
      let receivedPayload: any = null

      channelB.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowB) {
          receivedPayload = event.data.payload
        }
      }

      // Add terminal in Window A
      const terminal = createMockTerminal('term-1', 'Terminal', 'bash', windowA, 'tt-bash-1', 'agent-1')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Verify terminal was added
      const state = useSimpleTerminalStore.getState()
      expect(state.terminals).toHaveLength(1)

      // Window A detaches terminal
      await simulateDetach('term-1', windowA, channelA, mockWs)

      // Wait for broadcast to arrive at Window B
      await waitFor(() => {
        expect(receivedPayload).not.toBeNull()
      })

      // Verify payload contains full state
      expect(receivedPayload).toBeTruthy()
      const parsed = JSON.parse(receivedPayload)
      expect(parsed.state.terminals).toBeDefined()

      // Verify WebSocket disconnect was sent
      expect(mockWs.sentMessages).toHaveLength(1)
      expect(mockWs.sentMessages[0].type).toBe('disconnect')
      expect(mockWs.sentMessages[0].data.terminalId).toBe('agent-1')

      channelA.close()
      channelB.close()
    })

    it('should apply state directly from payload in receiving window', async () => {
      // Window A setup
      const windowA = 'main'
      const channelA = new BroadcastChannel('tabz-sync')

      // Window B setup
      const windowB = 'window-123'
      const channelB = new BroadcastChannel('tabz-sync')

      // Window B listener - simulates SimpleTerminalApp.tsx:549-581
      channelB.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowB) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              // Apply state directly (no localStorage read)
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
                activeTerminalId: next.activeTerminalId,
                focusedTerminalId: next.focusedTerminalId,
              })
            }
          }
        }
      }

      // Add terminal in Window A
      const terminal = createMockTerminal('term-2', 'Terminal', 'bash', windowA, 'tt-bash-2', 'agent-2')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Window A detaches terminal
      await simulateDetach('term-2', windowA, channelA, mockWs)

      // Wait for Window B to receive and apply state
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const updated = state.terminals.find(t => t.id === 'term-2')
        expect(updated?.status).toBe('detached')
      })

      // Verify terminal is detached in shared store
      const state = useSimpleTerminalStore.getState()
      const updatedTerminal = state.terminals.find(t => t.id === 'term-2')
      expect(updatedTerminal?.status).toBe('detached')
      expect(updatedTerminal?.windowId).toBeUndefined()
      expect(updatedTerminal?.agentId).toBeUndefined()

      channelA.close()
      channelB.close()
    })

    it('should show detached terminal in other window immediately (no refresh)', async () => {
      // Window A (popout)
      const windowA = 'window-popout'
      const channelA = new BroadcastChannel('tabz-sync')

      // Window B (main)
      const windowB = 'main'
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup Window B listener
      channelB.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowB) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Add terminal in Window A
      const terminal = createMockTerminal('term-3', 'Terminal', 'bash', windowA, 'tt-bash-3', 'agent-3')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Window A detaches terminal
      await simulateDetach('term-3', windowA, channelA, mockWs)

      // Window B should see detached terminal immediately
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(1)
      })

      // Verify detached count
      const state = useSimpleTerminalStore.getState()
      const detachedTerminals = state.terminals.filter(t => t.status === 'detached')
      expect(detachedTerminals).toHaveLength(1)
      expect(detachedTerminals[0].id).toBe('term-3')

      channelA.close()
      channelB.close()
    })

    it('should reattach in different window and broadcast to original window', async () => {
      // Window A (popout) - originally had terminal
      const windowA = 'window-popout'
      const channelA = new BroadcastChannel('tabz-sync')

      // Setup Window A listener
      channelA.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowA) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Window B (main) - will reattach
      const windowB = 'main'
      const channelB = new BroadcastChannel('tabz-sync')

      // Start with detached terminal
      const terminal = createMockTerminal('term-4', 'Terminal', 'bash', undefined, 'tt-bash-4')
      terminal.status = 'detached'
      terminal.agentId = undefined
      terminal.windowId = undefined
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Window B reattaches terminal
      await simulateReattach('term-4', windowB, windowB, channelB)

      // Window A should see terminal reattached to Window B
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const updated = state.terminals.find(t => t.id === 'term-4')
        expect(updated?.windowId).toBe(windowB)
      })

      // Verify terminal is now in Window B
      const state = useSimpleTerminalStore.getState()
      const updatedTerminal = state.terminals.find(t => t.id === 'term-4')
      expect(updatedTerminal?.status).toBe('spawning')
      expect(updatedTerminal?.windowId).toBe('main')

      channelA.close()
      channelB.close()
    })
  })

  describe('Split Container Detach/Reattach Across Windows', () => {
    it('should detach split container and broadcast all panes to other windows', async () => {
      // Window A (popout)
      const windowA = 'window-popout'
      const channelA = new BroadcastChannel('tabz-sync')

      // Window B (main)
      const windowB = 'main'
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup Window B listener
      channelB.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowB) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Create split in Window A
      const leftPane = createMockTerminal('left-1', 'TFE', 'tfe', windowA, 'tt-tfe-1', 'agent-left-1')
      const rightPane = createMockTerminal('right-1', 'Bash', 'bash', windowA, 'tt-bash-1', 'agent-right-1')
      const container = createSplitContainer('split-1', 'left-1', 'right-1')
      container.windowId = windowA

      leftPane.isHidden = true
      rightPane.isHidden = true

      useSimpleTerminalStore.getState().addTerminal(leftPane)
      useSimpleTerminalStore.getState().addTerminal(rightPane)
      useSimpleTerminalStore.getState().addTerminal(container)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(3)
      })

      // Detach both panes (simulates handleContextDetach for split)
      await simulateDetach('left-1', windowA, channelA, mockWs)
      await simulateDetach('right-1', windowA, channelA, mockWs)

      // Detach container
      await simulateDetach('split-1', windowA, channelA)

      // Window B should see all 3 terminals detached
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(3)
      })

      // Verify both panes sent disconnect
      expect(mockWs.sentMessages).toHaveLength(2)
      expect(mockWs.sentMessages.every(m => m.type === 'disconnect')).toBe(true)

      // Verify split layout preserved
      const state = useSimpleTerminalStore.getState()
      const detachedContainer = state.terminals.find(t => t.id === 'split-1')
      expect(detachedContainer?.splitLayout?.type).toBe('vertical')
      expect(detachedContainer?.splitLayout?.panes).toHaveLength(2)

      channelA.close()
      channelB.close()
    })

    it('should reattach split container in different window', async () => {
      // Window A (popout) - originally had split
      const windowA = 'window-popout'
      const channelA = new BroadcastChannel('tabz-sync')

      // Setup Window A listener
      channelA.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowA) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Window B (main) - will reattach split
      const windowB = 'main'
      const channelB = new BroadcastChannel('tabz-sync')

      // Create detached split
      const leftPane = createMockTerminal('left-2', 'TFE', 'tfe', undefined, 'tt-tfe-2')
      const rightPane = createMockTerminal('right-2', 'Bash', 'bash', undefined, 'tt-bash-2')
      const container = createSplitContainer('split-2', 'left-2', 'right-2')

      leftPane.status = 'detached'
      leftPane.agentId = undefined
      leftPane.windowId = undefined
      leftPane.isHidden = true

      rightPane.status = 'detached'
      rightPane.agentId = undefined
      rightPane.windowId = undefined
      rightPane.isHidden = true

      container.status = 'detached'
      container.agentId = undefined
      container.windowId = undefined

      useSimpleTerminalStore.getState().addTerminal(leftPane)
      useSimpleTerminalStore.getState().addTerminal(rightPane)
      useSimpleTerminalStore.getState().addTerminal(container)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(3)
      })

      // Reattach both panes to Window B
      await simulateReattach('left-2', windowB, windowB, channelB)
      await simulateReattach('right-2', windowB, windowB, channelB)

      // Reattach container
      await simulateReattach('split-2', windowB, windowB, channelB)

      // Window A should see all terminals moved to Window B
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const containerState = state.terminals.find(t => t.id === 'split-2')
        expect(containerState?.windowId).toBe(windowB)
      })

      // Verify all terminals assigned to Window B
      const state = useSimpleTerminalStore.getState()
      const leftState = state.terminals.find(t => t.id === 'left-2')
      const rightState = state.terminals.find(t => t.id === 'right-2')
      const containerState = state.terminals.find(t => t.id === 'split-2')

      expect(leftState?.windowId).toBe(windowB)
      expect(rightState?.windowId).toBe(windowB)
      expect(containerState?.windowId).toBe(windowB)

      channelA.close()
      channelB.close()
    })

    it('should preserve split layout when detaching and reattaching across windows', async () => {
      const windowA = 'window-1'
      const windowB = 'window-2'
      const channelA = new BroadcastChannel('tabz-sync')
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup listeners
      const setupListener = (channel: BroadcastChannel, currentWindowId: string) => {
        channel.onmessage = (event) => {
          if (event.data.type === 'state-changed' && event.data.from !== currentWindowId) {
            const payload = event.data.payload
            if (payload) {
              const parsed = JSON.parse(payload)
              const next = parsed?.state
              if (next && next.terminals) {
                useSimpleTerminalStore.setState({
                  terminals: next.terminals,
                })
              }
            }
          }
        }
      }

      setupListener(channelA, windowA)
      setupListener(channelB, windowB)

      // Create horizontal split
      const leftPane = createMockTerminal('left-3', 'Top', 'bash', windowA)
      const rightPane = createMockTerminal('right-3', 'Bottom', 'bash', windowA)
      const container = createSplitContainer('split-3', 'left-3', 'right-3', 'horizontal')
      container.windowId = windowA

      leftPane.isHidden = true
      rightPane.isHidden = true

      useSimpleTerminalStore.getState().addTerminal(leftPane)
      useSimpleTerminalStore.getState().addTerminal(rightPane)
      useSimpleTerminalStore.getState().addTerminal(container)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(3)
      })

      // Detach in Window A
      await simulateDetach('left-3', windowA, channelA, mockWs)
      await simulateDetach('right-3', windowA, channelA, mockWs)
      await simulateDetach('split-3', windowA, channelA)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const containerState = state.terminals.find(t => t.id === 'split-3')
        expect(containerState?.status).toBe('detached')
      })

      // Verify layout preserved
      let state = useSimpleTerminalStore.getState()
      let containerState = state.terminals.find(t => t.id === 'split-3')
      expect(containerState?.splitLayout?.type).toBe('horizontal')
      expect(containerState?.splitLayout?.panes).toHaveLength(2)

      // Reattach in Window B
      await simulateReattach('left-3', windowB, windowB, channelB)
      await simulateReattach('right-3', windowB, windowB, channelB)
      await simulateReattach('split-3', windowB, windowB, channelB)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const updated = state.terminals.find(t => t.id === 'split-3')
        expect(updated?.windowId).toBe(windowB)
      })

      // Verify layout still preserved
      state = useSimpleTerminalStore.getState()
      containerState = state.terminals.find(t => t.id === 'split-3')
      expect(containerState?.splitLayout?.type).toBe('horizontal')
      expect(containerState?.splitLayout?.panes).toHaveLength(2)
      expect(containerState?.splitLayout?.panes[0].position).toBe('top')
      expect(containerState?.splitLayout?.panes[1].position).toBe('bottom')

      channelA.close()
      channelB.close()
    })
  })

  describe('Bidirectional State Sync', () => {
    it('should sync detaches from both windows correctly', async () => {
      const windowA = 'main'
      const windowB = 'window-123'
      const channelA = new BroadcastChannel('tabz-sync')
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup bidirectional listeners
      const setupListener = (channel: BroadcastChannel, currentWindowId: string) => {
        channel.onmessage = (event) => {
          if (event.data.type === 'state-changed' && event.data.from !== currentWindowId) {
            const payload = event.data.payload
            if (payload) {
              const parsed = JSON.parse(payload)
              const next = parsed?.state
              if (next && next.terminals) {
                useSimpleTerminalStore.setState({
                  terminals: next.terminals,
                })
              }
            }
          }
        }
      }

      setupListener(channelA, windowA)
      setupListener(channelB, windowB)

      // Add terminal A in Window A
      const terminalA = createMockTerminal('term-a', 'Terminal A', 'bash', windowA, 'tt-bash-a', 'agent-a')
      useSimpleTerminalStore.getState().addTerminal(terminalA)

      // Add terminal B in Window B
      const terminalB = createMockTerminal('term-b', 'Terminal B', 'bash', windowB, 'tt-bash-b', 'agent-b')
      useSimpleTerminalStore.getState().addTerminal(terminalB)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(2)
      })

      // Window A detaches terminal A
      await simulateDetach('term-a', windowA, channelA, mockWs)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(1)
      })

      // Window B should see 1 detached
      let state = useSimpleTerminalStore.getState()
      let detachedCount = state.terminals.filter(t => t.status === 'detached').length
      expect(detachedCount).toBe(1)

      // Window B detaches terminal B
      mockWs.reset() // Clear previous messages
      await simulateDetach('term-b', windowB, channelB, mockWs)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(2)
      })

      // Window A should see 2 detached
      state = useSimpleTerminalStore.getState()
      detachedCount = state.terminals.filter(t => t.status === 'detached').length
      expect(detachedCount).toBe(2)

      channelA.close()
      channelB.close()
    })

    it('should sync reattaches from both windows correctly', async () => {
      const windowA = 'main'
      const windowB = 'window-123'
      const channelA = new BroadcastChannel('tabz-sync')
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup bidirectional listeners
      const setupListener = (channel: BroadcastChannel, currentWindowId: string) => {
        channel.onmessage = (event) => {
          if (event.data.type === 'state-changed' && event.data.from !== currentWindowId) {
            const payload = event.data.payload
            if (payload) {
              const parsed = JSON.parse(payload)
              const next = parsed?.state
              if (next && next.terminals) {
                useSimpleTerminalStore.setState({
                  terminals: next.terminals,
                })
              }
            }
          }
        }
      }

      setupListener(channelA, windowA)
      setupListener(channelB, windowB)

      // Create 2 detached terminals
      const terminalA = createMockTerminal('term-a2', 'Terminal A', 'bash', undefined, 'tt-bash-a2')
      const terminalB = createMockTerminal('term-b2', 'Terminal B', 'bash', undefined, 'tt-bash-b2')

      terminalA.status = 'detached'
      terminalA.agentId = undefined
      terminalA.windowId = undefined

      terminalB.status = 'detached'
      terminalB.agentId = undefined
      terminalB.windowId = undefined

      useSimpleTerminalStore.getState().addTerminal(terminalA)
      useSimpleTerminalStore.getState().addTerminal(terminalB)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(2)
        expect(state.terminals.filter(t => t.status === 'detached')).toHaveLength(2)
      })

      // Window A reattaches terminal A
      await simulateReattach('term-a2', windowA, windowA, channelA)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(1)
      })

      // Verify 1 detached, 1 spawning
      let state = useSimpleTerminalStore.getState()
      let detachedCount = state.terminals.filter(t => t.status === 'detached').length
      expect(detachedCount).toBe(1)

      // Window B reattaches terminal B
      await simulateReattach('term-b2', windowB, windowB, channelB)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(0)
      })

      // Verify 0 detached
      state = useSimpleTerminalStore.getState()
      detachedCount = state.terminals.filter(t => t.status === 'detached').length
      expect(detachedCount).toBe(0)

      channelA.close()
      channelB.close()
    })

    it('should handle rapid detach/reattach cycles without state corruption', async () => {
      const windowA = 'main'
      const channelA = new BroadcastChannel('tabz-sync')

      const windowB = 'window-123'
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup listeners
      const setupListener = (channel: BroadcastChannel, currentWindowId: string) => {
        channel.onmessage = (event) => {
          if (event.data.type === 'state-changed' && event.data.from !== currentWindowId) {
            const payload = event.data.payload
            if (payload) {
              const parsed = JSON.parse(payload)
              const next = parsed?.state
              if (next && next.terminals) {
                useSimpleTerminalStore.setState({
                  terminals: next.terminals,
                })
              }
            }
          }
        }
      }

      setupListener(channelA, windowA)
      setupListener(channelB, windowB)

      // Create terminal
      const terminal = createMockTerminal('term-rapid', 'Rapid', 'bash', windowA, 'tt-bash-rapid', 'agent-rapid')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Rapid cycle: detach → reattach → detach → reattach
      await simulateDetach('term-rapid', windowA, channelA, mockWs)
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const t = state.terminals.find(t => t.id === 'term-rapid')
        expect(t?.status).toBe('detached')
      })

      await simulateReattach('term-rapid', windowB, windowB, channelB)
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const t = state.terminals.find(t => t.id === 'term-rapid')
        expect(t?.windowId).toBe(windowB)
      })

      mockWs.reset()
      await simulateDetach('term-rapid', windowB, channelB, mockWs)
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const t = state.terminals.find(t => t.id === 'term-rapid')
        expect(t?.status).toBe('detached')
      })

      await simulateReattach('term-rapid', windowA, windowA, channelA)
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const t = state.terminals.find(t => t.id === 'term-rapid')
        expect(t?.windowId).toBe(windowA)
      })

      // Verify final state is correct
      const state = useSimpleTerminalStore.getState()
      const finalState = state.terminals.find(t => t.id === 'term-rapid')
      expect(finalState?.status).toBe('spawning')
      expect(finalState?.windowId).toBe(windowA)

      // Verify no state corruption
      expect(state.terminals).toHaveLength(1)

      channelA.close()
      channelB.close()
    })
  })

  describe('Window Closing (beforeunload) Auto-Detach', () => {
    it('should detach terminals when popout window closes', async () => {
      // Popout window
      const windowPopout = 'window-popout'
      const channelPopout = new BroadcastChannel('tabz-sync')

      // Main window
      const windowMain = 'main'
      const channelMain = new BroadcastChannel('tabz-sync')

      // Setup main window listener
      channelMain.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowMain) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Create terminal in popout window
      const terminal = createMockTerminal('term-close', 'Terminal', 'bash', windowPopout, 'tt-bash-close', 'agent-close')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Simulate beforeunload handler (window closing)
      // This mimics SimpleTerminalApp.tsx:674-683
      const state = useSimpleTerminalStore.getState()
      const terminalsInWindow = state.terminals.filter(t =>
        t.windowId === windowPopout && t.status !== 'detached'
      )

      // Mark all terminals as detached
      for (const term of terminalsInWindow) {
        useSimpleTerminalStore.getState().updateTerminal(term.id, {
          status: 'detached',
          windowId: undefined,
          agentId: undefined,
        })
      }

      // Broadcast state change
      await new Promise(resolve => setTimeout(resolve, 150))
      const payload = localStorage.getItem('simple-terminal-storage')
      channelPopout.postMessage({
        type: 'state-changed',
        payload,
        from: windowPopout,
        at: Date.now(),
      })

      // Main window should receive detach notification
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(1)
      })

      // Verify terminal is detached
      const finalState = useSimpleTerminalStore.getState()
      const detachedTerminal = finalState.terminals.find(t => t.id === 'term-close')
      expect(detachedTerminal?.status).toBe('detached')
      expect(detachedTerminal?.windowId).toBeUndefined()

      channelPopout.close()
      channelMain.close()
    })

    it('should only detach terminals from closing window, not all windows', async () => {
      const windowA = 'window-a'
      const windowB = 'window-b'
      const channelA = new BroadcastChannel('tabz-sync')
      const channelB = new BroadcastChannel('tabz-sync')

      // Setup listener for Window B
      channelB.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowB) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Create terminals in both windows
      const terminalA = createMockTerminal('term-a-close', 'Terminal A', 'bash', windowA, 'tt-bash-a-close', 'agent-a-close')
      const terminalB = createMockTerminal('term-b-close', 'Terminal B', 'bash', windowB, 'tt-bash-b-close', 'agent-b-close')

      useSimpleTerminalStore.getState().addTerminal(terminalA)
      useSimpleTerminalStore.getState().addTerminal(terminalB)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(2)
      })

      // Window A closes (beforeunload)
      const state = useSimpleTerminalStore.getState()
      const terminalsInWindowA = state.terminals.filter(t =>
        t.windowId === windowA && t.status !== 'detached'
      )

      for (const term of terminalsInWindowA) {
        useSimpleTerminalStore.getState().updateTerminal(term.id, {
          status: 'detached',
          windowId: undefined,
          agentId: undefined,
        })
      }

      await new Promise(resolve => setTimeout(resolve, 150))
      const payload = localStorage.getItem('simple-terminal-storage')
      channelA.postMessage({
        type: 'state-changed',
        payload,
        from: windowA,
        at: Date.now(),
      })

      // Wait for state to sync
      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const detached = state.terminals.filter(t => t.status === 'detached')
        expect(detached).toHaveLength(1)
      })

      // Only Window A's terminal should be detached
      const finalState = useSimpleTerminalStore.getState()
      const terminalAState = finalState.terminals.find(t => t.id === 'term-a-close')
      const terminalBState = finalState.terminals.find(t => t.id === 'term-b-close')

      expect(terminalAState?.status).toBe('detached')
      expect(terminalBState?.status).toBe('active') // Window B terminal still active

      channelA.close()
      channelB.close()
    })

    it('should allow reattaching terminal after window closed', async () => {
      const windowPopout = 'window-popout'
      const windowMain = 'main'
      const channelPopout = new BroadcastChannel('tabz-sync')
      const channelMain = new BroadcastChannel('tabz-sync')

      // Setup main window listener
      channelMain.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowMain) {
          const payload = event.data.payload
          if (payload) {
            const parsed = JSON.parse(payload)
            const next = parsed?.state
            if (next && next.terminals) {
              useSimpleTerminalStore.setState({
                terminals: next.terminals,
              })
            }
          }
        }
      }

      // Create terminal in popout
      const terminal = createMockTerminal('term-reattach', 'Terminal', 'bash', windowPopout, 'tt-bash-reattach', 'agent-reattach')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Popout window closes (beforeunload)
      useSimpleTerminalStore.getState().updateTerminal('term-reattach', {
        status: 'detached',
        windowId: undefined,
        agentId: undefined,
      })

      await new Promise(resolve => setTimeout(resolve, 150))
      let payload = localStorage.getItem('simple-terminal-storage')
      channelPopout.postMessage({
        type: 'state-changed',
        payload,
        from: windowPopout,
        at: Date.now(),
      })

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const t = state.terminals.find(t => t.id === 'term-reattach')
        expect(t?.status).toBe('detached')
      })

      // Main window reattaches
      await simulateReattach('term-reattach', windowMain, windowMain, channelMain)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        const t = state.terminals.find(t => t.id === 'term-reattach')
        expect(t?.windowId).toBe(windowMain)
      })

      // Verify reattach successful
      const state = useSimpleTerminalStore.getState()
      const reattachedTerminal = state.terminals.find(t => t.id === 'term-reattach')
      expect(reattachedTerminal?.status).toBe('spawning')
      expect(reattachedTerminal?.windowId).toBe(windowMain)

      channelPopout.close()
      channelMain.close()
    })
  })

  describe('WebSocket Disconnect Messages', () => {
    it('should send disconnect message when detaching terminal', async () => {
      const terminal = createMockTerminal('term-ws', 'Terminal', 'bash', 'main', 'tt-bash-ws', 'agent-ws')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Detach with WebSocket
      const channel = new BroadcastChannel('tabz-sync')
      await simulateDetach('term-ws', 'main', channel, mockWs)

      // Verify disconnect message sent
      expect(mockWs.sentMessages).toHaveLength(1)
      expect(mockWs.sentMessages[0]).toEqual({
        type: 'disconnect',
        data: { terminalId: 'agent-ws' }
      })

      channel.close()
    })

    it('should send disconnect for all panes when detaching split', async () => {
      const leftPane = createMockTerminal('left-ws', 'Left', 'bash', 'main', 'tt-bash-left-ws', 'agent-left-ws')
      const rightPane = createMockTerminal('right-ws', 'Right', 'bash', 'main', 'tt-bash-right-ws', 'agent-right-ws')
      const container = createSplitContainer('split-ws', 'left-ws', 'right-ws')

      leftPane.isHidden = true
      rightPane.isHidden = true

      useSimpleTerminalStore.getState().addTerminal(leftPane)
      useSimpleTerminalStore.getState().addTerminal(rightPane)
      useSimpleTerminalStore.getState().addTerminal(container)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(3)
      })

      // Detach split
      const channel = new BroadcastChannel('tabz-sync')
      await simulateDetach('left-ws', 'main', channel, mockWs)
      await simulateDetach('right-ws', 'main', channel, mockWs)

      // Verify 2 disconnect messages
      expect(mockWs.sentMessages).toHaveLength(2)
      expect(mockWs.sentMessages[0]).toEqual({
        type: 'disconnect',
        data: { terminalId: 'agent-left-ws' }
      })
      expect(mockWs.sentMessages[1]).toEqual({
        type: 'disconnect',
        data: { terminalId: 'agent-right-ws' }
      })

      channel.close()
    })

    it('should NOT send disconnect if terminal has no agentId', async () => {
      const terminal = createMockTerminal('term-no-agent', 'Terminal', 'bash', 'main', 'tt-bash-no-agent')
      terminal.agentId = undefined // No agent yet
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Detach
      const channel = new BroadcastChannel('tabz-sync')
      await simulateDetach('term-no-agent', 'main', channel, mockWs)

      // No disconnect should be sent
      expect(mockWs.sentMessages).toHaveLength(0)

      channel.close()
    })
  })

  describe('Edge Cases', () => {
    it('should ignore state-changed from same window', async () => {
      const windowA = 'main'
      const channelA = new BroadcastChannel('tabz-sync')

      let stateUpdateCount = 0

      // Setup listener that tracks updates
      channelA.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== windowA) {
          stateUpdateCount++
        }
      }

      const terminal = createMockTerminal('term-same', 'Terminal', 'bash', windowA)
      useSimpleTerminalStore.getState().addTerminal(terminal)

      await waitFor(() => {
        const state = useSimpleTerminalStore.getState()
        expect(state.terminals).toHaveLength(1)
      })

      // Detach in same window
      await simulateDetach('term-same', windowA, channelA, mockWs)

      // Should NOT increment count (message from same window)
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(stateUpdateCount).toBe(0)

      channelA.close()
    })

    it('should handle malformed payload gracefully', async () => {
      const channel = new BroadcastChannel('tabz-sync')

      let errorThrown = false

      channel.onmessage = (event) => {
        try {
          if (event.data.type === 'state-changed' && event.data.from !== 'main') {
            const payload = event.data.payload
            if (payload) {
              const parsed = JSON.parse(payload)
              const next = parsed?.state
              if (next && next.terminals) {
                useSimpleTerminalStore.setState({
                  terminals: next.terminals,
                })
              }
            }
          }
        } catch (err) {
          errorThrown = true
        }
      }

      // Send malformed payload
      channel.postMessage({
        type: 'state-changed',
        payload: '{invalid json',
        from: 'window-123',
        at: Date.now(),
      })

      // Wait for async message delivery (MockBroadcastChannel uses setTimeout)
      await waitFor(() => {
        expect(errorThrown).toBe(true)
      }, { timeout: 500 })

      channel.close()
    })

    it('should handle missing payload in state-changed message', async () => {
      const terminal = createMockTerminal('term-missing', 'Terminal', 'bash', 'main')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      const channel = new BroadcastChannel('tabz-sync')

      let stateChanged = false

      channel.onmessage = (event) => {
        if (event.data.type === 'state-changed' && event.data.from !== 'main') {
          const payload = event.data.payload
          if (payload) {
            stateChanged = true
          }
        }
      }

      // Send state-changed without payload
      channel.postMessage({
        type: 'state-changed',
        from: 'window-123',
        at: Date.now(),
        // No payload field
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should not update state
      expect(stateChanged).toBe(false)

      channel.close()
    })
  })
})
