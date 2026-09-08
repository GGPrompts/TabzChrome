/**
 * Browser MCP - Window management handlers
 * List, create, update, close windows and get display info via Chrome windows API
 */

import { sendToWebSocket } from '../websocket'
import { broadcastToClients, popoutWindows } from '../state'
import { assertAgentReadableTab } from './pageGuard'
import {
  assertTabInAgentGroup,
  configureAgentGroup,
  getClaudeActiveGroupId,
  isNamedAgent,
  releaseAgentGroupReservationInternal,
  reserveAgentGroupBindingInternal,
  rollbackAgentGroupBindingInternal,
  runAgentGroupLifecycle,
  runTabOwnershipMutation,
  ungroupTabsInternal
} from './tabGroups'

// Window state enum (matches Chrome API)
type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen'

// Window type for creation (subset of Chrome API types that can be created)
type CreateWindowType = 'normal' | 'popup' | 'panel'

// Full window type (for querying existing windows)
type WindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools'

async function assertWindowOwnedByAgent(agent: string | undefined, windowId: number, exclusive = false): Promise<void> {
  if (!isNamedAgent(agent)) return
  const groupId = await getClaudeActiveGroupId(agent)
  if (groupId === null) throw new Error('This browser agent has no tab group')
  const win = await chrome.windows.get(windowId, { populate: true })
  const tabs = win.tabs ?? []
  const ownsAny = tabs.some(tab => tab.groupId === groupId)
  const ownsAll = tabs.length > 0 && tabs.every(tab => tab.groupId === groupId)
  if (!ownsAny || (exclusive && !ownsAll)) {
    throw new Error(`Window ${windowId} is outside your browser agent group`)
  }
}

/**
 * List all Chrome windows with their properties
 */
export async function handleBrowserListWindows(message: { requestId: string; agent?: string }): Promise<void> {
  try {
    const ownGroupId = await getClaudeActiveGroupId(message.agent)
    const windows = (await chrome.windows.getAll({ populate: true })).filter(win =>
      !isNamedAgent(message.agent) || (ownGroupId !== null && win.tabs?.some(tab => tab.groupId === ownGroupId))
    )

    const windowList = windows.map((win) => ({
      windowId: win.id,
      focused: win.focused,
      state: win.state,
      type: win.type,
      width: win.width,
      height: win.height,
      left: win.left,
      top: win.top,
      incognito: win.incognito,
      alwaysOnTop: win.alwaysOnTop,
      tabCount: win.tabs?.length || 0
    }))

    sendToWebSocket({
      type: 'browser-list-windows-result',
      requestId: message.requestId,
      windows: windowList,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-list-windows-result',
      requestId: message.requestId,
      windows: [],
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Create a new browser window
 */
export async function handleBrowserCreateWindow(message: {
  requestId: string
  url?: string | string[]
  windowType?: CreateWindowType
  state?: WindowState
  focused?: boolean
  width?: number
  height?: number
  left?: number
  top?: number
  incognito?: boolean
  tabId?: number
  addToClaudeGroup?: boolean
  claudeGroupTitle?: string
  agent?: string
}): Promise<void> {
  try {
    const { url, windowType, state, focused, width, height, left, top, incognito, tabId, agent } = message

    // Build create options
    const createData: chrome.windows.CreateData = {}

    // Handle URL - can be extension page URL or external URL
    if (url) {
      // If it's a relative path, resolve to extension URL
      if (typeof url === 'string' && url.startsWith('/')) {
        createData.url = chrome.runtime.getURL(url.slice(1))
      } else if (Array.isArray(url)) {
        createData.url = url.map(u => u.startsWith('/') ? chrome.runtime.getURL(u.slice(1)) : u)
      } else {
        createData.url = url
      }
    }

    if (windowType) createData.type = windowType
    if (state) createData.state = state
    if (focused !== undefined) createData.focused = focused
    if (width !== undefined) createData.width = width
    if (height !== undefined) createData.height = height
    if (left !== undefined) createData.left = left
    if (top !== undefined) createData.top = top
    if (incognito !== undefined) createData.incognito = incognito
    if (tabId !== undefined) {
      await assertTabInAgentGroup(agent, tabId)
      await assertAgentReadableTab('tabz_create_window', tabId)
      createData.tabId = tabId
    }

    const shouldGroup = message.addToClaudeGroup || isNamedAgent(agent)
    const newWindow = await runAgentGroupLifecycle(agent, () => runTabOwnershipMutation(async () => {
      const reservation = shouldGroup ? await reserveAgentGroupBindingInternal(agent) : null
      const previousGroupId = reservation?.previousGroupId ?? null
      let created: chrome.windows.Window | null | undefined
      let groupedId: number | null = null
      try {
        created = await chrome.windows.create(createData)
        if (!created) return created
        const tabIds = (created.tabs ?? []).map(tab => tab.id).filter((id): id is number => id !== undefined)
        if (shouldGroup && tabIds.length > 0) {
          for (const id of tabIds) await assertAgentReadableTab('tabz_create_window', id)
          groupedId = await chrome.tabs.group({
            tabIds: tabIds as [number, ...number[]],
            createProperties: created.id === undefined ? undefined : { windowId: created.id }
          })
          await configureAgentGroup(tabIds[0], groupedId, agent, message.claudeGroupTitle, reservation ?? undefined)
          if (previousGroupId !== null && previousGroupId !== groupedId) {
            const oldIds = (await chrome.tabs.query({ groupId: previousGroupId }))
              .map(tab => tab.id).filter((id): id is number => id !== undefined)
            await ungroupTabsInternal(oldIds)
          }
        }
        return created
      } catch (error) {
        const createdIds = (created?.tabs ?? []).map(tab => tab.id).filter((id): id is number => id !== undefined)
        if (groupedId !== null) {
          const currentBinding = await getClaudeActiveGroupId(agent)
          if (currentBinding !== null && currentBinding !== previousGroupId) {
            await rollbackAgentGroupBindingInternal(agent, currentBinding, previousGroupId)
          }
          const stillOurs: number[] = []
          for (const id of createdIds) {
            try {
              if ((await chrome.tabs.get(id)).groupId === groupedId) stillOurs.push(id)
            } catch { /* closed */ }
          }
          await ungroupTabsInternal(stillOurs)
          if (tabId === undefined && stillOurs.length > 0) {
            try { await chrome.tabs.remove(stillOurs) } catch { /* already closed */ }
          }
        } else if (created?.id !== undefined && tabId === undefined) {
          const removable: number[] = []
          for (const id of createdIds) {
            try {
              const current = await chrome.tabs.get(id)
              if (current.windowId === created.id && current.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) removable.push(id)
            } catch { /* closed */ }
          }
          if (removable.length > 0) {
            try { await chrome.tabs.remove(removable) } catch { /* already closed */ }
          }
        }
        throw error
      } finally {
        if (reservation) await releaseAgentGroupReservationInternal(reservation)
      }
    }))

    if (!newWindow) {
      sendToWebSocket({
        type: 'browser-create-window-result',
        requestId: message.requestId,
        success: false,
        error: 'Failed to create window'
      })
      return
    }

    sendToWebSocket({
      type: 'browser-create-window-result',
      requestId: message.requestId,
      success: true,
      window: {
        windowId: newWindow.id,
        focused: newWindow.focused,
        state: newWindow.state,
        type: newWindow.type,
        width: newWindow.width,
        height: newWindow.height,
        left: newWindow.left,
        top: newWindow.top,
        incognito: newWindow.incognito,
        tabCount: newWindow.tabs?.length || 0,
        tabIds: (newWindow.tabs ?? []).map(tab => tab.id).filter((id): id is number => id !== undefined)
      },
      claudeGroupId: await getClaudeActiveGroupId(agent)
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-create-window-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Update a window's properties (resize, move, state, focus)
 */
export async function handleBrowserUpdateWindow(message: {
  requestId: string
  windowId: number
  state?: WindowState
  focused?: boolean
  width?: number
  height?: number
  left?: number
  top?: number
  drawAttention?: boolean
  agent?: string
}): Promise<void> {
  try {
    const { windowId, state, focused, width, height, left, top, drawAttention } = message

    const updateInfo: chrome.windows.UpdateInfo = {}

    if (state !== undefined) updateInfo.state = state
    if (focused !== undefined) updateInfo.focused = focused
    if (width !== undefined) updateInfo.width = width
    if (height !== undefined) updateInfo.height = height
    if (left !== undefined) updateInfo.left = left
    if (top !== undefined) updateInfo.top = top
    if (drawAttention !== undefined) updateInfo.drawAttention = drawAttention

    if (Object.keys(updateInfo).length === 0) {
      sendToWebSocket({
        type: 'browser-update-window-result',
        requestId: message.requestId,
        success: false,
        error: 'No update properties provided'
      })
      return
    }

    await assertWindowOwnedByAgent(message.agent, windowId)

    const updatedWindow = await chrome.windows.update(windowId, updateInfo)

    sendToWebSocket({
      type: 'browser-update-window-result',
      requestId: message.requestId,
      success: true,
      window: {
        windowId: updatedWindow.id,
        focused: updatedWindow.focused,
        state: updatedWindow.state,
        type: updatedWindow.type,
        width: updatedWindow.width,
        height: updatedWindow.height,
        left: updatedWindow.left,
        top: updatedWindow.top
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-update-window-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Close a window
 */
export async function handleBrowserCloseWindow(message: {
  requestId: string
  windowId: number
  agent?: string
}): Promise<void> {
  try {
    await assertWindowOwnedByAgent(message.agent, message.windowId, true)
    await chrome.windows.remove(message.windowId)

    sendToWebSocket({
      type: 'browser-close-window-result',
      requestId: message.requestId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-close-window-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Get display/monitor information
 */
export async function handleBrowserGetDisplays(message: { requestId: string }): Promise<void> {
  try {
    // chrome.system.display requires the 'system.display' permission
    const displays = await chrome.system.display.getInfo()

    const displayList = displays.map((display) => ({
      id: display.id,
      name: display.name,
      isPrimary: display.isPrimary,
      isEnabled: display.isEnabled,
      isInternal: display.isInternal,
      // Full bounds including taskbar area
      bounds: {
        left: display.bounds.left,
        top: display.bounds.top,
        width: display.bounds.width,
        height: display.bounds.height
      },
      // Work area excluding taskbar
      workArea: {
        left: display.workArea.left,
        top: display.workArea.top,
        width: display.workArea.width,
        height: display.workArea.height
      },
      rotation: display.rotation,
      dpiX: display.dpiX,
      dpiY: display.dpiY
    }))

    sendToWebSocket({
      type: 'browser-get-displays-result',
      requestId: message.requestId,
      displays: displayList,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-displays-result',
      requestId: message.requestId,
      displays: [],
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Tile windows in a grid layout
 * Arranges specified windows in a grid pattern across the available work area
 */
export async function handleBrowserTileWindows(message: {
  requestId: string
  windowIds: number[]
  layout?: 'horizontal' | 'vertical' | 'grid'
  displayId?: string
  gap?: number
  agent?: string
}): Promise<void> {
  try {
    const { windowIds, layout = 'horizontal', displayId, gap = 0 } = message

    if (!windowIds || windowIds.length === 0) {
      sendToWebSocket({
        type: 'browser-tile-windows-result',
        requestId: message.requestId,
        success: false,
        error: 'At least one windowId is required'
      })
      return
    }
    for (const windowId of windowIds) await assertWindowOwnedByAgent(message.agent, windowId)

    // Get display info
    const displays = await chrome.system.display.getInfo()
    let targetDisplay = displays.find(d => d.isPrimary) || displays[0]

    if (displayId) {
      const found = displays.find(d => d.id === displayId)
      if (found) targetDisplay = found
    }

    if (!targetDisplay) {
      sendToWebSocket({
        type: 'browser-tile-windows-result',
        requestId: message.requestId,
        success: false,
        error: 'No display found'
      })
      return
    }

    const workArea = targetDisplay.workArea
    const count = windowIds.length

    // Calculate tile positions based on layout
    const positions: Array<{ left: number; top: number; width: number; height: number }> = []

    if (layout === 'horizontal') {
      // Side by side
      const tileWidth = Math.floor((workArea.width - gap * (count - 1)) / count)
      for (let i = 0; i < count; i++) {
        positions.push({
          left: workArea.left + i * (tileWidth + gap),
          top: workArea.top,
          width: tileWidth,
          height: workArea.height
        })
      }
    } else if (layout === 'vertical') {
      // Stacked vertically
      const tileHeight = Math.floor((workArea.height - gap * (count - 1)) / count)
      for (let i = 0; i < count; i++) {
        positions.push({
          left: workArea.left,
          top: workArea.top + i * (tileHeight + gap),
          width: workArea.width,
          height: tileHeight
        })
      }
    } else {
      // Grid layout
      const cols = Math.ceil(Math.sqrt(count))
      const rows = Math.ceil(count / cols)
      const tileWidth = Math.floor((workArea.width - gap * (cols - 1)) / cols)
      const tileHeight = Math.floor((workArea.height - gap * (rows - 1)) / rows)

      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions.push({
          left: workArea.left + col * (tileWidth + gap),
          top: workArea.top + row * (tileHeight + gap),
          width: tileWidth,
          height: tileHeight
        })
      }
    }

    // Apply positions to windows
    const results: Array<{ windowId: number; success: boolean; error?: string }> = []

    for (let i = 0; i < windowIds.length; i++) {
      const windowId = windowIds[i]
      const pos = positions[i]

      try {
        // First restore window if minimized/maximized
        await chrome.windows.update(windowId, { state: 'normal' })

        // Then apply position
        await chrome.windows.update(windowId, {
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height
        })

        results.push({ windowId, success: true })
      } catch (err) {
        results.push({ windowId, success: false, error: (err as Error).message })
      }
    }

    sendToWebSocket({
      type: 'browser-tile-windows-result',
      requestId: message.requestId,
      success: true,
      results,
      layout,
      displayId: targetDisplay.id
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-tile-windows-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle popout window close - called from chrome.windows.onRemoved listener
 * Cleans up state and optionally detaches the terminal
 */
export async function handlePopoutWindowClosed(windowId: number): Promise<void> {
  const terminalId = popoutWindows.get(windowId)
  if (!terminalId) return

  // Remove from tracking
  popoutWindows.delete(windowId)

  console.log(`[Popout] Window ${windowId} closed, returning terminal ${terminalId} to sidebar`)

  // Clear the poppedOut state in sidebar so it reconnects to the terminal
  // Don't detach - let the terminal return to the sidebar automatically
  broadcastToClients({
    type: 'TERMINAL_RETURNED_FROM_POPOUT',
    terminalId,
  })
}

/**
 * Pop out the sidepanel to a standalone popup window
 * This allows running terminals in separate windows without duplicate extension issues
 */
export async function handleBrowserPopoutTerminal(message: {
  requestId: string
  terminalId?: string
  width?: number
  height?: number
  left?: number
  top?: number
}): Promise<void> {
  try {
    const { terminalId, width = 500, height = 700, left, top } = message

    // Build the sidepanel URL with popout mode and terminal ID
    // popout=true triggers single-terminal mode (no tab bar, no chat bar, minimal header)
    let sidepanelUrl = 'sidepanel/sidepanel.html?popout=true'
    if (terminalId) {
      sidepanelUrl += `&terminal=${encodeURIComponent(terminalId)}`
    }

    const createData: chrome.windows.CreateData = {
      url: chrome.runtime.getURL(sidepanelUrl),
      type: 'popup',
      width,
      height,
      focused: true
    }

    if (left !== undefined) createData.left = left
    if (top !== undefined) createData.top = top

    const newWindow = await chrome.windows.create(createData)

    if (!newWindow) {
      sendToWebSocket({
        type: 'browser-popout-terminal-result',
        requestId: message.requestId,
        success: false,
        error: 'Failed to create popup window'
      })
      return
    }

    // Notify sidepanel that this terminal is now in a popout window
    // Sidepanel will show a placeholder instead of rendering the terminal
    if (terminalId && newWindow.id) {
      // Track the popout window so we can clean up when it closes
      popoutWindows.set(newWindow.id, terminalId)

      broadcastToClients({
        type: 'TERMINAL_POPPED_OUT',
        terminalId,
        windowId: newWindow.id,
      })
    }

    sendToWebSocket({
      type: 'browser-popout-terminal-result',
      requestId: message.requestId,
      success: true,
      window: {
        windowId: newWindow.id,
        type: newWindow.type,
        width: newWindow.width,
        height: newWindow.height,
        left: newWindow.left,
        top: newWindow.top
      },
      terminalId
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-popout-terminal-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
