/**
 * Browser MCP - Tab Groups handlers
 * List, create, update, and manage tab groups via Chrome tabGroups API
 */

import { sendToWebSocket } from '../websocket'

// Valid tab group colors
type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan'

// Track the "Claude Active" group ID for auto-grouping
let claudeActiveGroupId: number | null = null

/**
 * List all tab groups in the current window
 */
export async function handleBrowserListTabGroups(message: { requestId: string }): Promise<void> {
  try {
    // Get all tabs with their group info
    const allTabs = await chrome.tabs.query({ lastFocusedWindow: true })

    // Get unique group IDs (excluding ungrouped tabs)
    const groupIds = [...new Set(
      allTabs
        .filter(tab => tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
        .map(tab => tab.groupId)
    )] as number[]

    // Get group details for each group
    const groups = await Promise.all(
      groupIds.map(async (groupId) => {
        try {
          const group = await chrome.tabGroups.get(groupId)
          const tabsInGroup = allTabs.filter(tab => tab.groupId === groupId)
          return {
            groupId: group.id,
            title: group.title || '',
            color: group.color,
            collapsed: group.collapsed,
            windowId: group.windowId,
            tabCount: tabsInGroup.length,
            tabIds: tabsInGroup.map(t => t.id).filter((id): id is number => id !== undefined)
          }
        } catch {
          return null
        }
      })
    )

    // Filter out any failed lookups
    const validGroups = groups.filter((g): g is NonNullable<typeof g> => g !== null)

    sendToWebSocket({
      type: 'browser-list-tab-groups-result',
      requestId: message.requestId,
      groups: validGroups,
      claudeActiveGroupId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-list-tab-groups-result',
      requestId: message.requestId,
      groups: [],
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Create a new tab group from specified tabs
 */
export async function handleBrowserCreateTabGroup(message: {
  requestId: string
  tabIds: number[]
  title?: string
  color?: TabGroupColor
  collapsed?: boolean
}): Promise<void> {
  try {
    const { tabIds, title, color, collapsed } = message

    if (!tabIds || tabIds.length === 0) {
      sendToWebSocket({
        type: 'browser-create-tab-group-result',
        requestId: message.requestId,
        success: false,
        error: 'At least one tabId is required'
      })
      return
    }

    // Create the group with the specified tabs
    // Cast to tuple type required by Chrome API (at least one element)
    const groupId = await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] })

    // Update the group with title and color if provided
    const updateProperties: chrome.tabGroups.UpdateProperties = {}
    if (title !== undefined) updateProperties.title = title
    if (color !== undefined) updateProperties.color = color
    if (collapsed !== undefined) updateProperties.collapsed = collapsed

    if (Object.keys(updateProperties).length > 0) {
      await chrome.tabGroups.update(groupId, updateProperties)
    }

    // Get the updated group info
    const group = await chrome.tabGroups.get(groupId)

    sendToWebSocket({
      type: 'browser-create-tab-group-result',
      requestId: message.requestId,
      success: true,
      group: {
        groupId: group.id,
        title: group.title ?? '',
        color: group.color,
        collapsed: group.collapsed,
        windowId: group.windowId,
        tabCount: tabIds.length
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-create-tab-group-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Update an existing tab group (title, color, collapsed state)
 */
export async function handleBrowserUpdateTabGroup(message: {
  requestId: string
  groupId: number
  title?: string
  color?: TabGroupColor
  collapsed?: boolean
}): Promise<void> {
  try {
    const { groupId, title, color, collapsed } = message

    const updateProperties: chrome.tabGroups.UpdateProperties = {}
    if (title !== undefined) updateProperties.title = title
    if (color !== undefined) updateProperties.color = color
    if (collapsed !== undefined) updateProperties.collapsed = collapsed

    if (Object.keys(updateProperties).length === 0) {
      sendToWebSocket({
        type: 'browser-update-tab-group-result',
        requestId: message.requestId,
        success: false,
        error: 'No update properties provided'
      })
      return
    }

    await chrome.tabGroups.update(groupId, updateProperties)
    const group = await chrome.tabGroups.get(groupId)

    sendToWebSocket({
      type: 'browser-update-tab-group-result',
      requestId: message.requestId,
      success: true,
      group: {
        groupId: group.id,
        title: group.title ?? '',
        color: group.color,
        collapsed: group.collapsed,
        windowId: group.windowId
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-update-tab-group-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Add tabs to an existing group
 */
export async function handleBrowserAddToTabGroup(message: {
  requestId: string
  groupId: number
  tabIds: number[]
}): Promise<void> {
  try {
    const { groupId, tabIds } = message

    if (!tabIds || tabIds.length === 0) {
      sendToWebSocket({
        type: 'browser-add-to-tab-group-result',
        requestId: message.requestId,
        success: false,
        error: 'At least one tabId is required'
      })
      return
    }

    // Add tabs to the existing group
    // Cast to tuple type required by Chrome API
    await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]], groupId })

    // Get updated group info
    const group = await chrome.tabGroups.get(groupId)
    const allTabs = await chrome.tabs.query({ lastFocusedWindow: true })
    const tabsInGroup = allTabs.filter(tab => tab.groupId === groupId)

    sendToWebSocket({
      type: 'browser-add-to-tab-group-result',
      requestId: message.requestId,
      success: true,
      group: {
        groupId: group.id,
        title: group.title || '',
        color: group.color,
        tabCount: tabsInGroup.length
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-add-to-tab-group-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Remove tabs from their groups (ungroup them)
 */
export async function handleBrowserUngroupTabs(message: {
  requestId: string
  tabIds: number[]
}): Promise<void> {
  try {
    const { tabIds } = message

    if (!tabIds || tabIds.length === 0) {
      sendToWebSocket({
        type: 'browser-ungroup-tabs-result',
        requestId: message.requestId,
        success: false,
        error: 'At least one tabId is required'
      })
      return
    }

    // Ungroup the specified tabs
    // Cast to tuple type required by Chrome API
    await chrome.tabs.ungroup(tabIds as [number, ...number[]])

    sendToWebSocket({
      type: 'browser-ungroup-tabs-result',
      requestId: message.requestId,
      success: true,
      ungroupedCount: tabIds.length
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-ungroup-tabs-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Add a tab to the "Claude Active" group (creates group if needed)
 * This is used for auto-grouping tabs that Claude is working with
 */
export async function handleBrowserAddToClaudeGroup(message: {
  requestId: string
  tabId: number
}): Promise<void> {
  try {
    const { tabId } = message

    // Check if Claude Active group still exists
    if (claudeActiveGroupId !== null) {
      try {
        await chrome.tabGroups.get(claudeActiveGroupId)
      } catch {
        // Group no longer exists, reset
        claudeActiveGroupId = null
      }
    }

    // Create the Claude Active group if it doesn't exist
    if (claudeActiveGroupId === null) {
      claudeActiveGroupId = await chrome.tabs.group({ tabIds: [tabId] })
      await chrome.tabGroups.update(claudeActiveGroupId, {
        title: 'Claude',
        color: 'purple'
      })
    } else {
      // Add to existing group
      await chrome.tabs.group({ tabIds: [tabId], groupId: claudeActiveGroupId })
    }

    const group = await chrome.tabGroups.get(claudeActiveGroupId)
    const allTabs = await chrome.tabs.query({ lastFocusedWindow: true })
    const tabsInGroup = allTabs.filter(tab => tab.groupId === claudeActiveGroupId)

    sendToWebSocket({
      type: 'browser-add-to-claude-group-result',
      requestId: message.requestId,
      success: true,
      group: {
        groupId: group.id,
        title: group.title || '',
        color: group.color,
        tabCount: tabsInGroup.length
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-add-to-claude-group-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Remove a tab from the "Claude Active" group
 */
export async function handleBrowserRemoveFromClaudeGroup(message: {
  requestId: string
  tabId: number
}): Promise<void> {
  try {
    const { tabId } = message

    // Check if tab is in the Claude group
    const tab = await chrome.tabs.get(tabId)
    if (tab.groupId !== claudeActiveGroupId) {
      sendToWebSocket({
        type: 'browser-remove-from-claude-group-result',
        requestId: message.requestId,
        success: true,
        message: 'Tab was not in Claude group'
      })
      return
    }

    // Ungroup the tab
    await chrome.tabs.ungroup([tabId])

    // Check if Claude group is now empty (it will be auto-deleted by Chrome)
    if (claudeActiveGroupId !== null) {
      try {
        await chrome.tabGroups.get(claudeActiveGroupId)
      } catch {
        claudeActiveGroupId = null
      }
    }

    sendToWebSocket({
      type: 'browser-remove-from-claude-group-result',
      requestId: message.requestId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-remove-from-claude-group-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Get Claude Active group status
 */
export async function handleBrowserGetClaudeGroupStatus(message: {
  requestId: string
}): Promise<void> {
  try {
    if (claudeActiveGroupId === null) {
      sendToWebSocket({
        type: 'browser-get-claude-group-status-result',
        requestId: message.requestId,
        success: true,
        exists: false,
        groupId: null,
        tabCount: 0
      })
      return
    }

    try {
      const group = await chrome.tabGroups.get(claudeActiveGroupId)
      const allTabs = await chrome.tabs.query({ lastFocusedWindow: true })
      const tabsInGroup = allTabs.filter(tab => tab.groupId === claudeActiveGroupId)

      sendToWebSocket({
        type: 'browser-get-claude-group-status-result',
        requestId: message.requestId,
        success: true,
        exists: true,
        groupId: claudeActiveGroupId,
        group: {
          groupId: group.id,
          title: group.title || '',
          color: group.color,
          collapsed: group.collapsed
        },
        tabCount: tabsInGroup.length,
        tabIds: tabsInGroup.map(t => t.id).filter((id): id is number => id !== undefined)
      })
    } catch {
      // Group no longer exists
      claudeActiveGroupId = null
      sendToWebSocket({
        type: 'browser-get-claude-group-status-result',
        requestId: message.requestId,
        success: true,
        exists: false,
        groupId: null,
        tabCount: 0
      })
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-claude-group-status-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
