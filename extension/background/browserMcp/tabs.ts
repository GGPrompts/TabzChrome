/** Browser MCP tab management with per-caller ownership. */

import { sendToWebSocket } from '../websocket'
import { assertAgentReadableTab, isRefusedPageUrl } from './pageGuard'
import {
  assertDocumentReadable,
  assertDocumentReadCurrent,
  assertProtectedDocumentCurrent,
  currentDocumentProtection,
  protectedDocumentTarget,
  runWithDocumentAdmission
} from './documentProtection'
import {
  addTabToClaudeGroupInternal,
  assertAgentGroupReservationCurrent,
  assertGroupOwnedByAgent,
  assertTabInAgentGroup,
  configureAgentGroup,
  getClaudeActiveGroupId,
  isNamedAgent,
  releaseAgentGroupReservationInternal,
  reserveAgentGroupBindingInternal,
  resolveAgentTab,
  runAgentGroupLifecycle,
  runTabOwnershipMutation,
  ungroupTabsInternal
} from './tabGroups'

function sendResult(type: string, requestId: string, result: Record<string, unknown>): void {
  sendToWebSocket({ type: `${type}-result`, requestId, ...result })
}

function sanitizedPageUrl(url: string | undefined): string {
  try {
    const parsed = new URL(url || '')
    return parsed.origin
  } catch { return '' }
}

async function safeTabMetadata(tab: chrome.tabs.Tab, inClaudeGroup?: boolean): Promise<Record<string, unknown>> {
  if (tab.id === undefined) throw new Error('Tab has no ID')
  return runWithDocumentAdmission(tab.id, async () => {
    const protection = await currentDocumentProtection(tab.id!)
    if (protection) {
      const currentTab = await chrome.tabs.get(tab.id!)
      await assertProtectedDocumentCurrent(tab.id!, protection)
      return { tabId: tab.id, url: sanitizedPageUrl(currentTab.url), title: '', active: currentTab.active, inClaudeGroup, protected: true }
    }
    const token = await assertDocumentReadable(tab.id!, 'tab metadata')
    const injection = (await chrome.scripting.executeScript({
      target: protectedDocumentTarget(token),
      func: () => ({ url: location.href, title: document.title })
    }))[0]
    await assertDocumentReadCurrent(tab.id!, token, { documentId: injection?.documentId })
    const metadata = injection?.result as { url?: string; title?: string } | undefined
    if (!metadata) throw new Error('Tab metadata could not be bound to the current document')
    return {
      tabId: tab.id, url: metadata.url || '', title: metadata.title || '', active: tab.active, inClaudeGroup
    }
  })
}

export async function handleBrowserListTabs(message: { requestId: string; agent?: string }): Promise<void> {
  const type = 'browser-list-tabs'
  try {
    const groupId = await getClaudeActiveGroupId(message.agent)
    const allTabs = isNamedAgent(message.agent)
      ? (groupId === null ? [] : await chrome.tabs.query({ groupId }))
      : await chrome.tabs.query({ lastFocusedWindow: true })
    const visibleTabs = allTabs.filter(tab => tab.url && !isRefusedPageUrl(tab.url))
    const tabs = await Promise.all(visibleTabs.map(async (tab, index) => ({
      ...(await safeTabMetadata(tab, groupId !== null && tab.groupId === groupId)), index: index + 1
    })))
    sendResult(type, message.requestId, { success: true, tabs })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, tabs: [], error: (error as Error).message })
  }
}

export async function handleBrowserSwitchTab(message: { requestId: string; tabId: number; agent?: string }): Promise<void> {
  const type = 'browser-switch-tab'
  try {
    await assertTabInAgentGroup(message.agent, message.tabId)
    await assertAgentReadableTab('tabz_switch_tab', message.tabId)
    await chrome.tabs.update(message.tabId, { active: true })
    const tab = await chrome.tabs.get(message.tabId)
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true })
    sendResult(type, message.requestId, { success: true, tabId: message.tabId })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export function partitionClosableTabs(params: {
  requested: Array<{ tabId: number; groupId: number }>
  targetGroupId: number | null
  force: boolean
}): { closable: number[]; refused: Array<{ tabId: number; reason: string }> } {
  const closable: number[] = []
  const refused: Array<{ tabId: number; reason: string }> = []
  for (const tab of params.requested) {
    if (params.force || (params.targetGroupId !== null && tab.groupId === params.targetGroupId)) {
      closable.push(tab.tabId)
    } else {
      refused.push({
        tabId: tab.tabId,
        reason: params.targetGroupId === null
          ? 'no Claude Active group exists; pass groupId or force'
          : 'tab is outside the target group; pass force to close it anyway'
      })
    }
  }
  return { closable, refused }
}

export async function handleBrowserCloseTab(message: {
  requestId: string; tabIds?: number[]; groupId?: number; force?: boolean; agent?: string
}): Promise<void> {
  const type = 'browser-close-tab'
  try {
    if (message.groupId !== undefined) {
      await chrome.tabGroups.get(message.groupId)
      await assertGroupOwnedByAgent(message.agent, message.groupId)
    }
    const ownGroupId = await getClaudeActiveGroupId(message.agent)
    const targetGroupId = message.groupId ?? ownGroupId
    let requested: Array<{ tabId: number; groupId: number }> = []
    const missing: number[] = []
    if (message.tabIds?.length) {
      for (const tabId of [...new Set(message.tabIds)]) {
        try {
          const tab = await chrome.tabs.get(tabId)
          requested.push({ tabId, groupId: tab.groupId })
        } catch { missing.push(tabId) }
      }
    } else if (message.groupId !== undefined) {
      requested = (await chrome.tabs.query({ groupId: message.groupId }))
        .filter(tab => tab.id !== undefined)
        .map(tab => ({ tabId: tab.id as number, groupId: tab.groupId }))
    } else {
      throw new Error('Pass tabIds or groupId')
    }

    // Force remains a compatibility escape hatch only for unnamed legacy calls.
    const { closable, refused } = partitionClosableTabs({
      requested,
      targetGroupId,
      force: message.force === true && !isNamedAgent(message.agent)
    })
    if (targetGroupId !== null) {
      const closableSet = new Set(closable)
      const groupTabIds = (await chrome.tabs.query({ groupId: targetGroupId }))
        .map(tab => tab.id)
        .filter((id): id is number => id !== undefined)
      if (groupTabIds.length > 0 && groupTabIds.every(id => closableSet.has(id))) {
        await ungroupTabsInternal(groupTabIds)
      }
    }
    const closed: number[] = []
    for (const tabId of closable) {
      try {
        await chrome.tabs.remove(tabId)
        closed.push(tabId)
      } catch { missing.push(tabId) }
    }
    sendResult(type, message.requestId, { success: true, closed, refused, missing, groupId: targetGroupId })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserGetActiveTab(message: { requestId: string; agent?: string }): Promise<void> {
  const type = 'browser-get-active-tab'
  try {
    const tab = await resolveAgentTab(message.agent)
    if (!tab) throw new Error('No active tab found')
    await assertAgentReadableTab('tabz_get_active_tab', tab)
    sendResult(type, message.requestId, { success: true, tab: await safeTabMetadata(tab) })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export function shouldAdoptExistingTab(params: {
  existingTabGroupId: number | undefined
  requestedGroupId?: number
  addToClaudeGroup?: boolean
  claudeActiveGroupId: number | null
  namedAgent?: boolean
}): { adopt: boolean; reason?: string } {
  const { existingTabGroupId, requestedGroupId, addToClaudeGroup, claudeActiveGroupId, namedAgent } = params
  const target = requestedGroupId ?? claudeActiveGroupId
  if (namedAgent) {
    return target !== null && target !== undefined && existingTabGroupId === target
      ? { adopt: true }
      : { adopt: false, reason: 'existing tab is outside the caller group' }
  }
  if (requestedGroupId === undefined && addToClaudeGroup !== true) return { adopt: true }
  return target !== null && target !== undefined && existingTabGroupId === target
    ? { adopt: true }
    : { adopt: false, reason: 'existing tab is not in the target group' }
}

const TABZ_EXTENSION_PAGE_PATHS = new Set([
  '/dashboard/index.html',
  '/bookmarks/index.html',
  '/newtab/index.html',
  '/sidepanel/sidepanel.html',
  '/3d/3d-focus.html'
])

export function validateBrowserOpenUrl(url: string, extensionId: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'chrome-extension:' && (
      parsed.hostname !== extensionId || !TABZ_EXTENSION_PAGE_PATHS.has(parsed.pathname)
    )) return { valid: false, error: `Invalid URL: ${url}` }
    return { valid: true }
  } catch {
    return { valid: false, error: `Invalid URL: ${url}` }
  }
}

async function createOwnedTab(url: string, background: boolean, agent: string, title?: string): Promise<chrome.tabs.Tab> {
  return runAgentGroupLifecycle(agent, () => runTabOwnershipMutation(async () => {
    const existingGroupId = await getClaudeActiveGroupId(agent)
    const reservation = await reserveAgentGroupBindingInternal(agent)
    let created: chrome.tabs.Tab | undefined
    let mutationGroupId: number | null = null
    try {
      created = await chrome.tabs.create({ url, active: !background })
      assertAgentGroupReservationCurrent(reservation)
      if (created.id === undefined) throw new Error('Chrome created a tab without an id')
      await assertAgentReadableTab('tabz_open_url', created)
      if (existingGroupId === null) {
        mutationGroupId = await chrome.tabs.group({ tabIds: [created.id] })
        await configureAgentGroup(created.id, mutationGroupId, agent, title, reservation)
      } else {
        await chrome.tabs.group({ tabIds: [created.id], groupId: existingGroupId })
        mutationGroupId = existingGroupId
        assertAgentGroupReservationCurrent(reservation)
      }
      return created
    } catch (error) {
      if (created?.id !== undefined) {
        try {
          const current = await chrome.tabs.get(created.id)
          const stillCreated = mutationGroupId === null
            ? current.windowId === created.windowId && current.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
            : current.groupId === mutationGroupId
          if (stillCreated) await chrome.tabs.remove(created.id)
        } catch { /* already gone */ }
      }
      throw error
    } finally {
      await releaseAgentGroupReservationInternal(reservation)
    }
  }))
}

export async function handleBrowserOpenUrl(message: {
  requestId: string
  url: string
  newTab: boolean
  background: boolean
  reuseExisting: boolean
  tabId?: number
  groupId?: number
  addToClaudeGroup?: boolean
  claudeGroupTitle?: string
  agent?: string
}): Promise<void> {
  const type = 'browser-open-url'
  try {
    const validation = validateBrowserOpenUrl(message.url, chrome.runtime.id)
    if (!validation.valid) throw new Error(validation.error)
    const named = isNamedAgent(message.agent)
    const activeGroupId = await getClaudeActiveGroupId(message.agent)
    if (message.groupId !== undefined) await assertGroupOwnedByAgent(message.agent, message.groupId)

    if (message.reuseExisting) {
      const existing = (await chrome.tabs.query({})).find(tab => {
        if (!tab.url) return false
        const matchesUrl = tab.url === message.url || tab.url === `${message.url}/` || `${tab.url}/` === message.url
        return matchesUrl && shouldAdoptExistingTab({
          existingTabGroupId: tab.groupId,
          requestedGroupId: message.groupId,
          addToClaudeGroup: message.addToClaudeGroup,
          claudeActiveGroupId: activeGroupId,
          namedAgent: named
        }).adopt
      })
      if (existing?.id !== undefined) {
        await assertAgentReadableTab('tabz_open_url', existing)
        await chrome.tabs.update(existing.id, { active: true })
        if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true })
        sendResult(type, message.requestId, {
          success: true, tabId: existing.id, url: message.url,
          reused: true, reusedExisting: true, groupId: existing.groupId ?? null,
          inClaudeGroup: activeGroupId !== null && existing.groupId === activeGroupId
        })
        return
      }
    }

    let tab: chrome.tabs.Tab
    let created = false
    if (named && (message.newTab || (activeGroupId === null && message.tabId === undefined))) {
      tab = await createOwnedTab(message.url, message.background, message.agent!.trim(), message.claudeGroupTitle)
      created = true
    } else if (message.newTab) {
      tab = await chrome.tabs.create({ url: message.url, active: !message.background })
      created = true
      if (tab.id !== undefined && (message.addToClaudeGroup || named)) {
        await addTabToClaudeGroupInternal(tab.id, message.agent, message.claudeGroupTitle)
      } else if (tab.id !== undefined && message.groupId !== undefined) {
        await chrome.tabs.group({ tabIds: [tab.id], groupId: message.groupId })
      }
    } else {
      const target = await resolveAgentTab(message.agent, message.tabId)
      if (!target?.id) throw new Error('No active tab found')
      tab = await chrome.tabs.update(target.id, { url: message.url }) ?? target
      if (message.groupId !== undefined) await chrome.tabs.group({ tabIds: [target.id], groupId: message.groupId })
      else if (message.addToClaudeGroup) await addTabToClaudeGroupInternal(target.id, message.agent, message.claudeGroupTitle)
    }
    if (tab.id === undefined) throw new Error('Chrome returned a tab without an id')
    if (!message.background && tab.windowId) await chrome.windows.update(tab.windowId, { focused: true })
    const fresh = await chrome.tabs.get(tab.id)
    const currentGroupId = fresh.groupId !== undefined && fresh.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
      ? fresh.groupId : null
    const own = await getClaudeActiveGroupId(message.agent)
    sendResult(type, message.requestId, {
      success: true, tabId: tab.id, url: message.url,
      reused: false, reusedExisting: false, created,
      groupId: currentGroupId, inClaudeGroup: currentGroupId !== null && currentGroupId === own
    })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}
